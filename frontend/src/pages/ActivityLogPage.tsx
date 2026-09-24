import React, { useCallback, useEffect, useRef, useState } from "react";
import { FiArchive, FiDownload, FiRefreshCw, FiSearch, FiX } from "react-icons/fi";
import { activityArchiveApi, api, ApiError, type ActivityArchivePreview } from "../api/client";
import { useAuth } from "../store/AuthContext";
import { Modal } from "../components/common/Modal";
import { downloadCSV, toCSV } from "../utils/csv";
import { formatDisplayDate } from "../utils/date";
import { APPROVED, countOf, FILLED_IN, SUBMITTED, worked, type ActivityTally } from "../engine/activityWork";

// ACTIVITY LOG — everything anybody has done on the portal, newest first
// (REQUIREMENTS §62): signing in and out, accounts and department access
// (written by the server, where they happen), and opening, writing,
// submitting, verifying, sending back, correcting, deleting, printing,
// downloading and changing the format of a document (utils/activityLog.ts).
//
// The super admin reads every line. An account kept to departments reads its
// own lines and its departments'. Nothing here can be edited or removed: the
// table is only ever added to, and the database itself refuses a change or a
// removal (backend/activityArchive.ts).
//
// KEPT FOR EVER, ARCHIVED ONLY ON PURPOSE (REQUIREMENTS §75). Nothing leaves
// the log by itself. The super admin alone can move lines older than a few
// years to the archive — after seeing how many and from when to when — and
// can still read and search them here by ticking "Include archived lines".

interface Line {
  id: string;
  at: string;
  userName: string;
  userEmail: string;
  action: string;
  target: string;
  detail: string;
  department: string;
  /** Only on a reading with the archive: true for a line that has been moved there. */
  archived?: boolean;
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
  const admin = user?.role === "admin";
  /** The super admin's "Include archived lines": the list and the tally read the archive too. */
  const [withArchive, setWithArchive] = useState(false);
  const archived = admin && withArchive;

  // The span and the person go to the server, which filters and counts there:
  // a year of a busy plant is far more lines than this page should hold.
  const params = useCallback(() => {
    const { from, to } = spanDates(span);
    const q = query.trim();
    return [from ? `from=${from}` : "", to ? `to=${to}` : "", person ? `person=${encodeURIComponent(person)}` : "", q ? `q=${encodeURIComponent(q)}` : ""]
      .filter(Boolean)
      .join("&");
  }, [span, person, query]);

  // "SHOW OLDER" GOES ON WITH THE LIST ON THE SCREEN (REQUIREMENTS §62, §75).
  // The next page must be read with the filter the list was LOADED with — the
  // span, the person, the search and the archive tick of that reading — not
  // with whatever is in the search box now: a search typed but not yet sent
  // used to go with "Show older", and lines of another search were added
  // under the first one's, beside a tally re-counted for the words typed.
  // `shown` is set when a fresh reading arrives and only then. `reading`
  // counts the fresh readings: a page that comes back after a newer reading
  // began belongs to a list no longer shown, and is dropped.
  const shown = useRef<{ rest: string; archived: boolean } | null>(null);
  const reading = useRef(0);

