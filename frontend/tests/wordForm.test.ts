// A BLANK WORD FORM READ AS THE PAGE IT DRAWS (REQUIREMENTS §324), on the company's own originals: their page, their
// tables with merged cells and row heights, and their words with each run's style.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readDocxFile, type WordForm } from "../src/engine/wordForm/readDocx";

const repoRoot = process.env.DCRS_REPO_ROOT ?? process.cwd();
const original = async (name: string): Promise<WordForm> => {
  const bytes = readFileSync(path.join(repoRoot, "frontend", "public", "originals", `${name}.docx`));
  return readDocxFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
};
const tables = (f: WordForm) => f.body.flatMap((b) => (b.kind === "table" ? [b.table] : []));

test("F/HR/02's original: an A4 page, its table's grid, its cells' words and styles", async () => {
  const f = await original("hr-competence-criteria");
  assert.ok(f.page.width > 200 && f.page.width < 300, JSON.stringify(f.page));
  const t = tables(f);
  assert.ok(t.length >= 1, "a table");
  const first = t[0];
  assert.ok(first.widths.length >= 2 && first.widths.every((w) => w > 0), JSON.stringify(first.widths));
  const cells = first.rows.flatMap((r) => r.cells);
  assert.ok(cells.some((c) => c.text.length > 0));
  // Its Sr. No. is Word's own numbering: written 1., 2., 3. as Word writes it.
  const firsts = first.rows.map((r) => r.cells[0]?.text ?? "");
  assert.ok(firsts.includes("1.") && firsts.includes("2."), firsts.slice(0, 6).join(" | "));
  // Every row's cells cover the grid.
  for (const r of first.rows) {
    const covered = r.cells.reduce((n, c) => n + c.span, 0);
    assert.ok(covered <= first.widths.length, `a row covers ${covered} of ${first.widths.length}`);
  }
});

test("other originals read whole: a calibration record and a PM record", async () => {
  for (const name of ["qc-weight-scale-calibration", "mnt-pm-record", "training-record"]) {
    const f = await original(name);
    const t = tables(f);
    assert.ok(t.length >= 1, name);
    const words = t.flatMap((x) => x.rows.flatMap((r) => r.cells.map((c) => c.text))).join(" ");
    assert.ok(words.trim().length > 20, `${name}: ${words.slice(0, 80)}`);
    assert.ok(t.every((x) => x.rows.every((r) => r.cells.every((c) => c.paras.every((p) => p.runs.every((run) => run.size > 3 && run.size < 80))))), name);
  }
});

test("a Word form made into a format: its paper fits its layout, boxes and register found", async () => {
  const { wordFormToFormat } = await import("../src/engine/wordForm/toPaper");
  const { paperTableFits } = await import("../src/data/seed/qcPaperTables");
  for (const name of ["hr-competence-criteria", "training-record", "qc-weight-scale-calibration", "mnt-pm-record"]) {
    const f = await original(name);
    const made = wordFormToFormat(f, `upl-${name}`, `${name}.docx`);
    assert.ok(paperTableFits(made.paper, made.layout), `${name}: the paper fits its layout`);
    // Every row's cells add up to the paper's width.
    const widths = [...made.paper.body, ...made.paper.foot].map((r) => Math.round(r.cells.reduce((a, c) => a + c.w, 0)));
    assert.ok(widths.every((w) => Math.abs(w - widths[0]) <= 1), `${name}: ${[...new Set(widths)].join(",")}`);
    const keys = [...made.layout.headerFields.map((h) => h.key), ...made.layout.columns.map((c) => c.key)];
    assert.equal(new Set(keys).size, keys.length, "every key its own");
  }
});

