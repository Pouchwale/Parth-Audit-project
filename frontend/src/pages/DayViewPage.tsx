import React, { useEffect } from "react";
import { FiArrowLeft, FiArrowRight, FiZap } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { ensureRecordsGeneratedForMonth } from "../engine/recordGenerator";
import { dayInfo } from "../engine/holidays";
import { routeForRecord } from "../engine/reminders";
import { formatDisplayDate, fromISODate, todayISO } from "../utils/date";
import { StatusBadge } from "../components/common/StatusBadge";
import { DemoTag } from "../components/common/DemoTag";
import { documentTextIn } from "../i18n/documentText";

export function DayViewPage({ date }: { date?: string }) {
  const dateISO = date ?? todayISO();
  const { mode, version, lang } = useAppStore();
  const { navigate, backTo } = useRouter();
  const isDemo = mode === "demo";
  const d = fromISODate(dateISO);

  useEffect(() => {
    // Always Live here — see the matching comment in DashboardPage.tsx for
    // why passing the viewed mode's isDemo through would silently defeat
    // Demo Mode's own "Generate Demo Records" button.
    ensureRecordsGeneratedForMonth(d.getFullYear(), d.getMonth(), { isDemo: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateISO, isDemo]);

  const records = recordRepository.query({ dueDate: dateISO, isDemo });
  const docs = documentRepository.getAll();
  const today = todayISO();
  const overdue = dateISO < today;
  const day = dayInfo(dateISO, masterRepository.get());

  return (
    <div>
      {/* A real step back when the day was opened from the calendar — the month
          you were looking at, and the calendar's own Back still leads to where
          you were before it — and the calendar itself otherwise. */}
      <button className="btn btn-ghost btn-sm mb-3" onClick={() => backTo("/calendar")}>
        <FiArrowLeft size={13} /> Back to Calendar
      </button>
      <h1 className="text-2xl mb-1">
        {formatDisplayDate(dateISO)} <span className="text-muted text-lg">· {day.weekday}</span>
      </h1>
      <p className="text-muted mb-4">
        {records.length} record(s) due on this date.
        {dateISO === today && <span className="badge badge-Due" style={{ marginLeft: 8 }}>Today</span>}
      </p>
      {day.kind !== "working" && (
        <div
          className={`card mb-4 day-banner day-banner-${day.kind}`}
          style={{
            borderColor: day.isHoliday ? "var(--color-warning)" : "var(--color-success)",
            background: day.isHoliday ? "var(--color-warning-bg)" : "var(--color-success-bg)",
          }}
        >
          <div className="card-pad text-sm">
            <strong>{day.label}.</strong>{" "}
            {day.kind === "adjustment"
              ? "Everyone reports to the company on this day (Gujarat Print Pack Leave Calendar 2026), so records are due exactly as on any working day."
              : "The plant is closed — the Daily Pest Control Monitoring Record is pre-marked as a holiday, no other daily register is expected, and anything scheduled for this date was moved to the next working day."}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="text-lg">Records Due</h3>
        </div>
        <div className="doc-table" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Format</th>
                <th>Status</th>
                <th>Responsible</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted text-center" style={{ padding: 24 }}>
                    No records due on this date.
                  </td>
                </tr>
              )}
              {records.map((r) => {
                const doc = docs.find((dd) => dd.id === r.documentId);
                const isOverdue = overdue && ["Scheduled", "Due", "In Progress"].includes(r.status);
                const route = routeForRecord(doc, r.id);
                const prepared = !!r.prepared && ["Scheduled", "Due", "In Progress"].includes(r.status);
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="font-semibold">
                        {documentTextIn(doc?.name, lang)} {r.isDemo && <DemoTag />}
                      </div>
                      <div className="text-faint text-xs">
                        {doc?.module}
                        {prepared && (
                          <span className="prepared-chip" style={{ marginLeft: 6 }}>
                            <FiZap size={9} /> Prepared
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-sm">{doc?.formatNo}</td>
                    <td>
                      <StatusBadge status={r.status} overdue={isOverdue} />
                    </td>
                    <td className="text-sm notranslate" translate="no">{r.responsibleUser ?? r.submittedBy ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-primary btn-sm" onClick={() => navigate(route)}>
                        Open <FiArrowRight size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
