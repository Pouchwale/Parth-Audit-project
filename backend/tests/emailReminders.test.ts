// THE REMINDER EMAILS (the owner, 25-Oct-2026, backend/emailReminders.ts), over the stand-in ledger
// (backend/tests/memoryLedger.ts) and the stand-in email tables (backend/tests/memoryEmailStore.ts), the plant's calendar
// (Thursday off, a festival holiday, 08:40 to 18:20) and a stand-in for Gmail. No database, no network. What is proved:
//   * the planner: one email per person per slot, the morning one at the first run after the plant opens, "Still open"
//     at 15:30 and "Last call" at 17:45, three a day at most; never on a closed day or outside the hours, the super
//     admin's too; only the latest slot that has begun (a server started at 16:00 sends the 15:30 email alone); nothing
//     open, no email;
//   * what an email says: grouped Overdue, Sent back, To fill and submit, To verify, Coming up (the morning's only), one
//     line each in the notification's own words with the date as 09-10-26, cut at 40 with "and N more", a long list by
//     module; the push's words as its subject; never a send-back's reason; one link to DCRS_APP_URL; HTML escaped; in
//     English, Gujarati and Hindi;
//   * the sender: each email claimed before it is sent, so a second run, or two at one moment, sends nothing more; a
//     failed send tried again at most twice later in the slot, the failure masked; the plant's EMAIL_DAILY_CAP, the most
//     overdue first; EMAIL_ENABLED=0, the super admin's switch and no mailbox each stop it, said so; EMAIL_TRANSPORT=capture
//     keeps the email's text in the log and sends nothing; an account switched off, removed, or with its reminder email
//     off is not emailed; a record done drops out of the next slot's email; 60 days of the log kept;
//   * one line in the activity log per run, in the System's name, naming people and counts and never an address, for
//     the super admin's eyes only;
//   * the test email: to the caller's own reminder email, in its language; why not, in words; counted in the plant's cap;
//   * the notify job's last step: its outcome carries the emails' line, and a failure there never fails the job.
// Run: npm run test:unit -- emailReminders
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityWhere, EMAIL_ACTIONS, type ActivityInput } from "../db.ts";
import type { MailMessage, MailResult } from "../email.ts";
import type { OpenItem } from "../emailContacts.ts";
import {
  composeDigest,
  emailClock,
  emailItems,
  LONG_LIST,
  MAX_ATTEMPTS,
  MAX_LINES,
  notificationsLink,
  planEmails,
  runReminderEmails,
  sendTestEmail,
  type EmailDeps,
  type EmailPerson,
} from "../emailReminders.ts";
import type { EngineHost } from "../engineHost.ts";
import type { LedgerItem } from "../notifications.ts";
import { runNotify } from "../notificationJobs.ts";
import { pushTimes } from "../push.ts";
import { PLANNED_KINDS, type NotificationKind } from "../../frontend/src/engine/notificationPlan.ts";
import { parseClock, zonedMoment, type HoursCalendar } from "../../frontend/src/engine/workingHoursCore.ts";
import { createMemoryLedger } from "./memoryLedger.ts";
import { createMemoryEmailStore } from "./memoryEmailStore.ts";

const ZONE = "Asia/Kolkata";
/** Thursday off; Dussehra a festival holiday; the owner's hours. */
const CALENDAR: HoursCalendar = { weeklyOffDay: 4, holidays: [{ date: "2026-10-20", name: "Dussehra" }], adjustmentDays: [], workingHours: { start: "08:40", end: "18:20" } };
const at = (date: string, hhmm: string): Date => zonedMoment(date, parseClock(hhmm)!, ZONE);
// Friday 9 October 2026 is a working day; Thursday 8 the weekly off; Monday 12 the next working day; Dussehra Tuesday 20.
const FRI = "2026-10-09";
const THU = "2026-10-08";
const DUSSEHRA = "2026-10-20";
const SENDER = "Gujarat Print Pack Publications Pvt Ltd - DCRS";

const ACCOUNTS = [
  { id: "u-kapila", name: "Kapila Barad", active: true },
  { id: "u-vinay", name: "Vinay Bhojak", active: true },
  { id: "u-boss", name: "Super Admin", active: true },
  { id: "u-left", name: "Somebody Who Left", active: false },
];
/** Stand-in mailboxes at a reserved domain: nobody's. */
const ADDR = { kapila: "kapila.reminders@example.com", vinay: "vinay.reminders@example.com", boss: "boss.reminders@example.com", left: "left.reminders@example.com" };

const PEST = { documentId: "daily-pest-monitoring", formatNo: "F/HR/17", documentName: "Daily Pest Control Monitoring Record", module: "HR" };
const VISC = { documentId: "lamination-viscosity", formatNo: "F-QC-30", documentName: "Lamination Adhesive Viscosity Record", module: "QC" };

