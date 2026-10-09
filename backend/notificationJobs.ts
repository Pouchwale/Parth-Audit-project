// THE MORNING PREPARE AND THE NOTIFY JOB (REQUIREMENTS §97): the work of two of the server's jobs (backend/jobs.ts
// decides when they run; the super admin can run either by hand, POST /api/jobs/run).
//
//   morning-prepare  every working day at PREPARE_AT (08:30 plant time unless set), or at the first minute the server is
//                    up after it: DCRS's own engine (backend/engineHost.ts, op "prepare") makes the near-term sheets of
//                    every Live document and prepares every blank sheet due by today by the one rule the browser runs
//                    (engine/assistantPrepare.ts: the known parts only, never a reading), even if nobody opens the
//                    website. Written with the version it was worked out on (again on what is stored, when a browser
//                    saved meanwhile). One line in the activity log names the modules. Run again, it prepares nothing.
//   notify           every NOTIFY_EVERY_MS (5 minutes) from PREPARE_AT to the close of hours on working days: the
//                    engine works out every active account's notifications in one load (op "notifications",
//                    engine/notificationPlan.ts); they are upserted into the ledger by key and the ones whose record
//                    moved on are resolved (backend/notifications.ts); the super admin's open escalations are mirrored
//                    as notifications; then the pushes (backend/push.ts).
//
// AS THE SYSTEM. Both run over every department, in nobody's name: the activity log says "System".
import { insertActivity, listUsers, type ActivityInput, type UserRow } from "./db.ts";
import { sharedEngineHost, type ActivityLine, type EngineCaller, type EngineHost } from "./engineHost.ts";
import { databaseLedger, type LedgerItem, type NotificationLedger } from "./notifications.ts";
import { PLANNED_KINDS } from "../frontend/src/engine/notificationPlan.ts";
import { MODULE_NAMES } from "../frontend/src/engine/notificationText.ts";

/** The engine's caller for the server's own jobs: every department, nobody's name. */
export const SYSTEM_CALLER: EngineCaller = { userId: "system", userName: "The assistant", email: "system", departments: null, client: "DCRS server", role: "admin" };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "HH:MM" from the environment, or the default. */
export function timeSetting(name: string, fallback: string, env: Record<string, string | undefined> = process.env): string {
  const v = env[name]?.trim();
  if (!v) return fallback;
  if (TIME_RE.test(v)) return v;
  console.warn(`[jobs] ${name}="${v}" is not a time of day like 08:30; using ${fallback}.`);
  return fallback;
}

/** When the morning prepare runs, plant time (PREPARE_AT, 08:30). */
export const prepareAt = (env: Record<string, string | undefined> = process.env): string => timeSetting("PREPARE_AT", "08:30", env);

/** How often the notify job runs (NOTIFY_EVERY_MS, 5 minutes; at least 10 seconds, though the jobs' clock looks once a minute). */
export function notifyEveryMs(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.NOTIFY_EVERY_MS);
  return Number.isFinite(n) && n >= 10_000 ? n : 5 * 60 * 1000;
}

/** The push slots of the plant's day (REQUIREMENTS §97): the "still open" reminder, the last call (and the evening summary), the overdue reminder. */
export const SLOT_TIMES = { reminder: "15:30", lastCall: "17:45", overdue: "09:30" } as const;

/** An account as the jobs hand it to the engine: never the password. */
export interface JobAccount {
  id: string;
  name: string;
  email: string;
  role: string;
  departments: string[];
  active: boolean;
}

export function jobAccounts(rows: readonly UserRow[]): JobAccount[] {
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    departments: String(u.departments ?? "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
    active: u.active !== false,
  }));
}

/** One of the super admin's open escalations, as backend/escalation.ts keeps it (the fields the notification needs). */
export interface OpenEscalation {
  id: string;
  subjectName: string;
  department: string;
  late: number;
  neverDone: number;
}

export interface JobDeps {
  engine?: EngineHost;
  ledger?: NotificationLedger;
  /** Every account (the active ones are told). */
  accounts?: () => Promise<JobAccount[]>;
  /** The super admin's escalations not yet acknowledged. */
  escalations?: () => Promise<OpenEscalation[]>;
  /** Writes activity-log lines (the database's, by default). */
  activity?: (lines: ActivityInput[]) => Promise<void>;
  /** The pushes after the ledger is up to date (backend/push.ts); none: nothing is pushed. */
  push?: (now: Date) => Promise<{ outcome: string }>;
}

const defaultAccounts = async (): Promise<JobAccount[]> => jobAccounts(await listUsers());
const defaultEscalations = async (): Promise<OpenEscalation[]> => {
  const { listEscalations } = await import("./escalation.ts");
  return (await listEscalations(true)).map((e) => ({ id: e.id, subjectName: e.subjectName, department: e.department, late: e.late, neverDone: e.neverDone }));
};

const moduleWords = (code: string | null): string => (code ? (MODULE_NAMES[code]?.en ?? code) : "no module");

/** A line of the activity log in the system's name. */
const systemLine = (action: string, target: string, detail: string, department = ""): ActivityInput => ({ userId: null, userName: "System", userEmail: "", action, target, detail, department });

