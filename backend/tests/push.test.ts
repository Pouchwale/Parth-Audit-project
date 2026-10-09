// THE PUSHES TO THE PHONES (REQUIREMENTS §97, backend/push.ts), over the stand-in ledger (backend/tests/memoryLedger.ts),
// the plant's calendar (Thursday off, a festival holiday, 08:40 to 18:20) and a stand-in for Expo's push service. No
// database, no network. What is proved here:
//   * the planner: the morning slot pushes every task once, one push per person, in each phone's language; a task that
//     comes up later waits for the next slot, the "still open" reminder at 15:30 and the last call at 17:45; overdue once
//     a day from 09:30; a heads-up once, on the working day before; verify, sent_back and the super admin's summary at
//     once; the staff only on working days inside the hours, the super admin at any hour; a kind switched off is not
//     pushed and stays in the inbox; several at once say "N records need you" and open the inbox, one opens its record;
//     a send-back's reason never leaves DCRS; an account that has left is not pushed;
//   * the sender: batches of 100; a failed request tried again after a pause, and one that never gets through leaves
//     its items for the next run; a request refused is not tried again; receipts read 15 minutes later; a phone no longer
//     registered (ticket or receipt) is forgotten; no token in any line written;
//   * PUSH_ENABLED=0 sends nothing, and nothing is sent with no phone registered; the test push says why in words.
// Run: npm run test:unit -- push
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  currentSlot,
  maskToken,
  planPushes,
  pushClock,
  pushTimes,
  runPushes,
  scrubTokens,
  sendMessages,
  sendTestPush,
  SEND_BATCH,
  type PushDeps,
  type PushMessage,
  type PushTicket,
  type PushTransport,
} from "../push.ts";
import type { LedgerItem } from "../notifications.ts";
import { parseClock, zonedMoment, type HoursCalendar } from "../../frontend/src/engine/workingHoursCore.ts";
import type { NotificationKind } from "../../frontend/src/engine/notificationPlan.ts";
import { createMemoryLedger, type MemoryLedger } from "./memoryLedger.ts";

const ZONE = "Asia/Kolkata";
/** Thursday off; Dussehra a festival holiday; the owner's hours. */
const CALENDAR: HoursCalendar = { weeklyOffDay: 4, holidays: [{ date: "2026-10-20", name: "Dussehra" }], adjustmentDays: [], workingHours: { start: "08:40", end: "18:20" } };
const at = (date: string, hhmm: string): Date => zonedMoment(date, parseClock(hhmm)!, ZONE);

// Friday 9 October 2026 is a working day; Thursday 8 is the weekly off.
const FRI = "2026-10-09";
const SAT = "2026-10-10";

const ACCOUNTS = [
  { id: "u-kapila", role: "staff", active: true },
  { id: "u-vinay", role: "staff", active: true },
  { id: "u-boss", role: "admin", active: true },
  { id: "u-left", role: "staff", active: false },
];

const TOKEN = {
  kapilaEn: "ExponentPushToken[kapila-en-0000000001]",
  kapilaGu: "ExponentPushToken[kapila-gu-0000000002]",
  vinay: "ExponentPushToken[vinay-hi-00000000003]",
  boss: "ExponentPushToken[boss-en-000000000004]",
  left: "ExponentPushToken[left-en-000000000005]",
};

const PEST = { documentId: "daily-pest-monitoring", formatNo: "F/HR/17", documentName: "Daily Pest Control Monitoring Record", module: "HR" };
const VISC = { documentId: "lamination-viscosity", formatNo: "F-QC-30", documentName: "Lamination Adhesive Viscosity Record", module: "QC" };

function item(userId: string, kind: NotificationKind, key: string, data: LedgerItem["data"], priority: LedgerItem["priority"] = "high"): LedgerItem {
  return { userId, kind, key, priority, data };
}

