// THE RANGES AND LIMITS OF THE PLANT'S FORMATS, AS THE INDEX SHOWS AND THE SUPER ADMIN MAY CHANGE THEM.
//
//   band       a reading's allowed range, printed on the paper: F/QC/30 Viscosity 19–21 Sec., F/QC/40.C hot room
//              43–47 °C, F/PRD/19 nip pressure 2.5–3.5… A reading outside it is highlighted (engine/printedBands.ts,
//              engine/validation.ts). One range per kind of reading: the six timed hot-room readings share one.
//   within     a certificate of analysis' tolerance: Tested Length within + 2 / − 2 mm of the client's specified length.
//   value      a single limit the app falls back on: F/MKT/04's Pareto cutoff, 80 % when the box is blank.
//   scoreBands a formula that is a table of bands: F/SYS/07's audit frequency (0–4 Once / Year, 5–15 Twice / Year,
//              16 and above 3 times / Year), F/PUR/05's grade (90 and above A, 80 to below 90 B, below 80 C). Edited as
//              bands, saved as that formula (indexing/formulas.ts), so it has the formula's versions and history.
//   typed      a range written on each sheet or each line, not fixed in the format: F/QC/12's and F/QC/17's
//              Acceptable Tolerance box, the incoming-material inspections' Specification column. Shown, not changed:
//              it is the person's to write on the record.
//
// The defaults are read from the formats as issued (data/seed): nothing here is typed twice.

import type { LogColumn, LogHeaderField, LogSheetLayout } from "../frontend/src/types";
import { SEED_DOCUMENTS } from "../frontend/src/data/seed/documentDefinitions";
import { getIssuedLogSheetLayout } from "../frontend/src/data/seed/logSheetLayouts";
import { bandRangeId, stemOf, withinRangeId } from "./rangeIds";

export interface RangeValue {
  min?: number | null;
  max?: number | null;
  plus?: number;
  minus?: number;
  value?: number;
}

interface RangeBase {
  id: string;
  documentId: string;
  formatNo: string;
  formatName: string;
  /** What the range is of, as a person reads it: "Viscosity (Sec.)", "Hot room temperature". */
  what: string;
}

export interface BandRange extends RangeBase {
  kind: "band";
  unit: string;
  /** The columns it judges (several timed readings share one range). */
  columns: string[];
  defaults: { min: number | null; max: number | null };
}

export interface WithinRange extends RangeBase {
  kind: "within";
  field: string;
  of: string;
  percent: boolean;
  defaults: { plus: number; minus: number };
}

export interface ValueRange extends RangeBase {
  kind: "value";
  unit: string;
  defaults: { value: number };
  meaning: string;
}

export interface ScoreBandRange extends RangeBase {
  kind: "scoreBands";
  /** The formula (indexing/formulas.ts) the bands are. */
  slotId: string;
  variable: string;
  /** Whole numbers (a count of NCs): bands read "5–15"; otherwise "80 to below 90". */
  whole: boolean;
}

export interface TypedRange extends RangeBase {
  kind: "typed";
  where: string;
}

export type RangeDef = BandRange | WithinRange | ValueRange | ScoreBandRange | TypedRange;


const SCORE_BANDS: Omit<ScoreBandRange, "formatNo" | "formatName">[] = [
  { kind: "scoreBands", id: "bands:sys07.frequency", documentId: "sys-audit-risk", what: "Audit frequency from the Sum of NCs", slotId: "sys07.frequency", variable: "SUM", whole: true },
  { kind: "scoreBands", id: "bands:pur05.grade", documentId: "pur-supplier-performance", what: "Supplier grade from the Overall Rating", slotId: "pur05.grade", variable: "OVERALL", whole: false },
];

const VALUES: Omit<ValueRange, "formatNo" | "formatName">[] = [
  {
    kind: "value",
    id: "value:qc12.tolerance",
    documentId: "qc-weight-scale-calibration",
    what: "Acceptable Tolerance (± the deviation allowed)",
    unit: "%",
    defaults: { value: 0.05 },
    meaning: "Written in the Acceptable Tolerance box of every new sheet. A Deviation % above it is red and the line Fails: report to the QA manager.",
  },
  {
    kind: "value",
    id: "value:qc12.days",
    documentId: "qc-weight-scale-calibration",
    what: "Days between checks (Next Due Date = Date + days)",
    unit: "days",
    defaults: { value: 7 },
    meaning: "The first line starts on the previous week's Next Due Date; each line below on the Next Due Date above it.",
  },
  { kind: "value", id: "value:mkt04.cutoff", documentId: "mkt-complaint-trend", what: "Pareto cutoff (Vital Few up to)", unit: "%", defaults: { value: 80 }, meaning: "Used when the sheet's Cutoff box is left blank" },
];

