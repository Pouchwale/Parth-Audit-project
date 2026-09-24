import React, { memo, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FiSearch } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { formatDisplayDate } from "../utils/date";
import { StatusBadge } from "../components/common/StatusBadge";
import { DemoTag } from "../components/common/DemoTag";
import { routeForRecord } from "../engine/reminders";
import { documentsByFormatNumber, namesFormatNumber } from "../engine/formatNumbers";
import { documentOpenRoute } from "../engine/documentRoutes";
import { hrMasterRepository } from "../data/repositories/hrMasterRepository";
import { searchPeople } from "../engine/hrMaster";
import { hrMasterVisible } from "../engine/hrMasterAssistant";
import type { HrMasterPerson } from "../types";
import { createRecordForDocument } from "../engine/recordCrud";
import { todayISO } from "../utils/date";
import type { DocumentDefinition, RecordInstance } from "../types";
import { useT } from "../i18n";
import { documentTextIn } from "../i18n/documentText";
import type { Language } from "../i18n/strings";
import { useProgressiveCount } from "../utils/useProgressive";
import { ensureRecordIndex, recordCells, recordIndexGeneration, searchRecords, subscribeRecordIndex, type RecordHit } from "../engine/recordSearch";
import { recordSummary, searchTerms, snippetFor } from "../engine/recordText";

// ONE SEARCH BOX (REQUIREMENTS §75, §52, §53).
//
// Three answers to what is typed, and they arrive differently on purpose:
//   - DOCUMENTS the words name (by format number however it is written, else by
//     name) and PEOPLE on HR Master Data are worked out as the key is pressed.
//     They are a lookup over a few dozen formats and a few hundred people, and
//     a person typing a format number expects the form at once.
//   - The RECORDS of a format number are its register, listed straight from
//     the document's own records, blank sheets included: asking for F/HR/17 is
//     asking for every day's sheet.
//   - Anything else is looked for IN the records — every word must be written
//     on the record (engine/recordSearch.ts). That answer follows the typing
//     rather than holding it up (useDeferredValue), is read from an index built
//     in idle time and kept up to date record by record, and is drawn a batch
//     of lines at a time (§56), so "2026" on a year of records is as quick to
//     type as a name.

/** Documents the query names — by format number however it is written, else by name or number as typed. */
function documentsFor(query: string): DocumentDefinition[] {
  const q = query.trim();
  if (!q) return [];
  const byNumber = documentsByFormatNumber(q);
  if (byNumber.length > 0) return byNumber;
  if (q.length < 3) return [];
  const lower = q.toLowerCase();
  return documentRepository.getAll().filter((d) => d.name.toLowerCase().includes(lower) || d.formatNo.toLowerCase().includes(lower));
}

/** People on HR Master Data the query names by GP3 No. or name (REQUIREMENTS §53) — only for a viewer with the HR formats. */
function peopleFor(query: string): HrMasterPerson[] {
  const q = query.trim();
  if (q.length < 2 || namesFormatNumber(q) || !hrMasterVisible()) return [];
  return searchPeople(q, hrMasterRepository.all(), 20).candidates;
}

