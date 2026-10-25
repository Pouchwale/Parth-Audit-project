// THE PER-PERSON TALLY AND THE DAY ROWS IT READS (backend/activityArchive.ts activityTally; REQUIREMENTS §73, §75).
//
// Each closed day of the tally is read from activity_daily (one row per day, person, department and action), and the
// very conditions db.ts activityWhere puts on the lines are put on those rows. A condition on anything else of a line
// is refused by PostgreSQL, and the whole tally with it: the document chip did that until 25-Oct-2026 (42703, column
// "target" does not exist), unseen, since the page shows the lines whether or not the tally beside them comes.
// What is proved here:
//   * with no database: the tally reads the day rows exactly when every condition of the filter names a column they
//     hold — each field of ActivityFilter set alone, and all of them at once. A field added to ActivityFilter must be
//     added to EVERY_FIELD below (the typecheck refuses the list without it), and is then checked the same way;
//   * on a throwaway PostgreSQL (DCRS_ACTIVITY_TEST_URL), with day rows counted: the tally with a document chosen
//     answers, from the lines, with the right counts — the log's, and the archive's too for the super admin — alone
//     and with the module and action chips beside it; and a filter the day rows can answer is still read from them.
// Run: npm run test:unit -- activityTally
//      DCRS_ACTIVITY_TEST_URL=postgres://user:password@127.0.0.1:<port>/a_throwaway_database npm run test:unit -- activityTally
// The database must be a throwaway one: lines are written into its log and moved into its archive (which keeps them for
// ever), and its day rows are counted again.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { activityWhere, closeDatabase, database, openDatabase, type ActivityFilter, type ActivityTally } from "../db.ts";
import { activityTally, archiveActivity, countClosedDays, dayRowsCanAnswer } from "../activityArchive.ts";

// ---------------------------------------------------------------------------
// with no database: which filters the day rows can answer

// What a day row holds, as activityArchive.ts dayRows hands it to the conditions: its day is called `at`.
const DAY_ROW_COLUMNS = new Set(["at", "user_id", "user_name", "department", "action", "n", "first_at", "last_at"]);
// The SQL words activityWhere writes its conditions with; every other name in a condition is a column.
const SQL_WORDS = new Set(["and", "or", "not", "any", "all", "in", "is", "null", "lower", "like", "escape"]);

/** The columns a condition reads: the names left once its strings, parameters, casts and SQL words are taken out. */
function columnsOf(condition: string): string[] {
  const names =
    condition
      .replace(/E?'(?:[^']|'')*'/g, " ")
      .replace(/::\w+(?:\[\])?/g, " ")
      .replace(/\$\d+/g, " ")
      .match(/[A-Za-z_]\w*/g) ?? [];
  return [...new Set(names.filter((w) => !SQL_WORDS.has(w.toLowerCase())))];
}

// No condition at all: the super admin, every line.
const NONE: ActivityFilter = { departments: null, userId: "u-asker", superAdmin: true };

// EVERY FIELD OF THE FILTER, each with a value that gives it a condition of its own (userId has none alone: it is the
// asker's own lines beside their departments'). Required<>: a field added to ActivityFilter is refused by the typecheck
// until it is added here, and so checked against the day rows below.
const EVERY_FIELD: Required<ActivityFilter> = {
  departments: ["DISP"],
  userId: "u-asker",
  superAdmin: false,
  search: "vehicle",
  person: "u-kapila",
  from: "2026-10-01",
  to: "2026-10-25",
  department: "DISP",
  document: "F/DISP/04",
  action: "Record started",
};

const only = (field: keyof ActivityFilter): ActivityFilter => ({ ...NONE, [field]: EVERY_FIELD[field] });

describe("which filters the tally reads the day rows for (activityArchive.ts dayRowsCanAnswer)", () => {
  const cases: [string, ActivityFilter][] = [
    ["no filter", NONE],
    ...(Object.keys(EVERY_FIELD) as (keyof ActivityFilter)[]).map((field): [string, ActivityFilter] => [`${field} alone`, only(field)]),
    ["every field at once", EVERY_FIELD],
  ];
  for (const [name, filter] of cases) {
    it(`${name}: read from the day rows exactly when every condition names a column they hold`, () => {
      const conditions = activityWhere(filter, []);
      const missing = [...new Set(conditions.flatMap(columnsOf))].filter((c) => !DAY_ROW_COLUMNS.has(c));
      assert.equal(
        dayRowsCanAnswer(filter),
        missing.length === 0,
        missing.length
          ? `the conditions read ${missing.join(", ")}, which the day rows do not hold: dayRowsCanAnswer must say no (${conditions.join(" AND ")})`
          : `every condition names a column the day rows hold: dayRowsCanAnswer should say yes, or the tally reads every line for nothing (${conditions.join(" AND ")})`
      );
    });
  }

  it("the document chip and a search are read from the lines alone: the day rows hold no target and no detail", () => {
    assert.equal(dayRowsCanAnswer(only("document")), false);
    assert.equal(dayRowsCanAnswer(only("search")), false);
    assert.equal(dayRowsCanAnswer({ ...NONE, department: "DISP", action: "Record started", document: "F/DISP/04" }), false);
  });

  it("the scope, a person, a span, the module chip and the action chip, together, are still read from the day rows", () => {
    assert.equal(dayRowsCanAnswer({ ...EVERY_FIELD, search: undefined, document: undefined }), true);
  });
});

// ---------------------------------------------------------------------------
// on PostgreSQL: the tally itself, with day rows counted

