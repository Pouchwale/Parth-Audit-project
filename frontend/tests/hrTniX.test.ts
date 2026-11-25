// F/HR/08: an X under a topic, as on the paper (REQUIREMENTS §330).
import test from "node:test";
import assert from "node:assert/strict";
import type { RecordInstance } from "../src/types";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { topicsMarkedX } from "../src/data/hrTniXMigration";

test("every topic is an X or blank, never Yes / No", () => {
  const layout = getLogSheetLayout("hr-training-needs")!;
  const topics = layout.columns.filter((c) => /^t\d\d$/.test(c.key));
  assert.equal(topics.length, 17);
  for (const c of topics) {
    assert.equal(c.type, "select");
    assert.deepEqual(c.options, ["X"]);
  }
});

test("a sheet answered Yes / No reads X / blank; the rest stays", () => {
  const r = {
    id: "r", documentId: "hr-training-needs", dueDate: "2026-04-01", status: "Submitted", isDemo: false,
    data: { header: { period: "01.04.2026 ~ 31.03.2027" }, rows: [{ id: "a", name: "Shail Patel", designation: "CEO", t01: "Yes", t02: "No", t03: "" }] },
  } as unknown as RecordInstance;
  const next = topicsMarkedX(r)!;
  assert.deepEqual([next.rows[0].t01, next.rows[0].t02, next.rows[0].t03, next.rows[0].name], ["X", "", "", "Shail Patel"]);
  assert.equal(topicsMarkedX({ ...r, data: next } as RecordInstance), null, "run again: nothing");
});
