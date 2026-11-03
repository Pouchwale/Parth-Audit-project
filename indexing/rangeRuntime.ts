// THE RANGES THE SUPER ADMIN CHANGED, LAID OVER THE FORMATS.
//
// frontend/src/data/seed/logSheetLayouts.ts hands every layout through withIndexRanges: a column whose range the index
// changed gets the new min / max — so the red highlight, the "readings out of range" count, the print, Mitra's fill and
// the insights all judge by it — and the wording of its heading where the heading prints the range
// ("Viscosity (20.0 ± 1.0 Sec.)" becomes "Viscosity (20.0 ± 2.0 Sec.)"); a certificate's box gets its new tolerance.
// While nothing is changed the layout is handed back untouched, the very same object.
//
// A SIGNED RECORD KEEPS THE RANGE IT WAS SIGNED WITH: getLogSheetLayoutForRecord asks with the moment the record was
// submitted (indexing/formulaRuntime.ts formulaTimeOf), as the formulas do. An open record and a new one: the range now.
//
// This file imports no layout (the layouts import it).

import type { LogColumn, LogHeaderField, LogSheetLayout } from "../frontend/src/types";
import { readIndexState, type RangeEntry } from "./indexState";
import type { RangeValue } from "./ranges";
import { LAYOUT_VALUES, bandRangeId, withinRangeId } from "./rangeIds";
import { currentFormulaClock } from "./formulaRuntime";

function inForce(timeline: readonly RangeEntry[] | undefined, asOf: string): RangeEntry | undefined {
  if (!timeline || timeline.length === 0) return undefined;
  let found: RangeEntry | undefined;
  for (const e of timeline) if (e.since <= asOf) found = e;
  return found;
}

/** The changed value of a range in force at `asOf` (now when not given), or null while its default is in force. */
export function rangeOverride(id: string, asOf?: string): RangeValue | null {
  const timeline = readIndexState().ranges[id];
  if (!timeline || timeline.length === 0) return null;
  return inForce(timeline, asOf ?? currentFormulaClock() ?? new Date().toISOString())?.value ?? null;
}

const num = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);
const decimalsOf = (s: string): number => (s.includes(".") ? s.split(".")[1].length : 0);
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/**
 * The heading's printed range, in the new figures: "20.0 ± 1.0" → "20.0 ± 2.0" when the old band was 19–21 and the new
 * one 18–22; "43 - 47" / "43 to 47" / "43–47" → the new ends. Anything else in the heading is left as it is.
 */
export function relabel(text: string, before: { min?: number; max?: number }, after: { min?: number | null; max?: number | null }): string {
  if (!text || !num(before.min) || !num(before.max) || !num(after.min) || !num(after.max)) return text;
  const pm = /(\d+(?:\.\d+)?)(\s*±\s*)(\d+(?:\.\d+)?)/;
  const m = pm.exec(text);
  if (m && close(Number(m[1]), (before.min + before.max) / 2) && close(Number(m[3]), (before.max - before.min) / 2)) {
    const mid = (after.min + after.max) / 2;
    const half = (after.max - after.min) / 2;
    const d = Math.max(decimalsOf(m[1]), decimalsOf(String(mid)));
    const dh = Math.max(decimalsOf(m[3]), decimalsOf(String(half)));
    return text.replace(pm, `${mid.toFixed(d)}${m[2]}${half.toFixed(dh)}`);
  }
  const range = /(\d+(?:\.\d+)?)(\s*(?:–|—|-|to)\s*)(\d+(?:\.\d+)?)/i;
  const r = range.exec(text);
  if (r && close(Number(r[1]), before.min) && close(Number(r[3]), before.max)) {
    return text.replace(range, `${after.min.toFixed(decimalsOf(r[1]))}${r[2]}${after.max.toFixed(decimalsOf(r[3]))}`);
  }
  return text;
}

