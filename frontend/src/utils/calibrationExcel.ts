import type { Cell, ExportBlock, PaperCellSpec } from "./documentExport";
import { calibrationGeometryFor } from "../data/seed/qcCalibrationGeometry";
import { gsmPlateWord } from "./calibrationWord";

// F/QC/11 AND F/QC/12 DOWNLOADED AS EXCEL AS THEIR PAGES ARE DRAWN (the owner, 31-Oct-2026: "qc/11 excel should be proper
// like preview same for qc/12 also"). Each page is laid as Word tables on the paper's own measures
// (data/seed/qcCalibrationGeometry.ts, mm) and utils/paperSheets.ts paperAsSheet puts them on one sheet: merged cells,
// column widths, row heights, fonts and rules as the page has them. F/QC/11 is the page its Word download draws
// (utils/calibrationWord.ts) with the number at its foot; F/QC/12 is drawn here. The Word downloads are not changed.

const PT = 72 / 25.4;
const ARIAL = "Arial";
const HAIR = 4; // half a point, in eighths
const NONE: PaperCellSpec["borders"] = [0, 0, 0, 0];
type Text = Extract<ExportBlock, { kind: "text" }>;
type Grid = Extract<ExportBlock, { kind: "table" }>;
type Paper = Extract<ExportBlock, { kind: "paper" }>;

const text = (c: Cell | undefined): string => (c?.text ?? "").trim();
const mm = (n: number) => Math.round(n * PT * 100) / 100;

function cell(c: Cell | undefined, size: number, bold: boolean, align: PaperCellSpec["align"], valign: PaperCellSpec["valign"], more: Partial<PaperCellSpec> = {}): PaperCellSpec {
  return { ...(c ?? { text: "" }), size, bold, align, valign, font: ARIAL, borders: [HAIR, HAIR, HAIR, HAIR], ...more };
}

/** How tall a cell's words stand when wrapped in a column so wide (pt): Arial's letters about half their size wide. */
export function wrappedHeight(words: string, widthPt: number, halfPoints: number, charWidth = 0.52): number {
  const size = halfPoints / 2;
  const perLine = Math.max(1, Math.floor((widthPt - 4) / (size * charWidth)));
  const lines = words.split("\n").reduce((n, line) => {
    let count = 1;
    let used = 0;
    for (const word of line.split(/\s+/).filter(Boolean)) {
      const w = word.length + (used ? 1 : 0);
      if (used && used + w > perLine) {
        count++;
        used = word.length;
      } else used += w;
    }
    return n + count;
  }, 0);
  return lines * size * 1.2 + 4;
}

