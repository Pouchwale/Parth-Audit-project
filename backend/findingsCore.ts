// THE CAPA FINDINGS AS ANOTHER SYSTEM SEES THEM (REQUIREMENTS §83).
//
// The Audit Assistant reads and closes DCRS's internal CAPA findings through
// the DCRS API (backend/apiV1.ts), and the database overview shows the same
// findings (overview.findings, database/sql/02-overview-dcrs.sql). Both must
// name a finding the same way, show the same status, and — when one is closed
// through the API — change exactly what DCRS's own Close button changes. This
// file is that one rule, written once.
//
// PURE: no imports at all, not even types, so the server runs it as it is and
// the frontend's unit tests bundle it next to DCRS's own engine
// (frontend/tests/findingsCloseEquivalence.test.ts proves the close is the
// page's close). Nothing here reads a clock or a database: "today" and "now"
// are handed in.
//
// WHERE A FINDING LIVES. An internal CAPA finding is one line of
// data.findings[] of a record of the document "gap-inspection"
// (frontend/src/types/record.ts GapFinding). It has no table of its own and no
// readable number of its own, so one is made here:
//
//   CAPA-<day tag>-<number>        for example CAPA-2023-12-13-1
//
//   * the day tag is the report's date (its dueDate). When two or more live
//     reports share a date, they are put in the order they were made
//     (createdAt as plain text, then the record id); the first keeps the plain
//     date, the second gets "b", the third "c" ... the 26th "z", and after that
//     "-27", "-28" and so on: 2023-12-13, 2023-12-13b, 2023-12-13c.
//   * the number is the finding's own S.No when it is a whole number above
//     zero, otherwise its place in the list (1, 2, 3 ...).
//   * when an earlier finding of the same report already has that name, ".2",
//     ".3" ... is added: CAPA-2023-12-13-3.2 is the second finding numbered 3.
//
// A readable id can change if a report is added for an earlier moment of the
// same date, or a finding is renumbered. The STABLE reference, which never
// changes, is "<record id>:<finding id>". The API gives both and accepts
// either.

/** The document whose records hold the internal CAPA findings. */
export const CAPA_DOCUMENT_ID = "gap-inspection";

/** The four statuses a finding can have, as people see them. */
export type FindingStatus = "Open" | "Overdue" | "Closed" | "Verified";

/** A stored record, as far as this file needs to know it. Everything is read defensively: stored data is what it is. */
export interface StoredRecord {
  id: string;
  documentId: string;
  dueDate?: unknown;
  status?: unknown;
  isDemo?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  data?: unknown;
  history?: unknown;
}

/** One line of a record's history, in DCRS's own shape (frontend/src/types/record.ts HistoryEntry). */
export interface HistoryLine {
  id: string;
  at: string;
  by: string;
  action: "edited";
  note: string;
  changes: FieldChangeLine[];
}

/** One changed field, in DCRS's own shape (frontend/src/types/record.ts FieldChange). */
export interface FieldChangeLine {
  field: string;
  label: string;
  before: string;
  after: string;
}

