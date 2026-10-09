// THE PUSHES TO THE PHONES (REQUIREMENTS §97): what each person's phone is told, when, and how it gets there.
//
// ONE PLANNER, ONE SENDER. planPushes is pure: it takes each person with a phone (their open notifications, the pushes
// they had today, their choices, their phones and each phone's language) and the plant's clock, and decides AT MOST ONE
// push per person per run, worded in each phone's language by frontend/src/engine/notificationText.ts (the bell and the
// inbox say the same). sendMessages hands the pushes to Expo's push service through a transport a test replaces, in
// batches of 100, and tries a request that failed again after a pause. runPushes is the notify job's last step
// (backend/notificationJobs.ts, set by backend/index.ts): the receipts of earlier pushes, then the plan, the send, and
// what was pushed written back in the ledger (backend/notifications.ts), so the next run does not push it again.
//
// WHEN (the owner's day, 8-Oct-2026):
//   ready, needs_input, due   the person's tasks: at most once in each of the day's three slots: after the morning
//                             prepare (PREPARE_AT, 08:30), the "still open" reminder (15:30) and the last call (17:45).
//                             The slot's push carries every task still open; a task that comes up after it waits for the
//                             next slot (a record the person is filling in is not pushed back at them).
//   overdue                   once a day, from 09:30.
//   upcoming                  once, on the working day before its due date (the inbox has it from the heads-up day).
//   verify, sent_back,        at once.
//   access_changed,
//   boss_summary, escalation
// QUIET. The staff are pushed only on the plant's working days inside its hours (Master Data; 08:40 to 18:20 unless the
// super admin changes them): what comes up outside waits for the next window. The super admin is pushed at any hour.
// CHOICES. A kind the person switched off (PUT /api/v1/notification-preferences) is not pushed; it stays in the inbox.
// SEVERAL AT ONCE: one push, "3 records need you" with the top three names, opening the inbox; one item: its own words,
// opening its record (mitra://task/<recordId>). Android channels: "tasks" (high) for the person's work, "summary"
// (default) for the super admin's summaries and the heads-ups. The badge is the person's open items.
//
// NEVER A RECORD'S VALUES: a push passes through Expo's and Google's servers, so it carries ids, document names and
// counts only (a send-back's reason stays in the inbox). NEVER A TOKEN IN A LOG: a phone's token is the key to its pushes;
// a line written here names no token at all, and Expo's own messages, which quote the token, are scrubbed first
// (scrubTokens keeps the last four characters).
//
// EXPO: POST https://exp.host/--/api/v2/push/send (at most 100 messages a request) answers a ticket per message; about
// 15 minutes later POST .../getReceipts says whether each reached the phone's push service. "DeviceNotRegistered", in a
// ticket or a receipt, removes the token. EXPO_ACCESS_TOKEN, when set, is sent as the bearer (Expo's "enhanced security
// for push notifications"); PUSH_SERVICE_URL points the sender at another service of the same shape (a test's stand-in).
// PUSH_ENABLED=0 sends nothing; with no phone registered nothing is sent. Tests: backend/tests/push.test.ts.
import { listUsers, plantTimeZone } from "./db.ts";
import { databaseLedger, type NotificationLedger, type PushPerson, type StoredNotification } from "./notifications.ts";
import { jobAccounts, prepareAt, SLOT_TIMES } from "./notificationJobs.ts";
import { createWorkingHoursGate } from "./workingHours.ts";
import type { NotificationKind } from "../frontend/src/engine/notificationPlan.ts";
import {
  groupWords,
  notificationWords,
  slotWords,
  testWords,
  type NotificationLanguage,
  type NotificationWords,
  type ReminderSlot,
  type WordsData,
} from "../frontend/src/engine/notificationText.ts";
import { clockText, nextWorkingDay, parseClock, plantNow, zonedMoment, type HoursCalendar } from "../frontend/src/engine/workingHoursCore.ts";