let cached: RangeDef[] | null = null;

/** Every range and limit of every format, in the formats' order. */
export function rangeDefinitions(): RangeDef[] {
  if (cached) return cached;
  const out: RangeDef[] = [];
  for (const doc of SEED_DOCUMENTS) {
    const base = { documentId: doc.id, formatNo: doc.formatNo, formatName: doc.name };
    const layout = getIssuedLogSheetLayout(doc.id);
    if (layout) {
      const groups = new Map<string, BandRange>();
      for (const c of layout.columns as LogColumn[]) {
        if (c.min === undefined && c.max === undefined) continue;
        const stem = stemOf(c.label);
        const id = bandRangeId(doc.id, c.label);
        const g = groups.get(id);
        if (g) g.columns.push(c.key);
        else groups.set(id, { ...base, kind: "band", id, what: stem, unit: c.unit ?? "", columns: [c.key], defaults: { min: c.min ?? null, max: c.max ?? null } });
      }
      out.push(...groups.values());
      for (const f of (layout.headerFields ?? []) as LogHeaderField[]) {
        if (!f.within) continue;
        out.push({ ...base, kind: "within", id: withinRangeId(doc.id, f.key), what: f.label, field: f.key, of: f.within.of, percent: !!f.within.percent, defaults: { plus: f.within.plus, minus: f.within.minus } });
      }
      const typedTol = (layout.columns as LogColumn[]).find((c) => c.toleranceFrom);
      if (typedTol) {
        const box = (layout.headerFields ?? []).find((h) => h.key === typedTol.toleranceFrom);
        out.push({ ...base, kind: "typed", id: `typed:${doc.id}:tolerance`, what: `${stemOf(typedTol.label).replace(/\s*\d+$/, "")} — within ± the tolerance`, where: `Written on each sheet in the "${box?.label ?? typedTol.toleranceFrom}" box` });
      }
      if (layout.specBand) out.push({ ...base, kind: "typed", id: `typed:${doc.id}:spec`, what: "Each observation against its specification", where: 'Written on each line in the "Specification" column (e.g. "90 (+2 / −1)", "Max 15%")' });
    }
    for (const s of SCORE_BANDS) if (s.documentId === doc.id) out.push({ ...s, ...base });
    for (const v of VALUES) if (v.documentId === doc.id) out.push({ ...v, ...base });
  }
  cached = out;
  return out;
}

export const rangeDefinition = (id: string): RangeDef | undefined => rangeDefinitions().find((r) => r.id === id);
export const rangesOf = (documentId: string): RangeDef[] => rangeDefinitions().filter((r) => r.documentId === documentId);

/** The default value of an editable range. */
export function rangeDefault(def: RangeDef): RangeValue {
  if (def.kind === "band") return { min: def.defaults.min, max: def.defaults.max };
  if (def.kind === "within") return { plus: def.defaults.plus, minus: def.defaults.minus };
  if (def.kind === "value") return { value: def.defaults.value };
  return {};
}

const fmt = (n: number | null | undefined): string => (n === null || n === undefined ? "" : String(Math.round(n * 1e6) / 1e6));

/** A range as a person reads it: "19 – 21 Sec.", "+ 2 / − 2 mm", "80 %", "at least 30". */
export function rangeText(def: RangeDef, v: RangeValue): string {
  if (def.kind === "band") {
    const unit = def.unit ? ` ${def.unit}` : "";
    if (v.min !== null && v.min !== undefined && v.max !== null && v.max !== undefined) return `${fmt(v.min)} – ${fmt(v.max)}${unit}`;
    if (v.min !== null && v.min !== undefined) return `at least ${fmt(v.min)}${unit}`;
    if (v.max !== null && v.max !== undefined) return `at most ${fmt(v.max)}${unit}`;
    return "no limit";
  }
  if (def.kind === "within") return `+ ${fmt(v.plus)} / − ${fmt(v.minus)}${def.percent ? " %" : ""}`;
  if (def.kind === "value") return `${fmt(v.value)}${def.unit ? ` ${def.unit}` : ""}`;
  return "";
}