/** An email as the stand-in for Gmail took it: the sender always gives the text part. */
type Sent = Required<MailMessage>;

function item(userId: string, kind: NotificationKind, key: string, data: LedgerItem["data"], priority: LedgerItem["priority"] = "high"): LedgerItem {
  return { userId, kind, key, priority, data };
}
const due = (userId: string, doc = VISC, date = FRI) => item(userId, "due", `due|${doc.documentId}|${date}`, { ...doc, dueDate: date });

async function world(opts: { contacts?: boolean; on?: boolean } = {}) {
  let nowMs = at(FRI, "08:00").getTime();
  const ledger = createMemoryLedger(() => new Date(nowMs));
  const store = createMemoryEmailStore({ clock: () => new Date(nowMs), ledger });
  if (opts.on !== false) await store.setSettings(true, "Super Admin");
  if (opts.contacts !== false) {
    await store.setContact({ userId: "u-kapila", address: ADDR.kapila, language: "en", enabled: true, setBy: "Super Admin" });
    await store.setContact({ userId: "u-vinay", address: ADDR.vinay, language: "gu", enabled: true, setBy: "Super Admin" });
    await store.setContact({ userId: "u-boss", address: ADDR.boss, language: "hi", enabled: true, setBy: "Super Admin" });
    await store.setContact({ userId: "u-left", address: ADDR.left, language: "en", enabled: true, setBy: "Super Admin" });
  }
  const outbox: Sent[] = [];
  const logged: ActivityInput[] = [];
  const logs: string[] = [];
  let failWith: ((m: MailMessage) => Error | null) | null = null;
  let seen = 0;
  const send = async (m: MailMessage): Promise<MailResult> => {
    const err = failWith?.(m) ?? null;
    if (err) throw err;
    outbox.push({ ...m, text: m.text ?? "" });
    return { messageId: `<m-${outbox.length}@example.com>`, captured: false };
  };
  const deps = (extra: Partial<EmailDeps> = {}): EmailDeps => ({
    store,
    accounts: async () => ACCOUNTS,
    calendar: async () => CALENDAR,
    timeZone: () => ZONE,
    env: {},
    send,
    activity: async (lines) => void logged.push(...lines),
    log: (line) => void logs.push(line),
    sender: async () => SENDER,
    ...extra,
  });
  return {
    ledger,
    store,
    outbox,
    logged,
    logs,
    deps,
    fail(f: ((m: MailMessage) => Error | null) | null) {
      failWith = f;
    },
    /** The ledger as the notify job would leave it: these items open, every other planned one resolved. */
    async plan(items: LedgerItem[]) {
      await ledger.sync(items, { kinds: PLANNED_KINDS, users: ACCOUNTS.map((a) => a.id) });
    },
    moveTo(date: string, hhmm: string): Date {
      const when = at(date, hhmm);
      nowMs = when.getTime();
      return when;
    },
    async run(date: string, hhmm: string, extra: Partial<EmailDeps> = {}) {
      return runReminderEmails(this.moveTo(date, hhmm), deps(extra));
    },
    /** The emails sent since the last look. */
    take(): Sent[] {
      const out = outbox.slice(seen);
      seen = outbox.length;
      return out;
    },
  };
}

const mailTo = (mails: Sent[], to: string) => mails.find((m) => m.to === to);
const TIMES = pushTimes({});
const clockAt = (date: string, hhmm: string) => emailClock(at(date, hhmm), CALENDAR, ZONE, TIMES);
const open = (userId: string, items: LedgerItem[]): OpenItem[] => items.map((x, i) => ({ id: i + 1, userId, kind: x.kind, key: x.key, priority: x.priority, data: x.data }));
const person = (name: string, language: EmailPerson["language"], items: OpenItem[]): EmailPerson => ({ userId: items[0]?.userId ?? "u-x", name, language, open: items });
const digestOf = (p: EmailPerson, slot: "morning" | "reminder" | "lastCall", link: string | null = null) => composeDigest(p, emailItems(p.open, slot), slot, { times: TIMES, link, sender: SENDER });