/** Expo's push service. */
export const EXPO_PUSH_BASE = "https://exp.host/--/api/v2/push";
/** Expo takes at most this many messages a request. */
export const SEND_BATCH = 100;
/** Expo answers at most this many receipts a request. */
export const RECEIPT_BATCH = 1000;
/** A ticket's receipt is read this long after its push. */
export const RECEIPT_AFTER_MS = 15 * 60 * 1000;
/** The pauses before trying a failed request again: three tries in all. */
export const RETRY_PAUSES_MS: readonly number[] = [2_000, 8_000];

const MAX_TITLE = 150;
const MAX_BODY = 600;

// ---------------------------------------------------------------------------
// the switch and the tokens

/** Whether this server pushes: anything but PUSH_ENABLED=0 (or off, false, no). */
export function pushEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.PUSH_ENABLED ?? "").trim().toLowerCase();
  return !(v === "0" || v === "off" || v === "false" || v === "no");
}

const TOKEN_RE = /^(Expo(?:nent)?PushToken)\[([^\]]*)\]$/;
const TOKEN_IN_TEXT = /Expo(?:nent)?PushToken\[[^\]]*\]/g;

/** A token as a log may name it: its kind and last four characters, "ExponentPushToken[…x9Qa]". */
export function maskToken(token: string): string {
  const m = TOKEN_RE.exec(token);
  const inner = m ? m[2] : token;
  return `${m ? m[1] : "token"}[…${inner.length > 8 ? inner.slice(-4) : ""}]`;
}

/** Text with every push token in it masked (Expo's messages quote the token). */
export function scrubTokens(text: string): string {
  return text.replace(TOKEN_IN_TEXT, (t) => maskToken(t));
}

// ---------------------------------------------------------------------------
// the plant's clock, as the planner reads it

export type PushSlot = "morning" | ReminderSlot;

/** The day's push times, plant time "HH:MM". */
export interface PushTimes {
  /** The first slot: the morning prepare (PREPARE_AT). */
  morning: string;
  /** The "still open" reminder. */
  reminder: string;
  /** The last call. */
  lastCall: string;
  /** The overdue reminder, once a day. */
  overdue: string;
}

export function pushTimes(env: Record<string, string | undefined> = process.env): PushTimes {
  return { morning: prepareAt(env), reminder: SLOT_TIMES.reminder, lastCall: SLOT_TIMES.lastCall, overdue: SLOT_TIMES.overdue };
}

export interface PushClock {
  /** The moment of this run. */
  now: Date;
  /** The plant's date and time, "YYYY-MM-DD" and "HH:MM". */
  date: string;
  time: string;
  /** Whether the staff may be pushed now: a working day of the plant, inside its hours. */
  staffWindow: boolean;
  /** The plant's next working day after today: a heads-up is pushed on the working day before its due date. */
  nextWorkingDay: string | null;
  /** The plant's midnight today, in milliseconds. */
  dayStart: number;
  times: PushTimes;
  /** When each slot of today begins, in milliseconds. */
  slotAt: Record<PushSlot, number>;
}

/** The plant's clock at `now`: its calendar and hours (Master Data), in its time zone. */
export function pushClock(now: Date, calendar: HoursCalendar | null, zone: string, times: PushTimes): PushClock {
  const state = plantNow(calendar, now, zone);
  const date = state.today.date;
  const at = (hhmm: string): number => zonedMoment(date, parseClock(hhmm) ?? 0, state.timeZone).getTime();
  return {
    now,
    date,
    time: clockText(Math.floor(state.secondOfDay / 60)),
    staffWindow: state.open,
    nextWorkingDay: nextWorkingDay(date, calendar)?.date ?? null,
    dayStart: zonedMoment(date, 0, state.timeZone).getTime(),
    times,
    slotAt: { morning: at(times.morning), reminder: at(times.reminder), lastCall: at(times.lastCall) },
  };
}

