// EVERY QC DOCUMENT FOUND BY ITS NUMBER, HOWEVER IT IS WRITTEN (REQUIREMENTS §111, rule 4 of the owner's brief of
// 13-Oct-2026). The phone answered about F/QC-38 when asked to open "F QC 09". The number names its document in any
// spelling — "F QC 09", "FQC09", "F/QC/09", "f-qc-9" — in Search, in Mitra's words and in Mitra's tools, and is never
// taken for another. Five numbers are printed on two papers each (F/QC/19, /20, /21, /29, /30): written exactly as
// one paper prints it, it names that paper; written loosely it names both, and Mitra asks which.
import test from "node:test";
import assert from "node:assert/strict";
import { ensureSeeded as ensureDocumentsSeeded, documentRepository } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { findDocuments } from "../src/engine/documentFinder";
import { matchDocuments } from "../src/engine/assistantLocal";
import { formatKey } from "../src/engine/formatNumbers";
import { findDocument } from "../src/engine/mitraTools";

if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "#/dashboard", hostname: "localhost" }, configurable: true, writable: true });
}
ensureDocumentsSeeded();
ensureMasterSeeded();

const QC_DOCS = documentRepository.getAllUnscoped().filter((d) => formatKey(d.formatNo)?.startsWith("QC-"));

/** The ways the plant writes one number: with spaces, run together, slashed, dashed without the leading zero, asked for. */
function spellings(formatNo: string): string[] {
  const m = formatNo.match(/QC\s*[-/ ]?\s*(\d{1,2})(?:[.-]?\s*([A-Z]))?/i)!;
  const two = m[1].padStart(2, "0");
  const one = String(Number(m[1]));
  const letter = m[2] ?? "";
  return [`F QC ${two}${letter}`, `FQC${two}${letter}`, `F/QC/${two}${letter}`, `f-qc-${one}${letter.toLowerCase()}`, `open F QC ${two}${letter}`, `qc ${one}${letter}`];
}

const sharing = (id: string) => {
  const key = formatKey(documentRepository.getByIdUnscoped(id)!.formatNo);
  return QC_DOCS.filter((d) => formatKey(d.formatNo) === key).map((d) => d.id);
};

test("every QC document is found by its number in any spelling, and only it — or, for a number two papers print, both", () => {
  assert.ok(QC_DOCS.length >= 40, `${QC_DOCS.length} QC documents`);
  for (const doc of QC_DOCS) {
    const same = sharing(doc.id);
    for (const q of spellings(doc.formatNo)) {
      const searched = findDocuments(q).flatMap((f) => (f.kind === "master" ? [] : [f.doc.id]));
      assert.deepEqual([...searched].sort(), [...same].sort(), `Search for "${q}" (${doc.formatNo})`);
      assert.deepEqual(matchDocuments(q.toLowerCase()).sort(), [...same].sort(), `Mitra's words for "${q}" (${doc.formatNo})`);
    }
  }
});

test("Mitra's tools name one document by a number only as its paper prints it; a loose spelling of a shared number names none, and Mitra asks", () => {
  for (const doc of QC_DOCS) {
    const same = sharing(doc.id);
    // Exactly as printed, in any case — where no other paper prints the number the same way (F/QC/20, /21 and /29 are
    // printed alike on both their papers, so even written exactly they name both, and Mitra asks).
    const printedAlike = same.filter((id) => documentRepository.getByIdUnscoped(id)!.formatNo === doc.formatNo);
    const asPrinted = printedAlike.length === 1 ? doc.id : undefined;
    assert.equal(findDocument(doc.formatNo)?.id, asPrinted, doc.formatNo);
    assert.equal(findDocument(doc.formatNo.toLowerCase())?.id, asPrinted, doc.formatNo.toLowerCase());
    for (const q of spellings(doc.formatNo).filter((s) => !s.startsWith("open"))) {
      const printedAs = same.filter((id) => documentRepository.getByIdUnscoped(id)!.formatNo.toLowerCase() === q.toLowerCase());
      const expected = same.length === 1 ? doc.id : printedAs.length === 1 ? printedAs[0] : undefined;
      assert.equal(findDocument(q)?.id, expected, `"${q}" (${doc.formatNo}; carried by ${same.join(", ")})`);
    }
  }
});

test("F QC 09 is the Statement of Compliance for pressure labels and never F/QC-38; each is found by the words people use", () => {
  for (const q of ["F QC 09", "FQC09", "F/QC/09", "f-qc-9", "F/QC-09", "open F QC 09", "show fqc 9"]) {
    assert.deepEqual(matchDocuments(q.toLowerCase()), ["soc-labels"], q);
    assert.equal(findDocument(q.replace(/^(open|show) /, ""))?.id, "soc-labels", q);
    assert.ok(!findDocuments(q).some((f) => f.kind !== "master" && f.doc.id === "soc-flexible-packaging"), q);
  }
  for (const q of ["F QC 38", "FQC38", "F/QC/38", "f-qc-38", "F/QC-38"]) assert.deepEqual(matchDocuments(q.toLowerCase()), ["soc-flexible-packaging"], q);
  assert.deepEqual(matchDocuments("open the soc for labels"), ["soc-labels"]);
  assert.deepEqual(matchDocuments("show me the pouch soc"), ["soc-flexible-packaging"]);
  assert.deepEqual(findDocuments("statement of compliance").flatMap((f) => (f.kind === "master" ? [] : [f.doc.id])).sort(), ["soc-flexible-packaging", "soc-labels"], "the words both share name both");
  assert.deepEqual(matchDocuments("open the mom"), ["qc-minutes-of-meetings"]);
});
