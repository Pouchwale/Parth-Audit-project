import React, { useState } from "react";
import { FiPlayCircle, FiTrash2, FiCalendar, FiAlertTriangle } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { generateDemoRecordsForMonth, clearAllDemoData, demoDailySheetWindow, DAILY_SHEET_MONTHS_BACK } from "../data/demoGenerator";
import { recordRepository } from "../data/repositories/recordRepository";
import { MONTH_NAMES } from "../utils/date";
import { useT } from "../i18n";

export function DemoModePage() {
  const t = useT();
  const { mode, setMode, bump } = useAppStore();
  const { navigate } = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [lastResult, setLastResult] = useState<number | null>(null);

  const demoCount = recordRepository.query({ isDemo: true }).length;
  // Which months got their daily log sheets when the year was filled (REQUIREMENTS §79).
  const sheets = demoDailySheetWindow();
  const monthsBack = ["", "one", "two", "three", "four", "five", "six"][DAILY_SHEET_MONTHS_BACK] ?? String(DAILY_SHEET_MONTHS_BACK);

  const handleGenerate = () => {
    if (mode !== "demo") setMode("demo");
    const created = generateDemoRecordsForMonth(year, month);
    setLastResult(created);
    bump();
  };

  const handleClear = () => {
    clearAllDemoData();
    setLastResult(null);
    bump();
  };

  return (
    <div>
      <h1 className="text-2xl mb-1">{t("demo.title")}</h1>
      <p className="text-muted mb-6">
        Generate realistic synthetic records for development, testing and management demonstrations. Every generated
        record is stamped <strong>isDemo = true</strong> and rendered with a DEMO / SYNTHETIC watermark — it is never
        mixed with or mistaken for real company records (section 38, Data Integrity).
      </p>
      {/* The year's daily log sheets were drawn for the recent months only, so the browser is not filled (REQUIREMENTS §79). */}
      {sheets.leftOut > 0 && (
        <div className="card mb-6 no-print" role="status" data-section="demo-room" style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}>
          <div className="card-pad text-sm">
            <FiAlertTriangle size={13} style={{ verticalAlign: -1 }} /> The daily log sheets of {sheets.leftOut} earlier month{sheets.leftOut === 1 ? "" : "s"} of the demo year were not
            generated: Demo Mode draws them for {MONTH_NAMES[sheets.from]} to {MONTH_NAMES[sheets.to]} only —{" "}
            {sheets.shortOfRoom
              ? "as many months before the month in hand as this browser, nearly as full as it is allowed to be, has room for"
              : `the month in hand and the ${monthsBack} months before it`}{" "}
            — not the whole year, so the browser is not filled (a year of them is most of the room a browser allows). Every month has its pest register, its service visits and its monthly
            sheets; any other month can be made below{sheets.shortOfRoom ? " once the demo data is cleared and generated again" : ""}.
          </div>
        </div>
      )}

      <div className="card mb-6" style={{ borderColor: mode === "demo" ? "var(--color-demo)" : undefined }}>
        <div className="card-header">
          <h3 className="text-lg">Generate Demo Month</h3>
          {mode === "demo" && <span className="demo-tag">DEMO MODE ACTIVE</span>}
        </div>
        <div className="card-pad">
          <div className="flex gap-3 wrap items-end">
            <div className="field" style={{ width: 140 }}>
              <label>Year</label>
              <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {[year - 1, year, year + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ width: 180 }}>
              <label>Month</label>
              <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTH_NAMES.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleGenerate}>
              <FiPlayCircle size={15} /> Generate Demo Records
            </button>
          </div>

          {lastResult !== null && (
            <div className="mt-4 text-sm text-success">
              Created {lastResult} new demo record(s) for {MONTH_NAMES[month]} {year}. Records already generated for
              that month were left untouched (idempotent generator).
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => navigate("/calendar")}>
              <FiCalendar size={13} /> View in Calendar
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate("/reports")}>
              View in Reports
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="text-lg">Demo Data</h3>
        </div>
        <div className="card-pad">
          <p className="text-sm mb-3">
            {demoCount} demo record(s) currently stored (separate from live data; toggle <strong>Live Mode</strong> in the
            top bar to hide them everywhere).
          </p>
          <button className="btn btn-danger btn-sm" onClick={handleClear} disabled={demoCount === 0}>
            <FiTrash2 size={13} /> Clear All Demo Data
          </button>
          <div className="text-xs text-faint mt-2">
            <FiAlertTriangle size={11} style={{ verticalAlign: -1 }} /> This permanently deletes every record with
            isDemo = true. Live records are never affected.
          </div>
        </div>
      </div>
    </div>
  );
}
