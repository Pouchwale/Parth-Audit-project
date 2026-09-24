import type { DailyPestMonitoringData, GapFinding, GapInspectionData, LogColumn, LogSheetData, LogSheetLayout, LogSheetRow, RecordInstance } from "../types";
import type { Insight, InsightChart, InsightEvidence, InsightRule, InsightSeverity, RuleContext, SuggestedCapa } from "./insights";
import { isLotAccepted, isOutOfBand } from "./validation";
import { actionForGrade, RM_PM_PERFORMANCE_ID, supplierRatingCells } from "./purchaseRatings";
import { breakdownSpanMinutes } from "./maintenanceCalc";
import { isPlaceholder, machineKey } from "./equipmentMaster";
import { compareISO, formatDisplayDate, MONTH_NAMES } from "../utils/date";

// THE RULES BEHIND THE INSIGHTS (REQUIREMENTS §75) — each one a fixed piece of
// arithmetic on the plant's own records, with the reason for its severity
// written beside it. engine/insights.ts decides which records count (only what
// people wrote, only the departments the person may see) and hands every rule
// the same RuleContext; a rule only reads.
//
// Which rules, and why these. Each was checked against a full demo year of the
// plant's records (Jan–Sep 2026) before it was written, and a rule that fired on
// the generator's quirks rather than on the plant was left out:
//   A1  readings outside the band the form prints, per sheet
//   A2  a shifted process caught BEFORE a reading leaves the band (WE rule 2)
//   A4  out-of-band readings verified with nothing explaining them
//   B1  the same lot deviation written again and again
//   B2  the same finding on the daily pest control register again and again
//   B3  a CAPA closed, and the same finding back afterwards
//   B4  CAPA findings past their target date
//   B5  printing stopped twice or more in a month on F/QC/13
//   C1  a record that passes and fails the same test: a lot Accepted while one
//       of its pass/fail tests reads its failing word, an F grade marked Pass
//   C2  a lot's reason stating a figure its own observation does not read
//   C3  an instrument's calibration expired
//   SUP a supplier graded C on F/PUR/05
//   M1–M7 Maintenance (REQUIREMENTS §74): lux, the equipment list, breakdowns,
//       glass breakage, daily health gaps, PM slippage, unknown machines.
// Left out on purpose: the other three Western Electric rules and EWMA (on
// 5,376 hourly viscosity points they raised 13–18 false-alarm days against
// WE2's 8), and least-squares "projected to reach the limit" (the demo's shifts
// are abrupt, within a day, so it had no true positives).
// C1 and C2 could not be checked against the demo year until the generator
// stopped contradicting itself (commit 4c29d1e): it carried a FAIL forward
// onto every inspection after the first failed lot (127 of 224 pouching sheets
// read FAIL beside an Accepted lot), no lot reason's figure was the one written
// beside it (0 of 26), and 91 of 104 rejection reasons were disproved by their
// own record. Now its observations agree with the lot's status, its reasons
// name what the record shows, and a demo year gives neither rule anything — so
// what C1 or C2 finds was written that way by a person. A rule comparing a
// verifier's rejection reason with the record is still not here: most reasons
// ("to be re-checked against the shop-floor sheet") name nothing a record holds.

// ---------------------------------------------------------------------------
// shared helpers

const DAY_LOOKBACK = 60; // a day's readings are reported one by one for this long
const EVENT_WINDOW = 90; // "N times in 90 days": recurrences, breakdowns, verified excursions
const MAX_EVIDENCE = 12;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isISO = (v: unknown): v is string => typeof v === "string" && v.length === 10 && ISO_DATE.test(v);

/** Days since 1970 for an ISO date, in UTC so no time zone moves it. */
function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86400000;
}
const daysBetween = (from: string, to: string): number => dayNumber(to) - dayNumber(from);
const isoFromDay = (day: number): string => new Date(day * 86400000).toISOString().slice(0, 10);
const shiftDays = (iso: string, n: number): string => isoFromDay(dayNumber(iso) + n);

/** A real calendar day written as ISO — not "12.09.2026", not "2026-02-31". */
const isRealISO = (v: unknown): v is string => isISO(v) && isoFromDay(dayNumber(v)) === v;
/**
 * "2026-09-12" → "12-Sep-2026"; anything else comes back as it was written.
 * formatDisplayDate THROWS on text that is not an ISO date ("12.09.2026", which
 * a date column holds once the Format Editor has made it Text), and a rule that
 * throws loses every insight it would have given — so nothing here hands it a
 * value it has not checked.
 */
const fmt = (value: unknown): string => (isRealISO(value) ? formatDisplayDate(value) : text(value));
const monthLabel = (ym: string): string => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1] ?? ym.slice(5, 7)} ${ym.slice(0, 4)}`;
/**
 * 5376 → "5,376", 123456 → "1,23,456": whole numbers grouped the Indian way, as
 * the plant writes them. Done by hand because the first toLocaleString loads
 * the locale data, which can cost tens of milliseconds on a slow laptop for
 * nothing more than a comma.
 */
function grouped(n: number): string {
  const digits = String(Math.abs(Math.round(n)));
  const sign = n < 0 ? "-" : "";
  if (digits.length <= 3) return sign + digits;
  const parts: string[] = [];
  let rest = digits.slice(0, -3);
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return `${sign}${parts.join(",")},${digits.slice(-3)}`;
}
const plural = (n: number, one: string, many = `${one}s`): string => `${grouped(n)} ${n === 1 ? one : many}`;
const times = (n: number): string => (n === 1 ? "once" : n === 2 ? "twice" : `${grouped(n)} times`);
const text = (v: unknown): string => String(v ?? "").trim();
const clip = (v: unknown, n = 80): string => {
  const s = text(v).replace(/\s+/g, " ");
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
};
const quote = (v: unknown, n = 80): string => `"${clip(v, n)}"`;
/** "રજિસ્ટ્રેશન (Registration)" → "Registration": F/QC/13 prints its parameters in Gujarati with the English in brackets. */
const englishName = (parameter: unknown): string => text(parameter).match(/\(([^)]+)\)\s*$/)?.[1] ?? text(parameter);
const num = (n: number, places = 2): string => {
  const f = 10 ** places;
  return String(Math.round(n * f) / f);
};

/**
 * Text as compared for "the same again": case, spacing and punctuation
 * ignored, and every number read as "#", so "Pouch height 178 mm" and "Pouch
 * height 181 mm" are the same deviation written on two lots.
 */
export function normText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\d+(?:[.,]\d+)*/g, "#")
    .replace(/[^\p{L}\p{N}#]+/gu, " ")
    .trim();
}

function ev(record: RecordInstance, field?: string, value?: string): InsightEvidence {
  return { recordId: record.id, documentId: record.documentId, dueDate: record.dueDate, ...(field ? { field } : {}), ...(value !== undefined ? { value } : {}) };
}

/** Newest first, one line per record and field, capped — with the total kept for "and N more". */
function capEvidence(list: InsightEvidence[]): { evidence: InsightEvidence[]; evidenceTotal?: number } {
  const seen = new Set<string>();
  const unique = list.filter((e) => {
    const k = `${e.recordId}|${e.field ?? ""}|${e.value ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  unique.sort((a, b) => compareISO(b.dueDate, a.dueDate));
  const records = new Set(unique.map((e) => e.recordId)).size;
  return unique.length > MAX_EVIDENCE ? { evidence: unique.slice(0, MAX_EVIDENCE), evidenceTotal: records } : { evidence: unique };
}

const rowsOf = (record: RecordInstance): LogSheetRow[] => {
  const rows = (record.data as LogSheetData | undefined)?.rows;
  return Array.isArray(rows) ? rows : [];
};
const headerOf = (record: RecordInstance): Record<string, string> => (record.data as LogSheetData | undefined)?.header ?? {};

// "In the last N days", asked once per record by several rules: the first day
// of the window is worked out once per run, and an ISO date is then compared as
// the string it is.
const windowStarts = new Map<string, string>();
function within(iso: string, today: string, days: number): boolean {
  const k = `${today}|${days}`;
  let from = windowStarts.get(k);
  if (from === undefined) windowStarts.set(k, (from = shiftDays(today, -days)));
  return iso >= from && iso <= today && isISO(iso);
}

function insight(ctx: RuleContext, documentId: string, fields: Omit<Insight, "module" | "documentId" | "evidence" | "evidenceTotal" | "sourceRecordIds"> & { evidence: InsightEvidence[] }): Insight {
  const { evidence, ...rest } = fields;
  // Every record, from the list as the rule made it — before capEvidence keeps
  // twelve for the card — so a CAPA raised from it names them all (raiseCapa.ts).
  const sourceRecordIds = [...new Set(evidence.map((e) => e.recordId))];
  return { ...rest, module: ctx.moduleOf(documentId), documentId, ...capEvidence(evidence), sourceRecordIds };
}

/** The internal CAPA report's findings on this computer that the person may see, with the report each is on. */
function capaFindings(ctx: RuleContext): { record: RecordInstance<GapInspectionData>; finding: GapFinding & { sourceRecordIds?: string[]; insightKey?: string } }[] {
  const out: { record: RecordInstance<GapInspectionData>; finding: GapFinding & { sourceRecordIds?: string[]; insightKey?: string } }[] = [];
  for (const record of ctx.records("gap-inspection") as RecordInstance<GapInspectionData>[]) {
    for (const finding of record.data?.findings ?? []) out.push({ record, finding });
  }
  return out;
}

const inspectionDateOf = (record: RecordInstance<GapInspectionData>): string => (isISO(record.data?.inspectionDate) ? record.data.inspectionDate : record.dueDate);

// ===========================================================================
// A — READINGS AGAINST THE BAND THE FORM PRINTS
// ===========================================================================

// A READING is a number column that prints a nominal as well as its band: that
// is the layouts' own convention (types/logSheet.ts — "measured READINGS get a
// nominal; set-points and weighed quantities get carryForward"). Today that is
// exactly F-QC-30's viscosity, F-QC-32's viscosity and F-QC-40.C's six hot-room
// temperatures. The set-points of the Process Parameter Record and the weighed
// quantities of F-QC-32 print a band too, but they are copied job to job, and
// the rating columns of F/PUR/05 print 0–100 only to catch a typo — none of them
// is a measurement that can drift.
const isReadingColumn = (c: LogColumn): boolean => c.type === "number" && typeof c.nominal === "number" && (typeof c.min === "number" || typeof c.max === "number");

// The same test engine/autoFill.ts uses to find the column a remark goes in.
const isRemarkColumn = (c: LogColumn): boolean => c.type === "text" && (/^remarks?(?:_|$)/i.test(c.key) || /^remarks?$/i.test(c.label.trim()));

/** "Viscosity (20.0 ± 1.0 Sec.)" → "viscosity". */
const readingName = (label: string): string => (label.replace(/\s*\(.*\)\s*$/, "").trim() || label).toLowerCase();

interface ReadingPoint {
  x: string;
  y: number;
  out: boolean;
  /** The remark on the same line, where the form has a remark column; null where it has none. */
  remark: string | null;
}

interface ReadingSeries {
  key: string;
  label: string;
  unit?: string;
  nominal?: number;
  min?: number;
  max?: number;
  points: ReadingPoint[];
  remarkForm: boolean;
  /** A series dense enough for a control-chart rule: one reading per time slot, at least 12 a day. */
  dense: boolean;
  // Worked out once per record and remembered with it, so a run over a year of
  // sheets only adds these up: the readings out of band, the longest run of
  // them, and the moving ranges between consecutive in-band readings (for σ).
  outPoints: ReadingPoint[];
  runs: { longest: number; startsAt: number; backAt: string | null };
  mrSum: number;
  mrN: number;
}

type SeriesBase = Omit<ReadingSeries, "outPoints" | "runs" | "mrSum" | "mrN">;

function summarised(base: SeriesBase): ReadingSeries {
  let mrSum = 0;
  let mrN = 0;
  for (let i = 1; i < base.points.length; i++) {
    const a = base.points[i - 1];
    const b = base.points[i];
    if (a.out || b.out) continue;
    mrSum += Math.abs(b.y - a.y);
    mrN += 1;
  }
  return { ...base, outPoints: base.points.filter((p) => p.out), runs: runsOf(base.points), mrSum, mrN };
}

function readingSeriesOf(record: RecordInstance, layout: LogSheetLayout | undefined): ReadingSeries[] {
  if (!layout) return [];
  const cols = layout.columns.filter(isReadingColumn);
  if (cols.length === 0) return [];
  const rows = rowsOf(record);
  const remarkCol = layout.columns.find(isRemarkColumn);
  const remarkOf = (row: LogSheetRow | undefined): string | null => (remarkCol ? text(row?.[remarkCol.key]) : null);
  const mode = layout.rowMode;
  const first = cols[0];
  const sameBand = cols.every((c) => c.nominal === first.nominal && c.min === first.min && c.max === first.max && c.unit === first.unit);

  // F-QC-40.C prints one line a day with six timed readings ACROSS it, all with
  // the one band: that line is the day's series, read left to right.
  if (mode.kind === "single" && cols.length >= 2 && sameBand) {
    const row = rows[0];
    const points: ReadingPoint[] = [];
    for (const c of cols) {
      const y = row?.[c.key];
      if (typeof y !== "number" || !Number.isFinite(y)) continue;
      points.push({ x: c.label.match(/\d{1,2}:\d{2}\s*(?:am|pm)?/i)?.[0] ?? c.label, y, out: isOutOfBand(c, y), remark: remarkOf(row) });
    }
    return [
      summarised({
        key: "readings",
        label: first.unit === "°C" ? "temperature" : "reading",
        unit: first.unit,
        nominal: first.nominal,
        min: first.min,
        max: first.max,
        points,
        remarkForm: !!remarkCol,
        dense: false,
      }),
    ];
  }

  // Everything else reads DOWN the sheet: an hour per line (F-QC-30), a batch
  // per line (F-QC-32).
  const slotKey = mode.kind === "timeSlots" ? mode.slotKey : "time";
  return cols.map((c) => {
    const points: ReadingPoint[] = [];
    rows.forEach((row, i) => {
      const y = row[c.key];
      if (typeof y !== "number" || !Number.isFinite(y)) return;
      points.push({ x: text(row[slotKey]) || `line ${i + 1}`, y, out: isOutOfBand(c, y), remark: remarkOf(row) });
    });
    return summarised({
      key: c.key,
      label: readingName(c.label),
      unit: c.unit,
      nominal: c.nominal,
      min: c.min,
      max: c.max,
      points,
      remarkForm: !!remarkCol,
      dense: mode.kind === "timeSlots" && points.length >= 12,
    });
  });
}

