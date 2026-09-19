// Cross-cutting read helpers used by Dashboard / Reports / Search so pages
// don't duplicate aggregation logic.
import type { DailyPestMonitoringData, FlyCatcherData, GapFinding, GapInspectionData, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { documentRepository } from "./repositories/documentRepository";
import { masterRepository } from "./repositories/masterRepository";
import { todayISO, compareISO, pad2 } from "../utils/date";
import { totalRodents } from "../engine/rodentPattern";
import { lizardYearPlan } from "../engine/lizardPattern";
import { RODENT_HISTORY_REPORTED } from "./seed/pestPattern";
import {
  FLIES_GRAMS_HISTORY_REPORTED,
  FLIES_TREND_REPORT,
  FLY_BOARD_COUNT_SOURCE,
  LIZARD_HISTORY_REPORTED,
  LIZARD_TREND_REPORT,
} from "./seed/trendReports";

// Rodents recorded on the Daily Pest Control Monitoring Record (checkpoint 7
// + catch details) — what Reports > Rodent Trend and the Dashboard add up.
// Only records a person has confirmed or the assistant has prepared count
// (anything with data); blank shells contribute nothing.
export interface RodentMonth {
  month: number; // 0-11
  rodents: number;
  catchDays: number;
}

export interface RodentYearStats {
  year: number;
  months: RodentMonth[];
  total: number;
  catchDays: number;
  byLocation: { location: string; rodents: number; catchDays: number }[];
  byBox: { trapBoxNo: string; location: string; rodents: number }[];
  daysRecorded: number;
}

export function rodentStatsForYear(year: number, isDemo: boolean): RodentYearStats {
  const records = recordRepository.query({
    documentId: "daily-pest-monitoring",
    isDemo,
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
  }) as RecordInstance<DailyPestMonitoringData>[];
  const months: RodentMonth[] = Array.from({ length: 12 }, (_, m) => ({ month: m, rodents: 0, catchDays: 0 }));
  const byLocation = new Map<string, { rodents: number; catchDays: number }>();
  const byBox = new Map<string, { location: string; rodents: number }>();
  let daysRecorded = 0;
  for (const r of records) {
    // A day counts once it has actually been filled in. Blank shells for the
    // days still to come used to be counted too, so the report could say
    // "from 18 recorded days" on a fresh install with nothing recorded.
    if (!dailyRecordFilled(r)) continue;
    daysRecorded += 1;
    const catches = r.data.rodentCatches ?? [];
    const n = r.data.checkpoints[7]?.value === "Yes" ? Math.max(totalRodents(catches), catches.length ? 0 : 1) : 0;
    if (n === 0) continue;
    const m = Number(r.dueDate.slice(5, 7)) - 1;
    months[m].rodents += n;
    months[m].catchDays += 1;
    const seen = new Set<string>();
    for (const c of catches) {
      const loc = c.location || "Location not recorded";
      const l = byLocation.get(loc) ?? { rodents: 0, catchDays: 0 };
      l.rodents += Number(c.count) || 0;
      if (!seen.has(loc)) {
        l.catchDays += 1;
        seen.add(loc);
      }
      byLocation.set(loc, l);
      const box = c.trapBoxNo || "—";
      const b = byBox.get(box) ?? { location: loc, rodents: 0 };
      b.rodents += Number(c.count) || 0;
      byBox.set(box, b);
    }
    if (catches.length === 0) {
      const l = byLocation.get("Location not recorded") ?? { rodents: 0, catchDays: 0 };
      l.rodents += 1;
      l.catchDays += 1;
      byLocation.set("Location not recorded", l);
    }
  }
  return {
    year,
    months,
    total: months.reduce((s, m) => s + m.rodents, 0),
    catchDays: months.reduce((s, m) => s + m.catchDays, 0),
    byLocation: Array.from(byLocation.entries())
      .map(([location, v]) => ({ location, ...v }))
      .sort((a, b) => b.rodents - a.rodents || a.location.localeCompare(b.location)),
    byBox: Array.from(byBox.entries())
      .map(([trapBoxNo, v]) => ({ trapBoxNo, ...v }))
      .sort((a, b) => b.rodents - a.rodents || a.trapBoxNo.localeCompare(b.trapBoxNo)),
    daysRecorded,
  };
}

export function rodentsInMonth(year: number, month: number, isDemo: boolean): number {
  const from = `${year}-${pad2(month + 1)}-01`;
  const to = `${year}-${pad2(month + 1)}-31`;
  return (recordRepository.query({ documentId: "daily-pest-monitoring", isDemo, fromDate: from, toDate: to }) as RecordInstance<DailyPestMonitoringData>[])
    .filter((r) => !r.data.isHoliday && r.data.checkpoints[7]?.value === "Yes")
    .reduce((s, r) => s + Math.max(totalRodents(r.data.rodentCatches), r.data.rodentCatches?.length ? 0 : 1), 0);
}

// Flies counted on the Fortnightly Fly Catcher Inspection & Cleaning Record
// (F/HR/18, "Flies Catch Count Approx." per unit per visit) — what Pest
// Control > Trend Analysis > Fly Catcher Infestation adds up. Every unit in
// Master Data is listed (with zeros) so the per-unit table is always the
// full PC-01..PC-13 register, even before any inspection is recorded.
export interface FlyUnitStats {
  pcId: string;
  location: string;
  months: number[]; // Jan..Dec
  total: number;
}

export interface FlyYearStats {
  year: number;
  months: number[]; // Jan..Dec, all units
  total: number;
  visits: number; // inspection records with at least one count filled in
  byUnit: FlyUnitStats[];
}

export function flyStatsForYear(year: number, isDemo: boolean): FlyYearStats {
  const master = masterRepository.get();
  const records = recordRepository.query({
    documentId: "fly-catcher",
    isDemo,
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
  }) as RecordInstance<FlyCatcherData>[];
  const units = new Map<string, FlyUnitStats>();
  for (const pc of master.pcLocations) {
    const floor = pc.floor && pc.floor !== "TO BE CONFIRMED" ? ` (${pc.floor})` : "";
    units.set(pc.id, { pcId: pc.id, location: `${pc.location}${floor}`, months: Array(12).fill(0), total: 0 });
  }
  const months: number[] = Array(12).fill(0);
  let visits = 0;
  for (const r of records) {
    const m = Number(r.dueDate.slice(5, 7)) - 1;
    let counted = false;
    for (const e of r.data.entries) {
      if (e.catchCountApprox === null || e.catchCountApprox === undefined) continue;
      const n = Number(e.catchCountApprox) || 0;
      counted = true;
      let u = units.get(e.pcId);
      if (!u) {
        u = { pcId: e.pcId, location: "Location not in Master Data", months: Array(12).fill(0), total: 0 };
        units.set(e.pcId, u);
      }
      u.months[m] += n;
      u.total += n;
      months[m] += n;
    }
    if (counted) visits += 1;
  }
  return { year, months, total: months.reduce((s, n) => s + n, 0), visits, byUnit: Array.from(units.values()) };
}

export function fliesInMonth(year: number, month: number, isDemo: boolean): number {
  return flyStatsForYear(year, isDemo).months[month] ?? 0;
}

// ---------------------------------------------------------------------------
// The year rows of the company's "Rodent Catch Report and Trend Analysis"
// (components/reports/CatchTrendSheet.tsx), filled from the data the other
// records actually hold.
//
// For each month the figure comes from ONE place, never both, so nothing is
// counted twice:
//   * the digital Daily Pest Control Monitoring Record, when the register
//     holds that month's days (rodents from checkpoint 7's catch details);
//   * otherwise the company's paper report, as transcribed
//     (RODENT_HISTORY_REPORTED — 2024, 2025, Jan-Jun 2026);
//   * otherwise blank — including every month that hasn't happened yet, the
//     way the paper report leaves Jul-Dec 2026 empty.
// In Live mode the register only starts at go-live (the launch-date floor), so
// the paper figures stand for everything before it; in Demo Mode the demo year
// supplies its own months.

export interface TrendYearRow {
  year: number;
  months: (number | null)[];
  fromRegister: boolean[];
  // Source / Unit / Target Pest are per ROW on the company's sheet, not per
  // report, and the flies report needs that: the years the provider weighed
  // the catch out of the EFKs are reported in "Gramms", a year added up from
  // the fortnightly board counts in "Number". Left out, the report's own
  // header wording is used (data/seed/trendReports.ts).
  source?: string;
  unit?: string;
  targetPest?: string;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function dailyRecordFilled(r: RecordInstance<DailyPestMonitoringData>): boolean {
  return !r.data.isHoliday && Object.values(r.data.checkpoints ?? {}).some((c) => c && c.value !== null && c.value !== "");
}

export function rodentTrendRows(isDemo: boolean, today = todayISO()): TrendYearRow[] {
  const records = recordRepository.query({ documentId: "daily-pest-monitoring", isDemo }) as RecordInstance<DailyPestMonitoringData>[];
  const registerMonths = new Set<string>();
  const rodentsByMonth = new Map<string, number>();
  for (const r of records) {
    if (!dailyRecordFilled(r)) continue;
    const key = monthKey(r.dueDate);
    registerMonths.add(key);
    const n = r.data.checkpoints[7]?.value === "Yes" ? Math.max(totalRodents(r.data.rodentCatches), r.data.rodentCatches?.length ? 0 : 1) : 0;
    rodentsByMonth.set(key, (rodentsByMonth.get(key) ?? 0) + n);
  }
  const reported = new Map(RODENT_HISTORY_REPORTED.map((h) => [h.year, h.months]));
  const thisMonth = monthKey(today);
  const currentYear = Number(today.slice(0, 4));
  const years = new Set<number>([...reported.keys(), ...Array.from(registerMonths, (k) => Number(k.slice(0, 4)))]);
  return Array.from(years)
    .filter((y) => y <= currentYear)
    .sort((a, b) => a - b)
    .map((year) => {
      const months: (number | null)[] = [];
      const fromRegister: boolean[] = [];
      for (let m = 0; m < 12; m++) {
        const key = `${year}-${pad2(m + 1)}`;
        if (key > thisMonth) {
          months.push(null);
          fromRegister.push(false);
        } else if (registerMonths.has(key)) {
          months.push(rodentsByMonth.get(key) ?? 0);
          fromRegister.push(true);
        } else {
          months.push(reported.get(year)?.[m] ?? null);
          fromRegister.push(false);
        }
      }
      return { year, months, fromRegister };
    });
}

// The year rows of the company's "FLIES CATCH REPORT AND TREND ANALYSIS"
// (page 3 of GP-3 Trend Analysis - 2025.pdf). The company reports this one by
// WEIGHT — grams of flies collected out of the electric fly killers each
// month — which is not the same measurement as the approximate per-board
// counts written on the fortnightly F/HR/18 register. So a year the provider
// reported is the reported grams, unconverted; a year only the digital
// register covers is its own board count, carrying its own Source and Unit on
// the row (the sheet prints those per row). Nothing is converted between the
// two, because there is no factor to convert with. REQUIREMENTS §41.
export function flyTrendRows(isDemo: boolean, today = todayISO()): TrendYearRow[] {
  const records = recordRepository.query({ documentId: "fly-catcher", isDemo }) as RecordInstance<FlyCatcherData>[];
  const byMonth = new Map<string, number>();
  for (const r of records) {
    const counts = r.data.entries.filter((e) => e.catchCountApprox !== null && e.catchCountApprox !== undefined);
    if (counts.length === 0) continue;
    const key = monthKey(r.dueDate);
    byMonth.set(key, (byMonth.get(key) ?? 0) + counts.reduce((s, e) => s + (Number(e.catchCountApprox) || 0), 0));
  }
  const reported = new Map(FLIES_GRAMS_HISTORY_REPORTED.map((h) => [h.year, h.months]));
  const currentYear = Number(today.slice(0, 4));
  // A year is on the sheet because the provider reported it or because the
  // register holds an inspection for it — never just because the calendar
  // reached it, which would put a row of twelve empty cells on the company's
  // page and give the chart an empty year to draw (REQUIREMENTS §39).
  const years = new Set<number>([...reported.keys(), ...Array.from(byMonth.keys(), (k) => Number(k.slice(0, 4)))]);
  return Array.from(years)
    .filter((y) => y <= currentYear)
    .sort((a, b) => a - b)
    .map((year) => {
      const asReported = reported.get(year);
      if (asReported) {
        return {
          year,
          months: [...asReported],
          fromRegister: Array(12).fill(false),
          source: FLIES_TREND_REPORT.source,
          unit: FLIES_TREND_REPORT.unit,
          targetPest: FLIES_TREND_REPORT.targetPest,
        };
      }
      const months: (number | null)[] = [];
      const fromRegister: boolean[] = [];
      for (let m = 0; m < 12; m++) {
        const v = byMonth.get(`${year}-${pad2(m + 1)}`);
        months.push(v ?? null);
        fromRegister.push(v !== undefined);
      }
      return { year, months, fromRegister, source: FLY_BOARD_COUNT_SOURCE, unit: "Number", targetPest: FLIES_TREND_REPORT.targetPest };
    });
}

// The year rows of the company's "LIZARD CATCH REPORT AND TREND ANALYSIS"
// (page 2 of the same file). The house lizards come off the same glue boards
// in the same Roda-boxes as the rodents, but F/HR/17 has no column for them —
// its check point 7 records the rodent catch only — so there is nothing in the
// register to add up and every figure here is the provider's own monthly
// report, transcribed. Nothing is tinted on this sheet for exactly that
// reason, and its footnote says so. REQUIREMENTS §41.
//
// A YEAR THE PROVIDER HAS NOT REPORTED YET follows the plant's own season
// (engine/lizardPattern.ts, REQUIREMENTS §62): more in the rains and in winter
// than in the dry summer, to the month that has been reached and no further.
// Its row says so in its Source, so it is never read as the provider's figure.
export const LIZARD_PATTERN_SOURCE = "Seasonal pattern — not yet reported by the service provider";

export function lizardTrendRows(_isDemo: boolean, today = todayISO()): TrendYearRow[] {
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7)) - 1;
  const reported: TrendYearRow[] = LIZARD_HISTORY_REPORTED.filter((h) => h.year <= currentYear).map((h) => ({
    year: h.year,
    months: [...h.months],
    fromRegister: Array(12).fill(false),
    source: LIZARD_TREND_REPORT.source,
    unit: LIZARD_TREND_REPORT.unit,
    targetPest: LIZARD_TREND_REPORT.targetPest,
  }));
  const lastReported = Math.max(...LIZARD_HISTORY_REPORTED.map((h) => h.year));
  const planned: TrendYearRow[] = [];
  for (let year = lastReported + 1; year <= currentYear; year++) {
    const plan = lizardYearPlan(year);
    planned.push({
      year,
      months: plan.map((n, m) => (year < currentYear || m <= currentMonth ? n : null)),
      fromRegister: Array(12).fill(false),
      source: LIZARD_PATTERN_SOURCE,
      unit: LIZARD_TREND_REPORT.unit,
      targetPest: LIZARD_TREND_REPORT.targetPest,
    });
  }
  return [...reported, ...planned];
}