  const load = useCallback(
    async (before?: string) => {
      const fresh = !before;
      const filter = !fresh && shown.current ? shown.current : { rest: params(), archived };
      const mine = fresh ? ++reading.current : reading.current;
      const current = () => mine === reading.current;
      setLoading(true);
      setError(null);
      const page = `limit=${PAGE}${before ? `&before=${before}` : ""}${filter.rest ? `&${filter.rest}` : ""}`;
      try {
        // With the archive ticked: the same query, read over the log and its
        // archive together — same filters, same order, same "Show older".
        const res = filter.archived ? await activityArchiveApi.lines(page) : await api.get<{ lines: Line[] }>(`/activity?${page}`);
        if (!current()) return;
        if (fresh) shown.current = filter;
        setLines((prev) => (before ? [...prev, ...res.lines] : res.lines));
        setMore(res.lines.length === PAGE);
      } catch (e) {
        if (current()) setError(e instanceof Error ? e.message : "The activity log could not be read.");
      } finally {
        if (current()) setLoading(false);
      }
      // The tally counts the whole reading, so a further page of it leaves the tally as it is.
      if (!fresh || !current()) return;
      // The tally is an extra: a page of lines must still show if it fails.
      try {
        const sum = filter.archived ? await activityArchiveApi.summary(filter.rest) : await api.get<{ people: ActivityTally[] }>(`/activity/summary${filter.rest ? `?${filter.rest}` : ""}`);
        if (current()) setTallies(sum.people ?? []);
      } catch {
        if (current()) setTallies([]);
      }
    },
    [params, archived]
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [span, person, archived]);

  const exportCSV = () =>
    downloadCSV(
      "activity-log.csv",
      toCSV(
        ["When", "Who", "Email", "What", "On", "Detail", "Department", ...(archived ? ["Archived"] : [])],
        lines.map((l) => [new Date(l.at).toLocaleString(), l.userName, l.userEmail, l.action, l.target, l.detail, l.department, ...(archived ? [l.archived ? "Yes" : ""] : [])])
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
        {/* THE ARCHIVE, READ BACK (REQUIREMENTS §75): the super admin's only. */}
        {admin && (
          <label className="flex items-center gap-2 text-sm text-muted" title="Lines moved to the archive are kept, and are read and searched here with the rest.">
            <input type="checkbox" data-field="include-archived" checked={withArchive} onChange={(e) => setWithArchive(e.target.checked)} />
            Include archived lines
          </label>
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
                <tr key={l.id} data-activity={l.action} data-archived={l.archived ? "1" : undefined}>
                  <td className="text-sm notranslate" translate="no">
                    {new Date(l.at).toLocaleString()}
                  </td>
                  <td className="text-sm notranslate" translate="no" title={l.userEmail}>
                    {l.userName || "—"}
                  </td>
                  <td className="text-sm font-semibold">
                    {l.action}
                    {l.archived && (
                      <>
                        {" "}
                        <span className="badge badge-Scheduled" title="Moved to the archive by the super admin — kept, and read here because “Include archived lines” is ticked.">
                          Archived
                        </span>
                      </>
                    )}
                  </td>
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

      {admin && <ArchivePanel onArchived={() => void load()} />}
    </div>
  );
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const YEAR_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * ARCHIVING OLD LINES — THE SUPER ADMIN'S DELIBERATE ACT (REQUIREMENTS §62, §75).
 * Counted once when the page opens and again only when the number of years is
 * changed — never while drawing. The count, the days the lines run from and to,
 * and the day everything before which would go, are all shown before anything
 * can be pressed; the move itself is behind a question. The server checks the
 * day again: should the date have moved on since the count, it says so and
 * shows the new count instead of moving something that was not shown.
 */
function ArchivePanel({ onArchived }: { onArchived: () => void }) {
  /** The years the admin picked; null = the server's default (ACTIVITY_ARCHIVE_AFTER_YEARS). */
  const [chosen, setChosen] = useState<number | null>(null);
  const [preview, setPreview] = useState<ActivityArchivePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setPreview(null);
    setError(null);
    activityArchiveApi
      .preview(chosen ?? undefined)
      .then((p) => {
        if (live) setPreview(p);
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : "The archive could not be read.");
      });
    return () => {
      live = false;
    };
  }, [chosen]);

  const years = chosen ?? preview?.years ?? 3;
  const day = (iso: string | null) => (iso ? formatDisplayDate(iso) : "—");

  const archive = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    let moved: number | null = null;
    try {
      moved = (await activityArchiveApi.archive(preview.years, preview.cutoff)).moved;
    } catch (e) {
      setError(e instanceof Error ? e.message : "The lines could not be archived.");
      // 409: the date moved on since the count — the new count is shown to look at first.
      if (!(e instanceof ApiError && e.status === 409)) {
        setBusy(false);
        return;
      }
    }
    setAsking(false);
    if (moved !== null) {
      setDone(moved === 0 ? "Nothing was old enough to move." : `${plural(moved, "line")} moved to the archive — kept, and found here with “Include archived lines”.`);
      onArchived();
    }
    // The count again, for what is left (and what the archive now holds).
    setPreview(await activityArchiveApi.preview(preview.years).catch(() => null));
    setBusy(false);
  };