const bandText = (s: { min?: number; max?: number; unit?: string }): string => {
  const unit = s.unit ? ` ${s.unit}` : "";
  if (s.min !== undefined && s.max !== undefined) return `${s.min}–${s.max}${unit}`;
  return s.max !== undefined ? `at most ${s.max}${unit}` : `at least ${s.min}${unit}`;
};

/** The longest run of consecutive out-of-band points, where it starts, and the first in-band point after it. */
function runsOf(points: ReadingPoint[]): { longest: number; startsAt: number; backAt: string | null } {
  let longest = 0;
  let startsAt = -1;
  let run = 0;
  points.forEach((p, i) => {
    run = p.out ? run + 1 : 0;
    if (run > longest) {
      longest = run;
      startsAt = i - run + 1;
    }
  });
  const after = startsAt >= 0 ? points.slice(startsAt + longest).find((p) => !p.out) : undefined;
  return { longest, startsAt, backAt: after ? after.x : null };
}

// σ for the early-warning rule. Estimated from the plant's own IN-BAND readings
// on this computer — the average moving range between consecutive in-band
// readings of a sheet, divided by d2 = 1.128, the textbook I-chart estimate,
// which a single shifted day barely moves. With fewer than 30 moving ranges to
// go on there is too little history, and the rule falls back to the figure
// checked for F-QC-30 against a full year of hourly readings (σ of the moving
// range 0.311, model 0.30 Sec.) or, for any other series, a third of the
// half-band — a process that just fits its band.
const KNOWN_SIGMA: Record<string, number> = { "qc-viscosity|viscosity": 0.3 };

function sigmaFor(documentId: string, series: ReadingSeries, sheets: ReadingSeries[]): { sigma: number; from: string } | null {
  let sum = 0;
  let n = 0;
  for (const s of sheets) {
    sum += s.mrSum;
    n += s.mrN;
  }
  if (n >= 30 && sum > 0) return { sigma: sum / n / 1.128, from: `estimated from ${plural(n, "pair")} of consecutive in-band readings on this computer` };
  const known = KNOWN_SIGMA[`${documentId}|${series.key}`];
  if (known) return { sigma: known, from: "the figure checked for this reading over a year of hourly readings (too little history here to estimate it)" };
  if (series.min !== undefined && series.max !== undefined && series.nominal !== undefined) {
    return { sigma: (series.max - series.min) / 6, from: "a third of the half-band (too little history here to estimate it)" };
  }
  return null;
}

/**
 * Western Electric rule 2: two of three consecutive readings more than 2σ from
 * the nominal on the SAME side. Returns the index of every reading that
 * completes such a pattern, and the side most of them were on.
 */
function we2Hits(points: ReadingPoint[], nominal: number, sigma: number): { hits: number[]; side: 1 | -1 } {
  const z = points.map((p) => (p.y - nominal) / sigma);
  const hits: number[] = [];
  let up = 0;
  let down = 0;
  for (let i = 1; i < z.length; i++) {
    const from = Math.max(0, i - 2);
    if (z[i] > 2) {
      let k = 0;
      for (let j = from; j <= i; j++) if (z[j] > 2) k += 1;
      if (k >= 2) {
        hits.push(i);
        up += 1;
      }
    } else if (z[i] < -2) {
      let k = 0;
      for (let j = from; j <= i; j++) if (z[j] < -2) k += 1;
      if (k >= 2) {
        hits.push(i);
        down += 1;
      }
    }
  }
  return { hits, side: up >= down ? 1 : -1 };
}

const chartOf = (ctx: RuleContext, documentId: string, record: RecordInstance, s: ReadingSeries, sigma?: number): InsightChart | undefined =>
  s.points.length >= 3
    ? {
        title: `${ctx.formatNo(documentId)} ${s.label}, ${fmt(record.dueDate)}`,
        unit: s.unit,
        nominal: s.nominal,
        min: s.min,
        max: s.max,
        ...(sigma ? { sigma } : {}),
        points: s.points.map((p) => ({ x: p.x, y: p.y })),
      }
    : undefined;

const readingsText = (points: ReadingPoint[], unit?: string, max = 6): string => {
  const shown = points.slice(0, max).map((p) => `${num(p.y)}${unit ? ` ${unit}` : ""} at ${p.x}`);
  const more = points.length > max ? ` and ${points.length - max} more` : "";
  return `${shown.join(", ")}${more}`;
};

const readingRule: InsightRule = (ctx) => {
  const out: Insight[] = [];
  const today = ctx.today;
  const lookbackFrom = shiftDays(today, -DAY_LOOKBACK);
  // Sheets a CAPA finding already names: their excursions have an action.
  const linked = new Set<string>();
  for (const { finding } of capaFindings(ctx)) for (const id of finding.sourceRecordIds ?? []) linked.add(id);

  for (const documentId of ctx.documentIds()) {
    const records = ctx.records(documentId);
    if (records.length === 0) continue;
    // Only a document that has a reading column, on its current layout or on
    // the revision one of its records was filled on.
    const hasReadings = records.some((r, i) => (i === records.length - 1 || r.formatRevision) && ctx.layout(r)?.columns.some(isReadingColumn));
    if (!hasReadings) continue;
    const fno = ctx.formatNo(documentId);
    const sheets = records.map((record) => ({ record, series: readingsMemo(ctx, record) }));
    if (!sheets.some((s) => s.series.length > 0)) continue;

    // Every series key this document has, with every sheet's version of it.
    const byKey = new Map<string, { record: RecordInstance; s: ReadingSeries }[]>();
    for (const { record, series } of sheets) {
      for (const s of series) {
        let list = byKey.get(s.key);
        if (!list) byKey.set(s.key, (list = []));
        list.push({ record, s });
      }
    }

    // A4 is per document, across its series.
    const a4: { record: RecordInstance; count: number; sample: string }[] = [];
    const a4Seen = new Map<string, { record: RecordInstance; count: number; sample: string }>();
    let remarkForm = false;

    for (const [key, list] of byKey) {
      const latest = list[list.length - 1].s;
      remarkForm = remarkForm || latest.remarkForm;
      // σ is read from the DENSE sheets — one reading per time slot, 12 or more
      // a day, the only ones whose consecutive readings are an hour apart —
      // with the band of the newest of them, and A2 then asks it of each dense
      // sheet in turn. Asked only when the NEWEST sheet was dense, one short
      // sheet written today (the shift half done, or a machine stopped at noon)
      // switched the early warning off for every day before it.
      const denseSheets = list.filter((l) => l.s.dense && l.s.nominal !== undefined).map((l) => l.s);
      const sigmaInfo = denseSheets.length > 0 ? sigmaFor(documentId, denseSheets[denseSheets.length - 1], denseSheets) : null;

      let totalPoints = 0;
      let totalOut = 0;
      let longestEver = 0;
      let longestOn = "";
      const outDays: { record: RecordInstance; count: number }[] = [];

      for (const { record, s } of list) {
        const outPoints = s.outPoints;
        totalPoints += s.points.length;
        totalOut += outPoints.length;
        const runs = s.runs;
        if (outPoints.length > 0) outDays.push({ record, count: outPoints.length });
        if (runs.longest > longestEver) {
          longestEver = runs.longest;
          longestOn = record.dueDate;
        }

        // ---- A4: verified with nothing explaining the reading ----
        if (record.status === "Verified" && within(record.dueDate, today, EVENT_WINDOW) && !linked.has(record.id)) {
          const unexplained = outPoints.filter((p) => p.remark === null || p.remark === "");
          if (unexplained.length > 0) {
            const prev = a4Seen.get(record.id);
            const sample = `${s.label} ${readingsText(unexplained, s.unit, 2)}`;
            if (prev) prev.count += unexplained.length;
            else {
              const entry = { record, count: unexplained.length, sample };
              a4Seen.set(record.id, entry);
              a4.push(entry);
            }
          }
        }

        if (record.dueDate < lookbackFrom || record.dueDate > today || !isISO(record.dueDate)) continue;
        if (outPoints.length === 0 && !s.dense) continue;
        const date = fmt(record.dueDate);

        // ---- A1: this sheet's readings outside the band ----
        if (outPoints.length > 0) {
          // HIGH: three or more readings out in a row, or four or more in the
          // day — hours of product made outside the printed band, not a single
          // reading that came straight back. MEDIUM: two. LOW: one reading
          // that was back in band at the next check.
          const severity: InsightSeverity = runs.longest >= 3 || outPoints.length >= 4 ? "high" : outPoints.length >= 2 ? "medium" : "low";
          const window = outPoints.length > 1 ? ` (${outPoints[0].x}–${outPoints[outPoints.length - 1].x})` : ` (${outPoints[0].x})`;
          const unexplained = outPoints.filter((p) => p.remark === "").length;
          const remarkLine = !s.remarkForm
            ? " The form has no remark column, so the sheet itself cannot say what was done."
            : unexplained === 0
              ? " Each has a remark on the sheet."
              : unexplained === outPoints.length
                ? " None of them has a remark."
                : ` ${unexplained} of them have no remark.`;
          const runLine =
            runs.longest >= 2
              ? ` The longest run was ${runs.longest} readings in a row${runs.backAt ? `, back in band at ${runs.backAt}` : ", and the sheet ends out of band"}.`
              : runs.backAt
                ? ` It was back in band at ${runs.backAt}.`
                : "";
          const capa: SuggestedCapa | undefined =
            severity === "high"
              ? {
                  finding: `${fno} ${s.label} outside its printed band (${bandText(s)}) for ${plural(outPoints.length, "reading")} on ${date}${window}.`,
                  comment: `Readings: ${readingsText(outPoints, s.unit, 8)}. Longest run ${runs.longest} in a row. Record: ${fno} of ${date} (${record.status}).`,
                  action: `Find why the ${s.label} left its band on ${date}, check what was produced in that window, and record the correction and its effect on the sheet.`,
                }
              : undefined;
          out.push(
            insight(ctx, documentId, {
              id: `a1|${documentId}|${key}|${record.dueDate}`,
              rule: "A1",
              severity,
              title: `${fno}: ${plural(outPoints.length, `${s.label} reading`)} outside ${bandText(s)} on ${date}${window}`,
              detail:
                `${readingsText(outPoints, s.unit)} — outside the band the form prints${s.nominal !== undefined ? ` (nominal ${s.nominal})` : ""}.` +
                runLine +
                remarkLine +
                ` Whatever was made in that window was made outside the printed band: check it, and what was done to bring the reading back.`,
              evidence: [ev(record, key, readingsText(outPoints, s.unit, 3))],
              route: ctx.recordRoute(record),
              metric: { label: "Out of band", value: `${outPoints.length} of ${s.points.length}` },
              ...(capa ? { suggestedCapa: capa } : {}),
              chart: chartOf(ctx, documentId, record, s, sigmaInfo?.sigma),
            })
          );
        }

        // ---- A2: shifted before it left the band (WE rule 2) ----
        if (s.dense && sigmaInfo && s.nominal !== undefined) {
          const { hits, side } = we2Hits(s.points, s.nominal, sigmaInfo.sigma);
          const firstOut = s.points.findIndex((p) => p.out);
          // Two or more signals in a day: on the year of hourly readings it was
          // checked on, asking for two cut the false-alarm days from 13 to 8 of
          // 174 quiet days and still caught 49 of the 50 real shifts. Reported
          // only where the warning came FIRST — once a reading is out of band,
          // A1 has already said so.
          if (hits.length >= 2 && (firstOut === -1 || hits[0] < firstOut)) {
            const at = s.points[hits[0]].x;
            const direction = side === 1 ? "high" : "low";
            const ahead =
              firstOut === -1
                ? "every reading stayed inside the band"
                : `${plural(firstOut - hits[0], "reading")} before the first out-of-band reading at ${s.points[firstOut].x}`;
            // MEDIUM while it is still the current few days — the whole value of
            // an early warning is acting on it; LOW once it is history.
            const severity: InsightSeverity = daysBetween(record.dueDate, today) <= 3 ? "medium" : "low";
            const twoSigma = 2 * sigmaInfo.sigma;
            out.push(
              insight(ctx, documentId, {
                id: `a2|${documentId}|${key}|${record.dueDate}`,
                rule: "A2",
                severity,
                title: `${fno}: ${s.label} shifting ${direction} on ${date} — early warning at ${at}, ${ahead}`,
                detail:
                  `From ${at}, two of three consecutive readings sat more than 2σ (${num(twoSigma)}${s.unit ? ` ${s.unit}` : ""}) ${direction === "high" ? "above" : "below"} the nominal ${s.nominal}, ${times(hits.length)} that day — the control-chart signal that the process itself has moved, before any reading is out of the ${bandText(s)} band. ` +
                  `σ ≈ ${num(sigmaInfo.sigma, 3)}${s.unit ? ` ${s.unit}` : ""}, ${sigmaInfo.from}. ` +
                  `When this shows on the current day, check the mix before the next reading rather than after one goes out.`,
                evidence: [ev(record, key, readingsText(hits.map((i) => s.points[i]), s.unit, 4))],
                route: ctx.recordRoute(record),
                metric: { label: "Signals that day", value: String(hits.length) },
                chart: chartOf(ctx, documentId, record, s, sigmaInfo.sigma),
              })
            );
          }
        }
      }

      // ---- A1 roll-up over everything on this computer ----
      // Only once there is a pattern to see (three days or more); the recent
      // days are listed one by one above.
      if (outDays.length >= 3) {
        const byMonth = new Map<string, number>();
        for (const d of outDays) byMonth.set(d.record.dueDate.slice(0, 7), (byMonth.get(d.record.dueDate.slice(0, 7)) ?? 0) + 1);
        const months = [...byMonth].sort(([a], [b]) => compareISO(a, b)).map(([m, n]) => `${monthLabel(m)} ${n}`);
        const first = outDays[0].record.dueDate;
        const last = outDays[outDays.length - 1].record.dueDate;
        const pct = totalPoints > 0 ? (totalOut / totalPoints) * 100 : 0;
        out.push(
          insight(ctx, documentId, {
            id: `a1|${documentId}|${key}|all`,
            rule: "A1",
            severity: "low",
            title: `${fno}: ${grouped(totalOut)} of ${grouped(totalPoints)} ${latest.label} readings outside ${bandText(latest)} on ${plural(outDays.length, "day")} (${fmt(first)} to ${fmt(last)})`,
            detail:
              `Days with a reading out of band, by month: ${months.join(", ")}. The longest run was ${plural(longestEver, "reading")} in a row, on ${fmt(longestOn)}. ` +
              `This is the whole history on this computer; the last ${DAY_LOOKBACK} days are listed one by one. A month with more days than the others is where to look for a common cause.`,
            evidence: outDays.map((d) => ev(d.record, key, `${d.count} out of band`)),
            route: ctx.documentRoute(documentId),
            metric: { label: "Out of band", value: `${num(pct, 1)}% of readings` },
          })
        );
      }
    }

    // ---- A4 ----
    if (a4.length > 0) {
      const total = a4.reduce((n, a) => n + a.count, 0);
      out.push(
        insight(ctx, documentId, {
          id: `a4|${documentId}`,
          rule: "A4",
          // MEDIUM: the product decision was made days ago; what is missing is
          // the control — verification is the check meant to ask why a reading
          // left its band, and an auditor reads a signed sheet with an
          // unexplained excursion as that check not working.
          severity: "medium",
          title: `${fno}: ${plural(a4.length, "verified sheet")} in the last ${EVENT_WINDOW} days carry out-of-band readings that nothing explains`,
          // "No CAPA finding names the sheet" only to someone who can see the
          // internal CAPA report (REQUIREMENTS §40): to anyone else the reports
          // are not handed in at all, so a finding may well name it — they
          // are told nothing about CAPA either way.
          detail:
            `${plural(total, "reading")} outside the printed band ${total === 1 ? "was" : "were"} verified with ${remarkForm ? "the Remark column left blank" : "no remark (the form prints no remark column)"}${ctx.visible("gap-inspection") ? ", and no CAPA finding names the sheet" : ""}. ` +
            `Before verifying, the verifier should see an explanation for every highlighted reading: a remark, or a CAPA for a real excursion.` +
            (remarkForm ? "" : " Because this form cannot hold one, consider adding a Remark column in the format's next revision."),
          evidence: a4.map((a) => ev(a.record, undefined, a.sample)),
          route: ctx.documentRoute(documentId),
          metric: { label: "Verified sheets", value: String(a4.length) },
          suggestedCapa: {
            finding: `Out-of-band readings on ${fno} verified without a recorded explanation: ${plural(a4.length, "sheet")} in ${EVENT_WINDOW} days.`,
            comment: `Sheets: ${a4
              .slice(-8)
              .map((a) => `${fmt(a.record.dueDate)} (${a.sample})`)
              .join("; ")}.`,
            action: `Verifier to confirm every highlighted reading has a remark or a CAPA before verifying${remarkForm ? "" : "; consider adding a Remark column to the format"}.`,
          },
        })
      );
    }
  }
  return out;
};

