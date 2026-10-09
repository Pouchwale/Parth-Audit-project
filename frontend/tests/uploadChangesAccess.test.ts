// UPLOAD CHANGES FOLLOWS THE PERSON'S LEVEL (REQUIREMENTS §81, §96; the people review of 9-Oct-2026).
//
// "Upload changes" (an edited Word or Excel file written back into records) was offered to Raghunath Mane on F/STR/01,
// which the super admin had given him to read only, and its plan would have changed the stored record, or reopened a
// signed-off one for correction, before the server refused it. Now a record the person may not fill is "locked" for
// the upload, with the level as the reason, and one they may not correct is never reopened by it; the button is not
// drawn below Write (components/common/DownloadDocumentButton.tsx).
// Run: npm run test:unit -- uploadChangesAccess
import test from "node:test";
import assert from "node:assert/strict";
import type { RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { howToChange } from "../src/engine/roundTrip/applyImport";
import { createDefaultData } from "../src/engine/recordDefaults";
import { setAccessRules, setAccessScope, setDepartmentScope } from "../src/engine/departmentScope";
import type { AccessAccount } from "../src/engine/accessRules";

ensureDocumentsSeeded();
ensureMasterSeeded();

const VINAY: AccessAccount = { email: "vinay.bhojak@gpp.local", role: "staff", departments: ["HR"] };
const KAPILA: AccessAccount = { email: "kapila.barad@gpp.local", role: "staff", departments: ["QC"] };

function as<T>(who: AccessAccount, rules: unknown, run: () => T): T {
  setAccessScope(who, rules);
  try {
    return run();
  } finally {
    setDepartmentScope(null);
    setAccessRules(null);
  }
}

function stored(documentId: string, status: RecordInstance["status"]): RecordInstance {
  const doc = documentRepository.getAllUnscoped().find((d) => d.id === documentId)!;
  const r: RecordInstance = {
    id: `upload-${documentId}-${status}`.replace(/\s+/g, ""),
    documentId,
    periodKey: `${documentId}:upload:${status}`,
    dueDate: "2026-09-15",
    status,
    isDemo: false,
    data: createDefaultData(doc, "2026-09-15", masterRepository.get()),
    createdAt: "2026-09-15T03:00:00.000Z",
    updatedAt: "2026-09-15T03:00:00.000Z",
  };
  recordRepository.upsert(r);
  return r;
}

test("a record the person only reads is locked for the upload, with the level as the reason", () => {
  // F/HR/15 Daily Cleaning is Kapila Barad's: Vinay Bhojak reads it.
  const open = stored("hr-daily-cleaning", "In Progress");
  assert.deepEqual(as(VINAY, null, () => howToChange(open.id, () => null)), { way: "locked", via: "store", status: "In Progress", why: "level" });
  assert.equal(as(KAPILA, null, () => howToChange(open.id, () => null)).way, "edit");
});

test("a signed-off record is reopened by the upload only for somebody with Edit", () => {
  const verified = stored("hr-daily-cleaning", "Verified");
  assert.equal(as(KAPILA, null, () => howToChange(verified.id, () => null)).way, "reopen");
  // Kapila Barad given Write (not Edit) on it: she may fill it, never correct a signed-off one.
  const write = { version: 1, people: { "kapila.barad@gpp.local": { documents: { "hr-daily-cleaning": "write" } } }, responsibility: {} };
  assert.deepEqual(as(KAPILA, write, () => howToChange(verified.id, () => null)), { way: "locked", via: "store", status: "Verified", why: "level" });
});
