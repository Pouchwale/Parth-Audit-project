import React, { useEffect, useMemo, useState } from "react";
import { FiDownload, FiPrinter } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { ensureRecordsGeneratedForMonth } from "../engine/recordGenerator";
import { countFindings } from "../engine/checkpoints";
import { logSheetOutOfBandCount } from "../engine/validation";
import { summarise } from "../engine/guidedChecklist";
import { COMPLAINT_DOC_ID } from "../data/seed/complaintChecklist";
import { flyStatsForYear, flyTrendRows, rodentStatsForYear, rodentTrendRows } from "../data/selectors";
import { totalRodents } from "../engine/rodentPattern";
import { FLY_REPORT_SOURCE, RODENT_HISTORY_SOURCE, RODENT_REPORT_MONTHS } from "../data/seed/pestPattern";
import { COMPANY } from "../data/seed/masterData";
import { CatchTrendSheet, rowTotal, type TrendRow } from "../components/reports/CatchTrendSheet";
import { MONTH_NAMES, daysInMonth, pad2, formatDisplayDate } from "../utils/date";
import { toCSV, downloadCSV } from "../utils/csv";
import { pressable } from "../utils/pressable";
import { printDocument } from "../utils/print";
import { MiniBarChart } from "../components/reports/MiniBarChart";
import { DemoTag } from "../components/common/DemoTag";
import { DailyRegisterSheet } from "../components/records/DailyRegisterSheet";
import { useT } from "../i18n";
import type {
  ComplaintChecklistData,
  DailyPestMonitoringData,
  GapInspectionData,
  LogSheetData,
  RecordInstance,
  ServiceReportData,
  TrainingRecordData,
} from "../types";

type Tab = "monthly" | "daily" | "rodent" | "flycatcher" | "chemical" | "gap" | "training" | "lamination";
// The tab key is the route segment (/reports/{y}/{m}/{tab}) and never
// changes; only the label shown follows the language.
const TAB_KEYS: Tab[] = ["monthly", "daily", "rodent", "flycatcher", "chemical", "gap", "training", "lamination"];

const isTab = (v: string | undefined): v is Tab => !!v && (TAB_KEYS as string[]).includes(v);

