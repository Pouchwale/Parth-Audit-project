// THE HR FORMATS AS THE COMPANY'S OWN PAPERS, EVERY PART EDITABLE (REQUIREMENTS §275; the owner, 21-Nov-2026: "as it is in my
// system which i have shared documents with you. as it is no new things and make sure each and every part is editable").
// Run: npm run test:unit -- hrPapers
import { readablePaper } from "../src/engine/paperReadable";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { HR_PAPER_TABLES } from "../src/data/seed/hrPaperTables";
import { paperTableFits, paperTableFor, paperTablePrint, type PaperCell, type PaperTable } from "../src/data/seed/qcPaperTables";
import { paperWordEdits, paperWordsOf, withPaperWords } from "../src/utils/originalFill/paperWords";
import { unzip, zipStored } from "../src/utils/xlsx";

const ROOT = process.env.DCRS_REPO_ROOT ?? process.cwd();
const src = (f: string) => readFileSync(path.join(ROOT, "frontend", "src", ...f.split("/")), "utf8").replace(/\r\n/g, "\n");
const SUPPLIED = ["hr-competence", "hr-competence-criteria", "hr-skill-matrix", "hr-pre-employment-health", "hr-induction-staff", "hr-induction-operators", "hr-job-responsibility", "hr-training-needs", "hr-training-calendar", "hr-training-imparted", "hr-training-effectiveness", "hr-training-feedback", "hr-mobile-authorization", "hr-visitor-health", "hr-gmp-checklist", "hr-psc-survey", "hr-psc-survey-analysis", "hr-hygiene-report"];
const cellsOf = (f: PaperTable): PaperCell[] => [...f.head, ...f.body, ...f.foot].flatMap((r) => r.cells).concat(f.lines?.cells ?? []);
const allWords = (f: PaperTable): string => cellsOf(f).map((c) => [c.t ?? "", ...(c.at ?? []).map((a) => a.t), c.sentence?.before ?? "", c.sentence?.after ?? ""].join(" ")).join(" ");

test("all eighteen formats the owner supplied are drawn as their papers, and every box of the record has its place", () => {
  assert.deepEqual(Object.keys(HR_PAPER_TABLES).sort(), [...SUPPLIED].sort());
  for (const id of SUPPLIED) {
    const form = paperTableFor(id)!;
    assert.ok(form.ownWords, `${id}: every word is the record's`);
    assert.ok(paperTableFits(form, getLogSheetLayout(id)!), `${id}: every box and column of the format has its place on the paper`);
  }
});

test("each paper carries the company's name and its format number as the owner's file prints them", () => {
  for (const id of SUPPLIED) {
    const words = allWords(HR_PAPER_TABLES[id]);
    assert.ok(words.includes("GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED"), `${id}: the company's own name`);
    assert.ok(/F\s*\/\s*HR\s*\/\s*\d\d/.test(words), `${id}: its format number`);
    assert.ok(!/PUBLICATIONS PVT/.test(words), `${id}: not DCRS's spelling`);
  }
});

test("no sample of the owner's file is left where the record writes", () => {
  assert.ok(!allWords(HR_PAPER_TABLES["hr-psc-survey-analysis"]).includes("93.99%"), "F/HR/21's January figure is the record's");
  assert.ok(!allWords(HR_PAPER_TABLES["hr-training-calendar"]).includes("22-07-2026"), "F/HR/09's dates are the record's");
  assert.ok(allWords(HR_PAPER_TABLES["hr-training-calendar"]).includes("{fy:0}"), "F/HR/09's months follow the sheet's own year");
  assert.ok(!allWords(HR_PAPER_TABLES["hr-job-responsibility"]).includes("managing budgets"), "F/HR/07's lines are the record's");
  assert.ok(!allWords(HR_PAPER_TABLES["hr-competence"]).includes("Shail Patel"), "F/HR/01's names are the record's");
});

