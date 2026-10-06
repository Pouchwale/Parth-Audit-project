// THE PRODUCTION MODULE (REQUIREMENTS §91), without a browser: the engine and the repositories.
//
// On 06-Oct-2026 the owner sent the plant's production formats, "add those documents perfectly without any mistake
// in the module called production module". These tests hold the module to the papers:
//   * each format's boxes, headings, notes and checklist are the company's own originals' text, in their order;
//   * each carries its paper's number (written as the paper writes it) and revision, sits in its section of the
//     Production module, belongs to Production, and downloads as the company's kind of file (a workbook);
//   * the module is named Production, in English and Gujarati, and its old address still opens it;
//   * none of them is "on the Master List, not in DCRS yet" any more, except F-PRD-25, sent as an empty workbook;
//   * Mitra finds each by its number in both spellings and by its whole name, and asks which when words name more
//     than one; a sample fill passes the submit checks; the slitting and doctoring weights add up.
// Run: npm run test:unit -- production
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, LogSheetData, LogSheetLayout, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { MODULE_SECTIONS, PRODUCTION_SECTIONS, SEED_DOCUMENTS } from "../src/data/seed/documentDefinitions";
import { DOCUMENT_DEPARTMENTS } from "../src/data/seed/documentDepartments";
import { departmentOfDocument } from "../src/data/seed/departments";
import { PRODUCTION_LAYOUT_IDS } from "../src/data/seed/productionLayouts";
import { STRINGS } from "../src/i18n/strings";
import { matchDocuments } from "../src/engine/assistantLocal";
import { documentsByFormatNumber } from "../src/engine/formatNumbers";
import { findDocuments, masterListFormatsNotInDcrs } from "../src/engine/documentFinder";
import { resolveResponsibleEmployees } from "../src/engine/documentInfo";
import { createDefaultData } from "../src/engine/recordDefaults";
import { sampleFillRecord } from "../src/engine/sampleFill";
import { autoFillRecord } from "../src/engine/autoFill";
import { validateForSubmit } from "../src/engine/validation";
import { PURPOSE_MODULES } from "../src/engine/purpose";
import { documentFileKind } from "../src/utils/documentExport";
import { currentAddress, currentModuleSlug, moduleSlug } from "../src/utils/moduleSlug";
import { addDays, todayISO } from "../src/utils/date";
import { DAILY_SHEET_MONTHS_BACK, ensureDemoRecordsGeneratedForYear, RECENT_DAILY_SHEETS } from "../src/data/demoGenerator";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { noProblems } from "./support/catalogue";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();

const doc = (id: string): DocumentDefinition => {
  const d = documentRepository.getByIdUnscoped(id);
  assert.ok(d, `${id} is in the catalogue`);
  return d!;
};
const layout = (id: string): LogSheetLayout => {
  const l = getLogSheetLayout(id);
  assert.ok(l, `${id} has a layout`);
  return l!;
};
const labels = (id: string) => layout(id).columns.map((c) => c.label);
const boxes = (id: string) => layout(id).headerFields.map((f) => f.label);
const groups = (id: string) => layout(id).columns.map((c) => c.group ?? "");

/** The nine Production formats in DCRS: number, revision, revision date, section, schedule. */
const FORMATS: { id: string; formatNo: string; rev: string; revDate: string; section: string; schedule: string }[] = [
  { id: "prd-sharp-object-issue", formatNo: "F/PRD/10", rev: "00", revDate: "2021-12-01", section: "Sharp Objects & Blades", schedule: "daily" },
  { id: "prd-alc-production", formatNo: "F-PRD-18", rev: "01", revDate: "2025-06-25", section: "Lamination", schedule: "daily" },
  { id: "prd-process-parameter", formatNo: "F-PRD-19", rev: "00", revDate: "2024-12-15", section: "Lamination", schedule: "daily" },
  { id: "prd-slitting-alc", formatNo: "F-PRD-20", rev: "01", revDate: "2025-06-25", section: "Slitting", schedule: "daily" },
  { id: "prd-pouching-line-clearance", formatNo: "F/PRD/21", rev: "00", revDate: "2024-12-15", section: "Pouching", schedule: "as-required" },
  { id: "prd-pouching-blade", formatNo: "F/PRD/22", rev: "00", revDate: "2024-12-15", section: "Sharp Objects & Blades", schedule: "daily" },
  { id: "prd-pouching-cutter-issue", formatNo: "F/PRD/23", rev: "00", revDate: "2025-12-15", section: "Sharp Objects & Blades", schedule: "daily" },
  { id: "prd-slitting-blade", formatNo: "F/PRD/24", rev: "00", revDate: "2024-12-15", section: "Sharp Objects & Blades", schedule: "daily" },
  { id: "prd-doctoring-alc", formatNo: "F-PRD-26", rev: "01", revDate: "2025-07-23", section: "Doctoring", schedule: "daily" },
];
const IDS = FORMATS.map((f) => f.id);

