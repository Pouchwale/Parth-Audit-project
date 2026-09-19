import React, { useCallback, useEffect, useState } from "react";
import { FiDownload, FiRefreshCw, FiSearch } from "react-icons/fi";
import { api } from "../api/client";
import { useAuth } from "../store/AuthContext";
import { downloadCSV, toCSV } from "../utils/csv";

// ACTIVITY LOG — everything anybody has done on the portal, newest first
// (REQUIREMENTS §62): signing in and out, accounts and department access
// (written by the server, where they happen), and opening, writing,
// submitting, verifying, sending back, correcting, deleting, printing,
// downloading and changing the format of a document (utils/activityLog.ts).
//
// The super admin reads every line. An account kept to departments reads its
// own lines and its departments'. Nothing here can be edited or removed: the
// table is only ever added to (backend/db.ts, activity_log).

interface Line {
  id: string;
  at: string;
  userName: string;
  userEmail: string;
  action: string;
  target: string;
  detail: string;
  department: string;
}

const PAGE = 100;

export function ActivityLogPage() {
  const { user } = useAuth();
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      setError(null);
      try {
        const q = query.trim();
        const res = await api.get<{ lines: Line[] }>(`/activity?limit=${PAGE}${before ? `&before=${before}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
        setLines((prev) => (before ? [...prev, ...res.lines] : res.lines));
        setMore(res.lines.length === PAGE);
      } catch (e) {
        setError(e instanceof Error ? e.message : "The activity log could not be read.");
      } finally {
        setLoading(false);
      }
    },
    [query]
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCSV = () =>
    downloadCSV(
      "activity-log.csv",
      toCSV(
        ["When", "Who", "Email", "What", "On", "Detail", "Department"],
        lines.map((l) => [new Date(l.at).toLocaleString(), l.userName, l.userEmail, l.action, l.target, l.detail, l.department])
      )
    );

  const everything = user?.role === "admin" || (user?.departments.length ?? 0) === 0;

  return (
    <div data-page="activity-log">
      <div className="flex items-center justify-between mb-1 wrap gap-3">
        <h1 className="text-2xl">Activity Log</h1>
        <div className="flex gap-2 wrap">
          <button className="btn btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>
            <FiRefreshCw size={13} /> Refresh
          </button>
          <button className="btn btn-secondary btn-sm" onClick={exportCSV} disabled={lines.length === 0}>
            <FiDownload size={13} /> Export CSV
          </button>
        </div>
      </div>
      <p className="text-muted mb-4">
        {everything
          ? "Everything done on the portal, newest first — who, when, what and to which document. Lines are only ever added; nothing here can be changed or removed."
          : `What you have done, and everything done on ${user?.departments.join(" and ")}'s documents, newest first. Lines are only ever added; nothing here can be changed or removed.`}
      </p>

      <form
        className="flex gap-2 mb-3"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <input className="input" style={{ maxWidth: 360 }} placeholder="A name, an action, a format number…" value={query} onChange={(e) => setQuery(e.target.value)} data-field="activity-search" />
        <button className="btn btn-primary btn-sm" type="submit">
          <FiSearch size={13} /> Search
        </button>
      </form>

      {error && <div className="text-sm text-danger mb-3">{error}</div>}

      <div className="card">
        <div className="doc-table" style={{ overflowX: "auto" }}>
          <table className="compact" data-table="activity-log">
            <thead>
              <tr>
                <th style={{ width: 170 }}>When</th>
                <th style={{ width: 170 }}>Who</th>
                <th style={{ width: 230 }}>What</th>
                <th>On</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted text-center" style={{ padding: 18 }}>
                    {loading ? "Reading the log…" : "Nothing in the log yet."}
                  </td>
                </tr>
              )}
              {lines.map((l) => (
                <tr key={l.id} data-activity={l.action}>
                  <td className="text-sm notranslate" translate="no">
                    {new Date(l.at).toLocaleString()}
                  </td>
                  <td className="text-sm notranslate" translate="no" title={l.userEmail}>
                    {l.userName || "—"}
                  </td>
                  <td className="text-sm font-semibold">{l.action}</td>
                  <td className="text-sm notranslate" translate="no">
                    {l.target}
                  </td>
                  <td className="text-sm text-muted notranslate" translate="no">
                    {l.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {more && (
        <button className="btn btn-secondary btn-sm mt-3" onClick={() => void load(lines[lines.length - 1]?.id)} disabled={loading}>
          Show older
        </button>
      )}
    </div>
  );
}