export interface PrepareResult {
  date: string;
  prepared: number;
  sheetsMade: number;
  modules: { module: string | null; count: number }[];
  records: { recordId: string; documentId: string; dueDate: string; status: string }[];
}

/**
 * THE MORNING PREPARE. `now`: a moment of the caller's own (a run by hand for another day, a test): the engine answers
 * at it. Left out, the engine's real clock.
 */
export async function runMorningPrepare(opts: { now?: Date } = {}, deps: JobDeps = {}): Promise<{ outcome: string; result: PrepareResult }> {
  const engine = deps.engine ?? sharedEngineHost();
  const activity = deps.activity ?? insertActivity;
  const lines: ActivityLine[] = [];
  const answer = await engine.change(SYSTEM_CALLER, "prepare", {}, (l) => lines.push(l), opts.now ? { now: opts.now } : {});
  if (answer.status !== 200) {
    const body = answer.body as { error?: string } | null;
    throw new Error(`the engine did not prepare the records (${answer.status}): ${body?.error ?? "no reason given"}`);
  }
  const result = answer.body as PrepareResult;
  const out: ActivityInput[] = lines.map((l) => systemLine(l.action.slice(0, 80), l.target.slice(0, 240), l.detail.slice(0, 600)));
  if (result.prepared > 0) {
    const modules = result.modules.map((m) => `${moduleWords(m.module)} ${m.count}`).join(", ");
    out.push(
      systemLine(
        "Records prepared by the assistant",
        `The assistant prepared ${result.prepared} record${result.prepared === 1 ? "" : "s"}`,
        `${modules}. The known parts only; the readings are for the people who answer for them (the morning prepare, ${result.date}).`.slice(0, 600)
      )
    );
  }
  if (out.length > 0) await activity(out);
  const outcome =
    result.prepared > 0
      ? `prepared ${result.prepared} record${result.prepared === 1 ? "" : "s"} (${result.modules.map((m) => `${m.module ?? "-"} ${m.count}`).join(", ")}); ${result.sheetsMade} more sheet${result.sheetsMade === 1 ? "" : "s"} made`
      : result.sheetsMade > 0
        ? `nothing to prepare; ${result.sheetsMade} sheet${result.sheetsMade === 1 ? "" : "s"} made`
        : "nothing to prepare";
  return { outcome, result };
}

export interface NotifyResult {
  date: string;
  time: string;
  planned: number;
  written: number;
  resolved: number;
  escalations: number;
  cleaned: number;
  push: string;
}

let cleanedOn = "";

/**
 * THE NOTIFY JOB. `now`, when given, is the moment to work out the notifications at (a run by hand for a day of the
 * caller's own, a test); left out, the engine's real clock. The pushes are given the same moment.
 */
export async function runNotify(opts: { now?: Date } = {}, deps: JobDeps = {}): Promise<{ outcome: string; result: NotifyResult }> {
  const engine = deps.engine ?? sharedEngineHost();
  const ledger = deps.ledger ?? databaseLedger();
  const accounts = (await (deps.accounts ?? defaultAccounts)()).filter((a) => a.active);
  const answer = await engine.read(
    SYSTEM_CALLER,
    "notifications",
    { accounts, summaryTimes: { morning: prepareAt(), evening: SLOT_TIMES.lastCall } },
    opts.now ? { now: opts.now } : {}
  );
  if (answer.status !== 200) {
    const body = answer.body as { error?: string } | null;
    throw new Error(`the engine did not work out the notifications (${answer.status}): ${body?.error ?? "no reason given"}`);
  }
  const plan = answer.body as { date: string; time: string; users: string[]; items: LedgerItem[] };
  const synced = await ledger.sync(plan.items, { kinds: PLANNED_KINDS, users: plan.users });

  // The super admin's escalations (backend/escalation.ts), mirrored until each is acknowledged.
  const bosses = accounts.filter((a) => a.role === "admin").map((a) => a.id);
  const open = await (deps.escalations ?? defaultEscalations)();
  const mirrored: LedgerItem[] = bosses.flatMap((userId) =>
    open.map((e) => ({
      userId,
      kind: "escalation" as const,
      key: `escalation|${e.id}`,
      priority: "high" as const,
      data: { subject: e.subjectName, ...(e.department ? { module: e.department } : {}), late: e.late, neverDone: e.neverDone },
    }))
  );
  const escalated = await ledger.sync(mirrored, { kinds: ["escalation"], users: bosses });

  // Once a day: what was resolved more than 60 days ago goes.
  let cleaned = 0;
  if (cleanedOn !== plan.date) {
    cleaned = await ledger.cleanUp(opts.now ?? new Date());
    cleanedOn = plan.date;
  }

  const push = deps.push ? (await deps.push(opts.now ?? new Date())).outcome : "pushes off";
  const result: NotifyResult = {
    date: plan.date,
    time: plan.time,
    planned: plan.items.length,
    written: synced.written + escalated.written,
    resolved: synced.resolved + escalated.resolved,
    escalations: open.length,
    cleaned,
    push,
  };
  return {
    outcome: `${result.planned} notification${result.planned === 1 ? "" : "s"} for ${plan.users.length} people; ${result.written} new or changed, ${result.resolved} resolved; ${push}`,
    result,
  };
}
