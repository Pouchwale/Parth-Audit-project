// EVERY DOCUMENT FINDABLE, BY ANYBODY (REQUIREMENTS §84).
//
// The owner, 30-Sep-2026: "If any user searches for any document, or if the
// super admin searches for any document, he should find it — it should be
// present." engine/documentFinder.ts answers the Search page and the Document
// Library's filter box. These tests walk the whole catalogue rather than a few
// examples, so a format wired in later is held to the same rule:
//   - every document is found by its format number in several spellings
//     (F/HR/17, F-HR-17, fhr17, HR 17), by each word of its name in either
//     case, by its module and its department, and by the words people use for
//     it (engine/assistantLocal.ts DOC_KEYWORDS);
//   - an account kept to Quality Control finds another department's document
//     too, as "Kept by <department> — ask the super admin for access", without
//     a record being read;
//   - a format on the Master List of Formats & Records (F/SYS/02) that DCRS
//     does not hold yet is found, and said to be not in DCRS yet; one DCRS
//     holds under another number (F-PRD-19, F-MKT-06) finds that document;
//   - what the Search page's registers and Mitra rest on is unchanged:
//     documentsByFormatNumber still answers for the person's own departments.
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded, documentRepository } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { departmentName, departmentOfDocument } from "../src/data/seed/departments";
import { setDepartmentScope } from "../src/engine/departmentScope";
import { documentsByFormatNumber, formatKey, namesFormatNumber } from "../src/engine/formatNumbers";
import { DOC_KEYWORDS } from "../src/engine/assistantLocal";
import { documentTextIn } from "../src/i18n/documentText";
import {
  documentQuery,
  findDocuments,
  keptByLabel,
  masterListFormats,
  masterListFormatsNotInDcrs,
  NOT_IN_DCRS_YET,
  type FoundDocument,
} from "../src/engine/documentFinder";
import { noProblems } from "./support/catalogue";

ensureDocumentsSeeded();
ensureMasterSeeded();

const DOCS: DocumentDefinition[] = documentRepository.getAllUnscoped();

const kindOf = (found: FoundDocument[], id: string): FoundDocument["kind"] | null => {
  const f = found.find((x) => x.kind !== "master" && x.doc.id === id);
  return f ? f.kind : null;
};
const describe = (found: FoundDocument[]) => found.map((f) => (f.kind === "master" ? `master ${f.format.formatNo}` : `${f.kind} ${f.doc.id}`)).join(", ") || "nothing";

/** F/HR/17 written the ways the plant writes it: F/HR/17, F-HR-17, fhr17, HR 17 (and the lettered ones likewise). */
function spellings(doc: DocumentDefinition): string[] {
  const key = formatKey(doc.formatNo);
  if (!key) return [doc.formatNo];
  const m = /^([A-Z]+)-(\d+)([A-Z]?)$/.exec(key);
  assert.ok(m, `${doc.id}: ${key} is a key`);
  const [, dept, num, letter] = m;
  const nn = num.padStart(2, "0");
  return [
    doc.formatNo,
    `F/${dept}/${nn}${letter ? `-${letter}` : ""}`,
    `F-${dept}-${nn}${letter ? `.${letter}` : ""}`,
    `f${dept.toLowerCase()}${Number(num)}${letter.toLowerCase()}`,
    `${dept} ${Number(num)}${letter}`,
  ];
}

/** Scoped to a department for the length of fn, whatever fn throws. */
function asDepartment<T>(codes: string[] | null, fn: () => T): T {
  setDepartmentScope(codes);
  try {
    return fn();
  } finally {
    setDepartmentScope(null);
  }
}

// ---------------------------------------------------------------------------
// the super admin (every department): every document, every way

test("every document is found by its format number, however it is written", () => {
  const problems: string[] = [];
  let numbered = 0;
  for (const doc of DOCS) {
    if (!doc.formatNo || doc.formatNo === "TO BE CONFIRMED") continue;
    numbered++;
    for (const written of spellings(doc)) {
      const found = findDocuments(written);
      if (kindOf(found, doc.id) !== "yours") problems.push(`${doc.id} (${doc.formatNo}) — "${written}" found ${describe(found)}`);
    }
  }
  assert.ok(numbered >= 100, `the catalogue's numbered documents were walked (${numbered})`);
  noProblems("A document not found by its format number", problems);
});

