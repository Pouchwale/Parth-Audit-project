// MITRA'S SPOKEN REMINDER (REQUIREMENTS §81, components/common/SoundVoiceHost.tsx).
//
// The host says, once in a while and when the bell asks, the most urgent thing
// of the person's aloud, with a small card that has "Later". These tests hold
// it to what the person was promised, where it used to slip:
//   - "Later" pressed while the three notes still ring stops the line before it
//     is ever asked for (it used to be said after the card was put away);
//   - an account that answers for the whole plant and is named on no document
//     is not told by itself, every 45 minutes, that the plant's work is theirs —
//     and when it asks, the plant's day is not called its score; an unnamed
//     department account still hears its department's work;
//   - what the reminders remember is one person's: the next person to sign in
//     on the same tab is not skipped over, nor kept quiet, for the one before;
//   - a tab in the background keeps quiet, and a reminder said in another tab
//     of this browser counts here, so two tabs do not remind twice as often.
// Nothing is really said: the host's requests ("dcrs:say", "dcrs:cue") are
// recorded. Run: npm run test:unit -- voiceReminder
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AuthUser } from "../src/types/auth";
import type { DaysWork, Notification } from "../src/engine/notifications";
import { CUE_EVENT, SAY_EVENT, type SayRequest } from "../src/engine/engageBus";
import { cueDuration, resetSoundsForTests, watchFirstGesture } from "../src/utils/sounds";
import { isSaying, resetVoiceForTests } from "../src/utils/voice";
import { settingsRepository } from "../src/data/repositories/settingsRepository";
import { todayISO } from "../src/utils/date";
import type { ReminderToast } from "../src/components/common/SoundVoiceHost";

// The host is a component module: the router it imports reads the address when
// it is loaded, which Node has not got. An address first, then the host.
const g = globalThis as unknown as Record<string, unknown>;
if (!g.location) g.location = { hash: "", pathname: "/", search: "", href: "http://localhost/", origin: "http://localhost" };
const { OTHER_TABS_CHANNEL, factsFor, putOffReminder, reminderMayStart, reminderMemoryFor, resetRemindersForTests, speakReminder } = await import(
  "../src/components/common/SoundVoiceHost"
);

// ---- what the host asks for, recorded ----

const says: SayRequest[] = [];
const cues: string[] = [];
window.addEventListener(SAY_EVENT, (e) => says.push((e as CustomEvent<SayRequest>).detail));
window.addEventListener(CUE_EVENT, (e) => cues.push(String((e as CustomEvent<{ cue?: string }>).detail?.cue)));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** How long after the reminder's notes its line is asked for, and some room. */
const AFTER_NOTES_MS = Math.round(cueDuration("reminder") * 1000) + 120 + 300;
const MIN = 60_000;

// ---- people and their day's work ----

const person = (id: string, name: string, role: AuthUser["role"], departments: string[]): AuthUser => ({ id, name, email: `${id}@example.test`, role, departments });
const ASHA = person("u-asha", "Asha Patel", "staff", ["QC"]);
const BHAVIN = person("u-bhavin", "Bhavin Shah", "staff", ["QC"]);
const ADMIN = person("u-admin", "Super Admin", "admin", []);
const MR = person("u-mr", "Meera Rao", "staff", []);
const KAVYA = person("u-kavya", "Kavya Trivedi", "staff", ["PRD"]);

const note = (recordId: string, daysUntilDue = 0): Notification => ({
  documentId: "doc-not-stored",
  recordId,
  what: "F/QC/01 Line Clearance Checklist",
  module: "Quality Control — Inspection Records",
  frequency: "Daily",
  dueDate: todayISO(),
  daysUntilDue,
  priority: "high",
  route: `/record/${recordId}`,
  when: daysUntilDue < 0 ? `${-daysUntilDue} days late` : "due today",
});

const work = (theirOwn: boolean, ...notifications: Notification[]): DaysWork => ({
  notifications,
  high: notifications.length,
  medium: 0,
  low: 0,
  overdue: notifications.filter((n) => n.daysUntilDue < 0).length,
  theirOwn,
  modules: [...new Set(notifications.map((n) => n.module))],
});

