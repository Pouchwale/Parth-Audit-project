// A COLUMN THAT FOLLOWS A HEADER BOX (REQUIREMENTS §159; the owner, 2-Nov-2026):
// "in HR 05 the planned date is filled according to date of joining of the
// user which user will select." Every topic's Planned Date on the induction
// record is the Date of Joining — blank cells take it, cells that held the
// old date move with a corrected one, a date the person wrote stays.
// Run: npm run test:unit -- headerFollowers
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { followHeader, headerFollowers } from "../src/engine/headerFollowers";
import { applyAssistantPatch } from "../src/engine/recordPatch";
import { createDefaultData } from "../src/engine/recordDefaults";
import { newRow } from "../src/engine/recordLines";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { todayISO } from "../src/utils/date";
import type { LogSheetData } from "../src/types";

ensureMasterSeeded();
ensureDocumentsSeeded();

const master = masterRepository.get();
const doc = documentRepository.getById("hr-induction-staff")!;
const layout = getLogSheetLayout("hr-induction-staff")!;
const fresh = (): LogSheetData => createDefaultData(doc, todayISO(), master) as unknown as LogSheetData;
const planned = (d: LogSheetData): string[] => d.rows.map((r) => String(r.plannedDate ?? ""));

describe("F/HR/05's Planned Date follows the Date of Joining (REQUIREMENTS §159)", () => {
  it("the induction record's Planned Date is the one column that follows a header box", () => {
    assert.deepEqual(headerFollowers(layout), [{ key: "plannedDate", from: "dateOfJoining" }]);
    assert.deepEqual(headerFollowers(getLogSheetLayout("hr-pre-employment-health")!), []);
  });

  it("choosing the Date of Joining puts it on every topic line's Planned Date; nothing chosen, nothing written", () => {
    const data = fresh();
    assert.equal(followHeader(layout, undefined, data), data, "no joining date: the data comes back as it was");
    const chosen = followHeader(layout, data, { ...data, header: { ...data.header, dateOfJoining: "2026-11-05" } });
    assert.deepEqual(planned(chosen), data.rows.map(() => "2026-11-05"));
    assert.equal(chosen.header.dateOfJoining, "2026-11-05");
  });

  it("a corrected joining date moves the planned dates that followed it; a date the person wrote stays", () => {
    const data = fresh();
    const chosen = followHeader(layout, data, { ...data, header: { ...data.header, dateOfJoining: "2026-11-05" } });
    const own = { ...chosen, rows: chosen.rows.map((r, i) => (i === 2 ? { ...r, plannedDate: "2026-11-12" } : r)) };
    const corrected = followHeader(layout, own, { ...own, header: { ...own.header, dateOfJoining: "2026-11-07" } });
    assert.deepEqual(
      planned(corrected),
      own.rows.map((_, i) => (i === 2 ? "2026-11-12" : "2026-11-07"))
    );
    // The box cleared: the dates that followed it go with it, the person's own stays.
    const cleared = followHeader(layout, corrected, { ...corrected, header: { ...corrected.header, dateOfJoining: "" } });
    assert.deepEqual(
      planned(cleared),
      own.rows.map((_, i) => (i === 2 ? "2026-11-12" : ""))
    );
  });

  it("a topic line added after the joining date was chosen takes it on the next save", () => {
    const data = fresh();
    const chosen = followHeader(layout, data, { ...data, header: { ...data.header, dateOfJoining: "2026-11-05" } });
    const added = followHeader(layout, chosen, { ...chosen, rows: [...chosen.rows, newRow(layout, chosen.rows)] });
    assert.equal(added.rows.length, 8);
    assert.equal(added.rows[7].plannedDate, "2026-11-05");
  });

  it("Mitra writing the Date of Joining moves the lines too", () => {
    const data = fresh();
    const out = applyAssistantPatch("log-sheet", doc.id, data, { header: { dateOfJoining: "2026-11-05" } });
    assert.deepEqual(out.problems, []);
    assert.deepEqual(planned(out.data as LogSheetData), data.rows.map(() => "2026-11-05"));
  });
});