/** A finding with the names this file gives it. */
export interface IdentifiedFinding<R extends StoredRecord = StoredRecord> {
  /** The readable id, for example CAPA-2023-12-13-1. */
  id: string;
  /** The stable reference "<record id>:<finding id>"; null for a finding stored without an id of its own. */
  ref: string | null;
  /** The report (record) the finding belongs to. */
  record: R;
  /** The finding as stored. */
  finding: Readonly<Record<string, unknown>>;
  /** Where it sits in the report's list of findings, from 0. */
  position: number;
  /** Its number: the S.No when that is a whole number above zero, otherwise its place in the list. */
  number: number;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const order = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A live record: one a person made, never the synthetic Demo Mode data. DCRS's own lists ask for isDemo === false. */
export function isLiveRecord(record: { isDemo?: unknown }): boolean {
  return record.isDemo === false;
}

/** The findings of a report, as stored (an empty list when there are none). */
export function findingsOf(record: StoredRecord): readonly unknown[] {
  const data = record.data as { findings?: unknown } | null | undefined;
  return data && typeof data === "object" && Array.isArray(data.findings) ? data.findings : [];
}

/** The day tag of the n-th report (from 1) of one date: the date, then "b" to "z", then "-27" onwards. */
export function dayTag(date: string, n: number): string {
  if (n <= 1) return date;
  if (n <= 26) return date + String.fromCharCode(96 + n);
  return `${date}-${n}`;
}

/** The finding's number: its S.No when that is a whole number above zero, otherwise its place in the list plus one. */
export function findingNumber(finding: Readonly<Record<string, unknown>>, position: number): number {
  const sNo = finding.sNo;
  return typeof sNo === "number" && Number.isInteger(sNo) && sNo > 0 ? sNo : position + 1;
}

/**
 * Every internal CAPA finding of the LIVE reports among `records`, named.
 * `records` may be the whole stored list: only live gap-inspection records are
 * read. The order is by report date, then report, then place in the report.
 */
export function identifyFindings<R extends StoredRecord>(records: readonly R[]): IdentifiedFinding<R>[] {
  const byDate = new Map<string, R[]>();
  for (const record of records) {
    if (!record || record.documentId !== CAPA_DOCUMENT_ID || !isLiveRecord(record)) continue;
    const date = text(record.dueDate);
    const list = byDate.get(date);
    if (list) list.push(record);
    else byDate.set(date, [record]);
  }
  const out: IdentifiedFinding<R>[] = [];
  for (const date of [...byDate.keys()].sort(order)) {
    const reports = byDate.get(date)!.slice().sort((a, b) => order(text(a.createdAt), text(b.createdAt)) || order(a.id, b.id));
    reports.forEach((record, index) => {
      const tag = dayTag(date, index + 1);
      const seen = new Map<string, number>();
      findingsOf(record).forEach((value, position) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return;
        const finding = value as Readonly<Record<string, unknown>>;
        const number = findingNumber(finding, position);
        const base = `CAPA-${tag}-${number}`;
        const k = (seen.get(base) ?? 0) + 1;
        seen.set(base, k);
        const own = typeof finding.id === "string" && finding.id ? finding.id : null;
        out.push({ id: k === 1 ? base : `${base}.${k}`, ref: own ? `${record.id}:${own}` : null, record, finding, position, number });
      });
    });
  }
  return out;
}

/**
 * The finding someone named: a readable id (spaces around it and the case of
 * its letters do not matter) or the stable reference "<record id>:<finding id>".
 */