/** A stand-in for Expo's push service: an "ok" ticket per message unless told otherwise. */
function stubExpo(opts: { ticket?: (m: PushMessage) => PushTicket | undefined; receipts?: (ids: string[]) => Record<string, unknown>; send?: () => { status: number; body: unknown } | Error | undefined } = {}) {
  const calls: { path: string; body: unknown }[] = [];
  let n = 0;
  const transport: PushTransport = async (path, body) => {
    calls.push({ path, body });
    if (path === "send") {
      const forced = opts.send?.();
      if (forced instanceof Error) throw forced;
      if (forced) return forced;
      return { status: 200, body: { data: (body as PushMessage[]).map((m) => opts.ticket?.(m) ?? { status: "ok", id: `ticket-${++n}` }) } };
    }
    return { status: 200, body: { data: opts.receipts?.((body as { ids: string[] }).ids) ?? {} } };
  };
  let seen = 0;
  return {
    transport,
    calls,
    /** The messages sent since the last look. */
    take(): PushMessage[] {
      const sends = calls.filter((c) => c.path === "send");
      const out = sends.slice(seen).flatMap((c) => c.body as PushMessage[]);
      seen = sends.length;
      return out;
    },
  };
}

function world(expo = stubExpo()) {
  let nowMs = at(FRI, "08:00").getTime();
  const ledger: MemoryLedger = createMemoryLedger(() => new Date(nowMs));
  const logs: string[] = [];
  const sleeps: number[] = [];
  const deps = (extra: Partial<PushDeps> = {}): PushDeps => ({
    ledger,
    transport: expo.transport,
    accounts: async () => ACCOUNTS,
    calendar: async () => CALENDAR,
    timeZone: () => ZONE,
    env: {},
    sleep: async (ms) => void sleeps.push(ms),
    log: (line) => void logs.push(line),
    clock: () => new Date(nowMs),
    ...extra,
  });
  return {
    ledger,
    expo,
    logs,
    sleeps,
    /** Moves the clock to `date` `hhmm`, factory time. */
    moveTo(date: string, hhmm: string): Date {
      const when = at(date, hhmm);
      nowMs = when.getTime();
      return when;
    },
    async run(date: string, hhmm: string, extra: Partial<PushDeps> = {}) {
      return runPushes(this.moveTo(date, hhmm), deps(extra));
    },
    deps,
    async phones(): Promise<void> {
      await ledger.registerDevice("u-kapila", { token: TOKEN.kapilaEn, platform: "android", language: "en", deviceName: "Galaxy A14" });
      await ledger.registerDevice("u-kapila", { token: TOKEN.kapilaGu, platform: "android", language: "gu", deviceName: "Redmi 12" });
      await ledger.registerDevice("u-vinay", { token: TOKEN.vinay, platform: "android", language: "hi" });
      await ledger.registerDevice("u-boss", { token: TOKEN.boss, platform: "android", language: "en" });
    },
  };
}

const row = (w: ReturnType<typeof world>, userId: string, key: string) => w.ledger.rows.find((r) => r.userId === userId && r.key === key)!;