/** The latest of the day's three slots that has begun, or null before the first. */
export function currentSlot(time: string, times: PushTimes): PushSlot | null {
  let best: PushSlot | null = null;
  for (const s of ["morning", "reminder", "lastCall"] as const) if (time >= times[s] && (best === null || times[s] >= times[best])) best = s;
  return best;
}

// ---------------------------------------------------------------------------
// the planner

/** One message to one phone, as Expo takes it. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: { url: string; kind: string; notificationId?: number; recordId?: string; count: number };
  channelId: "tasks" | "summary";
  priority: "high" | "default";
  sound: "default";
  /** The person's open items (the app's badge). */
  badge?: number;
}

export interface PushPlanPerson extends PushPerson {
  /** The super admin: pushed at any hour. */
  boss: boolean;
}

export interface PushDecision {
  userId: string;
  /** The items this push stands for: written as pushed once Expo has it. */
  itemIds: number[];
  /** Why now: a slot of the day's tasks, the overdue reminder, or at once. */
  why: PushSlot | "overdue" | "at once";
  /** One per phone of the person, each in its language. */
  messages: PushMessage[];
}

const TASK_KINDS: readonly NotificationKind[] = ["ready", "needs_input", "due"];
const SUMMARY_KINDS: readonly NotificationKind[] = ["boss_summary", "upcoming"];
/** The order the names are listed in a push of several: what is most pressing first. */
const KIND_ORDER: Record<NotificationKind, number> = { sent_back: 0, overdue: 1, escalation: 2, verify: 3, needs_input: 4, ready: 5, due: 6, access_changed: 7, boss_summary: 8, upcoming: 9 };
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

const cut = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The facts a push may carry: never a send-back's reason (it is free text about the record's values). */
function pushFacts(data: WordsData): WordsData {
  const facts = { ...data };
  delete facts.reason;
  return facts;
}

/** What a person's phone may be pushed now, before the plant's hours are asked. */
function pushable(p: PushPerson, clock: PushClock): StoredNotification[] {
  const slot = currentSlot(clock.time, clock.times);
  let lastTask = 0;
  for (const k of TASK_KINDS) {
    const at = p.pushedToday[k];
    if (at) lastTask = Math.max(lastTask, Date.parse(at));
  }
  const tasksDue = slot !== null && lastTask < clock.slotAt[slot];
  const pushedToday = (n: StoredNotification): boolean => n.pushedAt !== null && Date.parse(n.pushedAt) >= clock.dayStart;
  return p.open.filter((n) => {
    if (p.prefs.kinds[n.kind] === false) return false;
    switch (n.kind) {
      case "ready":
      case "needs_input":
      case "due":
        return tasksDue;
      case "overdue":
        return clock.time >= clock.times.overdue && !pushedToday(n);
      case "upcoming":
        return slot !== null && n.pushedAt === null && typeof n.data.dueDate === "string" && clock.nextWorkingDay !== null && n.data.dueDate <= clock.nextWorkingDay;
      default:
        return n.pushedAt === null;
    }
  });
}

function pushWords(items: readonly StoredNotification[], lang: NotificationLanguage, reminder: ReminderSlot | null): NotificationWords {
  const list = items.map((n) => ({ kind: n.kind, data: pushFacts(n.data) }));
  let words = list.length === 1 ? notificationWords(list[0].kind, list[0].data, lang) : groupWords(list, lang);
  if (reminder) words = slotWords(reminder, words, lang);
  return { title: cut(words.title, MAX_TITLE), body: cut(words.body, MAX_BODY) };
}

/**
 * THE PLAN: for each person with a phone, at most one push now, or none. Pure: the same people and clock give the same
 * pushes. `held`: the staff whose pushes wait for the plant's hours.
 */