let shown: Omit<ReminderToast, "id"> | null = null;
const show = (t: Omit<ReminderToast, "id">) => {
  shown = t;
};
/** The card the host last showed (read through a call: TypeScript would keep a `shown = null` narrowing across the host's call). */
const card = (): Omit<ReminderToast, "id"> | null => shown;
const clearCard = () => {
  shown = null;
};
/** The automatic reminder, as the once-a-minute check says it. */
const automatic = (who: AuthUser, w: DaysWork) => speakReminder(who, false, "en", "en", show, w);
/** The bell's "What should I do next?". */
const asked = (who: AuthUser, w: DaysWork) => speakReminder(who, true, "en", "en", show, w);

const SETTINGS = { voiceOn: true, workdayStart: "00:00", workdayEnd: "00:00", remindEveryMin: 10 };

beforeEach(() => {
  resetRemindersForTests();
  resetVoiceForTests();
  resetSoundsForTests();
  says.length = 0;
  cues.length = 0;
  clearCard();
  delete g.document;
  settingsRepository.update({ spokenToday: { date: "", keys: [] } });
});

// ---- "Later" ----

test("'Later' pressed while the notes still ring: the line is never asked for", async () => {
  asked(ASHA, work(true, note("r-later")));
  assert.equal(card()?.recordId, "r-later", "the card shows, with its Later");
  assert.deepEqual(cues, ["reminder"], "the three notes first");
  assert.equal(says.length, 0, "the line waits for the notes");
  putOffReminder(card()!);
  await wait(AFTER_NOTES_MS);
  assert.deepEqual(
    says.map((s) => s.text),
    [],
    "put off before it was said: not said after the card went"
  );
  assert.equal(isSaying(card()!.spoken), false);

  // Left alone, it is said once the notes have rung out.
  asked(ASHA, work(true, note("r-said")));
  await wait(AFTER_NOTES_MS);
  assert.equal(says.length, 1);
  assert.equal(says[0].text, card()!.spoken);
  assert.equal(says[0].priority, "high");
});

test("a reminder still waiting for its notes gives way to the next one, and goes when the person signs out", async () => {
  asked(ASHA, work(true, note("r-first")));
  asked(ASHA, work(true, note("r-second"), note("r-first")));
  assert.equal(card()?.recordId, "r-second");
  await wait(AFTER_NOTES_MS);
  assert.deepEqual(
    says.map((s) => s.text),
    [card()!.spoken],
    "one line — the card's, not the one it replaced as well"
  );

  says.length = 0;
  asked(ASHA, work(true, note("r-third")));
  reminderMemoryFor(BHAVIN.id); // someone else signs in on this tab
  await wait(AFTER_NOTES_MS);
  assert.equal(says.length, 0, "Asha's reminder is not said to Bhavin");
});

// ---- the plant's work is not the administrator's own ----

test("an account for the whole plant, named on no document, is not reminded by itself — asked, it hears the plant's work without 'your score today'", () => {
  for (const who of [ADMIN, MR]) {
    resetRemindersForTests();
    clearCard();
    cues.length = 0;
    automatic(who, work(false, note("r-plant", -5)));
    assert.equal(card(), null, `${who.name}: no card`);
    assert.deepEqual(cues, [], `${who.name}: no notes`);
    assert.ok(reminderMemoryFor(who.id).quietUntil > Date.now(), `${who.name}: the records are not walked again at the next tick`);

    asked(who, work(false, note("r-plant", -5)));
    assert.equal(card()?.recordId, "r-plant", `${who.name}: the bell's question is still answered`);
  }
  assert.equal(factsFor(note("r-plant", -5), ADMIN, null, todayISO(), false).day, undefined, "the plant's day is not called theirs");

  // Named on a document: their own, reminded.
  resetRemindersForTests();
  clearCard();
  automatic(ADMIN, work(true, note("r-admins-own")));
  assert.equal(card()?.recordId, "r-admins-own");

  // A department account named nowhere: its department's work is its subject (e2e_voice_and_sounds).
  resetRemindersForTests();
  clearCard();
  automatic(KAVYA, work(false, note("r-prd")));
  assert.equal(card()?.recordId, "r-prd");
});

