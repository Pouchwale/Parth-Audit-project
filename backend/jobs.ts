// THE SERVER'S OWN SCHEDULE (REQUIREMENTS §75): the jobs that run on the
// plant's clock whether or not anybody has the app open — the daily escalation
// to the super admin and the weekly digest (backend/escalation.ts).
//
// ONE MINUTE AT A TIME. A timer looks at the plant's date and time once a
// minute (PLANT_TIMEZONE, db.ts plantTimeZone — never this machine's own
// clock, which on a hosted server is usually UTC). A job whose time has passed
// today runs ONCE for its period, and catches up: a server that was down at
// 10:00 and starts at 14:00 runs the day's escalation at 14:00.
//
//   escalation     every working day, at ESCALATION_AT (default 10:00);
//                  its period is the day, "2026-09-24"
//   weekly-digest  the first working day of each ISO week, at DIGEST_AT
//                  (default 09:00) — or the first working day after it that
//                  the server is up; its period is the week it digests,
//                  "2026-W38"
//
// Working days come from the master data the app stores (the weekly off, the
// festival holidays, the adjustment days — engine/latenessCore.ts
// plantClosedDays, which holds to engine/holidays.ts).
//
// CLAIMED IN POSTGRESQL, so a period runs once however many servers share the
// database (the test runner starts two) and however often one restarts: a run
// first inserts (job, period) into job_runs — INSERT ... ON CONFLICT DO NOTHING
// — and only the server whose insert went in does the work. When the run ends
// its outcome is written on that row. A run that FAILS writes its outcome too,
// and then gives the period back: its row is renamed "<period> failed <when>",
// kept as the record of the failure, and the period is free to be claimed
// again — by this server after RETRY_AFTER_MS, or by another sooner. A claim
// whose server stopped before finishing is given back the same way after half
// an hour. A run that WORKED but whose outcome could not be written (the
// database answered the work and then not the UPDATE) is not a failure: giving
// the period back would run it twice — a second digest line, a second email —
// so the outcome is kept and written on the next minute instead.
//
// A RUN BY HAND IS THE PERIOD'S RUN (runJobByHand). The super admin can run
// either job at once (POST /api/jobs/run, backend/escalationRoutes.ts); for the
// plant's today it claims the period exactly as the timer would, so the
// schedule does not run it again — the weekly digest made by hand on Monday at
// 08:30 is Monday's digest, not a first of two. Asked for again once the period
// is claimed, it still runs (it was asked for), claiming nothing. A day of the
// caller's own (a suite's) is not the schedule's, and claims nothing either.
//
// OFF WITH JOBS=0. The Playwright suites run on the real clock and count
// activity-log lines, so scripts/run-e2e.ts starts its servers with JOBS=0; a
// suite that wants a job runs it by hand (POST /api/jobs/run,
// backend/escalationRoutes.ts), which is also how an administrator asks for one now.
import { database } from "./db.ts";
import { isoWeek, mondayOf, plantClock, plantClosedOn, runEscalation, runWeeklyDigest } from "./escalation.ts";
import { addDaysISO } from "../frontend/src/engine/latenessCore.ts";

export type JobName = "escalation" | "weekly-digest";
export const JOB_NAMES: readonly JobName[] = ["escalation", "weekly-digest"];

const TICK_MS = 60 * 1000;
const RETRY_AFTER_MS = 15 * 60 * 1000;
const ABANDONED_AFTER = "30 minutes";
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "HH:MM" from the environment, or the default when unset or not a time of day. */
function timeOf(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  if (TIME_RE.test(v)) return v;
  console.warn(`[jobs] ${name}="${v}" is not a time of day like 10:00; using ${fallback}.`);
  return fallback;
}

interface JobSpec {
  name: JobName;
  at: string;
  /** The period this job would run for on `date` — before anything is read. */
  period(date: string): string;
  /** Whether it is due at `date` `time`, the plant's closed days given. */
  due(date: string, time: string, closed: (d: string) => boolean): boolean;
}

