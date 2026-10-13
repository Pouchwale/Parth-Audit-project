import type { DocumentDefinition } from "../types";
import { FORMAT_LIST_ROWS } from "../data/seed/sysDocumentControlLayouts";
import { departmentFromFormatNo, departmentOfDocument } from "../data/seed/departments";
import { formatKey } from "./formatNumbers";
import { ACCESS_MODULES, DEFAULT_PEOPLE, buildAccess, defaultResponsible, normalizeAccessRules, type Access, type AccessAccount, type AccessDoc, type AccessLevel, type AccessRules } from "./accessRules";
import { applyAccessChange, documentDefaults } from "./accessEditing";

// THE MASTER LIST OF WHO DOES WHAT, WITHOUT A SCREEN (REQUIREMENTS §110; pages/MasterListPage.tsx draws it).
//
// The owner, 12-Oct-2026: "make sure give me options like separate master list format only for superadmin in which in
// every document present in that master list format so in that super will select user according to documents
// superadmin can select and also give options like read, write, and view".
//
//   * THE ROWS: every document of the plant's catalogue, in the order of the Master List of Formats & Records (F/SYS/02,
//     the company's workbook, data/seed/sysDocumentControlLayouts.ts FORMAT_LIST_ROWS): by its module sections as the
//     list runs (SYS, MKT, PUR, STR, QC, QA, PRD, MNT, HR, DISP), each line with the list's Sr. No., the format number
//     and name, the frequency and the list's method of recording. A document the list does not name (the pest control
//     papers without a number, the CAPA forms) comes at the end of its module, by name.
//   * THE COLUMNS: "Filled by" (who answers for it, the main person first), then each active person's level on it:
//     No access, View (Read), Write, Edit. The level is engine/accessRules.ts's own answer, so this page, Users &
//     Access and the server can never disagree; "set" says whether the super admin set it (on the document or for its
//     whole module: shown bold) or the owner's table gives it (plain).
//   * THE CHANGES: a level for one person on one or many documents, who fills a document, and one person made the one
//     who fills many documents or added to who fills them. Each is the rules with the change made, saved by the page
//     with the version it read (PUT /api/access/rules, the same checks as Users & Access), so nothing here can be lost.
//
// FAST ON A LOW-END LAPTOP (§56): the rows and the order are worked out once per catalogue; a cell is one map lookup.

/** The module sections in the order F/SYS/02 runs them; a document of no module comes last. */
export const MASTER_SECTION_ORDER: readonly string[] = (() => {
  const seen: string[] = [];
  for (const row of FORMAT_LIST_ROWS) {
    const code = departmentFromFormatNo(String(row.formatNumber ?? ""));
    if (code && !seen.includes(code)) seen.push(code);
  }
  for (const m of ACCESS_MODULES) if (!seen.includes(m)) seen.push(m);
  return seen;
})();

/** One document as the master list shows it. */
export interface MasterRow {
  id: string;
  /** The module it is filed under (its department code), or "" for none. */
  module: string;
  /** Its line's number on F/SYS/02 (1 to 141), or null when the list does not name it. */
  srNo: number | null;
  formatNo: string;
  name: string;
  frequency: string;
  /** F/SYS/02's method of recording ("Hard copy", "SAP"), or "" when the list does not say. */
  recording: string;
  /** Kept as issued (a licence, a statement of compliance): nobody fills it. */
  reference: boolean;
  doc: AccessDoc;
}

/** A module's rows, in order. */
export interface MasterSection {
  module: string;
  rows: MasterRow[];
}

const squash = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The list's lines by their key ("QC-40A"), and those of a number of their own shape by the number squashed. */
function linesOf(): { byKey: Map<string, number>; ownShape: { squashed: string; index: number }[] } {
  const byKey = new Map<string, number>();
  const ownShape: { squashed: string; index: number }[] = [];
  FORMAT_LIST_ROWS.forEach((row, index) => {
    const formatNo = String(row.formatNumber ?? "").trim();
    if (!formatNo) return;
    const key = formatKey(formatNo);
    if (key) {
      if (!byKey.has(key)) byKey.set(key, index);
    } else ownShape.push({ squashed: squash(formatNo), index });
  });
  return { byKey, ownShape };
}

// A line DCRS holds under a number of another shape (engine/documentFinder.ts MASTER_LIST_EQUIVALENTS): the complaint
// acknowledgement, headed QA-CAF-00, is F-MKT-06 on the list.
const LINE_OF_DOCUMENT: Readonly<Record<string, string>> = { "capa-complaint-ack": "F-MKT-06" };

const REFERENCE_KINDS = new Set(["chemical-master", "licence", "compliance-statement"]);