export function findFinding<R extends StoredRecord>(findings: readonly IdentifiedFinding<R>[], given: string): IdentifiedFinding<R> | undefined {
  const wanted = given.trim();
  if (!wanted) return undefined;
  const byRef = findings.find((f) => f.ref !== null && f.ref === wanted);
  if (byRef) return byRef;
  const lower = wanted.toLowerCase();
  return findings.find((f) => f.id.toLowerCase() === lower);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The status as people see it (DCRS's own rule, frontend/src/data/selectors.ts
 * refreshGapFindingStatuses): Closed or Verified as stored; otherwise Overdue
 * when the target date is a date before the factory's today and no date of
 * action is filled in; otherwise Open. `today` is YYYY-MM-DD in the factory's
 * time zone.
 */
export function findingStatus(finding: Readonly<Record<string, unknown>>, today: string): FindingStatus {
  const stored = finding.status;
  if (stored === "Closed" || stored === "Verified") return stored;
  const target = text(finding.targetDate);
  const acted = finding.actualDateOfAction;
  const noActionDate = acted === null || acted === undefined || acted === "";
  return DATE_RE.test(target) && target < today && noActionDate ? "Overdue" : "Open";
}

/** "open" means Open or Overdue; "closed" means Closed or Verified. */
export function isOpenStatus(status: FindingStatus): boolean {
  return status === "Open" || status === "Overdue";
}

// ---------------------------------------------------------------------------
// closing a finding, exactly as DCRS's own Close button does

/** Why a close is refused: each is a 409 of the API with this code. */
export type CloseRefusal = "already-closed" | "report-verified" | "report-sent-back" | "report-locked";

/** The report statuses in which DCRS's page offers Close on a finding (pages/GapPage.tsx canClose). */
const CLOSABLE_REPORT_STATUSES = ["Scheduled", "Due", "In Progress", "Submitted", "Pending Verification"];

/**
 * Whether DCRS would let this finding be closed, and if not, why. A closed
 * finding is said first, since that is what a person asked about. Then the
 * report: a verified report must be reopened for correction in DCRS first
 * ("Edit"), and a report sent back must be resumed first ("Resume").
 */
export function closeRefusal(record: StoredRecord, finding: Readonly<Record<string, unknown>>): CloseRefusal | null {
  if (finding.status === "Closed" || finding.status === "Verified") return "already-closed";
  if (record.status === "Verified") return "report-verified";
  if (record.status === "Rejected") return "report-sent-back";
  if (!CLOSABLE_REPORT_STATUSES.includes(text(record.status))) return "report-locked";
  return null;
}

/** What the calling server is called in DCRS's audit trail when it does not say. */
export const DEFAULT_CLIENT_NAME = "DCRS API";
const MAX_CLIENT_NAME = 40;

/**
 * The name the calling server gave itself in the X-Client-Name header, made
 * safe for the audit trail: printable characters only (no colon, which would
 * end the name where it is read back), spaces tidied, at most 40 characters.
 * Absent or empty: "DCRS API".
 */
export function clientName(header: unknown): string {
  const raw = Array.isArray(header) ? header[0] : header;
  const clean = text(raw)
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/:/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CLIENT_NAME)
    .trim();
  return clean || DEFAULT_CLIENT_NAME;
}

/** The note of a change made through the API: "Through <client>: <the person's note>". */
export function throughNote(client: string, note: string): string {
  return `Through ${client}: ${note}`;
}

// What DCRS's history calls a finding's row and the two fields a close changes
// (engine/recordHistory.ts rowName, COLLECTION_LABELS.findings and KEY_LABELS).
const ROW_NAME_KEYS = ["time", "startTime", "pcId", "parameter", "areaName", "employeeName", "trapBoxNo", "srNo", "sNo", "activity"];
const FIELD_LABELS: Record<string, string> = { status: "Status", actualDateOfAction: "Actual date of action" };

// A line's own number at the start of its words, the rule of frontend/src/engine/lineNumbers.ts (this file imports nothing).
const OWN_NUMBER = /^\s*\(?0*(\d{1,3})\s*[.)](?:\s+|(?=\p{L}))/u;
function withoutLineNumber(text: string, lineNumber: number): string {
  const m = OWN_NUMBER.exec(text);
  return m && Number(m[1]) === lineNumber ? text.slice(m[0].length) : text;
}

// The line's own number said once, as engine/recordHistory.ts says it (REQUIREMENTS §102): "Finding 2", never "Finding 2 (2)".
function rowName(row: Readonly<Record<string, unknown>>, index: number): string {
  const own = String(index + 1);
  for (const key of ROW_NAME_KEYS) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      const name = String(withoutLineNumber(value.trim(), index + 1)).split(" (")[0];
      return name && name !== own ? `${own} (${name})` : own;
    }
    if (typeof value === "number") return value === index + 1 ? own : `${own} (${value})`;
  }
  return own;
}

