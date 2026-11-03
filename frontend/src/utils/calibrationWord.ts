import type { Cell, ExportBlock, PaperCellSpec } from "./documentExport";
import { calibrationGeometryFor } from "../data/seed/qcCalibrationGeometry";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";

// F/QC/11 - THE MONTHLY INTERNAL CALIBRATION RECORD OF THE GSM CUTTING PLATE, DOWNLOADED AS WORD AS ITS PAGE IS DRAWN (the
// owner, 30-10-26, with the Word download beside the page: "the exact format of the document should come like the second
// screenshot ... the whole format is ruined while downloading the word"). His own Word file, filled, came out with each
// box's words twice, its PROCEDURE in a narrow frame at the side and the Calibration Date / Due Date line the page then no longer
// has. So the download is the page: one table on the page's own columns (data/seed/qcCalibrationGeometry.ts, mm) - the
// header box (the company, underlined, the line under it, the title, underlined), the FORMAT NO. / REV NO. / REV DATE /
// PAGE NO. band, the device's six boxes (its words over its value, centred), the grid (Index; each plate over its size and
// Deviation; Pass/Fail and Sign. one cell a plate), then the PROCEDURE, its first word bold. A4 landscape. The words and
// bound values are the page's, so a file edited in Word reads back as every download does.

export const GSM_PLATE = "qc-gsm-plate-calibration";
/** The page's margins (pt): the 262 mm table centred across A4 landscape. */
export const GSM_MARGINS = { top: 28, right: 46, bottom: 28, left: 46 };

const PT = 72 / 25.4;
const ARIAL = "Arial";
const TIMES = "Times New Roman";
const HAIR = 4; // half a point, in eighths
const text = (c: Cell | undefined): string => (c?.text ?? "").trim();
type Text = Extract<ExportBlock, { kind: "text" }>;
type Grid = Extract<ExportBlock, { kind: "table" }>;

/** Every column edge the rows are cut from (mm), merged where a hair apart. */
function unionEdges(rows: number[][]): number[] {
  const xs = new Set<number>([0]);
  for (const widths of rows) {
    let x = 0;
    for (const w of widths) {
      x = Math.round((x + w) * 100) / 100;
      xs.add(x);
    }
  }
  const out: number[] = [];
  for (const x of Array.from(xs).sort((a, b) => a - b)) if (out.length === 0 || x - out[out.length - 1] > 0.35) out.push(x);
  return out;
}

/** A cell holding its words over a value: the words, a line break, the value (its binding kept). */
function over(label: string, value: Cell | undefined): Cell {
  const v = value ?? { text: "" };
  const lead = label ? `${label}\n` : "";
  return { text: `${lead}${v.text}`, ...(v.parts ? { parts: [{ text: lead }, ...v.parts] } : {}) };
}

/** A cell holding its words and then its value on the same line (F/QC/11's "I. Calibration Date:-  21-09-26"). */
function beside(label: string, value: Cell | undefined): Cell {
  const v = value ?? { text: "" };
  const lead = label ? `${label}  ` : "";
  return { text: `${lead}${v.text}`, ...(v.parts ? { parts: [{ text: lead }, ...v.parts] } : {}) };
}

