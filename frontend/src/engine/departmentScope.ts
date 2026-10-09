import type { DocumentDefinition } from "../types";
import { departmentName, departmentOfDocument } from "../data/seed/departments";
import {
  ACCESS_MODULES,
  DEFAULT_PEOPLE,
  atLeast,
  buildAccess,
  levelNeeded,
  normalizeAccessRules,
  type Access,
  type AccessAccount,
  type AccessDoc,
  type AccessLevel,
  type AccessRules,
  type DocumentAction,
} from "./accessRules";
import { keptTo, sameName } from "./latenessCore";
import type { AnswerRule, Person } from "./performance";

// WHO MAY SEE, AND DO, WHAT — ONE RULE FOR EVERY SCREEN (REQUIREMENTS §40, §96).
//
// The department's rule (13-Sep-2026): "if QC has those documents then only that department will be able to see
// [them]". The owner's levels (7 and 8-Oct-2026): each person answers for the documents they fill, sees the modules of
// those documents, and the super admin alone sets for anybody Read, Write or Edit per module and per document
// (engine/accessRules.ts, the only place that decides it).
//
// THE SIGNED-IN PERSON is set here once, from their own account and the super admin's stored rules
// (store/AuthContext.tsx setAccessScope), and held at module level, so the two repositories and everything that reads
// through them answer the same way: the library, the sidebar, the calendar, the day view, the dashboard, the reports,
// the files, the search, the reminders, the briefing, the daily nudge, the scorecard and Mitra, without each having to
// remember to ask. A document at No access is not shown at all; Read shows it; Write and Edit decide the buttons
// (mayDo), with the refusal in words (engine/accessRefusal.ts).
//
// THE OLD DEPARTMENT SCOPE STAYS for the callers that set one directly (setDepartmentScope): the engine host on the
// server and the unit tests. With no person set, a document is visible when its department is in that scope (or when
// no scope is set), and whatever is visible may be done.
//
// WHAT THIS IS AND IS NOT. It decides what a person is shown and offered. The server checks every write against the
// same rules (backend/, the records item record by record), so the screen is never the lock.
//
// This module deliberately imports NO repository: the repositories import it. The document catalogue reaches it
// through registerAccessCatalogue, which data/repositories/documentRepository.ts calls when it loads.

// ---------------------------------------------------------------------------
// the old department scope (engine host, tests)

let scope: string[] | null = null;

/**
 * Sets the departments the current user may see, the old way (no levels). Empty / null / undefined = every
 * department. Codes are matched case-insensitively. Clears any signed-in person's levels.
 */
