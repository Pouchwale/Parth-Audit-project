// THE ACTIVITY LOG, KEPT FOREVER — ARCHIVED ONLY ON PURPOSE (REQUIREMENTS §62, §75).
//
// §62 promises that a line of the log is never changed and never removed. The
// log is the evidence trail for records the plant keeps for years, so it has to
// outlive them; at a few thousand lines a day it costs about half a gigabyte a
// year, which a plant can afford for ever. So NOTHING HERE REMOVES ANYTHING ON
// ITS OWN: no purge, no timer, no "keep the last N". This file adds three things.
//
//   1. THE RULE, IN THE DATABASE. "Nothing updates or deletes a line" used to be
//      true only because no code happened to do it. A trigger now refuses
//      UPDATE, DELETE and TRUNCATE on activity_log, whatever sends them: a bug,
//      a script, a hand at a SQL prompt. (It stops accidents, not the owner of
//      the database, who can switch a trigger off or drop a table: a rule kept
//      in the data cannot guard against the person who owns the data.)
//
//   2. AN ARCHIVE, MOVED TO ONLY BY THE SUPER ADMIN, AND ONLY WHEN THEY CHOOSE.
//      Lines older than a few years — 3 unless ACTIVITY_ARCHIVE_AFTER_YEARS says
//      otherwise; the page offers 1 to 10 — can be moved into
//      activity_log_archive: the SAME database (§55), the same columns, the same
//      ids, and who moved them and when. The admin first sees how many lines
//      that is and the days they run from and to. One transaction moves them
//      and writes the line that says so ("Activity log archived": how many,
//      before which day, by whom), so either both happen or neither does. The
//      trigger lets exactly one DELETE through: that one, in that transaction,
//      which says so by setting dcrs.archiving. The archive itself refuses
//      UPDATE, DELETE and TRUNCATE always. Archived lines stay searchable: the
//      admin ticks "Include archived lines" and the list and the tally read
//      both tables, with the same filters, paging and search (db.ts activityWhere).
//
//   3. A TALLY THAT STAYS QUICK HOWEVER LONG THE LOG GROWS. The per-person
//      tally beside the log and the Performance Scorecard (§73) is counted over
//      every line of the span. Measured on a throwaway copy with a million lines
//      (24-Sep-2026), "Everything" took 2 to 9 seconds: PostgreSQL sorted every
//      line, on disk, to count each person's days. So each CLOSED day is now
//      counted once, into activity_daily (one row per day, person, department
//      and action), and a tally reads those rows plus the last two days' lines
//      as they stand: on a plant-shaped million lines, 0.2 to 0.6 s. The counts
//      are the same, to the line; only the reading is shorter. A search still
//      reads the lines themselves — the words are not in the day rows. The day
//      rows are a copy made FROM the log, never a replacement for it: they are
//      checked against the lines before each day is added, and thrown away and
//      made again whenever they disagree or the plant's time zone changes.
//      (`DELETE FROM activity_daily_state;` makes them be counted again by hand.)
//
// Loaded by index.ts (through archiveRoutes.ts) when the server starts, and it
// hands its tables to db.ts's registerSchema at that moment, so they are made
// with the others, under the same lock, every time the database is opened.
// This module imports db.ts, never the other way round (db.ts reaches the
// tally below with a dynamic import when it is first asked for one), so db.ts
// is always loaded first and everything read from it here already exists.
import type { PoolClient } from "pg";
import {
  ACTIVITY_SEARCH_TEXT,
  activityWhere,
  database,
  plantTimeZone,
  registerSchema,
  transaction,
  withClient,
  type ActivityFilter,
  type ActivityLine,
  type ActivityTally,
} from "./db.ts";

// Advisory lock ids already in use: 4711 insertUser, 4712 writeItem, 4713 the
// schema step (db.ts). This one is held while the day rows are made or
// relabelled, so a tally being brought up to date and an archive being moved
// can never interleave (two servers can share one database).
const DAILY_LOCK = 4720;

