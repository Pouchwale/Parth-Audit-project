import type { LogColumn, LogSheetData, LogSheetLayout, RecordInstance } from "../types";
import { daysInMonth, formatDisplayDate } from "../utils/date";

// WHAT A RECORD SAYS, AS ONE SEARCHABLE TEXT (REQUIREMENTS §75).
//
// Search used to know, kind by kind, which few fields of a record were worth
// looking in: the checker of a pest round, the PC IDs of a fly catcher sheet,
// the customer of a complaint. Everything it had not been told about could not
// be found — a CAPA's root cause, a service report's remarks, a training's
// topics, who submitted or sent a record back and why, and the whole service
// agreement. A new format was invisible to Search until somebody remembered it.
//
// So this walks EVERY record the same way, whatever its kind: the log sheets
// through their layout (so each value is known by its column's printed heading),
// and every other kind by walking its data, naming each value by its field.
// Two things come out:
//   - `text`, everything written on the record, lower-cased and NFC-normalised
//     (a Gujarati or Hindi word typed on one keyboard is the same letters as
//     the one stored from another), one value per line, for a plain substring
//     test per search word;
//   - `cells`, the same values one by one with where they sit — "Row 3 ·
//     Operator: Gaurav Singh", "Qc+Slitting · Lux Level: 450" — so a hit can
//     say WHERE on the record the words were found.
//
// WHAT IS LEFT OUT, and why:
//   - ids, and the base64 photographs and scans a complaint acknowledgement or
//     a signed agreement carries inside the record ("data:" strings, dataUrl
//     fields) — hundreds of kilobytes that no person would ever search for;
//   - a correction's copy of what the record said before it was reopened, and
//     each history entry's list of changes: those are the record's past, and
//     would make a record answer to words it no longer says;
//   - a log sheet's FIXED and COMPUTED columns. The time slots, the printed
//     test parameters, the lux areas are the same on every record of the
//     format, so matching them would list every sheet ever filled; a computed
//     cell is arithmetic on the cells beside it, which are searched already.
//     A fixed cell the paper prints blank — F/MNT/03's third machine block —
//     is written in by the plant, and is searched like any cell.
//   - printed sequence numbers and the checklist's printed activity text, for
//     the same reason as a fixed column.
//
// Pure: nothing here reads storage. The caller says which document and which
// layout the record is read with (engine/recordSearch.ts), so a record filled
// on a superseded revision is read with that revision's headings (§74).

/** One value written on a record, and where on the form it is. */
export interface SearchCell {
  /** The line it is on — "M-68", "Row 3", "10:00", "Qc+Slitting", "PC-04", "Finding 2" — or "" for a box above or below the grid. */
  where: string;
  /** The heading it is written under, as the form prints it. */
  label: string;
  /** As written (with the column's unit, if it has one) — a date stored as 2026-08-14 as the screens show it, 14-Aug-2026. */
  value: string;
  /** `value` normalised for matching, followed, for a date, by the other ways the same day is written. */
  lower: string;
}

export interface RecordSearchText {
  /** Everything a person wrote on the record, plus its document, date and status, normalised. */
  text: string;
  cells: SearchCell[];
}

/** What the flattener needs to know about the record's document. */
export interface SearchableDocument {
  name: string;
  formatNo: string;
  kind: string;
}

/** Lower-cased and NFC-normalised: how record text and search words are compared. */
export function normaliseSearchText(s: string): string {
  return s.normalize("NFC").toLowerCase();
}

/**
 * The words of a query, each of which a record must contain. Normalised,
 * without repeats, and without a word another word already contains ("pc
 * pc-04" asks no more than "pc-04"); longest first, so the rarest word is
 * tried first and most records are turned away after a single test.
 */
export function searchTerms(query: string): string[] {
  const words = Array.from(new Set(normaliseSearchText(query).split(/\s+/).filter(Boolean)));
  const kept = words.filter((w) => !words.some((other) => other !== w && other.includes(w)));
  return kept.sort((a, b) => b.length - a.length);
}

