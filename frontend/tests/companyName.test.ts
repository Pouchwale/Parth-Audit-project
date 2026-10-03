// THE COMPANY'S NAME, EVERYWHERE (the owner, 02-Oct-2026): "Gujarat Print Pack
// Publications Pvt Ltd" on every document of every module, in the opening and
// on every screen — and what an installation had already stored brought in
// line at start-up (data/companyNameMigration.ts): a header typed over with an
// old spelling, a format's stored layout, a corrected Statement of Compliance,
// the master data and every record, each changed record with one line in its
// history; a second start finds nothing to do, and a fresh one never had
// anything. Without a browser: the seeds, the engine and the repositories.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { GapInspectionData, LogSheetData, RecordInstance, TrainingRecordData } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { complianceStatement, referenceRepository } from "../src/data/repositories/referenceRepository";
import { COMPANY } from "../src/data/seed/masterData";
import { SEED_DOCUMENTS } from "../src/data/seed/documentDefinitions";
import { COMPLIANCE_STATEMENTS } from "../src/data/seed/complianceStatements";
import { SEED_AWARENESS_TRAINING_RECORD, SEED_GAP_RECORD, SEED_HISTORICAL_RECORDS, SEED_PEST_RESPONSIBILITIES_RECORD } from "../src/data/seed/historicalRecords";
import { getIssuedLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { newServiceAgreementData } from "../src/data/seed/serviceAgreement";
import { formatEditFor, saveFormatEdit, type FormatEdit } from "../src/data/formatEdits";
import { COMPANY_NAME_NOTE, alignCompanyName, isCompanyNameSpelling, withCompanyName, withCompanyNameIn } from "../src/data/companyNameMigration";
import { commitFormatChange, draftOf, printedCompanyName } from "../src/engine/formatOps";
import { historyOf, makeEntry } from "../src/engine/recordHistory";
import { ensureRecordsGeneratedForMonth } from "../src/engine/recordGenerator";
import { prepareDueRecords } from "../src/engine/assistantPrepare";
import { STRINGS } from "../src/i18n/strings";
import { INTRO_COMPANY } from "../src/components/auth/IntroSplash";
import { todayISO } from "../src/utils/date";

const NAME = "GUJARAT PRINT PACK PUBLICATIONS PVT LTD";
const RUNNING = "Gujarat Print Pack Publications Pvt Ltd";
const NOTHING_TO_DO = { formats: 0, statements: 0, master: false, records: 0 };

const repoRoot = process.env.DCRS_REPO_ROOT ?? process.cwd();
const source = (...parts: string[]) => readFileSync(path.join(repoRoot, ...parts), "utf8");
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** The same as stored: a copy that went through storage has no undefined-valued properties left to compare. */
const sameAsStored = (actual: unknown, expected: unknown, message: string) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
const record = (id: string): RecordInstance => {
  const r = recordRepository.getById(id);
  assert.ok(r, `${id} is on file`);
  return r!;
};

// What the app does first on every start (data/bootstrap.ts) — the migration's
// own place in it is checked below.
ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

test("the name, as the owner gave it: capitals on a printed company line, the running-text form everywhere else", () => {
  assert.equal(COMPANY.name, NAME);
  assert.equal(COMPANY.shortName, RUNNING);
  assert.equal(STRINGS.en["nav.brandSubtitle"], RUNNING, "the sidebar");
  assert.equal(STRINGS.gu["nav.brandSubtitle"], RUNNING, "…in Gujarati too: the registered name is never translated");
  assert.equal(INTRO_COMPANY, RUNNING, "the opening (its stylesheet sets it in capitals)");
  const html = source("frontend", "index.html");
  assert.match(html, /<title>Digital Controlled Record System — Gujarat Print Pack Publications Pvt Ltd<\/title>/);
  assert.match(html, /content="The controlled records of Gujarat Print Pack Publications Pvt Ltd — /);
  // No format keeps a spelling of its own: every header prints COMPANY.name.
  const ownSpelling = SEED_DOCUMENTS.filter((d) => d.companyName !== undefined).map((d) => `${d.id}: ${d.companyName}`);
  assert.deepEqual(ownSpelling, [], "no issued format carries a company name of its own");
  for (const d of documentRepository.getAllUnscoped()) assert.equal(printedCompanyName(d), NAME, d.id);
});

test("the papers' own text names the company the owner's way, and no key moved", () => {
  // F/DISP/01: the clause and the four signature labels — under the same keys, which records are kept by.
  const agreement = getIssuedLogSheetLayout("disp-safe-transporter-agreement")!;
  assert.ok(agreement.instructions?.includes(`${NAME} will inspect the vehicle presented by the transport company to ensure that it complies with this Code of Practice before it is loaded with product.`));
  assert.deepEqual(
    agreement.footerFields?.filter((f) => f.key.startsWith("gpp")).map((f) => [f.key, f.label]),
    [
      ["gppName", `For, ${NAME} — Name of the person`],
      ["gppDesignation", `For, ${NAME} — Designation`],
      ["gppSign", `For, ${NAME} — Sign`],
      ["gppDated", `For, ${NAME} — On dated`],
    ]
  );
  // F/QC/25's heading line: the name replaced, its address and document number as printed.
  assert.ok(getIssuedLogSheetLayout("qc-coa-corrugated")!.instructions?.[0].startsWith(`${NAME} 308/9, GIDC DEDIASAN MEHSANA. GUJARAT. — DEPT:QUALITY ASSURENCE (2009 EDITION) — DOC.NO. QA-IP-TRFCBA-011-00-01-09-18`));
  // F/QC/30's location and F/SYS/20's site name, on the paper and on the records seeded from it.
  const minutes = getIssuedLogSheetLayout("qc-minutes-of-meetings")!;
  assert.equal(minutes.headerFields.find((f) => f.key === "location")?.autoFill?.default, RUNNING);
  assert.equal(minutes.specimenHeader?.location, RUNNING);
  assert.equal(minutes.specimenHeader?.clientName, "M/s. Gangwal Healthcare Pvt. Ltd.", "the customer's own name is the customer's");
  assert.equal(getIssuedLogSheetLayout("sys-hara-annual")!.specimenHeader?.siteName, NAME);
  // The Statements of Compliance.
  for (const s of Object.values(COMPLIANCE_STATEMENTS)) {
    assert.deepEqual(s.sections.find((x) => x.label === "Manufacturer")?.lines, [NAME], s.documentId);
  }
  assert.ok(COMPLIANCE_STATEMENTS["soc-labels"].declarations.some((d) => d.startsWith(`${NAME}, hereby declares`)));
  assert.ok(COMPLIANCE_STATEMENTS["soc-labels"].declarations.some((d) => d.includes(`manufactured by ${NAME} and are updated`)));
  // The seeded records: the GAP report's premises, the training's attendees, the two agreements' client.
  assert.equal((SEED_GAP_RECORD.data as GapInspectionData).premisesName, RUNNING);
  assert.deepEqual(new Set((SEED_AWARENESS_TRAINING_RECORD.data as TrainingRecordData).attendees.map((a) => a.department)), new Set([RUNNING]));
  assert.equal(SEED_PEST_RESPONSIBILITIES_RECORD.data.client.organisation, NAME);
  const agreementData = newServiceAgreementData("2026-01-01", "2027-12-31");
  assert.equal(agreementData.client.organisation, NAME);
  assert.equal(agreementData.clientSignatory.organisation, NAME);
  // The client contact's department in the master data.
  assert.equal(masterRepository.get().employees.find((e) => e.id === "emp-kapila")?.department, RUNNING);
});

test("a fresh install has nothing to bring in line: no seed, no layout and no prepared record holds an old spelling", () => {
  const today = new Date(todayISO());
  ensureRecordsGeneratedForMonth(today.getFullYear(), today.getMonth(), { isDemo: false });
  prepareDueRecords();
  for (const d of SEED_DOCUMENTS) {
    const layout = getIssuedLogSheetLayout(d.id);
    if (layout) assert.equal(withCompanyNameIn(layout), layout, `${d.id}'s issued layout`);
  }
  for (const s of Object.values(COMPLIANCE_STATEMENTS)) assert.equal(withCompanyNameIn(s), s, s.documentId);
  for (const r of SEED_HISTORICAL_RECORDS) assert.equal(withCompanyNameIn(r.data), r.data, r.id);
  const before = recordRepository.snapshot();
  assert.deepEqual(alignCompanyName(), NOTHING_TO_DO);
  assert.equal(recordRepository.snapshot(), before, "nothing was even written");
});

test("every spelling of the company's name, and nobody else's", () => {
  const cases: [string, string][] = [
    ["GUJARAT PRINTPACK PUBLICATION PRIVATE LIMITED", NAME],
    ["GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", NAME],
    ["GUJARAT PRINT PACK PUBLICATION LIMITED", NAME],
    ["GUJARAT PRINT PACK PUBLICATIONS PRIVATE LIMITED", NAME],
    ["GUJARAT PRINT PACK PUBLICATIONS LIMITED", NAME],
    ["GUJARAT PRINT PACK PUBLICATIONS PVT. LTD.", NAME],
    ["Gujarat Printpack Publication Pvt. Ltd.", RUNNING],
    ["Gujarat Print Pack Publication Pvt. Ltd.", RUNNING],
    ["Gujarat Print Pack Publications Pvt. Ltd.", RUNNING],
    ["Gujarat Print Pack Publication", RUNNING],
    ["Gujarat Print-Pack Publications Private Limited", RUNNING],
    ["gujarat print pack publications pvt ltd", RUNNING],
    // In running text: the name replaced, the text around it kept.
    ["GUJRAT PRINT PACK PUB.LTD 308/9, GIDC DEDIASAN MEHSANA. GUJARAT.", `${NAME} 308/9, GIDC DEDIASAN MEHSANA. GUJARAT.`],
    ["GUJARAT PRINT PACK PUBLICATIONS PRIVATE LIMITED will inspect the vehicle", `${NAME} will inspect the vehicle`],
    ["For, GUJARAT PRINT PACK PUBLICATIONS PVT. LTD. — Sign", `For, ${NAME} — Sign`],
    ["GUJARAT PRINTPACK PUBLICATION PRIVATE LIMITED, MEHSANA", `${NAME}, MEHSANA`],
    // "Pvt. Ltd." ending a sentence as well: the sentence keeps its full stop.
    ["Products manufactured by Gujarat Print Pack Publications Pvt. Ltd.", `Products manufactured by ${RUNNING}.`],
    ["Held at Gujarat Print Pack Publication Pvt. Ltd. The customer attended.", `Held at ${RUNNING}. The customer attended.`],
    ["Location: Gujarat Print Pack Publication Pvt. Ltd.", `Location: ${RUNNING}`],
    // Already the owner's name, or not this company's at all: left exactly as it is.
    [NAME, NAME],
    [RUNNING, RUNNING],
    [`Signed for ${RUNNING}.`, `Signed for ${RUNNING}.`],
    [`${NAME}, MEHSANA`, `${NAME}, MEHSANA`],
    ["Nivea India Pvt. Ltd.", "Nivea India Pvt. Ltd."],
    ["M/s. Gangwal Healthcare Pvt. Ltd.", "M/s. Gangwal Healthcare Pvt. Ltd."],
    ["Kody Equipments Pvt. Ltd.", "Kody Equipments Pvt. Ltd."],
    ["the Gujarat Print Pack Leave Calendar 2026 (Master Data → Holidays)", "the Gujarat Print Pack Leave Calendar 2026 (Master Data → Holidays)"],
    ["GUJARAT PRINT PACK", "GUJARAT PRINT PACK"],
    ["info@gujprintpack.com  www.gujprintpack.com", "info@gujprintpack.com  www.gujprintpack.com"],
    ["Print Packaging", "Print Packaging"],
    ["SOMEBODY ELSE PVT. LTD.", "SOMEBODY ELSE PVT. LTD."],
  ];
  for (const [text, expected] of cases) {
    assert.equal(withCompanyName(text), expected, text);
    assert.equal(withCompanyName(expected), expected, `${text}: brought in line once, it stays as it is`);
  }
  // A company name typed over a header that is only a spelling of the name, old or new.
  for (const s of ["GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", "GUJARAT PRINT PACK PUBLICATIONS PVT. LTD.", " gujarat print pack publications pvt ltd ", NAME, RUNNING]) {
    assert.equal(isCompanyNameSpelling(s), true, s);
  }
  for (const s of [`${NAME}, MEHSANA`, "SOMEBODY ELSE PVT. LTD.", "Gujarat Print Pack Leave Calendar 2026", ""]) assert.equal(isCompanyNameSpelling(s), false, s);
  // Nothing to change: the very same object back, never a copy.
  const clean = { a: [{ id: "x", b: "Nivea India Pvt. Ltd." }], n: 3, nothing: null };
  assert.equal(withCompanyNameIn(clean), clean);
  // Something to change: a new object, the old one as it was.
  const old = { rows: [{ id: "gujarat print pack publication", department: "Gujarat Printpack Publication Pvt. Ltd." }] };
  const frozen = JSON.stringify(old);
  const next = withCompanyNameIn(old);
  assert.notEqual(next, old);
  assert.equal(JSON.stringify(old), frozen, "nothing changed in place");
  assert.deepEqual(next, { rows: [{ id: "gujarat print pack publication", department: RUNNING }] }, "an id is an identifier, never words");
});

test("an old spelling typed over a header is stored as a change, and the next start brings the header back to the owner's name", () => {
  const id = "hr-skill-matrix";
  const typed = commitFormatChange(documentRepository.getByIdUnscoped(id)!, { ...draftOf(documentRepository.getByIdUnscoped(id)!), companyName: "GUJARAT PRINTPACK PUBLICATION PRIVATE LIMITED" }, { actor: "Test Desk", reason: "as the old paper" });
  assert.ok(typed.ok, JSON.stringify(typed));
  assert.equal(formatEditFor(id)?.companyName, "GUJARAT PRINTPACK PUBLICATION PRIVATE LIMITED", "it differs from the registered name, so it is stored");
  const result = alignCompanyName();
  assert.equal(result.formats, 1);
  assert.equal(formatEditFor(id)?.companyName, undefined);
  assert.equal(formatEditFor(id)?.revisionNo, typed.ok ? typed.revision.revisionNo : "", "the revision it made stays");
  assert.equal(printedCompanyName(documentRepository.getByIdUnscoped(id)!), NAME);
  assert.deepEqual(alignCompanyName(), NOTHING_TO_DO);
});

test("what an installation already stored is brought in line once: formats, statements, master data and every record, keys untouched", () => {
  // --- what an earlier version left stored -------------------------------------------
  const OLD_NAME = "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED";
  const asStoredBefore = <T>(x: T, oldName: string): T => JSON.parse(JSON.stringify(x).split(NAME).join(oldName).split(RUNNING).join("Gujarat Print Pack Publication Pvt. Ltd.")) as T;
  const revisions = [{ id: "rev-1", revisionNo: "02", revisionDate: "2026-09-01", by: "Kapila Barad", at: "2026-09-01T10:00:00.000Z", reason: "the letterhead", summary: `changed the company name to “${OLD_NAME}”` }];
  const edits: Record<string, FormatEdit> = {
    // Only a spelling of the name: dropped, so the header prints the owner's.
    "mkt-customer-feedback": { revisionNo: "02", revisionDate: "2026-09-01", companyName: OLD_NAME, revisions },
    "hr-competence": { revisionNo: "02", revisionDate: "2026-09-01", companyName: RUNNING, revisions: [] },
    // More than the name: the plant's addition kept, the name inside it brought in line.
    "daily-pest-monitoring": { revisionNo: "03", revisionDate: "2026-09-26", companyName: "GUJARAT PRINTPACK PUBLICATION PRIVATE LIMITED, MEHSANA", revisions: [] },
    // Not this company's name at all: left alone.
    "fly-catcher": { revisionNo: "03", revisionDate: "2026-09-26", companyName: "SOMEBODY ELSE PVT. LTD.", revisions: [] },
    // Stored layout copies, written with the paper's spellings.
    "disp-safe-transporter-agreement": { revisionNo: "01", revisionDate: "2026-09-20", layout: asStoredBefore(getIssuedLogSheetLayout("disp-safe-transporter-agreement")!, "GUJARAT PRINT PACK PUBLICATIONS PRIVATE LIMITED"), revisions: [] },
    "qc-minutes-of-meetings": { revisionNo: "02", revisionDate: "2026-09-20", layout: asStoredBefore(getIssuedLogSheetLayout("qc-minutes-of-meetings")!, OLD_NAME), revisions: [] },
  };
  for (const [id, edit] of Object.entries(edits)) saveFormatEdit(id, edit);
  const storedLayout = formatEditFor("disp-safe-transporter-agreement")!.layout!;
  assert.ok(JSON.stringify(storedLayout).includes("For, GUJARAT PRINT PACK PUBLICATIONS PRIVATE LIMITED — Sign"), "the stored copy reads the old way to start with");

  referenceRepository.save("soc-labels", asStoredBefore(COMPLIANCE_STATEMENTS["soc-labels"], "GUJARAT PRINT PACK PUBLICATION LIMITED"), "Kapila Barad");
  const corrected = referenceRepository.get("soc-labels")!;

  const master = masterRepository.get();
  masterRepository.update({
    employees: [
      ...master.employees.map((e) => (e.id === "emp-kapila" ? { ...e, department: "Gujarat Printpack Publication Pvt. Ltd." } : e)),
      { id: "emp-customer-contact", name: "A. Shah", role: "Customer's buyer", department: "Nivea India Pvt. Ltd.", active: true },
    ],
  });

  const stamp = "2026-09-20T09:00:00.000Z";
  const gap: RecordInstance = { ...copy(SEED_GAP_RECORD as RecordInstance), id: "gap-old-name", data: { ...copy(SEED_GAP_RECORD.data), premisesName: "Gujarat Print Pack Publications Pvt. Ltd." }, updatedAt: stamp };
  const training: RecordInstance = asStoredBefore({ ...copy(SEED_AWARENESS_TRAINING_RECORD as RecordInstance), id: "training-old-name", updatedAt: stamp }, OLD_NAME);
  const draftMinutes: RecordInstance = {
    id: "minutes-old-name",
    documentId: "qc-minutes-of-meetings",
    periodKey: "2026-09-20",
    dueDate: "2026-09-20",
    status: "In Progress",
    isDemo: false,
    data: { header: { clientName: "M/s. Gangwal Healthcare Pvt. Ltd.", location: "Gujarat Print Pack Publication Pvt. Ltd.", subject: "Quality issues" }, rows: [{ id: "row-1", keyPointsDiscussed: "Shade cards to be sent by Gujarat Print Pack Publication Pvt. Ltd. The customer agreed." }] } satisfies LogSheetData,
    createdAt: stamp,
    updatedAt: stamp,
  };
  const inCorrection: RecordInstance = {
    ...copy(draftMinutes),
    id: "minutes-in-correction",
    status: "In Progress",
    submittedBy: "QA",
    submittedAt: stamp,
    correction: { reason: "a typing mistake", by: "QA", at: stamp, fromStatus: "Verified", dataBefore: copy(draftMinutes.data) },
  };
  // A clean-up made a moment before at the same start ("System", one minute ago): ours is still a line of its own.
  const justCleaned: RecordInstance = { ...copy(draftMinutes), id: "minutes-just-cleaned", history: [{ ...makeEntry("edited", "System", { note: "an earlier clean-up of this start" }), at: new Date(Date.now() - 60_000).toISOString() }] };
  const untouched: RecordInstance = { ...copy(draftMinutes), id: "minutes-other-company", data: { header: { clientName: "Nivea India Pvt. Ltd.", location: "Mehsana" }, rows: [{ id: "row-1", keyPointsDiscussed: "Dates as the Gujarat Print Pack Leave Calendar 2026 has them." }] } };
  const changedRecords = [gap, training, draftMinutes, inCorrection, justCleaned];
  recordRepository.upsertMany([...changedRecords, untouched]);
  const before = new Map([...changedRecords, untouched].map((r) => [r.id, record(r.id)] as const));

  // --- one start ------------------------------------------------------------------------
  const first = alignCompanyName();
  assert.deepEqual(first, { formats: 5, statements: 1, master: true, records: changedRecords.length });

  // formatEdits
  assert.equal(formatEditFor("mkt-customer-feedback")?.companyName, undefined, "an old spelling typed over the header is dropped");
  assert.equal(formatEditFor("mkt-customer-feedback")?.revisionNo, "02", "…the format's revision is not");
  assert.deepEqual(formatEditFor("mkt-customer-feedback")?.revisions, revisions, "…and its change history is history: left as written");
  assert.equal(formatEditFor("hr-competence")?.companyName, undefined, "the owner's name in other letters is dropped too");
  assert.equal(formatEditFor("daily-pest-monitoring")?.companyName, `${NAME}, MEHSANA`);
  assert.equal(formatEditFor("fly-catcher")?.companyName, "SOMEBODY ELSE PVT. LTD.");
  for (const id of ["mkt-customer-feedback", "hr-competence"]) assert.equal(printedCompanyName(documentRepository.getByIdUnscoped(id)!), NAME, id);
  const layout = formatEditFor("disp-safe-transporter-agreement")!.layout!;
  sameAsStored(layout, getIssuedLogSheetLayout("disp-safe-transporter-agreement"), "the stored copy reads as the issued one now — clause, labels and all");
  assert.deepEqual(
    layout.footerFields?.map((f) => f.key),
    storedLayout.footerFields?.map((f) => f.key),
    "every key as it was: gppName, gppDesignation, gppSign, gppDated, …"
  );
  const minutesLayout = formatEditFor("qc-minutes-of-meetings")!.layout!;
  assert.equal(minutesLayout.headerFields.find((f) => f.key === "location")?.autoFill?.default, RUNNING);
  assert.equal(minutesLayout.specimenHeader?.location, RUNNING);
  assert.equal(minutesLayout.specimenHeader?.clientName, "M/s. Gangwal Healthcare Pvt. Ltd.");

  // referenceEdits
  const statement = referenceRepository.get<typeof COMPLIANCE_STATEMENTS["soc-labels"]>("soc-labels")!;
  assert.deepEqual(statement.data.sections.find((s) => s.label === "Manufacturer")?.lines, [NAME]);
  assert.ok(statement.data.declarations[0].startsWith(`${NAME}, hereby declares`));
  assert.equal(statement.data.documentId, "soc-labels");
  assert.equal(statement.editedBy, corrected.editedBy, "who corrected it stays");
  assert.equal(statement.editedAt, corrected.editedAt, "…and when");
  sameAsStored(complianceStatement("soc-labels"), COMPLIANCE_STATEMENTS["soc-labels"], "the corrected statement reads as the issued one");

  // master
  const employees = masterRepository.get().employees;
  assert.equal(employees.find((e) => e.id === "emp-kapila")?.department, RUNNING);
  assert.equal(employees.find((e) => e.id === "emp-customer-contact")?.department, "Nivea India Pvt. Ltd.", "another company's name is that company's");

  // records
  assert.equal((record("gap-old-name").data as GapInspectionData).premisesName, RUNNING);
  assert.deepEqual(new Set((record("training-old-name").data as TrainingRecordData).attendees.map((a) => a.department)), new Set([RUNNING]));
  const minutes = record("minutes-old-name").data as LogSheetData;
  assert.equal(minutes.header.location, RUNNING);
  assert.equal(minutes.header.clientName, "M/s. Gangwal Healthcare Pvt. Ltd.");
  assert.equal(minutes.rows[0].keyPointsDiscussed, `Shade cards to be sent by ${RUNNING}. The customer agreed.`);
  const reopened = record("minutes-in-correction");
  assert.equal((reopened.correction?.dataBefore as LogSheetData).header.location, RUNNING, "what Cancel edit would put back is in line too");
  assert.equal(record("minutes-other-company"), before.get("minutes-other-company"), "a record with nothing to change is not even rewritten");
  for (const r of changedRecords) {
    const was = before.get(r.id)!;
    const now = record(r.id);
    const added = (now.history ?? []).slice(historyOf(was).length);
    assert.equal(added.length, 1, `${r.id}: one line in its history`);
    assert.deepEqual(now.history?.slice(0, historyOf(was).length), historyOf(was), `${r.id}: what its history said before is kept`);
    assert.equal(added[0].note, COMPANY_NAME_NOTE);
    assert.equal(added[0].by, "System");
    assert.ok((added[0].changes ?? []).length >= 1, `${r.id}: the line says what changed`);
    for (const k of ["status", "dueDate", "periodKey", "updatedAt", "submittedBy", "submittedAt", "verifiedBy", "verifiedAt", "documentId"] as const) {
      assert.equal(now[k], was[k], `${r.id}: its ${k} is untouched`);
    }
    assert.deepEqual(Object.keys(now.data as object), Object.keys(was.data as object), `${r.id}: the same keys`);
  }
  assert.equal(COMPANY_NAME_NOTE, "Company name brought in line: Gujarat Print Pack Publications Pvt Ltd (owner's decision, 2-Oct-2026)");

  // --- the next start -----------------------------------------------------------------
  const after = new Map(changedRecords.map((r) => [r.id, record(r.id)] as const));
  assert.deepEqual(alignCompanyName(), NOTHING_TO_DO, "a second start changes nothing");
  for (const r of changedRecords) assert.equal(record(r.id), after.get(r.id), `${r.id}: not rewritten, no second line`);
});

test("the start-up brings the name in line after its other clean-ups and before the month's records are made and prepared", () => {
  const boot = source("frontend", "src", "data", "bootstrap.ts");
  const at = (call: string) => {
    const i = boot.indexOf(call);
    assert.ok(i >= 0, `bootstrap calls ${call}`);
    return i;
  };
  assert.ok(at("alignCompanyName();") > at("pinSchedulesWrittenOnRev00();"));
  assert.ok(at("alignCompanyName();") > at("alignTubeLightDates();"));
  assert.ok(at("alignCompanyName();") < at("ensureRecordsGeneratedForMonth("));
  assert.ok(at("alignCompanyName();") < at("prepareDueRecords();"));
});