// ===========================================================================
// B1 — THE SAME LOT DEVIATION AGAIN AND AGAIN
// ===========================================================================

// The three inspection records whose footer gives a lot's status and the reason
// it was not simply accepted (F/QC/37, /35, /34).
const INSPECTION_DOCS = ["qc-inspection-pouching", "qc-inspection-slitting", "qc-inspection-printed-film"];

const lotDeviationRule: InsightRule = (ctx) => {
  const out: Insight[] = [];
  for (const documentId of INSPECTION_DOCS) {
    const fno = ctx.formatNo(documentId);
    const groups = new Map<string, { reason: string; lots: { record: RecordInstance; status: string; reason: string }[] }>();
    for (const record of ctx.records(documentId)) {
      if (!within(record.dueDate, ctx.today, EVENT_WINDOW)) continue;
      const h = headerOf(record);
      const reason = text(h.deviationReason);
      if (!reason || isPlaceholder(reason)) continue;
      const key = normText(reason);
      if (!key) continue;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { reason, lots: [] }));
      g.lots.push({ record, status: text(h.lotStatus) || "status not written", reason });
    }
    for (const [key, g] of groups) {
      if (g.lots.length < 3) continue;
      const statuses = new Map<string, number>();
      for (const l of g.lots) statuses.set(l.status, (statuses.get(l.status) ?? 0) + 1);
      const statusLine = [...statuses].map(([s, n]) => `${n} ${s}`).join(", ");
      // HIGH when product was scrapped for it, or it came back six times or
      // more — the correction on each lot is plainly not removing the cause.
      // MEDIUM otherwise: three lots in a quarter is a pattern, not chance.
      const severity: InsightSeverity = g.lots.some((l) => /reject|scrap/i.test(l.status)) || g.lots.length >= 6 ? "high" : "medium";
      const first = g.lots[0].record.dueDate;
      const last = g.lots[g.lots.length - 1].record.dueDate;
      out.push(
        insight(ctx, documentId, {
          id: `b1|${documentId}|${key}`,
          rule: "B1",
          severity,
          title: `${fno}: ${quote(g.reason, 70)} on ${plural(g.lots.length, "lot")} in ${EVENT_WINDOW} days`,
          detail:
            `The same reason for deviation was written on ${plural(g.lots.length, "lot")} between ${fmt(first)} and ${fmt(last)} (${statusLine}). ` +
            `Each lot was dealt with on its own; the same cause coming back means it was corrected lot by lot but never removed. A CAPA with a root cause is what stops it.`,
          evidence: g.lots.map((l) => ev(l.record, "deviationReason", `${l.status}: ${clip(l.reason, 60)}`)),
          route: ctx.documentRoute(documentId),
          metric: { label: "Lots", value: String(g.lots.length) },
          suggestedCapa: {
            finding: `Recurring lot deviation on ${fno}: "${clip(g.reason, 120)}" — ${plural(g.lots.length, "lot")} in ${EVENT_WINDOW} days.`,
            comment: `Lots: ${g.lots
              .slice(-10)
              .map((l) => `${fmt(l.record.dueDate)} ${text(headerOf(l.record).poNumber) ? `PO ${text(headerOf(l.record).poNumber)} ` : ""}(${l.status})`)
              .join("; ")}.`,
            action: "Find the root cause of the repeated deviation (machine setting, material or method), correct it, and check the next lots to confirm it has stopped.",
          },
        })
      );
    }
  }
  return out;
};

// ===========================================================================
// B2 / B3 — REGISTER FINDINGS THAT COME BACK, AND CAPA THAT DID NOT HOLD
// ===========================================================================

const DAILY_PEST_ID = "daily-pest-monitoring";

// A rodent caught is the register working, not a failure to correct — the
// monthly CAPA leaves it out for the same reason (data/demoGenerator.ts).
const isRoutineCatch = (actionTaken: string): boolean => /rodent (trapped|removed)/i.test(actionTaken);

interface Observation {
  record: RecordInstance;
  date: string;
  description: string;
}

function registerObservations(ctx: RuleContext): Observation[] {
  const out: Observation[] = [];
  for (const record of ctx.records(DAILY_PEST_ID)) {
    const data = record.data as DailyPestMonitoringData | undefined;
    for (const act of data?.summaryActions ?? []) {
      const description = text(act.descriptionOfObservation);
      if (!description || isRoutineCatch(text(act.actionTaken))) continue;
      out.push({ record, date: isISO(act.dateOfObservation) ? act.dateOfObservation : record.dueDate, description });
    }
  }
  return out;
}

const capaRecurrenceRule: InsightRule = (ctx) => {
  const out: Insight[] = [];
  const observations = registerObservations(ctx);
  const obsByText = new Map<string, Observation[]>();
  for (const o of observations) {
    const k = normText(o.description);
    if (!k) continue;
    let list = obsByText.get(k);
    if (!list) obsByText.set(k, (list = []));
    list.push(o);
  }
  for (const list of obsByText.values()) list.sort((a, b) => compareISO(a.date, b.date));

  const findings = ctx.visible("gap-inspection") ? capaFindings(ctx) : [];
  const findingsByText = new Map<string, typeof findings>();
  // A finding raised from a B2 insight is worded as the insight worded it, not
  // as the register did; its insightKey still names the register's finding, so
  // once it is closed a recurrence on the register is caught by B3 all the same.
  const fromB2 = `b2|${DAILY_PEST_ID}|`;
  for (const f of findings) {
    const keys = new Set<string>();
    const k = normText(f.finding.findingOfInspection);
    if (k) keys.add(k);
    if (f.finding.insightKey?.startsWith(fromB2)) keys.add(f.finding.insightKey.slice(fromB2.length));
    for (const key of keys) {
      let list = findingsByText.get(key);
      if (!list) findingsByText.set(key, (list = []));
      list.push(f);
    }
  }

  // ---- B3: closed, then seen again ----
  const ineffective = new Set<string>();
  for (const [k, list] of findingsByText) {
    const closures = list
      .filter((f) => isISO(f.finding.actualDateOfAction))
      .map((f) => ({ ...f, closedOn: f.finding.actualDateOfAction as string }))
      .sort((a, b) => compareISO(a.closedOn, b.closedOn));
    if (closures.length === 0) continue;
    // Seen again: on a LATER CAPA report (never the finding's own report, which
    // is dated at the month's end and so after a mid-month closure), or on the
    // daily register after the day the action was taken.
    const later = [
      ...list.map((f) => ({ date: inspectionDateOf(f.record), record: f.record as RecordInstance, where: "CAPA report" })),
      ...(obsByText.get(k) ?? []).map((o) => ({ date: o.date, record: o.record, where: ctx.formatNo(DAILY_PEST_ID) })),
    ].sort((a, b) => compareISO(a.date, b.date));
    const recurrences: { closedOn: string; closedRecord: RecordInstance; seenOn: string; seenRecord: RecordInstance; where: string }[] = [];
    closures.forEach((c, i) => {
      const nextClosure = closures[i + 1]?.closedOn;
      const back = later.find((l) => l.record.id !== c.record.id && l.date > c.closedOn && (!nextClosure || l.date <= nextClosure));
      if (back) recurrences.push({ closedOn: c.closedOn, closedRecord: c.record, seenOn: back.date, seenRecord: back.record, where: back.where });
    });
    if (recurrences.length === 0) continue;
    const latest = recurrences[recurrences.length - 1];
    // A recurrence more than a year old, never seen since, is a correction
    // that eventually held.
    if (daysBetween(latest.seenOn, ctx.today) > 365) continue;
    ineffective.add(k);
    const description = obsByText.get(k)?.[0]?.description ?? list[list.length - 1].finding.findingOfInspection;
    const history = recurrences.map((r) => `closed ${fmt(r.closedOn)}, seen again ${fmt(r.seenOn)} (${r.where})`);
    out.push(
      insight(ctx, "gap-inspection", {
        id: `b3|${k}`,
        rule: "B3",
        // HIGH: a corrective action that was closed and did not hold is the
        // CAPA system failing at its one job, and the first thing an auditor
        // looks for in a CAPA log.
        severity: "high",
        title: `CAPA not effective: ${quote(description, 70)} came back after being closed${recurrences.length > 1 ? `, ${times(recurrences.length)}` : ""}`,
        detail:
          `${history.join("; ")}. ` +
          `Closing it removed the symptom, not the cause. Re-open it with a root-cause analysis, and verify that the action holds for a set period before closing it again.`,
        evidence: recurrences.flatMap((r) => [ev(r.closedRecord, "actualDateOfAction", `closed ${fmt(r.closedOn)}`), ev(r.seenRecord, undefined, `seen again ${fmt(r.seenOn)}`)]),
        route: ctx.recordRoute(latest.closedRecord),
        metric: { label: "Came back", value: times(recurrences.length) },
        suggestedCapa: {
          finding: `CAPA not effective: "${clip(description, 120)}" was seen again after being closed (${times(recurrences.length)}).`,
          comment: `${history.join("; ")}.`,
          action: "Re-open with a root-cause analysis; the earlier action removed the symptom but not the cause. Verify effectiveness over an agreed period before closing again.",
        },
      })
    );
  }

  // ---- B2: the register writes the same finding again and again ----
  if (ctx.visible(DAILY_PEST_ID)) {
    const fno = ctx.formatNo(DAILY_PEST_ID);
    for (const [k, list] of obsByText) {
      if (ineffective.has(k)) continue; // B3 has said the stronger thing
      const recent = list.filter((o) => within(o.date, ctx.today, EVENT_WINDOW));
      if (recent.length < 3) continue;
      const open = (findingsByText.get(k) ?? []).find((f) => f.finding.status === "Open" || f.finding.status === "Overdue");
      const description = recent[recent.length - 1].description;
      const dates = recent.map((o) => fmt(o.date));
      out.push(
        insight(ctx, DAILY_PEST_ID, {
          id: `b2|${DAILY_PEST_ID}|${k}`,
          rule: "B2",
          // HIGH at six or more in a quarter (weekly or more often), MEDIUM at
          // three: seen that often, it is a standing condition, not a slip.
          severity: recent.length >= 6 ? "high" : "medium",
          title: `${fno}: ${quote(description, 70)} written ${times(recent.length)} in ${EVENT_WINDOW} days`,
          // As A4: whether there is a corrective action for it yet is said
          // only to someone who can see the internal CAPA report (REQUIREMENTS
          // §40). To anyone else the reports are not handed in, so "it needs a
          // corrective action" could be telling them to raise one that exists.
          detail:
            `Observed on ${dates.slice(-6).join(", ")}${dates.length > 6 ? ` and ${dates.length - 6} earlier` : ""}. ` +
            (open
              ? `It is already an open CAPA finding (the report of ${fmt(inspectionDateOf(open.record))}, target ${open.finding.targetDate ? fmt(open.finding.targetDate) : "not set"}); the register shows it has not been put right yet.`
              : ctx.visible("gap-inspection")
                ? `Each day it was noted and handled on the spot; written this often, it needs a corrective action that removes the cause.`
                : `Each day it was noted and handled on the spot; written this often, it is a standing condition whose cause has to be found and removed.`),
          evidence: [...recent.map((o) => ev(o.record, "summaryActions", clip(o.description, 60))), ...(open ? [ev(open.record, "findings", clip(open.finding.findingOfInspection, 60))] : [])],
          route: ctx.documentRoute(DAILY_PEST_ID),
          metric: { label: `In ${EVENT_WINDOW} days`, value: times(recent.length) },
          ...(open
            ? {}
            : {
                suggestedCapa: {
                  finding: `Recurring finding on the Daily Pest Control Monitoring Record (${fno}): "${clip(description, 120)}" — ${times(recent.length)} in ${EVENT_WINDOW} days.`,
                  comment: `Observed on ${dates.join(", ")}.`,
                  action: "Find why the condition keeps returning, correct it at the source, and check the register for the following weeks.",
                },
              }),
        })
      );
    }
  }
  return out;
};

