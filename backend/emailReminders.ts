// THE REMINDER EMAILS (the owner, 25-Oct-2026): every person told by email, free of cost, what is still open for them,
// again and again until it is done.
//
// "i want a system that will email the users automatically for the updates on their given email id's for the free of
// cost so the system will update the user that you have to complete this records and those are the records remaining
// till now to filled or submit/verify according to there before the due date and system will remind the user again and
// again until he or she complete his tasks."
//
// ONE PLANNER, ONE SENDER, as backend/push.ts. planEmails is PURE: each person with a reminder email switched on (their
// OPEN notifications, the ledger's, backend/notifications.ts), today's email log and the plant's clock in, and AT MOST
// ONE email per person per slot out, worded in the person's language by frontend/src/engine/notificationText.ts (the
// bell, the phone and the email say the same). runReminderEmails is the notify job's last step, after the pushes
// (backend/notificationJobs.ts, set by backend/index.ts): it claims each email in the email log BEFORE sending it
// (backend/emailContacts.ts), sends it (backend/email.ts: Gmail, or kept on the PC with EMAIL_TRANSPORT=capture) and
// writes how it went.
//
// WHEN (push.ts's clock: pushClock, currentSlot):
//   morning    the first run after the plant opens (08:40; the slot begins at PREPARE_AT, 08:30, the hours hold it ten
//              minutes more), with what is coming up as well;
//   reminder   15:30, "Still open: ...";
//   lastCall   17:45, "Last call: ...".
// ONLY THE LATEST SLOT THAT HAS BEGUN: a server started at 16:00 sends the 15:30 email, never the morning's as well, so a
// late start is no storm of emails. ALWAYS INSIDE THE HOURS: on a working day of the plant's calendar between the open and
// the close (Master Data: 08:40 to 18:20), the super admin's own email too; never on the weekly off or a holiday.
// NOTHING OPEN, NO EMAIL: that is how "again and again until done" stops. What went before is not asked: the email lists
// what is still open at the slot.
//
// WHAT AN EMAIL SAYS: everything still open for the person, grouped Overdue, Sent back, To fill and submit (due,
// needs input, ready), To verify, Coming up (the morning's only); one line each, the notification's own words with the
// date as 24-10-26; cut at 40 lines with "and N more"; a long list under each module's name. NEVER a send-back's reason
// nor a record's values (the mail passes through Gmail): ids, document names, dates and counts only. One link to
// DCRS_APP_URL/#/notifications when DCRS_APP_URL is set. The subject is the push's own words, "Still open: 3 records
// need you".
//
// HOW MANY: one a slot, so three a day at most for a person (PERSON_DAILY_MAX, held to it whatever happens), and
// EMAIL_DAILY_CAP (150) for the plant, well inside what a free Gmail account may send. A send that FAILED is tried again
// at most twice later in the same slot (MAX_ATTEMPTS), then left for the next slot.
//
// NEVER AN ADDRESS outside email_contacts: not in the log table (its error text is masked), not in the console, not in
// the activity log, whose one line a run writes ("Reminder emails sent", in the System's name, naming the people and
// their counts) is the super admin's alone (db.ts SUPER_ADMIN_ACTIONS).
//
// SWITCHES: the super admin's switch on the Notifications page (email_settings, off until switched on); EMAIL_ENABLED=0
// stops every reminder email on the server. Tests: backend/tests/emailReminders.test.ts, tests/e2e_email_reminders.py.
import crypto from "node:crypto";
import { EMAIL_ACTIONS, insertActivity, listUsers, plantTimeZone, type ActivityInput } from "./db.ts";
import { mailMode, scrubAddresses, sendMail, senderName, type MailMessage, type MailMode, type MailResult } from "./email.ts";
import { databaseEmailStore, type EmailContact, type EmailLogRow, type EmailStore, type OpenItem } from "./emailContacts.ts";
import { currentSlot, pushClock, pushTimes, type PushClock, type PushTimes } from "./push.ts";
import { createWorkingHoursGate } from "./workingHours.ts";
import { plantNow, wallClock, type HoursCalendar } from "../frontend/src/engine/workingHoursCore.ts";
import {
  displayDate,
  EMAIL_GROUPS,
  emailGroupOf,
  emailSubject,
  emailWords,
  MODULE_NAMES,
  moduleName,
  notificationWords,
  type EmailGroup,
  type EmailSlot,
  type NotificationLanguage,
  type WordsData,
} from "../frontend/src/engine/notificationText.ts";
import { isReminderLanguage } from "../frontend/src/engine/reminderEmail.ts";

