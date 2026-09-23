import React, { useEffect, useMemo, useState } from "react";
import { FiCalendar, FiCheckCircle, FiClock, FiAlertTriangle, FiBookOpen, FiArrowRight, FiZap, FiTrash2, FiX } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { useAuth } from "../store/AuthContext";
import { useRouter } from "../store/router";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { ensureRecordsGeneratedForMonth } from "../engine/recordGenerator";
import { prepareDueRecords } from "../engine/assistantPrepare";
import { routeForRecord } from "../engine/reminders";
import { computeBriefing, briefingHeadline } from "../engine/assistantBriefing";
import { findPreLaunchNoise, purgePreLaunchNoise } from "../engine/backlogCleanup";
import { ensureDemoRecordsGeneratedForYear } from "../data/demoGenerator";
import { openCorrectiveActionsCount, refreshGapFindingStatuses, moduleSummaries, rodentsInMonth } from "../data/selectors";
import { masterRepository } from "../data/repositories/masterRepository";
import { dayInfo, upcomingHolidays, weeklyOffDay, WEEKDAY_LONG } from "../engine/holidays";
import { useT } from "../i18n";
import { todayISO, formatDisplayDate, MONTH_NAMES } from "../utils/date";
import { StatusBadge } from "../components/common/StatusBadge";
import { DemoTag } from "../components/common/DemoTag";
import { openBriefing } from "../components/common/AssistantBriefingPopup";
import { documentTextIn } from "../i18n/documentText";