// ===========================================================================
// B4 — CAPA FINDINGS PAST THEIR TARGET DATE
// ===========================================================================

// Worked out here from the findings as they are. refreshGapFindingStatuses
// (data/selectors.ts) would say the same, but it WRITES records, and an
// insight must only read.
const overdueCapaRule: InsightRule = (ctx) => {
  if (!ctx.visible("gap-inspection")) return [];
  const out: Insight[] = [];
  const byRecord = new Map<string, { record: RecordInstance<GapInspectionData>; late: { finding: GapFinding; days: number }[] }>();
  for (const { record, finding } of capaFindings(ctx)) {
    if (finding.status === "Closed" || finding.status === "Verified" || finding.actualDateOfAction) continue;
    if (!isISO(finding.targetDate) || finding.targetDate >= ctx.today) continue;
    let entry = byRecord.get(record.id);
    if (!entry) byRecord.set(record.id, (entry = { record, late: [] }));
    entry.late.push({ finding, days: daysBetween(finding.targetDate, ctx.today) });
  }
  for (const { record, late } of byRecord.values()) {
    late.sort((a, b) => b.days - a.days);
    const oldest = late[0].days;
    // HIGH past a month — well beyond the 15 days a finding is normally given;
    // MEDIUM past a week; LOW within the first week.
    const severity: InsightSeverity = oldest > 30 ? "high" : oldest > 7 ? "medium" : "low";
    const listed = late.slice(0, 3).map((l) => `${quote(l.finding.findingOfInspection, 60)} (target ${fmt(l.finding.targetDate as string)})`);
    out.push(
      insight(ctx, "gap-inspection", {
        id: `b4|${record.id}`,
        rule: "B4",
        severity,
        title: `${plural(late.length, "CAPA finding")} on the report of ${fmt(inspectionDateOf(record))} ${late.length === 1 ? "is" : "are"} past ${late.length === 1 ? "its" : "their"} target date — the oldest by ${plural(oldest, "day")}`,
        detail:
          `${listed.join("; ")}${late.length > 3 ? ` and ${late.length - 3} more` : ""}. ` +
          `An open finding past its target is an agreed action not taken. Record the action and its date, or agree a new target with a reason.`,
        evidence: late.map((l) => ev(record, `findings[${l.finding.sNo}]`, `${clip(l.finding.findingOfInspection, 60)} — ${l.days} days overdue`)),
        route: ctx.recordRoute(record),
        metric: { label: "Oldest", value: `${plural(oldest, "day")} overdue` },
      })
    );
  }
  return out;
};

// ===========================================================================
// B5 — PRINTING STOPPED TWICE OR MORE IN A MONTH (F/QC/13)
// ===========================================================================

const INPROCESS_PRINTING_ID = "qc-inprocess-printing";

/**
 * Did this sheet stop the press? F/QC/13's own grading rule, printed on the
 * form: any F grade — stop production; more than one C grade — stop printing;
 * more than three B grades — stop printing. Null when it did not.
 */
function printingStop(record: RecordInstance): { why: string; f: boolean; parameters: string[] } | null {
  const rows = rowsOf(record);
  const graded = (g: string) => rows.filter((r) => text(r.grade).toUpperCase() === g);
  const english = (r: LogSheetRow) => englishName(r.parameter);
  const f = graded("F");
  const c = graded("C");
  const b = graded("B");
  if (f.length > 0) return { why: `F grade (${f.map(english).join(", ")})`, f: true, parameters: f.map(english) };
  if (c.length > 1) return { why: `${c.length} C grades (${c.map(english).join(", ")})`, f: false, parameters: c.map(english) };
  if (b.length > 3) return { why: `${b.length} B grades`, f: false, parameters: b.map(english) };
  return null;
}

const printingStopRule: InsightRule = (ctx) => {
  const out: Insight[] = [];
  const fno = ctx.formatNo(INPROCESS_PRINTING_ID);
  const byMonth = new Map<string, { record: RecordInstance; stop: NonNullable<ReturnType<typeof printingStop>> }[]>();
  for (const record of ctx.records(INPROCESS_PRINTING_ID)) {
    if (!within(record.dueDate, ctx.today, 183)) continue;
    const stop = printingStopMemo(ctx, record);
    if (!stop) continue;
    const m = record.dueDate.slice(0, 7);
    let list = byMonth.get(m);
    if (!list) byMonth.set(m, (list = []));
    list.push({ record, stop });
  }
  for (const [month, stops] of byMonth) {
    if (stops.length < 2) continue;
    const params = new Map<string, number>();
    for (const s of stops) for (const p of s.stop.parameters) params.set(p, (params.get(p) ?? 0) + 1);
    const top = [...params].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, n]) => `${p} ${n}`);
    const machines = [...new Set(stops.map((s) => text(headerOf(s.record).machine)).filter(Boolean))];
    // HIGH when an F grade stopped production, or four stops or more in the
    // month; MEDIUM for two or three — each is a job halted and re-set.
    const severity: InsightSeverity = stops.some((s) => s.stop.f) || stops.length >= 4 ? "high" : "medium";
    out.push(
      insight(ctx, INPROCESS_PRINTING_ID, {
        id: `b5|${INPROCESS_PRINTING_ID}|${month}`,
        rule: "B5",
        severity,
        title: `${fno}: printing stopped ${times(stops.length)} in ${monthLabel(month)} by the form's grading rule`,
        detail:
          `${stops.map((s) => `${fmt(s.record.dueDate)} — ${s.stop.why}`).slice(0, 5).join("; ")}${stops.length > 5 ? ` and ${stops.length - 5} more` : ""}. ` +
          `Parameters graded down most: ${top.join(", ")}${machines.length ? `; machine${machines.length > 1 ? "s" : ""} ${machines.join(", ")}` : ""}. ` +
          `Each stop is a job halted and re-set; more than one in a month points to a cause shared between them.`,
        evidence: stops.map((s) => ev(s.record, "grade", s.stop.why)),
        route: ctx.documentRoute(INPROCESS_PRINTING_ID),
        metric: { label: "Stops", value: String(stops.length) },
        suggestedCapa: {
          finding: `Printing stopped ${times(stops.length)} in ${monthLabel(month)} on ${fno} (In Process Quality Control).`,
          comment: `${stops.map((s) => `${fmt(s.record.dueDate)}: ${s.stop.why}`).join("; ")}.`,
          action: `Look for the shared cause of these stops (most often ${top[0] ?? "the same parameter"}), correct it at the machine or in the method, and watch the next month's grades.`,
        },
      })
    );
  }
  return out;
};

// ===========================================================================
// C1 / C2 — A RECORD THAT CONTRADICTS ITSELF
// ===========================================================================

// Smarter compliance (REQUIREMENTS §75): two things the same person wrote on
// the same record that cannot both be true. Nothing is compared with a limit
// or a standard from outside the record — the words a test passes and fails
// with are the ones the form's own filled specimen uses (LogSheetLayout
// specimenRows), and a figure is compared only with the figure the record
// itself gives for the very parameter the reason names.
//
// Only records HANDED IN — submitted, awaiting verification, or verified. A
// draft is still being written (Lot Status starts at "Accepted", and the
// inspector may not have reached it when a test is written FAIL), and a record
// sent back is already with its writer to be put right. Recent ones only (the
// last EVENT_WINDOW days): these are about a lot, and a lot dispatched more
// than a quarter ago is past holding back.

const isHandedIn = (r: RecordInstance): boolean => r.status === "Submitted" || r.status === "Pending Verification" || r.status === "Verified";

// The words a pass/fail observation is written with — the same two lists
// engine/autoFill.ts fills the inspection formats from (PASS_WORDS,
// FAIL_WORDS), so what the pre-fill writes for a failed test is exactly what
// is read here as one. F/QC/13's Pass? is a Yes / No box instead: "Yes" is
// what it passes with.
const PASS_WORD = /^(?:pass|passed|ok|no ?leak)$/i;
const FAIL_WORD = /^(?:fail|failed|not ok|leak|leaking)$/i;

// "Pouch height 178 mm against 181 mm specified": the figure, its unit, then
// "against" (or "vs") the figure it should have been. Only that shape is read
// — "a variation of 0.3 mm on the repeat" states a spread, not a reading.
const STATED_FIGURE = /^\s*(?:[:=–-]\s*)?(?:(?:is|was|of|at|found)\s+)?(\d+(?:\.\d+)?)\s*(?:[a-zµ%]+\.?)?\s*(?:against|vs\.?|versus)\s+(\d+(?:\.\d+)?)/;

