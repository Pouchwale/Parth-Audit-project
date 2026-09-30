import React, { useCallback, useEffect, useRef, useState } from "react";
import { FiDownload, FiRefreshCw, FiSearch } from "react-icons/fi";
import { ApiError, overviewApi, type OverviewAnswer, type OverviewQuestion, type OverviewStatus, type OverviewView } from "../api/client";
import { useAuth } from "../store/AuthContext";
import { downloadBlob } from "../utils/csv";

// DATABASE OVERVIEW — /database-overview (REQUIREMENTS §83), the super admin's own.
//
// DCRS and the Audit Assistant share one PostgreSQL database, and its schema
// "overview" holds plain-English views over both: one row per real-world thing
// (an account, a record, a CAPA finding, a day of the pest control register, a
// download ...), every view and every column described in words. This page
// reads them without anybody writing SQL:
//   * the ready-made questions first, as big buttons — "Who downloaded or
//     printed what last week?" (or this week), the open CAPA findings, the pest
//     control reports missing this month, and what came through the Audit
//     Assistant;
//   * then "Browse everything": any view, narrowed by dates or a search, and
//     taken away as a CSV file for Excel.
// A hundred rows at a time, with "Show more"; each heading says the column in
// plain words and shows the view's own comment on it when pointed at.
//
// READ-ONLY, AND THE SCREEN IS NEVER THE LOCK: the server reads through a role
// that can read the views and nothing else, and refuses every route to anybody
// but the super admin (backend/overviewRoutes.ts). The values are the records'
// own words, so they are never sent to be translated.
//
// Light on a low-end laptop: the server does the reading and filtering; the
// page holds only the rows asked for, drawn as plain text, and the table is not
// drawn again while somebody types in the search box.

const PAGE = 100;

type Week = "this" | "last";

type Opened =
  | { state: "loading" }
  | { state: "ready"; status: OverviewStatus; questions: OverviewQuestion[]; views: OverviewView[] }
  | { state: "not-set-up"; message: string }
  | { state: "failed"; message: string };

const messageOf = (err: unknown, fallback: string): string => (err instanceof Error && err.message ? err.message : fallback);

/** One list of rows, read a page at a time — "Show more" goes on with the reading on the screen, never with what is typed since. */
function usePagedAnswer() {
  const [answer, setAnswer] = useState<OverviewAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // How many pages have arrived: shown on the section (data-loads), so a check can wait for the next one.
  const [loads, setLoads] = useState(0);
  // Counts the fresh readings: a page that arrives after a newer one began belongs to a list no longer shown.
  const reading = useRef(0);
  const shown = useRef<{ read: (offset: number) => Promise<OverviewAnswer>; count: number } | null>(null);

  const start = useCallback((read: (offset: number) => Promise<OverviewAnswer>) => {
    const mine = ++reading.current;
    shown.current = null;
    setBusy(true);
    setError(null);
    setAnswer(null);
    read(0)
      .then((page) => {
        if (mine !== reading.current) return;
        shown.current = { read, count: page.rows.length };
        setAnswer(page);
        setLoads((n) => n + 1);
      })
      .catch((err) => {
        if (mine === reading.current) setError(messageOf(err, "That could not be read."));
      })
      .finally(() => {
        if (mine === reading.current) setBusy(false);
      });
  }, []);

  const more = useCallback(() => {
    const current = shown.current;
    if (!current) return;
    const mine = reading.current;
    setBusy(true);
    setError(null);
    current
      .read(current.count)
      .then((page) => {
        if (mine !== reading.current) return;
        current.count += page.rows.length;
        setAnswer((prev) => (prev ? { ...prev, rows: prev.rows.concat(page.rows), more: page.more } : page));
        setLoads((n) => n + 1);
      })
      .catch((err) => {
        if (mine === reading.current) setError(messageOf(err, "The next rows could not be read."));
      })
      .finally(() => {
        if (mine === reading.current) setBusy(false);
      });
  }, []);

  const clear = useCallback(() => {
    reading.current++;
    shown.current = null;
    setAnswer(null);
    setError(null);
    setBusy(false);
  }, []);

  /** For the section around the rows: loading, ready or empty, and how many pages have arrived. */
  const marks = { "data-state": busy ? "loading" : answer ? "ready" : "empty", "data-loads": loads };
  return { answer, busy, error, start, more, clear, marks };
}