function shown(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/**
 * The changes DCRS's history lists for one finding going from `before` to
 * `after` when nothing else of the record changed — what
 * engine/recordHistory.ts diffRecordData gives for that edit: the finding's
 * fields in their stored order, then any field it did not have before.
 */
export function findingChanges(before: Readonly<Record<string, unknown>>, after: Readonly<Record<string, unknown>>, position: number): FieldChangeLine[] {
  const path = `findings[#${typeof before.id === "string" ? before.id : String(position)}]`;
  const row = `Finding ${rowName(after, position)}`;
  const keys = [...Object.keys(before), ...Object.keys(after).filter((k) => !Object.prototype.hasOwnProperty.call(before, k))];
  const changes: FieldChangeLine[] = [];
  for (const key of keys) {
    if (key === "id") continue;
    const a = before[key];
    const b = after[key];
    // Lists and groups inside a finding are never changed by a close.
    if ((a !== null && typeof a === "object") || (b !== null && typeof b === "object")) continue;
    if (shown(a) === shown(b)) continue;
    const label = FIELD_LABELS[key] ?? key;
    changes.push({ field: `${path}.${key}`, label: `${row} · ${label}`, before: shown(a), after: shown(b) });
  }
  return changes;
}

export interface CloseOptions {
  /** The factory's today, YYYY-MM-DD: the date of action DCRS's Close button stamps. */
  today: string;
  /** Now, as an ISO timestamp (new Date().toISOString()): the history entry's time and the record's updatedAt. */
  at: string;
  /** The signed-in person's name, as DCRS writes it in a record's history. */
  by: string;
  /** The note of the history entry, already "Through <client>: <note>". */
  note: string;
  /** The history entry's id. */
  historyId: string;
}

/**
 * The record after closing the finding at `position`, exactly as DCRS's Close
 * button leaves it (pages/GapPage.tsx closeFinding, saved by
 * engine/recordLifecycle.ts saveDraft): the finding's status becomes "Closed"
 * and its date of action today; a report that was Due or Scheduled becomes In
 * Progress, any other keeps its status; updatedAt is now; and one "edited"
 * entry is added to its history with the changes listed and the note.
 *
 * Unlike a person's run of edits on the page, the entry is never folded into
 * an earlier one: each close through the API keeps its own note.
 * `record` is not changed; a new record is returned.
 */
export function closeFindingChange<R extends StoredRecord>(record: R, position: number, options: CloseOptions): { record: R; entry: HistoryLine } {
  const findings = findingsOf(record);
  const before = findings[position] as Readonly<Record<string, unknown>>;
  const after = { ...before, status: "Closed", actualDateOfAction: options.today };
  const data = { ...(record.data as Record<string, unknown>), findings: findings.map((f, i) => (i === position ? after : f)) };
  const entry: HistoryLine = { id: options.historyId, at: options.at, by: options.by, action: "edited", note: options.note, changes: findingChanges(before, after, position) };
  const history = Array.isArray(record.history) ? record.history : [];
  const status = record.status === "Due" || record.status === "Scheduled" ? "In Progress" : record.status;
  return { record: { ...record, data, history: [...history, entry], status, updatedAt: options.at }, entry };
}

/** What DCRS calls a record in its activity log (engine/recordHistory.ts recordLabel). */
export function recordLabel(document: { name?: string; formatNo?: string } | undefined, documentId: string, dueDate: string): string {
  const formatNo = document?.formatNo ?? "";
  const number = document && !formatNo.startsWith("TO BE") ? `${formatNo} ` : "";
  return `${number}${document?.name ?? documentId} — ${dueDate}`;
}

/** The activity-log detail of a history entry, as DCRS writes it (engine/recordHistory.ts logEntry): the note, then the fields changed. */
export function activityDetail(entry: { note?: string; changes?: readonly { label: string }[]; moreChanges?: number }): string {
  const changes = entry.changes ?? [];
  const changed = changes.length ? `${changes.length + (entry.moreChanges ?? 0)} field(s): ${changes.slice(0, 4).map((c) => c.label).join(", ")}` : "";
  return [entry.note, changed].filter(Boolean).join(" · ");
}
