// THE THREE PAPERS OF 7-OCT-2026 (REQUIREMENTS §93): F/STR/02, F/MNT/08 and
// F/MNT/09, sent again by the owner, compared word for word with DCRS's copies
// (the company's one name aside, §87). Without a browser: the catalogue, the
// layouts and the files on disk.
//
//   * F/STR/02's title carries the four tools its brackets print; its page as
//     supplied is shown beside it; the company's own Word original is on file
//     and the form downloads as Word;
//   * F/MNT/08's page 2 prints the declaration, then "Hand over & Take over
//     Protocol", then each head beside "Date:" — the sheet shows the paper's
//     words while each box keeps the full name its history goes by; the Word
//     original is on file;
//   * F/MNT/09 stays on the NEWER issue of Rev 02 (01.09.2025, 3,980 articles):
//     the paper sent is the 15.12.2024 issue, and its source line says which
//     file is which.
// Run: npm run test:unit -- papers07Oct
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import type { DocumentDefinition, LogHeaderField, LogSheetLayout } from "../src/types";
import { SEED_DOCUMENTS } from "../src/data/seed/documentDefinitions";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { documentFileKind } from "../src/utils/documentExport";
import { matchDocuments } from "../src/engine/assistantLocal";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";

ensureDocumentsSeeded();

const ROOT = process.env.DCRS_REPO_ROOT ?? process.cwd();
const doc = (id: string): DocumentDefinition => {
  const d = SEED_DOCUMENTS.find((x) => x.id === id);
  assert.ok(d, `${id} is in the catalogue`);
  return d!;
};
const layout = (id: string): LogSheetLayout => {
  const l = getLogSheetLayout(id);
  assert.ok(l, `${id} has a layout`);
  return l!;
};
const sourceFiles = (d: DocumentDefinition): string[] => Array.from(d.sourceFile.matchAll(/F-[A-Z]+-\d+_[^;()]*?(?: \(1\) \(2\)|\(3\))?\.(?:pdf|docx?|xlsx?)/g), (m) => m[0]);
const onFile = (name: string) => existsSync(path.join(ROOT, "source-documents", name));

test("F/STR/02: the title the paper prints, its page as supplied, and the Word original it downloads as", () => {
  const sharp = doc("str-sharp-metal-objects");
  assert.equal(sharp.name, "Sharp Metal Objects (Razor Blade, Scissor, Cutter blade, Surgical Blade) Issuance (New) & Return (Old) Record");
  assert.equal(sharp.formatNo, "F/STR/02");
  assert.equal(sharp.revisionNo, "00");
  assert.equal(sharp.revisionDate, "2021-12-01", "the paper's footer: F/STR/02 (00/01.12.2021)");
  const pages = layout(sharp.id).originalPages ?? [];
  assert.equal(pages.length, 1, "its one page is shown beside the form");
  const src = typeof pages[0] === "string" ? pages[0] : pages[0].src;
  assert.ok(existsSync(path.join(ROOT, "frontend", "public", src)), `${src} is on disk`);
  const files = sourceFiles(sharp);
  assert.ok(files.some((f) => f.endsWith(".docx")), "the company's own Word original is named");
  for (const f of files) assert.ok(onFile(f), `${f} is in source-documents`);
  assert.equal(documentFileKind(sharp), "docx", "it downloads as Word, as the company's original is");
  assert.deepEqual(matchDocuments(sharp.name.toLowerCase()), [sharp.id], "said in full, the title names this register alone");
  // The nine headings, unchanged.
  assert.deepEqual(
    layout(sharp.id).columns.map((c) => c.label),
    ["DATE", "SHARP TOOL DESCRIPTION", "QTY. ISSUED", "ISSUED TO (NAME)", "DEPARTMENT", "RECEIVERS SIGNATURE", "RETURN QTY.", "STORE KEEPER SIGN", "REMARKS"]
  );
});

test("F/MNT/08: page 2's declaration, its hand-over heading, and each head beside 'Date:', as printed", () => {
  const install = doc("mnt-new-equipment");
  const l = layout(install.id);
  assert.equal(l.columns[1].label, "Assessment of Equipment   Y/N", "the heading as the company's own Word original writes it");
  const footer = l.footerFields ?? [];
  const shown = (f: LogHeaderField) => f.printedLabel ?? f.label;
  assert.deepEqual(footer.map(shown), ["Benefits:", "Risks including deviation accepted conditionally:", "Maintenance Head: -", "Date:", "Production Head: -", "Date:", "QC Head: -", "Date:"]);
  const group = footer.find((f) => (f.printedAbove?.length ?? 0) > 0);
  assert.equal(group?.key, "maintenanceHead", "the hand-over starts at the Maintenance Head");
  assert.deepEqual(group?.printedAbove, [
    "The Benefits and Risks have been assessed, PM, Sanitation etc.  Attach any supportive documents, procedures photos.  Approval has been made.",
    "Hand over & Take over Protocol",
  ]);
  assert.ok(!(l.instructions ?? []).some((line) => line.includes("Benefits and Risks")), "the declaration is printed where page 2 prints it, not above the grid");
  // Each box keeps a name that says whose date it is: a history line or Mitra goes by it.
  const names = footer.map((f) => f.label);
  assert.equal(new Set(names).size, names.length, "every box's name is its own");
  assert.equal(footer.find((f) => f.key === "qcHeadDate")?.label, "Hand over & Take over Protocol — QC Head — Date:");
  const files = sourceFiles(install);
  assert.ok(files.some((f) => f.endsWith(".doc")), "the company's own Word original is named");
  for (const f of files) assert.ok(onFile(f), `${f} is in source-documents`);
  assert.equal(documentFileKind(install), "docx");
});

test("F/MNT/09 stays on the newer issue of Rev 02 (01.09.2025), and its source line says which file is which", () => {
  const glass = doc("mnt-glass-breakage");
  assert.equal(glass.revisionNo, "02");
  assert.equal(glass.revisionDate, "2025-09-01", "the 01.09.2025 issue: newer than the 15.12.2024 one sent on 7-Oct-2026");
  assert.match(glass.sourceFile, /sent on 7-Oct-2026 is the 15\.12\.2024 issue/);
  const files = sourceFiles(glass);
  assert.ok(files.some((f) => f.endsWith("(3).pdf")), "the earlier issue is on file under its own name");
  assert.ok(files.some((f) => f.endsWith(".doc")), "the company's own Word original is named");
  for (const f of files) assert.ok(onFile(f), `${f} is in source-documents`);
  assert.equal(documentFileKind(glass), "docx");
  const pages = layout(glass.id).originalPages ?? [];
  assert.equal(pages.length, 4, "both issues' pages are shown, the earlier captioned so");
  // Still found by the words people use.
  assert.deepEqual(matchDocuments("glass breakage"), ["mnt-glass-breakage"]);
  assert.ok(documentRepository.getByIdUnscoped("mnt-glass-breakage"));
});