test("F/HR/20's scale, F/HR/22's Yes and No, F/HR/04's answers are chosen on the paper's own cells", () => {
  const picks = (id: string) => cellsOf(HR_PAPER_TABLES[id]).flatMap((c) => [...(c.pick ?? []), ...(c.over ?? []).flatMap((o) => o.pick ?? [])]);
  assert.equal(picks("hr-psc-survey").length, 15 * 7);
  assert.deepEqual([...new Set(picks("hr-psc-survey").map((p) => p.value[0]))], ["7", "6", "5", "4", "3", "2", "1"]);
  assert.equal(picks("hr-hygiene-report").length, 31 * 9 * 2);
  assert.ok(picks("hr-pre-employment-health").some((p) => p.mark === "check" && p.off === "No"), "question 06's tick boxes");
  assert.ok(picks("hr-pre-employment-health").some((p) => p.box === "sex" && p.value === "Female"));
});

test("a paper of several pages is fitted to its width and breaks where the owner's file does; one page stays one page", () => {
  assert.ok(HR_PAPER_TABLES["hr-gmp-checklist"].flows);
  assert.ok([...HR_PAPER_TABLES["hr-gmp-checklist"].body].some((r) => r.pb), "F/HR/19's own pages");
  const one = HR_PAPER_TABLES["hr-psc-survey"];
  assert.ok(!one.flows);
  assert.ok(paperTablePrint(one, true).scale > 0.5);
});

test("a word typed over reaches the company's own Word and Excel file, wherever it prints it; nothing else changes", async () => {
  const form = HR_PAPER_TABLES["hr-training-feedback"];
  const place = [...paperWordsOf(form).entries()].find(([, w]) => w === "TRAINING FEEDBACK & EVALUATION RECORD")![0];
  const edits = paperWordEdits(form, { [`paper:${place}`]: "TRAINING FEEDBACK RECORD", "label:other": "x" });
  assert.deepEqual(edits, [{ from: "TRAINING FEEDBACK & EVALUATION RECORD", to: "TRAINING FEEDBACK RECORD" }]);
  const enc = new TextEncoder();
  const file = zipStored([
    { name: "xl/sharedStrings.xml", data: enc.encode("<sst><si><t>TRAINING FEEDBACK &amp; EVALUATION RECORD</t></si><si><t>Rating</t></si></sst>") },
    { name: "word/document.xml", data: enc.encode('<w:body><w:p><w:r><w:t>TRAINING FEEDBACK </w:t></w:r><w:r><w:t xml:space="preserve">&amp; EVALUATION RECORD</w:t></w:r></w:p><w:p><w:r><w:t>Rating</w:t></w:r></w:p></w:body>') },
  ]);
  const out = await withPaperWords(file, edits);
  const zip = await unzip(out.slice().buffer);
  const read = async (n: string) => new TextDecoder().decode(await zip.get(n)!());
  const xl = await read("xl/sharedStrings.xml");
  const doc = await read("word/document.xml");
  assert.ok(xl.includes(">TRAINING FEEDBACK RECORD<") && xl.includes("Rating"));
  assert.ok(doc.includes(">TRAINING FEEDBACK RECORD<") && !doc.includes("EVALUATION") && doc.includes("Rating"));
});

