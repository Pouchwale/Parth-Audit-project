// MITRA'S SOUNDS (REQUIREMENTS §81, frontend/src/utils/sounds.ts).
//
// Every cue is a few synthesised notes, kept as data (CUE_SCHEDULE) so this
// test can hold each one to what was asked for — short (0.15–1.2 s), modest in
// volume, audible pitches, and the shape its name promises: two soft bell notes
// for the chime, three rising for a reminder, a bright arpeggio for success, a
// soft fall for late, a gentle descent for sent back, a fanfare with a sparkle
// for a celebration, two firm notes for an alert. Then playCue is run against a
// stand-in AudioContext: nothing before the first click or key, the notes
// scheduled in order after it, a burst of the same cue played once, and never an
// error — whatever the browser does. And the bell's chime is for news only, not
// for the person's own send-back or reopen (engine/engageBus.ts chimeForNews).
// Run: npm run test:unit -- sounds
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CUE_EVENT, CUE_NAMES, NEWS_SETTLE_MS, OWN_ACTION_MS, chimeForNews, emitCue, type CueName } from "../src/engine/engageBus";
import { REACTION_EVENT } from "../src/engine/reactions";
import { CUE_SCHEDULE, MASTER_VOLUME, cueDuration, hadUserGesture, onFirstGesture, playCue, resetSoundsForTests, watchFirstGesture } from "../src/utils/sounds";

// ---- a stand-in AudioContext that records what is scheduled ----

interface Scheduled {
  type: string;
  freq: number;
  start: number;
  stop: number;
  peak: number;
}

const audio = { made: 0, resumed: 0, suspended: 0, scheduled: [] as Scheduled[], failCreate: false };

class FakeParam {
  values: { v: number; t: number }[] = [];
  setValueAtTime(v: number, t: number) {
    this.values.push({ v, t });
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.values.push({ v, t });
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.values.push({ v, t });
  }
}
class FakeGain {
  gain = new FakeParam();
  connect() {}
}
class FakeOscillator {
  type = "sine";
  frequency = new FakeParam();
  private startAt = 0;
  private env: FakeGain | null = null;
  connect(node: FakeGain) {
    this.env = node;
  }
  start(t: number) {
    this.startAt = t;
  }
  stop(t: number) {
    audio.scheduled.push({
      type: this.type,
      freq: this.frequency.values[0]?.v ?? 0,
      start: this.startAt,
      stop: t,
      peak: Math.max(...(this.env?.gain.values.map((x) => x.v) ?? [0])),
    });
  }
}
class FakeAudioContext {
  state = "suspended";
  currentTime = 10;
  destination = {};
  constructor() {
    audio.made += 1;
  }
  createOscillator() {
    if (audio.failCreate) throw new Error("The device went away.");
    return new FakeOscillator();
  }
  createGain() {
    return new FakeGain();
  }
  resume() {
    audio.resumed += 1;
    this.state = "running";
    return Promise.resolve();
  }
  suspend() {
    audio.suspended += 1;
    this.state = "suspended";
    return Promise.resolve();
  }
}

const g = globalThis as unknown as Record<string, unknown>;
g.AudioContext = FakeAudioContext;