/** The long dash the papers never print (the old module name had one). */
const EM_DASH = String.fromCharCode(0x2014);

/** "F-PRD-20" written the other way, "F/PRD/20", and back. */
const otherSpelling = (formatNo: string) => (formatNo.includes("/") ? formatNo.replace(/\//g, "-") : formatNo.replace(/-/g, "/"));

// ---------------------------------------------------------------------------
// the module

test("the Production module holds the nine formats, in the five sections of the floor", () => {
  const production = SEED_DOCUMENTS.filter((d) => d.module === "Production").map((d) => d.id);
  assert.deepEqual([...production].sort(), [...IDS].sort(), "the module holds exactly the nine");
  assert.ok(!SEED_DOCUMENTS.some((d) => d.module.includes("Lamination") && d.module.includes("Production")), "no document is left in the old module");
  assert.deepEqual([...PRODUCTION_SECTIONS], ["Lamination", "Slitting", "Pouching", "Doctoring", "Sharp Objects & Blades"]);
  for (const s of PRODUCTION_SECTIONS) assert.ok(MODULE_SECTIONS.includes(s), `${s} orders the Document Library`);
  const problems: string[] = [];
  for (const f of FORMATS) {
    const d = doc(f.id);
    if (d.section !== f.section) problems.push(`${f.id}: section ${d.section}, expected ${f.section}`);
    if (d.department !== "Production") problems.push(`${f.id}: department ${d.department}`);
    if (d.kind !== "log-sheet") problems.push(`${f.id}: kind ${d.kind}`);
  }
  noProblems("Production formats out of place", problems);
  // The Lamination section lists F-PRD-18 before F-PRD-19, and the blades and cutters in their numbers' order.
  const order = SEED_DOCUMENTS.filter((d) => d.module === "Production").map((d) => d.formatNo);
  assert.deepEqual(order, ["F-PRD-18", "F-PRD-19", "F-PRD-20", "F/PRD/21", "F-PRD-26", "F/PRD/10", "F/PRD/22", "F/PRD/23", "F/PRD/24"]);
});

test("the module is named Production in English and in Gujarati, with a link for each format", () => {
  const en = STRINGS.en as Record<string, string | undefined>;
  const gu = STRINGS.gu as Record<string, string | undefined>;
  assert.equal(en["module.Production"], "Production");
  assert.equal(gu["module.Production"], "ઉત્પાદન");
  assert.deepEqual(Object.keys(en).filter((k) => k.startsWith("module.") && k.includes("Lamination") && k.includes("Production")), [], "the old name is gone from the tables");
  for (const key of [
    "nav.productionDocs",
    "nav.prdLamination",
    "nav.prdSlitting",
    "nav.prdPouching",
    "nav.prdDoctoring",
    "nav.prdSharpObjects",
    "nav.prdAlcProduction",
    "nav.prdProcessParameter",
    "nav.prdSlittingAlc",
    "nav.prdPouchingLineClearance",
    "nav.prdDoctoringAlc",
    "nav.prdSharpObjectIssue",
    "nav.prdPouchingBlade",
    "nav.prdPouchingCutterIssue",
    "nav.prdSlittingBlade",
  ]) {
    assert.ok(en[key]?.trim(), `${key} in English`);
    assert.ok(gu[key]?.trim(), `${key} in Gujarati`);
  }
  assert.ok(PURPOSE_MODULES.includes("Production") && !PURPOSE_MODULES.some((m) => m.includes("Lamination") && m.includes("Production")), "Mitra says why its records matter");
});

test("the module's address is /library/production, and its old address still opens it", () => {
  assert.equal(moduleSlug("Production"), "production");
  assert.equal(currentModuleSlug("lamination-production"), "production");
  assert.equal(currentModuleSlug("maintenance"), "maintenance", "every other slug is itself");
  assert.equal(currentModuleSlug(undefined), undefined);
  assert.equal(currentAddress("/library/lamination-production"), "/library/production", "the sidebar lights the module's link");
  assert.equal(currentAddress("/files/lamination-production/2026-06-01/2026-08-31"), "/files/production/2026-06-01/2026-08-31");
  assert.equal(currentAddress("/library/lamination-quality-control"), "/library/lamination-quality-control", "Lamination Quality Control is not moved");
  assert.ok(SEED_DOCUMENTS.some((d) => moduleSlug(d.module) === currentModuleSlug("lamination-production")), "the old slug finds the module");
});

// ---------------------------------------------------------------------------
// the numbers

test("each format carries its paper's number and revision, in its department, as a workbook", () => {
  const problems: string[] = [];
  for (const f of FORMATS) {
    const d = doc(f.id);
    if (d.formatNo !== f.formatNo) problems.push(`${f.id}: number ${d.formatNo}, the paper prints ${f.formatNo}`);
    if (d.revisionNo !== f.rev || d.revisionDate !== f.revDate) problems.push(`${f.id}: Rev ${d.revisionNo} of ${d.revisionDate}, the paper prints ${f.rev} of ${f.revDate}`);
    if (d.schedule.type !== f.schedule) problems.push(`${f.id}: scheduled ${d.schedule.type}, expected ${f.schedule}`);
    if (departmentOfDocument(f.id, d.formatNo) !== "PRD" || DOCUMENT_DEPARTMENTS[f.id] !== "PRD") problems.push(`${f.id}: not Production's`);
    if (documentFileKind(d) !== "xlsx") problems.push(`${f.id}: downloads as ${documentFileKind(d)}, not the company's workbook`);
    if (!/\.xlsx?\b/.test(d.sourceFile) || !/\.pdf\b/.test(d.sourceFile)) problems.push(`${f.id}: sourceFile cites the PDF and the original: ${d.sourceFile}`);
    if (d.companyName !== undefined) problems.push(`${f.id}: sets a company name of its own`);
  }
  noProblems("Production formats not as their papers print them", problems);
  // F-PRD-19's number was under the clip of the photograph (§12); the paper of 06-Oct-2026 prints it.
  assert.ok(!doc("prd-process-parameter").description.includes("TO BE CONFIRMED"));
});

test("each is found by its number however it is written: F-PRD-20 and F/PRD/20, F/PRD/21 and F-PRD-21", () => {
  const problems: string[] = [];
  for (const f of FORMATS) {
    for (const written of [f.formatNo, otherSpelling(f.formatNo), f.formatNo.toLowerCase(), otherSpelling(f.formatNo).toLowerCase()]) {
      const byNumber = documentsByFormatNumber(written).map((d) => d.id);
      if (byNumber.length !== 1 || byNumber[0] !== f.id) problems.push(`"${written}" (search, Mitra): ${byNumber.join(", ") || "nothing"}`);
      const found = findDocuments(written).filter((x) => x.kind === "yours").map((x) => (x.kind === "yours" ? x.doc.id : ""));
      if (!found.includes(f.id)) problems.push(`"${written}" (the Search page): ${found.join(", ") || "nothing"}`);
      const said = matchDocuments(`open ${written}`);
      if (said.length !== 1 || said[0] !== f.id) problems.push(`Mitra, "open ${written}": ${said.join(", ") || "nothing"}`);
    }
  }
  noProblems("A Production format not found by its number", problems);
});

test("none of the formats sent on 06-Oct-2026 is on the master list as not in DCRS, but F-PRD-25, sent empty", () => {
  const notYet = masterListFormatsNotInDcrs().map((l) => l.formatNo);
  for (const no of ["F-PRD-10", "F-PRD-18", "F-PRD-19", "F-PRD-20", "F-PRD-21", "F-PRD-22", "F-PRD-23", "F-PRD-24", "F-PRD-26"]) {
    assert.ok(!notYet.includes(no), `${no} is no longer listed as not in DCRS yet`);
  }
  // Its .xlsx has three empty sheets: there is no form to build, so the list still says so (REQUIREMENTS §91).
  assert.ok(notYet.includes("F-PRD-25"), "F-PRD-25 is still on the list only");
});

// ---------------------------------------------------------------------------
// the papers, word for word

test("F/PRD/10 prints its stock note, eight headings under four, and its two filled lines", () => {
  const l = layout("prd-sharp-object-issue");
  assert.deepEqual(l.instructions, ["(Scissor stock - 15 Nos & Cutter Blade - 20 Nos to be maintained including Issued to Operator as well as available in Cup board)"]);
  assert.deepEqual(boxes("prd-sharp-object-issue"), []);
  assert.deepEqual(labels("prd-sharp-object-issue"), ["Date", "Shift", "Scissor", "Manual cutter", "Scissor", "Manual cutter", "Scissor", "Cutter blade", "Scissor", "Cutter blade", "Supervisor Sign", "Remarks"]);
  assert.deepEqual(groups("prd-sharp-object-issue"), [
    "",
    "",
    "Description of Sharp Metal Object Issued",
    "Description of Sharp Metal Object Issued",
    "Description of Sharp Metal Object Returned",
    "Description of Sharp Metal Object Returned",
    "Broken / Damaged or Worn-out Qty. if any",
    "Broken / Damaged or Worn-out Qty. if any",
    "New Qty. Issued if any",
    "New Qty. Issued if any",
    "",
    "",
  ]);
  const lines = l.specimenRows ?? [];
  assert.equal(lines.length, 2, "the paper's two filled lines");
  assert.deepEqual(
    lines.map((r) => [r.date, r.shift, r.issuedScissor, r.issuedManualCutter, r.returnedScissor, r.returnedManualCutter, r.brokenScissor, r.brokenCutterBlade, r.newScissor, r.newCutterBlade, r.remarks]),
    [
      ["2021-12-01", "I", 12, 13, 12, 13, "Nil", "Nil", "NA", "NA", ""],
      ["2021-12-02", "", 12, 13, 12, 13, "Nil", "1", "NA", "1", "Cutter blade worn out"],
    ]
  );
  assert.equal(doc("prd-sharp-object-issue").name, "Daily Issue & Return of Sharp Metal Object (Scisssor / Manual Cutter) Monitoring Record", "SCISSSOR as printed");
});

test("F-PRD-18 and F-PRD-19 read as their originals now: boxes, headings and the ALC PROTOCOL", () => {
  assert.deepEqual(boxes("prd-alc-production"), ["OPERATOR NAME :", "MACHINE NAME :", "DATE & SHIFT :"]);
  assert.deepEqual(labels("prd-alc-production"), [
    "FG CODE",
    "INTERNAL PO No.",
    "JOB NAME",
    "LAYER 1 TYPE",
    "LAYER 1 - Kgs.",
    "LAYER 2 TYPE",
    "LAYER 2 - Kgs.",
    "ALC DONE AS PER ABOVE (YES/NO)",
    "OPERATOR SIGN",
    "START TIME",
    "END TIME",
    "LAMINATED ROLL WEIGHT -  Kgs.",
    "OK METERs",
    "IN TIME (HOTROOM)",
  ]);
  assert.deepEqual(layout("prd-alc-production").instructions, [
    "ALC PROTOCOL : Activity to make sure a production line & its processing area are completely cleared of any material from the previous process",
    "(1) Balance roll & scrap of Previous Job removed ? (2) Film type & Width for Current Job verified as per New Job order ? (3) Job change waste removed ? (4) Finished Product Rolls of Previous Job shifted to designated place / Finish Goods Warehouse ? (5) Tools & Tackles if any, removed from machine & put safely in toll box ?",
  ]);
  assert.deepEqual(boxes("prd-process-parameter"), [
    "OPERATOR NAME :",
    "MACHINE NAME :",
    "DATE & SHIFT :",
    "ADHESIVE + HARDENER + SOLVENT MIXING RATIO :",
    "ADHESIVE (MAKE) :",
    "ADHESIVE (PRODUCT CODE) :",
    "ADHESIVE (BATCH NUMBER) :",
    "HARDENER (MAKE) :",
    "HARDENER (PRODUCT CODE) :",
    "HARDENER (BATCH NUMBER) :",
  ]);
  assert.deepEqual(labels("prd-process-parameter"), [
    "INTERNAL PO No.",
    "FG CODE",
    "JOB NAME",
    "COATING NIP PRESSURE",
    "DOCTOR BLADE PRESSURE",
    "PRIMARY U/W TENSION",
    "LAY ON ROLL PRESSURE",
    "HOOD A TEMP.",
    "HOOD B TEMP.",
    "LINE SPEET",
    "REWINDER TENSION",
    "SECONDARY U/W TENSION",
    "TAPPER TENSION",
    "LAMINATOR NIP PRESSUTE",
    "LAMINATION NIP TEMP.",
  ]);
  // The keys are the ones every record on file was written with.
  assert.deepEqual(layout("prd-alc-production").headerFields.map((f) => f.key), ["operatorName", "machineName", "shift"]);
  // DATE & SHIFT is written by the person, as on the paper: never carried, never defaulted.
  for (const id of ["prd-alc-production", "prd-process-parameter", "prd-slitting-alc", "prd-doctoring-alc"]) {
    const box = layout(id).headerFields.find((f) => f.label === "DATE & SHIFT :");
    assert.ok(box && box.type === "text" && !box.autoFill && !box.required, `${id}: DATE & SHIFT is the person's`);
  }
});

test("F-PRD-20 and F-PRD-26 print their line clearance points and their own headings", () => {
  const definition = "Line Clearance * :  Activity to make sure a production line & its processing area are completely cleared of any material from the previous process";
  const slitting = layout("prd-slitting-alc");
  assert.equal(slitting.instructions?.[0], definition);
  assert.ok(/^\(1\) Printed \/ Unprinted Rolls of Previous Job.*\(7\) Cutter blade position set as per new job size & excess blade \/ blade holder isolated$/.test(slitting.instructions?.[1] ?? ""), "seven points");
  assert.deepEqual(boxes("prd-slitting-alc"), ["OPERATOR NAME :", "MACHINE NAME :", "DATE & SHIFT :"]);
  assert.deepEqual(labels("prd-slitting-alc"), [
    "FG CODE",
    "INTERNAL PO No.",
    "JOB NAME",
    "OUT TIME (HOTROOM)",
    "FILM LAYER",
    "INPUT ROLL (Kgs.)",
    "INPUT ROLL WIDTH (mm)",
    "ALC DONE AS PER ABOVE (YES/NO)",
    "OPERATOR SIGN",
    "START TIME",
    "END TIME",
    "OUTPUT ROLL (Kgs.)",
    "OUT PUT ROLL WIDTH (mm)",
    "WASTAGE (Kgs)",
    "OK METERs",
  ]);
  const doctoring = layout("prd-doctoring-alc");
  assert.equal(doctoring.instructions?.[0], definition);
  assert.ok(/\(6\) Finished DOCTORING Rolls of Previous Job shifted to designated place \/ Finish Goods Warehouse \?$/.test(doctoring.instructions?.[1] ?? ""), "six points");
  assert.deepEqual(boxes("prd-doctoring-alc"), ["OPERATOR NAME :", "DATE & SHIFT :"], "no MACHINE NAME box: the paper prints an empty cell there");
  assert.deepEqual(labels("prd-doctoring-alc"), [
    "INTERNAL PO No.",
    "FG CODE",
    "JOB NAME",
    "INPUT ROLL Kgs.",
    "Job bag Require KG",
    "ALC DONE AS PER ABOVE (YES/NO)",
    "OPERATOR SIGN",
    "START TIME",
    "END TIME",
    "OUTPUT ROLL Kgs.",
    "WASTAGE (Kgs)",
    "OK Running Mtr",
  ]);
});

test("F/PRD/21 prints its machine box, five points, and its two halves under their headings", () => {
  const l = layout("prd-pouching-line-clearance");
  assert.deepEqual(boxes("prd-pouching-line-clearance"), ["MACHINE NO. :"]);
  assert.ok(/\(5\) Corrugated box of Finished Pouches of Previous Job shifted to designated place \/ Finish Goods Warehouse \?$/.test(l.instructions?.[1] ?? ""));
  assert.deepEqual(labels("prd-pouching-line-clearance"), [
    "Date (Old Job Production complete)",
    "Time (Old Job Production complete)",
    "WORK ORDER  No. of previous Product",
    "Previous Product Job Name",
    "Operator sign",
    "Line Clearance*  (Done/Not Done)",
    "Date (New Job Production Start)",
    "Time (New Job Production start)",
    "WORK ORDER No. of New Product",
    "New Product Name",
    "Operator sign",
    "Verified by Shift supervisor",
  ]);
  const g = groups("prd-pouching-line-clearance");
  assert.deepEqual(g.slice(0, 5), Array(5).fill("Operator shall update the details mentioned in below columns, when existing Job completed"));
  assert.deepEqual(g.slice(5), Array(7).fill("Operator shall update the details mentioned in below columns, when New Job started & only after Line clearance done"));
});

test("F/PRD/22, 23 and 24 print their notes and headings, each in its own words", () => {
  const blade = [
    "Date",
    "Opening stock of OK Blade",
    "New Blades Issued from Store",
    "Total Stock",
    "SHIFT",
    "New Blade nos.",
    "Closing stock of OK Blade",
    "Closing Stock of Discarded blades",
    "Nos. of discarded blades returned to Store",
    "Varified & Checked by - Produciton Manager",
  ];
  assert.deepEqual(labels("prd-pouching-blade"), blade);
  assert.deepEqual(labels("prd-slitting-blade"), blade);
  for (const id of ["prd-pouching-blade", "prd-slitting-blade"]) {
    assert.deepEqual(groups(id).slice(4, 6), ["Nos. of new blades replaced on Machine", "Nos. of new blades replaced on Machine"]);
  }
  assert.deepEqual(layout("prd-pouching-blade").instructions, [
    "LOOSE BLADES IN STOCK INCLUDING - INSTALLED ON MACHINE + LOOSE OK BLADE + LOOSE DISCARDED BLADE) SHALL BE ALWAYS MAINTAINED 20 NOS",
  ]);
  assert.deepEqual(layout("prd-slitting-blade").instructions, [
    "LOOSE BLADES IN STOCK  (INSTALLED ON MACHINE + LOOSE OK BLADE + LOOSE DISCARDED BLADE) SHALL BE ALWAYS MAINTAINED 20 NOS",
  ]);
  assert.deepEqual(labels("prd-pouching-cutter-issue"), ["Date", "Shift", "QTY. ISSUED", "QTY. RETURNED", "BROKEN / DAMAGED QTY (IF ANY)", "NEW QTY. ISSUED", "SUPERVISOR SIGN", "Remarks"]);
  assert.deepEqual(layout("prd-pouching-cutter-issue").instructions, [
    "(Scissor stock - 15 Nos & Cutter Blade - 40 Nos to be maintained including Issued to Operator as well as available in Cup board)",
  ]);
  // The specimen blade counts keep the paper's own rule: what is in the holders and loose comes to 20.
  for (const [id, installed] of [["prd-pouching-blade", 8], ["prd-slitting-blade", 5]] as const) {
    const r = layout(id).specimenRows![0];
    assert.equal(Number(r.openingStock) + Number(r.newIssuedFromStore), Number(r.totalStock), `${id}: total`);
    assert.equal(Number(r.totalStock) - Number(r.replacedNos), Number(r.closingOkStock), `${id}: closing OK`);
    assert.equal(installed + Number(r.closingOkStock) + Number(r.closingDiscarded), 20, `${id}: the 20 NOS`);
  }
});

test("every page of every paper is shown beside its form, with a caption, and no company spelling of the papers", () => {
  const pages: Record<string, number> = {
    "prd-sharp-object-issue": 1,
    "prd-alc-production": 2,
    "prd-process-parameter": 2,
    "prd-slitting-alc": 1,
    "prd-pouching-line-clearance": 1,
    "prd-pouching-blade": 1,
    "prd-pouching-cutter-issue": 2,
    "prd-slitting-blade": 2,
    "prd-doctoring-alc": 1,
  };
  const problems: string[] = [];
  for (const id of IDS) {
    const l = layout(id);
    const shown = l.originalPages ?? [];
    if (shown.length !== pages[id]) problems.push(`${id}: ${shown.length} page(s) shown, the PDF has ${pages[id]}`);
    for (const p of shown) if (typeof p === "string" || !p.caption.trim()) problems.push(`${id}: a page without a caption`);
    const words = JSON.stringify([l.instructions, l.headerFields, l.columns, l.footerFields, l.specimenHeader, l.specimenRows]);
    if (/PRINT\s?PACK|PUBLICATION/i.test(words)) problems.push(`${id}: prints a company spelling of its own`);
    if (words.includes(EM_DASH)) problems.push(`${id}: an em dash the paper does not print`);
  }
  noProblems("Production layouts", problems);
  assert.deepEqual([...PRODUCTION_LAYOUT_IDS].sort(), IDS.filter((id) => !id.startsWith("prd-alc") && id !== "prd-process-parameter").sort());
});

// ---------------------------------------------------------------------------
// Mitra

test("Mitra finds each by its whole name alone, and asks which when the words name more than one", () => {
  const problems: string[] = [];
  for (const id of IDS) {
    const named = matchDocuments(doc(id).name.toLowerCase());
    if (named.length !== 1 || named[0] !== id) problems.push(`"${doc(id).name}": ${named.join(", ") || "nothing"}`);
  }
  noProblems("A Production format not found alone by its name", problems);
  const same = (words: string, ids: string[]) => assert.deepEqual([...matchDocuments(words)].sort(), [...ids].sort(), words);
  same("open the alc report", ["prd-alc-production", "prd-slitting-alc", "prd-doctoring-alc"]);
  same("the daily issue & return record", ["prd-sharp-object-issue", "prd-pouching-cutter-issue"]);
  same("manual cutter", ["prd-sharp-object-issue", "prd-pouching-cutter-issue"]);
  same("blade change record", ["prd-pouching-blade", "prd-slitting-blade"]);
  same("lamination production", ["prd-alc-production", "prd-process-parameter"]);
  same("open the slitting alc report", ["prd-slitting-alc"]);
  same("doctoring", ["prd-doctoring-alc"]);
  same("pouching line clearance", ["prd-pouching-line-clearance"]);
  same("pouching machine blade", ["prd-pouching-blade"]);
  same("open the razor blade monitoring record for the pouching machine blade holder", ["prd-pouching-blade"]);
  same("pouching blade change record", ["prd-pouching-blade"]);
  same("slitting blade change record", ["prd-slitting-blade"]);
  same("slitting machine razor blade", ["prd-slitting-blade"]);
  same("scissor issue & return", ["prd-sharp-object-issue"]);
  same("pouching section manual cutter", ["prd-pouching-cutter-issue"]);
  // The words that were another document's stay that document's.
  same("pouching inspection", ["qc-inspection-pouching"]);
  same("slitting inspection", ["qc-inspection-slitting"]);
  same("slitting line clearance", ["qc-line-clearance-slitting"]);
  same("razor blade record", ["str-sharp-metal-objects"]);
  // "Production" as a module: all nine, for "production files from June to August".
  same("production files", IDS);
});

test("no word Mitra knows a Production format by takes another document's name", () => {
  const problems: string[] = [];
  for (const d of SEED_DOCUMENTS) {
    if (IDS.includes(d.id)) continue;
    const named = matchDocuments(d.name.toLowerCase()).filter((id) => IDS.includes(id));
    if (named.length > 0) problems.push(`"${d.name}" (${d.id}) is read as ${named.join(", ")}`);
  }
  noProblems("Another document's name taken by a Production alias", problems);
});

// ---------------------------------------------------------------------------
// filled, signed off, and kept by somebody

test("each is filled with sample data and passes the submit checks; signatures are left for the people who sign", () => {
  const master = masterRepository.get();
  const dates = [todayISO(), addDays(todayISO(), 1)];
  const problems: string[] = [];
  for (const id of IDS) {
    const d = doc(id);
    for (const dueDate of dates) {
      const shell: RecordInstance = {
        id: `unit-prd-${id}-${dueDate}`,
        documentId: id,
        periodKey: dueDate,
        dueDate,
        status: "In Progress",
        isDemo: false,
        data: createDefaultData(d, dueDate, master),
        createdAt: `${dueDate}T09:00:00.000Z`,
        updatedAt: `${dueDate}T09:00:00.000Z`,
      };
      const filled = sampleFillRecord(d, shell, master, "Unit QA");
      if (!filled) {
        problems.push(`${id}: the sample fill returned nothing`);
        continue;
      }
      const verdict = validateForSubmit(d, { ...shell, data: filled.data });
      if (!verdict.valid) problems.push(`${id} on ${dueDate}: ${verdict.errors.slice(0, 4).join(" | ")}`);
      const data = filled.data as LogSheetData;
      if (data.rows.length === 0) problems.push(`${id}: no lines`);
      for (const c of layout(id).columns) {
        if (!/sign|Varified|Verified by/i.test(c.label) || c.autoFill?.sign) continue;
        if (data.rows.some((r) => String(r[c.key] ?? "").trim() !== "")) problems.push(`${id}: "${c.label}" filled by the assistant`);
      }
      const dateBox = layout(id).columns.find((c) => c.autoFill?.dueDate);
      if (dateBox && data.rows.some((r) => r[dateBox.key] !== dueDate)) problems.push(`${id}: a line not dated the record's day`);
    }
  }
  noProblems("A Production format the sample fill cannot complete", problems);
});

test("the slitting and doctoring machines run the lamination line's rolls, and their weights add up", () => {
  const master = masterRepository.get();
  for (const id of ["prd-slitting-alc", "prd-doctoring-alc"]) {
    const d = doc(id);
    const a = autoFillRecord(d, "2026-09-08", master, undefined)!.data as LogSheetData;
    const b = autoFillRecord(d, "2026-09-09", master, undefined)!.data as LogSheetData;
    assert.ok(a.rows.length > 0 && b.rows.length > 0, `${id}: rolls on both days`);
    assert.notDeepEqual(a.rows.map((r) => r.poNo), b.rows.map((r) => r.poNo), `${id}: each day its own jobs, never the specimen's copied`);
    for (const r of [...a.rows, ...b.rows]) {
      const input = Number(r.inputRollKg);
      const output = Number(r.outputRollKg);
      const wastage = Number(r.wastageKg);
      assert.ok(Math.abs(input - output - wastage) < 0.011, `${id}: ${input} in = ${output} out + ${wastage} wastage`);
      assert.ok(wastage > 0 && wastage < input * 0.04, `${id}: wastage ${wastage} of ${input}`);
      assert.ok(String(r.startTime) < String(r.endTime), `${id}: starts before it ends (${r.startTime} - ${r.endTime})`);
    }
    // The slitting machine takes a roll after it is out of the hot room.
    if (id === "prd-slitting-alc") for (const r of a.rows) assert.ok(String(r.startTime) > String(r.outTimeHotroom), `${r.startTime} after ${r.outTimeHotroom}`);
  }
});

test("each has somebody who answers for it: the lamination operator, or the pouch section's manager", () => {
  const master = masterRepository.get();
  for (const id of IDS) {
    const who = resolveResponsibleEmployees(doc(id), master).map((e) => e.name);
    const expected = id === "prd-alc-production" || id === "prd-process-parameter" ? "Gaurav Singh" : "Azaz Bharach";
    assert.equal(who[0], expected, `${id}: ${who.join(", ") || "nobody"}`);
  }
});

// ---------------------------------------------------------------------------
// Demo Mode's year, in the browser's room (REQUIREMENTS §79)

test("Demo Mode draws the new daily sheets for the month in hand only, and every other daily sheet as before", () => {
  // The slitting, doctoring, sharp object and blade sheets: every Production daily sheet but the two lamination records.
  const daily = IDS.filter((id) => doc(id).schedule.type === "daily" && id !== "prd-alc-production" && id !== "prd-process-parameter");
  assert.deepEqual([...RECENT_DAILY_SHEETS].sort(), [...daily].sort());
  const now = new Date();
  const year = now.getFullYear();
  const current = now.getMonth();
  ensureDemoRecordsGeneratedForYear(year);
  const demo = recordRepository.queryUnscoped({ isDemo: true }).filter((r) => r.dueDate.startsWith(String(year)));
  const monthsOf = (id: string) => new Set(demo.filter((r) => r.documentId === id).map((r) => Number(r.dueDate.slice(5, 7)) - 1));
  for (const id of daily) {
    const months = [...monthsOf(id)];
    assert.ok(months.length > 0 && months.every((m) => m >= current), `${id}: drawn in ${months.join(", ")}, the month in hand being ${current}`);
  }
  // The lamination record keeps the window every daily sheet had: the month in hand and the three before it.
  const lamination = monthsOf("prd-alc-production");
  for (let m = Math.max(0, current - DAILY_SHEET_MONTHS_BACK); m <= current; m++) assert.ok(lamination.has(m), `F-PRD-18 has month ${m}`);
});