export function planPushes(people: readonly PushPlanPerson[], clock: PushClock): { decisions: PushDecision[]; held: number } {
  const decisions: PushDecision[] = [];
  let held = 0;
  const slot = currentSlot(clock.time, clock.times);
  for (const p of people) {
    if (p.devices.length === 0) continue;
    const items = pushable(p, clock);
    if (items.length === 0) continue;
    if (!p.boss && !clock.staffWindow) {
      held += 1;
      continue;
    }
    items.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id - b.id);
    const hasTask = items.some((n) => TASK_KINDS.includes(n.kind));
    const reminder: ReminderSlot | null = hasTask && slot !== null && slot !== "morning" ? slot : null;
    const one = items.length === 1 ? items[0] : null;
    const recordId = one && typeof one.data.recordId === "string" && one.data.recordId ? one.data.recordId : null;
    const data: PushMessage["data"] = {
      url: recordId ? `mitra://task/${encodeURIComponent(recordId)}` : "mitra://inbox",
      kind: one ? one.kind : "group",
      ...(one ? { notificationId: one.id } : {}),
      ...(recordId ? { recordId } : {}),
      count: items.length,
    };
    const summary = items.every((n) => SUMMARY_KINDS.includes(n.kind));
    decisions.push({
      userId: p.userId,
      itemIds: items.map((n) => n.id),
      why: hasTask && slot !== null ? slot : items.some((n) => n.kind === "overdue") ? "overdue" : "at once",
      messages: p.devices.map((d) => {
        const words = pushWords(items, d.language, reminder);
        return {
          to: d.token,
          title: words.title,
          body: words.body,
          data,
          channelId: summary ? "summary" : "tasks",
          priority: summary ? "default" : "high",
          sound: "default",
          badge: p.open.length,
        };
      }),
    });
  }
  return { decisions, held };
}

// ---------------------------------------------------------------------------
// the sender

export type PushTicket = { status: "ok"; id: string } | { status: "error"; message?: string; details?: { error?: string } };

/** One request to the push service: "send" with the messages, or "getReceipts" with { ids }. */
export type PushTransport = (path: "send" | "getReceipts", body: unknown) => Promise<{ status: number; body: unknown }>;

/** Expo's push service over HTTPS (or PUSH_SERVICE_URL's). */
export function expoTransport(opts: { base?: string; accessToken?: string; timeoutMs?: number } = {}): PushTransport {
  const base = (opts.base || EXPO_PUSH_BASE).replace(/\/+$/, "");
  return async (path, body) => {
    const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
    if (opts.accessToken) headers.authorization = `Bearer ${opts.accessToken}`;
    const res = await fetch(`${base}/${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed };
  };
}

function defaultTransport(env: Record<string, string | undefined>): PushTransport {
  return expoTransport({ base: env.PUSH_SERVICE_URL?.trim() || EXPO_PUSH_BASE, accessToken: env.EXPO_ACCESS_TOKEN?.trim() || undefined });
}

export interface SendDeps {
  transport: PushTransport;
  /** Waits between tries (a test's returns at once). */
  sleep?: (ms: number) => Promise<void>;
  /** Where the sender's lines go (the console by default): never a token. */
  log?: (line: string) => void;
  pauses?: readonly number[];
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const consoleLog = (line: string): void => console.log(line);

/** Expo's request-level errors, as a short line (scrubbed by the caller). */
function errorsOf(body: unknown): string {
  const errors = (body as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(errors)) return "";
  return errors
    .slice(0, 3)
    .map((e) => {
      const x = e as { code?: unknown; message?: unknown };
      return [typeof x.code === "string" ? x.code : "", typeof x.message === "string" ? x.message.slice(0, 200) : ""].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join("; ");
}

/** One request, tried again after a pause when it fails or the service is busy (429, 5xx); null when it never got through. */
async function withRetry(what: string, call: () => Promise<{ status: number; body: unknown }>, deps: SendDeps): Promise<{ status: number; body: unknown } | null> {
  const pauses = deps.pauses ?? RETRY_PAUSES_MS;
  const log = deps.log ?? consoleLog;
  for (let attempt = 0; ; attempt++) {
    let failure: string;
    try {
      const r = await call();
      if (r.status >= 200 && r.status < 300) return r;
      const errors = errorsOf(r.body);
      failure = `HTTP ${r.status}${errors ? ` (${errors})` : ""}`;
      if (r.status !== 429 && r.status < 500) {
        log(`[push] Expo's push service refused the ${what}: ${scrubTokens(failure)}`);
        return null;
      }
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    }
    if (attempt >= pauses.length) {
      log(`[push] the ${what} failed ${attempt + 1} times (${scrubTokens(failure)}); it is tried again on the next run`);
      return null;
    }
    await (deps.sleep ?? realSleep)(pauses[attempt]);
  }
}