describe("the planner: when each person's phone is pushed", () => {
  it("the morning slot: every task once, one push per person, in each phone's language; run again, nothing", async () => {
    const w = world();
    await w.phones();
    w.moveTo(FRI, "08:35");
    await w.ledger.add(item("u-kapila", "needs_input", "needs_input|r1", { ...PEST, recordId: "r1", dueDate: FRI, count: 12 }));
    await w.ledger.add(item("u-kapila", "ready", "ready|r2", { ...VISC, recordId: "r2", dueDate: FRI }));
    // A Monday heads-up: Saturday is the next working day, so it is in the inbox and not pushed today.
    await w.ledger.add(item("u-kapila", "upcoming", `upcoming|weekly-clean|2026-10-12`, { ...PEST, documentId: "weekly-clean", documentName: "Weekly Cleaning Record", dueDate: "2026-10-12" }, "low"));
    await w.ledger.add(item("u-vinay", "ready", "ready|r3", { ...VISC, recordId: "r3", dueDate: FRI }));
    await w.ledger.add(item("u-boss", "boss_summary", `boss_summary|${FRI}|morning`, { part: "morning", dueDate: FRI, modules: [{ module: "QC", ready: 2, needsInput: 1, awaitingVerification: 0, notSubmitted: 3, overdue: 0 }] }, "medium"));

    const first = await w.run(FRI, "08:45");
    assert.equal(first.result.people, 3, first.outcome);
    const sent = w.expo.take();
    const to = (t: string) => sent.filter((m) => m.to === t);

    // Kapila: one push for two tasks, to both phones, each in its language; it opens the inbox.
    const [en] = to(TOKEN.kapilaEn);
    const [gu] = to(TOKEN.kapilaGu);
    assert.equal(to(TOKEN.kapilaEn).length, 1);
    assert.equal(en.title, "2 records need you");
    assert.equal(en.body, "Daily Pest Control Monitoring Record, Lamination Adhesive Viscosity Record.");
    assert.match(gu.title, /^2 રેકોર્ડ/);
    assert.deepEqual(en.data, { url: "mitra://inbox", kind: "group", count: 2 });
    assert.equal(en.channelId, "tasks");
    assert.equal(en.priority, "high");
    assert.equal(en.badge, 3, "the badge is every open item, the heads-up too");
    assert.ok(row(w, "u-kapila", "needs_input|r1").pushedAt && row(w, "u-kapila", "ready|r2").pushedAt);
    assert.equal(row(w, "u-kapila", "upcoming|weekly-clean|2026-10-12").pushedAt, null);

    // Vinay: one task, its own words in Hindi, opening the record.
    const [vinay] = to(TOKEN.vinay);
    assert.match(vinay.title, /^आपके लिए तैयार: Lamination Adhesive Viscosity Record$/);
    assert.deepEqual(vinay.data, { url: "mitra://task/r3", kind: "ready", notificationId: row(w, "u-vinay", "ready|r3").id, recordId: "r3", count: 1 });

    // The super admin: the morning summary, on the summary channel.
    const [boss] = to(TOKEN.boss);
    assert.equal(boss.title, "This morning's summary");
    assert.equal(boss.channelId, "summary");
    assert.equal(boss.priority, "default");

    const again = await w.run(FRI, "08:50");
    assert.match(again.outcome, /^nothing to push/);
    assert.deepEqual(w.expo.take(), []);
  });

  it("a task that comes up after the slot's push waits for the next: still open at 15:30, the last call at 17:45", async () => {
    const w = world();
    await w.phones();
    w.moveTo(FRI, "08:40");
    await w.ledger.add(item("u-vinay", "ready", "ready|r1", { ...VISC, recordId: "r1", dueDate: FRI }));
    await w.run(FRI, "08:45");
    assert.equal(w.expo.take().length, 1);

    w.moveTo(FRI, "11:00");
    await w.ledger.add(item("u-vinay", "needs_input", "needs_input|r4", { ...PEST, recordId: "r4", dueDate: FRI, count: 3 }));
    await w.run(FRI, "11:00");
    assert.deepEqual(w.expo.take(), [], "the morning's push was had: the new task waits for 15:30");
    await w.run(FRI, "15:25");
    assert.deepEqual(w.expo.take(), []);

    await w.run(FRI, "15:30");
    const [still] = w.expo.take();
    assert.equal(still.title, "अभी बाकी: 2 रिकॉर्ड आपकी प्रतीक्षा में हैं");
    await w.run(FRI, "15:35");
    assert.deepEqual(w.expo.take(), [], "once in the slot");

    // r1 submitted meanwhile: the last call names what is left.
    await w.ledger.sync([w.ledger.rows.find((r) => r.key === "needs_input|r4")!], { kinds: ["ready", "needs_input"], users: ["u-vinay"] });
    await w.run(FRI, "17:45");
    const [last] = w.expo.take();
    assert.match(last.title, /^आज की आख़िरी याद: 3 रीडिंग भरनी हैं: Daily Pest Control Monitoring Record$/);
    assert.equal(last.data.url, "mitra://task/r4");
  });

  it("quiet: the staff wait for the plant's working day and hours; the super admin is pushed at any hour", async () => {
    const w = world();
    await w.phones();
    w.moveTo(FRI, "08:31");
    await w.ledger.add(item("u-kapila", "ready", "ready|r1", { ...VISC, recordId: "r1", dueDate: FRI }));
    await w.ledger.add(item("u-boss", "escalation", "escalation|e1", { subject: "Kapila Barad", module: "QC", late: 3, neverDone: 1 }));
    const early = await w.run(FRI, "08:32");
    assert.deepEqual(
      w.expo.take().map((m) => m.to),
      [TOKEN.boss],
      "before 08:40 only the super admin"
    );
    assert.equal(early.result.held, 1);
    assert.match(early.outcome, /1 person's push waits for the plant's hours/);
    await w.run(FRI, "08:40");
    assert.deepEqual(new Set(w.expo.take().map((m) => m.to)), new Set([TOKEN.kapilaEn, TOKEN.kapilaGu]));

    // After the close, on the weekly off and on a festival holiday: nothing for the staff.
    w.moveTo(FRI, "18:25");
    await w.ledger.sync([], { kinds: ["ready"], users: ["u-kapila"] }); // submitted
    await w.ledger.add(item("u-vinay", "verify", "verify|r9", { ...PEST, recordId: "r9", dueDate: FRI, by: "Kapila Barad" }, "medium"));
    await w.run(FRI, "18:25");
    await w.run("2026-10-15", "10:00"); // a Thursday
    await w.run("2026-10-20", "10:00"); // Dussehra
    assert.deepEqual(w.expo.take(), []);
    await w.run("2026-10-21", "08:40");
    assert.deepEqual(
      w.expo.take().map((m) => m.to),
      [TOKEN.vinay],
      "the next window"
    );
  });

  it("overdue: once a day, from 09:30", async () => {
    const w = world();
    await w.phones();
    w.moveTo(FRI, "08:40");
    await w.ledger.add(item("u-kapila", "overdue", "overdue|r5", { ...PEST, recordId: "r5", dueDate: "2026-10-07", daysLate: 2 }));
    await w.run(FRI, "09:00");
    assert.deepEqual(w.expo.take(), []);
    await w.run(FRI, "09:30");
    const sent = w.expo.take();
    assert.equal(sent.length, 2);
    assert.equal(sent[0].title, "Overdue: Daily Pest Control Monitoring Record");
    await w.run(FRI, "10:00");
    await w.run(FRI, "15:30");
    assert.deepEqual(w.expo.take(), [], "not again the same day, not in the task reminders");
    await w.ledger.add(item("u-kapila", "overdue", "overdue|r5", { ...PEST, recordId: "r5", dueDate: "2026-10-07", daysLate: 3 }));
    await w.run(SAT, "09:30");
    assert.match(w.expo.take()[0].body, /3 days late/);
  });

  it("a heads-up is pushed once, on the working day before: Wednesday for a Friday when Thursday is off", async () => {
    const w = world();
    await w.phones();
    w.moveTo("2026-10-12", "08:40");
    await w.ledger.add(item("u-vinay", "upcoming", "upcoming|weekly-clean|2026-10-16", { ...PEST, documentId: "weekly-clean", documentName: "Weekly Cleaning Record", dueDate: "2026-10-16" }, "low"));
    await w.run("2026-10-12", "08:45");
    await w.run("2026-10-13", "08:45");
    assert.deepEqual(w.expo.take(), []);
    await w.run("2026-10-14", "08:45");
    const [heads] = w.expo.take();
    assert.match(heads.body, /16-Oct-2026/);
    assert.equal(heads.channelId, "summary");
    assert.equal(heads.data.kind, "upcoming");
    await w.run("2026-10-14", "15:30");
    assert.deepEqual(w.expo.take(), []);
  });

  it("verify and sent_back at once; a send-back's reason never leaves DCRS", async () => {
    const w = world();
    await w.phones();
    w.moveTo(FRI, "11:00");
    await w.ledger.add(item("u-kapila", "sent_back", "sent_back|r6|1", { ...PEST, recordId: "r6", dueDate: FRI, by: "Vinay Bhojak", reason: "Station 3 reads 45, recheck it" }));
    await w.ledger.add(item("u-vinay", "verify", "verify|r7", { ...VISC, recordId: "r7", dueDate: FRI, by: "Kapila Barad" }, "medium"));
    const r = await w.run(FRI, "11:00");
    assert.equal(r.result.people, 2);
    const sent = w.expo.take();
    const kapila = sent.find((m) => m.to === TOKEN.kapilaEn)!;
    assert.equal(kapila.body, "Vinay Bhojak sent back F/HR/17 Daily Pest Control Monitoring Record of 09-Oct-2026. Put it right and submit it again.");
    assert.ok(!JSON.stringify(sent).includes("45"), "no value of the record in any push");
    assert.match(sent.find((m) => m.to === TOKEN.vinay)!.title, /^सत्यापन के लिए: /);
    // The inbox still words the reason.
    assert.equal(row(w, "u-kapila", "sent_back|r6|1").data.reason, "Station 3 reads 45, recheck it");
  });

  it("a kind switched off is not pushed and stays in the inbox; an account that has left is not pushed", async () => {
    const w = world();
    await w.phones();
    await w.ledger.registerDevice("u-left", { token: TOKEN.left, platform: "android", language: "en" });
    await w.ledger.setPreferences("u-kapila", { kinds: { ready: false } });
    w.moveTo(FRI, "08:40");
    await w.ledger.add(item("u-kapila", "ready", "ready|r1", { ...VISC, recordId: "r1", dueDate: FRI }));
    await w.ledger.add(item("u-kapila", "needs_input", "needs_input|r2", { ...PEST, recordId: "r2", dueDate: FRI, count: 12 }));
    await w.ledger.add(item("u-left", "ready", "ready|r3", { ...VISC, recordId: "r3", dueDate: FRI }));
    await w.run(FRI, "08:45");
    const sent = w.expo.take();
    assert.deepEqual(new Set(sent.map((m) => m.to)), new Set([TOKEN.kapilaEn, TOKEN.kapilaGu]));
    assert.equal(sent.find((m) => m.to === TOKEN.kapilaEn)!.title, "12 readings to enter: Daily Pest Control Monitoring Record");
    const inbox = await w.ledger.list("u-kapila", { state: "open", limit: 50 });
    assert.deepEqual(inbox.items.map((n) => n.key).sort(), ["needs_input|r2", "ready|r1"]);
    assert.equal(row(w, "u-kapila", "ready|r1").pushedAt, null);
  });

  it("the plan is pure: the plant's clock is read in its own time zone, the slots in order", () => {
    const times = pushTimes({});
    assert.deepEqual(times, { morning: "08:30", reminder: "15:30", lastCall: "17:45", overdue: "09:30" });
    assert.equal(pushTimes({ PREPARE_AT: "07:55" }).morning, "07:55");
    assert.equal(currentSlot("08:29", times), null);
    assert.equal(currentSlot("08:30", times), "morning");
    assert.equal(currentSlot("15:29", times), "morning");
    assert.equal(currentSlot("16:00", times), "reminder");
    assert.equal(currentSlot("17:45", times), "lastCall");
    const clock = pushClock(at(FRI, "08:45"), CALENDAR, ZONE, times);
    assert.equal(clock.date, FRI);
    assert.equal(clock.time, "08:45");
    assert.equal(clock.staffWindow, true);
    assert.equal(clock.nextWorkingDay, SAT);
    assert.equal(pushClock(at("2026-10-07", "12:00"), CALENDAR, ZONE, times).nextWorkingDay, FRI, "Thursday is skipped");
    assert.equal(pushClock(at("2026-10-08", "12:00"), CALENDAR, ZONE, times).staffWindow, false);
    assert.deepEqual(planPushes([], clock), { decisions: [], held: 0 });
  });
});

