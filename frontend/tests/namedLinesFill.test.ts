// F/HR/10: a name, however it got there, brings the person's department and designation from HR Master Data (REQUIREMENTS §331).
// Run: npm run test:unit -- namedLinesFill
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrSeeded, hrMasterRepository } from "../src/data/repositories/hrMasterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { fillNamedLinesFromMaster } from "../src/engine/namedLinesFill";
import { createRecordForDocument } from "../src/engine/recordCrud";
import { saveDraft } from "../src/engine/recordLifecycle";

const DOC = "hr-training-imparted";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrSeeded();

test("a name put on F/HR/10 by the system has its line filled when the record is opened; a typed box stays", () => {
  const people = hrMasterRepository.all().filter((p) => p.designation && p.department && p.fullName.split(" ").length >= 3);
  const [a, b] = people;
  const record = createRecordForDocument(documentRepository.getByIdUnscoped(DOC)!).record as RecordInstance<LogSheetData>;
  assert.ok(record);
  const rows = [
    { id: "r1", name: a.fullName, department: "", designation: "", signature: "" },
    { id: "r2", name: b.fullName, department: "", designation: "Typed by hand", signature: "" },
    { id: "r3", name: "Nobody On The Sheet", department: "", designation: "", signature: "" },
  ];
  saveDraft(record, { ...record.data, rows }, "Mitra", { action: "edited" });
  fillNamedLinesFromMaster(record.id);
  const after = (recordRepository.getById(record.id) as RecordInstance<LogSheetData>).data.rows;
  assert.equal(after[0].designation, a.designation);
  assert.equal(after[0].department, a.department);
  assert.equal(after[1].designation, "Typed by hand", "a box written is never changed");
  assert.equal(after[1].department, b.department);
  assert.equal(after[2].designation, "", "a name not on the sheet fetches nothing");
});