describe("the planner: when each person is emailed", () => {
  it("the morning: one email per person with open work, in the person's language; nothing open, no email; nobody who left", async () => {
    const w = await world();
    await w.plan([
      due("u-kapila"),
      item("u-kapila", "needs_input", "needs_input|r1", { ...PEST, recordId: "r1", dueDate: FRI, count: 12 }),
      item("u-vinay", "ready", "ready|r2", { ...PEST, recordId: "r2", dueDate: FRI }),
      due("u-left"),
    ]);
    const { outcome, result } = await w.run(FRI, "08:45");
    assert.equal(result.slot, "morning");
    const mails = w.take();
    assert.deepEqual(mails.map((m) => m.to).sort(), [ADDR.kapila, ADDR.vinay].sort(), "nobody who left; the super admin has nothing open");
    assert.equal(result.nothingOpen, 1, "the super admin: nothing open, no email");
    assert.equal(result.sent, 2);
    assert.match(outcome, /^emailed 2 people \(the morning email\)$/);
    const kapila = mailTo(mails, ADDR.kapila)!;
    assert.equal(kapila.subject, "2 records need you");
    assert.match(kapila.text, /^Hello Kapila Barad,\n\nHere is what is waiting for you in DCRS today\.\n\nTo fill and submit \(2\)\n/);
    assert.ok(kapila.text.includes("  - F-QC-30 Lamination Adhesive Viscosity Record of 09-10-26 is due and not started yet."), kapila.text);
    assert.ok(kapila.text.includes("  - F/HR/17 Daily Pest Control Monitoring Record of 09-10-26 is ready for you: 12 readings to enter, then submit."), kapila.text);
    assert.ok(kapila.text.includes("DCRS reminds you again at 15:30 and 17:45 on working days, until each one is done."));
    assert.ok(kapila.text.endsWith(`-- \n${SENDER}`));
    const vinay = mailTo(mails, ADDR.vinay)!;
    assert.match(vinay.subject, /^તમારા માટે તૈયાર: Daily Pest Control Monitoring Record$/, "one item: its own title, in Gujarati");
    assert.match(vinay.text, /^નમસ્તે Vinay Bhojak,/);
    assert.match(vinay.text, /ભરીને સબમિટ કરવાનું \(1\)/);
    assert.deepEqual(
      w.store.rows.map((r) => [r.userId, r.day, r.slot, r.state, r.items]),
      [
        ["u-kapila", FRI, "morning", "sent", 2],
        ["u-vinay", FRI, "morning", "sent", 1],
      ]
    );
  });

  it("the day's three slots: the morning, 'Still open' at 15:30, 'Last call' at 17:45; between them nothing; three a day at most", async () => {
    const w = await world();
    await w.plan([due("u-kapila"), due("u-kapila", PEST)]);
    await w.run(FRI, "08:45");
    assert.equal(w.take().length, 1);
    const noon = await w.run(FRI, "12:00");
    assert.equal(w.take().length, 0);
    assert.equal(noon.outcome, "nothing to email: the morning email went already");
    await w.run(FRI, "15:31");
    const still = w.take();
    assert.deepEqual(still.map((m) => m.subject), ["Still open: 2 records need you"]);
    assert.match(still[0].text, /These are still open for you in DCRS\./);
    assert.match(still[0].text, /DCRS reminds you once more at 17:45, and again on the next working day/);
    await w.run(FRI, "16:10");
    assert.equal(w.take().length, 0);
    await w.run(FRI, "17:50");
    const last = w.take();
    assert.deepEqual(last.map((m) => m.subject), ["Last call: 2 records need you"]);
    assert.match(last[0].text, /Last call for today: these are still open for you in DCRS\./);
    assert.match(last[0].text, /DCRS reminds you again on the next working day, until each one is done\./);
    await w.run(FRI, "18:10");
    assert.equal(w.take().length, 0);
    assert.deepEqual(
      w.store.rows.filter((r) => r.userId === "u-kapila").map((r) => r.slot),
      ["morning", "reminder", "lastCall"]
    );
  });

  it("never on a closed day nor outside the plant's hours, the super admin's email too", async () => {
    const w = await world();
    await w.plan([due("u-kapila", VISC, THU), item("u-boss", "due", "due|other|x", { ...VISC, documentId: "other", dueDate: FRI })]);
    assert.equal((await w.run(THU, "10:00")).outcome, "no emails on a closed day");
    assert.equal((await w.run(DUSSEHRA, "10:00")).outcome, "no emails on a closed day", "a festival holiday");
    assert.equal((await w.run(FRI, "08:35")).outcome, "no emails outside the plant's hours", "the plant opens at 08:40");
    assert.equal((await w.run(FRI, "18:25")).outcome, "no emails outside the plant's hours", "nor after it closes, for the super admin either");
    assert.equal((await w.run(FRI, "07:00")).outcome, "no emails outside the plant's hours");
    assert.equal(w.take().length, 0);
    assert.equal(w.store.rows.length, 0);
    assert.equal((await w.run(FRI, "08:41")).result.sent, 2, "the first run after the plant opens: the morning email");
  });

  it("before the day's first slot, nothing; only the latest slot that has begun: a server started at 16:00 sends the 15:30 email alone", async () => {
    const w = await world();
    await w.plan([due("u-kapila")]);
    const before = await w.run(FRI, "08:50", { env: { PREPARE_AT: "09:00" } });
    assert.equal(before.outcome, "no emails before the morning slot");
    const late = await w.run(FRI, "16:00");
    assert.equal(late.result.slot, "reminder");
    assert.deepEqual(w.take().map((m) => m.subject), ["Still open: Due today: Lamination Adhesive Viscosity Record"]);
    await w.run(FRI, "16:05");
    assert.equal(w.take().length, 0, "no morning email caught up");
    assert.deepEqual(w.store.rows.map((r) => r.slot), ["reminder"]);
  });
});