  return (
    <div className="card mt-4" data-section="activity-archive" data-count={preview ? preview.count : undefined}>
      <div className="card-pad">
        <h3 className="text-sm uppercase text-muted mb-2">
          <FiArchive size={13} /> Archive old lines
        </h3>
        <p className="text-sm text-muted mb-3">
          Nothing leaves the log by itself: every line is kept for ever. When the log has grown long, lines older than a few years can be
          moved, on purpose, to the archive — in the same database, still kept, and still read and searched here with “Include archived
          lines”. The move is itself a line in the log.
        </p>
        <div className="flex items-center gap-2 wrap mb-2">
          <span className="text-sm">Lines older than</span>
          <select
            className="input input-sm"
            style={{ width: 76 }}
            data-field="archive-years"
            value={years}
            disabled={busy}
            onChange={(e) => {
              setChosen(Number(e.target.value));
              setDone(null);
            }}
          >
            {YEAR_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="text-sm">{years === 1 ? "year" : "years"}</span>
        </div>
        <div className="text-sm mb-1" data-field="archive-preview">
          {!preview
            ? error
              ? ""
              : "Counting…"
            : preview.count === 0
              ? `No line is older than ${plural(preview.years, "year")} — nothing to archive. (Lines written before ${day(preview.cutoff)} would be moved.)`
              : `${plural(preview.count, "line")}, written ${day(preview.from)} to ${day(preview.to)} — everything before ${day(preview.cutoff)}.`}
        </div>
        {preview && (
          <div className="text-xs text-faint mb-3" data-field="archive-held">
            {preview.archived.count === 0
              ? "The archive is empty."
              : `The archive holds ${plural(preview.archived.count, "line")}, written ${day(preview.archived.from)} to ${day(preview.archived.to)}.`}
          </div>
        )}
        {done && (
          <div className="text-sm text-success mb-2" data-field="archive-done">
            {done}
          </div>
        )}
        {error && <div className="text-sm text-danger mb-2">{error}</div>}
        <button className="btn btn-danger btn-sm" data-action="activity-archive" disabled={!preview || preview.count === 0 || busy} onClick={() => setAsking(true)}>
          <FiArchive size={13} /> {preview && preview.count > 0 ? `Archive ${plural(preview.count, "line")}…` : "Archive…"}
        </button>
      </div>

      {asking && preview && (
        <Modal
          title="Move these lines to the archive?"
          onClose={() => (busy ? undefined : setAsking(false))}
          dismissible={!busy}
          width={500}
          footer={
            <div className="flex gap-2 justify-end" style={{ width: "100%" }}>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setAsking(false)}>
                No, keep them here
              </button>
              <button className="btn btn-danger btn-sm" data-action="activity-archive-confirm" disabled={busy} onClick={() => void archive()}>
                <FiArchive size={12} /> {busy ? "Moving…" : "Yes, archive them"}
              </button>
            </div>
          }
        >
          <p className="text-sm mb-2">
            {plural(preview.count, "line")} of the activity log, written {day(preview.from)} to {day(preview.to)} — everything before{" "}
            {day(preview.cutoff)} — will move to the archive.
          </p>
          <p className="text-sm text-muted">
            They are not deleted. They stay in the same database, and you can still read and search them here with “Include archived
            lines”. The move is written in the log as “Activity log archived”, with the count, the date and your name. A long log can take a
            minute to move.
          </p>
        </Modal>
      )}
    </div>
  );
}