/** The line of F/SYS/02 a document is (its index), or null. */
function lineIndexOf(d: DocumentDefinition, lines: ReturnType<typeof linesOf>): number | null {
  const listed = LINE_OF_DOCUMENT[d.id];
  if (listed) {
    const key = formatKey(listed);
    const at = key ? lines.byKey.get(key) : undefined;
    if (at !== undefined) return at;
  }
  if (!d.formatNo || d.formatNo.toUpperCase().startsWith("TO BE")) return null;
  const key = formatKey(d.formatNo);
  if (key) {
    const at = lines.byKey.get(key);
    // "F/HR/10A" with no line of its own is its base's line, as the format numbers are read elsewhere.
    return at ?? lines.byKey.get(key.replace(/[A-Z]$/, "")) ?? null;
  }
  const s = squash(d.formatNo);
  if (s.length < 6) return null;
  return lines.ownShape.find((l) => l.squashed.includes(s) || s.includes(l.squashed))?.index ?? null;
}

/**
 * EVERY DOCUMENT IN THE LIST'S ORDER: the module sections as F/SYS/02 runs them, each document by its line's Sr. No.,
 * the ones the list does not name after them by name. `frequencyOf` words a frequency in the screens' language.
 */
export function masterSections(docs: readonly DocumentDefinition[], frequencyOf: (f: string) => string = (f) => f): MasterSection[] {
  const lines = linesOf();
  const bySection = new Map<string, MasterRow[]>();
  for (const d of docs) {
    const module = departmentOfDocument(d.id, d.formatNo) ?? "";
    const index = lineIndexOf(d, lines);
    const line = index === null ? null : FORMAT_LIST_ROWS[index];
    const reference = !!d.isReferenceOnly || REFERENCE_KINDS.has(d.kind);
    const row: MasterRow = {
      id: d.id,
      module,
      srNo: index === null ? null : index + 1,
      formatNo: d.formatNo && !d.formatNo.toUpperCase().startsWith("TO BE") ? d.formatNo : "",
      name: d.name,
      frequency: frequencyOf(d.frequency),
      recording: String(line?.methodOfRecording ?? "").trim(),
      reference,
      doc: { id: d.id, formatNo: d.formatNo, department: module || null, reference },
    };
    const list = bySection.get(module) ?? [];
    list.push(row);
    bySection.set(module, list);
  }
  const order = [...MASTER_SECTION_ORDER, ...[...bySection.keys()].filter((m) => !MASTER_SECTION_ORDER.includes(m)).sort()];
  return order
    .filter((m) => bySection.has(m))
    .map((module) => ({
      module,
      rows: bySection.get(module)!.sort((a, b) => {
        if (a.srNo !== null && b.srNo !== null) return a.srNo - b.srNo || a.name.localeCompare(b.name);
        if (a.srNo !== null) return -1;
        if (b.srNo !== null) return 1;
        return a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" });
      }),
    }));
}

// ---------------------------------------------------------------------------
// the people and their levels

/** An account as the master list reads it (Users & Access's list). */
export interface MasterPerson {
  id: string;
  name: string;
  email: string;
  role: string;
  departments: readonly string[];
  active?: boolean;
  removedAt?: string | null;
}

const lower = (s: string): string => s.trim().toLowerCase();

/** The columns: every active staff account, by name. The super admin has Edit everywhere and is not a column. */
export function masterColumns<P extends MasterPerson>(people: readonly P[]): P[] {
  return people
    .filter((p) => p.role !== "admin" && p.active !== false && !p.removedAt)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }));
}

/** The super admins, active and on the list: named above the table. */
export function masterBosses<P extends MasterPerson>(people: readonly P[]): P[] {
  return people.filter((p) => p.role === "admin" && p.active !== false && !p.removedAt);
}

export const accountOfPerson = (p: Pick<MasterPerson, "email" | "role" | "departments">): AccessAccount => ({ email: lower(p.email), role: p.role, departments: p.departments });

/** One cell: the person's level on the document, and what gives it (the super admin's setting, on the document or its module; or the owner's table). */
export interface MasterCell {
  level: AccessLevel;
  set: "document" | "module" | null;
}

export function cellOf(rules: AccessRules, access: Access, person: Pick<MasterPerson, "email" | "role" | "departments">, row: Pick<MasterRow, "id" | "module">): MasterCell {
  const email = lower(person.email);
  const own = rules.people[email];
  const set = own?.documents?.[row.id] !== undefined ? "document" : row.module && own?.modules?.[row.module] !== undefined ? "module" : null;
  return { level: access.level(accountOfPerson(person), row.id), set };
}

