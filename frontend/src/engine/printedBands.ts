import type { LogColumn, LogHeaderField, LogSheetData, LogSheetLayout, LogSheetRow } from "../types";

// A TOLERANCE OR A SPECIFICATION THE PAPER PRINTS DRIVES THE HIGHLIGHT (REQUIREMENTS §111, rule 2 of the owner's
// 13-Oct-2026 brief: "if there is a acceptance tolerance above ... in the record so it will already [be written] in
// the record").
//
// A numeric column has always had its band (min/max, engine/validation.ts isOutOfBand): F-QC-30's "Viscosity
// (20.0 ± 1.0 Sec.)" highlights a reading outside 19–21. Three more kinds of paper print their band where a
// column cannot hold it, and each is read here, from what the paper prints, so the sheet, its print, the count
// above the grid and the record's history all judge alike:
//
//   a tolerance written in a box     LogColumn.toleranceFrom — F/QC/12's "Acceptable Tolerance:" judges every
//                                    Deviation % on the sheet (± the figure written there).
//   a specification on each line     LogSheetLayout.specBand — an incoming material record's SPECIFICATION
//                                    beside its OBSERVATION: "90 (+2.0 / -1.0)", "Max 15%", "30 ± 10".
//   a tolerance table between boxes  LogHeaderField.within — a certificate of analysis' Tested Size Length
//                                    against the Client's Specified Size Length, + 2 mm / - 2 mm.
//
// NOTHING IS GUESSED. Only a specification that is a plain figure is read: "As per P.O. (±2)" depends on the order,
// "3PLY: 9 ± 1 / 5PLY: 12 ± 1" on which box it is, "Max. 120 mm (Except Silver & Gold ink)" on the ink, so those
// are the inspector's to judge, as they were. Only a reading that holds one figure is judged ("91.2", "38 dynes",
// "Both side 38 dynes", "12%"); "OK", "Transparent", "1:3" and "20 x 20cm" are not. The highlight never blocks a
// submission, as on the paper.

/** A band: either end may be open. */
export interface Band {
  min?: number;
  max?: number;
}

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const PLUS_MINUS = new RegExp(String.raw`^${NUM}\s*\(\s*\+\s*${NUM}\s*\/\s*-\s*${NUM}\s*\)`);
const NOMINAL_TOLERANCE = new RegExp(String.raw`${NUM}\s*\(?\s*±\s*${NUM}`);
const RANGE = new RegExp(String.raw`${NUM}\s*%?\s*(?:to|–|—|-)\s*${NUM}`, "i");
const AT_LEAST = new RegExp(String.raw`(?:\bmin(?:imum)?\.?|\babove)\s*:?\s*${NUM}`, "i");
const AT_MOST = new RegExp(String.raw`(?:\bmax(?:imum)?\.?|\bbelow)\s*:?\s*${NUM}`, "i");
/** A specification that depends on the order, on which of several things the reading is, or on an exception. */
const NOT_PLAIN = /as per|except|ply\s*:|side\s*:|\bfor\s+[^:\n]+:/i;

const specCache = new Map<string, Band | null>();