test("every document is found by each word of its name, in any case, and by its whole name", () => {
  const problems: string[] = [];
  for (const doc of DOCS) {
    const names = Array.from(new Set([doc.name, documentTextIn(doc.name, "en")]));
    for (const name of names) {
      const whole = findDocuments(name);
      if (kindOf(whole, doc.id) !== "yours") problems.push(`${doc.id} — its name "${name}" found ${describe(whole)}`);
      for (const raw of name.split(/\s+/)) {
        const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}\p{M}]+$/gu, "");
        // One letter is on nearly every form, and a word that is itself a format number is answered as one.
        if (Array.from(word).length < 2 || namesFormatNumber(word)) continue;
        for (const typed of [word.toLowerCase(), word.toUpperCase()]) {
          const found = findDocuments(typed);
          if (kindOf(found, doc.id) !== "yours") problems.push(`${doc.id} — "${typed}" (a word of "${name}") found ${describe(found).slice(0, 200)}`);
        }
      }
    }
  }
  noProblems("A document not found by a word of its name", problems);
});

test("every document is found by its module and by its department", () => {
  const problems: string[] = [];
  const byModule = new Map<string, FoundDocument[]>();
  for (const doc of DOCS) {
    if (!byModule.has(doc.module)) byModule.set(doc.module, findDocuments(doc.module));
    if (kindOf(byModule.get(doc.module)!, doc.id) !== "yours") problems.push(`${doc.id} — not found by its module "${doc.module}"`);
    const code = departmentOfDocument(doc.id, doc.formatNo);
    if (!code) continue;
    for (const typed of [departmentName(code), departmentName(code).toLowerCase()]) {
      if (kindOf(findDocuments(typed), doc.id) !== "yours") problems.push(`${doc.id} — not found by its department "${typed}"`);
    }
  }
  noProblems("A document not found by its module or department", problems);
  // And a module's name finds that module's documents, not the whole catalogue.
  const maintenance = findDocuments("Maintenance").filter((f) => f.kind === "yours");
  assert.ok(maintenance.length > 0 && maintenance.every((f) => f.kind === "yours" && departmentOfDocument(f.doc.id, f.doc.formatNo) === "MNT"), describe(maintenance));
});

test("every document is found by the words people use for it", () => {
  const problems: string[] = [];
  for (const { id, aliases } of DOC_KEYWORDS) {
    if (!DOCS.some((d) => d.id === id)) continue;
    for (const alias of aliases) {
      const found = findDocuments(alias);
      if (kindOf(found, id) !== "yours") problems.push(`${id} — "${alias}" found ${describe(found).slice(0, 200)}`);
    }
  }
  noProblems("A document not found by one of its aliases", problems);
});

test("a format number finds exactly its document, as before; a number DCRS does not hold finds no document of DCRS's", () => {
  assert.deepEqual(findDocuments("F/HR/05").map((f) => f.kind !== "master" && f.doc.id), ["hr-induction-staff"]);
  assert.deepEqual(findDocuments("f-qc-40c").map((f) => f.kind !== "master" && f.doc.id), ["qc-temperature"]);
  assert.deepEqual(findDocuments("QA-CAF-00").map((f) => f.kind !== "master" && f.doc.id), ["capa-complaint-ack"]);
  // Two forms the company numbered alike: both.
  assert.deepEqual(
    findDocuments("F/QC/21").flatMap((f) => (f.kind === "yours" ? [f.doc.id] : [])).sort(),
    ["qc-flexo-ink", "qc-lamination-adhesive-inspection"]
  );
  assert.equal(findDocuments("F/HR/99").length, 0, "a number on no list finds nothing");
  // What the Search page's registers and Mitra rest on is unchanged.
  assert.deepEqual(documentsByFormatNumber("F/HR/05").map((d) => d.id), ["hr-induction-staff"]);
  assert.deepEqual(documentsByFormatNumber("F/HR/10"), []);
});

