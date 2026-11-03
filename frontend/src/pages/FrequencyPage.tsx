import React, { useMemo, useState } from "react";
import { FiClock, FiSearch } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { useAuth } from "../store/AuthContext";
import { masterRepository } from "../data/repositories/masterRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { FrequencyPicker } from "../components/master/FrequencyPicker";
import { scheduleLabel } from "../engine/frequencyEngine";
import { frequencyCounts, frequencyModules, frequencySearch } from "../engine/frequencyPanel";
import { removeOffScheduleShells } from "../engine/calendarMigration";
import { documentTextIn } from "../i18n/documentText";
import { useT } from "../i18n";
import { logActivity } from "../utils/activityLog";
import { formatDisplayDate } from "../utils/date";
import { Link } from "../store/router";

// FREQUENCY — the super admin's panel (REQUIREMENTS §163; the owner, 2-Nov-2026). Every document of every module on
// one page, grouped by module, each with the picker Master Data's Documents tab carries (components/master/
// FrequencyPicker.tsx, §143): daily, weekly, twice a month, monthly, quarterly, half-yearly, yearly, as required.
// Set here or there, it is the one setting (Master Data's scheduleOverrides), takes effect from today, and goes in
// the activity log. The frequency a document was issued with is a click away ("As issued").

export function FrequencyPage() {
  const { user } = useAuth();
  const { version, bump, lang } = useAppStore();
  const t = useT();
  const [query, setQuery] = useState("");
  const master = useMemo(() => masterRepository.get(), [version]);
  const docs = useMemo(() => documentRepository.getRecordableUnscoped().filter((d) => !d.isReferenceOnly), [version]);
  const shown = useMemo(() => frequencySearch(docs, query), [docs, query]);
  const modules = useMemo(() => frequencyModules(shown), [shown]);
  const counts = useMemo(() => frequencyCounts(docs), [docs]);

  if (user?.role !== "admin") {
    return (
      <div className="empty-state" data-state="frequency-admin-only">
        The Frequency panel is the super admin&apos;s. <Link to="/dashboard">Back to the dashboard</Link>.
      </div>
    );
  }

  return (
    <div data-page="frequency">
      <div className="flex items-center justify-between mb-1 wrap gap-3">
        <div>
          <div className="text-xs text-muted mb-1" data-crumb>
            System · Frequency
          </div>
          <h1 className="text-2xl mb-1">
            <FiClock size={20} style={{ verticalAlign: -3 }} /> {t("nav.frequency")}
          </h1>
        </div>
        <label className="flex items-center gap-1">
          <FiSearch size={13} />
          <input className="input input-sm" data-field="frequency-search" placeholder="Find a document…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 240 }} />
        </label>
      </div>
      <p className="text-sm text-muted mb-3">
        How often each document falls due: choose, then Set. The change takes effect from today; the sheets already made stand as they are, and everybody who
        answers for the document is told the working day before each new due date. &ldquo;As issued&rdquo; puts a document back to the frequency it was issued
        with. The same setting is on Master Data&apos;s Documents tab.
      </p>
      <div className="flex gap-2 wrap mb-3" data-section="frequency-counts">
        {counts.map((c) => (
          <span key={c.frequency} className="badge badge-Scheduled" data-frequency={c.frequency}>
            {t(`freq.${c.frequency}`)}: {c.count}
          </span>
        ))}
        <span className="badge" data-state="frequency-total">
          {docs.length} documents
        </span>
      </div>
      {modules.length === 0 && (
        <div className="empty-state" data-state="frequency-none">
          No document matches &ldquo;{query}&rdquo;.
        </div>
      )}
      {modules.map((m) => (
        <div className="card mb-4" key={m.code} data-section="frequency-module" data-module={m.code}>
          <div className="card-header">
            <h3 className="text-base font-semibold">
              {m.name} ({m.code})
            </h3>
            <span className="text-xs text-muted">{m.docs.length} documents</span>
          </div>
          <div className="card-pad" style={{ overflowX: "auto" }}>
            <table className="compact" data-table="frequency">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Format No.</th>
                  <th>Document</th>
                  <th style={{ width: 220 }}>Falls due</th>
                  <th>Frequency</th>
                </tr>
              </thead>
              <tbody>
                {m.docs.map((d) => {
                  const override = master.scheduleOverrides?.[d.id];
                  return (
                    <tr key={d.id} data-document={d.id} data-frequency={d.frequency}>
                      <td className={d.formatNo === "TO BE CONFIRMED" ? "tbc notranslate" : "notranslate"} translate="no">
                        {d.formatNo}
                      </td>
                      <td>{documentTextIn(d.name, lang)}</td>
                      <td className="text-sm" data-cell="falls-due">
                        {scheduleLabel(d)}
                        {override && (
                          <div className="text-xs text-muted" data-state="frequency-since">
                            Set by {override.by || "the super admin"} from {formatDisplayDate(override.since)}
                          </div>
                        )}
                      </td>
                      <td data-cell="frequency" data-document={d.id}>
                        <FrequencyPicker
                          key={`${d.id}-${JSON.stringify(d.schedule)}`}
                          doc={d}
                          override={override}
                          onChange={(next) => {
                            const overrides = { ...(master.scheduleOverrides ?? {}) };
                            if (next) overrides[d.id] = next;
                            else delete overrides[d.id];
                            masterRepository.update({ scheduleOverrides: overrides });
                            // The schedule's blank shells for days the new frequency does not name go now, as at start-up (§130).
                            removeOffScheduleShells();
                            logActivity(
                              "Frequency changed",
                              `${d.formatNo.startsWith("TO BE") ? "" : `${d.formatNo} `}${d.name}`,
                              next ? `${scheduleLabel({ ...d, schedule: next.schedule })}, from ${formatDisplayDate(next.since)}` : "back to the issued frequency",
                              d.id
                            );
                            bump();
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