/** The band a printed specification gives, or null where it gives none a figure can be judged by. */
export function specBand(spec: unknown): Band | null {
  const text = String(spec ?? "").trim();
  if (!text) return null;
  const hit = specCache.get(text);
  if (hit !== undefined) return hit;
  let band: Band | null = null;
  if (!NOT_PLAIN.test(text)) {
    const pm = text.match(PLUS_MINUS);
    const nt = text.match(NOMINAL_TOLERANCE);
    const range = text.match(RANGE);
    if (pm) band = { min: round(Number(pm[1]) - Number(pm[3])), max: round(Number(pm[1]) + Number(pm[2])) };
    else if (nt) band = { min: round(Number(nt[1]) - Number(nt[2])), max: round(Number(nt[1]) + Number(nt[2])) };
    else if (range && Number(range[1]) <= Number(range[2])) band = { min: Number(range[1]), max: Number(range[2]) };
    else {
      const least = text.match(AT_LEAST);
      const most = text.match(AT_MOST);
      if (least || most) band = { ...(least ? { min: Number(least[1]) } : {}), ...(most ? { max: Number(most[1]) } : {}) };
    }
  }
  specCache.set(text, band);
  return band;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** The one figure a reading holds — "91.2", "91.2 mm", "Both side 38 dynes", "-0.02%" — or null where it holds none or several. */
export function readingFigure(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const figures = value.match(/(?<![\d.])-?\d+(?:\.\d+)?/g);
  return figures && figures.length === 1 ? Number(figures[0]) : null;
}

const outside = (v: number, band: Band): boolean => (band.min !== undefined && v < band.min - 1e-9) || (band.max !== undefined && v > band.max + 1e-9);

/** ± the figure written in a tolerance box ("0.05 %", "± 0.05%"), or null where none is written. */
export function toleranceOf(text: unknown): number | null {
  const m = String(text ?? "").match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Whether a cell of the grid is outside the band its paper prints: its column's, its box's tolerance, or its line's specification. */
export type CellJudge = (row: LogSheetRow, col: LogColumn, printed?: Record<string, string | number | null>) => boolean;

/** The judge of a sheet's cells, for the boxes it holds now: one per sheet, new only when a tolerance box changes (the grid's lines are not drawn again for a keystroke elsewhere). */
export function cellJudge(layout: LogSheetLayout, header: Record<string, unknown> | undefined): CellJudge {
  const tolerances = new Map<string, number | null>();
  for (const c of layout.columns) if (c.toleranceFrom) tolerances.set(c.key, toleranceOf(header?.[c.toleranceFrom]));
  const spec = layout.specBand;
  const readings = spec ? new Set(spec.readings) : null;
  return (row, col, printed) => {
    const value = row[col.key];
    if (col.type === "number") {
      if (typeof value !== "number") return false;
      return (col.min !== undefined && value < col.min) || (col.max !== undefined && value > col.max);
    }
    if (col.toleranceFrom) {
      const tol = tolerances.get(col.key) ?? null;
      const v = readingFigure(value);
      return tol !== null && v !== null && Math.abs(v) > tol + 1e-9;
    }
    if (spec && readings!.has(col.key)) {
      const band = specBand(row[spec.spec] ?? printed?.[spec.spec]);
      const v = band ? readingFigure(value) : null;
      return band !== null && v !== null && outside(v, band);
    }
    return false;
  };
}

/** The key of the tolerance boxes a sheet's cells are judged by: the judge is made again when this changes. */
export function toleranceKey(layout: LogSheetLayout, header: Record<string, unknown> | undefined): string {
  let key = "";
  for (const c of layout.columns) if (c.toleranceFrom) key += `${c.toleranceFrom}=${String(header?.[c.toleranceFrom] ?? "")};`;
  return key;
}

const judges = new WeakMap<LogSheetLayout, { key: string; judge: CellJudge }>();

/**
 * The sheet's judge as the record page draws it: the SAME function for as long as the layout and its tolerance boxes
 * are unchanged, so a line of the grid (drawn again only when what it is handed changes, REQUIREMENTS §76) is not
 * drawn again for a keystroke in another box.
 */
export function judgeFor(layout: LogSheetLayout, header: Record<string, unknown> | undefined): CellJudge {
  const key = toleranceKey(layout, header);
  const hit = judges.get(layout);
  if (hit && hit.key === key) return hit.judge;
  const judge = cellJudge(layout, header);
  judges.set(layout, { key, judge });
  return judge;
}

/** Whether a box is outside the paper's tolerance of the box it is judged against (LogHeaderField.within). */
export function boxOutOfBand(field: LogHeaderField, header: Record<string, unknown> | undefined): boolean {
  const w = field.within;
  if (!w) return false;
  const base = readingFigure(header?.[w.of]);
  const v = readingFigure(header?.[field.key]);
  if (base === null || v === null) return false;
  const plus = w.percent ? (base * w.plus) / 100 : w.plus;
  const minus = w.percent ? (base * w.minus) / 100 : w.minus;
  return outside(v, { min: base - minus, max: base + plus });
}

/** Every cell and box of a record outside the band its paper prints: the count the sheet says above the grid, the history and the reports. */
export function outOfBandCount(layout: LogSheetLayout, data: LogSheetData): number {
  const judge = cellJudge(layout, data.header);
  const printed = layout.rowMode.kind === "fixedRows" ? layout.rowMode.rows : undefined;
  let n = 0;
  data.rows.forEach((row, i) => {
    for (const col of layout.columns) if (judge(row, col, printed?.[i])) n += 1;
  });
  for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) if (boxOutOfBand(f, data.header)) n += 1;
  return n;
}
