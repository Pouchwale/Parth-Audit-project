// THE ACCESS LEVELS HELD BY THE SERVER (REQUIREMENTS §96), backend/accessLevels.ts, without a database.
//
// The owner's table (frontend/src/engine/accessRules.ts, held to his words by frontend/tests/accessRules.test.ts) applied
// as the server applies it:
//   * each person's level on each document, and what that lets them hold (a document at Read or more);
//   * a write of the records checked record by record against the version stored: start, fill, submit, verify, send
//     back at Write; correct and delete at Edit; a person's own act refused in plain words, the app's housekeeping
//     (a blank or prepared sheet, a start-up migration, a removal) left as stored; everyone else's lines kept;
//   * the document definitions and the format edits at Edit;
//   * the super admin passes everything; an account nobody has described keeps what it had.
// Run: npm run test:unit -- accessLevels
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AccessCatalogue,
  AccessRefused,
  accessCatalogue,
  catalogueOf,
  changedDocuments,
  checkFormatChange,
  composeRecords,
  holdsHrMaster,
  levelRefusal,
  recordChanges,
  sameValue,
  untouchedSheet,
  viewFor,
  writesHrMaster,
  type AccessView,
} from "../accessLevels.ts";
import { DOCS, DOCS_JSON, PEOPLE } from "./accessFixtures.ts";

const view = (who: keyof typeof PEOPLE, rules: unknown = null): AccessView => viewFor(accessCatalogue(DOCS_JSON, rules === null ? null : JSON.stringify(rules)), PEOPLE[who]);

let n = 0;
const entry = (action: string, by = "Somebody") => ({ id: `hist-${++n}`, at: "2026-10-08T05:00:00.000Z", by, action });

const rec = (id: string, documentId: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  documentId,
  periodKey: `${documentId}:2026-10-08`,
  dueDate: "2026-10-08",
  status,
  isDemo: false,
  data: { rows: [{ value: 1 }] },
  createdAt: "2026-10-08T03:00:00.000Z",
  updatedAt: "2026-10-08T03:00:00.000Z",
  ...extra,
});

/** A record and the same record after a person's step: a new history entry beside the change. */
const stepped = <T extends Record<string, unknown>>(r: T, change: Record<string, unknown>, action = "edited") => ({
  ...r,
  ...change,
  history: [...((r.history as unknown[]) ?? []), entry(action)],
});

function refusal(fn: () => unknown): AccessRefused {
  try {
    fn();
  } catch (err) {
    if (err instanceof AccessRefused) return err;
    throw err;
  }
  assert.fail("the write was not refused");
}

const ids = (value: string): string[] => (JSON.parse(value) as { id: string }[]).map((r) => r.id).sort();

// ---------------------------------------------------------------------------