export function ReportsPage({
  initialYear,
  initialMonth,
  initialTab,
}: {
  initialYear?: number;
  initialMonth?: number;
  initialTab?: string;
}) {
  const { mode, version } = useAppStore();
  const t = useT();
  const isDemo = mode === "demo";
  const now = new Date();
  const [tab, setTab] = useState<Tab>(isTab(initialTab) ? initialTab : "monthly");
  const [year, setYear] = useState(initialYear ?? now.getFullYear());
  const [month, setMonth] = useState(initialMonth !== undefined ? initialMonth : now.getMonth());

  // Deep links (e.g. the assistant sending you to /reports/2026/7/lamination,
  // or a fresh hash navigation while already on this page) update the route
  // params without remounting ReportsPage, so the initial useState above
  // only fires once — re-sync whenever the params actually change.
  useEffect(() => {
    if (initialYear !== undefined) setYear(initialYear);
    if (initialMonth !== undefined) setMonth(initialMonth);
    if (isTab(initialTab)) setTab(initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialYear, initialMonth, initialTab]);

  useMemo(() => {
    // Always Live here — see the matching comment in DashboardPage.tsx for
    // why passing the viewed mode's isDemo through would silently defeat
    // Demo Mode's own "Generate Demo Records" button.
    ensureRecordsGeneratedForMonth(year, month, { isDemo: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, isDemo, version]);

  const docs = documentRepository.getAll();
  const from = `${year}-${pad2(month + 1)}-01`;
  const to = `${year}-${pad2(month + 1)}-${pad2(daysInMonth(year, month))}`;
  const monthRecords = recordRepository.query({ fromDate: from, toDate: to, isDemo });

  return (
    <div className={isDemo ? "demo-watermark" : ""}>
      <div className="flex items-center justify-between mb-4 wrap gap-3">
        <h1 className="text-2xl">{t("rep.title")}</h1>
        <div className="flex gap-2">
          <select className="input input-sm" style={{ width: 90 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select className="input input-sm" style={{ width: 140 }} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((n, i) => (
              <option key={n} value={i}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="pill-tabs mb-4" style={{ flexWrap: "wrap" }}>
        {TAB_KEYS.map((key) => (
          <div key={key} className={`pill-tab ${tab === key ? "active" : ""}`} {...pressable(() => setTab(key), tab === key)}>
            {t(`rep.tab.${key}`)}
          </div>
        ))}
      </div>

      {/* The open report is what prints (utils/print.ts) — not the tabs and pickers above it. */}
      <div data-print-doc>
      {tab === "monthly" && <MonthlyReport records={monthRecords} year={year} month={month} />}
      {tab === "daily" && <DailyMonitoringReport isDemo={isDemo} year={year} month={month} />}
      {tab === "rodent" && <RodentTrendReport isDemo={isDemo} year={year} />}
      {tab === "flycatcher" && <FlyCatcherTrendReport isDemo={isDemo} year={year} month={month} />}
      {tab === "chemical" && <ChemicalUsageReport isDemo={isDemo} year={year} month={month} />}
      {tab === "gap" && <GapStatusReport isDemo={isDemo} />}
      {tab === "training" && <TrainingStatusReport isDemo={isDemo} />}
      {tab === "lamination" && <LaminationQcReport isDemo={isDemo} year={year} month={month} />}
      </div>

      {docs.length === 0 && null}
    </div>
  );
}

// Per-day view of the three lamination QC registers for the month: average
// hourly viscosity (F-QC-30), hot-room temperature range (F-QC-40.C),
// adhesive batches mixed (F-QC-32) and how many readings fell outside the
// printed acceptance band — the numbers a QC in-charge scans for at a glance.
function LaminationQcReport({ isDemo, year, month }: { isDemo: boolean; year: number; month: number }) {
  const dim = daysInMonth(year, month);
  const from = `${year}-${pad2(month + 1)}-01`;
  const to = `${year}-${pad2(month + 1)}-${pad2(dim)}`;
  const q = (documentId: string) => recordRepository.query({ documentId, isDemo, fromDate: from, toDate: to }) as RecordInstance<LogSheetData>[];
  const viscosity = new Map(q("qc-viscosity").map((r) => [r.dueDate, r]));
  const temperature = new Map(q("qc-temperature").map((r) => [r.dueDate, r]));
  const mixing = new Map(q("qc-adhesive-mixing").map((r) => [r.dueDate, r]));
  const filled = (r?: RecordInstance) => !!r && ["Submitted", "Pending Verification", "Verified", "In Progress"].includes(r.status);

  const days = Array.from({ length: dim }, (_, i) => `${year}-${pad2(month + 1)}-${pad2(i + 1)}`);
  const rows = days.map((d) => {
    const v = viscosity.get(d);
    const vals = (v?.data.rows ?? []).map((row) => row.viscosity).filter((x): x is number => typeof x === "number");
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const t = temperature.get(d);
    const temps = t ? Object.entries(t.data.rows?.[0] ?? {}).filter(([k, val]) => k.startsWith("t") && typeof val === "number").map(([, val]) => val as number) : [];
    const m = mixing.get(d);
    const outOfBand = (v ? logSheetOutOfBandCount("qc-viscosity", v.data) : 0) + (t ? logSheetOutOfBandCount("qc-temperature", t.data) : 0) + (m ? logSheetOutOfBandCount("qc-adhesive-mixing", m.data) : 0);
    return {
      date: d,
      viscosityAvg: avg,
      viscosityN: vals.length,
      tempMin: temps.length ? Math.min(...temps) : null,
      tempMax: temps.length ? Math.max(...temps) : null,
      batches: filled(m) ? (m?.data.rows ?? []).length : 0,
      outOfBand,
      status: [v, t, m].filter(filled).length,
    };
  });
  const chartRows = rows.filter((r) => r.viscosityAvg !== null);

  const exportCSV = () => {
    downloadCSV(
      `lamination-qc-${year}-${pad2(month + 1)}.csv`,
      toCSV(
        ["Date", "Avg viscosity (Sec.)", "Readings", "Hot room min (°C)", "Hot room max (°C)", "Adhesive batches", "Out-of-band readings"],
        rows.map((r) => [r.date, r.viscosityAvg?.toFixed(2) ?? "", r.viscosityN, r.tempMin ?? "", r.tempMax ?? "", r.batches, r.outOfBand])
      )
    );
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-lg">
          Lamination QC — {MONTH_NAMES[month]} {year}
        </h3>
        <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
          <FiDownload size={13} /> Export CSV
        </button>
      </div>
      <div className="card-pad">
        <p className="text-xs text-muted mb-2">Average of the hourly adhesive viscosity readings (F-QC-30) per day. Specification 20.0 ± 1.0 Sec.</p>
        {chartRows.length === 0 ? (
          <p className="text-muted text-sm mb-3">No viscosity records for this month yet.</p>
        ) : (
          <MiniBarChart labels={chartRows.map((r) => String(Number(r.date.slice(-2))))} values={chartRows.map((r) => Number(r.viscosityAvg!.toFixed(2)))} color="var(--color-primary)" />
        )}
      </div>
      <div className="doc-table" style={{ border: "none" }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Avg viscosity (Sec.)</th>
              <th>Readings</th>
              <th>Hot room (°C)</th>
              <th>Adhesive batches</th>
              <th>Out-of-band</th>
              <th>Registers filled</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date}>
                <td>{formatDisplayDate(r.date)}</td>
                <td>{r.viscosityAvg !== null ? r.viscosityAvg.toFixed(2) : "—"}</td>
                <td className="text-sm">{r.viscosityN || "—"}</td>
                <td className="text-sm">{r.tempMin !== null ? `${r.tempMin} – ${r.tempMax}` : "—"}</td>
                <td className="text-sm">{r.batches || "—"}</td>
                <td>{r.outOfBand > 0 ? <span className="text-danger font-semibold">{r.outOfBand}</span> : "0"}</td>
                <td className="text-sm">{r.status} / 3</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonthlyReport({ records, year, month }: { records: RecordInstance[]; year: number; month: number }) {
  const docs = documentRepository.getAll();
  const byDoc = docs
    .filter((d) => !d.isReferenceOnly)
    .map((d) => {
      const rs = records.filter((r) => r.documentId === d.id);
      return {
        doc: d,
        total: rs.length,
        completed: rs.filter((r) => ["Submitted", "Pending Verification", "Verified"].includes(r.status)).length,
        pending: rs.filter((r) => ["Scheduled", "Due", "In Progress"].includes(r.status)).length,
        verified: rs.filter((r) => r.status === "Verified").length,
      };
    });

  const exportCSV = () => {
    const csv = toCSV(
      ["Document", "Total", "Completed", "Pending", "Verified"],
      byDoc.map((r) => [r.doc.name, r.total, r.completed, r.pending, r.verified])
    );
    downloadCSV(`monthly-report-${year}-${pad2(month + 1)}.csv`, csv);
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-lg">
          {MONTH_NAMES[month]} {year}
        </h3>
        <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
          <FiDownload size={13} /> Export CSV
        </button>
      </div>
      <div className="doc-table" style={{ border: "none" }}>
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Total</th>
              <th>Completed</th>
              <th>Pending</th>
              <th>Verified</th>
            </tr>
          </thead>
          <tbody>
            {byDoc.map((r) => (
              <tr key={r.doc.id}>
                <td>{r.doc.name}</td>
                <td>{r.total}</td>
                <td>{r.completed}</td>
                <td>{r.pending}</td>
                <td>{r.verified}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DailyMonitoringReport({ isDemo, year, month }: { isDemo: boolean; year: number; month: number }) {
  const dim = daysInMonth(year, month);
  const records = recordRepository.query({ documentId: "daily-pest-monitoring", isDemo, fromDate: `${year}-${pad2(month + 1)}-01`, toDate: `${year}-${pad2(month + 1)}-${pad2(dim)}` }) as RecordInstance<DailyPestMonitoringData>[];
  const byDate = new Map(records.map((r) => [r.dueDate, r]));
  const checkpointDefs = masterRepository.get().checkpoints;

  const rodentCell = (r: RecordInstance<DailyPestMonitoringData> | undefined): string => {
    if (!r || r.data.isHoliday || r.data.checkpoints[7]?.value !== "Yes") return "";
    const catches = r.data.rodentCatches ?? [];
    if (catches.length === 0) return "Yes (details not recorded)";
    return `${totalRodents(catches)} — ${catches.map((c) => `${c.trapBoxNo || "?"} ${c.location}`).join("; ")}`;
  };
  const monthRodents = Array.from(byDate.values()).reduce((s, r) => s + (!r.data.isHoliday && r.data.checkpoints[7]?.value === "Yes" ? Math.max(totalRodents(r.data.rodentCatches), r.data.rodentCatches?.length ? 0 : 1) : 0), 0);

  const exportCSV = () => {
    const rows: (string | number)[][] = [];
    for (let d = 1; d <= dim; d++) {
      const dateISO = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      const r = byDate.get(dateISO);
      rows.push([
        d,
        r?.data.isHoliday ? "HOLIDAY" : r?.status ?? "—",
        r && !r.data.isHoliday ? countFindings(checkpointDefs, r.data.checkpoints) : "",
        rodentCell(r),
        r?.data.checker ?? "",
      ]);
    }
    downloadCSV(`daily-monitoring-${year}-${pad2(month + 1)}.csv`, toCSV(["Date", "Status", "Findings", "Rodents (box, location)", "Checker"], rows));
  };

  return (
    <>
    {/* The register itself, in the company's F/HR/17 three-page layout — the
        status / findings summary below is the app-side view of the same month. */}
    <DailyRegisterSheet year={year} month={month} isDemo={isDemo} />
    <div className="card mt-4">
      <div className="card-header">
        <h3 className="text-lg">Daily Monitoring Summary — status and findings for the month</h3>
        <div className="flex items-center gap-3">
          <span className={`text-sm ${monthRodents ? "text-danger font-semibold" : "text-muted"}`}>
            {monthRodents} rodent{monthRodents === 1 ? "" : "s"} this month
          </span>
          <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
            <FiDownload size={13} /> Export CSV
          </button>
        </div>
      </div>
      <div className="doc-table" style={{ border: "none" }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Findings</th>
              <th>Rodents (box · location)</th>
              <th>Checker</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
              const dateISO = `${year}-${pad2(month + 1)}-${pad2(d)}`;
              const r = byDate.get(dateISO);
              const findings = r && !r.data.isHoliday ? countFindings(checkpointDefs, r.data.checkpoints) : 0;
              const rodents = rodentCell(r);
              return (
                <tr key={d}>
                  <td>{d}</td>
                  <td>
                    {r?.data.isHoliday ? (
                      <span className="badge badge-Scheduled">HOLIDAY</span>
                    ) : r ? (
                      <span className={`badge badge-${r.status.replace(/\s/g, "")}`}>{r.status}</span>
                    ) : (
                      "—"
                    )}
                    {r?.isDemo && <DemoTag />}
                  </td>
                  <td>{findings > 0 ? <span className="text-danger font-semibold">{findings}</span> : "0"}</td>
                  <td className={`text-sm ${rodents ? "text-danger" : "text-faint"}`}>{rodents || "—"}</td>
                  <td className="text-sm">{r?.data.checker || "—"}</td>
                  <td className="text-sm">{r?.data.timeOfChecking || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}

// The company's own "Rodent Catch Report and Trend Analysis" ("trend analysis
// .pdf" / page 1 of "Kapila mam department reports .pdf"), reproduced in its
// own format by CatchTrendSheet: the two-line header, one row per year (Source
// | Unit | Target Pest | YEAR | JAN..DEC | Total), and the bar chart. Each
// month's figure comes from exactly one place (data/selectors.ts
// rodentTrendRows): the Daily Pest Control Monitoring Records where the
// register holds that month, the paper report's own figures before that.
// Below the sheet, the app-side detail the paper doesn't have room for — where
// the rodents were found and in which box.
// Exported: also rendered by Pest Control > Trend Analysis and the Rat / Mice
// service report page (src/pages/PestControlPages.tsx).
export function RodentTrendReport({ isDemo, year }: { isDemo: boolean; year: number }) {
  const stats = rodentStatsForYear(year, isDemo);
  const rows: TrendRow[] = rodentTrendRows(isDemo).map((r) => ({
    source: "Trapped on Glue boards in Roda-boxes",
    unit: "Number",
    targetPest: "Rodents",
    ...r,
  }));
  const exportCSV = () => {
    downloadCSV(
      `rodent-catch-report-and-trend-analysis.csv`,
      toCSV(
        ["Source", "Unit", "Target Pest", "YEAR", ...RODENT_REPORT_MONTHS, "Total"],
        rows.map((r) => [r.source, r.unit, r.targetPest, r.year, ...r.months.map((m) => m ?? ""), rowTotal(r.months) ?? ""])
      )
    );
  };

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg">Rodent Catch Report and Trend Analysis</h3>
          <div className="flex gap-2 no-print">
            <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
              <FiDownload size={13} /> Export CSV
            </button>
            <button className="btn btn-secondary btn-sm" onClick={(e) => printDocument(e.currentTarget.closest(".card"))}>
              <FiPrinter size={13} /> Print
            </button>
          </div>
        </div>
        <div className="card-pad">
          <CatchTrendSheet
            companyName={COMPANY.name}
            title="RODENT CATCH REPORT AND TREND ANALYSIS"
            rows={rows}
            chartYear={year}
            yAxisLabel="Number or Quantity Trapped"
            unitWord="rodent(s)"
            registerName="Daily Pest Control Monitoring Records (F/HR/17, check point 7)"
          />
        </div>
      </div>

      <div className="card mt-4 no-print">
        <div className="card-header">
          <h3 className="text-lg">Where they were found — {year}</h3>
        </div>
        <div className="card-pad">
          <p className="text-xs text-muted mb-3">
            From the digital register: ({stats.total} in total across {stats.catchDays} day{stats.catchDays === 1 ? "" : "s"}, from {stats.daysRecorded} recorded day
            {stats.daysRecorded === 1 ? "" : "s"}) — each catch with the trap box and location written on that day's record.
          </p>
          <div className="flex gap-4 wrap" style={{ alignItems: "flex-start" }}>
            <div className="doc-table" style={{ flex: "1 1 320px", minWidth: 0 }}>
              <table className="compact">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th style={{ textAlign: "center" }}>Rodents</th>
                    <th style={{ textAlign: "center" }}>Days</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byLocation.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-muted text-center text-sm" style={{ padding: 12 }}>
                        No rodents recorded in {year}.
                      </td>
                    </tr>
                  )}
                  {stats.byLocation.map((l) => (
                    <tr key={l.location}>
                      <td className="text-sm">{l.location}</td>
                      <td className="text-sm font-semibold" style={{ textAlign: "center" }}>
                        {l.rodents}
                      </td>
                      <td className="text-sm" style={{ textAlign: "center" }}>
                        {l.catchDays}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="doc-table" style={{ flex: "1 1 260px", minWidth: 0 }}>
              <table className="compact">
                <thead>
                  <tr>
                    <th>Trap box</th>
                    <th>Location</th>
                    <th style={{ textAlign: "center" }}>Rodents</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byBox.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-muted text-center text-sm" style={{ padding: 12 }}>
                        —
                      </td>
                    </tr>
                  )}
                  {stats.byBox.slice(0, 12).map((b) => (
                    <tr key={b.trapBoxNo}>
                      <td className="text-sm font-semibold">{b.trapBoxNo}</td>
                      <td className="text-sm">{b.location}</td>
                      <td className="text-sm" style={{ textAlign: "center" }}>
                        {b.rodents}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-faint mt-3">Paper figures transcribed from: {RODENT_HISTORY_SOURCE}.</p>
        </div>
      </div>
    </>
  );
}

// Fly Catcher Infestation — in the same format as the company's Rodent Catch
// Report and Trend Analysis (the layout the department already reads trends
// in), added up from the fortnightly F/HR/18 visits: one row per year, the bar
// chart, then every unit PC-01..PC-13 month by month below.
// Exported: also rendered by Pest Control > Trend Analysis (src/pages/PestControlPages.tsx).
export function FlyCatcherTrendReport({ isDemo, year, month }: { isDemo: boolean; year: number; month: number }) {
  const stats = flyStatsForYear(year, isDemo);
  const rows: TrendRow[] = flyTrendRows(isDemo).map((r) => ({
    source: "Caught on Glue boards of Fly catchers (PC-01 to PC-13)",
    unit: "Number",
    targetPest: "Flies",
    ...r,
  }));
  const monthUnits = stats.byUnit.map((u) => ({ label: u.pcId, value: u.months[month] }));
  const monthTotal = stats.months[month];
  const exportCSV = () => {
    const header = ["Source", "Unit", "Target Pest", "YEAR", ...RODENT_REPORT_MONTHS, "Total"];
    const csvRows: (string | number)[][] = [
      ...rows.map((r) => [r.source, r.unit, r.targetPest, r.year, ...r.months.map((m) => m ?? ""), rowTotal(r.months) ?? ""]),
      ...stats.byUnit.map((u) => [`${u.pcId} — ${u.location}`, "Number", "Flies", year, ...u.months, u.total]),
    ];
    downloadCSV(`fly-catch-report-and-trend-analysis-${year}.csv`, toCSV(header, csvRows));
  };
  const busiest = stats.byUnit.slice().sort((a, b) => b.total - a.total)[0];

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg">Fly Catch Report and Trend Analysis</h3>
          <div className="flex gap-2 no-print">
            <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
              <FiDownload size={13} /> Export CSV
            </button>
            <button className="btn btn-secondary btn-sm" onClick={(e) => printDocument(e.currentTarget.closest(".card"))}>
              <FiPrinter size={13} /> Print
            </button>
          </div>
        </div>
        <div className="card-pad">
          <CatchTrendSheet
            companyName={COMPANY.name}
            title="FLY CATCH REPORT AND TREND ANALYSIS"
            rows={rows}
            chartYear={year}
            yAxisLabel="Number or Quantity Trapped"
            unitWord="flies"
            registerName="Fortnightly Fly Catcher Inspection & Cleaning Records (F/HR/18)"
            footnote="Laid out as the company's Rodent Catch Report and Trend Analysis."
          />
        </div>
      </div>

      <div className="card mt-4 no-print">
        <div className="card-header">
          <h3 className="text-lg">Per unit — {year}</h3>
        </div>
        <div className="card-pad">
          <p className="text-xs text-muted mb-2">
            {stats.total} flies caught in {year} across {stats.visits} inspection{stats.visits === 1 ? "" : "s"}
            {busiest && busiest.total > 0 ? `; busiest unit ${busiest.pcId} (${busiest.location}) with ${busiest.total}` : ""}. Counts are the approximate per-board
            count written at each fortnightly cleaning (F/HR/18), added up per month.
          </p>
          <div className="doc-table">
            <table className="compact fly-units">
              <thead>
                <tr>
                  <th>PC ID</th>
                  <th>Location</th>
                  {RODENT_REPORT_MONTHS.map((m) => (
                    <th key={m} style={{ textAlign: "center" }}>
                      {m}
                    </th>
                  ))}
                  <th style={{ textAlign: "center" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.byUnit.map((u) => (
                  <tr key={u.pcId}>
                    <td className="text-sm font-semibold">{u.pcId}</td>
                    <td className="text-sm">{u.location}</td>
                    {u.months.map((n, i) => (
                      <td key={i} className={`text-sm ${n ? "" : "text-faint"}`} style={{ textAlign: "center" }}>
                        {n}
                      </td>
                    ))}
                    <td className="text-sm font-semibold" style={{ textAlign: "center" }}>
                      {u.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className="text-sm font-semibold mt-4 mb-2">
            {MONTH_NAMES[month]} {year} — flies per unit
          </h4>
          {monthTotal === 0 ? (
            <p className="text-muted text-sm">No flies counted in {MONTH_NAMES[month]} {year} yet (no inspection recorded, or every board was clean).</p>
          ) : (
            <MiniBarChart labels={monthUnits.map((u) => u.label)} values={monthUnits.map((u) => u.value)} color="var(--color-warning)" />
          )}
          <p className="text-xs text-faint mt-3">Source register: {FLY_REPORT_SOURCE}.</p>
        </div>
      </div>
    </>
  );
}

function ChemicalUsageReport({ isDemo, year, month }: { isDemo: boolean; year: number; month: number }) {
  const dim = daysInMonth(year, month);
  const records = recordRepository.query({
    documentId: undefined,
    isDemo,
    fromDate: `${year}-${pad2(month + 1)}-01`,
    toDate: `${year}-${pad2(month + 1)}-${pad2(dim)}`,
  })
    .filter((r) => documentRepository.getById(r.documentId)?.kind === "service-report") as RecordInstance<ServiceReportData>[];

  const byChemical = new Map<string, { count: number; sample: string }>();
  for (const r of records) {
    for (const l of r.data.lines) {
      if (!l.materialName.trim()) continue;
      const entry = byChemical.get(l.materialName) ?? { count: 0, sample: l.qtyUsed };
      entry.count += 1;
      byChemical.set(l.materialName, entry);
    }
  }

  const rows = Array.from(byChemical.entries());
  const exportCSV = () => {
    downloadCSV(
      `chemical-usage-${year}-${pad2(month + 1)}.csv`,
      toCSV(["Chemical", "Applications Logged", "Sample Quantity"], rows.map(([name, v]) => [name, v.count, v.sample]))
    );
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-lg">
          Chemical Usage — {MONTH_NAMES[month]} {year}
        </h3>
        <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
          <FiDownload size={13} /> Export CSV
        </button>
      </div>
      <div className="doc-table" style={{ border: "none" }}>
        <table>
          <thead>
            <tr>
              <th>Chemical / Material</th>
              <th>Applications Logged</th>
              <th>Sample Quantity</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="text-muted text-center" style={{ padding: 16 }}>
                  No chemical usage logged for this month yet.
                </td>
              </tr>
            )}
            {rows.map(([name, v]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{v.count}</td>
                <td className="text-sm">{v.sample || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GapStatusReport({ isDemo }: { isDemo: boolean }) {
  const records = recordRepository.query({ documentId: "gap-inspection", isDemo }) as RecordInstance<GapInspectionData>[];
  const findings = records.flatMap((r) => r.data.findings.map((f) => ({ ...f, inspectionDate: r.data.inspectionDate, isDemo: r.isDemo })));
  const counts = {
    Open: findings.filter((f) => f.status === "Open").length,
    Overdue: findings.filter((f) => f.status === "Overdue").length,
    Closed: findings.filter((f) => f.status === "Closed").length,
    Verified: findings.filter((f) => f.status === "Verified").length,
  };
  const complaints = (recordRepository.query({ documentId: COMPLAINT_DOC_ID, isDemo }) as RecordInstance<ComplaintChecklistData>[])
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-lg">CAPA Status — External: Customer Complaints (F/MKT/05)</h3>
      </div>
      <div className="doc-table" style={{ border: "none", borderBottom: "1px solid var(--color-border)" }}>
        <table>
          <thead>
            <tr>
              <th>Complaint No.</th>
              <th>Customer</th>
              <th>Received</th>
              <th>Activities done</th>
              <th>Prepared by</th>
              <th>Approved by</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {complaints.length === 0 && (
              <tr>
                <td colSpan={7} className="text-muted text-center" style={{ padding: 16 }}>
                  No customer complaints logged yet.
                </td>
              </tr>
            )}
            {complaints.map((r) => {
              const s = summarise(r.data);
              return (
                <tr key={r.id}>
                  <td className="font-semibold">
                    {r.data.complaintNo || "—"} {r.isDemo && <DemoTag />}
                  </td>
                  <td className="text-sm">{r.data.customerName || "—"}</td>
                  <td className="text-sm">{r.data.complaintReceivedDate ? formatDisplayDate(r.data.complaintReceivedDate) : "—"}</td>
                  <td className="text-sm">
                    {s.done} / {s.total}
                    {s.notRequired ? ` (+${s.notRequired} n/r)` : ""}
                  </td>
                  <td className="text-sm notranslate" translate="no">{r.data.preparedBy.name || "—"}</td>
                  <td className="text-sm">{r.data.approvedBy.name || "—"}</td>
                  <td>
                    <span className={`badge badge-${r.status.replace(/\s/g, "")}`}>{r.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card-header">
        <h3 className="text-lg">CAPA Status — Internal: Inspection Findings</h3>
      </div>
      <div className="card-pad">
        <div className="flex gap-3 wrap mb-4">
          {Object.entries(counts).map(([k, v]) => (
            <div key={k} className="stat-tile" style={{ minWidth: 100 }}>
              <div className="stat-value">{v}</div>
              <div className="stat-label">{k}</div>
            </div>
          ))}
        </div>
        <div className="doc-table" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Inspection Date</th>
                <th>Source</th>
                <th>Finding</th>
                <th>Target Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.id}>
                  <td>{formatDisplayDate(f.inspectionDate)}</td>
                  <td className="text-sm">{f.source}</td>
                  <td className="text-sm">
                    {f.findingOfInspection} {f.isDemo && <DemoTag />}
                  </td>
                  <td>{f.targetDate ? formatDisplayDate(f.targetDate) : "—"}</td>
                  <td>
                    <span className={`badge badge-${f.status === "Overdue" ? "Overdue" : f.status === "Open" ? "Due" : "Verified"}`}>{f.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TrainingStatusReport({ isDemo }: { isDemo: boolean }) {
  const records = recordRepository.query({ documentId: "training-record", isDemo }) as RecordInstance<TrainingRecordData>[];
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-lg">Training Status</h3>
      </div>
      <div className="doc-table" style={{ border: "none" }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Attendees</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted text-center" style={{ padding: 16 }}>
                  No training records yet.
                </td>
              </tr>
            )}
            {records.map((r) => (
              <tr key={r.id}>
                <td>{formatDisplayDate(r.data.trainingDate)}</td>
                <td>
                  {r.data.trainingType || "—"} {r.isDemo && <DemoTag />}
                </td>
                <td>{r.data.attendees.filter((a) => a.attended).length}</td>
                <td>
                  <span className={`badge badge-${r.status.replace(/\s/g, "")}`}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