type Env = Record<string, string | undefined>;

/** The kinds an email carries: a person's own work. Not the summaries, the escalations or an access change. */
export const EMAIL_KINDS: readonly string[] = ["overdue", "sent_back", "due", "needs_input", "ready", "verify", "upcoming"];
/** The day's three slots, in order. */
export const DIGEST_SLOTS: readonly EmailSlot[] = ["morning", "reminder", "lastCall"];
/** A slot's email is tried this many times at most: the first try and two more, on later runs. */
export const MAX_ATTEMPTS = 3;
/** The most reminder emails one person gets in a day. */
export const PERSON_DAILY_MAX = 3;
/** The plant's emails a day unless EMAIL_DAILY_CAP says otherwise (a free Gmail account may send about 500). */
export const DEFAULT_DAILY_CAP = 150;
/** The most lines an email lists; the rest are "and N more". */
export const MAX_LINES = 40;
/** More open items than this: each group's lines under their module's name. */
export const LONG_LIST = 12;

// ---------------------------------------------------------------------------
// the switches

const isOff = (v: string | undefined): boolean => ["0", "off", "false", "no"].includes((v ?? "").trim().toLowerCase());

/** Whether this server sends reminder emails at all: anything but EMAIL_ENABLED=0 (or off, false, no). */
export function emailEnabled(env: Env = process.env): boolean {
  return !isOff(env.EMAIL_ENABLED);
}

/** The plant's emails a day (EMAIL_DAILY_CAP, a whole number from 1 to 2000; 150 otherwise). */
export function dailyCap(env: Env = process.env): number {
  const n = Number((env.EMAIL_DAILY_CAP ?? "").trim());
  return Number.isInteger(n) && n >= 1 && n <= 2000 ? n : DEFAULT_DAILY_CAP;
}