describe("the catalogue and each person's levels", () => {
  it("reads the stored definitions, places each by its department, and marks the reference documents", () => {
    const docs = catalogueOf(DOCS_JSON);
    assert.equal(docs.length, DOCS.length);
    assert.equal(docs.find((d) => d.id === "qc-viscosity")?.department, "QC");
    assert.equal(docs.find((d) => d.id === "daily-pest-monitoring")?.department, "HR");
    assert.equal(docs.find((d) => d.id === "chemical-master")?.reference, true);
    assert.deepEqual(catalogueOf("not json"), []);
    assert.deepEqual(catalogueOf(null), []);
  });

  it("gives each of the owner's people the levels of his table", () => {
    const ankur = view("ankur");
    assert.equal(ankur.level("qc-viscosity"), "edit", "Ankur answers for F-QC-30");
    assert.equal(ankur.level("qc-inspection-pouching"), "read", "the rest of Quality Control he only views");
    assert.equal(ankur.level("daily-pest-monitoring"), "none", "Human Resources is not his module");
    const kapila = view("kapila");
    assert.equal(kapila.level("qc-inspection-printed-film"), "edit", "she edits all of QC");
    assert.equal(kapila.level("daily-pest-monitoring"), "edit", "she answers for F/HR/17");
    assert.equal(kapila.level("hr-competence"), "read", "the rest she only views");
    assert.equal(kapila.level("prd-alc-production"), "read");
    assert.equal(kapila.readsAll, true);
    const vinay = view("vinay");
    assert.equal(vinay.level("hr-competence"), "edit");
    assert.equal(vinay.level("daily-pest-monitoring"), "read");
    assert.equal(vinay.level("qc-viscosity"), "none");
  });

  it("passes the super admin everything, and leaves an account nobody has described as it was", () => {
    const admin = view("admin");
    assert.equal(admin.boss, true);
    assert.equal(admin.editsAll, true);
    assert.equal(admin.scope, "*");
    assert.equal(admin.modules(), null);
    for (const d of DOCS) assert.equal(admin.level(d.id), "edit");
    const everybody = view("everybody");
    assert.equal(everybody.editsAll, true, "no departments: every module at Edit, as before");
    assert.equal(everybody.scope, "*");
    const clerk = view("qcClerk");
    assert.equal(clerk.level("qc-inspection-pouching"), "edit", "its department at Edit, as before");
    assert.equal(clerk.level("hr-competence"), "none");
    assert.deepEqual(clerk.modules(), ["QC"]);
  });

  it("holds a line only of a document at Read or more (a line naming no document is everybody's)", () => {
    const ankur = view("ankur");
    assert.equal(ankur.holds({ documentId: "qc-inspection-pouching" }), true);
    assert.equal(ankur.holds({ documentId: "hr-competence" }), false);
    assert.equal(ankur.holds({ note: "no document" }), true);
    assert.deepEqual(ankur.modules(), ["QC"]);
  });

  it("follows what the super admin set, a document's setting over its module's", () => {
    const rules = { version: 1, people: { "ankur.raval@gpp.local": { modules: { HR: "read" }, documents: { "qc-viscosity": "read", "qc-inspection-pouching": "write" } } }, responsibility: {} };
    const ankur = view("ankur", rules);
    assert.equal(ankur.level("hr-competence"), "read");
    assert.equal(ankur.level("qc-viscosity"), "read");
    assert.equal(ankur.level("qc-inspection-pouching"), "write");
  });

  it("keys a person's copy by every level they have, so a change of levels is a new copy", () => {
    const before = view("ankur").scope;
    const after = view("ankur", { version: 1, people: { "ankur.raval@gpp.local": { documents: { "qc-inspection-pouching": "write" } } }, responsibility: {} }).scope;
    assert.match(before, /^v:/);
    assert.notEqual(before, after);
    assert.equal(view("ankur").scope, before, "the same levels, the same key");
  });

  it("places a document a record names that the definitions do not, by its id", () => {
    const catalogue = accessCatalogue(DOCS_JSON, null);
    const ankur = viewFor(catalogue, PEOPLE.ankur);
    assert.equal(ankur.level("qc-weight-scale-calibration"), "read", "a QC document he does not answer for");
    assert.ok(catalogue.byId.has("qc-weight-scale-calibration"));
  });
});

describe("the words of a refusal", () => {
  it("names the document, the level the person has and the one to ask for", () => {
    // The website's and Mitra's own sentences (frontend/src/engine/accessWords.ts), so the three never say it differently.
    assert.equal(levelRefusal("This document", "read", "write", "submit"), "This document is Read only for you. Submitting a record needs Write access: ask the super admin for it.");
    assert.equal(levelRefusal("F/QC/37 Inspection Record", "write", "edit", "delete"), "You have Write access to F/QC/37 Inspection Record. Deleting a record needs Edit access: ask the super admin for it.");
    assert.equal(levelRefusal("F/HR/01 Personal Competence Records", "none", "write", "start"), "You do not have access to F/HR/01 Personal Competence Records. Ask the super admin for Write access.");
    assert.equal(levelRefusal("", "read", "edit", "format"), "This document is Read only for you. Changing the format needs Edit access: ask the super admin for it.");
    assert.equal(levelRefusal("F/HR/17", "read", "write", "submit", "gu"), "F/HR/17 તમારા માટે ફક્ત Read છે. રેકોર્ડ જમા કરવા માટે Write ઍક્સેસ જોઈએ: સુપર એડમિનને કહો.");
    assert.equal(levelRefusal("F/HR/17", "read", "write", "submit", "hi"), "F/HR/17 आपके लिए केवल Read है। रिकॉर्ड जमा करने के लिए Write ऐक्सेस चाहिए: सुपर एडमिन से कहें।");
  });

  it("a document is called by its number and name, or its name while the number is to be confirmed", () => {
    const c = new AccessCatalogue(catalogueOf(DOCS_JSON), null);
    assert.equal(c.title("qc-inspection-pouching"), "F/QC/37 Inspection Record - Pouching Process");
    assert.equal(c.title("service-agreement"), "Pest Control Service Agreement");
    assert.equal(c.title("not-a-document"), "This document");
  });
});