// ---- one person's memory ----

test("the next person to sign in on the same tab starts afresh: not skipped, not kept quiet, not hurried", () => {
  const start = Date.now() - 3 * 60 * MIN;
  reminderMemoryFor(ASHA.id, start);
  automatic(ASHA, work(true, note("r-shared")));
  assert.equal(card()?.recordId, "r-shared");
  automatic(ASHA, work(true)); // nothing more: a quiet spell for Asha
  assert.ok(reminderMemoryFor(ASHA.id).quietUntil > Date.now());

  // Asha signs out; Bhavin signs in on the same tab (no reload).
  const signedIn = Date.now();
  const m = reminderMemoryFor(BHAVIN.id, signedIn);
  assert.equal(m.remindedAt.size, 0, "nothing Asha was reminded of is carried over");
  assert.equal(m.quietUntil, 0, "Asha's quiet spell is hers");
  assert.equal(m.lastSpokenAt, 0);
  assert.equal(m.startedAt, signedIn, "the interval counts from Bhavin's sign-in");

  watchFirstGesture();
  window.dispatchEvent(new Event("pointerdown"));
  assert.equal(reminderMayStart(BHAVIN.id, SETTINGS, signedIn + MIN), false, "not a minute after signing in");
  assert.equal(reminderMayStart(BHAVIN.id, SETTINGS, signedIn + 11 * MIN), true, "after the interval, from his own sign-in");

  clearCard();
  automatic(BHAVIN, work(true, note("r-shared")));
  assert.equal(card()?.recordId, "r-shared", "the same record, due for Bhavin too, is said to him");

  // Asha back on this tab after him: a fresh start again, nothing of Bhavin's.
  assert.equal(reminderMemoryFor(ASHA.id).remindedAt.size, 0);
});

// ---- tabs ----

test("a tab in the background keeps quiet; a reminder said in another tab counts here", async () => {
  watchFirstGesture();
  window.dispatchEvent(new Event("pointerdown"));
  reminderMemoryFor(ASHA.id, Date.now() - 60 * MIN);
  assert.equal(reminderMayStart(ASHA.id, SETTINGS), true, "in view, the interval passed");
  g.document = { visibilityState: "hidden" };
  assert.equal(reminderMayStart(ASHA.id, SETTINGS), false, "a tab in the background does not remind");
  g.document = { visibilityState: "visible" };
  assert.equal(reminderMayStart(ASHA.id, SETTINGS), true);
  delete g.document;

  // Another tab of this browser says a reminder to someone else: nothing to do with Asha.
  const other = new BroadcastChannel(OTHER_TABS_CHANNEL);
  const heard: unknown[] = [];
  other.onmessage = (e) => heard.push(e.data);
  try {
    other.postMessage({ userId: BHAVIN.id, at: Date.now(), recordId: "r-bhavins" });
    await wait(50);
    assert.equal(reminderMayStart(ASHA.id, SETTINGS), true, "another person's reminder does not count");

    // …and one to Asha: this tab counts its interval from it, and leaves that record alone.
    other.postMessage({ userId: ASHA.id, at: Date.now(), recordId: "r-other-tab" });
    await wait(50);
    assert.equal(reminderMayStart(ASHA.id, SETTINGS), false, "the interval runs from the other tab's reminder");
    assert.equal(reminderMayStart(ASHA.id, SETTINGS, Date.now() + 11 * MIN), true);
    automatic(ASHA, work(true, note("r-other-tab")));
    assert.equal(card(), null, "the record the other tab just said is not said again here");

    // This tab tells the others when it says one.
    automatic(ASHA, work(true, note("r-this-tab")));
    await wait(50);
    assert.equal(card()?.recordId, "r-this-tab");
    const told = heard.find((d) => (d as { recordId?: string }).recordId === "r-this-tab") as { userId?: string; at?: number } | undefined;
    assert.ok(told, "the other tabs are told");
    assert.equal(told?.userId, ASHA.id);
    assert.ok(typeof told?.at === "number" && Date.now() - told.at < 5000);
  } finally {
    other.close();
  }
});