/** The printed name without its unit or note: "Pouch Height (mm)" → "Pouch Height". */
const printedName = (parameter: string): string => text(parameter).replace(/\s*\(.*$/, "") || text(parameter);

/** The figure a lot reason states for one printed parameter, and what it was measured against; null when it states none. */
function statedFigure(reason: string, parameter: string): { figure: string; against: string } | null {
  const name = printedName(parameter).toLowerCase().replace(/\s+/g, " ");
  if (name.length < 3) return null;
  const r = text(reason).toLowerCase().replace(/\s+/g, " ");
  for (let at = r.indexOf(name); at >= 0; at = r.indexOf(name, at + 1)) {
    if (at > 0 && /[a-z0-9]/.test(r[at - 1])) continue; // "size" inside "oversize"
    const m = r.slice(at + name.length).match(STATED_FIGURE);
    if (m) return { figure: m[1], against: m[2] };
  }
  return null;
}

/** Every figure written in an observation: "H-304 W-203.2" → 304, 203.2; the 1 of "L1 = 0.306 kg" is a name, not a figure. */
function figuresIn(observation: string): number[] {
  return Array.from(observation.matchAll(/(^|[^a-z\d.])(\d+(?:\.\d+)?)/gi), (m) => Number(m[2]));
}

interface FailedTest {
  parameter: string;
  observation: string;
  specification: string;
}

interface StatedMismatch {
  parameter: string;
  stated: string;
  against: string;
  observation: string;
}

interface SelfContradiction {
  lotStatus: string;
  reason: string;
  /** C1: pass/fail tests reading their failing word on a lot marked Accepted. */
  failedOnAccepted: FailedTest[];
  /** C2: figures the reason states that the named parameter's observation does not read. */
  stated: StatedMismatch[];
}

/** What one inspection record (F/QC/37, /35, /34) says against itself; null when nothing. */
function selfContradictions(record: RecordInstance, layout: LogSheetLayout | undefined): SelfContradiction | null {
  if (!layout || layout.rowMode.kind !== "fixedRows") return null;
  // The printed parameters, each with the word its filled specimen passes it
  // with — a line whose specimen reads a figure or a description ("181",
  // "Standy + Zipper") is not a pass/fail test.
  const params = layout.rowMode.rows.map((r, i) => {
    const own = text(layout.specimenRows?.[i]?.observation);
    return { parameter: text(r.parameter), passes: PASS_WORD.test(own) };
  });
  const byName = new Map(params.map((p, i) => [normText(p.parameter), i]));
  const rows = rowsOf(record);
  const lines = rows.map((row, i) => {
    const at = byName.get(normText(row.parameter)) ?? (rows.length === params.length ? i : -1);
    return { row, param: at >= 0 ? params[at] : undefined };
  });
  const h = headerOf(record);
  const lotStatus = text(h.lotStatus);
  const reason = text(h.deviationReason);

  const failedOnAccepted: FailedTest[] = [];
  if (isLotAccepted(lotStatus)) {
    for (const { row, param } of lines) {
      const observation = text(row.observation);
      if (param?.passes && FAIL_WORD.test(observation)) failedOnAccepted.push({ parameter: param.parameter, observation, specification: text(row.specification) });
    }
  }

  const stated: StatedMismatch[] = [];
  if (reason && !isPlaceholder(reason)) {
    for (const { row, param } of lines) {
      if (!param) continue;
      const s = statedFigure(reason, param.parameter);
      if (!s) continue;
      const observation = text(row.observation);
      const figures = figuresIn(observation);
      // Nothing written, or "-": a gap, not a second figure to disagree with.
      if (figures.length === 0 || figures.includes(Number(s.figure))) continue;
      stated.push({ parameter: param.parameter, stated: s.figure, against: s.against, observation });
    }
  }
  return failedOnAccepted.length > 0 || stated.length > 0 ? { lotStatus, reason, failedOnAccepted, stated } : null;
}

/** F/QC/13: the parameters graded F that are nonetheless marked Pass? — "Yes". */
function fGradesPassed(record: RecordInstance): { parameter: string; defects: string }[] {
  return rowsOf(record)
    .filter((r) => text(r.grade).toUpperCase() === "F" && /^y(?:es)?$/i.test(text(r.pass)))
    .map((r) => ({ parameter: englishName(r.parameter), defects: text(r.defectCount) }));
}

const statusWords = (r: RecordInstance): string =>
  r.status === "Verified" ? `verified${r.verifiedBy ? ` by ${r.verifiedBy}` : ""}` : r.status === "Pending Verification" ? "awaiting verification" : "submitted";

const consistencyRule: InsightRule = (ctx) => {
  const out: Insight[] = [];
  for (const documentId of INSPECTION_DOCS) {
    const fno = ctx.formatNo(documentId);
    for (const record of ctx.records(documentId)) {
      if (!isHandedIn(record) || !within(record.dueDate, ctx.today, EVENT_WINDOW)) continue;
      const found = selfContradictionMemo(ctx, record);
      if (!found) continue;
      const date = fmt(record.dueDate);
      const po = text(headerOf(record).poNumber);
      const lot = `${date}${po ? `, PO ${po}` : ""}`;

      // ---- C1: a lot Accepted while one of its tests reads failed ----
      if (found.failedOnAccepted.length > 0) {
        const tests = found.failedOnAccepted;
        const named = tests.map((t) => `${t.parameter} reads ${quote(t.observation, 30)}${t.specification ? ` (specification ${quote(t.specification, 40)})` : ""}`);
        out.push(
          insight(ctx, documentId, {
            id: `c1|${documentId}|${record.id}`,
            rule: "C1",
            // HIGH: the record releases the lot and fails it in the same
            // breath. If the test did fail, product that does not meet its
            // specification — a leaking food pouch, a bond that peels — has
            // gone on to the customer; the record alone cannot say which is
            // true, so somebody has to find out.
            severity: "high",
            title: `${fno}: lot accepted while its ${tests.map((t) => t.parameter).join(", ")} ${tests.length === 1 ? "reads" : "read"} ${tests.map((t) => quote(t.observation, 20)).join(", ")} (${lot})`,
            detail:
              `The ${fno} record of ${lot} gives Lot Status "Accepted", and ${named.join("; ")}. It was ${statusWords(record)} as it stands. ` +
              `A lot cannot both pass and fail the same test: either it was released with a failed test, or the observation was written wrongly. ` +
              `Check the lot — its retained samples, and where it went — then correct whichever of the two is wrong.`,
            evidence: tests.map((t) => ev(record, "observation", `${t.parameter}: ${clip(t.observation, 20)}; Lot Status Accepted`)),
            route: ctx.recordRoute(record),
            metric: { label: "Lot Status", value: "Accepted" },
            suggestedCapa: {
              finding: `Lot accepted on ${fno} of ${lot} while its ${tests.map((t) => `${t.parameter} reads "${clip(t.observation, 20)}"`).join(" and ")}.`,
              comment: `Lot Status "Accepted"; ${named.join("; ")}. Record ${statusWords(record)}.`,
              action:
                "Establish whether the lot was released with a failed test: check its retained samples and where it was dispatched, and hold or recall it if the test failed. Correct the record (Lot Status with its reason, or the observation), and have inspector and verifier confirm that no failed test is handed in beside an Accepted lot.",
            },
          })
        );
      }

      // ---- C2: the lot's reason states a figure its observation does not read ----
      if (found.stated.length > 0) {
        const s = found.stated;
        const named = s.map((m) => `${m.parameter}: the reason gives ${m.stated} against ${m.against}, the observation reads ${quote(m.observation, 30)}`);
        out.push(
          insight(ctx, documentId, {
            id: `c2|${documentId}|${record.id}`,
            rule: "C2",
            // MEDIUM: the lot's decision rests on a figure its own record does
            // not show. Nothing more is released by it than was decided, but a
            // complaint or an audit is answered from this record, and here it
            // cannot say what the lot measured — the figure written is wrong,
            // or the reason was carried over from another lot.
            severity: "medium",
            title: `${fno}: the lot's reason gives ${s.map((m) => `${printedName(m.parameter)} ${m.stated}`).join(", ")}, but the record reads ${s.map((m) => quote(m.observation, 20)).join(", ")} (${lot})`,
            detail:
              `The ${fno} record of ${lot} gives Lot Status "${found.lotStatus || "not written"}" for the reason ${quote(found.reason.replace(/[\s.]+$/, ""), 140)}. ${named.join("; ")}. ` +
              `The decision and the measurement written beside it disagree, so one of them is wrong. Correct the record so the lot's decision rests on what it shows.`,
            evidence: s.map((m) => ev(record, "deviationReason", `${m.parameter}: reason ${m.stated}, observation ${clip(m.observation, 20)}`)),
            route: ctx.recordRoute(record),
            metric: { label: "Reason / record", value: `${s[0].stated} / ${clip(s[0].observation, 12)}` },
          })
        );
      }
    }
  }

  // ---- C1 on F/QC/13: an F grade marked as passed ----
  const fno = ctx.formatNo(INPROCESS_PRINTING_ID);
  for (const record of ctx.records(INPROCESS_PRINTING_ID)) {
    if (!isHandedIn(record) || !within(record.dueDate, ctx.today, EVENT_WINDOW)) continue;
    const passed = fGradesPassedMemo(ctx, record);
    if (passed.length === 0) continue;
    const date = fmt(record.dueDate);
    const h = headerOf(record);
    const job = [text(h.poNumber) ? `PO ${text(h.poNumber)}` : "", text(h.machine)].filter(Boolean).join(", ");
    const names = passed.map((p) => p.parameter).join(", ");
    out.push(
      insight(ctx, INPROCESS_PRINTING_ID, {
        id: `c1|${INPROCESS_PRINTING_ID}|${record.id}`,
        rule: "C1",
        // HIGH, as for a lot: the form's own rule is that any F grade stops
        // production, so an F marked Pass? — Yes either let the job run on
        // past a fault the form stops it for, or holds a grade or an answer
        // written wrongly.
        severity: "high",
        title: `${fno}: ${names} graded F but marked Pass? — Yes (${date}${job ? `, ${job}` : ""})`,
        detail:
          `${fno}'s own grading rule, printed on the form: any F grade — stop production. The sheet of ${date}${job ? ` (${job})` : ""} grades ${names} F and answers Pass? "Yes" beside ${passed.length === 1 ? "it" : "them"}. It was ${statusWords(record)} as it stands. ` +
          `Either printing went on past an F grade, or the grade or the answer is wrong: check what was printed after this sample, and correct the sheet.`,
        evidence: passed.map((p) => ev(record, "grade", `${p.parameter}: F, Pass? Yes${p.defects && p.defects !== "-" ? `, defects ${clip(p.defects, 12)}` : ""}`)),
        route: ctx.recordRoute(record),
        metric: { label: "Graded F, passed", value: String(passed.length) },
        suggestedCapa: {
          finding: `${fno} of ${date}${job ? ` (${job})` : ""}: ${names} graded F but marked Pass? — Yes.`,
          comment: `The form's grading rule stops production on any F grade. Sheet ${statusWords(record)}.`,
          action:
            "Establish whether printing continued after the F grade: check the rolls printed after this sample and segregate them if the fault is on them. Correct the sheet, and remind QA that an F grade is never passed — production stops and the QA Manager decides.",
        },
      })
    );
  }
  return out;
};

// ===========================================================================
// C3 — CALIBRATION EXPIRED
// ===========================================================================

// Any log sheet whose header carries a Calibration Expiry box — F/QC/12 and
// F/QC/11 today. The CURRENT status is the device's latest sheet against today.
// An older sheet is never called "expired" against today: history is judged
// against the sheet's own date, and is only counted here (sheets filled with
// the device after its expiry).
const calibrationRule: InsightRule = (ctx) => {
  const out: Insight[] = [];
  for (const documentId of ctx.documentIds()) {
    const records = ctx.records(documentId);
    if (records.length === 0) continue;
    const layout = ctx.layout(records[records.length - 1]);
    if (!layout?.headerFields.some((f) => f.key === "calibrationExpiry")) continue;
    const fno = ctx.formatNo(documentId);
    const byDevice = new Map<string, RecordInstance[]>();
    for (const r of records) {
      const device = text(headerOf(r).deviceIdNo) || ctx.docName(documentId);
      let list = byDevice.get(device);
      if (!list) byDevice.set(device, (list = []));
      list.push(r);
    }
    for (const [device, list] of byDevice) {
      const latest = list[list.length - 1];
      const expiry = text(headerOf(latest).calibrationExpiry);
      if (!isISO(expiry)) continue;
      const usedAfter = list.filter((r) => r.dueDate > expiry).length;
      if (expiry < ctx.today) {
        const days = daysBetween(expiry, ctx.today);
        out.push(
          insight(ctx, documentId, {
            id: `c3|${documentId}|${device}`,
            rule: "C3",
            // HIGH: every weighing or measurement taken with an instrument out
            // of calibration is open to question, and so is every lot released
            // on it.
            severity: "high",
            title: `Device ${device} (${fno}): calibration expired on ${fmt(expiry)}, ${plural(days, "day")} ago`,
            detail:
              `The latest ${fno} sheet for ${device} (${fmt(latest.dueDate)}) gives Calibration Expiry ${fmt(expiry)}.` +
              (usedAfter > 0 ? ` ${plural(usedAfter, "sheet")} for this device ${usedAfter === 1 ? "is" : "are"} dated after that day.` : "") +
              ` Measurements taken with it since then are on an instrument out of calibration: have it calibrated (or take it out of use) and write the new expiry on its next sheet.`,
            evidence: [ev(latest, "calibrationExpiry", fmt(expiry))],
            route: ctx.recordRoute(latest),
            metric: { label: "Expired", value: `${plural(days, "day")} ago` },
          })
        );
      } else if (daysBetween(ctx.today, expiry) <= 30) {
        const days = daysBetween(ctx.today, expiry);
        out.push(
          insight(ctx, documentId, {
            id: `c3|${documentId}|${device}|soon`,
            rule: "C3",
            severity: "low",
            title: `Device ${device} (${fno}): calibration expires on ${fmt(expiry)}, in ${plural(days, "day")}`,
            detail: `The latest ${fno} sheet for ${device} (${fmt(latest.dueDate)}) gives Calibration Expiry ${fmt(expiry)}. Book the calibration now so the device is not used past it.`,
            evidence: [ev(latest, "calibrationExpiry", fmt(expiry))],
            route: ctx.recordRoute(latest),
            metric: { label: "Expires in", value: plural(days, "day") },
          })
        );
      }
    }
  }
  return out;
};

// ===========================================================================
// SUP — A SUPPLIER GRADED C ON F/PUR/05
// ===========================================================================

// The grade is worked out again from the three ratings the buyer wrote, by the
// form's own table (engine/purchaseRatings.ts), not read from the stored cell.
// F/PUR/06 prints no grade table, so no threshold is invented for it.
//
// ONLY A LINE WITH ALL THREE RATINGS WRITTEN IS GRADED. The form's arithmetic
// weighs a blank rating as 0, so a line the buyer has rated for product safety
// and not yet for quality and delivery works out to 50 at most — a C for a
// supplier nobody has finished rating. And the register is yearly, so the
// newest sheet is often this year's, still being filled while last year's
// holds the real grades. So:
//   * the suppliers are the ones on the register as it now stands — the
//     newest sheet handed in (a draft only when none has been), so a supplier
//     since replaced, the very action a C calls for, is not reported again;
//   * each is graded from ITS newest line with all three ratings written, on
//     a sheet handed in where there is one, else on a draft a person has
//     written on — which may be an earlier sheet than the newest.
const ratingWritten = (v: unknown): boolean => text(v) !== "" && Number.isFinite(Number(text(v)));
const fullyRated = (row: LogSheetRow): boolean => ratingWritten(row.productSafetyRating) && ratingWritten(row.qualityRating) && ratingWritten(row.deliveryRating);

/** One supplier on F/PUR/05 as the register now stands: its newest line with all three ratings written. */
export interface SupplierStanding {
  supplier: string;
  /** The supplier as compared (normText), for ids. */
  key: string;
  /** The sheet the grade was read from — the newest handed in, or an earlier one. */
  record: RecordInstance;
  row: LogSheetRow;
  cells: ReturnType<typeof supplierRatingCells>;
}

/**
 * EVERY SUPPLIER'S GRADE AS THE REGISTER NOW STANDS (the rule above), one place
 * for everything that reports a grade — the SUP insight, the Management
 * Summary's Purchase part and Mitra's evidence (REQUIREMENTS §75) — so the
 * three can never disagree about who is graded C. `records` are the human
 * F/PUR/05 records, oldest first. A supplier on the register with no line
 * fully rated yet is listed in `notRated`, never graded.
 */
export function supplierStandings(records: readonly RecordInstance[]): { register: RecordInstance | null; handedIn: boolean; graded: SupplierStanding[]; notRated: string[] } {
  if (records.length === 0) return { register: null, handedIn: false, graded: [], notRated: [] };
  const handedIn = records.filter((r) => r.status !== "In Progress");
  const register = (handedIn.length > 0 ? handedIn : records)[(handedIn.length > 0 ? handedIn : records).length - 1];
  // Each supplier's newest fully rated line — handed-in sheets first, drafts
  // only for a supplier no handed-in sheet has rated. Oldest first, so a later
  // line overwrites an earlier one.
  const ratedIn = new Map<string, { record: RecordInstance; row: LogSheetRow }>();
  const ratedInDraft = new Map<string, { record: RecordInstance; row: LogSheetRow }>();
  for (const record of records) {
    const into = record.status === "In Progress" ? ratedInDraft : ratedIn;
    for (const row of rowsOf(record)) {
      const k = normText(row.supplierName);
      if (k && fullyRated(row)) into.set(k, { record, row });
    }
  }
  const graded: SupplierStanding[] = [];
  const notRated: string[] = [];
  const done = new Set<string>();
  for (const listed of rowsOf(register)) {
    const k = normText(listed.supplierName);
    if (!k || done.has(k)) continue;
    done.add(k);
    const found = ratedIn.get(k) ?? ratedInDraft.get(k);
    if (!found) {
      notRated.push(text(listed.supplierName));
      continue;
    }
    graded.push({ supplier: text(found.row.supplierName), key: k, record: found.record, row: found.row, cells: supplierRatingCells(found.row) });
  }
  return { register, handedIn: handedIn.length > 0, graded, notRated };
}

const supplierRule: InsightRule = (ctx) => {
  const records = ctx.records(RM_PM_PERFORMANCE_ID);
  const standing = supplierStandings(records);
  const current = standing.register;
  if (!current) return [];
  const fno = ctx.formatNo(RM_PM_PERFORMANCE_ID);
  const out: Insight[] = [];
  for (const { record: latest, row, supplier, cells } of standing.graded) {
    if (cells.grade !== "C") continue;
    const overall = text(cells.overallRating);
    const action = actionForGrade("C");
    const lots = row.lotsReceived !== null && row.lotsReceived !== undefined && text(row.lotsReceived) !== "" ? ` Lots received ${text(row.lotsReceived)}, rejected / returned ${text(row.lotsRejected) || "0"}.` : "";
    // Which sheet the grade is from, when it is not simply the newest one.
    const from =
      latest.id !== current.id
        ? ` Graded from the ${fno} of ${fmt(latest.dueDate)}${latest.status === "In Progress" ? " (a draft, not yet handed in)" : ""}: ${standing.handedIn ? "the last sheet handed in" : "the newest sheet"}, of ${fmt(current.dueDate)}, does not have all three of ${supplier}'s ratings written.`
        : latest.status === "In Progress"
          ? ` The sheet is a draft, not yet handed in.`
          : "";
    out.push(
      insight(ctx, RM_PM_PERFORMANCE_ID, {
        id: `sup|${RM_PM_PERFORMANCE_ID}|${normText(supplier)}`,
        rule: "SUP",
        // MEDIUM: the form itself prescribes the action for a C; it is a
        // purchasing decision to make, not a hazard on the floor today.
        severity: "medium",
        title: `${supplier}: Grade C (${overall}) on ${fno} — the form's action is "${action}"`,
        detail:
          `Product safety ${text(row.productSafetyRating) || "—"}, quality ${text(row.qualityRating) || "—"}, delivery ${text(row.deliveryRating) || "—"}, weighted 50 / 40 / 10 to ${overall}.${lots}${from} ` +
          `${fno}'s Overall Rating table grades below 80 as C and prints "${action}" beside it: decide which, and record it.`,
        evidence: [ev(latest, "supplierName", `${supplier} — ${overall} (C)`)],
        route: ctx.recordRoute(latest),
        metric: { label: "Overall rating", value: overall },
        suggestedCapa: {
          finding: `Supplier ${supplier} graded C (${overall}) on ${fno}${text(row.period) ? ` for ${text(row.period)}` : ""}.`,
          comment: `Ratings: product safety ${text(row.productSafetyRating) || "—"}, quality ${text(row.qualityRating) || "—"}, delivery ${text(row.deliveryRating) || "—"}.${lots}`,
          action: `As ${fno} prints for grade C — ${action}: replace the supplier, or agree an improvement plan with them and review their next lots.`,
        },
      })
    );
  }
  return out;
};

// ===========================================================================
// MAINTENANCE (REQUIREMENTS §74)
// ===========================================================================

const LUX_ID = "mnt-lux-level";
const EQUIPMENT_LIST_ID = "mnt-equipment-list";
const BREAKDOWN_ID = "mnt-breakdown-record";
const GLASS_ID = "mnt-glass-breakage";
const DAILY_HEALTH_ID = "mnt-daily-health";
const YEARLY_PM_ID = "mnt-yearly-pm-schedule";

// ---- M1: lux, the two latest rounds compared area by area ----

/** Area names differ slightly between revisions of F/MNT/11: compared trimmed, spaces collapsed, case ignored. */
const areaKey = (name: unknown): string => text(name).replace(/\s+/g, " ").toLowerCase();

// Exported for the monthly management summary (engine/monthlySummary.ts), which
// counts a month's lux rounds with the very reading M1 compares.
export function luxReadings(record: RecordInstance): Map<string, { area: string; lux: number }> {
  const out = new Map<string, { area: string; lux: number }>();
  // A record pinned to the superseded Rev 00 has Day and Night columns; its
  // Day reading is the one that compares with Rev 01's single Lux Level.
  const column = record.formatRevision === "00" ? "luxDay" : "luxLevel";
  for (const row of rowsOf(record)) {
    const area = text(row.parameter);
    const raw = row[column] ?? (column === "luxLevel" ? row.luxDay : null);
    const lux = typeof raw === "number" ? raw : Number(text(raw));
    if (!area || text(raw) === "" || !Number.isFinite(lux) || lux <= 0) continue;
    out.set(areaKey(area), { area, lux });
  }
  return out;
}

const luxRule: InsightRule = (ctx) => {
  const rounds = ctx.records(LUX_ID).filter((r) => luxMemo(ctx, r).size > 0);
  if (rounds.length < 2) return [];
  const older = rounds[rounds.length - 2];
  const newer = rounds[rounds.length - 1];
  const a = luxMemo(ctx, older);
  const b = luxMemo(ctx, newer);
  const fno = ctx.formatNo(LUX_ID);
  const olderNote = older.formatRevision === "00" ? " (Day reading, on the superseded Rev 00)" : "";
  const changes: { area: string; before: number; after: number; pct: number }[] = [];
  for (const [k, now] of b) {
    const then = a.get(k);
    if (!then) continue;
    changes.push({ area: now.area, before: then.lux, after: now.lux, pct: ((now.lux - then.lux) / then.lux) * 100 });
  }
  if (changes.length === 0) return [];
  changes.sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct));
  const out: Insight[] = [];
  const span = `${fmt(older.dueDate)} and ${fmt(newer.dueDate)}`;
  const pctText = (p: number) => `${p > 0 ? "+" : "−"}${num(Math.abs(p), 0)}%`;

  for (const c of changes) {
    if (c.pct > -25) continue;
    const cabinet = /colou?r\s*matching/i.test(c.area);
    // No lux standard is printed on F/MNT/11, so none is assumed: the rule
    // compares the plant's own two measurements. A fall of 40% or more is
    // HIGH — the area is lit very differently from how it was accepted — and
    // 25% or more MEDIUM.
    const severity: InsightSeverity = c.pct <= -40 ? "high" : "medium";
    out.push(
      insight(ctx, LUX_ID, {
        id: `m1|${areaKey(c.area)}|${newer.dueDate}`,
        rule: "M1",
        severity,
        title: `${c.area}: light fell ${num(Math.abs(c.pct), 0)}% (${c.before} → ${c.after} lux) between ${span}`,
        detail:
          `Measured on ${fno}: ${c.before} lux on ${fmt(older.dueDate)}${olderNote}, ${c.after} lux on ${fmt(newer.dueDate)}. The form prints no lux standard, so this compares the plant's two measurements, not a limit. ` +
          (cabinet
            ? "This is a colour-matching cabinet, where shade is judged against the standard: less light there changes how a colour reads, so check its lamps (and that they are the type the cabinet needs) before the next colour approval."
            : "Check the fittings in this area — failed or dirty lamps, or a changed layout — and measure it again."),
        evidence: [ev(newer, "luxLevel", `${c.area}: ${c.after} lux`), ev(older, older.formatRevision === "00" ? "luxDay" : "luxLevel", `${c.area}: ${c.before} lux`)],
        route: ctx.recordRoute(newer),
        metric: { label: "Change", value: pctText(c.pct) },
        ...(severity === "high"
          ? {
              suggestedCapa: {
                finding: `Lux level at ${c.area} fell ${num(Math.abs(c.pct), 0)}% (${c.before} → ${c.after} lux) between ${span} (${fno}).`,
                comment: `${fno} of ${fmt(older.dueDate)}${olderNote}: ${c.before} lux; ${fno} of ${fmt(newer.dueDate)}: ${c.after} lux.`,
                action: cabinet
                  ? "Check and replace the cabinet's lamps as its maker specifies, measure again, and confirm colour judgement there before the next approval."
                  : "Check and restore the lighting in this area, then measure again and record it on F/MNT/11.",
              },
            }
          : {}),
      })
    );
  }

  const falls = changes.filter((c) => c.pct < 0).slice(0, 3);
  const rises = changes.filter((c) => c.pct > 0).slice(0, 3);
  const onlyNew = [...b.keys()].filter((k) => !a.has(k)).length;
  const onlyOld = [...a.keys()].filter((k) => !b.has(k)).length;
  const bigFalls = changes.filter((c) => c.pct <= -25).length;
  out.push(
    insight(ctx, LUX_ID, {
      id: `m1|summary|${newer.dueDate}`,
      rule: "M1",
      severity: "low",
      title: `Lux levels ${fmt(older.dueDate)} → ${fmt(newer.dueDate)}: ${plural(changes.length, "area")} compared, ${bigFalls} fell by 25% or more`,
      detail:
        `Largest falls: ${falls.map((c) => `${c.area} ${pctText(c.pct)}`).join("; ") || "none"}. Largest rises: ${rises.map((c) => `${c.area} ${pctText(c.pct)}`).join("; ") || "none"}.` +
        (onlyNew || onlyOld ? ` ${onlyNew ? `${plural(onlyNew, "area")} measured only on the newer round` : ""}${onlyNew && onlyOld ? ", " : ""}${onlyOld ? `${plural(onlyOld, "area")} only on the older` : ""}.` : "") +
        ` Areas are matched by name${older.formatRevision === "00" ? `; the ${fmt(older.dueDate)} round was taken on the superseded Rev 00, and its Day reading is the one compared` : ""}.`,
      evidence: [ev(newer), ev(older)],
      route: ctx.documentRoute(LUX_ID),
      metric: { label: "Largest fall", value: falls[0] ? pctText(falls[0].pct) : "none" },
    })
  );
  return out;
};