/** The format number at the page's foot ("F/QC/12 (01/01.01.2022)"), centred, as the page prints it. */
function footOf(blocks: ExportBlock[], widthMm: number): Paper | null {
  const foot = blocks.find((b): b is Text => b.kind === "text" && /^F\/QC\/\d+\s*\(/.test(b.text.trim()));
  if (!foot) return null;
  return { kind: "paper", widths: [mm(widthMm)], rows: [{ cells: [cell({ text: foot.text.trim(), ...(foot.parts ? { parts: foot.parts } : {}) }, 22, false, "center", "top", { borders: NONE })] }] };
}

/** F/QC/11's page for Excel: the page its Word download draws, and the number at its foot. */
export function gsmPlateExcelPage(blocks: ExportBlock[]): ExportBlock[] | null {
  const page = gsmPlateWord(blocks);
  const geo = calibrationGeometryFor("qc-gsm-plate-calibration");
  if (!page || !geo) return null;
  const foot = footOf(blocks, geo.width);
  if (!foot) return page;
  // The PROCEDURE as tall as its wrapped lines (Excel does not size a merged row itself), and a line's space before the number.
  const last = page[page.length - 1];
  if (last.kind !== "paper" || last.rows.length !== 1 || last.rows[0].cells.length !== 1) return [...page, foot];
  const proc = last.rows[0].cells[0];
  const height = wrappedHeight(`${proc.boldLead ?? ""}${proc.text}`, mm(geo.width), proc.size);
  return [...page.slice(0, -1), { ...last, rows: [{ ...last.rows[0], height }], spaceAfter: 12 }, foot];
}

/** F/QC/12's page for Excel, or null where the page does not read so (the generic download stands then). */
export function weightScaleExcelPage(blocks: ExportBlock[]): ExportBlock[] | null {
  const geo = calibrationGeometryFor("qc-weight-scale-calibration");
  if (!geo) return null;
  const titles = blocks.filter((b): b is Text => b.kind === "text" && !!b.title);
  const company = titles[0]?.text ?? "";
  const title = titles[1]?.text ?? "";
  if (!company || !title) return null;
  const under = blocks
    .slice(blocks.indexOf(titles[0]) + 1, blocks.indexOf(titles[1]))
    .filter((b): b is Text => b.kind === "text")
    .map((b) => b.text);
  const pairs = blocks.flatMap((b) => (b.kind === "fields" ? b.pairs : []));
  const grid = blocks.find((b): b is Grid => b.kind === "table" && !b.band && text(b.rows[0]?.[0]) === "Date");
  const cols = geo.grid.cols.length;
  if (pairs.length < 9 || !grid || grid.rows.length < 2 || grid.rows[0].length !== cols) return null;
  const texts = blocks.flatMap((b) => (b.kind === "text" ? [b.text.trim()] : []));
  const at = texts.findIndex((t) => /^PROCEDURE\s*:/i.test(t));
  const procHead = at >= 0 ? (texts[at].match(/^PROCEDURE\s*:/i)?.[0] ?? "PROCEDURE:") : "";
  const procBody = at >= 0 ? (texts[at].replace(/^PROCEDURE\s*:\s*/i, "") || (texts[at + 1] ?? "")) : "";

  const out: ExportBlock[] = [];
  // Everything as wide as the grid: the paper's header and boxes stand 1.2 mm wider, which on a sheet is a sliver of a
  // column that loses the box's right-hand rule.
  const width = geo.gridWidth;
  const boxCols = geo.boxes.cols.map((w) => (w * width) / geo.width);
  // The header box: the company (underlined) and the line under it, a rule, then the title (underlined).
  const half = geo.head.company / 2;
  out.push({
    kind: "paper",
    widths: [mm(width)],
    rows: [
      { height: mm(under.length ? half : geo.head.company), cells: [cell({ text: company }, 24, true, "center", "center", { underline: true, borders: under.length ? [HAIR, HAIR, HAIR, 0] : [HAIR, HAIR, HAIR, HAIR] })] },
      ...(under.length ? [{ height: mm(half), cells: [cell({ text: under.join("\n") }, 18, true, "center", "top", { borders: [HAIR, HAIR, 0, HAIR] as PaperCellSpec["borders"] })] }] : []),
      { height: mm(geo.head.title), cells: [cell({ text: title }, 24, true, "center", "center", { underline: true })] },
    ],
  });
  // The device's boxes, three to a line: the words in bold at the top of the box, the value under them.
  const boxRows: Paper["rows"] = [];
  for (let r = 0; r < 3; r++) {
    const line = pairs.slice(r * 3, r * 3 + 3);
    const h = geo.boxes.rows[r] ?? 13;
    boxRows.push({ height: mm(h * 0.5), cells: line.map(([label]) => cell({ text: label }, 22, true, "left", "top", { borders: [HAIR, HAIR, HAIR, 0] })) });
    boxRows.push({ height: mm(h * 0.5), cells: line.map(([, value]) => cell(value, 22, false, "left", "top", { borders: [HAIR, HAIR, 0, HAIR] })) });
  }
  out.push({ kind: "paper", widths: boxCols.map(mm), rows: boxRows, spaceAfter: mm(geo.grid.gapAbove) });
  // The grid: the headings in bold, centred; each line centred; the Deviation % line its word small, at the left.
  const widthsPt = geo.grid.cols.map(mm);
  const gridRows: Paper["rows"] = [];
  const headCells = grid.rows[0].map((c) => cell(c, 22, true, "center", "top"));
  const headH = Math.max(mm(geo.grid.head[0] ?? 12.8), ...grid.rows[0].map((c, i) => wrappedHeight(text(c), widthsPt[i], 22)));
  gridRows.push({ height: headH, cells: headCells });
  grid.rows.slice(Math.max(1, grid.headerRows)).forEach((r, li) => {
    const row = Array.from({ length: cols }, (_, i) => r[i] ?? { text: "" });
    const deviation = /^Deviation/i.test(text(row[0]));
    const cells = row.map((c, i) => (deviation && i === 0 ? cell(c, 16, false, "left", "center") : cell(c, 22, false, "center", "top")));
    const h = Math.max(mm(geo.grid.lines[li] ?? 8.35), ...row.map((c, i) => wrappedHeight(text(c), widthsPt[i], deviation && i === 0 ? 16 : 22)));
    gridRows.push({ height: Math.round(h * 4) / 4, cells });
  });
  out.push({ kind: "paper", widths: widthsPt, rows: gridRows, spaceAfter: mm(geo.notes.gapAbove) });
  // The PROCEDURE: its word in bold on its own line, the sentence under it.
  if (procHead) {
    out.push({
      kind: "paper",
      widths: [mm(width)],
      rows: [
        { cells: [cell({ text: procHead }, 22, true, "left", "top", { borders: NONE })] },
        ...(procBody ? [{ height: wrappedHeight(procBody, mm(width), 22), cells: [cell({ text: procBody }, 22, false, "left", "top", { borders: NONE })] }] : []),
      ],
      spaceAfter: 12,
    });
  }
  const foot = footOf(blocks, width);
  if (foot) out.push(foot);
  return out;
}