const firstGesture = () => {
  watchFirstGesture();
  window.dispatchEvent(new Event("pointerdown"));
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const repoRoot = process.env.DCRS_REPO_ROOT ?? process.cwd();

// ---- the notes ----

test("every cue has notes: short, modest, audible", () => {
  assert.ok(MASTER_VOLUME > 0 && MASTER_VOLUME <= 0.3, "the master volume is modest");
  for (const name of CUE_NAMES) {
    const notes = CUE_SCHEDULE[name];
    assert.ok(notes && notes.length >= 2, `${name} has notes`);
    const length = cueDuration(name);
    assert.ok(length >= 0.15 && length <= 1.2, `${name} lasts ${length.toFixed(2)} s`);
    for (const [i, n] of notes.entries()) {
      assert.ok(n.freq >= 100 && n.freq <= 5000, `${name} note ${i} at ${n.freq} Hz`);
      assert.ok(n.gain > 0 && n.gain <= 0.6, `${name} note ${i} gain ${n.gain}`);
      assert.ok(n.dur >= 0.05 && n.at >= 0, `${name} note ${i} timing`);
      if (i > 0) assert.ok(n.at >= notes[i - 1].at, `${name}'s notes are in order`);
      if (n.overtone) assert.ok(n.freq * n.overtone <= 12000, `${name} note ${i}'s overtone stays audible`);
    }
  }
  assert.deepEqual(Object.keys(CUE_SCHEDULE).sort(), [...CUE_NAMES].sort(), "a schedule for each cue, and no other");
});

test("each cue has the shape its name promises", () => {
  const pitches = (name: CueName) => CUE_SCHEDULE[name].map((n) => n.freq);
  const rising = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]);
  const falling = (xs: number[]) => xs.every((x, i) => i === 0 || x < xs[i - 1]);

  assert.equal(CUE_SCHEDULE.chime.length, 2, "chime: two notes");
  assert.ok(CUE_SCHEDULE.chime.every((n) => n.type === "sine" && n.overtone), "…soft bells (sine, with a shimmer)");

  assert.equal(CUE_SCHEDULE.reminder.length, 3, "reminder: three notes");
  assert.ok(rising(pitches("reminder")), "…rising");

  const success = pitches("success");
  assert.ok(success.length >= 3 && rising(success), "success: a rising arpeggio");
  assert.ok(Math.abs(success[success.length - 1] / success[0] - 2) < 0.01, "…up to the octave");
  assert.ok(Math.abs(success[1] / success[0] - 1.26) < 0.02, "…through the major third");

  assert.equal(CUE_SCHEDULE.late.length, 2, "late: two tones");
  assert.ok(falling(pitches("late")), "…falling, softly");
  assert.ok(CUE_SCHEDULE.late.every((n) => n.type === "sine" && n.gain <= 0.4), "…never a buzzer");

  assert.ok(CUE_SCHEDULE.sentBack.length >= 3 && falling(pitches("sentBack")), "sent back: gently descending");

  const fanfare = CUE_SCHEDULE.celebrate.filter((n) => n.freq < 2000);
  const sparkle = CUE_SCHEDULE.celebrate.filter((n) => n.freq >= 2000);
  assert.ok(fanfare.length >= 4 && rising(fanfare.map((n) => n.freq)), "celebrate: a rising fanfare");
  assert.ok(sparkle.length >= 2 && sparkle.every((n) => n.gain < 0.2), "…with a quiet sparkle on top");
  assert.ok(Math.min(...sparkle.map((n) => n.at)) > Math.min(...fanfare.map((n) => n.at)), "…after it starts");

  assert.equal(CUE_SCHEDULE.alert.length, 2, "alert: two firm notes");
});

// ---- playing ----

test("nothing plays — nothing is even made — before the first click or key", () => {
  resetSoundsForTests();
  audio.made = 0;
  audio.scheduled = [];
  watchFirstGesture();
  assert.equal(hadUserGesture(), false);
  for (const name of CUE_NAMES) playCue(name);
  assert.equal(audio.made, 0, "no AudioContext before a gesture");
  assert.equal(audio.scheduled.length, 0);
});

test("after the first click, a cue's notes are scheduled in order, the context woken, and put back to sleep", async () => {
  resetSoundsForTests();
  audio.made = 0;
  audio.resumed = 0;
  audio.suspended = 0;
  audio.scheduled = [];
  let told = 0;
  onFirstGesture(() => {
    told += 1;
  });
  firstGesture();
  assert.equal(hadUserGesture(), true);
  assert.equal(told, 1, "waiting for the first gesture is answered once");
  onFirstGesture(() => {
    told += 1;
  });
  assert.equal(told, 2, "…and at once after it");
  assert.equal(audio.made, 1, "one AudioContext, made at the gesture");

  playCue("success");
  const notes = CUE_SCHEDULE.success;
  const overtones = notes.filter((n) => n.overtone).length;
  assert.equal(audio.scheduled.length, notes.length + overtones, "a note (and its overtone) per scheduled note");
  assert.ok(audio.resumed >= 1, "the sleeping context is woken");
  const mains = audio.scheduled.filter((s) => notes.some((n) => Math.abs(n.freq - s.freq) < 0.01));
  assert.ok(mains.every((s, i) => i === 0 || s.start >= mains[i - 1].start), "played in order");
  assert.ok(audio.scheduled.every((s) => s.start >= 10 && s.stop > s.start), "from now on, each stopping");
  assert.ok(audio.scheduled.every((s) => s.peak <= MASTER_VOLUME * 0.6 + 1e-9), "never louder than modest");

  const before = audio.scheduled.length;
  playCue("success");
  assert.equal(audio.scheduled.length, before, "the same cue again at once is one sound, not two");
  playCue("chime");
  assert.ok(audio.scheduled.length > before, "…but another cue plays");

  const suspendedBefore = audio.suspended;
  await wait(Math.ceil((cueDuration("chime") + 0.5) * 1000));
  assert.ok(audio.suspended > suspendedBefore, "asleep again once the notes have rung out");
});