/** Why a range cannot be saved, or null. */
export function rangeProblem(def: RangeDef, v: RangeValue): string | null {
  const bad = (n: unknown) => n !== null && n !== undefined && (typeof n !== "number" || !Number.isFinite(n));
  if (def.kind === "band") {
    if (bad(v.min) || bad(v.max)) return "Write the limits as numbers.";
    if ((v.min === null || v.min === undefined) && (v.max === null || v.max === undefined)) return "Give at least one limit.";
    if (v.min !== null && v.min !== undefined && v.max !== null && v.max !== undefined && v.min > v.max) return "The lower limit is above the upper one.";
  }
  if (def.kind === "within") {
    if (bad(v.plus) || bad(v.minus) || v.plus === undefined || v.minus === undefined) return "Write the tolerance as numbers.";
    if (v.plus < 0 || v.minus < 0) return "A tolerance cannot be negative.";
  }
  if (def.kind === "value" && (bad(v.value) || v.value === undefined)) return "Write the limit as a number.";
  return null;
}

export const sameRange = (a: RangeValue | null | undefined, b: RangeValue | null | undefined): boolean => JSON.stringify(normal(a)) === JSON.stringify(normal(b));
function normal(v: RangeValue | null | undefined): RangeValue {
  const o: RangeValue = {};
  if (!v) return o;
  for (const k of ["min", "max", "plus", "minus", "value"] as const) if (v[k] !== undefined) o[k] = v[k] as number;
  return o;
}

// ---------------------------------------------------------------------------------------------------------------------
// score bands ⇄ their formula

export interface ScoreBand {
  /** At least this (the top band has the highest); null for the last ("below"). */
  from: number | null;
  result: string;
}

/** The bands a formula is, when it is a table of them: IF(V >= 16, "x", IF(V >= 5, "y", "z")). Null for any other formula. */
export function bandsOfFormula(expr: string, variable: string): ScoreBand[] | null {
  const bands: ScoreBand[] = [];
  let rest = expr.trim();
  const head = new RegExp(String.raw`^IF\s*\(\s*${variable}\s*>=\s*(-?\d+(?:\.\d+)?)\s*,\s*"([^"]*)"\s*,\s*`, "i");
  for (;;) {
    const m = head.exec(rest);
    if (!m) break;
    bands.push({ from: Number(m[1]), result: m[2] });
    rest = rest.slice(m[0].length);
  }
  const last = /^"([^"]*)"\s*/.exec(rest);
  if (!last || bands.length === 0) return null;
  rest = rest.slice(last[0].length).trim();
  if (rest !== ")".repeat(bands.length)) return null;
  for (let i = 1; i < bands.length; i++) if ((bands[i].from as number) >= (bands[i - 1].from as number)) return null;
  return [...bands, { from: null, result: last[1] }];
}

/** The formula of a table of bands (highest first). */
export function formulaOfBands(bands: ScoreBand[], variable: string): string {
  const steps = bands.filter((b) => b.from !== null);
  const last = bands.find((b) => b.from === null);
  const q = (s: string) => `"${s.replace(/"/g, "'")}"`;
  let out = q(last?.result ?? "");
  for (let i = steps.length - 1; i >= 0; i--) out = `IF(${variable} >= ${steps[i].from}, ${q(steps[i].result)}, ${out})`;
  return out;
}

/** Each band as a person reads it, lowest first: "0 – 4 → Once / Year" or "below 80 → C". */
export function bandLines(bands: ScoreBand[], whole: boolean): { range: string; result: string }[] {
  const steps = bands.filter((b) => b.from !== null) as { from: number; result: string }[];
  const last = bands.find((b) => b.from === null);
  const lines: { range: string; result: string }[] = [];
  const lowest = steps[steps.length - 1]?.from;
  if (last && lowest !== undefined) lines.push({ range: whole ? `0 – ${lowest - 1}` : `below ${lowest}`, result: last.result });
  for (let i = steps.length - 1; i >= 0; i--) {
    const above = i > 0 ? steps[i - 1].from : null;
    const range = above === null ? `${steps[i].from} and above` : whole ? `${steps[i].from} – ${above - 1}` : `${steps[i].from} to below ${above}`;
    lines.push({ range, result: steps[i].result });
  }
  return lines;
}

/** Why a table of bands cannot be saved, or null. */
export function bandsProblem(bands: ScoreBand[]): string | null {
  const steps = bands.filter((b) => b.from !== null);
  if (steps.some((b) => !Number.isFinite(b.from as number))) return "Write each band's start as a number.";
  for (let i = 1; i < steps.length; i++) if ((steps[i].from as number) >= (steps[i - 1].from as number)) return "Each band must start below the one above it.";
  if (bands.some((b) => !b.result.trim())) return "Give each band its result.";
  return null;
}