/** The page's blocks laid as F/QC/11's page, or null where the page does not read so (the generic download stands then). */
export function gsmPlateWord(blocks: ExportBlock[]): ExportBlock[] | null {
  const geo = calibrationGeometryFor(GSM_PLATE);
  if (!geo) return null;
  // What the page shows: the header's words, its band, the six boxes, the grid, the PROCEDURE.
  const titles = blocks.filter((b): b is Text => b.kind === "text" && !!b.title);
  const company = titles[0]?.text ?? "";
  const title = titles[1]?.text ?? "";
  if (!company || !title) return null;
  const under = blocks
    .slice(blocks.indexOf(titles[0]) + 1, blocks.indexOf(titles[1]))
    .filter((b): b is Text => b.kind === "text")
    .map((b) => b.text);
  const band = blocks.find((b): b is Grid => b.kind === "table" && !!b.band)?.rows[0] ?? [];
  const pairs = blocks.flatMap((b) => (b.kind === "fields" ? b.pairs : []));
  const grid = blocks.find((b): b is Grid => b.kind === "table" && !b.band && text(b.rows[0]?.[0]) === "Index");
  const procedure =
    blocks.flatMap((b) => (b.kind === "text" ? [b.text] : [])).find((t) => /^PROCEDURE\s*:/i.test(t.trim())) ??
    getLogSheetLayout(GSM_PLATE)?.notesBelow?.find((t) => /^PROCEDURE/i.test(t)) ??
    "";
  if (pairs.length < 6 || !grid || grid.rows.length < 3) return null;

  const cols = geo.grid.cols.length;
  const bandCells: Cell[] = [];
  for (let i = 0; i + 1 < band.length; i += 2) bandCells.push(over(text(band[i]), band[i + 1]));
  const quarter = geo.width / Math.max(1, bandCells.length);
  const edges = unionEdges([[geo.width], bandCells.map(() => quarter), geo.boxes.cols, geo.grid.cols]);
  const widthsMm = edges.slice(1).map((e, i) => e - edges[i]);
  const nearest = (mm: number) => {
    let best = 0;
    for (let i = 1; i < edges.length; i++) if (Math.abs(edges[i] - mm) < Math.abs(edges[best] - mm)) best = i;
    return best;
  };
  /** The table columns each of a run of widths (mm, from the left edge) covers. */
  const spans = (pieces: number[]): number[] => {
    let x = 0;
    return pieces.map((w) => {
      const from = nearest(x);
      x += w;
      return nearest(x) - from;
    });
  };
  const cell = (c: Cell | undefined, size: number, bold: boolean, align: PaperCellSpec["align"], valign: PaperCellSpec["valign"], font: string, more: Partial<PaperCellSpec> = {}): PaperCellSpec => ({
    ...(c ?? { text: "" }),
    size,
    bold,
    align,
    valign,
    font,
    borders: [HAIR, HAIR, HAIR, HAIR],
    ...more,
  });

  const rows: { height?: number; cells: PaperCellSpec[] }[] = [];
  const all = edges.length - 1;
  // The header box: the company (underlined) and the line under it, then the title (underlined).
  rows.push({ height: geo.head.company * 0.55 * PT, cells: [cell({ text: company }, 24, true, "center", "top", ARIAL, { colSpan: all, underline: true, borders: [HAIR, HAIR, HAIR, 0] })] });
  if (under.length) rows.push({ cells: [cell({ text: under.join("\n") }, 20, true, "center", "top", ARIAL, { colSpan: all, borders: [HAIR, HAIR, 0, HAIR] })] });
  rows.push({ height: geo.head.title * PT, cells: [cell({ text: title }, 24, true, "center", "center", ARIAL, { colSpan: all, underline: true })] });
  // The band: FORMAT NO. / REV NO. / REV DATE / PAGE NO., each its words over its value.
  if (bandCells.length) {
    const s = spans(bandCells.map(() => quarter));
    rows.push({ height: 11 * PT, cells: bandCells.map((c, i) => cell(c, 16, false, "left", "center", ARIAL, { colSpan: s[i] })) });
  }
  // The device's boxes, three to a line, each its words over its value, centred.
  const boxSpans = spans(geo.boxes.cols);
  for (let r = 0; r < 2; r++) {
    rows.push({
      height: geo.boxes.rows[r] * PT,
      cells: pairs.slice(r * 3, r * 3 + 3).map(([label, value], i) => cell(over(label, value), 20, false, "center", "center", r === 0 ? TIMES : ARIAL, { colSpan: boxSpans[i] })),
    });
  }
  // The paper's space, then "I. Calibration Date:-" two columns wide and "Due Date:-" at the right, each its words then its
  // value on one line at the left (the row back on the owner's word of 30-Oct-2026, REQUIREMENTS §147).
  // (The page puts Due Date in its third column, so an empty place stands before it: only the boxes with words count.)
  const row = pairs.slice(6).filter(([label]) => label.trim());
  if (row.length >= 2) {
    const across = boxSpans.reduce((a, b) => a + b, 0);
    const gap = geo.boxes.rows[2] ?? 0;
    if (gap > 0) rows.push({ height: gap * PT, cells: [cell({ text: "" }, 20, false, "left", "center", ARIAL, { colSpan: across, borders: [0, 0, 0, 0] })] });
    const [[dateLabel, dateValue], [dueLabel, dueValue]] = row;
    rows.push({
      height: (geo.boxes.rows[3] ?? 9) * PT,
      cells: [
        cell(beside(dateLabel, dateValue), 20, false, "left", "top", ARIAL, { colSpan: boxSpans[0] + (boxSpans[1] ?? 0) }),
        cell(beside(dueLabel, dueValue), 20, false, "left", "top", ARIAL, { colSpan: boxSpans[2] ?? 1 }),
      ],
    });
  }
  // The grid: Index merged down its two heading rows, each plate over its size and Deviation.
  const g = spans(geo.grid.cols);
  const head0 = grid.rows[0] ?? [];
  const head1 = grid.rows[1] ?? [];
  const cells0: PaperCellSpec[] = [cell(head0[0], 28, false, "left", "top", TIMES, { colSpan: g[0], vMerge: "restart" })];
  for (let c = 1; c < cols; c += 2) cells0.push(cell(head0[c], 24, false, "center", "top", TIMES, { colSpan: g[c] + (g[c + 1] ?? 0) }));
  rows.push({ height: geo.grid.head[0] * PT, cells: cells0 });
  rows.push({
    height: (geo.grid.head[1] ?? geo.grid.head[0]) * PT,
    cells: [cell({ text: "" }, 28, false, "left", "top", TIMES, { colSpan: g[0], vMerge: "continue" }), ...Array.from({ length: cols - 1 }, (_, k) => cell(head1[k + 1], 24, false, "center", "top", TIMES, { colSpan: g[k + 1] }))],
  });
  grid.rows.slice(grid.headerRows || 2).forEach((r, li) => {
    // Pass/Fail and Sign.: one cell under each plate, across its size and Deviation.
    const grouped = /^(Pass\/Fail|Sign\.?)$/i.test(text(r[0]));
    const cells: PaperCellSpec[] = [cell(r[0], 24, false, "right", "top", TIMES, { colSpan: g[0] })];
    if (grouped) for (let c = 1; c < cols; c += 2) cells.push(cell(r[c], 24, false, "center", "center", TIMES, { colSpan: g[c] + (g[c + 1] ?? 0) }));
    else for (let c = 1; c < cols; c++) cells.push(cell(r[c], 24, false, "center", "center", TIMES, { colSpan: g[c] }));
    rows.push({ height: (geo.grid.lines[li] ?? 9.5) * PT, cells });
  });
  const out: ExportBlock[] = [{ kind: "paper", widths: widthsMm.map((w) => Math.round(w * PT * 100) / 100), rows, spaceAfter: 12 }];
  // The PROCEDURE under the grid: its first word in bold, as the page prints it.
  const proc = procedure.trim().match(/^(PROCEDURE\s*:)\s*([\s\S]*)$/i);
  if (proc) {
    out.push({
      kind: "paper",
      widths: [Math.round(geo.width * PT * 100) / 100],
      rows: [{ cells: [cell({ text: ` ${proc[2]}` }, 22, false, "left", "top", ARIAL, { boldLead: proc[1], borders: [0, 0, 0, 0] })] }],
      spaceAfter: 1,
    });
  }
  return out;
}