test("a cue never throws: an unknown name, a device that fails, no Web Audio at all", () => {
  resetSoundsForTests();
  firstGesture();
  assert.doesNotThrow(() => playCue("nonsense" as CueName));
  audio.failCreate = true;
  assert.doesNotThrow(() => playCue("alert"));
  audio.failCreate = false;
  resetSoundsForTests();
  delete g.AudioContext;
  firstGesture();
  assert.doesNotThrow(() => playCue("celebrate"));
  g.AudioContext = FakeAudioContext;
});

// ---- the bell's chime: news, not an echo of the person's own click ----
//
// The bell (components/layout/NotificationBell.tsx) chimes when its urgent set
// GAINS a record. A record the person sent back, or reopened through Upload
// changes, is waiting again — a gain — and their action already has its sound
// (sentBack 150 ms after the reaction; success after the upload). The two used
// to ring over each other. The tests run in this order: what counts as the
// person's own action is remembered for OWN_ACTION_MS.

const asked: string[] = [];
window.addEventListener(CUE_EVENT, (e) => asked.push(String((e as CustomEvent<{ cue?: string }>).detail?.cue)));
const chimes = () => asked.filter((c) => c === "chime").length;
const reaction = (detail: Record<string, unknown>) => window.dispatchEvent(new CustomEvent(REACTION_EVENT, { detail }));

test("the bell asks for its chime through chimeForNews — never straight out", () => {
  const bell = readFileSync(path.join(repoRoot, "frontend", "src", "components", "layout", "NotificationBell.tsx"), "utf8");
  assert.match(bell, /chimeForNews\(\)/);
  assert.doesNotMatch(bell, /emitCue\(\s*["']chime["']\s*\)/, "a gain chimes only once it is known not to be the person's own doing");
});

test("something new in the bell chimes, a moment later", async () => {
  asked.length = 0;
  chimeForNews();
  assert.equal(chimes(), 0, "not at once: the person's own action may be about to sound");
  await wait(NEWS_SETTLE_MS + 200);
  assert.equal(chimes(), 1);
});

test("the person's own send-back: the reaction, the bell's gain, the sentBack sound — and no chime over it", async () => {
  asked.length = 0;
  reaction({ kind: "rejected", what: "F/QC/01 Line Clearance Checklist — 27-Sep-2026", reason: "Wrong batch", recordId: "r-1" });
  chimeForNews(); // the store bump redraws the bell: the record is waiting again
  await wait(150);
  emitCue("sentBack"); // Celebration's answer to the reaction
  await wait(NEWS_SETTLE_MS + 200);
  assert.deepEqual(asked, ["sentBack"]);
});

test("a record reopened through the open page: the bell sees it before the upload's success sound — no chime", async () => {
  await wait(OWN_ACTION_MS + 100); // the send-back above is no longer 'just now'
  asked.length = 0;
  chimeForNews(); // reopened: waiting again
  await wait(300);
  emitCue("success"); // the changes written, the upload's sound
  await wait(NEWS_SETTLE_MS + 200);
  assert.deepEqual(asked, ["success"]);
});

test("a record reopened through the store: the success sound first, then the bell's gain — no chime; later news chimes again", async () => {
  await wait(OWN_ACTION_MS + 100);
  asked.length = 0;
  emitCue("success");
  chimeForNews();
  await wait(NEWS_SETTLE_MS + 200);
  assert.deepEqual(asked, ["success"]);

  await wait(OWN_ACTION_MS + 100);
  asked.length = 0;
  chimeForNews(); // a colleague's work arriving, nothing done here
  await wait(NEWS_SETTLE_MS + 200);
  assert.deepEqual(asked, ["chime"]);
});