/** What the person's level on the document would be without a setting of its own: the module's, or the owner's table's. */
export function levelWithoutOwn(rules: AccessRules, docs: readonly AccessDoc[], person: Pick<MasterPerson, "email" | "role" | "departments">, documentId: string): AccessLevel {
  return documentDefaults(rules, docs, person).level(accountOfPerson(person), documentId);
}

/** The people's names by email, with the owner's twelve and an address's own words for anybody else. */
export function nameOfEmail(people: readonly Pick<MasterPerson, "name" | "email">[]): (email: string) => string {
  const map = new Map<string, string>();
  for (const p of DEFAULT_PEOPLE) map.set(p.email, p.name);
  for (const p of people) map.set(lower(p.email), p.name);
  return (email) =>
    map.get(email) ??
    (email
      .split("@")[0]
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") ||
      email);
}

// ---------------------------------------------------------------------------
// what is shown

export interface MasterFilter {
  /** A module's code, or "" for every module. */
  module: string;
  /** A person's email, or "" for everybody. */
  person: string;
  /** Only the documents nobody fills (and which are not kept as issued). */
  nobody: boolean;
  /** With a person chosen: every document, not only those they fill or see. */
  every: boolean;
  /** Words of a format number or name. */
  find: string;
}

export const NO_FILTER: MasterFilter = { module: "", person: "", nobody: false, every: false, find: "" };

/** The rows the filter keeps, in order. */
export function filterRows(sections: readonly MasterSection[], filter: MasterFilter, access: Access, people: readonly MasterPerson[]): MasterSection[] {
  const needle = filter.find.trim().toLowerCase();
  const squashed = squash(filter.find);
  const person = filter.person ? people.find((p) => lower(p.email) === lower(filter.person)) : undefined;
  const account = person ? accountOfPerson(person) : null;
  const out: MasterSection[] = [];
  for (const s of sections) {
    if (filter.module && s.module !== filter.module) continue;
    const rows = s.rows.filter((r) => {
      if (filter.nobody && (r.reference || access.responsible(r.id).length > 0)) return false;
      if (account && !filter.every && !access.responsible(r.id).includes(account.email) && access.level(account, r.id) === "none") return false;
      if (needle) {
        const hay = `${r.formatNo} ${r.name}`.toLowerCase();
        if (!hay.includes(needle) && !(squashed.length >= 3 && squash(r.formatNo).includes(squashed))) return false;
      }
      return true;
    });
    if (rows.length > 0) out.push({ module: s.module, rows });
  }
  return out;
}

// ---------------------------------------------------------------------------
// the changes

/** One person's level on many documents: set (or put back to the module's or the table's with null). */
export function setLevels(rules: AccessRules, docs: readonly AccessDoc[], email: string, documentIds: readonly string[], level: AccessLevel | null): AccessRules {
  let next = normalizeAccessRules(rules);
  for (const documentId of documentIds) next = applyAccessChange(next, { kind: "document", email, documentId, level }, docs);
  return next;
}

/** Who fills one document, the main person first: stored only where it differs from the owner's table. */
export function setFillers(rules: AccessRules, docs: readonly AccessDoc[], documentId: string, emails: readonly string[]): AccessRules {
  const base = normalizeAccessRules(rules);
  const doc = docs.find((d) => d.id === documentId);
  const table = doc ? defaultResponsible(doc) : [];
  const list = Array.from(new Set(emails.map(lower).filter((e) => e.includes("@"))));
  const responsibility: Record<string, string[]> = {};
  for (const [id, l] of Object.entries(base.responsibility)) responsibility[id] = l.slice();
  if (list.length === table.length && list.every((e, i) => e === table[i])) delete responsibility[documentId];
  else responsibility[documentId] = list;
  return normalizeAccessRules({ ...base, responsibility });
}

/** One person made the one who fills these documents, or added to who fills them (after those already named). */
export function fillMany(rules: AccessRules, docs: readonly AccessDoc[], email: string, documentIds: readonly string[], mode: "only" | "add"): AccessRules {
  const who = lower(email);
  let next = normalizeAccessRules(rules);
  for (const documentId of documentIds) {
    const doc = docs.find((d) => d.id === documentId);
    if (!doc || doc.reference) continue;
    const now = next.responsibility[documentId] ?? defaultResponsible(doc);
    next = setFillers(next, docs, documentId, mode === "only" ? [who] : now.includes(who) ? now : [...now, who]);
  }
  return next;
}

/** The access the rules give, over the rows' documents (one build per change of the rules). */
export function masterAccess(sections: readonly MasterSection[], rules: AccessRules): Access {
  return buildAccess(
    sections.flatMap((s) => s.rows.map((r) => r.doc)),
    rules
  );
}
