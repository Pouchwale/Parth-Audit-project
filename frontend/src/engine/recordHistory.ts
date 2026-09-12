import type { FieldChange, HistoryAction, HistoryEntry, RecordInstance } from "../types";
import { generateId } from "../utils/id";

// THE RECORD'S CHANGE HISTORY. A controlled record may be corrected — a wrong
// number, a misspelt name, a check point answered the wrong way — but the
// correction must never erase what the record said before, who changed it,
// when and why. That is the difference between correcting a record and
// falsifying one, and it is the first thing an auditor asks to see.
//
// Everything here is pure: given two versions of a record's data it says,
// in words a person can read, what changed; and it appends to (never
// rewrites) the record's history.

// How many changes one history entry lists before summarising the rest.
const MAX_CHANGES_PER_ENTRY = 60;
// Successive saves by the same person within this window read as one edit.
const COALESCE_WINDOW_MS = 15 * 60 * 1000;

const BLANK = "";

// ---------------------------------------------------------------------------
// readable labels

const KEY_LABELS: Record<string, string> = {
  catchCountApprox: "Flies catch count",
  tubeLightInstallDate: "Tube light installed",
  tubeLightDueDate: "Tube light due",
  cleaningDoneBy: "Cleaning done by",
  verifiedBy: "Verified by",
  timeOfChecking: "Time of checking",
  checker: "Checker",
  isHoliday: "Holiday",
  trapBoxNo: "Trap box",
  qtyUsed: "Quantity used",
  materialName: "Material",
  methodOfApplication: "Method of application",
  technicianSign: "Technician's sign",
  customerSign: "Customer's sign",
  findingOfInspection: "Finding",
  commentsOnFindings: "Comments on finding",
  correctiveActionClient: "Corrective action (client)",
  correctiveActionContractor: "Corrective action (contractor)",
  targetDate: "Target date",
  actualDateOfAction: "Actual date of action",
  verifiedByServiceProvider: "Verified by service provider",
  descriptionOfObservation: "Description of observation",
  dateOfObservation: "Date of observation",
  actionTaken: "Action taken",
  employeeName: "Employee",
  attended: "Attended",
  certificateRef: "Certificate reference",
  trainingDate: "Training date",
  trainingType: "Training type",
  trainerProvider: "Trainer / provider",
  lotStatus: "Lot status",
  deviationReason: "Reason for deviation",
  monthYear: "Month & year",
  reportDate: "Date",
  toName: "To",
  toDesignation: "To (designation)",
  subject: "Subject",
  customerName: "Customer name",
  fgCode: "FG code",
  complaintReceivedOn: "Complaint received on",
  jobName: "Job name",
  complaintType: "Complaint type",
  complaintSubType: "Complaint sub type",
  scenario: "Scenario",
  rootCause: "Root cause",
  correctiveAction: "Corrective action",
  preventiveAction: "Preventive action",
  acknowledgement: "Acknowledgement",
  employeeSignDate: "Employee's date",
};