describe("the sender: Expo's push service", () => {
  const message = (i: number): PushMessage => ({ to: `ExponentPushToken[phone-${String(i).padStart(12, "0")}]`, title: "t", body: "b", data: { url: "mitra://inbox", kind: "group", count: 1 }, channelId: "tasks", priority: "high", sound: "default" });

  it("sends in batches of 100: 250 phones go in three requests", async () => {
    const expo = stubExpo();
    const tickets = await sendMessages(
      Array.from({ length: 250 }, (_, i) => message(i)),
      { transport: expo.transport, log: () => undefined }
    );
    assert.equal(SEND_BATCH, 100);
    assert.deepEqual(
      expo.calls.map((c) => (c.body as unknown[]).length),
      [100, 100, 50]
    );
    assert.equal(tickets.length, 250);
    assert.ok(tickets.every((t) => t?.status === "ok"));
  });

  it("a failed request is tried again after a pause; one refused is not", async () => {
    let fails = 1;
    const expo = stubExpo({ send: () => (fails-- > 0 ? new Error("socket hang up") : undefined) });
    const sleeps: number[] = [];
    const tickets = await sendMessages([message(1)], { transport: expo.transport, sleep: async (ms) => void sleeps.push(ms), log: () => undefined });
    assert.equal(expo.calls.length, 2);
    assert.deepEqual(sleeps, [2000]);
    assert.equal(tickets[0]?.status, "ok");

    const refused = stubExpo({ send: () => ({ status: 400, body: { errors: [{ code: "VALIDATION_ERROR", message: "bad" }] } }) });
    const lines: string[] = [];
    const none = await sendMessages([message(2)], { transport: refused.transport, sleep: async () => undefined, log: (l) => void lines.push(l) });
    assert.equal(refused.calls.length, 1);
    assert.deepEqual(none, [null]);
    assert.match(lines[0], /refused the push request: HTTP 400 \(VALIDATION_ERROR bad\)/);
  });

  it("a push that never gets through is left for the next run", async () => {
    let down = true;
    const w = world(stubExpo({ send: () => (down ? { status: 503, body: null } : undefined) }));
    await w.phones();
    w.moveTo(FRI, "11:00");
    await w.ledger.add(item("u-vinay", "verify", "verify|r7", { ...VISC, recordId: "r7", dueDate: FRI }, "medium"));
    const r = await w.run(FRI, "11:00");
    assert.equal(w.expo.calls.length, 3, "three tries");
    assert.deepEqual(w.sleeps, [2000, 8000]);
    assert.equal(r.result.failed, 1);
    assert.match(r.outcome, /1 person not reached, tried again on the next run/);
    assert.equal(row(w, "u-vinay", "verify|r7").pushedAt, null);
    down = false;
    const next = await w.run(FRI, "11:05");
    assert.equal(next.result.people, 1);
    assert.ok(row(w, "u-vinay", "verify|r7").pushedAt);
  });

  it("receipts are read 15 minutes later: a phone no longer registered is forgotten, by its ticket or its receipt", async () => {
    const w = world(
      stubExpo({
        // Expo's own words quote the token.
        ticket: (m) => (m.to === TOKEN.kapilaGu ? { status: "error", message: `"${m.to}" is not a registered push notification recipient`, details: { error: "DeviceNotRegistered" } } : undefined),
        receipts: (ids) => Object.fromEntries(ids.map((id) => [id, id === "ticket-2" ? { status: "error", message: `"${TOKEN.vinay}" is not a registered push notification recipient`, details: { error: "DeviceNotRegistered" } } : { status: "ok" }])),
      })
    );
    await w.phones();
    w.moveTo(FRI, "11:00");
    await w.ledger.add(item("u-kapila", "verify", "verify|r1", { ...VISC, recordId: "r1", dueDate: FRI }, "medium"));
    await w.ledger.add(item("u-vinay", "verify", "verify|r2", { ...VISC, recordId: "r2", dueDate: FRI }, "medium"));
    const r = await w.run(FRI, "11:00");
    assert.equal(r.result.unregistered, 1);
    assert.ok(!w.ledger.devices.some((d) => d.token === TOKEN.kapilaGu), "the ticket said so: forgotten at once");
    assert.deepEqual(
      w.ledger.tickets.map((t) => t.token),
      [TOKEN.kapilaEn, TOKEN.vinay]
    );

    await w.run(FRI, "11:10");
    assert.equal(w.expo.calls.filter((c) => c.path === "getReceipts").length, 0, "not before 15 minutes");
    const later = await w.run(FRI, "11:16");
    assert.equal(later.result.receipts, 2);
    assert.deepEqual(w.expo.calls.find((c) => c.path === "getReceipts")!.body, { ids: ["ticket-1", "ticket-2"] });
    assert.ok(!w.ledger.devices.some((d) => d.token === TOKEN.vinay), "the receipt said so: forgotten");
    assert.ok(w.ledger.devices.some((d) => d.token === TOKEN.kapilaEn));
    assert.deepEqual(w.ledger.tickets, [], "the receipts read are dropped");

    // NO TOKEN IN ANY LINE WRITTEN, though Expo's own words quoted two.
    assert.ok(w.logs.length > 0);
    for (const line of [...w.logs, r.outcome, later.outcome]) for (const t of Object.values(TOKEN)) assert.ok(!line.includes(t), line);
  });

  it("no token in a log: masked to its last four characters", () => {
    assert.equal(maskToken(TOKEN.vinay), "ExponentPushToken[…0003]");
    assert.equal(maskToken("ExpoPushToken[abc]"), "ExpoPushToken[…]");
    assert.equal(scrubTokens(`"${TOKEN.boss}" and "${TOKEN.left}" failed`), '"ExponentPushToken[…0004]" and "ExponentPushToken[…0005]" failed');
  });
});