export function setDepartmentScope(codes: readonly string[] | null | undefined): void {
  const clean = (codes ?? []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  scope = clean.length > 0 ? Array.from(new Set(clean)) : null;
  person = null;
  built = null;
}

// ---------------------------------------------------------------------------
// the signed-in person's levels

let person: AccessAccount | null = null;
let storedRules: AccessRules = normalizeAccessRules(null);
let catalogueSource: (() => readonly DocumentDefinition[]) | null = null;

interface Built {
  docs: readonly DocumentDefinition[];
  access: Access;
  known: Set<string>;
  /** The documents this person answers for and may fill; empty for the super admin and an account nobody described. */
  answers: Set<string>;
  /** The modules the person sees, or null when that is all ten. */
  modules: string[] | null;
  /** Is the person named anywhere in the rules (the owner's twelve, a stored setting, a responsibility)? */
  described: boolean;
  /** Every email the rules name: the owner's twelve, a stored setting, anyone a document is given to. */
  describedEmails: Set<string>;
  /** Level by document id, asked once each. */
  levels: Map<string, AccessLevel>;
}
let built: Built | null = null;

const REFERENCE_KINDS = new Set(["chemical-master", "licence", "compliance-statement"]);

/** A document as the rules read it: its department from its id and number, and whether it is kept as issued (no records). */
export function accessDocOf(d: DocumentDefinition): AccessDoc {
  return { id: d.id, formatNo: d.formatNo, department: departmentOfDocument(d.id, d.formatNo), reference: !!d.isReferenceOnly || REFERENCE_KINDS.has(d.kind) };
}

/** Where the catalogue comes from (data/repositories/documentRepository.ts registers its own list). */
export function registerAccessCatalogue(source: () => readonly DocumentDefinition[]): void {
  catalogueSource = source;
  built = null;
}

/**
 * THE SIGNED-IN PERSON AND THE SUPER ADMIN'S RULES (store/AuthContext.tsx). `who` null: nobody is held to levels
 * (signed out). `rules` left out keeps the rules already set; null is "nothing set yet", the owner's table as it is.
 */
export function setAccessScope(who: AccessAccount | null, rules?: unknown): void {
  scope = null;
  person = who ? { email: who.email.trim().toLowerCase(), role: who.role, departments: who.departments ?? [] } : null;
  if (rules !== undefined) storedRules = normalizeAccessRules(rules);
  built = null;
}

/** New rules from the server (a reload, or the super admin's own save): everything is answered again with them. */
export function setAccessRules(rules: unknown): void {
  storedRules = normalizeAccessRules(rules);
  built = null;
}

/** The rules as stored (normalised), for the page that edits them. */
export function accessRulesNow(): AccessRules {
  return storedRules;
}

/** The person the levels are worked out for, or null when nobody is (the engine host, the tests, signed out). */
export function accessAccount(): AccessAccount | null {
  return person;
}

function rebuild(docs: readonly DocumentDefinition[]): Built {
  const who = person!;
  const access = buildAccess(docs.map(accessDocOf), storedRules);
  const boss = access.isBoss(who);
  const seen = access.modules(who).map((m) => m.module);
  const answers = new Set(boss ? [] : access.answersFor(who));
  const email = who.email;
  const describedEmails = new Set<string>([...DEFAULT_PEOPLE.map((p) => p.email), ...Object.keys(storedRules.people)]);
  for (const d of docs) for (const e of access.responsible(d.id)) describedEmails.add(e);
  const described = describedEmails.has(email);
  built = {
    docs,
    access,
    known: new Set(docs.map((d) => d.id)),
    answers,
    modules: boss || ACCESS_MODULES.every((m) => seen.includes(m)) ? null : seen,
    described,
    describedEmails,
    levels: new Map(),
  };
  return built;
}

/** The rules for the person as the catalogue stands now, or null when nobody is held to levels. */
function current(): Built | null {
  if (!person) return null;
  if (built) return built;
  return rebuild(catalogueSource ? catalogueSource() : []);
}

/** Called with the catalogue a repository has just read: a changed list (a format renumbered, a document added) is worked out again. */
export function noteAccessCatalogue(docs: readonly DocumentDefinition[]): void {
  if (person && built && built.docs !== docs) rebuild(docs);
}

/** The whole set of rules, for a screen that asks about many people (the scorecard, Users & Access). Null with nobody signed in. */
export function currentAccess(): Access | null {
  return current()?.access ?? null;
}

/** True for the super admin, who sees and does everything. False with nobody held to levels. */
export function isBossSignedIn(): boolean {
  return !!person && person.role === "admin";
}

/**
 * THE SIGNED-IN PERSON'S LEVEL ON A DOCUMENT. With nobody held to levels: Edit on whatever the department scope shows
 * (as before levels existed), None on the rest.
 */
export function documentLevel(documentId: string | undefined, formatNo?: string): AccessLevel {
  if (!documentId) return "none";
  let b = current();
  if (!b) return departmentVisible(documentId, formatNo) ? "edit" : "none";
  const hit = b.levels.get(documentId);
  if (hit !== undefined) return hit;
  if (!b.known.has(documentId) && catalogueSource) {
    const now = catalogueSource();
    if (now !== b.docs) b = rebuild(now);
  }
  const level = b.known.has(documentId) ? b.access.level(person!, documentId) : unknownDocumentLevel(documentId, formatNo, b);
  b.levels.set(documentId, level);
  return level;
}

/** A document the catalogue does not list (yet): kept to its department, as the rules keep a document of that module. */
function unknownDocumentLevel(documentId: string, formatNo: string | undefined, b: Built): AccessLevel {
  if (b.access.isBoss(person!)) return "edit";
  const code = departmentOfDocument(documentId, formatNo);
  return code ? b.access.moduleLevel(person!, code) : "none";
}

/** May the signed-in person do this to the document? */
export function mayDo(documentId: string | undefined, action: DocumentAction): boolean {
  return atLeast(documentLevel(documentId), levelNeeded(action));
}

/**
 * MAY THIS BROWSER WRITE THE RECORDS OF THIS DOCUMENT BY ITSELF (make the month's blank sheets, prepare the known
 * parts, put an old record right)? Only those of a document the signed-in person may fill: the server refuses a change
 * below Write (the records item is checked record by record), and its morning job makes and prepares the rest for the
 * whole plant. With nobody held to levels (the engine host, the tests), every document, as before.
 */
export function mayWriteRecordsOf(documentId: string): boolean {
  if (!person) return true;
  return mayDo(documentId, "fill");
}

/**
 * IS THIS DOCUMENT THE PERSON'S OWN WORK: what the reminders, the briefing and the daily nudge count (§96). The
 * documents they answer for and may fill; the super admin, everything; an account nobody has described (it answers
 * for nothing by the rules), everything it may fill, as before levels existed. With nobody held to levels: whatever
 * is visible.
 */
export function isMine(documentId: string): boolean {
  const b = current();
  if (!b) return departmentVisible(documentId);
  if (b.access.isBoss(person!)) return true;
  if (b.answers.size > 0 || b.described) return b.answers.has(documentId);
  return mayDo(documentId, "fill");
}

/** The ids the person answers for, or null when that is not how their work is decided (the super admin, an account nobody described, nobody held to levels). */
export function answersForIds(): ReadonlySet<string> | null {
  const b = current();
  if (!b || b.access.isBoss(person!) || (b.answers.size === 0 && !b.described)) return null;
  return b.answers;
}

/** Is the person named in the rules at all? False for the super admin's unknown accounts, which keep what they had. */
export function personDescribed(): boolean {
  return current()?.described ?? false;
}

const EMAIL_BY_NAME = new Map(DEFAULT_PEOPLE.map((p) => [sameName(p.name), p.email] as const));
const NAME_BY_EMAIL = new Map(DEFAULT_PEOPLE.map((p) => [p.email, p.name] as const));

/** "new.person@gpp.local" as "New Person": an account the owner's twelve do not name, called by its address. */
const nameFromEmail = (email: string): string =>
  email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || email;

/**
 * WHO ANSWERS FOR A DOCUMENT, BY NAME (REQUIREMENTS §96): the people the owner's table (or the super admin, on Users &
 * Access) names for it who may fill it, as the bell's reminders name them. Null when nobody is held to levels (signed
 * out, the engine host, the tests), where the screens fall back on the roles of Master Data as before; empty when the
 * table names nobody (the super admin answers for it then).
 */
export function answerersOf(documentId: string): string[] | null {
  const b = current();
  if (!b) return null;
  return b.access
    .responsible(documentId)
    .filter((email) => b.access.may({ email, role: "staff", departments: [] }, documentId, "fill"))
    .map((email) => NAME_BY_EMAIL.get(email) ?? nameFromEmail(email));
}

/**
 * WHO ANSWERS FOR A DOCUMENT, FOR THE SCORES (REQUIREMENTS §96): a record counts against the people who answer for its
 * document and may fill it (engine/accessRules.ts). A person is known by the email the list gives, else by the
 * owner's twelve names; an account the rules never name is scored by its departments, as before. The super admin
 * answers for none. Null with nobody held to levels (the engine host, the tests): engine/performance.ts then scores by
 * department, as it always has.
 */
export function scoreAnswerRule(): AnswerRule | null {
  const b = current();
  if (!b) return null;
  const { access, describedEmails } = b;
  const emailOf = (p: Person): string | null => {
    const given = typeof p.email === "string" && p.email.includes("@") ? p.email.trim().toLowerCase() : null;
    return given ?? EMAIL_BY_NAME.get(sameName(p.name)) ?? null;
  };
  const cache = new Map<string, boolean>();
  return (p, doc) => {
    const key = `${p.id}|${doc.id}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let answers = false;
    if (p.role !== "admin") {
      const email = emailOf(p);
      if (email && describedEmails.has(email)) {
        answers = access.responsible(doc.id).includes(email) && access.may({ email, role: p.role, departments: p.departments }, doc.id, "fill");
      } else {
        const code = departmentOfDocument(doc.id, doc.formatNo);
        answers = !!code && keptTo(p).includes(code);
      }
    }
    cache.set(key, answers);
    return answers;
  };
}

// ---------------------------------------------------------------------------
// what the screens have always asked

function departmentVisible(documentId: string, formatNo?: string): boolean {
  if (!scope) return true;
  const code = departmentOfDocument(documentId, formatNo);
  return code === null || scope.includes(code);
}

/** The departments in scope, or null when every department is (the super admin, a person who sees all ten modules). */
export function departmentScope(): string[] | null {
  const b = current();
  if (b) return b.modules;
  return scope;
}

/** Is this user unrestricted (the super admin, a person who sees all ten modules, an unassigned account)? */
export function seesEveryDepartment(): boolean {
  return departmentScope() === null;
}

/** The scope in words: "Quality Control", "Quality Control and Production", "every department". */
export function departmentScopeLabel(): string {
  const codes = departmentScope();
  if (!codes) return "every department";
  if (codes.length === 0) return "no department";
  const names = codes.map(departmentName);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The department code that owns a document. */
export function documentDepartment(documentId: string, formatNo?: string): string | null {
  return departmentOfDocument(documentId, formatNo);
}

/**
 * May the current user see this document? With a person signed in: Read or more on it. Otherwise the department
 * scope, where a document no department owns is shown to everyone rather than hidden from everyone.
 */
export function isDocumentIdVisible(documentId: string | undefined, formatNo?: string): boolean {
  if (!documentId) return false;
  if (!person) return departmentVisible(documentId, formatNo);
  return documentLevel(documentId, formatNo) !== "none";
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