// ---------------------------------------------------------------------------
// an account kept to one department

test("an account kept to Quality Control finds every other department's document — kept by it, and no record read", () => {
  // Nothing the finder does may read a record: every way into the records is made to fail for the length of this test.
  const repo = recordRepository as unknown as Record<string, unknown>;
  const saved = { ...repo };
  for (const name of Object.keys(repo)) {
    if (typeof repo[name] === "function")
      repo[name] = () => {
        throw new Error(`recordRepository.${name} was asked while finding documents`);
      };
  }
  try {
    asDepartment(["QC"], () => {
      const problems: string[] = [];
      for (const doc of DOCS) {
        const mine = departmentOfDocument(doc.id, doc.formatNo) === "QC";
        const queries = doc.formatNo && doc.formatNo !== "TO BE CONFIRMED" ? [doc.formatNo, doc.name] : [doc.name];
        for (const q of queries) {
          const found = findDocuments(q);
          const kind = kindOf(found, doc.id);
          if (kind !== (mine ? "yours" : "kept")) problems.push(`${doc.id} — "${q}" found it as ${kind ?? "nothing"}`);
          const f = found.find((x) => x.kind === "kept" && x.doc.id === doc.id);
          if (f && f.kind === "kept" && f.department !== departmentName(departmentOfDocument(doc.id, doc.formatNo) ?? "")) problems.push(`${doc.id} — kept by "${f.department}"`);
        }
      }
      noProblems("A document a Quality Control account could not find", problems);

      const hr17 = findDocuments("F/HR/17");
      assert.equal(hr17.length, 1, describe(hr17));
      const only = hr17[0];
      assert.ok(only.kind === "kept" && only.doc.id === "daily-pest-monitoring" && only.department === "Human Resources", describe(hr17));
      assert.equal(keptByLabel(only.department), "Kept by Human Resources — ask the super admin for access");
      const pest = findDocuments("pest");
      assert.ok(pest.length > 0 && pest.every((f) => f.kind === "kept"), `"pest" is all kept for QC: ${describe(pest)}`);
      assert.ok(findDocuments("F/QC/12").some((f) => f.kind === "yours" && f.doc.id === "qc-weight-scale-calibration"));
      // Its own documents are still all documentsByFormatNumber gives it: the registers and Mitra are unchanged.
      assert.deepEqual(documentsByFormatNumber("F/HR/05"), []);
      assert.deepEqual(documentsByFormatNumber("F/QC/12").map((d) => d.id), ["qc-weight-scale-calibration"]);
    });
  } finally {
    Object.assign(repo, saved);
  }
});

// ---------------------------------------------------------------------------
// the master list of formats

test("the Master List of Formats (F/SYS/02) is read line by line, and each line is DCRS's or not yet", () => {
  const lines = masterListFormats();
  assert.ok(lines.length >= 141, `the list's lines (${lines.length})`);
  const held = (formatNo: string) => lines.find((l) => l.formatNo === formatNo)?.heldBy;
  assert.equal(held("F-HR-05"), "hr-induction-staff");
  assert.equal(held("F-QC-40. C"), "qc-temperature");
  assert.equal(held("F-SYS-02"), "sys-format-list");
  // Held under another number: the acknowledgement form prints QA-CAF-00, and the process parameter record's number is under the clip.
  assert.equal(held("F-MKT-06"), "capa-complaint-ack");
  assert.equal(held("F-PRD-19"), "prd-process-parameter");
  assert.equal(held("QA-PRO-FL-CCT-01"), "qc-camera-challenge-test");
  assert.equal(held("F-HR-10"), null);
  assert.equal(held("F-PUR-04"), null);
  // A line said to be not in DCRS yet carries no number any DCRS document carries.
  const keys = new Set(DOCS.map((d) => formatKey(d.formatNo)).filter(Boolean));
  const wrong = masterListFormatsNotInDcrs().filter((l) => l.key && keys.has(l.key)).map((l) => `${l.formatNo} is ${l.key}, which DCRS has`);
  noProblems("A master-list line wrongly said to be missing", wrong);
});

