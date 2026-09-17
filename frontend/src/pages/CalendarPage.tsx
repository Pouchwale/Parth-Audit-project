import React, { useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { pressable } from "../utils/pressable";
import { recordRepository } from "../data/repositories/recordRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { ensureRecordsGeneratedForMonth } from "../engine/recordGenerator";
import { dayInfo, weeklyOffDay, WEEKDAY_LONG } from "../engine/holidays";
import { daysInMonth, MONTH_NAMES, pad2, todayISO, WEEKDAY_NAMES } from "../utils/date";
import { useT } from "../i18n";

export function CalendarPage({ year, month }: { year?: number; month?: number }) {
  const t = useT();
  const now = new Date();
  const [y, setY] = useState(year ?? now.getFullYear());
  const [m, setM] = useState(month !== undefined ? month : now.getMonth());
  const { mode, version, bump } = useAppStore();
  const { navigate, back } = useRouter();
  const isDemo = mode === "demo";
  const today = todayISO();

  useEffect(() => {
    // Always Live here — see the matching comment in DashboardPage.tsx for
    // why passing the viewed mode's isDemo through would silently defeat
    // Demo Mode's own "Generate Demo Records" button.
    // Everything is redrawn only when the month actually gained records.
    if (ensureRecordsGeneratedForMonth(y, m, { isDemo: false }).length > 0) bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y, m, isDemo]);

  const dim = daysInMonth(y, m);
  const firstWeekday = new Date(y, m, 1).getDay();

  const byDate = useMemo(() => {
    const from = `${y}-${pad2(m + 1)}-01`;
    const to = `${y}-${pad2(m + 1)}-${pad2(dim)}`;
    const records = recordRepository.query({ fromDate: from, toDate: to, isDemo });
    const map = new Map<string, typeof records>();
    for (const r of records) {
      const arr = map.get(r.dueDate) ?? [];
      arr.push(r);
      map.set(r.dueDate, arr);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y, m, isDemo, version, dim]);

  const goPrev = () => {
    if (m === 0) {
      setY(y - 1);
      setM(11);
    } else setM(m - 1);
  };
  const goNext = () => {
    if (m === 11) {
      setY(y + 1);
      setM(0);
    } else setM(m + 1);
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  const master = masterRepository.get();
  const offDay = WEEKDAY_LONG[weeklyOffDay(master)];

  return (
    <div>
      {/* Back to the page the calendar was opened from — the Dashboard when it
          was opened straight from its address (store/router.tsx, REQUIREMENTS §48). */}
      <button className="btn btn-ghost btn-sm mb-3 no-print" data-action="back" onClick={() => back()}>
        <FiArrowLeft size={13} /> {t("common.back")}
      </button>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl mb-1">{t("cal.title")}</h1>
          <p className="text-muted">
            Select a date to view records due, completed, pending or overdue. {offDay}s are the weekly off; festival holidays and adjustment (working) days follow the
            Gujarat Print Pack Leave Calendar 2026 — anything scheduled on a closed day is due the next working day.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input input-sm" style={{ width: 90 }} value={y} onChange={(e) => setY(Number(e.target.value))}>
            {[y - 1, y, y + 1].map((yy) => (
              <option key={yy} value={yy}>
                {yy}
              </option>
            ))}
          </select>
          <select className="input input-sm" style={{ width: 140 }} value={m} onChange={(e) => setM(Number(e.target.value))}>
            {MONTH_NAMES.map((name, idx) => (
              <option key={name} value={idx}>
                {name}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary btn-sm btn-icon" onClick={goPrev}>
            <FiChevronLeft size={15} />
          </button>
          <button className="btn btn-secondary btn-sm btn-icon" onClick={goNext}>
            <FiChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="calendar-grid mb-1">
        {WEEKDAY_NAMES.map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} className="calendar-cell empty" />;
          const dateISO = `${y}-${pad2(m + 1)}-${pad2(d)}`;
          const records = byDate.get(dateISO) ?? [];
          const completed = records.filter((r) => ["Submitted", "Pending Verification", "Verified"].includes(r.status));
          const overdue = records.filter((r) => dateISO < today && ["Scheduled", "Due", "In Progress"].includes(r.status));
          const pending = records.filter((r) => dateISO >= today && ["Scheduled", "Due", "In Progress"].includes(r.status));
          const isToday = dateISO === today;
          const day = dayInfo(dateISO, master);
          return (
            <div
              key={dateISO}
              className={`calendar-cell${isToday ? " today" : ""}${day.kind !== "working" ? ` ${day.kind}` : ""}`}
              {...pressable(() => navigate(`/day/${dateISO}`))}
              title={day.kind !== "working" ? day.label : undefined}
            >
              <div className="cal-date">{d}</div>
              <div className="flex flex-col gap-1">
                {day.kind !== "working" && <span className={`cal-chip cal-day cal-day-${day.kind}`}>{day.short}</span>}
                {completed.length > 0 && (
                  <span className="cal-chip" style={{ background: "var(--color-success-bg)", color: "var(--color-success)" }}>
                    {completed.length} Completed
                  </span>
                )}
                {overdue.length > 0 && (
                  <span className="cal-chip" style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)" }}>
                    {overdue.length} Overdue
                  </span>
                )}
                {pending.length > 0 && (
                  <span className="cal-chip" style={{ background: "var(--color-info-bg)", color: "var(--color-info)" }}>
                    {pending.length} {isToday || dateISO < today ? "Due" : "Scheduled"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