/** Each message's ticket, in order; null for a message whose request never got through (it is tried on the next run). */
export async function sendMessages(messages: readonly PushMessage[], deps: SendDeps): Promise<(PushTicket | null)[]> {
  const out: (PushTicket | null)[] = [];
  for (let i = 0; i < messages.length; i += SEND_BATCH) {
    const batch = messages.slice(i, i + SEND_BATCH);
    const answer = await withRetry("push request", () => deps.transport("send", batch), deps);
    const data = (answer?.body as { data?: unknown } | null)?.data;
    if (answer && !Array.isArray(data)) (deps.log ?? consoleLog)(`[push] Expo's push service answered without tickets${errorsOf(answer.body) ? `: ${scrubTokens(errorsOf(answer.body))}` : ""}`);
    for (let j = 0; j < batch.length; j++) {
      const t = Array.isArray(data) ? (data[j] as PushTicket | undefined) : undefined;
      out.push(t && (t.status === "ok" || t.status === "error") ? t : null);
    }
  }
  return out;
}

/** "2 InvalidCredentials, 1 DeviceNotRegistered". */
const countsLine = (codes: Map<string, number>): string =>
  Array.from(codes)
    .map(([code, n]) => `${n} ${code}`)
    .join(", ");

/**
 * THE RECEIPTS of pushes sent more than RECEIPT_AFTER_MS before `now` (the real clock): a phone that is no longer
 * registered is forgotten; every receipt read is dropped (one not ready yet is asked for again next run; a day on, the
 * ledger's clean-up drops it).
 */
export async function readReceipts(ledger: NotificationLedger, deps: SendDeps & { now: Date }): Promise<{ read: number; unregistered: number }> {
  const due = await ledger.ticketsBefore(new Date(deps.now.getTime() - RECEIPT_AFTER_MS), RECEIPT_BATCH);
  if (due.length === 0) return { read: 0, unregistered: 0 };
  const answer = await withRetry("receipts request", () => deps.transport("getReceipts", { ids: due.map((t) => t.id) }), deps);
  const data = (answer?.body as { data?: unknown } | null)?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return { read: 0, unregistered: 0 };
  const done: string[] = [];
  const problems = new Map<string, number>();
  let unregistered = 0;
  for (const t of due) {
    const receipt = (data as Record<string, PushTicket | undefined>)[t.id];
    if (!receipt || typeof receipt !== "object") continue;
    done.push(t.id);
    if (receipt.status !== "error") continue;
    const code = (typeof receipt.details?.error === "string" && receipt.details.error) || "error";
    problems.set(code, (problems.get(code) ?? 0) + 1);
    if (code === "DeviceNotRegistered") {
      await ledger.forgetToken(t.token);
      unregistered += 1;
    }
  }
  await ledger.dropTickets(done);
  if (problems.size > 0) (deps.log ?? consoleLog)(`[push] receipts: ${countsLine(problems)}${unregistered ? `; ${unregistered} phone${unregistered === 1 ? "" : "s"} no longer registered, forgotten` : ""}`);
  return { read: done.length, unregistered };
}

// ---------------------------------------------------------------------------
// the run