describe("the switch, no phones, and the test push", () => {
  it("PUSH_ENABLED=0 sends nothing; with no phone registered nothing is sent", async () => {
    const w = world();
    await w.phones();
    w.moveTo(FRI, "11:00");
    await w.ledger.add(item("u-vinay", "verify", "verify|r7", { ...VISC, recordId: "r7", dueDate: FRI }, "medium"));
    const off = await w.run(FRI, "11:00", { env: { PUSH_ENABLED: "0" } });
    assert.equal(off.outcome, "pushes off (PUSH_ENABLED=0)");
    assert.equal(w.expo.calls.length, 0);
    assert.deepEqual(await sendTestPush("u-vinay", w.deps({ env: { PUSH_ENABLED: "0" } })), { sent: 0, reason: "Push notifications are switched off on this DCRS server." });

    const empty = world();
    empty.moveTo(FRI, "11:00");
    await empty.ledger.add(item("u-vinay", "verify", "verify|r7", { ...VISC, recordId: "r7", dueDate: FRI }, "medium"));
    assert.equal((await empty.run(FRI, "11:00")).outcome, "nothing to push: no phone is registered");
    assert.equal(empty.expo.calls.length, 0);
    assert.deepEqual(await sendTestPush("u-vinay", empty.deps()), { sent: 0, reason: "No phone is registered for notifications on this account yet." });
  });

  it("the test push goes to each of the person's phones in its language, and says in words why when it cannot", async () => {
    const w = world();
    await w.phones();
    assert.deepEqual(await sendTestPush("u-kapila", w.deps()), { sent: 2 });
    const sent = w.expo.take();
    assert.equal(sent.find((m) => m.to === TOKEN.kapilaEn)!.title, "Test notification");
    assert.equal(sent.find((m) => m.to === TOKEN.kapilaGu)!.title, "પરીક્ષણ સૂચના");
    assert.equal(w.ledger.tickets.length, 2, "its receipts are read like any push's");

    const noFirebase = world(stubExpo({ ticket: () => ({ status: "error", message: "Unable to retrieve the FCM server key", details: { error: "InvalidCredentials" } }) }));
    await noFirebase.phones();
    assert.deepEqual(await sendTestPush("u-boss", noFirebase.deps()), {
      sent: 0,
      reason: "The push credentials are not set up yet (Firebase, for Android phones). See DEPLOYMENT.md, Push notifications.",
    });
  });
});