function words(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

// What a row is called when a person reads it: its time slot, its unit, its
// parameter, its area — whatever identifies it on the paper form.
const ROW_NAME_KEYS = ["time", "startTime", "pcId", "parameter", "areaName", "employeeName", "trapBoxNo", "srNo", "sNo", "activity"];

function rowName(row: unknown, index: number): string {
  if (row && typeof row === "object") {
    const r = row as Record<string, unknown>;
    for (const k of ROW_NAME_KEYS) {
      const v = r[k];
      if (typeof v === "string" && v.trim()) return `${index + 1} (${v.trim().split(" (")[0]})`;
      if (typeof v === "number") return `${index + 1} (${v})`;
    }
  }
  return String(index + 1);
}

const COLLECTION_LABELS: Record<string, string> = {
  rows: "Row",
  entries: "Unit",
  lines: "Area",
  findings: "Finding",
  attendees: "Attendee",
  summaryActions: "Action",
  rodentCatches: "Catch",
  topics: "Topic",
  items: "Item",
  sections: "Section",
  photos: "Photo",
};

// ---------------------------------------------------------------------------
// flatten a record's data into readable leaves

interface Leaf {
  label: string;
  value: string;
}

function show(value: unknown): string {
  if (value === null || value === undefined) return BLANK;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/**
 * Walks a record's data and returns every leaf value keyed by a stable path.
 * Array elements are keyed by their own id where they have one, so inserting
 * a row doesn't make every row below it look "changed".
 */
function flatten(value: unknown, path: string, label: string, out: Map<string, Leaf>, labels: Record<string, string>): void {
  if (Array.isArray(value)) {
    const collection = COLLECTION_LABELS[path.split(".").pop()?.replace(/\[.*$/, "") ?? ""] ?? "Item";
    value.forEach((item, i) => {
      const id = item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id : String(i);
      const itemPath = `${path}[#${id}]`;
      const itemLabel = `${label ? label + " · " : ""}${collection} ${rowName(item, i)}`;
      if (item === null || typeof item !== "object") out.set(itemPath, { label: itemLabel, value: show(item) });
      else flatten(item, itemPath, itemLabel, out, labels);
    });
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "id") continue;
      const childPath = path ? `${path}.${k}` : k;
      // checkpoints.7.value -> "Check point 7"; checkpoints.7.note -> "Check point 7 note"
      let childLabel: string;
      // A list reads by its items ("Row 3 (11:00)"), not "Rows · Row 3".
      // The header of a log sheet reads by its fields ("Operator Name"), too.
      if ((Array.isArray(v) && COLLECTION_LABELS[k]) || k === "header") childLabel = label;
      else if (path === "checkpoints" && /^\d+$/.test(k)) childLabel = `Check point ${k}`;
      else if (/^checkpoints\.\d+$/.test(path) && k === "value") childLabel = label;
      else if (/^checkpoints\.\d+$/.test(path) && k === "note") childLabel = `${label} note`;
      else childLabel = `${label ? label + " · " : ""}${labels[k] ?? words(k)}`;
      flatten(v, childPath, childLabel, out, labels);
    }
    return;
  }
  out.set(path, { label, value: show(value) });
}

/** Rows (array elements) present on only one side, so they can be reported once. */
function rowKeys(map: Map<string, Leaf>): Map<string, string> {
  const rows = new Map<string, string>();
  for (const [path, leaf] of map) {
    const m = path.match(/^(.*?\[#[^\]]+\])/);
    if (m && !rows.has(m[1])) rows.set(m[1], leaf.label.split(" · ").slice(0, -1).join(" · ") || leaf.label);
  }
  return rows;
}

/**
 * What changed between two versions of a record's data, in words.
 * `labels` maps a field key to the label printed on the form (a log sheet's
 * column headings), which reads better than the generated one.
 */
export function diffRecordData(before: unknown, after: unknown, labels: Record<string, string> = {}): FieldChange[] {
  const a = new Map<string, Leaf>();
  const b = new Map<string, Leaf>();
  flatten(before, "", "", a, labels);
  flatten(after, "", "", b, labels);
  const rowsA = rowKeys(a);
  const rowsB = rowKeys(b);
  const changes: FieldChange[] = [];
  const skipPrefixes: string[] = [];

  for (const [row, label] of rowsA) {
    if (!rowsB.has(row)) {
      changes.push({ field: row, label, before: "(row present)", after: "(row removed)" });
      skipPrefixes.push(row);
    }
  }
  for (const [row, label] of rowsB) {
    if (!rowsA.has(row)) {
      changes.push({ field: row, label, before: "(no row)", after: "(row added)" });
      skipPrefixes.push(row);
    }
  }
  const skipped = (path: string) => skipPrefixes.some((p) => path === p || path.startsWith(p + ".") || path.startsWith(p + "["));

  const paths = new Set([...a.keys(), ...b.keys()]);
  for (const path of paths) {
    if (skipped(path)) continue;
    const va = a.get(path)?.value ?? BLANK;
    const vb = b.get(path)?.value ?? BLANK;
    if (va === vb) continue;
    changes.push({ field: path, label: (b.get(path) ?? a.get(path))!.label, before: va, after: vb });
  }
  return changes;
}

// ---------------------------------------------------------------------------
// appending

function capped(changes: FieldChange[]): { changes: FieldChange[]; moreChanges?: number } {
  if (changes.length <= MAX_CHANGES_PER_ENTRY) return { changes };
  return { changes: changes.slice(0, MAX_CHANGES_PER_ENTRY), moreChanges: changes.length - MAX_CHANGES_PER_ENTRY };
}

export function makeEntry(action: HistoryAction, by: string, extra: Partial<Omit<HistoryEntry, "id" | "action" | "by">> = {}): HistoryEntry {
  return { id: generateId("hist"), at: new Date().toISOString(), by, action, ...extra };
}

/**
 * Appends an entry. Two consecutive plain edits by the same person within a
 * few minutes are folded into one — each field keeps its ORIGINAL "before"
 * and its latest "after", and a field changed and then changed back drops
 * out — so autosave doesn't bury the history in keystrokes. Nothing else is
 * ever merged or removed.
 */
export function appendHistory<T>(record: RecordInstance<T>, entry: HistoryEntry): RecordInstance<T> {
  const history = (record.history ?? []).slice();
  const last = history[history.length - 1];
  const foldable =
    last &&
    (entry.action === "edited" || entry.action === "assistant-edit") &&
    last.action === entry.action &&
    last.by === entry.by &&
    Date.parse(entry.at) - Date.parse(last.at) < COALESCE_WINDOW_MS;

  if (foldable && entry.changes) {
    const merged = new Map<string, FieldChange>();
    for (const c of last.changes ?? []) merged.set(c.field, { ...c });
    for (const c of entry.changes) {
      const prior = merged.get(c.field);
      merged.set(c.field, prior ? { ...c, before: prior.before } : { ...c });
    }
    const net = Array.from(merged.values()).filter((c) => c.before !== c.after);
    history.pop();
    if (net.length > 0) {
      const { changes, moreChanges } = capped(net);
      history.push({ ...last, at: entry.at, changes, moreChanges: (moreChanges ?? 0) + (last.moreChanges ?? 0) + (entry.moreChanges ?? 0) || undefined });
    }
    return { ...record, history };
  }

  if (entry.changes) {
    const { changes, moreChanges } = capped(entry.changes);
    entry = { ...entry, changes, moreChanges: moreChanges ?? entry.moreChanges };
  }
  history.push(entry);
  return { ...record, history };
}

/** Records the data change (if any) that `next` makes to `record`. */
export function withEditHistory<T>(
  record: RecordInstance<T>,
  nextData: T,
  by: string,
  opts: { action?: "edited" | "assistant-edit"; note?: string; labels?: Record<string, string> } = {}
): RecordInstance<T> {
  const changes = diffRecordData(record.data, nextData, opts.labels);
  const updated: RecordInstance<T> = { ...record, data: nextData };
  if (changes.length === 0) return updated;
  return appendHistory(updated, makeEntry(opts.action ?? "edited", by, { changes, note: opts.note }));
}

// ---------------------------------------------------------------------------
// reading

/**
 * The record's timeline, oldest first. Records saved before the history
 * field existed (and Demo records, which are generated with their stamps set)
 * get one derived from the stamps on the record, so every record shows a
 * history — clearly marked as reconstructed from the stamps.
 */
export function historyOf(record: RecordInstance): HistoryEntry[] {
  if (record.history && record.history.length > 0) return record.history;
  const derived: HistoryEntry[] = [];
  const add = (action: HistoryAction, at: string | undefined, by: string | undefined, note?: string) => {
    if (at) derived.push({ id: `derived-${action}`, at, by: by || "—", action, note });
  };
  add("prepared", record.prepared?.at, record.prepared ? "Assistant" : undefined, record.prepared?.basedOn ? `Based on ${record.prepared.basedOn}` : undefined);
  add("submitted", record.submittedAt, record.submittedBy);
  add("rejected", record.rejectedAt, record.rejectedBy, record.rejectionReason);
  add("verified", record.verifiedAt, record.verifiedBy);
  return derived.sort((x, y) => x.at.localeCompare(y.at));
}

export function historyIsDerived(record: RecordInstance): boolean {
  return !record.history || record.history.length === 0;
}
