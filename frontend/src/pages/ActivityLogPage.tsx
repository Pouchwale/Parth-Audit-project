import React, { useCallback, useEffect, useState } from "react";
import { FiDownload, FiRefreshCw, FiSearch, FiX } from "react-icons/fi";
import { api } from "../api/client";
import { useAuth } from "../store/AuthContext";
import { downloadCSV, toCSV } from "../utils/csv";
import { APPROVED, countOf, FILLED_IN, SUBMITTED, worked, type ActivityTally } from "../engine/activityWork";

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

// A DAY, A MONTH, A YEAR (REQUIREMENTS §73).
//
// "whatever the work that user has done in whole day, month, year and
// according to that logs also score will decide."
//
// The spans a person actually asks for, each as two plain dates the server
// filters on. "All" sends none, which is the log as it was before.
type SpanId = "day" | "month" | "year" | "all";

const SPANS: { id: SpanId; label: string }[] = [
  { id: "day", label: "Today" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
  { id: "all", label: "Everything" },
];

const pad = (n: number): string => String(n).padStart(2, "0");
const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Both ends included, as a person means them. */
function spanDates(span: SpanId, now = new Date()): { from?: string; to?: string } {
  if (span === "all") return {};
  const to = iso(now);
  if (span === "day") return { from: to, to };
  if (span === "month") return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to };
  return { from: `${now.getFullYear()}-01-01`, to };
}



export function ActivityLogPage() {
  const { user } = useAuth();
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [span, setSpan] = useState<SpanId>("day");
  /** Whose lines to show — "" is everybody this account may read. */
  const [person, setPerson] = useState("");
  const [tallies, setTallies] = useState<ActivityTally[]>([]);

  // The span and the person go to the server, which filters and counts there:
  // a year of a busy plant is far more lines than this page should hold.
  const params = useCallback(() => {
    const { from, to } = spanDates(span);
    const q = query.trim();
    return [from ? `from=${from}` : "", to ? `to=${to}` : "", person ? `person=${encodeURIComponent(person)}` : "", q ? `q=${encodeURIComponent(q)}` : ""]
      .filter(Boolean)
      .join("&");
  }, [span, person, query]);

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      setError(null);
      const rest = params();
      try {
        const res = await api.get<{ lines: Line[] }>(`/activity?limit=${PAGE}${before ? `&before=${before}` : ""}${rest ? `&${rest}` : ""}`);
        setLines((prev) => (before ? [...prev, ...res.lines] : res.lines));
        setMore(res.lines.length === PAGE);
      } catch (e) {
        setError(e instanceof Error ? e.message : "The activity log could not be read.");
      } finally {
        setLoading(false);
      }
      // The tally is an extra: a page of lines must still show if it fails.
      try {
        const sum = await api.get<{ people: ActivityTally[] }>(`/activity/summary${rest ? `?${rest}` : ""}`);
        setTallies(sum.people ?? []);
      } catch {
        setTallies([]);
      }
    },
    [params]
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [span, person]);

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

      {/* THE SPAN (REQUIREMENTS §73): a day, a month, a year, or everything. */}
      <div className="flex gap-2 mb-3 wrap items-center">
        <div className="pill-tabs" data-field="activity-span">
          {SPANS.map((sp) => (
            <div key={sp.id} className={`pill-tab ${span === sp.id ? "active" : ""}`} data-span={sp.id} role="button" tabIndex={0} onClick={() => setSpan(sp.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? setSpan(sp.id) : undefined)}>
              {sp.label}
            </div>
          ))}
        </div>
        {person && (
          <button className="btn btn-secondary btn-sm" data-action="activity-all-people" onClick={() => setPerson("")}>
            <FiX size={12} /> {tallies.find((t) => t.userId === person)?.userName ?? "This person"} only — show everybody
          </button>
        )}
      </div>

      {/* WHAT EACH PERSON DID IN THE SPAN. The counts the Performance
          Scorecard is read beside (§64): the log says what was actually done,
          and by whom, over a day, a month or a year. */}
      {tallies.length > 0 && (
        <div className="card mb-3">
          <div className="doc-table" style={{ overflowX: "auto" }}>
            <table className="compact" data-table="activity-summary">
              <thead>
                <tr>
                  <th>Who</th>
                  <th style={{ width: 90 }}>Filled in</th>
                  <th style={{ width: 100 }}>Submitted</th>
                  <th style={{ width: 90 }}>Approved</th>
                  <th style={{ width: 90 }}>Work done</th>
                  <th style={{ width: 90 }}>Days active</th>
                  <th style={{ width: 90 }}>All actions</th>
                  <th style={{ width: 160 }}>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {tallies.map((tl) => (
                  <tr key={tl.userId ?? tl.userName} data-person={tl.userId ?? ""} data-total={tl.total}>
                    <td className="text-sm notranslate" translate="no">
                      {tl.userId ? (
                        <button className="link-button text-sm" data-action="activity-pick-person" onClick={() => setPerson(tl.userId as string)}>
                          {tl.userName || "—"}
                        </button>
                      ) : (
                        <span title="This line's account has since been removed; the log keeps the name it was written with.">{tl.userName || "—"}</span>
                      )}
                    </td>
                    <td className="text-sm" data-field="saved">{countOf(tl, FILLED_IN)}</td>
                    <td className="text-sm" data-field="submitted">{countOf(tl, SUBMITTED)}</td>
                    <td className="text-sm" data-field="verified">{countOf(tl, APPROVED)}</td>
                    <td className="text-sm font-semibold" data-field="worked">{worked(tl)}</td>
                    <td className="text-sm" data-field="active-days">{tl.activeDays}</td>
                    <td className="text-sm text-muted" data-field="total">{tl.total}</td>
                    <td className="text-sm text-muted notranslate" translate="no">
                      {new Date(tl.lastAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-pad text-xs text-faint" style={{ paddingTop: 0 }}>
            Counted from the log itself, for the span chosen above. “Work done” is filling a record in, sending it for approval and
            approving it — opening, printing and downloading are in “all actions” but are not what a day is judged on. The
            Performance Scorecard scores the records themselves; this says who did the work.
          </div>
        </div>
      )}

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