registerSchema(`
  -- THE ARCHIVE (REQUIREMENTS §62, §75): activity_log's columns, the same id
  -- the line had in the log (so a line keeps one id for ever, and the log and
  -- its archive can be read together in one order), and who moved it and when.
  CREATE TABLE IF NOT EXISTS activity_log_archive (
    id BIGINT PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL,
    user_id TEXT,
    user_name TEXT NOT NULL DEFAULT '',
    user_email TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The super admin who moved it, as "Name <email>".
    archived_by TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS activity_log_archive_at_idx ON activity_log_archive (at);
  CREATE INDEX IF NOT EXISTS activity_log_archive_user_at_idx ON activity_log_archive (user_id, at);
  CREATE INDEX IF NOT EXISTS activity_log_archive_department_at_idx ON activity_log_archive (department, at);

  -- THE DAY ROWS the tally is read from: every closed day of the log and its
  -- archive, counted once. \`archived\` says which table the lines were in, so
  -- a tally of the log alone leaves out what has been moved.
  CREATE TABLE IF NOT EXISTS activity_daily (
    day DATE NOT NULL,
    archived BOOLEAN NOT NULL,
    user_id TEXT,
    user_name TEXT NOT NULL,
    department TEXT NOT NULL,
    action TEXT NOT NULL,
    n INTEGER NOT NULL,
    first_at TIMESTAMPTZ NOT NULL,
    last_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS activity_daily_day_idx ON activity_daily (day);
  -- One person's rows, and a department's, as the log itself is indexed.
  CREATE INDEX IF NOT EXISTS activity_daily_user_day_idx ON activity_daily (user_id, day);
  CREATE INDEX IF NOT EXISTS activity_daily_department_day_idx ON activity_daily (department, day);
  -- One row: every day up to and including \`through\` is in activity_daily,
  -- counted in the time zone \`time_zone\` (a day is a date in the plant's zone).
  CREATE TABLE IF NOT EXISTS activity_daily_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    through DATE,
    time_zone TEXT NOT NULL DEFAULT ''
  );

  -- APPEND-ONLY, AS A RULE OF THE DATABASE (REQUIREMENTS §62). Checked once per
  -- statement, not once per line, so it costs nothing however many lines a
  -- statement touches. The one DELETE it lets through is the archive's own,
  -- which sets dcrs.archiving for its transaction alone (SET LOCAL). UPDATE and
  -- TRUNCATE are refused always, and so is anything on the archive.
  CREATE OR REPLACE FUNCTION activity_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
  BEGIN
    IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'activity_log' AND current_setting('dcrs.archiving', true) = 'on' THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'The activity log is only ever added to: % on % is refused (REQUIREMENTS §62).', TG_OP, TG_TABLE_NAME
      USING HINT = 'Old lines are moved to activity_log_archive by the super admin, from the Activity Log page.';
  END
  $fn$;
  CREATE OR REPLACE TRIGGER activity_log_append_only
    BEFORE UPDATE OR DELETE OR TRUNCATE ON activity_log
    FOR EACH STATEMENT EXECUTE FUNCTION activity_log_append_only();
  CREATE OR REPLACE TRIGGER activity_log_archive_append_only
    BEFORE UPDATE OR DELETE OR TRUNCATE ON activity_log_archive
    FOR EACH STATEMENT EXECUTE FUNCTION activity_log_append_only();

  -- The archive's search index, the same trigram index as the log's (db.ts
  -- ensureActivitySearchIndex) on the same words. A database account that may
  -- not create the extension still starts: the archive is then searched
  -- unindexed, and the log's own step prints the one warning that says why.
  DO $do$
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE INDEX IF NOT EXISTS activity_log_archive_search_trgm_idx ON activity_log_archive USING gin (${ACTIVITY_SEARCH_TEXT} gin_trgm_ops);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'The activity log archive''s search index was not made (%)', SQLERRM;
  END
  $do$;
`);