describe("a sheet nobody has worked on, and two records the same", () => {
  it("knows the calendar's blank sheet and the assistant's prepared one from a person's", () => {
    assert.equal(untouchedSheet(rec("r", "qc-viscosity", "Due")), true);
    assert.equal(untouchedSheet(rec("r", "qc-viscosity", "Scheduled")), true);
    assert.equal(untouchedSheet(rec("r", "qc-viscosity", "In Progress", { prepared: { at: "x" }, history: [entry("prepared", "Assistant")] })), true);
    assert.equal(untouchedSheet(rec("r", "qc-viscosity", "In Progress", { prepared: { at: "x" }, history: [entry("prepared", "Assistant"), entry("edited")] })), false);
    assert.equal(untouchedSheet(rec("r", "qc-viscosity", "In Progress")), false, "started by a person");
    assert.equal(untouchedSheet(rec("r", "qc-viscosity", "Submitted")), false);
    assert.equal(untouchedSheet(rec("r", "qc-viscosity", "In Progress", { prepared: { at: "x" }, correction: { reason: "r" } })), false);
  });

  it("compares records whatever order their keys were written in", () => {
    assert.equal(sameValue({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 }), true);
    assert.equal(sameValue({ a: 1, b: undefined }, { a: 1 }), true);
    assert.equal(sameValue({ a: [1, 2] }, { a: [2, 1] }), false);
  });
});