/** Does the text contain every word? */
export function containsAllTerms(text: string, terms: readonly string[]): boolean {
  for (const t of terms) if (!text.includes(t)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// headings for the fields of the kinds that are not log sheets

const FIELD_LABELS: Record<string, string> = {
  // daily pest round, fly catcher, service reports
  checker: "Checker",
  timeOfChecking: "Time of checking",
  dateOfObservation: "Date of observation",
  descriptionOfObservation: "Observation",
  actionTaken: "Action taken",
  remarks: "Remarks",
  trapBoxNo: "Trap box",
  location: "Location",
  count: "Rodents",
  monthYear: "Month & year",
  pcId: "PC ID",
  catchCountApprox: "Flies caught",
  tubeLightInstallDate: "Tube light installed",
  tubeLightDueDate: "Tube light due",
  cleaningDoneBy: "Cleaning done by",
  verifiedBy: "Verified by",
  serviceName: "Service",
  areaName: "Area",
  materialName: "Material",
  qtyUsed: "Quantity used",
  methodOfApplication: "Method of application",
  technicianSign: "Technician's sign",
  customerSign: "Customer's sign",
  // CAPA
  inspectionDate: "Inspection date",
  premisesName: "Premises",
  premisesAddress: "Premises address",
  contactPerson: "Contact person",
  findingOfInspection: "Finding",
  commentsOnFindings: "Comments on finding",
  correctiveActionContractor: "Corrective action (contractor)",
  correctiveActionClient: "Corrective action (client)",
  targetDate: "Target date",
  actualDateOfAction: "Actual date of action",
  verifiedByServiceProvider: "Verified by service provider",
  generalComments: "General comment",
  customerName: "Customer name",
  complaintNo: "Complaint No.",
  jobName: "Job name",
  jobCode: "Job code",
  complaintReceivedDate: "Complaint received",
  poNo: "PO No.",
  comment: "Comment",
  reportDate: "Date",
  toName: "To",
  toDesignation: "To (designation)",
  intro: "Introduction",
  fgCode: "FG code",
  complaintReceivedOn: "Complaint received on",
  complaintType: "Complaint type",
  complaintSubType: "Complaint sub type",
  scenario: "Scenario",
  rootCause: "Root cause",
  correctiveAction: "Corrective action",
  preventiveAction: "Preventive action",
  acknowledgement: "Acknowledgement",
  employeeName: "Employee",
  employeeSignDate: "Employee's date",
  // training
  trainingDate: "Training date",
  trainingType: "Training type",
  trainerProvider: "Trainer / provider",
  topics: "Topic",
  certificateRef: "Certificate reference",
  // the pest control agreements
  siteResponsibilities: "Site responsibility",
  equipmentStorage: "Equipment and storage",
  emergencyCalls: "Emergency contact",
  trainingNote: "Training",
  ehsClauses: "Environment, health & safety",
  serviceClauses: "Service clause",
  agreementNo: "Agreement No.",
  effectiveFrom: "Agreement starts",
  effectiveTo: "Agreement runs to",
  providerLicenceNo: "Provider's licence",
  scopeOfServices: "Scope of services",
  serviceSchedule: "Schedule and reporting",
  obligations: "Obligation",
  commercialTerms: "Commercial terms",
  generalTerms: "General terms",
  clientSignatory: "Client's signatory",
  providerSignatory: "Provider's signatory",
  addressLines: "Address",
  contactName: "Contact name",
};

/** What a line of a list is called when nothing on it names it. */
const LIST_ITEM_NAMES: Record<string, string> = {
  rows: "Row",
  entries: "Unit",
  lines: "Line",
  findings: "Finding",
  summaryActions: "Action",
  rodentCatches: "Catch",
  attendees: "Attendee",
  sections: "Section",
  items: "Item",
  emergencyCalls: "Contact",
  scans: "Page",
  photos: "Photo",
};

/** The value on a line of a list that names the line, the way the paper form does. */
const LINE_NAME_KEYS = ["pcId", "trapBoxNo", "areaName", "employeeName", "issue"];

// Fields that are never searched: ids and the links between records, the
// printed numbering and activity text every copy of a form carries, internal
// markers, and the base64 payload of a photograph or a scan.
const SKIPPED_FIELDS = new Set([
  "id",
  "dataUrl",
  "sNo",
  "srNo",
  "slNo",
  "activity",
  "title",
  "key",
  "kind",
  "origin",
  "insightKey",
  "sourceRecordIds",
]);

function words(key: string): string {
  const known = FIELD_LABELS[key];
  if (known) return known;
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

const lowerFirst = (s: string): string => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** A form's heading as a snippet shows it: one line, without the trailing colon or dash the paper prints. */
function cleanLabel(label: string): string {
  return label.replace(/\s+/g, " ").replace(/[\s:\-–]+$/, "").trim();
}

function clip(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DOTTED_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const pad2 = (n: number): string => String(n).padStart(2, "0");

// ONE DAY, WRITTEN EVERY WAY IT IS WRITTEN (REQUIREMENTS §75.4). A date box
// stores 2026-08-14, yet every screen, printout and export shows 14-Aug-2026,
// and the plant writes 14.08.2026 by hand — so a date was found only by
// somebody who typed it the way nobody sees it. A value that is exactly one
// date is searched in all five forms below, and a result's line shows it as
// the screens do. Read as a date: the stored form, and the plant's dotted
// day-first form. NOT a slashed value: the HR sheets carry Excel's month-first
// "10/18/2025" beside day-first dates, so "4/8/2025" could be either day and
// is left as written — the slashed form is only ever made FROM a date known
// for certain. A date inside a sentence, or an impossible one (31.02.2026,
// month 13), is left as written too: nothing is invented.
interface DateForms {
  /** How the screens show it: 14-Aug-2026. */
  display: string;
  /** 2026-08-14, 14-Aug-2026, 14/08/2026, 14.08.2026, 14-08-2026. */
  forms: string[];
}

function dateForms(value: string): DateForms | null {
  let y: number, m: number, d: number;
  const iso = ISO_DATE.exec(value);
  const dotted = iso ? null : DOTTED_DATE.exec(value);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dotted) [d, m, y] = [Number(dotted[1]), Number(dotted[2]), Number(dotted[3])];
  else return null;
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m - 1)) return null;
  const [dd, mm] = [pad2(d), pad2(m)];
  const display = formatDisplayDate(`${y}-${mm}-${dd}`);
  return { display, forms: [`${y}-${mm}-${dd}`, display, `${dd}/${mm}/${y}`, `${dd}.${mm}.${y}`, `${dd}-${mm}-${y}`] };
}

/** A stored date as the screens show it; anything else as it is. */
function shownAs(value: string): string {
  return ISO_DATE.test(value) ? (dateForms(value)?.display ?? value) : value;
}

// ---------------------------------------------------------------------------
// the walk

class TextBuilder {
  private parts: string[] = [];
  readonly cells: SearchCell[] = [];

  /** Words the record answers to that are not a value written on it (its document, date, status). */
  add(value: string | null | undefined): void {
    if (typeof value !== "string") return;
    const v = value.trim();
    if (!v || v.startsWith("data:")) return;
    const date = dateForms(v);
    this.parts.push(normaliseSearchText(date ? date.forms.join("\n") : v));
  }

  cell(where: string, label: string, raw: unknown, unit?: string): void {
    let value: string;
    if (typeof raw === "string") value = raw.trim();
    else if (typeof raw === "number" && Number.isFinite(raw)) value = String(raw);
    else return;
    if (!value || value.startsWith("data:")) return;
    // A stored date is shown as the screens show it; one written by hand, as written.
    const date = dateForms(value);
    const shown = date && ISO_DATE.test(value) ? date.display : value;
    const lower = normaliseSearchText(date ? [shown, ...date.forms.filter((f) => f !== shown)].join("\n") : value);
    this.parts.push(lower);
    this.cells.push({ where, label, value: unit ? `${shown} ${unit}` : shown, lower });
  }

  text(): string {
    return this.parts.join("\n");
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function joinWhere(outer: string, inner: string): string {
  return outer && inner ? `${outer} · ${inner}` : outer || inner;
}

function lineName(item: Record<string, unknown>, listKey: string, index: number): string {
  for (const k of LINE_NAME_KEYS) {
    const v = item[k];
    if (typeof v === "string" && v.trim()) return clip(v, 40);
  }
  const unit = LIST_ITEM_NAMES[listKey] ?? "Line";
  if (listKey === "sections" && typeof item.key === "string" && item.key) return `${unit} ${item.key}`;
  const printed = item.sNo ?? item.srNo ?? item.slNo;
  return `${unit} ${typeof printed === "number" ? printed : index + 1}`;
}

function walkObject(b: TextBuilder, obj: Record<string, unknown>, where: string, prefix: string, depth: number): void {
  if (depth > 6) return;
  for (const [k, v] of Object.entries(obj)) {
    // A timestamp the system stamped (a scan's addedAt) is not something anybody wrote.
    if (SKIPPED_FIELDS.has(k) || /[a-z]At$/.test(k)) continue;
    const label = prefix ? `${prefix} ${lowerFirst(words(k))}` : words(k);
    if (Array.isArray(v)) walkList(b, v, k, label, where, depth + 1);
    else if (isPlainObject(v)) {
      if (k === "checkpoints") walkCheckpoints(b, v, where);
      else walkObject(b, v, where, label, depth + 1);
    } else b.cell(where, label, v);
  }
}

function walkList(b: TextBuilder, list: unknown[], key: string, label: string, where: string, depth: number): void {
  list.forEach((item, i) => {
    if (isPlainObject(item)) walkObject(b, item, joinWhere(where, lineName(item, key, i)), "", depth + 1);
    else if (!Array.isArray(item)) b.cell(where, label, item);
  });
}

// The daily pest round's checkpoints are numbered, each with an answer and,
// for some, a note: "Checkpoint 8: NOT OK", "Checkpoint 8 note: droppings near RB-27".
function walkCheckpoints(b: TextBuilder, checkpoints: Record<string, unknown>, where: string): void {
  for (const [no, answer] of Object.entries(checkpoints)) {
    if (!isPlainObject(answer)) continue;
    b.cell(where, `Checkpoint ${no}`, answer.value);
    b.cell(where, `Checkpoint ${no} note`, answer.note);
  }
}

// ---------------------------------------------------------------------------
// log sheets, read through their layout

interface LayoutReading {
  headerLabels: Map<string, string>;
  /** The columns whose cells are searched, in the order the form prints them. */
  columns: { col: LogColumn; label: string; fixed: boolean }[];
  /** Every key a column owns, searched or not — anything else on a row is a column the format no longer has. */
  known: Set<string>;
  /** The fixed columns that name a row (its time slot, its parameter). */
  naming: LogColumn[];
}

// Worked out once per layout object: every sheet of a format shares it
// (getLogSheetLayout hands back the same object until the format is changed).
const readings = new WeakMap<LogSheetLayout, LayoutReading>();

function readingOf(layout: LogSheetLayout): LayoutReading {
  const hit = readings.get(layout);
  if (hit) return hit;
  const headerLabels = new Map<string, string>();
  for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) headerLabels.set(f.key, cleanLabel(f.label));
  const slotKey = layout.rowMode.kind === "timeSlots" ? layout.rowMode.slotKey : null;
  const known = new Set<string>(["id"]);
  if (slotKey) known.add(slotKey);
  const columns: LayoutReading["columns"] = [];
  const naming: LogColumn[] = [];
  // A heading the form prints more than once — F/MNT/03's twelve "Plan"s, one
  // under each month; F/MNT/04's two "Operator"s, under DAY SHIFT and NIGHT
  // SHIFT — is only told apart by the heading above it, so it is named with it.
  // A heading printed once is named on its own.
  const printedTimes = new Map<string, number>();
  for (const col of layout.columns) printedTimes.set(cleanLabel(col.label), (printedTimes.get(cleanLabel(col.label)) ?? 0) + 1);
  for (const col of layout.columns) {
    known.add(col.key);
    if (col.computed || col.key === slotKey) continue;
    if (col.fixed) naming.push(col);
    const heading = cleanLabel(col.label);
    const repeated = (printedTimes.get(heading) ?? 0) > 1;
    columns.push({ col, label: col.group && repeated ? `${clip(cleanLabel(col.group), 40)} ${heading}` : heading, fixed: !!col.fixed });
  }
  const reading = { headerLabels, columns, known, naming };
  readings.set(layout, reading);
  return reading;
}

function rowWhere(row: Record<string, unknown>, index: number, layout: LogSheetLayout | undefined, reading: LayoutReading | undefined): string {
  const mode = layout?.rowMode;
  if (!mode || mode.kind === "free") {
    // A register's line is known by what its first column says — the
    // equipment master's "M-68", the breakdown register's failure date (as the
    // screens show a date, 14-Aug-2026) — when that is short enough to be a
    // name; otherwise by its number.
    const first = reading?.columns[0]?.col;
    const v = first ? row[first.key] : undefined;
    const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
    if (first && s && s.length <= 24) return /^\d+$/.test(s) ? `${cleanLabel(first.label)} ${s}` : shownAs(s);
    return `Row ${index + 1}`;
  }
  if (mode.kind === "single") return "";
  if (mode.kind === "timeSlots") return clip(String(row[mode.slotKey] ?? ""), 40) || `Row ${index + 1}`;
  const names: string[] = [];
  for (const col of reading?.naming ?? []) {
    const v = row[col.key];
    const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
    // F/MNT/04's day "5" reads as "Date 5", not as a bare number.
    if (s) names.push(/^\d+$/.test(s) ? `${cleanLabel(col.label)} ${s}` : clip(shownAs(s), 48));
    if (names.length === 2) break;
  }
  return names.join(" · ") || `Row ${index + 1}`;
}

function walkLogSheet(b: TextBuilder, data: LogSheetData, layout: LogSheetLayout | undefined): void {
  const reading = layout ? readingOf(layout) : undefined;
  for (const [k, v] of Object.entries(data.header ?? {})) b.cell("", reading?.headerLabels.get(k) ?? words(k), v);
  const printed = layout?.rowMode.kind === "fixedRows" ? layout.rowMode.rows : null;
  const rows = Array.isArray(data.rows) ? data.rows : [];
  rows.forEach((row, i) => {
    if (!isPlainObject(row)) return;
    const where = rowWhere(row, i, layout, reading);
    for (const { col, label, fixed } of reading?.columns ?? []) {
      // A fixed column is the paper's printed text — unless the paper prints
      // that cell blank for the plant to write in (LogSheetRecordView's printedBlank).
      if (fixed && !(printed && printed[i] !== undefined && String(printed[i][col.key] ?? "") === "")) continue;
      b.cell(where, label, row[col.key], col.unit);
    }
    for (const [k, v] of Object.entries(row)) {
      if (reading?.known.has(k) || k === "id") continue;
      b.cell(where, words(k), v);
    }
  });
}

const looksLikeLogSheet = (data: unknown): data is LogSheetData => isPlainObject(data) && isPlainObject(data.header) && Array.isArray(data.rows);

// ---------------------------------------------------------------------------

const ACTION_WORDS: Record<string, string> = {
  edited: "Edit note",
  "assistant-edit": "Note",
  submitted: "Submission note",
  verified: "Verification note",
  rejected: "Reason sent back",
  resumed: "Resumed",
  reopened: "Reason reopened",
  "correction-cancelled": "Correction cancelled",
};

/**
 * Everything a record says, for Search (REQUIREMENTS §75). `layout` is the one
 * the record is read with — for a log sheet, getLogSheetLayoutForRecord — and
 * is ignored for the other kinds.
 */
export function recordSearchText(record: RecordInstance, doc: SearchableDocument | undefined, layout?: LogSheetLayout): RecordSearchText {
  const b = new TextBuilder();

  // Its document, day and state: "fly catcher", "f/hr/18", "2026-09-04",
  // "04-sep-2026", "04.09.2026", "rejected". The day goes in every form a
  // date is written (dateForms), and only when it is one.
  b.add(doc?.name);
  b.add(doc?.formatNo);
  b.add(record.id);
  if (typeof record.dueDate === "string" && ISO_DATE.test(record.dueDate)) b.add(record.dueDate);
  b.add(record.status);
  b.add(record.responsibleUser);

  // What was written on it.
  const data: unknown = record.data;
  if (looksLikeLogSheet(data) && (doc?.kind === "log-sheet" || !doc)) walkLogSheet(b, data, layout);
  else if (isPlainObject(data)) walkObject(b, data, "", "", 0);

  // Who signed it off or sent it back, and what they said — after the data,
  // so a snippet prefers what the record says over who handled it.
  b.cell("", "Submitted by", record.submittedBy);
  b.cell("", "Verified by", record.verifiedBy);
  b.cell("", "Sent back by", record.rejectedBy);
  b.cell("", "Reason sent back", record.rejectionReason);
  b.cell("", "Reason for correction", record.correction?.reason);
  for (const entry of record.history ?? []) {
    // Only what PEOPLE wrote is a record's words (REQUIREMENTS §75): the
    // assistant's preparation note, and the notes the system and the
    // assistant leave when they change a record themselves — a boot
    // migration's "tube light dates corrected", a sample fill — are the
    // system describing itself, and would make every record they touched
    // answer to the same words. (The same test engine/recordSearch.ts's
    // writtenByAPerson makes of a history entry.)
    if (entry.action === "prepared" || entry.by === "System" || entry.by === "Assistant" || !entry.note) continue;
    if (entry.action === "rejected" && entry.note === record.rejectionReason) continue;
    b.cell("", ACTION_WORDS[entry.action] ?? "Note", entry.note);
  }

  return { text: b.text(), cells: b.cells };
}

// ---------------------------------------------------------------------------
// the line a search result shows

const SNIPPET_VALUE_CHARS = 110;

// The part of a long value around the word that matched. The word is looked
// for in the very text that is cut — the value with its runs of spaces and
// line breaks made single spaces — not in the stored text: a remark with a
// blank line or a column of spaces before the word put it further along the
// stored text than in the cut one, and the excerpt could miss it altogether.
function excerpt(value: string, term: string | undefined): string {
  const one = value.replace(/\s+/g, " ");
  if (one.length <= SNIPPET_VALUE_CHARS) return one;
  const found = term ? normaliseSearchText(one).indexOf(term) : -1;
  // (Lower-casing and NFC can shift a position by a letter or two, never by
  // the 30 letters shown before the word.)
  const at = found < 0 ? 0 : Math.min(found, one.length - 1);
  const start = Math.max(0, Math.min(at - 30, one.length - SNIPPET_VALUE_CHARS));
  const piece = one.slice(start, start + SNIPPET_VALUE_CHARS);
  return `${start > 0 ? "…" : ""}${piece}${start + SNIPPET_VALUE_CHARS < one.length ? "…" : ""}`;
}

/**
 * One value a result's line shows, in three pieces kept apart for the page
 * (REQUIREMENTS §58, §75.4): `where` and `value` are what was written on the
 * record — a machine, a PC ID, a name, a figure — and must never be handed to
 * Google Translate when Gujarati is chosen; `label` is the form's printed
 * heading, which Google may translate like every other printed word of a form.
 */
export interface SnippetPart {
  /** The line of the form it is on, or "" (a box above or below the grid, or the same line as the part before). */
  where: string;
  /** The heading it is written under, as the form prints it. */
  label: string;
  /** What was written, cut to the words that matched. */
  value: string;
}

function partOf(cell: SearchCell, term?: string, sameLineAs?: SearchCell): SnippetPart {
  const where = cell.where && cell.where !== cell.value && cell.where !== sameLineAs?.where ? cell.where : "";
  return { where, label: cell.label, value: excerpt(cell.value, term) };
}

/** The parts as one line: "Row 3 · Operator: Gaurav Singh · Remarks: …". */
export function snippetText(parts: readonly SnippetPart[]): string {
  return parts.map((p) => `${p.where ? `${p.where} · ` : ""}${p.label}: ${p.value}`).join(" · ");
}

/**
 * The parts cut to at most `max` letters as snippetText would print them —
 * about what a result's cell has room for (pages/SearchPage.tsx). Only values
 * are cut, ending "…"; a part whose line and heading no longer fit is left off,
 * and the value before it ends "…" instead.
 */
export function clipSnippet(parts: readonly SnippetPart[], max: number): SnippetPart[] {
  const out: SnippetPart[] = [];
  let used = 0;
  for (const p of parts) {
    const head = (out.length > 0 ? 3 : 0) + (p.where ? p.where.length + 3 : 0) + p.label.length + 2;
    const room = max - used - head;
    if (room < 2) {
      const last = out[out.length - 1];
      if (last && !last.value.endsWith("…")) out[out.length - 1] = { ...last, value: `${last.value.slice(0, Math.max(0, last.value.length - 1))}…` };
      else if (!last) out.push({ ...p, value: "…" });
      break;
    }
    if (p.value.length > room) {
      out.push({ ...p, value: `${p.value.slice(0, room - 1)}…` });
      break;
    }
    out.push(p);
    used += head + p.value.length;
  }
  return out;
}

/** The first values on the record, for a result that names no words (a format number) or matched only its document or date — in parts (snippetParts). */
export function recordSummaryParts(cells: readonly SearchCell[], count = 2): SnippetPart[] {
  return cells.slice(0, count).map((c) => partOf({ ...c, value: clip(c.value, 60) }));
}

/** The first values on the record, for a result that names no words (a format number) or matched only its document or date. */
export function recordSummary(cells: readonly SearchCell[], count = 2): string {
  return snippetText(recordSummaryParts(cells, count));
}

/**
 * The one line a search result shows, in parts: the value that holds the most
 * of the search words, with its heading and the line of the form it is on —
 * "Row 3 · Operator: Gaurav Singh". Where the words are spread over two values
 * ("m-13 bearing": the machine in one column, the fault in another) the second
 * value is shown beside the first. A record that matched only by its document,
 * date or status shows its first values instead.
 */
export function snippetParts(cells: readonly SearchCell[], terms: readonly string[]): SnippetPart[] {
  const first = bestCell(cells, terms);
  if (!first) return recordSummaryParts(cells);
  const rest = terms.filter((t) => !first.cell.lower.includes(t));
  const second = rest.length > 0 ? bestCell(cells, rest) : null;
  const line = partOf(first.cell, first.term);
  return second ? [line, partOf(second.cell, second.term, first.cell)] : [line];
}

/** snippetParts as one line of text. */
export function snippetFor(cells: readonly SearchCell[], terms: readonly string[]): string {
  return snippetText(snippetParts(cells, terms));
}

/** The value holding the most of the words (the first such), and the first of them it holds. */
function bestCell(cells: readonly SearchCell[], terms: readonly string[]): { cell: SearchCell; term: string } | null {
  let best: { cell: SearchCell; term: string } | null = null;
  let bestCount = 0;
  for (const cell of cells) {
    let n = 0;
    let term: string | undefined;
    for (const t of terms) {
      if (cell.lower.includes(t)) {
        n++;
        term ??= t;
      }
    }
    if (n > bestCount && term !== undefined) {
      best = { cell, term };
      bestCount = n;
      if (n === terms.length) break;
    }
  }
  return best;
}