function StatTile({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: React.ComponentType<{ size?: number }>;
  value: number | string;
  label: string;
  tone?: string;
}) {
  return (
    <div className="stat-tile">
      <div className="flex items-center justify-between">
        <Icon size={17} />
      </div>
      <div className="stat-value" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function DashboardPage() {
  const { mode, version, bump, lang } = useAppStore();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const t = useT();
  const isDemo = mode === "demo";
  const today = todayISO();
  const now = new Date();

  useEffect(() => {
    // Whenever the dashboard is opened (e.g. the app was left open
    // overnight and it's now a new day), let the assistant prepare anything
    // that has fallen due since — Live records only.
    if (prepareDueRecords().length > 0) bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  useEffect(() => {
    // Live records: always generate the current month's due-date shells here
    // (blank, waiting for a real person to fill them in) regardless of which
    // mode is toggled, so a Live user always sees their real obligations.
    // This must stay isDemo:false — passing the current mode's isDemo through
    // would silently pre-fill every date with a BLANK shell the moment you
    // view this page in Demo mode, which would then block the realistic demo
    // generator below from ever running for that same period (both go
    // through the same per-period uniqueness check).
    ensureRecordsGeneratedForMonth(now.getFullYear(), now.getMonth(), { isDemo: false });
    // Demo records: only while Demo Mode is actually active, fill in a full
    // year of realistic-looking synthetic data (randomized checkers, times,
    // statuses — see demoGenerator.ts) so switching into Demo Mode and
    // opening the Dashboard is immediately ready to browse/demo, without a
    // separate trip to the Demo Mode page first. Idempotent, and always
    // isDemo:true — clearly watermarked everywhere and fully isolated from
    // Live data (see DemoTag / the "DEMO / SYNTHETIC DATA" banner).
    if (isDemo) ensureDemoRecordsGeneratedForYear(now.getFullYear());
    refreshGapFindingStatuses(isDemo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, version]);

  const stats = useMemo(() => {
    const allToday = recordRepository.query({ dueDate: today, isDemo });
    const completedToday = allToday.filter((r) =>
      ["Submitted", "Pending Verification", "Verified"].includes(r.status)
    );
    const pendingVerification = recordRepository.query({ isDemo }).filter((r) => r.status === "Pending Verification");
    const month = recordRepository.monthStats(now.getFullYear(), now.getMonth(), { isDemo });
    return {
      dueToday: allToday.length,
      completedToday: completedToday.length,
      pendingVerification: pendingVerification.length,
      openCorrective: openCorrectiveActionsCount(isDemo),
      month,
      rodentsThisMonth: rodentsInMonth(now.getFullYear(), now.getMonth(), isDemo),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, version, today]);

  const dueTodayRecords = recordRepository.query({ dueDate: today, isDemo });
  const docs = documentRepository.getAll();
  const modules = moduleSummaries();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const briefing = useMemo(() => computeBriefing(user?.name), [version, user?.name]);

  // One-time noise banner: blank/untouched record shells the frequency
  // engine generated for dates before this system's launch-date floor
  // existed (see engine/backlogCleanup.ts) — e.g. from browsing the Calendar
  // back through old months during testing. Dismissible without deleting
  // anything; re-checked each time the Dashboard mounts.
  const [noiseDismissed, setNoiseDismissed] = useState(false);
  const [purged, setPurged] = useState<number | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const noiseCount = useMemo(() => (isDemo ? 0 : findPreLaunchNoise().length), [isDemo, version]);
  const liveStartDate = settingsRepository.get().liveStartDate;
  const master = masterRepository.get();
  const todayInfo = dayInfo(today, master);
  const nextHolidays = upcomingHolidays(today, master, 2, 120);

  return (
    <div className={isDemo ? "demo-watermark" : ""}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl">{t("dash.title")}</h1>
          <p className="text-muted mt-1">
            {formatDisplayDate(today)} · {todayInfo.weekday}
            {todayInfo.kind !== "working" && (
              <span className={`badge ${todayInfo.isHoliday ? "badge-Scheduled" : "badge-Verified"}`} style={{ marginLeft: 6 }} title={todayInfo.label}>
                {todayInfo.short}
              </span>
            )}
          </p>
          {nextHolidays.length > 0 && (
            <p className="text-xs text-faint mt-1">
              {t("dash.nextOnLeaveCalendar")}{" "}
              {nextHolidays
                .map((h) => `${h.kind === "adjustment" ? t("dash.adjustmentWorkingDay") : h.name} ${formatDisplayDate(h.date)} (${h.weekday.slice(0, 3)})`)
                .join(" · ")}{" "}
              · {t("dash.weeklyOffEvery")} {WEEKDAY_LONG[weeklyOffDay(master)]}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 wrap" style={{ justifyContent: "flex-end" }}>
          {/* The language choice lives in the top bar, reachable from every screen. */}
          <button className="btn btn-primary" onClick={() => navigate("/calendar")}>
            <FiCalendar size={15} /> {t("dash.openCalendar")}
          </button>
        </div>
      </div>

      {!isDemo && !noiseDismissed && (noiseCount > 0 || purged !== null) && (
        <div className="card mb-4 no-print" style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}>
          <div className="card-pad flex items-center justify-between gap-3 wrap">
            <div className="text-sm">
              {purged !== null ? (
                <>
                  <strong>Cleaned up.</strong> Removed {purged} blank, untouched record{purged === 1 ? "" : "s"} that had been
                  generated for dates before {liveStartDate ? formatDisplayDate(liveStartDate) : "today"} (e.g. from browsing
                  old calendar months) — nothing anyone had opened, edited or submitted was touched.
                </>
              ) : (
                <>
                  <FiAlertTriangle size={13} style={{ verticalAlign: -2 }} /> Found <strong>{noiseCount}</strong> blank record
                  {noiseCount === 1 ? "" : "s"} generated for dates before {liveStartDate ? formatDisplayDate(liveStartDate) : "today"}{" "}
                  (from browsing old calendar months) that nobody has ever opened. Safe to remove — anything edited, submitted or
                  verified is never touched by this.
                </>
              )}
            </div>
            <div className="flex gap-2" style={{ flexShrink: 0 }}>
              {purged === null && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setPurged(purgePreLaunchNoise());
                    bump();
                  }}
                >
                  <FiTrash2 size={12} /> Clean up {noiseCount}
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setNoiseDismissed(true)} aria-label="Dismiss">
                <FiX size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {!isDemo && (
        <div className="card mb-6" style={{ borderLeft: "4px solid var(--color-accent)" }}>
          <div className="card-pad flex items-center justify-between gap-4 wrap">
            <div className="flex items-center gap-3">
              <div className="briefing-avatar" style={{ background: "var(--color-primary-light)", color: "var(--color-primary)" }}>
                <FiZap size={17} />
              </div>
              <div>
                <div className="font-semibold">
                  {briefing.greeting} {t("dash.heresWhereTodayStands")}
                </div>
                <div className="text-sm text-muted mt-1">{briefingHeadline(briefing)}</div>
              </div>
            </div>
            <div className="flex gap-2">
              {briefing.ready.length > 0 && (
                <button className="btn btn-secondary btn-sm" onClick={() => navigate(briefing.ready[0].route)}>
                  {t("dash.reviewFirstRecord")} <FiArrowRight size={12} />
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={openBriefing}>
                <FiZap size={12} /> {t("dash.openBriefing")}
              </button>
            </div>
          </div>
        </div>
      )}

      <h3 className="text-sm uppercase text-muted mb-2">{t("dash.today")}</h3>
      <div className="flex gap-3 wrap mb-6">
        <StatTile icon={FiClock} value={stats.dueToday} label={t("dash.dueToday")} />
        <StatTile icon={FiCheckCircle} value={stats.completedToday} label={t("dash.completedToday")} tone="var(--color-success)" />
        <StatTile icon={FiAlertTriangle} value={stats.pendingVerification} label={t("dash.pendingVerification")} tone="var(--color-warning)" />
        <StatTile icon={FiAlertTriangle} value={stats.openCorrective} label={t("dash.openCorrective")} tone="var(--color-danger)" />
      </div>

      <h3 className="text-sm uppercase text-muted mb-2">
        {t("dash.thisMonth")} — {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
      </h3>
      <div className="flex gap-3 wrap mb-6">
        <StatTile icon={FiBookOpen} value={stats.month.total} label={t("dash.totalRecords")} />
        <StatTile icon={FiCheckCircle} value={stats.month.completed} label={t("dash.completedRecords")} tone="var(--color-success)" />
        <StatTile icon={FiClock} value={stats.month.pending} label={t("dash.pendingRecords")} tone="var(--color-info)" />
        <StatTile icon={FiAlertTriangle} value={stats.month.overdue} label={t("dash.overdueRecords")} tone="var(--color-danger)" />
        <StatTile icon={FiAlertTriangle} value={stats.rodentsThisMonth} label={t("dash.rodentsThisMonth")} tone={stats.rodentsThisMonth ? "var(--color-danger)" : "var(--color-success)"} />
      </div>

      <div className="flex gap-4 wrap" style={{ alignItems: "flex-start" }}>
        {/* minWidth: 0 overrides flex items' default min-width:auto — without
            it, the table's own content width can force this card (and the
            whole row, and the page) wider than the viewport instead of the
            table scrolling internally within its flex-basis. */}
        <div className="card" style={{ flex: "2 1 420px", minWidth: 0 }}>
          <div className="card-header">
            <h3 className="text-lg">{t("dash.recordsDueToday")}</h3>
            <span className="text-muted text-sm">
              {dueTodayRecords.length} {t("common.records")}
            </span>
          </div>
          <div className="doc-table" style={{ border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>{t("common.document")}</th>
                  <th>{t("common.status")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dueTodayRecords.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-muted text-center" style={{ padding: 20 }}>
                      {t("dash.noRecordsDueToday")}
                    </td>
                  </tr>
                )}
                {dueTodayRecords.map((r) => {
                  const doc = docs.find((d) => d.id === r.documentId);
                  const route = routeForRecord(doc, r.id);
                  const prepared = !!r.prepared && ["Scheduled", "Due", "In Progress"].includes(r.status);
                  return (
                    <tr key={r.id}>
                      <td>
                        <div>
                          {documentTextIn(doc?.name, lang)} {r.isDemo && <DemoTag />}
                        </div>
                        {prepared && (
                          <span className="prepared-chip mt-1">
                            <FiZap size={9} /> {t("dash.preparedReview")}
                          </span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(route)}>
                          {t("common.open")} <FiArrowRight size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div className="card-header">
            <h3 className="text-lg">{t("dash.modules")}</h3>
          </div>
          <div className="card-pad">
            {modules.map((m) => (
              <div
                key={m.module}
                className="flex items-center justify-between mb-3 card-clickable"
                style={{ padding: "8px 4px" }}
                onClick={() => navigate("/library")}
              >
                <div>
                  <div className="font-semibold">{t(`module.${m.module}`)}</div>
                  <div className="text-muted text-xs">
                    {m.documentCount} {t("dash.documentsConfigured")}
                  </div>
                </div>
                <span className="badge badge-Verified">{m.configuredCount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