describe("what a change of each record needs", () => {
  const base = rec("r1", "qc-inspection-pouching", "In Progress", { history: [entry("edited")] });
  const awaiting = rec("r2", "qc-inspection-pouching", "Pending Verification", { submittedBy: "Kapila Barad", submittedAt: "2026-10-08T06:00:00.000Z", history: [entry("submitted")] });
  const verified = rec("r3", "qc-inspection-pouching", "Verified", { submittedBy: "Kapila Barad", verifiedBy: "Kapila Barad", history: [entry("submitted"), entry("verified")] });
  const one = (stored: unknown[], posted: unknown[]) => {
    const c = recordChanges(stored, posted);
    assert.equal(c.length, 1, JSON.stringify(c));
    return c[0];
  };

  it("start: a record a person started", () => {
    assert.deepEqual(one([], [base]), { recordId: "r1", documentId: "qc-inspection-pouching", kind: "new", actions: ["start"], personal: true });
  });
  it("fill: a change to a record being filled in", () => {
    assert.deepEqual(one([base], [stepped(base, { data: { rows: [{ value: 2 }] } })]).actions, ["fill"]);
  });
  it("submit, verify and send back: the record's moves", () => {
    assert.deepEqual(one([base], [stepped(base, { status: "Pending Verification", submittedBy: "Ankur Raval" }, "submitted")]).actions, ["submit"]);
    assert.deepEqual(one([awaiting], [stepped(awaiting, { status: "Verified", verifiedBy: "Ankur Raval" }, "verified")]).actions, ["verify"]);
    assert.deepEqual(one([awaiting], [stepped(awaiting, { status: "Rejected", rejectionReason: "wrong" }, "rejected")]).actions, ["send_back"]);
  });
  it("resume and hand in again after a send back: the filler's own work", () => {
    const sent = rec("r4", "qc-inspection-pouching", "Rejected", { submittedBy: "x", history: [entry("submitted"), entry("rejected")] });
    assert.deepEqual(one([sent], [stepped(sent, { status: "In Progress" }, "resumed")]).actions, ["fill"]);
    assert.deepEqual(one([sent], [stepped(sent, { status: "Pending Verification" }, "submitted")]).actions, ["submit"]);
  });
  it("correct: reopening a signed-off record, changing one, or cancelling a correction", () => {
    assert.deepEqual(one([verified], [stepped(verified, { status: "In Progress", correction: { reason: "typo", fromStatus: "Verified" } }, "reopened")]).actions, ["correct"]);
    assert.deepEqual(one([verified], [stepped(verified, { data: { rows: [{ value: 9 }] } })]).actions, ["correct"]);
    const underCorrection = rec("r5", "qc-inspection-pouching", "In Progress", { correction: { reason: "typo", fromStatus: "Verified" }, history: [entry("reopened")] });
    assert.deepEqual(one([underCorrection], [stepped(underCorrection, { data: { rows: [{ value: 3 }] } })]).actions, ["correct"]);
    assert.deepEqual(one([underCorrection], [stepped(underCorrection, { status: "Verified", correction: undefined }, "correction-cancelled")]).actions, ["correct"]);
  });
  it("delete: a record gone that somebody had worked on", () => {
    assert.deepEqual(one([verified], []), { recordId: "r3", documentId: "qc-inspection-pouching", kind: "removed", actions: ["delete"], personal: false });
  });
  it("the app's housekeeping: a sheet made, prepared or cleared, and a record changed with no history line", () => {
    const shell = rec("s1", "qc-inspection-pouching", "Due");
    assert.equal(one([], [shell]).personal, false);
    const prepared = { ...shell, status: "In Progress", prepared: { at: "x" }, history: [entry("prepared", "Assistant")] };
    assert.deepEqual(one([shell], [prepared]), { recordId: "s1", documentId: "qc-inspection-pouching", kind: "changed", actions: ["fill"], personal: false });
    assert.equal(one([shell], []).personal, false);
    assert.equal(one([verified], [{ ...verified, headerBlock: { company: "GUJARAT PRINT PACK PUBLICATIONS PVT LTD" } }]).personal, false, "a start-up migration writes no history");
  });
  it("nothing for a record unchanged", () => {
    assert.deepEqual(recordChanges([base], [JSON.parse(JSON.stringify(base))]), []);
  });
});