test("a blank form: label boxes, a numbered register, two blanks on one line, the header's words following the format", async () => {
  // A made-up blank form typed in Word (tests/fixtures/blank-form-sample.docx), not a company record.
  const { wordFormToFormat, withHeaderWords, withoutBox, withField } = await import("../src/engine/wordForm/toPaper");
  const { paperTableFits } = await import("../src/data/seed/qcPaperTables");
  const bytes = readFileSync(path.join(repoRoot, "frontend", "tests", "fixtures", "blank-form-sample.docx"));
  const f = await readDocxFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  let made = wordFormToFormat(f, "upl-blank", "blank.docx");
  assert.deepEqual(made.boxes.map((b) => `${b.label}:${b.type}`), ["Date:date", "Forklift No:text", "Checked By:text", "Verified By:text"]);
  assert.deepEqual(made.columns.map((c) => c.label), ["Check Point", "Status (OK / Not OK)", "Remarks"]);
  assert.equal(made.registerLines, 6);
  assert.equal(made.paper.lines?.cells[0]?.num, "all", "the Sr. No. numbers the line");
  assert.ok(paperTableFits(made.paper, made.layout));
  made = withHeaderWords(made, { formatNo: "F/MNT/99", revisionNo: "00", title: "DAILY FORKLIFT CHECK RECORD" });
  const words = made.paper.body.flatMap((r) => r.cells.map((c) => c.t ?? ""));
  assert.ok(words.includes("{formatNo}") && words.includes("{revisionNo}") && words.includes("{title}"), words.join(" | "));
  // The review: a box let go stays printed paper; a box renamed keeps its key.
  made = withoutBox(made, "verifiedBy");
  assert.equal(made.layout.headerFields.some((h) => h.key === "verifiedBy"), false);
  assert.ok(paperTableFits(made.paper, made.layout), "still fits once a box is let go");
  made = withField(made, "forkliftNo", { label: "Forklift Number", type: "number" });
  assert.deepEqual(made.layout.headerFields.find((h) => h.key === "forkliftNo"), { key: "forkliftNo", label: "Forklift Number", type: "number" });
});

test("a Word-made format keeps its paper through an Edit format save, and is never 'restored' away", async () => {
  const { saveFormatEdit, formatEditFor, dropFormatEdit } = await import("../src/data/formatEdits");
  const { commitFormatChange, draftOf, restoreIssuedFormat } = await import("../src/engine/formatOps");
  const { documentRepository, ensureSeeded } = await import("../src/data/repositories/documentRepository");
  const { wordFormToFormat } = await import("../src/engine/wordForm/toPaper");
  const { paperTableFor } = await import("../src/data/seed/qcPaperTables");
  ensureSeeded();
  const bytes = readFileSync(path.join(repoRoot, "frontend", "tests", "fixtures", "blank-form-sample.docx"));
  const f = await readDocxFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const id = "upl-test-forklift";
  const made = wordFormToFormat(f, id, "blank.docx");
  const doc = { id, kind: "log-sheet" as const, name: "Daily Forklift Check Record", formatNo: "F/MNT/97", revisionNo: "00", revisionDate: "2026-11-24", department: "Maintenance", module: "Maintenance", frequency: "As Required" as const, status: "Configured" as const, description: "test", sourceFile: "blank.docx", schedule: { type: "as-required" as const } };
  documentRepository.upsert(doc);
  saveFormatEdit(id, { revisionNo: "00", revisionDate: "2026-11-24", layout: made.layout, paper: made.paper, revisions: [] });
  assert.equal(paperTableFor(id), formatEditFor(id)!.paper, "drawn as its stored paper");
  const draft = draftOf(documentRepository.getByIdUnscoped(id)!);
  const saved = commitFormatChange(documentRepository.getByIdUnscoped(id)!, { ...draft, name: "Daily Forklift Check" }, { actor: "Super Admin", reason: "test" });
  assert.ok(saved.ok);
  assert.ok(formatEditFor(id)?.paper, "the paper is kept through the save");
  assert.equal(restoreIssuedFormat(documentRepository.getByIdUnscoped(id)!), false);
  assert.ok(formatEditFor(id)?.layout, "nothing restored away");
  dropFormatEdit(id);
});
