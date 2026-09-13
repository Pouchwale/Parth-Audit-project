import type { DocumentDefinition } from "../types";
import { departmentName, departmentOfDocument } from "../data/seed/departments";

// WHO MAY SEE WHICH DOCUMENT.
//
// The department's rule (13-Sep-2026): "make departments and assign ids
// according to [the master list of formats], and if QC has those documents
// then only that department will be able to see [them]". So every document
// belongs to a department (data/seed/departments.ts, from the company's own
// F/SYS/02 list) and a person only sees the documents of the department they
// are in.
//
// The scope is set once, from the logged-in user's own account record
// (backend/db.ts users.departments -> store/AuthContext.tsx ->
// setDepartmentScope) and held here at module level, so the two repositories
// and everything that reads through them answer the same way — the library,
// the sidebar, the calendar, the day view, the dashboard, the reports, the
// files, the search, the reminders and the assistant, without each having to
// remember to ask.
//
// EMPTY MEANS EVERY DEPARTMENT. That is what the plant's management, the MR
// (F-SYS) and QA need; it is also what the administrator account and any
// account nobody has assigned yet get, so nobody is locked out of a system
// they have just been given.
//
// WHAT THIS IS AND IS NOT. It decides what a person is shown and what they can
// open. It is not a server-side authorisation boundary: every record still
// lives in that browser's own localStorage (DATA_MODEL.md), so this keeps
// departments out of each other's paperwork in the plant's shared, logged-in
// app — it cannot defend one browser's storage against its own owner. When the
// records move to the server (FUTURE_ROADMAP.md) this same assignment is what
// the API must enforce.
//
// This module deliberately imports NO repository: the repositories import it,
// and a document's department follows from its id alone.

let scope: string[] | null = null;

/**
 * Sets the departments the current user may see. Empty / null / undefined =
 * every department. Codes are matched case-insensitively.
 */
export function setDepartmentScope(codes: readonly string[] | null | undefined): void {
  const clean = (codes ?? []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  scope = clean.length > 0 ? Array.from(new Set(clean)) : null;
}

/** The departments in scope, or null when every department is. */
export function departmentScope(): string[] | null {
  return scope;
}

/** Is this user unrestricted (the administrator, management, QA, an unassigned account)? */
export function seesEveryDepartment(): boolean {
  return scope === null;
}

/** The scope in words: "Quality Control", "Quality Control and Production", "every department". */
export function departmentScopeLabel(): string {
  if (!scope) return "every department";
  const names = scope.map(departmentName);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The department code that owns a document. */
export function documentDepartment(documentId: string, formatNo?: string): string | null {
  return departmentOfDocument(documentId, formatNo);
}

/**
 * May the current user see this document? A document no department owns is
 * shown to everyone rather than hidden from everyone — a missing assignment
 * must never make a controlled document disappear.
 */
export function isDocumentIdVisible(documentId: string | undefined, formatNo?: string): boolean {
  if (!documentId) return false;
  if (!scope) return true;
  const code = documentDepartment(documentId, formatNo);
  return code === null || scope.includes(code);
}

/** As above, given the definition. */
export function isDocumentVisible(doc: DocumentDefinition | undefined): boolean {
  return !!doc && isDocumentIdVisible(doc.id, doc.formatNo);
}

/** Which department a document belongs to, in words, for a refusal message. */
export function documentDepartmentLabel(documentId: string, formatNo?: string): string {
  const code = documentDepartment(documentId, formatNo);
  return code ? departmentName(code) : "no department";
}
