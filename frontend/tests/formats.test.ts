// THE CATALOGUE HOLDS TOGETHER: numbers, names, sections and fixed rows.
//
// Each check is a rule some screen or suite already depends on, written down
// so that wiring a supplied format in (REQUIREMENTS §74's Maintenance, and every
// module after it) cannot quietly break it:
//  * a format number search and Mitra can parse (§52),
//  * one document per number, or search answers with the wrong form,
//  * a module name in both of the app's languages (§58),
//  * fixed rows that hold words, never numbers (tests/e2e_realism.py),
//  * sections the Document Library can order by (§46),
//  * a worked-out cell that is never asked for (§61, §74).
import test from "node:test";
import { MODULE_SECTIONS, SEED_DOCUMENTS } from "../src/data/seed/documentDefinitions";
import { formatKey } from "../src/engine/formatNumbers";
import { STRINGS } from "../src/i18n/strings";
import { everyLayout, noProblems } from "./support/catalogue";

const known = (formatNo: string) => !!formatNo.trim() && formatNo !== "TO BE CONFIRMED";

test("every F/ format number parses to a canonical key", () => {
  // formatNo must be exactly F/<dept>/<nn> (a letter suffix allowed): anything
  // more — "F/MNT/02 (Rev 01)" — makes formatKey null, and then neither Search
  // nor Mitra can find the document by its number. The revision belongs in
  // revisionNo.
  noProblems(
    "Format numbers Search and Mitra cannot parse",
    SEED_DOCUMENTS.filter((d) => d.formatNo.startsWith("F/") && !formatKey(d.formatNo)).map((d) => `${d.id}: "${d.formatNo}"`)
  );
});

// KNOWN EXCEPTIONS — NUMBERS THE COMPANY ITSELF GAVE TO TWO FORMS
// (REQUIREMENTS §57, "Five format numbers are each carried by two formats", on
// the TO BE CONFIRMED list for the MR). Both forms of each pair are in use and
// held as supplied, and a search for the number lists both
// (engine/formatNumbers.ts resolveAll; tests/e2e_qc_formats.py "finds both
// formats the company numbered F/QC/21"). Only these exact pairs are let
// through: a third document on one of these numbers, or any other number
// shared — an F/MNT one included — still fails. Remove a pair once the MR
// renumbers it.
const SHARED_BY_THE_COMPANY: Record<string, string[]> = {
  "QC-19": ["qc-duplex-board", "qc-tolerance-card-nivea"],
  "QC-20": ["qc-kraft-paper", "qc-printing-aids-destruction"],
  "QC-21": ["qc-flexo-ink", "qc-lamination-adhesive-inspection"],
  "QC-29": ["qc-analysis-report", "qc-utility-test-report"],
  // The minutes of meetings print F/QC/30; the master list gives F-QC-30 to the
  // Lamination Adhesive Viscosity Record.
  "QC-30": ["qc-viscosity", "qc-minutes-of-meetings"],
};

test("no two documents share a format number", () => {
  const byNumber = new Map<string, string[]>();
  for (const d of SEED_DOCUMENTS) {
    if (!known(d.formatNo)) continue;
    // F/QC/05 and F-QC-05 are one number written two ways.
    const key = formatKey(d.formatNo) ?? d.formatNo.toUpperCase().replace(/[^A-Z0-9]/g, "");
    byNumber.set(key, [...(byNumber.get(key) ?? []), d.id]);
  }
  const problems: string[] = [];
  for (const [key, ids] of byNumber) {
    if (ids.length < 2) continue;
    const allowed = SHARED_BY_THE_COMPANY[key];
    if (allowed && ids.length === allowed.length && ids.every((id) => allowed.includes(id))) continue;
    problems.push(`${key}: ${ids.join(", ")}`);
  }
  noProblems("Format numbers held by more than one document", problems);
});

test("every module has a name in English and in Gujarati", () => {
  // The sidebar, the dashboard, the file browser and Mitra's answers all show
  // t(`module.${doc.module}`); a missing key shows the key itself
  // ("module.Maintenance") to the person, which tests/e2e_store_module.py fails on.
  const en = STRINGS.en as Record<string, string | undefined>;
  const gu = STRINGS.gu as Record<string, string | undefined>;
  const modules = Array.from(new Set(SEED_DOCUMENTS.map((d) => d.module)));
  const problems: string[] = [];
  for (const m of modules) {
    if (!en[`module.${m}`]?.trim()) problems.push(`"module.${m}" is missing from the English table`);
    if (!gu[`module.${m}`]?.trim()) problems.push(`"module.${m}" is missing from the Gujarati table`);
  }
  noProblems("Modules with no name on screen", problems);
});

test("every section name in MODULE_SECTIONS is unique", () => {
  // The Document Library orders a module's documents by their section's place
  // in this one list; a name listed twice sorts two modules' sections together.
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const s of MODULE_SECTIONS) {
    if (seen.has(s)) problems.push(`"${s}" is listed more than once`);
    seen.add(s);
  }
  noProblems("Section names listed twice", problems);
});

test("every document's section is one the Document Library knows", () => {
  // A section missing from MODULE_SECTIONS sorts after every known one, under
  // a heading of its own, out of the department's order.
  const sections = new Set(MODULE_SECTIONS);
  noProblems(
    "Documents in a section MODULE_SECTIONS does not list",
    SEED_DOCUMENTS.filter((d) => d.section && !sections.has(d.section)).map((d) => `${d.id}: section "${d.section}"`)
  );
});

test("fixed rows hold words, never numbers", () => {
  // A future record's shell carries its fixed-row values
  // (engine/recordDefaults.ts), and a number in a row is what
  // tests/e2e_realism.py takes for an observed value — so a number printed on
  // the paper as a label (an equipment number, a standard, a quantity) must be
  // written as the string "10", or every blank future sheet counts as filled in.
  const problems: string[] = [];
  for (const { name, layout } of everyLayout()) {
    if (layout.rowMode.kind !== "fixedRows") continue;
    layout.rowMode.rows.forEach((row, i) => {
      for (const [key, value] of Object.entries(row)) {
        if (typeof value !== "string") problems.push(`${name} row ${i + 1}: ${key} = ${JSON.stringify(value)} (${value === null ? "null" : typeof value})`);
      }
    });
  }
  noProblems("Fixed rows holding something other than text", problems);
});

test("no worked-out column is required", () => {
  // A computed cell is arithmetic on its neighbours and is never typed; it is
  // blank exactly while they are, and they carry the requirement
  // (engine/computedCells.ts). Marking it required asks for something nobody
  // can enter — and engine/formatCommands.ts refuses the combination anyway.
  const problems: string[] = [];
  for (const { name, layout } of everyLayout()) {
    for (const col of layout.columns) if (col.computed && col.required) problems.push(`${name}: column "${col.key}" (${col.label})`);
  }
  noProblems("Computed columns marked required", problems);
});