export interface PushDeps extends Partial<SendDeps> {
  ledger?: NotificationLedger;
  /** Every account: who is active, and who the super admin is. */
  accounts?: () => Promise<{ id: string; role: string; active: boolean }[]>;
  /** The plant's calendar and hours (Master Data). */
  calendar?: () => Promise<HoursCalendar | null>;
  timeZone?: () => string;
  env?: Record<string, string | undefined>;
  /** The real clock, for the receipts (read about 15 minutes after their push, whatever moment the run is for). */
  clock?: () => Date;
}

export interface PushRunResult {
  /** People pushed (Expo took their push). */
  people: number;
  /** Phones Expo accepted a push for. */
  phones: number;
  /** People whose push did not get through: tried again on the next run. */
  failed: number;
  /** Staff whose pushes wait for the plant's hours. */
  held: number;
  /** Phones forgotten: no longer registered. */
  unregistered: number;
  /** Receipts read. */
  receipts: number;
}

let gate: ReturnType<typeof createWorkingHoursGate> | null = null;
const defaultCalendar = (): Promise<HoursCalendar | null> => (gate ??= createWorkingHoursGate({ enforced: true })).calendar();
const defaultAccounts = async (): Promise<{ id: string; role: string; active: boolean }[]> => jobAccounts(await listUsers());

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/**
 * THE PUSHES OF ONE NOTIFY RUN at `now` (the run's moment: the plant's clock is read at it). Answers a line for the
 * job's outcome, starting "nothing" or "pushes off" when nothing was sent.
 */
export async function runPushes(now: Date, deps: PushDeps = {}): Promise<{ outcome: string; result: PushRunResult }> {
  const result: PushRunResult = { people: 0, phones: 0, failed: 0, held: 0, unregistered: 0, receipts: 0 };
  const env = deps.env ?? process.env;
  if (!pushEnabled(env)) return { outcome: "pushes off (PUSH_ENABLED=0)", result };
  const ledger = deps.ledger ?? databaseLedger();
  const log = deps.log ?? consoleLog;
  const send: SendDeps = { transport: deps.transport ?? defaultTransport(env), log, ...(deps.sleep ? { sleep: deps.sleep } : {}), ...(deps.pauses ? { pauses: deps.pauses } : {}) };

  try {
    const r = await readReceipts(ledger, { ...send, now: (deps.clock ?? (() => new Date()))() });
    result.receipts = r.read;
    result.unregistered += r.unregistered;
  } catch (err) {
    log(`[push] the receipts could not be read: ${scrubTokens(err instanceof Error ? err.message : String(err))}`);
  }

  const clock = pushClock(now, await (deps.calendar ?? defaultCalendar)(), (deps.timeZone ?? plantTimeZone)(), pushTimes(env));
  const people = await ledger.pushPeople(new Date(clock.dayStart));
  if (people.length === 0) return { outcome: "nothing to push: no phone is registered", result };
  const accounts = new Map((await (deps.accounts ?? defaultAccounts)()).map((a) => [a.id, a] as const));
  const planned: PushPlanPerson[] = [];
  for (const p of people) {
    const account = accounts.get(p.userId);
    if (account && account.active) planned.push({ ...p, boss: account.role === "admin" });
  }
  const { decisions, held } = planPushes(planned, clock);
  result.held = held;
  const waiting = held > 0 ? `; ${plural(held, "person's push", "people's pushes")} ${held === 1 ? "waits" : "wait"} for the plant's hours` : "";
  if (decisions.length === 0) return { outcome: `nothing to push${waiting}`, result };

  const flat = decisions.flatMap((d) => d.messages.map((m) => ({ d, m })));
  const tickets = await sendMessages(
    flat.map((x) => x.m),
    send
  );
  const reached = new Set<PushDecision>();
  const okTickets: { id: string; token: string }[] = [];
  const problems = new Map<string, number>();
  for (let i = 0; i < flat.length; i++) {
    const t = tickets[i];
    if (!t) continue;
    reached.add(flat[i].d);
    if (t.status === "ok") {
      okTickets.push({ id: t.id, token: flat[i].m.to });
      continue;
    }
    const code = (typeof t.details?.error === "string" && t.details.error) || "error";
    problems.set(code, (problems.get(code) ?? 0) + 1);
    if (code === "DeviceNotRegistered") {
      await ledger.forgetToken(flat[i].m.to);
      result.unregistered += 1;
    }
  }
  await ledger.markPushed(
    decisions.filter((d) => reached.has(d)).flatMap((d) => d.itemIds),
    now
  );
  await ledger.addTickets(okTickets);
  result.people = reached.size;
  result.phones = okTickets.length;
  result.failed = decisions.length - reached.size;
  if (problems.size > 0) log(`[push] tickets: ${countsLine(problems)}`);
  const parts: string[] = [];
  if (result.people > 0) parts.push(`pushed ${plural(result.people, "person", "people")} (${plural(result.phones, "phone")} accepted)`);
  if (result.failed > 0) parts.push(`${plural(result.failed, "person", "people")} not reached, tried again on the next run`);
  if (problems.size > 0) parts.push(`Expo said ${countsLine(problems)}`);
  return { outcome: `${parts.join("; ")}${waiting}`, result };
}