test("a format on the master list that DCRS does not have yet is found by its number and its name, by anybody", () => {
  const hr10 = findDocuments("F/HR/10");
  assert.equal(hr10.length, 1, describe(hr10));
  const line = hr10[0];
  assert.ok(line.kind === "master" && line.format.formatNo === "F-HR-10" && line.format.name === "Training Imparted Record" && line.format.departmentName === "Human Resources", describe(hr10));
  assert.equal(NOT_IN_DCRS_YET, "On the Master List of Formats (F/SYS/02) — not in DCRS yet");
  assert.ok(findDocuments("purchase order").some((f) => f.kind === "master" && f.format.formatNo === "F-PUR-04"));
  assert.deepEqual(
    findDocuments("job card").flatMap((f) => (f.kind === "master" ? [f.format.formatNo] : [])),
    ["F-PRD-14.A", "F-PRD-14.B", "F-PRD-14.E"]
  );
  // Every one of them, by its number as printed and by a word of its name.
  const problems: string[] = [];
  for (const l of masterListFormatsNotInDcrs()) {
    const byNumber = findDocuments(l.formatNo);
    if (!byNumber.some((f) => f.kind === "master" && f.format === l)) problems.push(`${l.formatNo} — by its number found ${describe(byNumber)}`);
    const word = l.name.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]+/gu, "")).find((w) => w.length >= 4) ?? l.name;
    const byName = findDocuments(word);
    if (!byName.some((f) => f.kind === "master" && f.format === l)) problems.push(`${l.formatNo} — "${word}" found ${describe(byName).slice(0, 200)}`);
  }
  noProblems("A master-list format not found", problems);
  // A Quality Control account finds them too.
  asDepartment(["QC"], () => {
    assert.ok(findDocuments("F-HR-10").some((f) => f.kind === "master" && f.format.formatNo === "F-HR-10"));
  });
});

test("a master-list number DCRS holds under another number finds that document, noted as the list numbers it", () => {
  const prd19 = findDocuments("F-PRD-19");
  assert.ok(prd19.length === 1 && prd19[0].kind === "yours" && prd19[0].doc.id === "prd-process-parameter" && prd19[0].asListed === "F-PRD-19", describe(prd19));
  const mkt06 = findDocuments("F/MKT/06");
  assert.ok(mkt06.length === 1 && mkt06[0].kind === "yours" && mkt06[0].doc.id === "capa-complaint-ack", describe(mkt06));
  // The lettered family: F/QC/40 is F-QC-40.C in DCRS, and F-QC-40. A and B on the list only.
  const qc40 = findDocuments("F/QC/40").map((f) => (f.kind === "master" ? `master ${f.format.formatNo}` : `${f.kind} ${f.doc.id}`));
  assert.deepEqual(qc40, ["yours qc-temperature", "master F-QC-40. A", "master F-QC-40. B"]);
});

// ---------------------------------------------------------------------------
// the Document Library's filter box

test("the library's filter box finds as Search does", () => {
  const byId = (id: string) => DOCS.find((d) => d.id === id)!;
  for (const typed of ["fhr17", "HR 17", "F-HR-17", "daily pest", "PEST", "human resources"]) {
    assert.ok(documentQuery(typed).matchesDocument(byId("daily-pest-monitoring")), typed);
  }
  assert.ok(!documentQuery("F/QC/12").matchesDocument(byId("daily-pest-monitoring")));
  assert.ok(documentQuery("").empty && documentQuery("").matchesDocument(byId("qc-viscosity")));
  const maintenance = documentQuery("maintenance");
  assert.deepEqual(
    DOCS.filter((d) => maintenance.matchesDocument(d)).map((d) => d.id).sort(),
    DOCS.filter((d) => departmentOfDocument(d.id, d.formatNo) === "MNT").map((d) => d.id).sort()
  );
  const hr10 = masterListFormats().find((l) => l.formatNo === "F-HR-10")!;
  assert.ok(documentQuery("training imparted").matchesMasterFormat(hr10) && !documentQuery("pouch").matchesMasterFormat(hr10));
});
