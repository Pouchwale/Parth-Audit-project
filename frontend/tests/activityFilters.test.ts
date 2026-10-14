// THE ACTIVITY LOG'S CHIPS build their query (engine/activityFilters.ts): each
// chip one parameter, combined, encoded, and nothing for a chip not pressed —
// the same query the lines, the tally, the archive and "Show older" are read
// with (backend/tests/activityRoutes.test.ts proves the server's half).
// Run: npm run test:unit -- activityFilters
import test from "node:test";
import assert from "node:assert/strict";
import { actionsHeld, activityQuery, anyChip, matchingLines, NO_CHIPS, spanDates } from "../src/engine/activityFilters";
import type { ActivityTally } from "../src/engine/activityWork";

const NOW = new Date(2026, 9, 14, 11, 30); // 14-Oct-2026, local time

test("the span alone is what the page sent before the chips: two plain dates, or nothing for everything", () => {
  assert.equal(activityQuery(NO_CHIPS, NOW), "from=2026-10-14&to=2026-10-14");
  assert.equal(activityQuery({ ...NO_CHIPS, span: "month" }, NOW), "from=2026-10-01&to=2026-10-14");
  assert.equal(activityQuery({ ...NO_CHIPS, span: "year" }, NOW), "from=2026-01-01&to=2026-10-14");
  assert.equal(activityQuery({ ...NO_CHIPS, span: "all" }, NOW), "");
  assert.deepEqual(spanDates("all", NOW), {});
});

test("each chip is one parameter, and they combine", () => {
  assert.equal(activityQuery({ ...NO_CHIPS, span: "all", person: "u-kapila" }, NOW), "person=u-kapila");
  assert.equal(activityQuery({ ...NO_CHIPS, span: "all", department: "QC" }, NOW), "department=QC");
  assert.equal(activityQuery({ ...NO_CHIPS, span: "all", document: " F/QC/01 " }, NOW), "document=F%2FQC%2F01", "typed with spaces, sent trimmed and encoded");
  assert.equal(activityQuery({ ...NO_CHIPS, span: "all", action: "Record started" }, NOW), "action=Record%20started");
  assert.equal(
    activityQuery({ span: "month", person: "u-kapila", department: "QC", document: "F/QC/01", action: "Submitted", q: "pest & flies" }, NOW),
    "from=2026-10-01&to=2026-10-14&person=u-kapila&department=QC&document=F%2FQC%2F01&action=Submitted&q=pest%20%26%20flies"
  );
});

test("a chip not pressed, or only spaces, sends nothing", () => {
  assert.equal(activityQuery({ ...NO_CHIPS, span: "all", document: "   ", q: "  " }, NOW), "");
  assert.equal(anyChip(NO_CHIPS), false);
  assert.equal(anyChip({ ...NO_CHIPS, action: "Verified" }), true);
});

const tally = (userId: string, byAction: Record<string, number>): ActivityTally => ({
  userId,
  userName: userId,
  byAction,
  total: Object.values(byAction).reduce((a, b) => a + b, 0),
  firstAt: "2026-10-14T03:00:00.000Z",
  lastAt: "2026-10-14T09:00:00.000Z",
  activeDays: 1,
});

test("the count of matching lines is the tally's, counted in the database over the same filter", () => {
  assert.equal(matchingLines([]), 0);
  assert.equal(matchingLines([tally("a", { "Signed in": 2, Submitted: 3 }), tally("b", { Verified: 1 })]), 6);
});

test("the action chips are every action the readings have held, sorted, and a pressed chip never loses the others", () => {
  const first = actionsHeld([tally("a", { "Signed in": 2, Submitted: 3 }), tally("b", { Verified: 1, Submitted: 1 })]);
  assert.deepEqual(first, ["Signed in", "Submitted", "Verified"]);
  // Kept to "Verified", the tally holds "Verified" alone; the chips still offer the rest.
  assert.deepEqual(actionsHeld([tally("b", { Verified: 1 })], first), ["Signed in", "Submitted", "Verified"]);
  assert.deepEqual(actionsHeld([tally("a", { "": 1 })]), [], "a line with no action is no chip");
});