function jobSpecs(): JobSpec[] {
  const escalationAt = timeOf("ESCALATION_AT", "10:00");
  const digestAt = timeOf("DIGEST_AT", "09:00");
  return [
    {
      name: "escalation",
      at: escalationAt,
      period: (date) => date,
      due: (date, time, closed) => time >= escalationAt && !closed(date),
    },
    {
      name: "weekly-digest",
      at: digestAt,
      period: (date) => isoWeek(addDaysISO(mondayOf(date), -7)),
      due: (date, time, closed) => {
        if (closed(date)) return false;
        // The week's first working day, at DIGEST_AT; any later working day of the
        // same week catches up a digest the server was not up to make.
        let first = mondayOf(date);
        for (let i = 0; i < 6 && closed(first); i++) first = addDaysISO(first, 1);
        return date > first || (date === first && time >= digestAt);
      },
    },
  ];
}

/** Runs one job for one day, whatever the clock says, and says how it went in a line. */
export async function runJob(job: JobName, today: string): Promise<{ outcome: string; result: unknown }> {
  if (job === "escalation") {
    const result = await runEscalation(today);
    return { outcome: result.outcome, result };
  }
  const result = await runWeeklyDigest(today);
  return { outcome: result.outcome, result };
}

/** Takes the period for this server, or says another has it. */
async function claim(job: JobName, period: string): Promise<boolean> {
  const pool = database();
  // A claim left by a server that stopped mid-run is given back first.
  await pool.query(
    `UPDATE job_runs SET period = period || ' abandoned ' || to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS'), finished_at = now(),
            outcome = 'abandoned: the server that claimed it stopped before it finished'
      WHERE job = $1 AND period = $2 AND finished_at IS NULL AND claimed_at < now() - interval '${ABANDONED_AFTER}'`,
    [job, period]
  );
  const { rowCount } = await pool.query("INSERT INTO job_runs (job, period) VALUES ($1, $2) ON CONFLICT DO NOTHING", [job, period]);
  return (rowCount ?? 0) > 0;
}

async function finish(job: JobName, period: string, outcome: string): Promise<void> {
  await database().query("UPDATE job_runs SET finished_at = now(), outcome = $3 WHERE job = $1 AND period = $2", [job, period, outcome.slice(0, 2000)]);
}

/** Writes the failure down and frees the period, so the run is tried again. */
async function giveBack(job: JobName, period: string, error: string): Promise<void> {
  await database().query(
    `UPDATE job_runs SET period = period || ' failed ' || to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS'), finished_at = now(), outcome = $3
      WHERE job = $1 AND period = $2`,
    [job, period, `failed: ${error}`.slice(0, 2000)]
  );
}

// What this server already knows is settled, so a quiet minute asks the
// database nothing: a period claimed (by it or another server), and when a
// failed run may be tried again.
const settled = new Set<string>();
const retryAt = new Map<string, number>();
// Runs that worked but whose outcome is not written yet, by "job|period".
const unrecorded = new Map<string, { job: JobName; period: string; outcome: string }>();

/**
 * WRITES A FINISHED RUN'S OUTCOME — and a failure to write it is not the job's
 * failure. The run is done; were its period given back, it would run again.
 * The outcome is kept and written on the next minute (writeUnrecorded), well
 * inside the half hour after which an unfinished claim counts as abandoned.
 */