const PG_URL = process.env.DCRS_ACTIVITY_TEST_URL?.trim() ?? "";

if (!PG_URL) {
  describe("the tally on PostgreSQL, with day rows counted", () => {
    it("skipped (DCRS_ACTIVITY_TEST_URL is not set; the same checks run on a throwaway database when it is)", { skip: true }, () => undefined);
  });
} else {
  describe("the tally on PostgreSQL, with day rows counted (DCRS_ACTIVITY_TEST_URL)", () => {
    // THIS RUN'S OWN PEOPLE: the archive refuses every removal, so a database used before still holds earlier runs'
    // lines. Only this run's are looked at below.
    const run = `tally-${Date.now().toString(36)}`;
    const KAPILA = `${run}-kapila`;
    const VINAY = `${run}-vinay`;
    const ADMIN = `${run}-admin`;
    const VEHICLE = "F/DISP/04 Vehicle (Company Owned) Cleaning Protocol & Record";
    const PEST = "F/QC/01 Daily Pest Control Monitoring";
    const SUPER: ActivityFilter = { departments: null, userId: ADMIN, superAdmin: true };

    const write = (ago: string, userId: string, action: string, target: string, department: string) =>
      database().query(
        "INSERT INTO activity_log (at, user_id, user_name, user_email, action, target, department) VALUES (now() - $1::interval, $2, $2, $3, $4, $5, $6)",
        [ago, userId, `${userId}@gpp.local`, action, target, department]
      );

    /** This run's people in a tally: how many lines, of which actions, on how many days. */
    const mine = (rows: ActivityTally[]) =>
      Object.fromEntries(rows.filter((r) => r.userId?.startsWith(run)).map((r) => [r.userId ?? "", { total: r.total, byAction: r.byAction, activeDays: r.activeDays }]));

    before(async () => {
      process.env.DATABASE_URL = PG_URL;
      // A throwaway database never takes the accounts of an old SQLite file on this machine (db.ts importSqliteOnce).
      process.env.SQLITE_IMPORT = "0";
      await openDatabase();
      // Two years ago, then moved to the archive, as the super admin moves it from the page.
      await write("2 years", KAPILA, "Submitted", `${VEHICLE} — two years ago`, "DISP");
      const moved = await archiveActivity(1, null, { id: ADMIN, name: ADMIN, email: `${ADMIN}@gpp.local`, ip: "127.0.0.1" });
      assert.ok(moved.ok && moved.moved >= 1, JSON.stringify(moved));
      // Five days ago: a closed day, counted into the day rows.
      await write("5 days", KAPILA, "Record started", VEHICLE, "DISP");
      await write("5 days", KAPILA, "Submitted", VEHICLE, "DISP");
      await write("5 days", KAPILA, "Record started", PEST, "QC");
      await write("5 days", VINAY, "Verified", VEHICLE, "DISP");
      // Today: read from the lines.
      await write("0 seconds", KAPILA, "Record started", VEHICLE, "DISP");
      await write("0 seconds", VINAY, "Signed in", `${VINAY}@gpp.local`, "");
      // The day rows counted again from the lines, every day up to the day before yesterday.
      await database().query("DELETE FROM activity_daily_state");
      await countClosedDays();
      const counted = await database().query<{ n: string }>("SELECT COALESCE(sum(n), 0)::text AS n FROM activity_daily WHERE user_id = ANY($1)", [[KAPILA, VINAY]]);
      assert.equal(counted.rows[0].n, "5", "the day rows hold this run's five closed-day lines (four in the log, one archived)");
      // ONE LINE MORE under the closed day, written after the count, as a line restored from a backup would be: the day
      // rows do not have it until they are next counted, the lines do. A tally that counts it read the lines.
      await write("5 days", KAPILA, "Record started", VEHICLE, "DISP");
    });
    after(() => closeDatabase());

    it("a document chosen: answered from the lines, every line of that document counted", async () => {
      assert.deepEqual(mine(await activityTally({ ...SUPER, document: "F/DISP/04" }, false)), {
        [KAPILA]: { total: 4, byAction: { "Record started": 3, Submitted: 1 }, activeDays: 2 },
        [VINAY]: { total: 1, byAction: { Verified: 1 }, activeDays: 1 },
      });
    });

    it("...with the archive's lines too, for the super admin's Include archived lines (the words matched as typed, in any case)", async () => {
      assert.deepEqual(mine(await activityTally({ ...SUPER, document: "f/disp/04" }, true)), {
        [KAPILA]: { total: 5, byAction: { "Record started": 3, Submitted: 2 }, activeDays: 3 },
        [VINAY]: { total: 1, byAction: { Verified: 1 }, activeDays: 1 },
      });
    });

    it("...and with the module and action chips beside it, as the Activity Log page sends them", async () => {
      assert.deepEqual(mine(await activityTally({ ...SUPER, department: "DISP", action: "Record started", document: "F/DISP/04" }, false)), {
        [KAPILA]: { total: 3, byAction: { "Record started": 3 }, activeDays: 2 },
      });
    });

    it("a filter the day rows can answer is still read from them: the line written after the count is not in it yet", async () => {
      assert.deepEqual(mine(await activityTally({ ...SUPER, department: "DISP" }, false)), {
        [KAPILA]: { total: 3, byAction: { "Record started": 2, Submitted: 1 }, activeDays: 2 },
        [VINAY]: { total: 1, byAction: { Verified: 1 }, activeDays: 1 },
      });
    });
  });
}