// ---------------------------------------------------------------------------
// how long a line stays before it may be archived

export const MIN_ARCHIVE_YEARS = 1;
export const MAX_ARCHIVE_YEARS = 10;

/** A whole number of years the page may offer, or null. */
export function archiveYears(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= MIN_ARCHIVE_YEARS && n <= MAX_ARCHIVE_YEARS ? n : null;
}

/** ACTIVITY_ARCHIVE_AFTER_YEARS, or 3: what the page offers first. Read when asked, so backend/.env is seen. */
export function defaultArchiveYears(): number {
  return archiveYears(process.env.ACTIVITY_ARCHIVE_AFTER_YEARS) ?? 3;
}

/** 2023-09-24 -> 24-Sep-2023, the way the app writes a date. */
function displayDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}-${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}-${y}`;
}

/** The plant's day a moment falls on, YYYY-MM-DD. */
function plantDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: plantTimeZone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

// ---------------------------------------------------------------------------
// what archiving would move, and moving it

export interface ArchivePreview {
  years: number;
  defaultYears: number;
  /** The first day KEPT: every line before this day (in the plant's time zone) would move. */
  cutoff: string;
  /** How many lines that is, and the days the oldest and the newest of them fall on (null when none). */
  count: number;
  from: string | null;
  to: string | null;
  /** What the archive holds already. */
  archived: { count: number; from: string | null; to: string | null };
}

// The cutoff is worked out by the database, on the plant's calendar (the
// connection's time zone is the plant's, db.ts): today, N years back. A line
// is older than that when it was written before the start of that day.
const CUTOFF_SQL = "(current_date - make_interval(years => $1::int))::date";

/** How many lines are older than `years` years, and what the archive holds. Two index reads, nothing more. */
export async function archivePreview(years: number): Promise<ArchivePreview> {
  const { rows } = await database().query<{ cutoff: string; n: string; oldest: Date | null; newest: Date | null; an: string; aoldest: Date | null; anewest: Date | null }>(
    `WITH cut AS (SELECT ${CUTOFF_SQL} AS day)
     SELECT to_char(cut.day, 'YYYY-MM-DD') AS cutoff, old.n, old.oldest, old.newest, arc.an, arc.aoldest, arc.anewest
       FROM cut,
            LATERAL (SELECT count(*)::text AS n, min(at) AS oldest, max(at) AS newest FROM activity_log WHERE at < cut.day) old,
            (SELECT count(*)::text AS an, min(at) AS aoldest, max(at) AS anewest FROM activity_log_archive) arc`,
    [years]
  );
  const r = rows[0];
  return {
    years,
    defaultYears: defaultArchiveYears(),
    cutoff: r.cutoff,
    count: Number(r.n) || 0,
    from: r.oldest ? plantDay(r.oldest) : null,
    to: r.newest ? plantDay(r.newest) : null,
    archived: { count: Number(r.an) || 0, from: r.aoldest ? plantDay(r.aoldest) : null, to: r.anewest ? plantDay(r.anewest) : null },
  };
}

export type ArchiveResult =
  | { ok: true; moved: number; cutoff: string; from: string | null; to: string | null }
  /** The day changed between the count being shown and the button being pressed: what WOULD move is no longer what was shown. */
  | { ok: false; cutoff: string };

/**
 * MOVES every line older than `years` years into the archive — the super
 * admin's deliberate act, never a timer's (REQUIREMENTS §62, §75). `shownCutoff`
 * is the day the page's count was made for; if today has moved on since, nothing
 * is moved and the caller shows the new count, so what is archived is always
 * what the person saw.
 *
 * ONE TRANSACTION: the lines leave the log and arrive in the archive in one
 * statement (a DELETE ... RETURNING feeding the INSERT), the day rows are
 * relabelled to match, and the "Activity log archived" line is written — all
 * of it, or, if anything fails, none of it. dcrs.archiving is set for this
 * transaction only (SET LOCAL), for the one DELETE, and switched off again
 * straight after it.
 */
export async function archiveActivity(
  years: number,
  shownCutoff: string | null,
  by: { id: string; name: string; email: string; ip: string }
): Promise<ArchiveResult> {
  const result = await withClient((client) =>
    transaction(client, async (): Promise<ArchiveResult> => {
      // The day rows are relabelled in step with the move: no tally may be
      // brought up to date halfway through it.
      await client.query("SELECT pg_advisory_xact_lock($1)", [DAILY_LOCK]);
      const cut = await client.query<{ cutoff: string }>(`SELECT to_char(${CUTOFF_SQL}, 'YYYY-MM-DD') AS cutoff`, [years]);
      const cutoff = cut.rows[0].cutoff;
      if (shownCutoff !== null && shownCutoff !== cutoff) return { ok: false as const, cutoff };

      await client.query("SET LOCAL dcrs.archiving = 'on'");
      const moved = await client.query<{ n: string; oldest: Date | null; newest: Date | null }>(
        `WITH moved AS (DELETE FROM activity_log WHERE at < $1::date RETURNING *),
              kept AS (INSERT INTO activity_log_archive (id, at, user_id, user_name, user_email, action, target, detail, department, ip, archived_by)
                       SELECT id, at, user_id, user_name, user_email, action, target, detail, department, ip, $2 FROM moved
                       RETURNING at)
         SELECT count(*)::text AS n, min(at) AS oldest, max(at) AS newest FROM kept`,
        [cutoff, `${by.name} <${by.email}>`]
      );
      await client.query("SET LOCAL dcrs.archiving = 'off'");
      const n = Number(moved.rows[0].n) || 0;
      if (n === 0) return { ok: true as const, moved: 0, cutoff, from: null, to: null };

      // The day rows of those days now count archived lines. They were counted
      // in the plant's time zone; should that have changed since, they are
      // simply thrown away and counted again on the next tally.
      const state = await client.query<{ same_zone: boolean }>("SELECT time_zone = current_setting('TimeZone') AS same_zone FROM activity_daily_state WHERE id = 1");
      if (state.rows[0]?.same_zone) {
        await client.query("UPDATE activity_daily SET archived = true WHERE NOT archived AND day < $1::date", [cutoff]);
      } else if (state.rows[0]) {
        await client.query("DELETE FROM activity_daily");
        await client.query("UPDATE activity_daily_state SET through = NULL WHERE id = 1");
      }

      const from = moved.rows[0].oldest ? plantDay(moved.rows[0].oldest) : null;
      const to = moved.rows[0].newest ? plantDay(moved.rows[0].newest) : null;
      await client.query(
        `INSERT INTO activity_log (user_id, user_name, user_email, action, target, detail, department, ip)
         VALUES ($1, $2, $3, 'Activity log archived', $4, $5, '', $6)`,
        [
          by.id,
          by.name,
          by.email,
          `Lines before ${displayDay(cutoff)}`,
          `${n} line${n === 1 ? "" : "s"}${from && to ? `, ${displayDay(from)} to ${displayDay(to)}` : ""}, older than ${years} year${years === 1 ? "" : "s"}, ` +
            `moved to the archive by ${by.name} — kept in the same database and still searchable by the super admin`,
          by.ip,
        ]
      );
      return { ok: true as const, moved: n, cutoff, from, to };
    })
  );
  // A move takes a large share of the log's lines at once, and PostgreSQL plans
  // every later reading from what it last saw of the tables: until it looks
  // again, it plans for lines that are no longer there (measured: tallies two
  // to four times slower straight after half a million lines moved). A look
  // is a sample, a second or two whatever the size, so it is taken now.
  if (result.ok && result.moved > 0) {
    await database()
      .query("ANALYZE activity_log, activity_log_archive, activity_daily")
      .catch((err) => console.warn(`[activity log] The tables were not re-read after archiving (${err instanceof Error ? err.message : String(err)}); PostgreSQL will do it by itself shortly.`));
  }
  return result;
}

// ---------------------------------------------------------------------------
// reading the log and its archive together

// Every line, the log's and the archive's, as one table, for the tally. The
// WHERE a reading adds is pushed by PostgreSQL into both halves, so each is
// read through its own indexes. The ids never collide: an archived line keeps its id.
const EVERY_LINE = `(SELECT id, at, user_id, user_name, user_email, action, target, detail, department, false AS archived FROM activity_log
                     UNION ALL
                     SELECT id, at, user_id, user_name, user_email, action, target, detail, department, true AS archived FROM activity_log_archive) AS line`;

export interface ArchivedActivityLine extends ActivityLine {
  /** True for a line that has been moved to the archive. */
  archived: boolean;
}

/**
 * THE LIST, WITH THE ARCHIVE: listActivity (db.ts) over the log and its
 * archive together — the same filters (activityWhere), the same newest-first
 * order and the same "Show older" cursor, which works across both because the
 * ids are one sequence. For the super admin only (archiveRoutes.ts).
 */
export async function listActivityWithArchive(opts: ActivityFilter & { limit: number; before?: string }): Promise<ArchivedActivityLine[]> {
  const args: unknown[] = [];
  const where: string[] = [];
  if (opts.before) {
    args.push(opts.before);
    where.push(`id < $${args.length}::bigint`);
  }
  where.push(...activityWhere(opts, args));
  args.push(opts.limit);
  const cond = where.length ? "WHERE " + where.join(" AND ") : "";
  const page = `ORDER BY id DESC LIMIT $${args.length}`;
  // EACH TABLE ITS OWN PAGE FIRST, then the two merged. Asked of both at once,
  // PostgreSQL costed the log's half as cheap because the archive's half had
  // plenty of lines in the span — and for a span that is all archived, it then
  // read every line of the log backwards to find none (1.4 s at a million
  // lines). Asked separately, each table is read the way that suits it: its id
  // backwards for a recent page, its time index for an old span.
  // line.id, not id, outside: the SELECT list hands the id out as text under
  // that name, and a bare ORDER BY id would sort the text (db.ts listActivity).
  const { rows } = await database().query<{ id: string; at: Date; user_id: string | null; user_name: string; user_email: string; action: string; target: string; detail: string; department: string; archived: boolean }>(
    `SELECT line.id::text AS id, at, user_id, user_name, user_email, action, target, detail, department, archived
       FROM ((SELECT id, at, user_id, user_name, user_email, action, target, detail, department, false AS archived FROM activity_log ${cond} ${page})
             UNION ALL
             (SELECT id, at, user_id, user_name, user_email, action, target, detail, department, true AS archived FROM activity_log_archive ${cond} ${page})) AS line
      ORDER BY line.id DESC LIMIT $${args.length}`,
    args
  );
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    action: r.action,
    target: r.target,
    detail: r.detail,
    department: r.department,
    archived: r.archived,
  }));
}

// ---------------------------------------------------------------------------
// the tally: who did what over a span (REQUIREMENTS §73)

// The person a line is counted under, as SQL: the account, or, for a line with
// none, the name — kept apart from any account's id, since both are text.
const PERSON_GROUP = "user_id, CASE WHEN user_id IS NULL THEN user_name END";

// The day rows, dressed as lines for activityWhere: their day is called `at`,
// and a date compares with the filter's plain dates exactly as a moment does
// (a day is inside "from 1-Sep to 24-Sep" when its lines are), so the scope,
// person and span conditions are the very ones the lines are read with.
const dayRows = (through: string, withArchive: boolean) =>
  `(SELECT day AS at, user_id, user_name, department, action, n, first_at, last_at
      FROM activity_daily WHERE day <= '${through}'::date${withArchive ? "" : " AND NOT archived"}) AS rolled`;

/**
 * THE TALLY THE SCORE IS READ BESIDE (REQUIREMENTS §73, §75): one row per
 * person for the span — how many lines, of which actions, the first and the
 * last, and on how many separate days. `withArchive` counts the archive's lines
 * too (the super admin's "Include archived lines"); otherwise only the log's.
 *
 * ONE ROW PER ACCOUNT. A line that has an account is counted under the account
 * alone, not under the account and the name it was written with: should an
 * account ever be renamed, its month stays one row, headed by the name on its
 * latest line. Only a line with no account — somebody refused at the door — is
 * counted under the name it gives.
 *
 * TWO QUERIES, because a person's ACTIVE DAYS cannot be added up across
 * actions (the same day appears under each), so the days are counted once per
 * person and the actions once per person and action; both in one snapshot, so
 * they describe the same lines. The days are counted by first cutting the span
 * into one row per person, name and day and counting those, rather than asking
 * for COUNT(DISTINCT day) over every line, which sorts the whole span.
 *
 * WHERE THE COUNTS COME FROM. The days activity_daily has counted (up to the
 * day before yesterday) from there, every day after from the lines themselves
 * — the same counts either way. A search reads the lines only: the words are
 * not in the day rows. Day rows that are behind are brought up to date in the
 * background for the next tally; with none yet (or counted in another time
 * zone), this one is read from the lines alone.
 */
export async function activityTally(opts: ActivityFilter, withArchive: boolean): Promise<ActivityTally[]> {
  const lines = withArchive ? EVERY_LINE : "activity_log";
  const { people, actions } = await withClient((client) =>
    transaction(client, async () => {
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      const through = opts.search ? null : await usableThrough(client);

      // Each half gets its own copy of the filter's arguments (activityWhere
      // appends them), so the two halves are simply joined by UNION ALL.
      const perPersonArgs: unknown[] = [];
      const halves: string[] = [];
      if (through) {
        const w = activityWhere(opts, perPersonArgs);
        halves.push(
          `SELECT user_id, user_name, at AS d, SUM(n) AS n, MIN(first_at) AS first_at, MAX(last_at) AS last_at
             FROM ${dayRows(through, withArchive)} ${w.length ? "WHERE " + w.join(" AND ") : ""}
            GROUP BY user_id, user_name, at`
        );
      }
      {
        const w = activityWhere(opts, perPersonArgs);
        if (through) w.push(`at >= ('${through}'::date + 1)`);
        halves.push(
          `SELECT user_id, user_name, at::date AS d, COUNT(*) AS n, MIN(at) AS first_at, MAX(at) AS last_at
             FROM ${lines} ${w.length ? "WHERE " + w.join(" AND ") : ""}
            GROUP BY user_id, user_name, at::date`
        );
      }
      const { rows: people } = await client.query<{ user_id: string | null; user_name: string; n: string; first_at: Date; last_at: Date; active_days: string }>(
        `SELECT user_id,
                (array_agg(user_name ORDER BY last_at DESC))[1] AS user_name,
                SUM(n)::text AS n, MIN(first_at) AS first_at, MAX(last_at) AS last_at,
                COUNT(DISTINCT d)::text AS active_days
           FROM (${halves.join(" UNION ALL ")}) per_day
          GROUP BY ${PERSON_GROUP}`,
        perPersonArgs
      );
      if (people.length === 0) return { people, actions: [] };

      const perActionArgs: unknown[] = [];
      const parts: string[] = [];
      if (through) {
        const w = activityWhere(opts, perActionArgs);
        parts.push(`SELECT user_id, user_name, action, SUM(n) AS n FROM ${dayRows(through, withArchive)} ${w.length ? "WHERE " + w.join(" AND ") : ""} GROUP BY user_id, user_name, action`);
      }
      {
        const w = activityWhere(opts, perActionArgs);
        if (through) w.push(`at >= ('${through}'::date + 1)`);
        parts.push(`SELECT user_id, user_name, action, COUNT(*) AS n FROM ${lines} ${w.length ? "WHERE " + w.join(" AND ") : ""} GROUP BY user_id, user_name, action`);
      }
      const { rows: actions } = await client.query<{ user_id: string | null; name_key: string | null; action: string; n: string }>(
        `SELECT user_id, CASE WHEN user_id IS NULL THEN user_name END AS name_key, action, SUM(n)::text AS n
           FROM (${parts.join(" UNION ALL ")}) per_action
          GROUP BY ${PERSON_GROUP}, action`,
        perActionArgs
      );
      return { people, actions };
    })
  );

  // Keyed by the ACCOUNT where there is one. A line whose account has since
  // been removed keeps the name it was written with, which is the point of a
  // log: it says what happened, not what is still true.
  const key = (id: string | null, name: string | null) => id ?? `name:${name ?? ""}`;
  const byAction = new Map<string, Record<string, number>>();
  for (const r of actions) {
    const k = key(r.user_id, r.name_key);
    const into = byAction.get(k) ?? {};
    into[r.action] = (into[r.action] ?? 0) + (Number(r.n) || 0);
    byAction.set(k, into);
  }
  return people
    .map((r) => ({
      userId: r.user_id,
      userName: r.user_name,
      byAction: byAction.get(key(r.user_id, r.user_name)) ?? {},
      total: Number(r.n) || 0,
      firstAt: r.first_at.toISOString(),
      lastAt: r.last_at.toISOString(),
      activeDays: Number(r.active_days) || 0,
    }))
    .sort((a, b) => b.total - a.total || a.userName.localeCompare(b.userName));
}

// Only a plain date is ever put into the SQL text (YYYY-MM-DD, from to_char).
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The last day the day rows may be read up to, or null when they cannot be
 * used for this tally (none yet, or counted in another time zone). When they
 * are not up to date, they are brought up to date in the background — this
 * tally does not wait for it.
 */
async function usableThrough(client: PoolClient): Promise<string | null> {
  const { rows } = await client.query<{ through: string | null; same_zone: boolean; current: boolean }>(
    `SELECT to_char(through, 'YYYY-MM-DD') AS through, time_zone = current_setting('TimeZone') AS same_zone, through >= current_date - 2 AS current
       FROM activity_daily_state WHERE id = 1`
  );
  const state = rows[0];
  if (!state || !state.through || !state.same_zone || !state.current) countDaysLater();
  return state?.through && state.same_zone && DAY_RE.test(state.through) ? state.through : null;
}

// ---------------------------------------------------------------------------
// the day rows: made from the log, a day at a time, never instead of it

let counting = false;

/** Brings the day rows up to date without anybody waiting for it; one run at a time in this server. */
function countDaysLater(): void {
  if (counting) return;
  counting = true;
  void countClosedDays()
    .catch((err) => console.warn(`[activity log] The day tally was not brought up to date (${err instanceof Error ? err.message : String(err)}); tallies are read from the lines meanwhile.`))
    .finally(() => {
      counting = false;
    });
}

/**
 * COUNTS EVERY CLOSED DAY NOT COUNTED YET into activity_daily, and returns the
 * last day now counted (null when another server was already at it). A day is
 * closed from the day after tomorrow: yesterday stays read from the lines, so a
 * line written a moment before midnight and saved a moment after it is never
 * missed. The first run on a long log counts all of it once (about as long as
 * one tally of "Everything" took before); after that, one day a day.
 *
 * Nothing here touches a line of the log: it only reads them. The day rows are
 * a copy, and are thrown away and counted again should the plant's time zone
 * change — a day is a date in that zone.
 */
export async function countClosedDays(): Promise<string | null> {
  return withClient((client) =>
    transaction(client, async () => {
      const got = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_xact_lock($1) AS ok", [DAILY_LOCK]);
      if (!got.rows[0].ok) return null;
      const { rows } = await client.query<{ through: string | null; time_zone: string | null; zone: string; target: string }>(
        `SELECT to_char(s.through, 'YYYY-MM-DD') AS through, s.time_zone, current_setting('TimeZone') AS zone, to_char(current_date - 2, 'YYYY-MM-DD') AS target
           FROM (SELECT 1) AS one LEFT JOIN activity_daily_state s ON s.id = 1`
      );
      const { zone, target } = rows[0];
      let through = rows[0].through;
      if (rows[0].time_zone !== zone) {
        await client.query("DELETE FROM activity_daily");
        through = null;
      }
      // THE DAY ROWS STILL AGREE WITH THE LINES? A closed day never gains a
      // line — the app stamps every line with the database's own clock — but a
      // line written straight into the table with an old date (a hand at a SQL
      // prompt, part of a backup restored) would be missed by them for ever. So
      // before a day is added, the totals are compared, table by table; if they
      // differ, the day rows are thrown away and counted again from the lines.
      // Two index counts and a sum, in the background, at most once a day.
      if (through !== null) {
        const sums = await client.query<{ live: string; archived: string; live_counted: string; archived_counted: string }>(
          `SELECT (SELECT count(*) FROM activity_log WHERE at < ($1::date + 1))::text AS live,
                  (SELECT count(*) FROM activity_log_archive WHERE at < ($1::date + 1))::text AS archived,
                  (SELECT COALESCE(sum(n) FILTER (WHERE NOT archived), 0) FROM activity_daily)::text AS live_counted,
                  (SELECT COALESCE(sum(n) FILTER (WHERE archived), 0) FROM activity_daily)::text AS archived_counted`,
          [through]
        );
        const s = sums.rows[0];
        if (s.live !== s.live_counted || s.archived !== s.archived_counted) {
          console.warn(
            `[activity log] The day tally did not match the lines (log ${s.live_counted} counted, ${s.live} there; archive ${s.archived_counted} counted, ${s.archived} there) — lines written with past dates? Counting every day again.`
          );
          await client.query("DELETE FROM activity_daily");
          through = null;
        }
      }
      if (through === null || through < target) {
        const args: unknown[] = [target];
        let since = "";
        if (through) {
          args.push(through);
          since = " AND at >= ($2::date + 1)";
        }
        const added = await client.query(
          `INSERT INTO activity_daily (day, archived, user_id, user_name, department, action, n, first_at, last_at)
           SELECT at::date, archived, user_id, user_name, department, action, COUNT(*), MIN(at), MAX(at)
             FROM (SELECT at, false AS archived, user_id, user_name, department, action FROM activity_log WHERE at < ($1::date + 1)${since}
                   UNION ALL
                   SELECT at, true AS archived, user_id, user_name, department, action FROM activity_log_archive WHERE at < ($1::date + 1)${since}) AS line
            GROUP BY at::date, archived, user_id, user_name, department, action`,
          args
        );
        // A first count of a long log writes a table's worth of rows at once, and
        // until PostgreSQL has looked at them it plans the tally blind (measured:
        // "Everything" three times slower straight after). A day's rows need no such look.
        if ((added.rowCount ?? 0) > 10000) await client.query("ANALYZE activity_daily");
      }
      await client.query(
        `INSERT INTO activity_daily_state (id, through, time_zone) VALUES (1, $1::date, $2)
         ON CONFLICT (id) DO UPDATE SET through = EXCLUDED.through, time_zone = EXCLUDED.time_zone`,
        [through !== null && through > target ? through : target, zone]
      );
      return through !== null && through > target ? through : target;
    })
  );
}