describe("the records a person writes", () => {
  const theirs = rec("hr-1", "hr-competence", "Verified", { submittedBy: "Vinay Bhojak", history: [entry("submitted"), entry("verified")] });
  const pouching = rec("p-1", "qc-inspection-pouching", "In Progress", { history: [entry("edited", "Kapila Barad")] });
  const viscosity = rec("v-1", "qc-viscosity", "In Progress", { history: [entry("edited", "Ankur Raval")] });
  const stored = JSON.stringify([theirs, pouching, viscosity]);

  it("refuses a Read-only person's own act, in the words of the level (nothing is written)", () => {
    const ankur = view("ankur");
    const err = refusal(() => composeRecords(ankur, stored, [stepped(pouching, { data: { rows: [{ value: 7 }] } }), viscosity]));
    assert.equal(err.body.code, "access-level");
    assert.equal(err.body.error, "F/QC/37 Inspection Record - Pouching Process is Read only for you. Filling in a record needs Write access: ask the super admin for it.");
    assert.deepEqual([err.body.level, err.body.needed, err.body.action, err.body.documentId, err.body.recordId], ["read", "write", "fill", "qc-inspection-pouching", "p-1"]);
    const started = refusal(() => composeRecords(ankur, stored, [pouching, viscosity, rec("new-1", "qc-inspection-pouching", "In Progress")]));
    assert.equal(started.body.action, "start");
    assert.equal(started.body.recordId, undefined, "a record never stored has no id to name");
  });

  it("takes what the level allows, and keeps everyone else's lines as stored", () => {
    const ankur = view("ankur");
    const filled = stepped(viscosity, { data: { rows: [{ value: 42 }] } });
    const out = composeRecords(ankur, stored, [pouching, filled]);
    const written = JSON.parse(out.value) as { id: string; data: unknown }[];
    assert.deepEqual(ids(out.value), ["hr-1", "p-1", "v-1"], "Vinay's HR record is still there, though Ankur's copy never had it");
    assert.deepEqual(written.find((r) => r.id === "v-1")?.data, { rows: [{ value: 42 }] });
    assert.deepEqual(out.kept, []);
    const submitted = composeRecords(ankur, stored, [pouching, stepped(viscosity, { status: "Pending Verification", submittedBy: "Ankur Raval" }, "submitted")]);
    assert.deepEqual(submitted.kept, []);
  });

  it("never takes a line of a document the person does not see, nor loses one", () => {
    const ankur = view("ankur");
    const forged = { ...theirs, status: "In Progress", data: { rows: [] } };
    const out = composeRecords(ankur, stored, [pouching, viscosity, forged]);
    assert.deepEqual((JSON.parse(out.value) as { id: string; status: string }[]).find((r) => r.id === "hr-1")?.status, "Verified");
  });

  it("Write: start, fill, submit, verify and send back; correct and delete need Edit", () => {
    const rules = { version: 1, people: { "ankur.raval@gpp.local": { documents: { "qc-inspection-pouching": "write" } } }, responsibility: {} };
    const ankur = view("ankur", rules);
    assert.deepEqual(composeRecords(ankur, stored, [stepped(pouching, { status: "Pending Verification", submittedBy: "Ankur Raval" }, "submitted"), viscosity]).kept, []);
    const awaitingNow = rec("p-2", "qc-inspection-pouching", "Pending Verification", { submittedBy: "Ankur Raval", history: [entry("submitted")] });
    const s2 = JSON.stringify([theirs, awaitingNow, viscosity]);
    assert.deepEqual(composeRecords(ankur, s2, [stepped(awaitingNow, { status: "Verified", verifiedBy: "Ankur Raval" }, "verified"), viscosity]).kept, [], "as today, whoever may fill may verify, even their own");
    assert.deepEqual(composeRecords(ankur, s2, [stepped(awaitingNow, { status: "Rejected", rejectionReason: "a reading is missing" }, "rejected"), viscosity]).kept, []);
    const reopen = refusal(() => composeRecords(ankur, s2, [stepped(awaitingNow, { status: "In Progress", correction: { reason: "typo" } }, "reopened"), viscosity]));
    assert.equal(reopen.body.error, "You have Write access to F/QC/37 Inspection Record - Pouching Process. Correcting a signed-off record needs Edit access: ask the super admin for it.");
    assert.equal(reopen.body.action, "correct");
    // A record gone that somebody worked on: Edit's to remove. Without it, it stays as stored.
    const gone = composeRecords(ankur, s2, [viscosity]);
    assert.deepEqual(gone.kept, ["p-2"]);
    assert.deepEqual(ids(gone.value), ["hr-1", "p-2", "v-1"]);
    // With Edit it goes.
    const kapila = view("kapila");
    assert.deepEqual(ids(composeRecords(kapila, s2, [theirs, viscosity]).value), ["hr-1", "v-1"]);
  });

  it("leaves the app's housekeeping by a person whose level does not allow it as stored, without a word", () => {
    const ankur = view("ankur");
    const shell = rec("s-1", "qc-inspection-pouching", "Due");
    const withShell = JSON.stringify([theirs, pouching, viscosity, shell]);
    const prepared = { ...shell, status: "In Progress", prepared: { at: "x" }, history: [entry("prepared", "Assistant")] };
    const out = composeRecords(ankur, withShell, [pouching, viscosity, prepared, rec("s-2", "qc-inspection-pouching", "Due", { periodKey: "x:2026-10-09", dueDate: "2026-10-09" })]);
    assert.deepEqual(out.kept.sort(), ["s-1", "s-2"]);
    const written = JSON.parse(out.value) as { id: string; status: string }[];
    assert.equal(written.find((r) => r.id === "s-1")?.status, "Due", "the prepare is the server's, or a filler's, to make");
    assert.equal(written.some((r) => r.id === "s-2"), false, "a sheet a Read-only browser made is not stored");
    // A start-up migration of a signed-off record (no history line): kept as stored for Read.
    const signed = rec("v-9", "qc-inspection-pouching", "Verified", { submittedBy: "x", history: [entry("submitted"), entry("verified")] });
    const s3 = JSON.stringify([signed]);
    const migrated = composeRecords(ankur, s3, [{ ...signed, headerBlock: { company: "NEW NAME" } }]);
    assert.deepEqual(migrated.kept, ["v-9"]);
    assert.equal((JSON.parse(migrated.value) as { headerBlock?: unknown }[])[0].headerBlock, undefined);
  });

  it("refuses a person's step folded into the history entry they already had (two edits within a quarter of an hour)", () => {
    const ankur = view("ankur");
    const folded = { ...pouching, data: { rows: [{ value: 8 }] }, history: [{ ...((pouching as { history?: unknown }).history as { id: string }[])[0], note: "and again" }] };
    assert.equal(refusal(() => composeRecords(ankur, stored, [folded, viscosity])).body.action, "fill");
  });

  it("an account nobody has described keeps its department's documents at Edit", () => {
    const clerk = view("qcClerk");
    const out = composeRecords(clerk, stored, [stepped(pouching, { status: "Verified", verifiedBy: "Clerk" }, "verified"), viscosity]);
    assert.deepEqual(out.kept, []);
    assert.deepEqual(ids(out.value), ["hr-1", "p-1", "v-1"]);
  });

  it("the super admin's write is taken as it is", () => {
    const admin = view("admin");
    const out = composeRecords(admin, stored, [theirs]);
    assert.deepEqual(ids(out.value), ["hr-1"]);
  });
});