test("the screen's tools stay off the paper, and a download reads the record's boxes", () => {
  const view = src("components/records/LogSheetRecordView.tsx");
  assert.match(view, /pt\.ownWords && fetching && link && <HrMasterFetch/, "the fetch bar above the paper");
  assert.match(view, /!pt\.ownWords && <div className="text-xs text-faint mt-3 no-print">Specimen source/, "no specimen line");
  assert.match(src("utils/documentExport.ts"), /withPlainTwins\(roots/);
  assert.match(src("utils/originalFill/index.ts"), /ownWords \? "\$&" : COMPANY\.name/, "the file keeps the company's own name");
  assert.match(src("utils/print.ts"), /\[data-paper-own\]/, "a paper keeps its own lines' heights");
});

test("§280 the HR forms' Yes / No are tick boxes; so is F/HR/20's scale, no ring left; F/HR/04's boxes stay inside their lines", () => {
  const picks = (id: string) => cellsOf(HR_PAPER_TABLES[id]).flatMap((c) => [...(c.pick ?? []), ...(c.over ?? []).flatMap((o) => o.pick ?? [])]);
  for (const id of ["hr-pre-employment-health", "hr-visitor-health", "hr-gmp-checklist", "hr-training-effectiveness"]) {
    assert.ok(picks(id).length > 0, id);
    assert.ok(picks(id).every((p) => p.mark !== "ring"), `${id}: no ring left`);
    assert.ok(picks(id).some((p) => p.mark === "check"), `${id}: tick boxes`);
  }
  assert.ok(picks("hr-psc-survey").every((p) => p.mark === "check"), "F/HR/20's 7-to-1 scale is ticked too");
  for (const row of HR_PAPER_TABLES["hr-pre-employment-health"].body ?? []) {
    for (const c of row.cells) {
      if (c.rs) continue;
      for (const o of c.over ?? []) assert.ok(o.y + o.h <= row.h, `a box of ${c.t ?? "the sheet"} stays above its rule`);
    }
  }
});

test("§281 no ruled line runs past a paper's right-hand line: no thin open cell ends a row", () => {
  for (const [id, form] of Object.entries(HR_PAPER_TABLES)) {
    for (const row of [...form.head, ...(form.body ?? []), ...(form.lines ? [form.lines] : []), ...(form.foot ?? [])]) {
      const last = row.cells[row.cells.length - 1];
      if (row.cells.length < 2 || !last.edges) continue;
      const rulesAcross = last.edges.includes("t") || last.edges.includes("b");
      assert.ok(!(last.w <= 1 && rulesAcross && !last.edges.includes("r")), `${id}: a ${last.w} mm cell draws its lines past the right-hand line`);
    }
  }
});

test("§286 YES and NO stay side by side, a label and its box on one line, the names' columns hold the longest name", () => {
  const form = HR_PAPER_TABLES["hr-pre-employment-health"];
  const out = readablePaper(form, { header: {}, rows: [] }, "section-286");
  const cells = out.body.flatMap((r) => r.cells);
  const yesNo = cells.filter((c) => c.pick?.[0]?.word === "YES");
  assert.equal(yesNo.length, 9);
  for (const c of yesNo) assert.ok(c.w >= 19, `the YES / NO cell is ${c.w} mm wide`);
  for (const c of cells.filter((x) => x.pick?.length === 1 && x.pick[0].mark === "check" && !x.pick[0].word)) assert.ok(c.w >= 3.8, `a tick box's cell is ${c.w} mm wide`);
  // Question 02 keeps its two lines, its box on the second, inside its row.
  const row = out.body.find((r) => r.cells.some((c) => c.t?.startsWith("02.")))!;
  const q2 = row.cells.find((c) => c.t?.startsWith("02."))!;
  assert.ok(q2.t!.includes("\n"));
  assert.ok(q2.over![0].y + q2.over![0].h <= row.h);
  // F/HR/07's Position stands clear of its cell's edge, in the middle of its row, with room for a long position.
  const position = HR_PAPER_TABLES["hr-job-responsibility"].body[0].cells[0];
  assert.ok((position.x ?? 0) >= 1.5 && position.vm && position.sentence!.boxWidth >= 60);
  // F/HR/10 and F/HR/13 give a name the room of the staff sheet's longest.
  assert.ok(HR_PAPER_TABLES["hr-training-imparted"].lines!.cells.find((c) => c.col === "name")!.w >= 69);
  assert.ok(HR_PAPER_TABLES["hr-mobile-authorization"].lines!.cells.find((c) => c.col === "name")!.w >= 66);
});