// ---- M2: the equipment list itself ----

// The countries a machine on this list comes from, and the other common ones.
const COUNTRIES = new Set(
  [
    "india", "china", "germany", "japan", "taiwan", "italy", "spain", "france", "usa", "u.s.a", "united states", "united states of america",
    "uk", "u.k", "united kingdom", "england", "switzerland", "netherlands", "holland", "belgium", "austria", "sweden", "denmark", "finland",
    "norway", "korea", "south korea", "singapore", "thailand", "malaysia", "indonesia", "vietnam", "turkey", "israel", "canada", "mexico",
    "brazil", "czech republic", "czechia", "poland", "portugal", "ireland", "hong kong", "sri lanka", "bangladesh", "uae",
    "united arab emirates", "russia", "hungary", "romania", "greece", "australia", "south africa", "egypt", "pakistan", "philippines",
    "argentina", "slovakia", "slovenia", "croatia", "luxembourg", "new zealand",
  ].map((c) => c.toLowerCase())
);
const isCountry = (v: unknown): boolean => COUNTRIES.has(text(v).toLowerCase().replace(/\.$/, ""));
const MONTH_WORD = /^(?:jan(?:uary)?|feb(?:ruary|raury)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?$/i;
const YEAR = /^(?:19|20)\d{2}$/;

/** The equipment list's current record: the latest Verified one, else the latest written. */
function currentEquipmentRecord(ctx: RuleContext): RecordInstance | undefined {
  const records = ctx.records(EQUIPMENT_LIST_ID);
  if (records.length === 0) return undefined;
  const verified = records.filter((r) => r.status === "Verified");
  const pool = verified.length > 0 ? verified : records;
  return pool.reduce((best, r) => (r.dueDate > best.dueDate || (r.dueDate === best.dueDate && r.updatedAt > best.updatedAt) ? r : best));
}

const equipmentRows = (record: RecordInstance): LogSheetRow[] =>
  rowsOf(record).filter((r) => ["machineNo", "location", "manufacturer", "model", "description", "serialNo"].some((k) => text(r[k])));

const equipmentListRule: InsightRule = (ctx) => {
  const record = currentEquipmentRecord(ctx);
  if (!record) return [];
  const fno = ctx.formatNo(EQUIPMENT_LIST_ID);
  const rows = equipmentRowsMemo(ctx, record);
  const out: Insight[] = [];
  const noOf = (r: LogSheetRow) => text(r.machineNo) || "(no Machine No.)";

  // ONE COLUMN OUT OF STEP: F/MNT/01 prints M-68 so — Country of Origin holds
  // a description, Size holds a country, Year a month and Serial No. a year.
  // The shape is tested, not the number, so a corrected line stops matching.
  // MEDIUM: forms that fetch the machine copy its details from this line.
  const shifted = rows.filter((r) => !isCountry(r.countryOfOrigin) && isCountry(r.size) && MONTH_WORD.test(text(r.year)) && YEAR.test(text(r.serialNo)));
  for (const r of shifted) {
    const no = noOf(r);
    out.push(
      insight(ctx, EQUIPMENT_LIST_ID, {
        id: `m2|out-of-step|${machineKey(r.machineNo) || no}`,
        rule: "M2",
        severity: "medium",
        title: `${fno}: ${no}'s line reads one column out of step — confirm it against the machine`,
        detail:
          `Country of Origin reads ${quote(r.countryOfOrigin, 40)}, Machine Size / Capacity ${quote(r.size, 30)}, Year of Manufacture ${quote(r.year, 20)} and Serial No. ${quote(r.serialNo, 20)}. ` +
          `Read one column to the left it is a ${clip(r.countryOfOrigin, 40)} (model ${clip(r.description, 40)}) by ${clip(r.model, 40)}, made in ${clip(r.size, 30)} in ${clip(r.year, 20)} ${clip(r.serialNo, 10)}, with no serial number written. ` +
          `Check the machine's plate and correct the line, so every form that fetches ${no} copies the right details.`,
        evidence: [ev(record, "countryOfOrigin", `${no}: ${clip(r.countryOfOrigin, 40)}`)],
        route: ctx.documentRoute(EQUIPMENT_LIST_ID),
      })
    );
  }

  // A MACHINE IS ITS NUMBER (engine/equipmentMaster.ts): two lines with one
  // number make every fetch of it ambiguous. MEDIUM.
  const byNo = new Map<string, LogSheetRow[]>();
  for (const r of rows) {
    const k = machineKey(r.machineNo) || text(r.machineNo).toUpperCase();
    if (!k) continue;
    let list = byNo.get(k);
    if (!list) byNo.set(k, (list = []));
    list.push(r);
  }
  for (const [k, list] of byNo) {
    if (list.length < 2) continue;
    out.push(
      insight(ctx, EQUIPMENT_LIST_ID, {
        id: `m2|duplicate|${k}`,
        rule: "M2",
        severity: "medium",
        title: `${fno}: Machine No. ${k} is written on ${plural(list.length, "line")}`,
        detail:
          `${list.map((r) => `${text(r.machineNo)} — ${clip(r.model || r.description, 40)}${text(r.location) ? `, ${clip(r.location, 30)}` : ""}`).join("; ")}. ` +
          `Only the Machine No. identifies a machine (model names repeat on this list), so one number on two lines means a form cannot tell which is meant. Give each machine its own number.`,
        evidence: [ev(record, "machineNo", `${k} × ${list.length}`)],
        route: ctx.documentRoute(EQUIPMENT_LIST_ID),
      })
    );
  }

  const unnumbered = rows.filter((r) => !text(r.machineNo));
  if (unnumbered.length > 0) {
    out.push(
      insight(ctx, EQUIPMENT_LIST_ID, {
        id: `m2|no-number`,
        rule: "M2",
        severity: "medium",
        title: `${fno}: ${plural(unnumbered.length, "line")} with no Machine No.`,
        detail: `${unnumbered.map((r) => clip(r.model || r.description || r.manufacturer, 40)).join("; ")}. A machine without a number cannot be fetched onto a maintenance form or added up on the breakdown register. Give it its number.`,
        evidence: [ev(record, "machineNo", `${unnumbered.length} blank`)],
        route: ctx.documentRoute(EQUIPMENT_LIST_ID),
      })
    );
  }

  // LOW from here: gaps in what the list knows about a machine. Nothing is
  // made wrongly because of them, but the list is the master the other forms
  // copy from, and an auditor reads it.
  const noLocation = rows.filter((r) => text(r.machineNo) && (isPlaceholder(r.location) || !text(r.location)));
  if (noLocation.length > 0) {
    out.push(
      insight(ctx, EQUIPMENT_LIST_ID, {
        id: `m2|location`,
        rule: "M2",
        severity: "low",
        title: `${fno}: no Location / Room for ${noLocation.map(noOf).join(", ")}`,
        detail: `${noLocation.map((r) => `${noOf(r)} (${clip(r.model || r.description, 40)})`).join("; ")} ${noLocation.length === 1 ? "has" : "have"} the Location / Room left blank. Write where the machine stands, so a breakdown or a PM can be sent to the right room.`,
        evidence: noLocation.map((r) => ev(record, "location", `${noOf(r)}: blank`)),
        route: ctx.documentRoute(EQUIPMENT_LIST_ID),
      })
    );
  }
  const badYear = rows.filter((r) => text(r.machineNo) && !shifted.includes(r) && !YEAR.test(text(r.year)));
  if (badYear.length > 0) {
    out.push(
      insight(ctx, EQUIPMENT_LIST_ID, {
        id: `m2|year`,
        rule: "M2",
        severity: "low",
        title: `${fno}: Year of Manufacture is not a year for ${badYear.map(noOf).join(", ")}`,
        detail: `${badYear.map((r) => `${noOf(r)} reads ${quote(r.year || "(blank)", 20)}`).join("; ")}. If the year is known, write it as four digits; if it is not, say so, so the list does not read as a mistake.`,
        evidence: badYear.map((r) => ev(record, "year", `${noOf(r)}: ${text(r.year) || "blank"}`)),
        route: ctx.documentRoute(EQUIPMENT_LIST_ID),
      })
    );
  }
  return out;
};

// ---- M3 / M7: the breakdown register ----

export interface BreakdownLine {
  record: RecordInstance;
  rowId: string;
  date: string;
  /** "M-47", the ID as written where it is not a machine number, or the name. */
  machine: string;
  idWritten: string;
  name: string;
  fault: string;
  reason: string;
  /** Minutes from failure to repair; negative when the repair is written before the failure; null when not all four are written. */
  span: number | null;
  loss: number | null;
  failure: string;
  repaired: string;
}

// Exported for the monthly management summary (engine/monthlySummary.ts): a
// month's breakdowns, minutes and MTTR are added up from these same lines, so
// the report and M3 can never read the register differently.
export function breakdownLines(record: RecordInstance): BreakdownLine[] {
  const out: BreakdownLine[] = [];
  for (const row of rowsOf(record)) {
    const idWritten = text(row.equipmentIdNo);
    const name = text(row.equipmentName);
    const fault = text(row.faultReported);
    if (!idWritten && !name && !fault) continue;
    const machine = machineKey(idWritten) || idWritten.toUpperCase() || (name ? `“${name}”` : "(no equipment named)");
    const lossRaw = row.productionLossMinutes;
    const loss = typeof lossRaw === "number" ? lossRaw : text(lossRaw) !== "" && Number.isFinite(Number(text(lossRaw))) ? Number(text(lossRaw)) : null;
    // A failure date the plant wrote some other way ("12.09.2026", once the
    // Format Editor has made the column Text) is dated by the sheet and SHOWN
    // as written: fmt never formats what is not a real ISO day. Formatting it
    // regardless threw, and because this runs in the warm-up, outside the
    // per-rule guard, one such line stopped every insight for everybody.
    out.push({
      record,
      rowId: String(row.id ?? ""),
      date: isRealISO(text(row.failureDate)) ? text(row.failureDate) : record.dueDate,
      machine,
      idWritten,
      name,
      fault,
      reason: text(row.reason),
      span: breakdownSpanMinutes(row.failureDate, row.failureTime, row.repairedDate, row.repairedTime),
      loss,
      failure: `${text(row.failureDate) ? fmt(text(row.failureDate)) : "?"} ${text(row.failureTime)}`.trim(),
      repaired: `${text(row.repairedDate) ? fmt(text(row.repairedDate)) : "?"} ${text(row.repairedTime)}`.trim(),
    });
  }
  return out;
}

const breakdownRule: InsightRule = (ctx) => {
  const records = ctx.records(BREAKDOWN_ID);
  if (records.length === 0) return [];
  const fno = ctx.formatNo(BREAKDOWN_ID);
  const lines = records.flatMap((r) => breakdownsMemo(ctx, r));
  const out: Insight[] = [];
  const label = (l: BreakdownLine) => (l.name ? `${l.machine} (${clip(l.name, 40)})` : l.machine);

  // A repair written as earlier than the failure: a clerical slip, LOW — but
  // its TOTAL BREAKDOWN MINUTES stays blank and the downtime goes uncounted.
  for (const l of lines) {
    if (l.span === null || l.span >= 0) continue;
    out.push(
      insight(ctx, BREAKDOWN_ID, {
        id: `m3|order|${l.record.id}|${l.rowId}`,
        rule: "M3",
        severity: "low",
        title: `${fno}: repair written before the failure for ${label(l)} (${fmt(l.date)})`,
        detail: `Failure reported ${l.failure}, repaired ${l.repaired} — ${plural(Math.abs(l.span), "minute")} BEFORE it failed. The TOTAL BREAKDOWN MINUTES cell stays blank, so this downtime is not counted until the dates or times are corrected.`,
        evidence: [ev(l.record, "repairedDate", `${l.failure} → ${l.repaired}`)],
        route: ctx.recordRoute(l.record),
      })
    );
  }

  const recent = lines.filter((l) => within(l.date, ctx.today, EVENT_WINDOW));
  if (recent.length > 0) {
    const byMachine = new Map<string, BreakdownLine[]>();
    for (const l of recent) {
      let list = byMachine.get(l.machine);
      if (!list) byMachine.set(l.machine, (list = []));
      list.push(l);
    }
    const stats = [...byMachine].map(([machine, list]) => {
      list.sort((a, b) => compareISO(a.date, b.date));
      const timed = list.filter((l) => l.span !== null && l.span >= 0);
      const down = timed.reduce((n, l) => n + (l.span as number), 0);
      const loss = list.reduce((n, l) => n + (l.loss ?? 0), 0);
      return { machine, list, down, loss, mttr: timed.length > 0 ? down / timed.length : null, label: label(list[list.length - 1]) };
    });

    for (const s of stats) {
      if (s.list.length < 3) continue;
      const first = s.list[0].date;
      const last = s.list[s.list.length - 1].date;
      const gap = s.list.length > 1 ? daysBetween(first, last) / (s.list.length - 1) : null;
      const events = s.list.map((l) => `${fmt(l.date)}: ${clip(l.fault, 50)}${l.reason ? ` (${clip(l.reason, 40)})` : ""}`);
      out.push(
        insight(ctx, BREAKDOWN_ID, {
          id: `m3|machine|${s.machine}`,
          rule: "M3",
          // HIGH: three failures of one machine in a quarter is a pattern its
          // preventive maintenance is not catching.
          severity: "high",
          title: `${s.label} broke down ${times(s.list.length)} in the last ${EVENT_WINDOW} days`,
          detail:
            `${events.slice(-5).join("; ")}. ` +
            `Down ${plural(s.down, "minute")} in all${s.mttr !== null ? `, ${num(s.mttr, 0)} minutes on average to repair` : ""}${gap !== null ? `, one breakdown every ${num(gap, 0)} calendar days on average (the plant keeps no running hours, so calendar days are used)` : ""}; production lost ${plural(s.loss, "minute")}. ` +
            `Look for the common cause and review this machine's preventive maintenance check points (F/MNT/02).`,
          evidence: s.list.map((l) => ev(l.record, "equipmentIdNo", `${fmt(l.date)}: ${clip(l.fault, 50)}`)),
          route: ctx.documentRoute(BREAKDOWN_ID),
          metric: { label: "MTTR", value: s.mttr !== null ? `${num(s.mttr, 0)} min` : "not timed" },
          suggestedCapa: {
            finding: `${s.label} broke down ${times(s.list.length)} in ${EVENT_WINDOW} days (${fno}).`,
            comment: `${events.join("; ")}. Downtime ${s.down} min, production loss ${s.loss} min.`,
            action: "Find the common cause across these breakdowns (see REASON For Breakdown), review the machine's preventive maintenance check points on F/MNT/02, and put in a lasting correction; watch the next 90 days.",
          },
        })
      );
    }

    const totalDown = stats.reduce((n, s) => n + s.down, 0);
    const totalLoss = stats.reduce((n, s) => n + s.loss, 0);
    const timedCount = recent.filter((l) => l.span !== null && l.span >= 0).length;
    const ranked = [...stats].sort((a, b) => b.down - a.down || b.list.length - a.list.length).slice(0, 5);
    out.push(
      insight(ctx, BREAKDOWN_ID, {
        id: `m3|summary`,
        rule: "M3",
        severity: "low",
        title: `Breakdowns in the last ${EVENT_WINDOW} days: ${plural(recent.length, "breakdown")} on ${plural(stats.length, "machine")}, ${plural(totalDown, "minute")} down, ${plural(totalLoss, "minute")} of production lost`,
        detail:
          `By downtime: ${ranked.map((s) => `${s.label} — ${plural(s.list.length, "breakdown")}, ${s.mttr !== null ? `${s.down} min (MTTR ${num(s.mttr, 0)} min)` : "minutes not worked out"}`).join("; ")}. ` +
          `Minutes are worked out from the failure and repair dates and times written on ${fno}; ${recent.length - timedCount > 0 ? `${plural(recent.length - timedCount, "line")} whose minutes cannot be worked out (a date or time missing, or the repair written before the failure) ${recent.length - timedCount === 1 ? "is" : "are"} counted as a breakdown but not in the minutes.` : "every line has both moments written."}`,
        evidence: recent.map((l) => ev(l.record, "equipmentIdNo", `${fmt(l.date)}: ${l.machine}`)),
        route: ctx.documentRoute(BREAKDOWN_ID),
        metric: { label: "MTTR, all machines", value: timedCount > 0 ? `${num(totalDown / timedCount, 0)} min` : "not timed" },
      })
    );
  }

  // ---- M7: an equipment ID the equipment list does not have ----
  const listRecord = currentEquipmentRecord(ctx);
  if (listRecord) {
    const known = new Set(
      equipmentRowsMemo(ctx, listRecord)
        .map((r) => machineKey(r.machineNo))
        .filter(Boolean)
    );
    const unknown = new Map<string, BreakdownLine[]>();
    for (const l of lines) {
      if (!l.idWritten) continue;
      const k = machineKey(l.idWritten);
      if (k && known.has(k)) continue;
      const id = k || l.idWritten;
      let list = unknown.get(id);
      if (!list) unknown.set(id, (list = []));
      list.push(l);
    }
    for (const [id, list] of unknown) {
      out.push(
        insight(ctx, BREAKDOWN_ID, {
          id: `m7|${id}`,
          rule: "M7",
          // LOW: a record-keeping link, not a hazard — but until it is fixed
          // this machine's breakdowns are not added up with its others.
          severity: "low",
          title: `${fno} names equipment ID ${quote(id, 30)}, which is not on the ${ctx.docName(EQUIPMENT_LIST_ID)} (${ctx.formatNo(EQUIPMENT_LIST_ID)})`,
          detail:
            `${plural(list.length, "breakdown line")} (${list.map((l) => fmt(l.date)).slice(-5).join(", ")}) name${list.length === 1 ? "s" : ""} ${quote(id, 30)}${list[0].name ? ` (${clip(list[0].name, 40)})` : ""}. ` +
            `Either the ID was mistyped or the machine is missing from the equipment list; breakdowns can only be added up per machine when the two agree.`,
          evidence: list.map((l) => ev(l.record, "equipmentIdNo", `${fmt(l.date)}: ${l.idWritten}`)),
          route: ctx.documentRoute(BREAKDOWN_ID),
        })
      );
    }
  }
  return out;
};

// ---- M4: glass breakage ----

// A breakage is "YES" on the BREAKAGE row, or an area cell saying Crack,
// Breakage, Broken or YES. "No crack", "Nil" and the like are not.
const BREAK_WORDS = /\b(?:crack(?:ed|s)?|breakage|broken|break|yes)\b/i;
const NEGATION = /^\s*(?:no|nil|none|not|without)\b/i;
const saysBroken = (v: unknown): boolean => {
  const s = text(v);
  return !!s && BREAK_WORDS.test(s) && !NEGATION.test(s);
};

// The paper's own instruction, printed beside the grid, quoted exactly.
const GLASS_INSTRUCTION = "Pl fill up CA / Incident record along with root cause analysis, correction & corrective action for actual breakage or crack";

const glassRule: InsightRule = (ctx) => {
  const out: Insight[] = [];
  const fno = ctx.formatNo(GLASS_ID);
  for (const record of ctx.records(GLASS_ID)) {
    if (!within(record.dueDate, ctx.today, 183)) continue;
    const layout = ctx.layout(record);
    const weeks = (layout?.columns ?? []).filter((c) => c.key !== "parameter");
    const rows = rowsOf(record);
    const kind = (r: LogSheetRow) => normText(r.parameter);
    const breakageRow = rows.find((r) => kind(r).startsWith("breakage"));
    const dateRow = rows.find((r) => kind(r).startsWith("date of monitoring"));
    const areaRows = rows.filter((r) => r !== breakageRow && r !== dateRow && !/^(?:checked by|varified by|verified by)/.test(kind(r)));
    const month = text(headerOf(record).monthYear) || monthLabel(record.dueDate.slice(0, 7));
    for (const week of weeks) {
      const yes = breakageRow ? /^\s*y(?:es)?\b/i.test(text(breakageRow[week.key])) : false;
      const areas = areaRows.filter((r) => saysBroken(r[week.key]));
      if (!yes && areas.length === 0) continue;
      const where = areas.map((r) => `${text(r.parameter)} — ${clip(r[week.key], 40)}`);
      const checkedOn = dateRow ? text(dateRow[week.key]) : "";
      const weekName = week.label.replace(/\s+/g, " ");
      out.push(
        insight(ctx, GLASS_ID, {
          id: `m4|${record.id}|${week.key}`,
          rule: "M4",
          // HIGH: broken glass or brittle plastic in a plant that makes food
          // packaging is a foreign-body risk to the product, and the form
          // itself requires a CA / incident record for every one.
          severity: "high",
          title: `Glass breakage recorded in ${weekName} of ${month}${where.length ? `: ${areas.map((r) => text(r.parameter)).join(", ")}` : ""}`,
          detail:
            `${fno} records ${[yes ? "BREAKAGE – YES" : "", ...where].filter(Boolean).join("; ")}${checkedOn ? ` (checked ${isISO(checkedOn) ? fmt(checkedOn) : checkedOn})` : ""}. ` +
            `Broken glass or brittle plastic is a foreign-body risk to the product. The form's own instruction: inform the Maintenance In-charge and the area's HOD, follow the SOP for handling glass breakage, and "${GLASS_INSTRUCTION}".`,
          evidence: [ev(record, week.key, [yes ? "BREAKAGE – YES" : "", ...where].filter(Boolean).join("; "))],
          route: ctx.recordRoute(record),
          suggestedCapa: {
            finding: `Glass / brittle plastic breakage recorded on ${fno}, ${weekName} of ${month}${where.length ? `: ${where.join("; ")}` : ""}.`,
            comment: `Recorded on the Weekly Glass Breakage Monitoring Record (${fno})${checkedOn ? `, checked ${isISO(checkedOn) ? fmt(checkedOn) : checkedOn}` : ""}. The form instructs: "${GLASS_INSTRUCTION}".`,
            action: "Root cause analysis of the breakage; correction (clean-up and product segregation as the SOP for Handling of Glass breakage requires); corrective action to prevent a repeat; update the glass article list if an article is replaced or removed.",
          },
        })
      );
    }
  }
  return out;
};

// ---- M5: daily health checks not ticked ----

const MONTH_ABBR = MONTH_NAMES.map((m) => m.slice(0, 3).toLowerCase());

/** "September 2026", "Sep-26", "09/2026", "2026-09" → "2026-09"; null when it cannot be read. */
function parseMonthYear(value: unknown): string | null {
  const s = text(value).toLowerCase();
  if (!s) return null;
  const ym = (y: number, m: number) => (m >= 1 && m <= 12 && y >= 2000 && y <= 2099 ? `${y}-${String(m).padStart(2, "0")}` : null);
  const year = (t: string) => (t.length === 2 ? 2000 + Number(t) : Number(t));
  let m = s.match(/^(\d{4})\s*[-/.]\s*(\d{1,2})$/);
  if (m) return ym(Number(m[1]), Number(m[2]));
  m = s.match(/^(\d{1,2})\s*[-/.\s]\s*(\d{4}|\d{2})$/);
  if (m) return ym(year(m[2]), Number(m[1]));
  const mi = MONTH_ABBR.findIndex((a) => new RegExp(`(?:^|[^a-z])${a}`).test(s));
  const y = s.match(/(\d{4}|\d{2})\s*$/);
  return mi >= 0 && y ? ym(year(y[1]), mi + 1) : null;
}

const dailyHealthRule: InsightRule = (ctx) => {
  const out: Insight[] = [];
  const fno = ctx.formatNo(DAILY_HEALTH_ID);
  const month = ctx.today.slice(0, 7);
  const todayDay = Number(ctx.today.slice(8, 10));
  if (todayDay <= 1) return out;
  for (const record of ctx.records(DAILY_HEALTH_ID)) {
    const h = headerOf(record);
    const sheetMonth = parseMonthYear(h.monthYear) ?? record.dueDate.slice(0, 7);
    if (sheetMonth !== month) continue;
    const rows = rowsOf(record);
    const rowFor = (day: number) => rows.find((r) => text(r.date) === String(day)) ?? rows[day - 1];
    const written = (r: LogSheetRow | undefined) => !!r && ["dayCheck", "dayOperator", "nightCheck", "nightOperator"].some((k) => text(r[k]));
    // Counted from the first day anything was written: a sheet begun mid-month
    // (a machine installed then) is not blamed for the days before it.
    let firstDay = 0;
    for (let d = 1; d < todayDay; d++) if (written(rowFor(d))) { firstDay = d; break; }
    if (firstDay === 0) continue;
    const missedDay: number[] = [];
    const missedNight: number[] = [];
    for (let d = firstDay; d < todayDay; d++) {
      const iso = `${month}-${String(d).padStart(2, "0")}`;
      if (ctx.isClosedDay?.(iso)) continue;
      const r = rowFor(d);
      if (!text(r?.dayCheck)) missedDay.push(d);
      if (!text(r?.nightCheck)) missedNight.push(d);
    }
    const missed = missedDay.length + missedNight.length;
    if (missed === 0) continue;
    const machine = [text(h.machineNo), text(h.machineDescription)].filter(Boolean).join(" ") || "A machine";
    out.push(
      insight(ctx, DAILY_HEALTH_ID, {
        id: `m5|${record.id}|${month}`,
        rule: "M5",
        // MEDIUM from three missed shift checks in the month, LOW for one or
        // two: a blank shift is a machine nobody signed as cleaned and checked.
        severity: missed >= 3 ? "medium" : "low",
        title: `${machine}: ${plural(missed, "shift check")} not ticked this month on ${fno}`,
        detail:
          `${missedDay.length ? `Day shift: ${missedDay.join(", ")}.` : ""}${missedDay.length && missedNight.length ? " " : ""}${missedNight.length ? `Night shift: ${missedNight.join(", ")}.` : ""} ` +
          `The tick says the machine was cleaned and its panels, sounds, leaks, air and water pressures and emergency stop were checked; a blank shift means the check was not done or not written down. ` +
          `Counted from the first entry on day ${firstDay} to yesterday${ctx.isClosedDay ? ", leaving out the days the plant was closed" : ""}.`,
        evidence: [ev(record, "dayCheck", `${missed} blank: day ${missedDay.join(", ") || "none"}; night ${missedNight.join(", ") || "none"}`)],
        route: ctx.recordRoute(record),
        metric: { label: "Missed checks", value: String(missed) },
      })
    );
  }
  return out;
};

// ---- M6: preventive maintenance slipping on the yearly schedule ----

const PM_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "10.01" (day.month, the sheet's own way) in the sheet's year → ISO; null when it is not a date. */
// Exported for the monthly management summary's PM planned-against-done count (engine/monthlySummary.ts).
export function dayMonth(value: unknown, year: number): string | null {
  const m = text(value).match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[./-]\s*(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1) return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isoFromDay(dayNumber(iso)) === iso ? iso : null; // 31.02 is not a day
}

const pmSlipRule: InsightRule = (ctx) => {
  const out: Insight[] = [];
  const fno = ctx.formatNo(YEARLY_PM_ID);
  const thisYear = Number(ctx.today.slice(0, 4));
  for (const record of ctx.records(YEARLY_PM_ID)) {
    const year = Number(record.dueDate.slice(0, 4));
    if (!(year >= thisYear - 1 && year <= thisYear)) continue;
    rowsOf(record).forEach((row, index) => {
      const late: { month: string; plan: string; actual: string; days: number }[] = [];
      const missed: { month: string; plan: string; days: number }[] = [];
      for (const m of PM_MONTHS) {
        const planRaw = text(row[`${m}Plan`]);
        const actualRaw = text(row[`${m}Actual`]);
        const plan = dayMonth(planRaw, year);
        if (!plan || plan > ctx.today || daysBetween(plan, ctx.today) > 365) continue;
        const actual = dayMonth(actualRaw, year);
        // More than seven days after the plan is a slip; a PM done within the
        // week is the plan kept. Written but not as a date: taken as done.
        if (actual && daysBetween(plan, actual) > 7) late.push({ month: m, plan: planRaw, actual: actualRaw, days: daysBetween(plan, actual) });
        else if (!actualRaw && daysBetween(plan, ctx.today) > 7) missed.push({ month: m, plan: planRaw, days: daysBetween(plan, ctx.today) });
      }
      if (late.length === 0 && missed.length === 0) return;
      const equipment = text(row.equipment) || "(the unnamed block)";
      const frequency = text(row.frequency);
      // HIGH when a planned PM is more than a month overdue and still not
      // done — the machine is running past the interval its check points were
      // set for; MEDIUM for a PM done late or up to a month overdue.
      const severity: InsightSeverity = missed.some((x) => x.days > 30) ? "high" : "medium";
      const parts = [
        ...missed.map((x) => `planned ${x.plan}, not done (${plural(x.days, "day")} past the plan)`),
        ...late.map((x) => `planned ${x.plan}, done ${x.actual} (${plural(x.days, "day")} late)`),
      ];
      out.push(
        insight(ctx, YEARLY_PM_ID, {
          id: `m6|${record.id}|${index}`,
          rule: "M6",
          severity,
          title: `${equipment}${frequency ? ` (${frequency})` : ""}: preventive maintenance slipping on ${fno} ${year} — ${missed.length} not done, ${late.length} done late`,
          detail:
            `${parts.slice(0, 5).join("; ")}${parts.length > 5 ? ` and ${parts.length - 5} more` : ""}. ` +
            `A PM done late, or not at all, is what the schedule exists to prevent. Bring the missed PM forward, record it on F/MNT/02, and write the Actual on this schedule.`,
          evidence: [...missed.map((x) => ev(record, `${x.month}Plan`, `${x.plan} — not done`)), ...late.map((x) => ev(record, `${x.month}Actual`, `${x.plan} → ${x.actual}`))],
          route: ctx.recordRoute(record),
          metric: { label: "Slipped", value: String(missed.length + late.length) },
        })
      );
    });
  }
  return out;
};

// ===========================================================================
// what is remembered per record, and the warm-up that fills it in slices
// ===========================================================================

type MemoContext = Pick<RuleContext, "memo">;

/**
 * One record read for one purpose, remembered with it — and a record that
 * cannot be read (a cell holding what its column never expected, after a
 * format edit) is read as holding nothing for that purpose, and said so in
 * the console, instead of taking the whole rule, or the warm-up and so every
 * rule, down with it.
 */
function readSafely<T>(ctx: MemoContext, kind: string, r: RecordInstance, nothing: () => NoInfer<T>, read: (layout: LogSheetLayout | undefined) => T): T {
  return ctx.memo(kind, r, (layout) => {
    try {
      return read(layout);
    } catch (err) {
      console.error(`Insights: record ${r.id} (${r.documentId}) could not be read for "${kind}"; it is left out of that rule`, err);
      return nothing();
    }
  });
}

const readingsMemo = (ctx: MemoContext, r: RecordInstance) => readSafely(ctx, "readings", r, () => [], (layout) => readingSeriesOf(r, layout));
const printingStopMemo = (ctx: MemoContext, r: RecordInstance) => readSafely(ctx, "printing-stop", r, () => null, () => printingStop(r));
const luxMemo = (ctx: MemoContext, r: RecordInstance) => readSafely(ctx, "lux", r, () => new Map(), () => luxReadings(r));
const equipmentRowsMemo = (ctx: MemoContext, r: RecordInstance) => readSafely(ctx, "equipment-rows", r, () => [], () => equipmentRows(r));
const breakdownsMemo = (ctx: MemoContext, r: RecordInstance) => readSafely(ctx, "breakdowns", r, () => [], () => breakdownLines(r));
const selfContradictionMemo = (ctx: MemoContext, r: RecordInstance) => readSafely(ctx, "self-contradiction", r, () => null, (layout) => selfContradictions(r, layout));
const fGradesPassedMemo = (ctx: MemoContext, r: RecordInstance) => readSafely(ctx, "f-grades-passed", r, () => [], () => fGradesPassed(r));

/**
 * Reads out of one record everything the rules will want from it, into the
 * per-record memo — the costly part of a first run. engine/insights.ts
 * warmInsights calls this a few records at a time between frames, so the run
 * that follows only adds up what is already read.
 */
export function warmRecord(ctx: Pick<RuleContext, "memo" | "layout">, record: RecordInstance): void {
  switch (record.documentId) {
    case INPROCESS_PRINTING_ID:
      printingStopMemo(ctx, record);
      fGradesPassedMemo(ctx, record);
      return;
    case LUX_ID:
      luxMemo(ctx, record);
      return;
    case EQUIPMENT_LIST_ID:
      equipmentRowsMemo(ctx, record);
      return;
    case BREAKDOWN_ID:
      breakdownsMemo(ctx, record);
      return;
  }
  if (INSPECTION_DOCS.includes(record.documentId)) {
    selfContradictionMemo(ctx, record);
    return;
  }
  if (ctx.layout(record)?.columns.some(isReadingColumn)) readingsMemo(ctx, record);
}

/** Every rule, in the order their insights are gathered (the page sorts them by severity). */
export const INSIGHT_RULES: InsightRule[] = [
  readingRule,
  lotDeviationRule,
  capaRecurrenceRule,
  overdueCapaRule,
  printingStopRule,
  consistencyRule,
  calibrationRule,
  supplierRule,
  luxRule,
  equipmentListRule,
  breakdownRule,
  glassRule,
  dailyHealthRule,
  pmSlipRule,
];