describe("what an email says", () => {
  const KAPILA_ITEMS: LedgerItem[] = [
    item("u-kapila", "overdue", "overdue|r9", { ...VISC, recordId: "r9", dueDate: "2026-10-07", daysLate: 2 }),
    item("u-kapila", "sent_back", "sent_back|r8|1", { ...PEST, recordId: "r8", dueDate: FRI, by: "Super Admin", reason: "pH 9.8 is out of range, write it again" }),
    item("u-kapila", "due", `due|${VISC.documentId}|${FRI}`, { ...VISC, dueDate: FRI }),
    item("u-kapila", "needs_input", "needs_input|r7", { ...PEST, recordId: "r7", dueDate: FRI, count: 3 }),
    item("u-kapila", "ready", "ready|r6", { ...VISC, recordId: "r6", dueDate: FRI }),
    item("u-kapila", "verify", "verify|r5", { ...PEST, recordId: "r5", dueDate: FRI, by: "Vinay Bhojak" }, "medium"),
    item("u-kapila", "upcoming", "upcoming|monthly|2026-10-12", { ...PEST, documentName: "Monthly Cleaning Record", formatNo: "F/HR/20", dueDate: "2026-10-12" }, "low"),
    item("u-kapila", "access_changed", "access_changed|x", { module: "PRD", level: "write", by: "Super Admin" }),
    item("u-kapila", "boss_summary", `boss_summary|${FRI}|morning`, { part: "morning", dueDate: FRI, modules: [] }),
  ];

  it("grouped Overdue, Sent back, To fill and submit, To verify, Coming up; the heads-ups in the morning only; no summary, escalation or access change", () => {
    const p = person("Kapila Barad", "en", open("u-kapila", KAPILA_ITEMS));
    const morning = digestOf(p, "morning");
    assert.equal(morning.items, 7);
    assert.equal(morning.subject, "7 records need you");
    const order = ["Overdue (1)", "Sent back (1)", "To fill and submit (3)", "To verify (1)", "Coming up (1)"].map((h) => morning.text.indexOf(h));
    assert.ok(order.every((i) => i > 0), morning.text);
    assert.deepEqual(order, order.slice().sort((a, b) => a - b), "the most pressing first");
    assert.ok(morning.text.includes("  - F-QC-30 Lamination Adhesive Viscosity Record of 07-10-26 is 2 days late. Fill it in and submit it today."));
    assert.ok(morning.text.includes("  - Vinay Bhojak submitted F/HR/17 Daily Pest Control Monitoring Record of 09-10-26. It is waiting for your verification."));
    assert.ok(morning.text.includes("  - F/HR/20 Monthly Cleaning Record is due on 12-10-26."));
    assert.doesNotMatch(morning.text, /access|summary|Escalat/i, "not the notifications no email carries");
    const afternoon = digestOf(p, "reminder");
    assert.equal(afternoon.items, 6);
    assert.equal(afternoon.subject, "Still open: 6 records need you");
    assert.ok(!afternoon.text.includes("Coming up"), "the heads-ups wait for the morning");
    // Only heads-ups open: an email in the morning, none in the afternoon.
    const vinay = person("Vinay Bhojak", "en", open("u-vinay", [KAPILA_ITEMS[6]]));
    assert.equal(emailItems(vinay.open, "morning").length, 1);
    assert.equal(emailItems(vinay.open, "reminder").length, 0);
  });

  it("never a send-back's reason nor a record's values, in the subject, the text or the HTML; who sent it back is said", () => {
    const back = open("u-kapila", [KAPILA_ITEMS[1]]);
    for (const slot of ["morning", "reminder", "lastCall"] as const) {
      for (const lang of ["en", "gu", "hi"] as const) {
        const d = digestOf(person("Kapila Barad", lang, back), slot);
        for (const part of [d.subject, d.text, d.html]) assert.ok(!part.includes("pH 9.8") && !part.includes("out of range"), `${slot} ${lang}: ${part.slice(0, 200)}`);
      }
    }
    const en = digestOf(person("Kapila Barad", "en", back), "morning");
    assert.ok(en.text.includes("  - Super Admin sent back F/HR/17 Daily Pest Control Monitoring Record of 09-10-26. Put it right and submit it again."), en.text);
    assert.equal(en.subject, "Sent back: Daily Pest Control Monitoring Record");
  });

  it(`cut at ${MAX_LINES} lines with "and N more", the most pressing kept; a long list under each module's name`, () => {
    const many: LedgerItem[] = [];
    for (let i = 0; i < 30; i++) many.push(due("u-kapila", { documentId: `qc-doc-${i}`, formatNo: `F/QC/${String(i + 10).padStart(2, "0")}`, documentName: `QC Sheet ${i}`, module: "QC" }));
    for (let i = 0; i < 25; i++) many.push(due("u-kapila", { documentId: `hr-doc-${i}`, formatNo: `F/HR/${String(i + 10).padStart(2, "0")}`, documentName: `HR Sheet ${i}`, module: "HR" }));
    const d = digestOf(person("Kapila Barad", "en", open("u-kapila", many)), "morning");
    assert.equal(d.items, 55);
    assert.equal(d.shown, MAX_LINES);
    assert.equal(d.text.split("\n").filter((l) => l.startsWith("  - ")).length, MAX_LINES);
    assert.equal((d.html.match(/<li /g) ?? []).length, MAX_LINES);
    assert.ok(d.text.includes("To fill and submit (55)"));
    assert.ok(d.text.includes("  and 15 more"), d.text.slice(-600));
    assert.ok(d.html.includes("and 15 more"));
    assert.ok(d.text.indexOf("  Quality Control") > 0 && d.text.indexOf("  Human Resources") > d.text.indexOf("  Quality Control"), "by module, in the plant's own order");
    assert.equal(d.subject, "55 records need you");
    // A short list: no module headings.
    const few = digestOf(person("Kapila Barad", "en", open("u-kapila", many.slice(0, LONG_LIST))), "morning");
    assert.ok(!few.text.includes("  Quality Control"), few.text);
  });

  it("one link to DCRS_APP_URL's Notifications page when it is set; none otherwise; the HTML escaped", () => {
    assert.equal(notificationsLink({ DCRS_APP_URL: " http://dcrs-host:4000/ " }), "http://dcrs-host:4000/#/notifications");
    assert.equal(notificationsLink({}), null);
    assert.equal(notificationsLink({ DCRS_APP_URL: "javascript:alert(1)" }), null);
    const odd = open("u-kapila", [due("u-kapila", { documentId: "odd", formatNo: "F/QC/99", documentName: `<b>Bold & "quoted"</b>`, module: "QC" })]);
    const withLink = digestOf(person("Kapila <Barad>", "en", odd), "morning", "http://dcrs-host:4000/#/notifications");
    assert.ok(withLink.text.includes("Open DCRS to see them all: http://dcrs-host:4000/#/notifications"));
    assert.ok(withLink.html.includes(`href="http://dcrs-host:4000/#/notifications"`));
    assert.ok(withLink.html.includes("&lt;b&gt;Bold &amp; &quot;quoted&quot;&lt;/b&gt;"), "a name is escaped");
    assert.ok(withLink.html.includes("Hello Kapila &lt;Barad&gt;,"));
    assert.ok(!withLink.html.includes("<b>Bold"));
    const without = digestOf(person("Kapila Barad", "en", odd), "morning");
    assert.ok(!without.text.includes("http") && !without.html.includes("href="));
    assert.ok(without.text.includes("Open DCRS, choose the bell, then See all, to see them all."));
  });

  it("in English, Gujarati and Hindi: the lines are the notifications' own words; no em dash; no gendered pronoun in English", () => {
    const items = open("u-boss", KAPILA_ITEMS.slice(0, 7));
    const scripts = { en: /[A-Za-z]/, gu: /[઀-૿]/, hi: /[ऀ-ॿ]/ } as const;
    for (const lang of ["en", "gu", "hi"] as const) {
      for (const slot of ["morning", "reminder", "lastCall"] as const) {
        const d = digestOf(person("Super Admin", lang, items), slot);
        assert.match(d.text, scripts[lang], `${lang} ${slot}`);
        assert.match(d.subject, scripts[lang], `${lang} ${slot} subject`);
        assert.doesNotMatch(d.text + d.subject, /—/, `${lang} ${slot}: no em dash`);
        assert.doesNotMatch(d.text, /undefined|NaN|null|\{|\}|\[object/, `${lang} ${slot}`);
        assert.ok(d.html.startsWith(`<!doctype html><html lang="${lang}">`));
        if (lang === "en") assert.doesNotMatch(d.text, /\b(he|she|his|her|hers|him|himself|herself)\b/i);
      }
    }
    const hi = digestOf(person("Super Admin", "hi", items), "reminder");
    assert.match(hi.subject, /^अभी बाकी: 6 रिकॉर्ड आपकी प्रतीक्षा में हैं$/);
    assert.ok(hi.text.includes("नमस्ते Super Admin,"));
    assert.ok(hi.text.includes("F-QC-30 Lamination Adhesive Viscosity Record (07-10-26) 2 दिन देर से है।"), hi.text);
    const gu = digestOf(person("Super Admin", "gu", items), "lastCall");
    assert.match(gu.subject, /^આજની છેલ્લી યાદ: 6 રેકોર્ડ તમારી રાહ જુએ છે$/);
  });
});

describe("the sender", () => {
  it("claims each email before it is sent: run again in the slot, or twice at one moment, and nothing more goes", async () => {
    const w = await world();
    await w.plan([due("u-kapila"), due("u-vinay", PEST)]);
    const [a, b] = await Promise.all([w.run(FRI, "09:00"), w.run(FRI, "09:00")]);
    assert.equal(a.result.sent + b.result.sent, 2, "two runs at one moment: each email once");
    assert.equal(w.take().length, 2);
    const again = await w.run(FRI, "09:05");
    assert.equal(again.result.sent, 0);
    assert.equal(w.take().length, 0);
    assert.equal(w.store.rows.length, 2);
  });

  it("a failed send is tried again at most twice later in the slot, then left for the next; the failure masked everywhere", async () => {
    const w = await world();
    await w.plan([due("u-kapila")]);
    const refusal = () => Object.assign(new Error(`550 5.1.1 <${ADDR.kapila}>: Recipient address rejected`), { code: "EENVELOPE", responseCode: 550 });
    w.fail((m) => (m.to === ADDR.kapila ? refusal() : null));
    const first = await w.run(FRI, "09:00");
    assert.equal(first.result.failed, 1);
    assert.match(first.outcome, /^1 email not sent, tried again later$/);
    const row = () => w.store.rows.find((r) => r.userId === "u-kapila" && r.slot === "morning")!;
    assert.equal(row().state, "failed");
    assert.equal(row().attempts, 1);
    assert.ok(!row().error!.includes(ADDR.kapila) && row().error!.includes("k…@e….com"), row().error!);
    const contact = (await w.store.contactOf("u-kapila"))!;
    assert.ok(contact.lastFailure && !contact.lastFailure.includes(ADDR.kapila) && contact.lastFailureAt);
    assert.ok(w.logs.length > 0 && w.logs.every((l) => !l.includes("@example.com")), w.logs.join("\n"));
    assert.ok(w.logged.length === 1 && w.logged[0].detail!.includes("not sent to Kapila Barad") && !JSON.stringify(w.logged).includes("@"));
    await w.run(FRI, "09:05");
    assert.equal(row().attempts, 2);
    await w.run(FRI, "09:10");
    assert.equal(row().attempts, MAX_ATTEMPTS);
    assert.equal(row().state, "failed");
    w.fail(null);
    const gaveUp = await w.run(FRI, "09:15");
    assert.equal(gaveUp.result.givenUp, 1);
    assert.match(gaveUp.outcome, /given up for this slot after 3 tries/);
    assert.equal(w.take().length, 0, "three tries in the slot, no more");
    await w.run(FRI, "15:31");
    assert.deepEqual(w.take().map((m) => m.subject), ["Still open: Due today: Lamination Adhesive Viscosity Record"], "the next slot sends anew");
    assert.equal((await w.store.contactOf("u-kapila"))!.lastFailure, null, "a send that went clears the failure");
  });

  it("the plant's cap a day (EMAIL_DAILY_CAP): the rest held, the most overdue first; a test email counts in it", async () => {
    const w = await world();
    const late = (userId: string, n: number) => Array.from({ length: n }, (_, i) => item(userId, "overdue", `overdue|${userId}-${i}`, { ...VISC, recordId: `${userId}-${i}`, dueDate: "2026-10-07", daysLate: 2 }));
    await w.plan([...late("u-boss", 2), ...late("u-kapila", 1), due("u-vinay", PEST)]);
    const { outcome, result } = await w.run(FRI, "09:00", { env: { EMAIL_DAILY_CAP: "2" } });
    assert.equal(result.sent, 2);
    assert.equal(result.heldByCap, 1);
    assert.deepEqual(w.take().map((m) => m.to).sort(), [ADDR.boss, ADDR.kapila].sort(), "the most overdue first");
    assert.match(outcome, /1 email held: the day's cap is reached/);
    const test = await sendTestEmail({ id: "u-boss", name: "Super Admin" }, { ...w.deps({ env: { EMAIL_DAILY_CAP: "2" } }), now: at(FRI, "09:01") });
    assert.equal(test.code, "cap");
  });

  it("EMAIL_ENABLED=0, the super admin's switch off, or no mailbox set up: nothing is sent, and the outcome says which", async () => {
    const w = await world();
    await w.plan([due("u-kapila")]);
    assert.equal((await w.run(FRI, "09:00", { env: { EMAIL_ENABLED: "0" } })).outcome, "emails off (EMAIL_ENABLED=0)");
    assert.equal((await w.run(FRI, "09:00", { send: undefined })).outcome, "emails off (not set up: GMAIL_USER and GMAIL_APP_PASSWORD are not set)");
    await w.store.setSettings(false, "Super Admin");
    assert.equal((await w.run(FRI, "09:00")).outcome, "emails off (switched off on the Notifications page)");
    assert.equal(w.take().length, 0);
    assert.equal(w.store.rows.length, 0, "nothing claimed either");
    const fresh = await world({ on: false });
    assert.equal((await fresh.run(FRI, "09:00")).outcome, "emails off (switched off on the Notifications page)", "off until the super admin switches them on");
  });

  it("EMAIL_TRANSPORT=capture: every email kept in the log with its text, nothing sent", async () => {
    const w = await world();
    await w.plan([due("u-kapila"), due("u-vinay", PEST)]);
    const { outcome, result } = await w.run(FRI, "09:00", { send: undefined, env: { EMAIL_TRANSPORT: "capture" } });
    assert.equal(result.captured, 2);
    assert.equal(result.sent, 0);
    assert.match(outcome, /^captured 2 emails \(the morning email; EMAIL_TRANSPORT=capture: nothing left the PC\)$/);
    assert.equal(w.take().length, 0);
    const kapila = w.store.rows.find((r) => r.userId === "u-kapila")!;
    assert.equal(kapila.state, "captured");
    assert.ok(kapila.body!.includes("F-QC-30 Lamination Adhesive Viscosity Record of 09-10-26 is due and not started yet."));
    assert.equal(kapila.subject, "Due today: Lamination Adhesive Viscosity Record");
    assert.ok(kapila.sentAt);
    assert.match(w.logged[0].detail!, /captured on this server \(EMAIL_TRANSPORT=capture\): nothing left the PC/);
  });

  it("not an account switched off, nor one removed (off the plant's list), nor a reminder email switched off", async () => {
    const w = await world();
    await w.store.setContact({ userId: "u-vinay", address: ADDR.vinay, language: "gu", enabled: false, setBy: "Super Admin" });
    await w.plan([due("u-kapila"), due("u-vinay", PEST), due("u-left"), due("u-boss", PEST)]);
    await w.run(FRI, "09:00", { accounts: async () => ACCOUNTS.filter((a) => a.id !== "u-boss") });
    assert.deepEqual(w.take().map((m) => m.to), [ADDR.kapila]);
  });

  it("a record done drops out of the next slot's email; nothing open, no email: the reminders stop", async () => {
    const w = await world();
    await w.plan([due("u-kapila"), due("u-kapila", PEST)]);
    await w.run(FRI, "09:00");
    assert.match(w.take()[0].text, /F-QC-30/);
    await w.plan([due("u-kapila", PEST)]);
    await w.run(FRI, "15:31");
    const still = w.take();
    assert.equal(still.length, 1);
    assert.ok(!still[0].text.includes("F-QC-30") && still[0].text.includes("F/HR/17"), still[0].text);
    await w.plan([]);
    const done = await w.run(FRI, "17:50");
    assert.equal(w.take().length, 0);
    assert.equal(done.outcome, "nothing to email: nothing is open for anybody with a reminder email");
    assert.equal(done.result.nothingOpen, 3);
  });

  it("one line in the activity log per run, in the System's name, naming the people and their counts, never an address; the super admin's alone", async () => {
    const w = await world();
    await w.plan([due("u-kapila"), due("u-kapila", PEST), due("u-vinay", PEST)]);
    await w.run(FRI, "09:00");
    assert.equal(w.logged.length, 1);
    const line = w.logged[0];
    assert.equal(line.action, EMAIL_ACTIONS.sent);
    assert.equal(line.userName, "System");
    assert.equal(line.userId, null);
    assert.equal(line.department, "");
    assert.equal(line.target, "2 people");
    assert.equal(line.detail, "Kapila Barad (2 records), Vinay Bhojak (1 record): the morning email of 09-10-26");
    assert.ok(!JSON.stringify(line).includes("@"));
    await w.run(FRI, "09:05");
    assert.equal(w.logged.length, 1, "a quiet run writes nothing");
    const args: unknown[] = [];
    activityWhere({ departments: null, userId: "u-kapila" }, args);
    assert.ok((args[0] as string[]).includes(EMAIL_ACTIONS.sent) && (args[0] as string[]).includes(EMAIL_ACTIONS.set), "kept from everybody but the super admin");
    const boss: unknown[] = [];
    assert.deepEqual(activityWhere({ departments: null, userId: "u-boss", superAdmin: true }, boss), []);
  });

  it("keeps 60 days of the log", async () => {
    const w = await world();
    await w.store.claim({ userId: "u-kapila", day: "2026-08-01", slot: "morning", items: 1 });
    await w.store.claim({ userId: "u-kapila", day: "2026-08-15", slot: "morning", items: 1 });
    w.store.rows[0].claimedAt = new Date(at(FRI, "09:00").getTime() - 61 * 86_400_000).toISOString();
    w.store.rows[1].claimedAt = new Date(at(FRI, "09:00").getTime() - 59 * 86_400_000).toISOString();
    await w.run(FRI, "09:00");
    assert.deepEqual(w.store.rows.map((r) => r.day), ["2026-08-15"]);
  });
});

describe("the test email", () => {
  it("to the caller's own reminder email, in its language, kept under a slot of its own and never one of the day's three", async () => {
    const w = await world();
    await w.plan([due("u-boss", PEST)]);
    const r = await sendTestEmail({ id: "u-boss", name: "Super Admin" }, { ...w.deps(), now: at(FRI, "08:45") });
    assert.deepEqual(r, { sent: true, captured: false });
    const [mail] = w.take();
    assert.equal(mail.to, ADDR.boss);
    assert.equal(mail.subject, "DCRS का परीक्षण ईमेल");
    assert.ok(mail.text.includes("यह DCRS का परीक्षण ईमेल है।"));
    assert.match(w.store.rows[0].slot, /^test-084500-[0-9a-f]{4}$/);
    await w.run(FRI, "08:50");
    assert.deepEqual(w.take().map((m) => m.to), [ADDR.boss], "the morning email still goes");
  });

  it("says why when it cannot: the server switched off, nothing set up, no reminder email, Gmail refused (masked)", async () => {
    const w = await world();
    assert.equal((await sendTestEmail({ id: "u-boss", name: "Super Admin" }, w.deps({ env: { EMAIL_ENABLED: "off" } }))).code, "server-off");
    assert.equal((await sendTestEmail({ id: "u-boss", name: "Super Admin" }, w.deps({ send: undefined }))).code, "not-set-up");
    const none = await sendTestEmail({ id: "u-nobody", name: "Nobody" }, w.deps());
    assert.equal(none.code, "no-address");
    assert.match(none.reason!, /Users & Access/);
    w.fail(() => Object.assign(new Error(`Invalid login: 535-5.7.8 Username and Password not accepted for ${ADDR.boss}`), { code: "EAUTH", responseCode: 535 }));
    const refused = await sendTestEmail({ id: "u-boss", name: "Super Admin" }, w.deps());
    assert.equal(refused.code, "failed");
    assert.match(refused.reason!, /App Password/);
    assert.ok(!JSON.stringify(w.store.rows).includes(ADDR.boss), "no address in the log");
    assert.equal(w.store.rows[0].state, "failed");
  });
});

describe("the notify job's last step", () => {
  const engine = { read: async () => ({ status: 200, body: { date: FRI, time: "08:45", users: [], items: [] } }) } as unknown as EngineHost;

  it("the emails go after the pushes, at the run's moment, and their line is in the outcome", async () => {
    let seenAt: Date | null = null;
    const when = at(FRI, "08:45");
    const r = await runNotify(
      { now: when },
      { engine, ledger: createMemoryLedger(), accounts: async () => [], escalations: async () => [], push: async () => ({ outcome: "pushes off (PUSH_ENABLED=0)" }), email: async (now) => ((seenAt = now), { outcome: "emailed 2 people (the morning email)" }) }
    );
    assert.equal(r.result.email, "emailed 2 people (the morning email)");
    assert.ok(r.outcome.endsWith("; pushes off (PUSH_ENABLED=0); emailed 2 people (the morning email)"), r.outcome);
    assert.equal((seenAt as Date | null)?.getTime(), when.getTime());
  });

  it("an email step that fails is said in the outcome, never fails the job, and names no address", async () => {
    const r = await runNotify(
      { now: at(FRI, "08:45") },
      {
        engine,
        ledger: createMemoryLedger(),
        accounts: async () => [],
        escalations: async () => [],
        email: async () => {
          throw new Error(`the database dropped the connection while writing for ${ADDR.kapila}`);
        },
      }
    );
    assert.match(r.result.email, /^emails not sent this run: the database dropped the connection/);
    assert.ok(!r.outcome.includes(ADDR.kapila));
    const none = await runNotify({ now: at(FRI, "08:45") }, { engine, ledger: createMemoryLedger(), accounts: async () => [], escalations: async () => [] });
    assert.equal(none.result.email, "emails off");
  });
});

describe("the planner is pure", () => {
  it("the same people, log and clock give the same emails", () => {
    const people = [person("Kapila Barad", "en", open("u-kapila", [due("u-kapila")]))];
    const input = { people, clock: clockAt(FRI, "09:00"), log: [], dailyCap: 150, link: null, sender: SENDER };
    assert.deepEqual(planEmails(input), planEmails(input));
    assert.equal(planEmails({ ...input, clock: clockAt(THU, "09:00") }).quiet, "closed-day");
    assert.equal(planEmails({ ...input, clock: clockAt(FRI, "19:00") }).quiet, "outside-hours");
  });
});