function withBand(c: LogColumn, v: RangeValue): LogColumn {
  const min = v.min === null ? undefined : (v.min ?? c.min);
  const max = v.max === null ? undefined : (v.max ?? c.max);
  const next: LogColumn = { ...c, min, max };
  if (num(c.min) && num(c.max)) {
    next.label = relabel(c.label, { min: c.min, max: c.max }, { min, max });
    if (c.printedLabel) next.printedLabel = relabel(c.printedLabel, { min: c.min, max: c.max }, { min, max });
  }
  // The figure Mitra fills a reading around, kept inside the new range (the middle of it when it was the middle before).
  if (num(c.nominal)) {
    const wasMiddle = num(c.min) && num(c.max) && close(c.nominal, (c.min + c.max) / 2);
    if (wasMiddle && num(min) && num(max)) next.nominal = (min + max) / 2;
    else if (num(min) && c.nominal < min) next.nominal = num(max) ? (min + max) / 2 : min;
    else if (num(max) && c.nominal > max) next.nominal = num(min) ? (min + max) / 2 : max;
  }
  const fallback = c.autoFill?.default;
  const f = typeof fallback === "number" ? fallback : typeof fallback === "string" && fallback.trim() !== "" ? Number(fallback) : NaN;
  if (c.autoFill && Number.isFinite(f) && ((num(min) && f < min) || (num(max) && f > max))) {
    const middle = num(min) && num(max) ? (min + max) / 2 : num(min) ? min : (max as number);
    next.autoFill = { ...c.autoFill, default: typeof fallback === "number" ? middle : String(middle) };
  }
  return next;
}

const cache = new WeakMap<LogSheetLayout, Map<string, LogSheetLayout>>();

/** `layout` with the ranges the index changed (in force at `asOf`, now when not given); the same object when none is. */
export function withIndexRanges(documentId: string, layout: LogSheetLayout | undefined, asOf?: string): LogSheetLayout | undefined {
  if (!layout) return layout;
  const timelines = readIndexState().ranges;
  if (!timelines || Object.keys(timelines).length === 0) return layout;
  const prefixBand = `band:${documentId}:`;
  const prefixWithin = `within:${documentId}:`;
  const ids = Object.keys(timelines).filter((id) => id.startsWith(prefixBand) || id.startsWith(prefixWithin) || LAYOUT_VALUES[id] === documentId);
  if (ids.length === 0) return layout;
  const when = asOf ?? new Date().toISOString();
  const values: Record<string, RangeValue> = {};
  for (const id of ids) {
    const v = inForce(timelines[id], when)?.value;
    if (v) values[id] = v;
  }
  const key = JSON.stringify(values);
  if (key === "{}") return layout;
  let byKey = cache.get(layout);
  const hit = byKey?.get(key);
  if (hit) return hit;

  let columnsChanged = false;
  const columns = layout.columns.map((c) => {
    if (c.min === undefined && c.max === undefined) return c;
    const v = values[bandRangeId(documentId, c.label)];
    if (!v) return c;
    columnsChanged = true;
    return withBand(c, v);
  });
  let fieldsChanged = false;
  const headerFields = layout.headerFields?.map((f: LogHeaderField) => {
    if (!f.within) return f;
    const v = values[withinRangeId(documentId, f.key)];
    if (!v) return f;
    fieldsChanged = true;
    return { ...f, within: { ...f.within, plus: v.plus ?? f.within.plus, minus: v.minus ?? f.within.minus } };
  });
  // F/QC/12's Acceptable Tolerance every new sheet starts with (in place of the last sheet's, which no longer carries) and
  // its days between checks (indexing/rangeIds.ts LAYOUT_VALUES).
  const tolerance = values["value:qc12.tolerance"]?.value;
  const days = values["value:qc12.days"]?.value;
  let fields = fieldsChanged ? headerFields : layout.headerFields;
  if (typeof tolerance === "number" && fields) {
    fields = fields.map((f) => (f.key === "acceptableTolerance" ? { ...f, autoFill: { default: `${tolerance} %` } } : f));
    fieldsChanged = true;
  }
  const chain = typeof days === "number" && days > 0 && layout.nextDueChain ? { ...layout.nextDueChain, days: Math.round(days) } : layout.nextDueChain;
  const out: LogSheetLayout =
    columnsChanged || fieldsChanged || chain !== layout.nextDueChain
      ? { ...layout, columns: columnsChanged ? columns : layout.columns, ...(fieldsChanged ? { headerFields: fields } : {}), ...(chain ? { nextDueChain: chain } : {}) }
      : layout;
  if (!byKey) {
    byKey = new Map();
    cache.set(layout, byKey);
  }
  if (byKey.size > 20) byKey.clear();
  byKey.set(key, out);
  return out;
}