// A short value (an id, a date, a name) stays on one line; only long text wraps,
// in a column wide enough to read. The table scrolls sideways when it is wider than the page.
const SHORT_CELL: React.CSSProperties = { whiteSpace: "nowrap", verticalAlign: "top" };
const LONG_CELL: React.CSSProperties = { whiteSpace: "normal", overflowWrap: "break-word", minWidth: 260, maxWidth: 440, verticalAlign: "top" };
const LONG = 48;

/** One row as plain text. "Show more" keeps the rows already shown as they were, so only the new ones are drawn. */
const ResultRow = React.memo(function ResultRow({ row }: { row: (string | null)[] }) {
  return (
    <tr>
      {row.map((value, j) => (
        <td key={j} style={value && value.length > LONG ? LONG_CELL : SHORT_CELL}>
          {value ?? ""}
        </td>
      ))}
    </tr>
  );
});

/** The rows as plain text. Drawn again only when the rows change, not on every key typed elsewhere on the page. */
const ResultTable = React.memo(function ResultTable({ answer, name }: { answer: OverviewAnswer; name: string }) {
  return (
    <div className="doc-table" style={{ overflowX: "auto" }}>
      <table className="compact" data-table={name} data-view={answer.view} data-rows={answer.rows.length}>
        <thead>
          <tr>
            {answer.columns.map((c) => (
              <th key={c.name} data-column={c.name} title={c.comment ?? undefined} style={{ cursor: c.comment ? "help" : undefined }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        {answer.rows.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={Math.max(answer.columns.length, 1)} className="text-muted text-center" style={{ padding: 18 }}>
                Nothing matches.
              </td>
            </tr>
          </tbody>
        ) : (
          <tbody className="notranslate" translate="no">
            {answer.rows.map((row, i) => (
              <ResultRow key={i} row={row} />
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
});

const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

function RowsFooter({ answer, busy, onMore, name }: { answer: OverviewAnswer; busy: boolean; onMore: () => void; name: string }) {
  return (
    <div className="card-pad flex items-center gap-3 wrap" style={{ paddingTop: 10 }}>
      <span className="text-sm text-muted" data-field={`${name}-count`}>
        {answer.more ? `The first ${plural(answer.rows.length, "row")} — there are more.` : plural(answer.rows.length, "row")}
      </span>
      {answer.more && (
        <button type="button" className="btn btn-secondary btn-sm" data-action={`${name}-more`} disabled={busy} onClick={onMore}>
          {busy ? "Reading…" : "Show more"}
        </button>
      )}
    </div>
  );
}

async function saveFile(get: () => Promise<{ blob: Blob; filename: string }>, setBusy: (b: boolean) => void, setError: (e: string | null) => void): Promise<void> {
  setBusy(true);
  setError(null);
  try {
    const { blob, filename } = await get();
    downloadBlob(filename, blob);
  } catch (err) {
    setError(messageOf(err, "The CSV file could not be made."));
  } finally {
    setBusy(false);
  }
}

// ---------------------------------------------------------------------------
// the ready-made questions

function Questions({ questions }: { questions: OverviewQuestion[] }) {
  const [asked, setAsked] = useState<{ question: OverviewQuestion; week: Week } | null>(null);
  const pages = usePagedAnswer();
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  const ask = (question: OverviewQuestion, week: Week) => {
    setAsked({ question, week });
    setCsvError(null);
    const weekPart = question.span === "week" ? `week=${week}&` : "";
    pages.start((offset) => overviewApi.ask(question.key, `${weekPart}limit=${PAGE}&offset=${offset}`));
  };

  const answer = pages.answer;
  const question = asked?.question;
  return (
    <section className="mb-6" data-section="questions">
      <h2 className="text-lg mb-2">Ask a question</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 12 }}>
        {questions.map((q) => {
          const on = question?.key === q.key;
          return (
            <button
              key={q.key}
              type="button"
              className="card card-clickable card-pad"
              data-question={q.key}
              aria-pressed={on}
              onClick={() => ask(q, asked?.question.key === q.key ? asked.week : "last")}
              style={{ textAlign: "left", font: "inherit", color: "inherit", borderColor: on ? "var(--color-primary)" : undefined, borderWidth: on ? 2 : undefined }}
            >
              <span className="font-semibold" style={{ display: "block", fontSize: 16, marginBottom: 6 }}>
                {q.title}
              </span>
              <span className="text-sm text-muted" style={{ display: "block" }}>
                {q.description}
              </span>
            </button>
          );
        })}
      </div>

      {asked && question && (
        <div className="card mt-4" data-section="answer" data-question={question.key} {...pages.marks}>
          <div className="card-pad" style={{ paddingBottom: 10 }}>
            <div className="flex items-center justify-between wrap gap-3 mb-1">
              <h3 className="text-lg" data-field="answer-title">
                {answer?.title ?? question.title}
              </h3>
              <div className="flex items-center gap-2 wrap">
                {question.span === "week" && (
                  <div className="pill-tabs" data-field="week">
                    {(["last", "this"] as const).map((w) => (
                      <div
                        key={w}
                        className={`pill-tab ${asked.week === w ? "active" : ""}`}
                        data-week={w}
                        role="button"
                        tabIndex={0}
                        aria-pressed={asked.week === w}
                        onClick={() => ask(question, w)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? ask(question, w) : undefined)}
                      >
                        {w === "last" ? "Last week" : "This week"}
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  data-action="answer-csv"
                  disabled={!answer || csvBusy}
                  onClick={() =>
                    void saveFile(() => overviewApi.askCsv(question.key, question.span === "week" ? `week=${asked.week}` : ""), setCsvBusy, setCsvError)
                  }
                >
                  <FiDownload size={13} /> {csvBusy ? "Making the file…" : "Download as CSV"}
                </button>
              </div>
            </div>
            {answer?.range && (
              <p className="text-sm font-semibold notranslate" translate="no" data-field="range" data-from={answer.range.from} data-to={answer.range.to}>
                {answer.range.label}
              </p>
            )}
            <p className="text-sm text-muted">{answer?.description ?? question.description}</p>
            {pages.error && <div className="text-sm text-danger mt-2">{pages.error}</div>}
            {csvError && <div className="text-sm text-danger mt-2">{csvError}</div>}
          </div>
          {answer ? (
            <>
              <ResultTable answer={answer} name="overview-answer" />
              <RowsFooter answer={answer} busy={pages.busy} onMore={pages.more} name="answer" />
            </>
          ) : (
            pages.busy && <p className="card-pad text-sm text-muted">Reading…</p>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// browse everything

function Browse({ views }: { views: OverviewView[] }) {
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const pages = usePagedAnswer();
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const view = views.find((v) => v.name === name) ?? null;

  const query = (viewNow: OverviewView, filter: { from: string; to: string; q: string }) =>
    [viewNow.dayColumn && filter.from ? `from=${filter.from}` : "", viewNow.dayColumn && filter.to ? `to=${filter.to}` : "", filter.q.trim() ? `q=${encodeURIComponent(filter.q.trim())}` : ""]
      .filter(Boolean)
      .join("&");

  const show = (viewNow: OverviewView | null, filter: { from: string; to: string; q: string }) => {
    setCsvError(null);
    if (!viewNow) return pages.clear();
    const rest = query(viewNow, filter);
    pages.start((offset) => overviewApi.rows(viewNow.name, `${rest ? `${rest}&` : ""}limit=${PAGE}&offset=${offset}`));
  };

  // The CSV is of the rows on the screen: the filter they were read with, not what is typed since.
  const loaded = pages.answer;
  const csvQuery = loaded?.filter
    ? [loaded.filter.from ? `from=${loaded.filter.from}` : "", loaded.filter.to ? `to=${loaded.filter.to}` : "", loaded.filter.q ? `q=${encodeURIComponent(loaded.filter.q)}` : ""].filter(Boolean).join("&")
    : "";
  const dayLabel = view?.dayColumn ? (view.columns.find((c) => c.name === view.dayColumn)?.label ?? view.dayColumn) : null;

  return (
    <section className="card" data-section="browse" {...pages.marks}>
      <div className="card-pad" style={{ paddingBottom: 10 }}>
        <h2 className="text-lg mb-1">Browse everything</h2>
        <p className="text-sm text-muted mb-3">
          Every view of the overview, one row per real-world thing. Pick one, narrow it by dates or a search, and take it away as a CSV file for Excel (up to 20,000
          rows).
        </p>
        <form
          className="flex gap-2 wrap"
          style={{ alignItems: "flex-end" }}
          onSubmit={(e) => {
            e.preventDefault();
            show(view, { from, to, q });
          }}
        >
          <div className="field" style={{ minWidth: 240 }}>
            <label htmlFor="overview-view">View</label>
            <select
              id="overview-view"
              className="input"
              data-field="view"
              value={name}
              onChange={(e) => {
                const next = views.find((v) => v.name === e.target.value) ?? null;
                setName(e.target.value);
                setQ("");
                show(next, { from, to, q: "" });
              }}
            >
              <option value="">Choose a view…</option>
              {views.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          {view?.dayColumn && (
            <>
              <div className="field">
                <label htmlFor="overview-from">{dayLabel} from</label>
                <input id="overview-from" type="date" className="input" data-field="from" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="overview-to">to</label>
                <input id="overview-to" type="date" className="input" data-field="to" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          {view && (
            <>
              <div className="field" style={{ flex: "1 1 220px", maxWidth: 360 }}>
                <label htmlFor="overview-search">Search</label>
                <input id="overview-search" className="input" data-field="search" placeholder="A name, a word, a date…" value={q} maxLength={200} onChange={(e) => setQ(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" data-action="browse-show" disabled={pages.busy && !pages.answer}>
                <FiSearch size={13} /> Show
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                data-action="browse-csv"
                disabled={!loaded || csvBusy}
                onClick={() => loaded && void saveFile(() => overviewApi.rowsCsv(loaded.view, csvQuery), setCsvBusy, setCsvError)}
              >
                <FiDownload size={13} /> {csvBusy ? "Making the file…" : "Download as CSV"}
              </button>
            </>
          )}
        </form>
        {view && (
          <p className="text-sm mt-3" data-field="view-comment" data-view={view.name}>
            {view.comment ?? "This view has no description."}
          </p>
        )}
        {pages.error && <div className="text-sm text-danger mt-2">{pages.error}</div>}
        {csvError && <div className="text-sm text-danger mt-2">{csvError}</div>}
      </div>
      {loaded ? (
        <>
          <ResultTable answer={loaded} name="overview-browse" />
          <RowsFooter answer={loaded} busy={pages.busy} onMore={pages.more} name="browse" />
        </>
      ) : (
        pages.busy && <p className="card-pad text-sm text-muted">Reading…</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// the page

export function DatabaseOverviewPage() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [opened, setOpened] = useState<Opened>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!admin) return;
    let live = true;
    setOpened({ state: "loading" });
    overviewApi
      .status()
      .then(async (status) => {
        const [asked, listed] = await Promise.all([overviewApi.questions(), overviewApi.views()]);
        if (live) setOpened({ state: "ready", status, questions: asked.questions, views: listed.views });
      })
      .catch((err) => {
        if (!live) return;
        if (err instanceof ApiError && err.code === "overview-not-set-up") setOpened({ state: "not-set-up", message: err.message });
        else setOpened({ state: "failed", message: messageOf(err, "The database overview could not be read.") });
      });
    return () => {
      live = false;
    };
  }, [admin, attempt]);

  if (!admin) {
    return (
      <div className="empty-state" data-page="database-overview" data-state="not-admin">
        <h2 className="text-xl mb-2">Only the super admin can open this</h2>
        <p className="text-muted">The database overview shows what every department and every person has done. Ask the super admin if you need something from it.</p>
      </div>
    );
  }

  const withAssistant = opened.state === "ready" && opened.status.views.includes("people");
  return (
    <div data-page="database-overview" data-state={opened.state}>
      <div className="mb-4">
        <h1 className="text-2xl mb-1">Database overview</h1>
        <p className="text-muted">
          What DCRS{withAssistant ? " and the Audit Assistant" : ""} hold, in plain words: one row per real-world thing, read straight from the database, so a change made a
          moment ago is already here. Nothing on this page can change anything.
        </p>
        {opened.state === "ready" && (
          <p className="text-xs text-faint mt-1" data-field="connection">
            Reading the database <span className="notranslate" translate="no">{opened.status.database ?? "?"}</span> as{" "}
            <span className="notranslate" translate="no">{opened.status.role ?? "?"}</span>
            {opened.status.readOnly ? ", read-only" : ""} — {plural(opened.status.views.length, "view")}.
          </p>
        )}
      </div>

      {opened.state === "loading" && <p className="text-sm text-muted">Opening the database overview…</p>}

      {opened.state === "not-set-up" && (
        <div className="card" data-section="not-set-up" role="status">
          <div className="card-pad">
            <h2 className="text-lg mb-2">The database overview is not set up on this server yet</h2>
            <p className="text-sm mb-3" data-field="reason">
              {/* The server's reason; its own set-up words follow it, and are said as steps below. */}
              {opened.message.split(" To set it up:")[0]}
            </p>
            <p className="text-sm font-semibold mb-1">To set it up (whoever looks after the server and the database):</p>
            <ol className="text-sm" style={{ paddingLeft: 22, lineHeight: 1.7, margin: 0 }}>
              <li>
                On the DCRS database, as a PostgreSQL superuser, add the overview: <code>npm run db:shared -- setup</code>, with SUPERUSER_DATABASE_URL set to the
                superuser's address and OVERVIEW_VIEWER_PASSWORD to a new password for the read-only role overview_viewer. It applies
                database/sql/01-schemas-and-roles.sql and 02-overview-dcrs.sql and changes nothing of DCRS's own tables.
              </li>
              <li>
                On this server, put <code>OVERVIEW_DATABASE_URL=postgres://overview_viewer:&lt;that password&gt;@&lt;database host&gt;:5432/&lt;DCRS database&gt;</code> in
                backend/.env, and restart DCRS.
              </li>
              <li>Open this page again.</li>
            </ol>
            <p className="text-sm text-muted mt-3">Every step, and what each database role may and may not do, is in docs/database/README.md.</p>
          </div>
        </div>
      )}

      {opened.state === "failed" && (
        <div className="card" data-section="failed" role="alert">
          <div className="card-pad">
            <p className="text-sm mb-3">{opened.message}</p>
            <button type="button" className="btn btn-secondary btn-sm" data-action="overview-retry" onClick={() => setAttempt((n) => n + 1)}>
              <FiRefreshCw size={13} /> Try again
            </button>
          </div>
        </div>
      )}

      {opened.state === "ready" && (
        <>
          {opened.questions.length > 0 && <Questions questions={opened.questions} />}
          <Browse views={opened.views} />
        </>
      )}
    </div>
  );
}
