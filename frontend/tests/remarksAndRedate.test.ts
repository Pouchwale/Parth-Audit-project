// F/QC/17'S REMARKS (REQUIREMENTS §212) AND A DATE CHANGED AT ANY TIME BY THE FOUR THE OWNER NAMED (§213; the owner,
// 15-Nov-2026: "Superadmin, kapila barad, vinay bhojak, chirag parmer id has all rights in all there responsible
// documents so they can change any date and anything").
// Run: npm run test:unit -- remarksAndRedate
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RecordInstance } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { addRemark, removeRemark, takesRemarks } from "../src/engine/recordRemarks";
import { changeRecordDate } from "../src/engine/recordLifecycle";
import { mayRedateAnyTime, setAccessScope, setDepartmentScope } from "../src/engine/departmentScope";
import { datedByFrequency } from "../src/engine/calendarMigration";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const src = (...p: string[]) => readFileSync(path.join(root, "frontend", "src", ...p), "utf8").replace(/\r\n/g, "\n");

function sheet(id: string, over: Partial<RecordInstance>): RecordInstance {
  return recordRepository.upsert({
    id,
    documentId: "qc-ruler-verification",
    periodKey: "qc-ruler-verification:2026-09-24",
    dueDate: "2026-09-25",
    status: "Verified",
    isDemo: false,
    data: { header: {}, rows: [] },
    createdAt: "2026-11-01T05:00:00.000Z",
    updatedAt: "2026-11-01T05:00:00.000Z",
    ...over,
  } as RecordInstance);
}

test("F/QC/17 takes remarks, with who and when, in its history, and they are never printed", () => {
  assert.ok(takesRemarks("qc-ruler-verification") && takesRemarks("qc-ruler-verification-300"));
  assert.ok(!takesRemarks("qc-weight-scale-calibration"), "F/QC/17 only, as the owner said");
  const r = sheet("rec-remarks", {});
  const one = addRemark(r, "  Scale  cleaned before the check ", "Kapila Barad");
  assert.equal(one.remarks?.length, 1);
  assert.equal(one.remarks![0].text, "Scale cleaned before the check");
  assert.equal(one.remarks![0].by, "Kapila Barad");
  assert.equal(one.status, "Verified", "a remark leaves the record as signed");
  assert.match(String(one.history?.at(-1)?.note), /Remark added: "Scale cleaned before the check"/);
  assert.equal(addRemark(one, "   ", "Kapila Barad"), one, "an empty remark is nothing");
  const none = removeRemark(one, one.remarks![0].id, "Kapila Barad");
  assert.equal(none.remarks?.length, 0);
  assert.match(String(none.history?.at(-1)?.note), /Remark removed/);
  recordRepository.removeIds([r.id]);

  const box = src("components", "records", "RecordRemarks.tsx");
  assert.match(box, /className="card mt-4 no-print" data-section="record-remarks"/, "off the print and the downloads");
  const page = src("pages", "RecordPage.tsx");
  const printEnds = page.indexOf("{/* F/QC/17's remarks");
  assert.ok(printEnds > page.indexOf("<div data-print-doc"), "drawn after the part that prints");
  assert.match(page.slice(page.indexOf("<div data-print-doc"), printEnds), /\n      <\/div>\n\s*$/, "outside it");
});

test("the four named may change a date at any time on what they hold at Edit; nobody else", () => {
  const rules = {
    version: 1,
    people: {
      "kapilabarad@gpp.local": { modules: { QC: "edit", HR: "edit" } },
      "vinaybhojak@gpp.local": { modules: { HR: "edit" } },
      "chiragparmar@gpp.local": { modules: { PUR: "edit" } },
      "harshparmer@gpp.local": { modules: { QC: "edit", HR: "edit" } },
    },
    responsibility: {},
  };
  const as = (email: string, role = "staff") => setAccessScope({ email, role, departments: [] }, rules);
  as("admin@gpp.local", "admin");
  assert.ok(mayRedateAnyTime("qc-ruler-verification"));
  as("kapilabarad@gpp.local");
  assert.ok(mayRedateAnyTime("qc-ruler-verification"));
  as("kapilabarad01@gmail.com");
  assert.ok(mayRedateAnyTime("qc-ruler-verification"), "her own address is her too");
  as("vinaybhojak@gpp.local");
  assert.ok(mayRedateAnyTime("hr-daily-cleaning"));
  assert.ok(!mayRedateAnyTime("qc-ruler-verification"), "not a document Vinay holds at Edit");
  as("chiragparmar@gpp.local");
  assert.ok(mayRedateAnyTime("pur-supplier-registration"));
  as("harshparmer@gpp.local");
  assert.ok(!mayRedateAnyTime("qc-ruler-verification"), "Edit alone is not enough: the owner named four");
  setDepartmentScope(null);
  assert.ok(!mayRedateAnyTime("qc-ruler-verification"), "nobody signed in");
});

test("a signed record's date changed by one of them stays signed, and is never put back by the frequency", () => {
  const r = sheet("rec-redate", {});
  assert.equal(changeRecordDate(r, "2026-09-28", r.periodKey, "Kapila Barad").record, r, "without the right, a signed record keeps its date");
  const moved = changeRecordDate(r, "2026-09-28", r.periodKey, "Kapila Barad", { anyStatus: true }).record;
  assert.equal(moved.dueDate, "2026-09-28");
  assert.equal(moved.status, "Verified");
  assert.equal(moved.history?.at(-1)?.changes?.[0]?.field, "dueDate");

  const open = sheet("rec-redate-open", { id: "rec-redate-open", status: "In Progress", periodKey: "qc-ruler-verification-300:2026-09-24", documentId: "qc-ruler-verification-300" });
  const typed = changeRecordDate(open, "2026-09-29", open.periodKey, "Kapila Barad").record;
  assert.equal(typed.dueDate, "2026-09-29");
  datedByFrequency();
  assert.equal(recordRepository.getById(typed.id)!.dueDate, "2026-09-29", "a date a person chose is theirs");
  recordRepository.removeIds([r.id, open.id]);
});