/** The one link an email carries: DCRS_APP_URL's Notifications page, or null when DCRS_APP_URL is not an http(s) address. */
export function notificationsLink(env: Env = process.env): string | null {
  const base = (env.DCRS_APP_URL ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s"'<>]+$/i.test(base) ? `${base}/#/notifications` : null;
}

/** What the super admin's page says of the setup: how mail goes, the server's switch, the cap, the link, the times. */
export function emailSetup(env: Env = process.env): { mode: MailMode; serverOn: boolean; dailyCap: number; link: boolean; times: PushTimes } {
  return { mode: mailMode(env), serverOn: emailEnabled(env), dailyCap: dailyCap(env), link: notificationsLink(env) !== null, times: pushTimes(env) };
}

// ---------------------------------------------------------------------------
// one person's email

export interface EmailPerson {
  userId: string;
  name: string;
  language: NotificationLanguage;
  /** The person's open notifications (any kind: only EMAIL_KINDS are listed). */
  open: readonly OpenItem[];
}

export interface Digest {
  subject: string;
  text: string;
  html: string;
  /** How many open items it stands for. */
  items: number;
  /** How many of them it lists by name. */
  shown: number;
}

export interface DigestOptions {
  times: PushTimes;
  /** DCRS_APP_URL/#/notifications, or null for no link. */
  link: string | null;
  /** "<company> - DCRS", the name the mail comes from. */
  sender: string;
}

/** The items an email lists in this slot: the person's own work, the heads-ups in the morning only. */
export function emailItems(open: readonly OpenItem[], slot: EmailSlot): OpenItem[] {
  return open.filter((n) => EMAIL_KINDS.includes(n.kind) && (n.kind !== "upcoming" || slot === "morning"));
}

/** The facts a line may carry: never a send-back's reason (free text about the record's values). */
function lineFacts(data: OpenItem["data"]): WordsData {
  const facts: WordsData = { ...(data as WordsData) };
  delete facts.reason;
  return facts;
}

const PRIORITY: Record<string, number> = { high: 0, medium: 1, low: 2 };
/** The modules in the plant's own order (F/SYS/02: System first); a document in none last. */
const MODULE_ORDER: readonly string[] = Object.keys(MODULE_NAMES);
const moduleRank = (code: string | null): number => (code && MODULE_ORDER.includes(code) ? MODULE_ORDER.indexOf(code) : MODULE_ORDER.length);

function byUrgency(a: OpenItem, b: OpenItem): number {
  const due = (n: OpenItem) => String(n.data.dueDate ?? "9999-12-31");
  const no = (n: OpenItem) => String(n.data.formatNo ?? n.data.documentName ?? "");
  return (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1) || due(a).localeCompare(due(b)) || no(a).localeCompare(no(b)) || a.id - b.id;
}

interface Section {
  group: EmailGroup;
  heading: string;
  count: number;
  parts: { heading: string | null; lines: string[] }[];
  more: number;
}

/** The email's sections, cut at MAX_LINES in order: the most pressing first, so what is cut is the least pressing. */
function sectionsOf(items: readonly OpenItem[], lang: NotificationLanguage): { sections: Section[]; shown: number } {
  const words = emailWords(lang);
  const long = items.length > LONG_LIST;
  let budget = MAX_LINES;
  let shown = 0;
  const sections: Section[] = [];
  for (const group of EMAIL_GROUPS) {
    const mine = items.filter((n) => emailGroupOf(n.kind) === group);
    if (mine.length === 0) continue;
    const ordered = long
      ? mine.slice().sort((a, b) => moduleRank(a.data.module ?? null) - moduleRank(b.data.module ?? null) || byUrgency(a, b))
      : mine.slice().sort(byUrgency);
    const parts: Section["parts"] = [];
    let listed = 0;
    for (const n of ordered) {
      if (budget === 0) break;
      const heading = long ? moduleName(n.data.module, lang) || words.otherModule : null;
      let part = parts[parts.length - 1];
      if (!part || part.heading !== heading) {
        part = { heading, lines: [] };
        parts.push(part);
      }
      part.lines.push(notificationWords(n.kind, lineFacts(n.data), lang).body);
      budget -= 1;
      listed += 1;
    }
    shown += listed;
    sections.push({ group, heading: words.groups[group], count: mine.length, parts, more: mine.length - listed });
  }
  return { sections, shown };
}

const escapeHtml = (s: unknown): string => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** The DCRS colour (frontend/src/styles.css --brand). */
const BRAND = "#7E3C40";
const FONT = "'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Gujarati', 'Noto Sans Devanagari', Arial, sans-serif";

/**
 * ONE PERSON'S EMAIL for a slot: the subject, the plain-text part and the HTML part, in the person's language. Pure.
 * `items` are the ones to list (emailItems).
 */
export function composeDigest(person: Pick<EmailPerson, "name" | "language">, items: readonly OpenItem[], slot: EmailSlot, opts: DigestOptions): Digest {
  const lang = person.language;
  const words = emailWords(lang);
  const subject = emailSubject(
    items.map((n) => ({ kind: n.kind, data: lineFacts(n.data) })),
    slot,
    lang
  );
  const { sections, shown } = sectionsOf(items, lang);
  const again = words.again(slot, { reminder: opts.times.reminder, lastCall: opts.times.lastCall });

  const text: string[] = [words.hello(person.name), "", words.intro[slot]];
  for (const s of sections) {
    text.push("", `${s.heading} (${s.count})`);
    for (const p of s.parts) {
      if (p.heading) text.push(`  ${p.heading}`);
      for (const line of p.lines) text.push(`  - ${line}`);
    }
    if (s.more > 0) text.push(`  ${words.more(s.more)}`);
  }
  text.push("", opts.link ? `${words.openLink} ${opts.link}` : words.openNoLink, "", again, words.why, "", "-- ", opts.sender);

  const p = (body: string, style = "margin:0 0 12px;") => `<p style="${style}">${body}</p>`;
  const html: string[] = [
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:#f5f6f8;">`,
    `<div style="max-width:640px;margin:0 auto;padding:20px 16px;font-family:${FONT};font-size:15px;line-height:1.5;color:#1c2733;">`,
    p(escapeHtml(words.hello(person.name))),
    p(escapeHtml(words.intro[slot]), "margin:0 0 16px;"),
  ];
  for (const s of sections) {
    html.push(`<h2 style="font-size:16px;margin:18px 0 6px;color:${BRAND};">${escapeHtml(s.heading)} (${s.count})</h2>`);
    for (const part of s.parts) {
      if (part.heading) html.push(`<h3 style="font-size:14px;margin:10px 0 4px;color:#3e4c59;">${escapeHtml(part.heading)}</h3>`);
      html.push(`<ul style="margin:0 0 8px;padding-left:20px;">${part.lines.map((l) => `<li style="margin:0 0 4px;">${escapeHtml(l)}</li>`).join("")}</ul>`);
    }
    if (s.more > 0) html.push(p(escapeHtml(words.more(s.more)), "margin:0 0 8px;color:#52606d;"));
  }
  html.push(
    opts.link
      ? p(
          `<a href="${escapeHtml(opts.link)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;">${escapeHtml(words.openButton)}</a>`,
          "margin:22px 0;"
        )
      : p(escapeHtml(words.openNoLink), "margin:22px 0;"),
    p(escapeHtml(again), "margin:0 0 8px;font-size:13px;color:#52606d;"),
    p(escapeHtml(words.why), "margin:0 0 16px;font-size:13px;color:#52606d;"),
    p(escapeHtml(opts.sender), "margin:0;font-size:12px;color:#7b8794;"),
    `</div></body></html>`
  );
  return { subject, text: text.join("\n"), html: html.join("\n"), items: items.length, shown };
}

// ---------------------------------------------------------------------------
// the planner

/** The plant's clock as the planner reads it: push.ts's, and whether today is a closed day. */
export interface EmailClock extends PushClock {
  closedDay: boolean;
}

/** The plant's clock at `now`: its calendar and hours (Master Data), in its time zone. */
export function emailClock(now: Date, calendar: HoursCalendar | null, zone: string, times: PushTimes): EmailClock {
  return { ...pushClock(now, calendar, zone, times), closedDay: plantNow(calendar, now, zone).phase === "closed-day" };
}

export interface EmailPlanInput {
  people: readonly EmailPerson[];
  clock: EmailClock;
  /** Today's lines of the email log, every person. */
  log: readonly EmailLogRow[];
  /** The plant's emails a day. */
  dailyCap: number;
  link: string | null;
  sender: string;
}

export interface EmailDecision {
  userId: string;
  name: string;
  slot: EmailSlot;
  /** A failed line of this slot tried again, or null for a new one. */
  retryOf: number | null;
  digest: Digest;
}

export interface EmailPlan {
  slot: EmailSlot | null;
  decisions: EmailDecision[];
  /** Why nothing is sent now: the weekly off or a holiday, outside the hours, before the day's first slot. */
  quiet: "closed-day" | "outside-hours" | "before-first-slot" | null;
  /** People with nothing open: no email (how "again and again until done" stops). */
  nothingOpen: number;
  /** People whose email of this slot went already, or is going. */
  done: number;
  /** People whose email of this slot failed MAX_ATTEMPTS times: left for the next slot. */
  givenUp: number;
  /** People held by the caps: their three a day, or the plant's EMAIL_DAILY_CAP. */
  heldByCap: number;
}

const counts = (items: readonly OpenItem[], kind: string): number => items.filter((n) => n.kind === kind).length;

/**
 * THE PLAN: for each person, one email now, or none. Pure: the same people, log and clock give the same emails. Who
 * comes first when the plant's cap is near: the most overdue, then the most sent back, then the most open.
 */
export function planEmails(input: EmailPlanInput): EmailPlan {
  const { clock } = input;
  const plan: EmailPlan = { slot: null, decisions: [], quiet: null, nothingOpen: 0, done: 0, givenUp: 0, heldByCap: 0 };
  if (clock.closedDay) return { ...plan, quiet: "closed-day" };
  if (!clock.staffWindow) return { ...plan, quiet: "outside-hours" };
  const slot = currentSlot(clock.time, clock.times);
  if (slot === null) return { ...plan, quiet: "before-first-slot" };
  plan.slot = slot;

  const today = input.log.filter((r) => r.day === clock.date);
  let plantRows = today.length;
  const people = input.people
    .map((p) => ({ p, items: emailItems(p.open, slot) }))
    .sort((a, b) => counts(b.items, "overdue") - counts(a.items, "overdue") || counts(b.items, "sent_back") - counts(a.items, "sent_back") || b.items.length - a.items.length || a.p.name.localeCompare(b.p.name));
  for (const { p, items } of people) {
    if (items.length === 0) {
      plan.nothingOpen += 1;
      continue;
    }
    const mine = today.filter((r) => r.userId === p.userId);
    const row = mine.find((r) => r.slot === slot);
    let retryOf: number | null = null;
    if (row) {
      if (row.state !== "failed") {
        plan.done += 1;
        continue;
      }
      if (row.attempts >= MAX_ATTEMPTS) {
        plan.givenUp += 1;
        continue;
      }
      retryOf = row.id;
    } else {
      // Belt and braces: the slots are three, but a person never gets a fourth however the day's times change.
      if (mine.filter((r) => (DIGEST_SLOTS as readonly string[]).includes(r.slot)).length >= PERSON_DAILY_MAX || plantRows >= input.dailyCap) {
        plan.heldByCap += 1;
        continue;
      }
      plantRows += 1;
    }
    plan.decisions.push({ userId: p.userId, name: p.name, slot, retryOf, digest: composeDigest(p, items, slot, { times: clock.times, link: input.link, sender: input.sender }) });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// the sender

export interface EmailDeps {
  store?: EmailStore;
  /** Every account on the plant's list (listUsers: the removed left out): who is active, and their names. */
  accounts?: () => Promise<{ id: string; name: string; active: boolean }[]>;
  /** The plant's calendar and hours (Master Data). */
  calendar?: () => Promise<HoursCalendar | null>;
  timeZone?: () => string;
  env?: Env;
  /** Sends one message (backend/email.ts sendMail by default). */
  send?: (message: MailMessage) => Promise<MailResult>;
  /** Writes activity-log lines (the database's, by default). */
  activity?: (lines: ActivityInput[]) => Promise<void>;
  /** Where the sender's lines go (the console by default): never an address. */
  log?: (line: string) => void;
  /** The name the mail comes from (backend/email.ts senderName). */
  sender?: () => Promise<string>;
}

export interface EmailRunResult {
  slot: EmailSlot | null;
  /** Emails Gmail took. */
  sent: number;
  /** Emails kept on this PC (EMAIL_TRANSPORT=capture). */
  captured: number;
  /** Emails that failed this run: tried again later in the slot. */
  failed: number;
  nothingOpen: number;
  done: number;
  givenUp: number;
  heldByCap: number;
}

let gate: ReturnType<typeof createWorkingHoursGate> | null = null;
const defaultCalendar = (): Promise<HoursCalendar | null> => (gate ??= createWorkingHoursGate({ enforced: true })).calendar();
const defaultAccounts = async (): Promise<{ id: string; name: string; active: boolean }[]> => (await listUsers()).map((u) => ({ id: u.id, name: u.name, active: u.active !== false }));
const consoleLog = (line: string): void => console.log(line);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The slot in the words of the job's outcome and the activity log. */
const SLOT_WORDS: Record<EmailSlot, (t: PushTimes) => string> = {
  morning: () => "the morning email",
  reminder: (t) => `the ${t.reminder} "Still open" email`,
  lastCall: (t) => `the ${t.lastCall} "Last call" email`,
};

/** Why a send failed, in a short line with every address masked. */
export function failureLine(err: unknown): string {
  const e = err as { code?: unknown; responseCode?: unknown; message?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  const response = typeof e?.responseCode === "number" ? String(e.responseCode) : "";
  const message = err instanceof Error ? err.message : String(err);
  return scrubAddresses([code, response, message].filter(Boolean).join(" ").replace(/\s+/g, " ")).slice(0, 300);
}

/** Cleaned up once a plant day, per store. */
const cleanedOn = new WeakMap<EmailStore, string>();

/**
 * THE REMINDER EMAILS OF ONE NOTIFY RUN at `now` (the run's moment: the plant's clock is read at it). Answers a line for
 * the job's outcome, starting "nothing", "no emails" or "emails off" when nothing was sent.
 */
export async function runReminderEmails(now: Date, deps: EmailDeps = {}): Promise<{ outcome: string; result: EmailRunResult }> {
  const result: EmailRunResult = { slot: null, sent: 0, captured: 0, failed: 0, nothingOpen: 0, done: 0, givenUp: 0, heldByCap: 0 };
  const env = deps.env ?? process.env;
  if (!emailEnabled(env)) return { outcome: "emails off (EMAIL_ENABLED=0)", result };
  const store = deps.store ?? databaseEmailStore();
  if (!(await store.settings()).enabled) return { outcome: "emails off (switched off on the Notifications page)", result };
  if (!deps.send && mailMode(env) === "off") return { outcome: "emails off (not set up: GMAIL_USER and GMAIL_APP_PASSWORD are not set)", result };
  const send = deps.send ?? ((m: MailMessage) => sendMail(m, { env }));
  const log = deps.log ?? consoleLog;

  const times = pushTimes(env);
  const clock = emailClock(now, await (deps.calendar ?? defaultCalendar)(), (deps.timeZone ?? plantTimeZone)(), times);
  if (cleanedOn.get(store) !== clock.date) {
    await store.cleanUp(now);
    cleanedOn.set(store, clock.date);
  }
  if (clock.closedDay) return { outcome: "no emails on a closed day", result };
  if (!clock.staffWindow) return { outcome: "no emails outside the plant's hours", result };
  if (currentSlot(clock.time, times) === null) return { outcome: "no emails before the morning slot", result };

  const contacts = (await store.contacts()).filter((c) => c.enabled);
  if (contacts.length === 0) return { outcome: "nothing to email: nobody has a reminder email switched on", result };
  const accounts = new Map((await (deps.accounts ?? defaultAccounts)()).filter((a) => a.active).map((a) => [a.id, a] as const));
  const contactOf = new Map<string, EmailContact>();
  for (const c of contacts) if (accounts.has(c.userId)) contactOf.set(c.userId, c);
  if (contactOf.size === 0) return { outcome: "nothing to email: nobody with a reminder email is on the plant's list", result };

  const ids = [...contactOf.keys()];
  const open = await store.openItems(ids, EMAIL_KINDS);
  const people: EmailPerson[] = ids.map((userId) => {
    const c = contactOf.get(userId)!;
    return { userId, name: accounts.get(userId)!.name, language: isReminderLanguage(c.language) ? c.language : "en", open: open.filter((n) => n.userId === userId) };
  });
  const plan = planEmails({ people, clock, log: await store.logOfDay(clock.date), dailyCap: dailyCap(env), link: notificationsLink(env), sender: await (deps.sender ?? senderName)() });
  Object.assign(result, { slot: plan.slot, nothingOpen: plan.nothingOpen, done: plan.done, givenUp: plan.givenUp, heldByCap: plan.heldByCap });

  const reached: { name: string; items: number }[] = [];
  const missed: string[] = [];
  for (const d of plan.decisions) {
    const contact = contactOf.get(d.userId)!;
    // CLAIMED BEFORE IT IS SENT: of two runs at the same moment, only the one whose claim went in sends.
    const id = d.retryOf !== null ? ((await store.claimRetry(d.retryOf, MAX_ATTEMPTS)) ? d.retryOf : null) : await store.claim({ userId: d.userId, day: clock.date, slot: d.slot, items: d.digest.items });
    if (id === null) {
      result.done += 1;
      continue;
    }
    let sent: MailResult;
    try {
      sent = await send({ to: contact.address, subject: d.digest.subject, text: d.digest.text, html: d.digest.html });
    } catch (err) {
      const why = failureLine(err);
      await store.finish(id, { state: "failed", error: why, subject: d.digest.subject, items: d.digest.items });
      await store.noteFailure(d.userId, why);
      result.failed += 1;
      missed.push(d.name);
      log(`[email] the reminder email to ${d.name} was not sent (tried again later in this slot): ${why}`);
      continue;
    }
    // Sent: whatever happens next it is not sent again (a line left "claimed" is never tried again).
    await store.finish(id, { state: sent.captured ? "captured" : "sent", messageId: sent.messageId || null, error: null, subject: d.digest.subject, body: sent.captured ? d.digest.text : null, items: d.digest.items });
    if (contact.lastFailure) await store.noteFailure(d.userId, null);
    if (sent.captured) result.captured += 1;
    else result.sent += 1;
    reached.push({ name: d.name, items: d.digest.items });
  }

  const slotWords = plan.slot ? SLOT_WORDS[plan.slot](times) : "";
  if (reached.length > 0 || missed.length > 0) {
    const detail = [
      reached.length > 0 ? `${reached.map((r) => `${r.name} (${plural(r.items, "record")})`).join(", ")}: ${slotWords} of ${displayDate(clock.date)}` : `${slotWords} of ${displayDate(clock.date)}`,
      result.captured > 0 ? "captured on this server (EMAIL_TRANSPORT=capture): nothing left the PC" : "",
      missed.length > 0 ? `not sent to ${missed.join(", ")}: tried again later in this slot` : "",
    ]
      .filter(Boolean)
      .join("; ");
    const line: ActivityInput = { userId: null, userName: "System", userEmail: "", action: EMAIL_ACTIONS.sent, target: plural(reached.length + missed.length, "person", "people"), detail: detail.slice(0, 600), department: "" };
    await (deps.activity ?? insertActivity)([line]).catch((err) => log(`[email] the activity log could not be written: ${err instanceof Error ? err.message : String(err)}`));
  }

  const parts: string[] = [];
  if (result.sent > 0) parts.push(`emailed ${plural(result.sent, "person", "people")} (${slotWords})`);
  if (result.captured > 0) parts.push(`captured ${plural(result.captured, "email")} (${slotWords}; EMAIL_TRANSPORT=capture: nothing left the PC)`);
  if (result.failed > 0) parts.push(`${plural(result.failed, "email")} not sent, tried again later`);
  if (result.givenUp > 0) parts.push(`${plural(result.givenUp, "email")} given up for this slot after ${MAX_ATTEMPTS} tries`);
  if (result.heldByCap > 0) parts.push(`${plural(result.heldByCap, "email")} held: the day's cap is reached`);
  if (parts.length === 0) {
    return { outcome: result.done > 0 ? `nothing to email: ${slotWords} went already` : "nothing to email: nothing is open for anybody with a reminder email", result };
  }
  return { outcome: parts.join("; "), result };
}

// ---------------------------------------------------------------------------
// "Send me a test email"

export interface TestEmailResult {
  sent: boolean;
  /** Kept on this PC (EMAIL_TRANSPORT=capture): nothing left it. */
  captured?: boolean;
  /** Why nothing was sent, in plain words. */
  reason?: string;
  code?: "server-off" | "not-set-up" | "no-address" | "cap" | "failed";
}

/** A failed test send, in words the super admin can act on. */
export function testFailureWords(err: unknown): string {
  const e = err as { code?: unknown; responseCode?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  const response = typeof e?.responseCode === "number" ? e.responseCode : 0;
  if (code === "EAUTH") return "Gmail did not accept the sign-in: check GMAIL_USER and the App Password in backend/.env, then restart DCRS (DEPLOYMENT.md, Reminder emails).";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNRESET", "ENOTFOUND", "ECONNREFUSED"].includes(code)) return "Gmail could not be reached from this PC just now (is the internet on?). Try again in a minute.";
  if (code === "EENVELOPE" || response === 550 || response === 553) return "Gmail refused the address. Check your reminder email on Users & Access.";
  return `The email could not be sent: ${failureLine(err)}`;
}

/**
 * THE TEST EMAIL, to the caller's own reminder email (the super admin's, on Users & Access), in its language. Kept in
 * the email log under a slot of its own ("test-<time>"), counted in the plant's cap, never in the person's three a day.
 * The super admin's switch does not hold it back (it is how the setup is proved before the switch is turned on);
 * EMAIL_ENABLED=0 does.
 */
export async function sendTestEmail(user: { id: string; name: string }, deps: EmailDeps & { now?: Date } = {}): Promise<TestEmailResult> {
  const env = deps.env ?? process.env;
  if (!emailEnabled(env)) return { sent: false, code: "server-off", reason: "Reminder emails are switched off on this DCRS server (EMAIL_ENABLED=0 in backend/.env)." };
  if (!deps.send && mailMode(env) === "off")
    return { sent: false, code: "not-set-up", reason: "Email is not set up yet: GMAIL_USER and GMAIL_APP_PASSWORD are not set in backend/.env. See DEPLOYMENT.md, Reminder emails." };
  const store = deps.store ?? databaseEmailStore();
  const contact = await store.contactOf(user.id);
  if (!contact) return { sent: false, code: "no-address", reason: "You have no reminder email yet. Enter yours on Users & Access, in your own row, then try again." };
  const now = deps.now ?? new Date();
  const zone = (deps.timeZone ?? plantTimeZone)();
  const { date, secondOfDay } = wallClock(now, zone);
  if ((await store.logOfDay(date)).length >= dailyCap(env)) return { sent: false, code: "cap", reason: `The plant's ${dailyCap(env)} emails of today have gone (EMAIL_DAILY_CAP). Try again tomorrow.` };
  const hh = String(Math.floor(secondOfDay / 3600)).padStart(2, "0");
  const mm = String(Math.floor((secondOfDay % 3600) / 60)).padStart(2, "0");
  const ss = String(secondOfDay % 60).padStart(2, "0");
  const slot = `test-${hh}${mm}${ss}-${crypto.randomBytes(2).toString("hex")}`;
  const id = await store.claim({ userId: user.id, day: date, slot, items: 0 });
  if (id === null) return { sent: false, code: "failed", reason: "A test email was being sent at this very moment. Try again in a minute." };

  const lang = isReminderLanguage(contact.language) ? contact.language : "en";
  const words = emailWords(lang);
  const sender = await (deps.sender ?? senderName)();
  const subject = words.testSubject;
  const text = [words.hello(user.name), "", words.testBody, "", words.why, "", "-- ", sender].join("\n");
  const html = [
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:0;background:#f5f6f8;">`,
    `<div style="max-width:640px;margin:0 auto;padding:20px 16px;font-family:${FONT};font-size:15px;line-height:1.5;color:#1c2733;">`,
    `<p style="margin:0 0 12px;">${escapeHtml(words.hello(user.name))}</p>`,
    `<p style="margin:0 0 16px;">${escapeHtml(words.testBody)}</p>`,
    `<p style="margin:0 0 16px;font-size:13px;color:#52606d;">${escapeHtml(words.why)}</p>`,
    `<p style="margin:0;font-size:12px;color:#7b8794;">${escapeHtml(sender)}</p>`,
    `</div></body></html>`,
  ].join("\n");
  const send = deps.send ?? ((m: MailMessage) => sendMail(m, { env }));
  try {
    const sent = await send({ to: contact.address, subject, text, html });
    await store.finish(id, { state: sent.captured ? "captured" : "sent", messageId: sent.messageId || null, error: null, subject, body: sent.captured ? text : null, items: 0 });
    if (contact.lastFailure) await store.noteFailure(user.id, null);
    return { sent: true, captured: sent.captured };
  } catch (err) {
    const why = failureLine(err);
    await store.finish(id, { state: "failed", error: why, subject, items: 0 });
    await store.noteFailure(user.id, why);
    (deps.log ?? consoleLog)(`[email] the test email to ${user.name} was not sent: ${why}`);
    return { sent: false, code: "failed", reason: testFailureWords(err) };
  }
}