export function allGapFindings(isDemo: boolean): { record: RecordInstance<GapInspectionData>; finding: GapFinding }[] {
  const records = recordRepository.query({ documentId: "gap-inspection", isDemo }) as RecordInstance<GapInspectionData>[];
  const out: { record: RecordInstance<GapInspectionData>; finding: GapFinding }[] = [];
  for (const r of records) {
    for (const f of r.data.findings) out.push({ record: r, finding: f });
  }
  return out;
}

export function refreshGapFindingStatuses(isDemo: boolean): void {
  const today = todayISO();
  const records = recordRepository.query({ documentId: "gap-inspection", isDemo }) as RecordInstance<GapInspectionData>[];
  for (const r of records) {
    let changed = false;
    const findings = r.data.findings.map((f) => {
      if (f.status === "Closed" || f.status === "Verified") return f;
      const overdue = !!f.targetDate && compareISO(f.targetDate, today) < 0 && !f.actualDateOfAction;
      const next = overdue ? "Overdue" : "Open";
      if (next !== f.status) changed = true;
      return { ...f, status: next as GapFinding["status"] };
    });
    if (changed) recordRepository.upsert({ ...r, data: { ...r.data, findings } });
  }
}

export function openCorrectiveActionsCount(isDemo: boolean): number {
  return allGapFindings(isDemo).filter(({ finding }) => finding.status === "Open" || finding.status === "Overdue").length;
}

export interface ModuleSummary {
  module: string;
  documentCount: number;
  configuredCount: number;
}

export function moduleSummaries(): ModuleSummary[] {
  const docs = documentRepository.getAll();
  const map = new Map<string, ModuleSummary>();
  for (const d of docs) {
    const m = map.get(d.module) ?? { module: d.module, documentCount: 0, configuredCount: 0 };
    m.documentCount += 1;
    if (d.status === "Configured") m.configuredCount += 1;
    map.set(d.module, m);
  }
  return Array.from(map.values());
}