// ---------------------------------------------------------------------------
// "Send me a test notification"

export interface TestPushResult {
  sent: number;
  /** Why nothing was sent, in plain words. */
  reason?: string;
}

const TEST_REASONS: Record<string, string> = {
  DeviceNotRegistered: "This phone is no longer registered for notifications. Open Mitra on it again to register it.",
  InvalidCredentials: "The push credentials are not set up yet (Firebase, for Android phones). See DEPLOYMENT.md, Push notifications.",
  MismatchSenderId: "The app on this phone was built with other Firebase settings than the ones given to Expo.",
  MessageRateExceeded: "Too many notifications went to this phone just now. Try again in a minute.",
  MessageTooBig: "The test notification was too big to send.",
};

/** Sends the test notification to every phone of the person, each in its language. */
export async function sendTestPush(userId: string, deps: PushDeps = {}): Promise<TestPushResult> {
  const env = deps.env ?? process.env;
  if (!pushEnabled(env)) return { sent: 0, reason: "Push notifications are switched off on this DCRS server." };
  const ledger = deps.ledger ?? databaseLedger();
  const devices = await ledger.devicesOf(userId);
  if (devices.length === 0) return { sent: 0, reason: "No phone is registered for notifications on this account yet." };
  const send: SendDeps = { transport: deps.transport ?? defaultTransport(env), log: deps.log ?? consoleLog, ...(deps.sleep ? { sleep: deps.sleep } : {}), ...(deps.pauses ? { pauses: deps.pauses } : {}) };
  const messages: PushMessage[] = devices.map((d) => {
    const words = testWords(d.language);
    return { to: d.token, title: words.title, body: words.body, data: { url: "mitra://inbox", kind: "test", count: 0 }, channelId: "tasks", priority: "high", sound: "default" };
  });
  const tickets = await sendMessages(messages, send);
  const ok: { id: string; token: string }[] = [];
  let firstProblem = "";
  for (let i = 0; i < messages.length; i++) {
    const t = tickets[i];
    if (t?.status === "ok") ok.push({ id: t.id, token: messages[i].to });
    else if (t?.status === "error") {
      const code = (typeof t.details?.error === "string" && t.details.error) || "error";
      firstProblem ||= code;
      if (code === "DeviceNotRegistered") await ledger.forgetToken(messages[i].to);
    }
  }
  await ledger.addTickets(ok);
  if (ok.length > 0) return { sent: ok.length };
  if (!firstProblem) return { sent: 0, reason: "Expo's push service could not be reached just now. Try again in a minute." };
  return { sent: 0, reason: TEST_REASONS[firstProblem] ?? "Expo's push service did not accept the test notification." };
}