describe("the definitions and the format edits", () => {
  it("are Edit's alone: a change to a document the person has not Edit on is refused", () => {
    const ankur = view("ankur");
    const formats = JSON.stringify({ "qc-viscosity": { revisionNo: "01" }, "qc-inspection-pouching": { revisionNo: "00" } });
    assert.deepEqual(changedDocuments("formatEdits", formats, JSON.stringify({ "qc-viscosity": { revisionNo: "02" }, "qc-inspection-pouching": { revisionNo: "00" } })), ["qc-viscosity"]);
    checkFormatChange(ankur, "formatEdits", formats, JSON.stringify({ "qc-viscosity": { revisionNo: "02" }, "qc-inspection-pouching": { revisionNo: "00" } }));
    const err = refusal(() => checkFormatChange(ankur, "formatEdits", formats, JSON.stringify({ "qc-viscosity": { revisionNo: "01" }, "qc-inspection-pouching": { revisionNo: "01" } })));
    assert.equal(err.body.action, "format");
    assert.equal(err.body.needed, "edit");
    const defs = refusal(() => checkFormatChange(ankur, "documents", DOCS_JSON, JSON.stringify(DOCS.map((d) => (d.id === "hr-competence" ? { ...d, name: "Renamed" } : d)))));
    assert.equal(defs.body.documentId, "hr-competence");
    assert.equal(defs.body.level, "none");
    checkFormatChange(view("admin"), "documents", DOCS_JSON, "[]");
  });
});

describe("HR Master Data", () => {
  it("is held by those who see Human Resources and changed by those with Write on one of its documents", () => {
    assert.equal(holdsHrMaster(view("ankur")), false);
    assert.equal(holdsHrMaster(view("vinay")), true);
    assert.equal(writesHrMaster(view("vinay")), true);
    assert.equal(holdsHrMaster(view("kapila")), true, "she views every module");
    assert.equal(writesHrMaster(view("kapila")), true, "she answers for F/HR/15 to 18");
    assert.equal(writesHrMaster(view("chirag")), false);
    assert.equal(holdsHrMaster(view("everybody")), true);
  });
});