/** Every record of the documents a format number names, newest first — through the scoped query, so only what this person may see (§40). */
function recordsOfDocuments(documentIds: readonly string[], isDemo: boolean): RecordInstance[] {
  const out: RecordInstance[] = [];
  for (const documentId of documentIds) for (const r of recordRepository.query({ documentId, isDemo })) out.push(r);
  return out.sort((a, b) => (a.dueDate !== b.dueDate ? (a.dueDate < b.dueDate ? 1 : -1) : a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

const SHEET_QUERY = /\b(?:hr\s+master|employee\s+master|master\s+sheet|gp\s*-?\s*3)\b/i;

const holdsRecords = (d: DocumentDefinition) => !d.isReferenceOnly && !["chemical-master", "licence", "compliance-statement"].includes(d.kind);

/** How many lines of results are drawn at once; the rest follow a batch at a time. */
const FIRST_LINES = 40;
// How many lines are drawn before the person is asked. A table is laid out
// again, whole, each time lines are added to it, so a list of a thousand costs
// a low-end laptop seconds of work that nobody reads: the newest two hundred
// are drawn, and the rest only when asked for (§56).
const LINES_BEFORE_ASKING = 200;
/** What is looked for in the records needs two letters: one letter is on nearly every record. */
const SHORTEST_CONTENT_QUERY = 2;
const NO_TERMS: string[] = [];
/** About as much of a result's detail as its cell has room to show. */
const DETAIL_CHARS = 90;

// A plain number, not toLocaleString: the first locale-aware format loads the
// browser's number data, about a sixth of a second at a 6x slowdown, all on
// one keystroke — for a count that is never more than a few thousand.
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function SearchPage() {
  const t = useT();
  const { mode, bump, lang, version } = useAppStore();
  const { navigate } = useRouter();
  const [q, setQ] = useState("");
  const [withDrafts, setWithDrafts] = useState(false);
  // The list whose every line was asked for ("Show all"), by its key below.
  const [showAllOf, setShowAllOf] = useState<string | null>(null);
  const isDemo = mode === "demo";

  // Told whenever the index has more, or different, records to offer — as a
  // transition, so redrawing the results as the index fills never holds up a
  // keystroke. (useSyncExternalStore would redraw at once, inside the very
  // slice of idle time the index was using, and on a low-end laptop that was a
  // tenth of a second in which typing went unanswered.) Subscribed before the
  // index is asked for below, so its first news is not missed.
  const [indexGeneration, setIndexGeneration] = useState(recordIndexGeneration);
  useEffect(() => {
    const update = () => startTransition(() => setIndexGeneration(recordIndexGeneration()));
    const stop = subscribeRecordIndex(update);
    update();
    return stop;
  }, []);
  // The index is brought up to date when the page opens and after every change
  // to the records — a save, a colleague's work pulled in — one changed record
  // at a time, never rebuilt from nothing (engine/recordSearch.ts). In an
  // effect, so the first slice of work is never done while the page is drawn.
  useEffect(() => {
    ensureRecordIndex({ isDemo, includeDrafts: withDrafts });
  }, [isDemo, withDrafts, version]);

  // A format number finds the document's records however it is written
  // (F/HR/05, F-HR-05, hr 5 — engine/formatNumbers.ts, REQUIREMENTS §52);
  // anything else is matched as typed.
  const docs = documentsFor(q);
  const numberIds = namesFormatNumber(q) ? documentsByFormatNumber(q).map((d) => d.id) : null;
  const people = peopleFor(q);
  const namesSheet = SHEET_QUERY.test(q) && hrMasterVisible();

  const numberKey = numberIds ? numberIds.join("|") : null;
  const numberRecords = useMemo(
    () => (numberKey === null ? null : recordsOfDocuments(numberKey ? numberKey.split("|") : [], isDemo)),
    [numberKey, isDemo, version]
  );

  const deferredQ = useDeferredValue(q);
  const contentQuery = deferredQ.trim().length >= SHORTEST_CONTENT_QUERY && !namesFormatNumber(deferredQ) ? deferredQ.trim() : "";
  const terms = useMemo(() => searchTerms(contentQuery), [contentQuery]);
  const content = useMemo(
    () => (contentQuery ? searchRecords(contentQuery, { isDemo, includeDrafts: withDrafts }) : null),
    [contentQuery, isDemo, withDrafts, indexGeneration]
  );
  const catchingUp = !numberRecords && q.trim() !== deferredQ.trim();

  const docsById = useMemo(() => new Map(documentRepository.getAll().map((d) => [d.id, d] as const)), [version]);
  // The lines of the results never change identity for a new navigate(), so a
  // line already drawn is not drawn again as more arrive.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const open = useCallback((route: string) => navigateRef.current(route), []);

  // New record is a button, so a record is only ever started when asked for.
  const startRecord = (doc: DocumentDefinition) => {
    const { record } = createRecordForDocument(doc, { dateISO: todayISO(), isDemo });
    bump();
    navigate(routeForRecord(doc, record.id));
  };

  // What the records table shows: a message, or a list and its key. The key
  // remounts the list when the query changes, and once more when the index is
  // complete: useProgressiveCount stays "complete" once a list has been drawn
  // whole, so a list reused for a longer one would draw it all at once (§56).
  // While the index is still being built only the first lines found are shown.
  let countLine = "";
  let message: { text: string; note?: string } | null = null;
  let listKey = "";
  let listRows: readonly Listed[] = [];
  let listTerms: readonly string[] = NO_TERMS;
  if (numberRecords) {
    if (numberRecords.length === 0) message = { text: "No matches." };
    else {
      countLine = `${plural(numberRecords.length, "record")} on file`;
      listKey = `n|${numberKey}`;
      listRows = numberRecords;
    }
  } else if (q.trim().length < SHORTEST_CONTENT_QUERY) {
    message = { text: "Type at least two letters to look in what the records say." };
  } else if (!content) {
    // For the moment the answer is a keystroke behind the box.
    message = { text: "Searching..." };
  } else if (content.total === 0) {
    message = content.ready
      ? { text: "No matches.", note: withDrafts ? undefined : "Blank sheets and sheets only the assistant has prepared were not looked in — tick the box above to include them." }
      : { text: "Still indexing..." };
  } else {
    countLine = content.ready
      ? `${plural(content.total, "record")} ${content.total === 1 ? "matches" : "match"}${terms.length > 1 ? " every word" : ""}`
      : `Still indexing... ${plural(content.total, "record")} found so far`;
    listKey = `c|${contentQuery}|${content.ready ? 1 : 0}|${withDrafts ? 1 : 0}`;
    listRows = content.ready ? content.hits : content.hits.slice(0, FIRST_LINES);
    listTerms = terms;
  }
  const showAll = listKey !== "" && showAllOf === listKey;
  const drawnRows = showAll ? listRows : listRows.slice(0, LINES_BEFORE_ASKING);
  const notDrawn = listRows.length - drawnRows.length;

  return (
    <div>
      <h1 className="text-2xl mb-1">{t("search.title")}</h1>
      <p className="text-muted mb-4">
        Search by format number (F/HR/05, F-QC-30 — any way it is written), document, or anything written on a record: record ID, date, area, employee, checker, PC ID,
        machine number, job name, PO number, batch number, a remark or status. Type several words to find the records that have every one of them.
      </p>
      <div className="field mb-2" style={{ maxWidth: 480 }}>
        <div className="input flex items-center gap-2" style={{ padding: "4px 10px" }}>
          <FiSearch size={15} className="text-faint" />
          <input
            autoFocus
            style={{ border: "none", outline: "none", flex: 1, fontSize: 13.5 }}
            placeholder="e.g. F/HR/05, PC-04, Roshni, 2026-09, Rejected…"
            data-field="search-query"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      {/* After the search box, never before it: the suites take the page's first input to be the box. */}
      <label className="flex items-center gap-2 text-sm text-muted mb-4">
        <input type="checkbox" data-field="search-include-drafts" checked={withDrafts} onChange={(e) => setWithDrafts(e.target.checked)} />
        Also look in blank sheets and sheets only the assistant has prepared
      </label>

      {(people.length > 0 || namesSheet) && (
        <div className="mb-5" data-section="search-people">
          <div className="flex items-center justify-between mb-2 wrap gap-2">
            <h3 className="text-sm uppercase text-muted">People — HR Master Data</h3>
            <button className="btn btn-secondary btn-sm" data-action="search-open-hr-master" onClick={() => navigate("/hr/master-data")}>
              Open HR Master Data
            </button>
          </div>
          {people.length > 0 && (
            <div className="doc-table">
              <table>
                <thead>
                  <tr>
                    <th>GP3 No.</th>
                    <th>Full Name</th>
                    <th>Department</th>
                    <th>Designation/Position</th>
                    <th>Joining Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.id} data-search-person={p.id}>
                      <td className="font-semibold">{p.gp3No || "—"}</td>
                      <td>{p.fullName}</td>
                      <td className="text-sm">{p.department}</td>
                      <td className="text-sm">{p.designation}</td>
                      <td className="text-sm">{p.joiningDate ? formatDisplayDate(p.joiningDate) : "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          data-action="search-show-person"
                          onClick={() => {
                            hrMasterRepository.setPendingFilter(p.gp3No || p.fullName);
                            navigate("/hr/master-data");
                          }}
                        >
                          Show on the sheet
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {docs.length > 0 && (
        <div className="mb-5" data-section="search-documents">
          <h3 className="text-sm uppercase text-muted mb-2">Documents</h3>
          <div className="doc-table">
            <table>
              <thead>
                <tr>
                  <th>Format No.</th>
                  <th>Document</th>
                  <th>Module</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} data-search-document={d.id}>
                    <td className="font-semibold" translate="no">
                      {d.formatNo}
                    </td>
                    <td>{d.name}</td>
                    <td className="text-sm text-muted">
                      {t(`module.${d.module}`)}
                      {d.section ? ` · ${d.section}` : ""}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="flex gap-2 justify-end wrap">
                        <button className="btn btn-secondary btn-sm" data-action="search-open-document" onClick={() => navigate(documentOpenRoute(d))}>
                          Open document
                        </button>
                        {holdsRecords(d) && (
                          <button className="btn btn-primary btn-sm" data-action="search-new-record" onClick={() => startRecord(d)}>
                            New record
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {q.trim() && (
        <>
          {countLine && (
            <p className="text-sm text-muted mb-2" data-search-count>
              {countLine}
            </p>
          )}
          <div className="doc-table" data-section="search-records" style={catchingUp ? { opacity: 0.6 } : undefined}>
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Detail</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {message ? (
                  <MessageRow text={message.text} note={message.note} />
                ) : listKey ? (
                  <ResultLines key={showAll ? `${listKey}|all` : listKey} rows={drawnRows} terms={listTerms} docsById={docsById} lang={lang} onOpen={open} />
                ) : null}
              </tbody>
            </table>
          </div>
          {notDrawn > 0 && (
            <div className="flex items-center gap-2 wrap mt-2 text-sm text-muted">
              The newest {LINES_BEFORE_ASKING} are shown.
              <button className="btn btn-secondary btn-sm" data-action="search-show-all" onClick={() => setShowAllOf(listKey)}>
                Show all {plural(listRows.length, "record")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MessageRow({ text, note }: { text: string; note?: string }) {
  return (
    <tr>
      <td colSpan={5} className="text-muted text-center" style={{ padding: 24 }}>
        {text}
        {note && <div className="text-sm mt-1">{note}</div>}
      </td>
    </tr>
  );
}

type Listed = RecordHit | RecordInstance;

/** The lines of results, a batch at a time (§56). */
function ResultLines({
  rows,
  terms,
  docsById,
  lang,
  onOpen,
}: {
  rows: readonly Listed[];
  terms: readonly string[];
  docsById: Map<string, DocumentDefinition>;
  lang: Language;
  onOpen: (route: string) => void;
}) {
  const shown = useProgressiveCount(rows.length, FIRST_LINES, 60);
  return (
    <>
      {rows.slice(0, shown).map((r) => (
        <ResultLine key={r.id} item={r} doc={docsById.get(r.documentId)} terms={terms} lang={lang} onOpen={onOpen} />
      ))}
    </>
  );
}

// One result. Its detail — the value that holds the search words, under its
// heading and on its line of the form — is worked out only for a line that is
// drawn, and once: a line already on screen is not redrawn as more arrive.
const ResultLine = memo(function ResultLine({
  item,
  doc,
  terms,
  lang,
  onOpen,
}: {
  item: Listed;
  doc: DocumentDefinition | undefined;
  terms: readonly string[];
  lang: Language;
  onOpen: (route: string) => void;
}) {
  const detail = useMemo(() => {
    const cells = "cells" in item ? item.cells : recordCells(item);
    return terms.length > 0 ? snippetFor(cells, terms) : recordSummary(cells);
  }, [item, terms]);
  const route = routeForRecord(doc, item.id);
  return (
    <tr className="card-clickable" data-search-record={item.id} onClick={() => onOpen(route)}>
      <td>
        {documentTextIn(doc?.name ?? item.documentId, lang)} {item.isDemo && <DemoTag />}
      </td>
      <td>{formatDisplayDate(item.dueDate)}</td>
      <td>
        <StatusBadge status={item.status} />
      </td>
      {/* On one line, and no longer than the cell can show (the whole of it on
          hover): laying the table out was the slowest part of a search on a
          low-end laptop, a wrapped line of prose in every row, and Gujarati
          or Hindi text is shaped letter by letter even where it is cut off. */}
      <td className="text-sm text-muted" title={detail} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 380 }}>
        {detail.length > DETAIL_CHARS ? `${detail.slice(0, DETAIL_CHARS - 1)}…` : detail || "—"}
      </td>
      <td style={{ textAlign: "right" }}>
        <button className="btn btn-ghost btn-sm">Open</button>
      </td>
    </tr>
  );
});