async function record(job: JobName, period: string, outcome: string): Promise<void> {
  const key = `${job}|${period}`;
  try {
    await finish(job, period, outcome);
    unrecorded.delete(key);
  } catch (err) {
    unrecorded.set(key, { job, period, outcome });
    console.error(`[jobs] ${job} ${period} ran, but its outcome could not be written yet (tried again next minute): ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function writeUnrecorded(): Promise<void> {
  for (const { job, period, outcome } of Array.from(unrecorded.values())) await record(job, period, outcome);
}

/**
 * THE SUPER ADMIN'S "RUN IT NOW" (POST /api/jobs/run). For the plant's today it
 * claims the period the schedule would run it for, runs it, and writes its
 * outcome — the schedule then leaves that period alone. Already claimed (the
 * schedule ran it, or an earlier hand run), or for a day of the caller's own,
 * it runs unclaimed. `claimed` is the period it was the run for, or null.
 */
export async function runJobByHand(job: JobName, today: string, by: string): Promise<{ outcome: string; result: unknown; claimed: string | null }> {
  const spec = jobSpecs().find((s) => s.name === job);
  const period = spec && today === plantClock().date ? spec.period(today) : null;
  const claimed = period !== null && (await claim(job, period)) ? period : null;
  if (claimed === null) return { ...(await runJob(job, today)), claimed };
  settled.add(`${job}|${claimed}`);
  let ran: { outcome: string; result: unknown };
  try {
    ran = await runJob(job, today);
  } catch (err) {
    // Failed: written down, and the period is free for the schedule to try.
    settled.delete(`${job}|${claimed}`);
    await giveBack(job, claimed, err instanceof Error ? err.message : String(err)).catch((e) => console.error("[jobs] could not record the failure:", e instanceof Error ? e.message : e));
    throw err;
  }
  await record(job, claimed, `by hand (${by}): ${ran.outcome}`);
  return { ...ran, claimed };
}

// The plant's closed days, read from the stored master data at most every ten
// minutes — a working day's minutes after the hour ask the database nothing.
const CALENDAR_TTL_MS = 10 * 60 * 1000;
let calendarCache: { at: number; closed: (d: string) => boolean } | null = null;
async function plantCalendar(nowMs: number): Promise<(d: string) => boolean> {
  if (!calendarCache || nowMs - calendarCache.at > CALENDAR_TTL_MS) calendarCache = { at: nowMs, closed: await plantClosedOn() };
  return calendarCache.closed;
}

async function tick(now: Date, specs: readonly JobSpec[]): Promise<void> {
  if (unrecorded.size > 0) await writeUnrecorded();
  const { date, time } = plantClock(now);
  let closed: ((d: string) => boolean) | null = null;
  for (const job of specs) {
    const period = job.period(date);
    const key = `${job.name}|${period}`;
    if (settled.has(key) || (retryAt.get(key) ?? 0) > now.getTime()) continue;
    // Nothing is read from the database before the job's hour: the escalation's
    // own time decides first, and only then the plant's calendar.
    if (job.name === "escalation" && time < job.at) continue;
    closed ??= await plantCalendar(now.getTime());
    if (!job.due(date, time, closed)) continue;
    if (!(await claim(job.name, period))) {
      // Another server has it. Finished: settled. Still running: looked at again
      // later, when a claim abandoned by a stopped server can be given back.
      const { rows } = await database().query<{ done: boolean }>("SELECT finished_at IS NOT NULL AS done FROM job_runs WHERE job = $1 AND period = $2", [job.name, period]);
      if (rows[0]?.done === true) settled.add(key);
      else if (rows[0]) retryAt.set(key, now.getTime() + RETRY_AFTER_MS);
      continue;
    }
    settled.add(key);
    let outcome: string;
    try {
      ({ outcome } = await runJob(job.name, date));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[jobs] ${job.name} ${period} failed: ${message}`);
      settled.delete(key);
      retryAt.set(key, now.getTime() + RETRY_AFTER_MS);
      await giveBack(job.name, period, message).catch((e) => console.error("[jobs] could not record the failure:", e instanceof Error ? e.message : e));
      continue;
    }
    // The job is done whatever happens next: its outcome not written is not a failure of the job (record).
    await record(job.name, period, outcome);
    console.log(`[jobs] ${job.name} ${period}: ${outcome}`);
  }
}

/** One look at the clock, exactly as the timer takes it — for a check that hands it a moment of its own. */
export async function runDueJobs(now: Date = new Date()): Promise<void> {
  await tick(now, jobSpecs());
}

let started = false;

/**
 * Starts the minute timer — called once the server is listening. JOBS=0 leaves
 * it off (the test runner's servers). The timer never keeps the process alive
 * (unref), and one minute's work never overlaps the next.
 */
export function startJobs(): void {
  if (started) return;
  if (process.env.JOBS === "0") {
    console.log("Scheduled jobs are off (JOBS=0): no escalation or weekly digest runs by itself.");
    return;
  }
  started = true;
  const specs = jobSpecs();
  let busy = false;
  const run = () => {
    if (busy) return;
    busy = true;
    tick(new Date(), specs)
      .catch((err) => console.error("[jobs]", err instanceof Error ? err.message : err))
      .finally(() => {
        busy = false;
      });
  };
  setInterval(run, TICK_MS).unref();
  // The first look a few seconds after start, not a minute: a server started after its hour catches up at once.
  setTimeout(run, 5000).unref();
  console.log(`Scheduled jobs on (plant time): ${specs.map((s) => `${s.name} at ${s.at}`).join(", ")}.`);
}
