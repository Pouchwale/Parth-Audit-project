import {
  ACCESS_MODULES,
  DEFAULT_PEOPLE,
  LEVEL_WORDS,
  buildAccess,
  defaultResponsible,
  normalizeAccessRules,
  type Access,
  type AccessAccount,
  type AccessDoc,
  type AccessLevel,
  type AccessRules,
  type PersonRules,
} from "./accessRules";

// WHAT THE SUPER ADMIN CHANGES ON USERS & ACCESS, WORKED OUT WITHOUT A SCREEN (REQUIREMENTS §96).
//
// The owner, 8-Oct-2026: "in our dashboard in the audit software I can give access from there only, and only the
// superadmin can do this: make an option for which user can access what, and give read, write and edit access
// accordingly." pages/UsersPage.tsx draws it; this file decides what one change does to the stored rules, how it is
// asked in plain words before it is saved ("Give Ankur Raval Edit in Quality Control? They will be able to ..."), and
// which accounts nobody has described yet. Pure: frontend/tests/accessEditing.test.ts holds it.

/** One change the super admin makes. A level of null puts the person back to the owner's table there. */
export type AccessChange =
  | { kind: "module"; email: string; module: string; level: AccessLevel | null }
  | { kind: "document"; email: string; documentId: string; level: AccessLevel | null }
  | { kind: "answers"; email: string; documentId: string; answers: boolean };

const lower = (s: string): string => s.trim().toLowerCase();

const clonePerson = (p: PersonRules | undefined): PersonRules => ({
  ...(p?.modules ? { modules: { ...p.modules } } : {}),
  ...(p?.documents ? { documents: { ...p.documents } } : {}),
});

/**
 * THE RULES WITH ONE CHANGE MADE. Never changes what it was given. A setting put back to the default is removed, so
 * the stored rules hold only what the super admin chose; who answers for a document is stored only where it differs
 * from the owner's table (`docs` gives the table's answer).
 */
export function applyAccessChange(rules: AccessRules, change: AccessChange, docs: readonly AccessDoc[]): AccessRules {
  const base = normalizeAccessRules(rules);
  const people: Record<string, PersonRules> = Object.fromEntries(Object.entries(base.people).map(([e, p]) => [e, clonePerson(p)]));
  const responsibility: Record<string, string[]> = Object.fromEntries(Object.entries(base.responsibility).map(([id, list]) => [id, list.slice()]));
  const email = lower(change.email);

  if (change.kind === "module" || change.kind === "document") {
    const person = people[email] ?? {};
    const field = change.kind === "module" ? "modules" : "documents";
    const key = change.kind === "module" ? change.module.toUpperCase() : change.documentId;
    const map = { ...(person[field] ?? {}) };
    if (change.level === null) delete map[key];
    else map[key] = change.level;
    if (Object.keys(map).length > 0) person[field] = map;
    else delete person[field];
    // Kept even when empty: an account the super admin has looked at is described, and no longer keeps the old way.
    people[email] = person;
  } else {
    const doc = docs.find((d) => d.id === change.documentId);
    const table = doc ? defaultResponsible(doc) : [];
    const now = responsibility[change.documentId] ?? table;
    const next = change.answers ? (now.includes(email) ? now.slice() : [...now, email]) : now.filter((e) => e !== email);
    const same = next.length === table.length && next.every((e, i) => e === table[i]);
    if (same) delete responsibility[change.documentId];
    else responsibility[change.documentId] = next;
  }
  return normalizeAccessRules({ version: 1, people, responsibility });
}

// ---------------------------------------------------------------------------
// the words

const CAN_READ = "see its documents and their records, and print or download them";
const CAN_WRITE = "start and fill records, save drafts, submit them and verify them";
const CAN_EDIT = "correct records that are already signed off, delete records, and change the format's printed words";

/** What a level lets a person do, as one sentence that follows "They will be able to" or says what they cannot. */
export function levelConsequence(level: AccessLevel, place: string): string {
  switch (level) {
    case "edit":
      return `They will be able to ${CAN_READ}; ${CAN_WRITE}; and ${CAN_EDIT}.`;
    case "write":
      return `They will be able to ${CAN_READ}, and ${CAN_WRITE}. Correcting a signed-off record, deleting one and changing the format stay with Edit.`;
    case "read":
      return `They will be able to ${CAN_READ}, and nothing more: no starting, filling, submitting or verifying.`;
    default:
      return `They will not see ${place} at all.`;
  }
}

/** The four levels with their words, for the legend beside the grid. */
export const LEVEL_LEGEND: readonly { level: AccessLevel; name: string; can: string }[] = (["none", "read", "write", "edit"] as const).map((level) => ({
  level,
  name: LEVEL_WORDS[level].name,
  can: LEVEL_WORDS[level].can,
}));

/** How the super admin is asked before a change is saved. `person` is the name; `place` the module's name or the document as it is called. */
export function changeQuestion(change: AccessChange, person: string, place: string, defaultLevel: AccessLevel): { title: string; body: string; confirm: string } {
  if (change.kind === "answers") {
    return change.answers
      ? {
          title: `Make ${person} answer for ${place}?`,
          body: `${person} will be told when ${place} falls due, it will count in ${person}'s score, and ${person} gets Edit on it unless you set another level.`,
          confirm: `Yes, ${person} answers for it`,
        }
      : {
          title: `Stop ${person} answering for ${place}?`,
          body: `${person} will no longer be told when it falls due, and it will no longer count in ${person}'s score. If nobody else answers for it, the super admin does.`,
          confirm: "Yes, stop it",
        };
  }
  const where = change.kind === "module" ? `in ${place}` : `on ${place}`;
  if (change.level === null) {
    return {
      title: `Put ${person} back to the owner's table ${where}?`,
      body: `The owner's table gives ${person} ${LEVEL_WORDS[defaultLevel].name} ${where}. ${levelConsequence(defaultLevel, place)}`,
      confirm: "Yes, put it back",
    };
  }
  const level = change.level;
  return {
    title: level === "none" ? `Take away ${person}'s access ${where}?` : `Give ${person} ${LEVEL_WORDS[level].name} ${where}?`,
    body: `${levelConsequence(level, place)} ${person} is told of the change, and it is written in the activity log.`,
    confirm: level === "none" ? "Yes, take it away" : `Yes, give ${LEVEL_WORDS[level].name}`,
  };
}

/** What is said once a change is saved. */
export function changeSaved(change: AccessChange, person: string, place: string, defaultLevel: AccessLevel): string {
  if (change.kind === "answers") return change.answers ? `Saved. ${person} now answers for ${place}.` : `Saved. ${person} no longer answers for ${place}.`;
  const where = change.kind === "module" ? `in ${place}` : `on ${place}`;
  const level = change.level ?? defaultLevel;
  return `Saved. ${person} now has ${LEVEL_WORDS[level].name} ${where}${change.level === null ? ", as the owner's table says" : ""}.`;
}

/** The refusal of a save made on rules somebody else has changed since the page read them (409). */
export const STALE_RULES_WORDS =
  "Somebody changed the access since this page was opened, so nothing was saved. Reload to see their change, then make yours again.";

// ---------------------------------------------------------------------------
// the accounts

export interface AccessPerson {
  id: string;
  name: string;
  email: string;
  role: string;
  departments: readonly string[];
  active?: boolean;
}

/** Every email the rules name: the owner's twelve, a stored setting, anybody a document is given to. */
export function describedEmails(rules: AccessRules, docs: readonly AccessDoc[], access?: Access): Set<string> {
  const a = access ?? buildAccess(docs, rules);
  const set = new Set<string>([...DEFAULT_PEOPLE.map((p) => p.email), ...Object.keys(normalizeAccessRules(rules).people)]);
  for (const d of docs) for (const e of a.responsible(d.id)) set.add(e);
  return set;
}

/** Staff accounts nobody has described: they keep what they had (their departments, or every module at Edit), and the page asks the super admin to choose. */
export function undescribedAccounts<P extends AccessPerson>(people: readonly P[], rules: AccessRules, docs: readonly AccessDoc[], access?: Access): P[] {
  const named = describedEmails(rules, docs, access);
  return people.filter((p) => p.role !== "admin" && p.active !== false && !named.has(lower(p.email)));
}

/** What an account nobody has described keeps, in words. */
export function keepsWhatItHad(p: Pick<AccessPerson, "departments">, moduleName: (code: string) => string): string {
  const codes = p.departments.map((c) => c.trim().toUpperCase()).filter((c) => (ACCESS_MODULES as readonly string[]).includes(c));
  return codes.length === 0 ? "Edit in every module, as before" : `Edit in ${codes.map(moduleName).join(", ")}, as before`;
}

/** The owner's people who have no account yet (by sign-in address). */
export function missingPeople(people: readonly Pick<AccessPerson, "email">[]): { email: string; name: string }[] {
  const have = new Set(people.map((p) => lower(p.email)));
  return DEFAULT_PEOPLE.filter((p) => !have.has(p.email));
}

/** Would making this account staff leave no super admin who can sign in? */
export function lastSuperAdmin(people: readonly AccessPerson[], id: string): boolean {
  const others = people.filter((p) => p.id !== id && p.role === "admin" && p.active !== false);
  return others.length === 0;
}

/** The account as the rules read it. */
export const accountOf = (p: Pick<AccessPerson, "email" | "role" | "departments">): AccessAccount => ({ email: lower(p.email), role: p.role, departments: p.departments });

/**
 * WHAT EACH MODULE WOULD BE FOR THIS PERSON WITHOUT ITS OWN SETTING: the grid's "as the owner's table" choice. The
 * person's document settings and everybody else's stay; an account nobody described stays undescribed.
 */
export function moduleDefaults(rules: AccessRules, docs: readonly AccessDoc[], p: Pick<AccessPerson, "email" | "role" | "departments">): Record<string, AccessLevel> {
  const r = normalizeAccessRules(rules);
  const email = lower(p.email);
  const people = { ...r.people };
  const own = people[email];
  if (own) people[email] = own.documents ? { documents: own.documents } : {};
  const a = buildAccess(docs, { version: 1, people, responsibility: r.responsibility });
  return Object.fromEntries(ACCESS_MODULES.map((m) => [m, a.moduleLevel(accountOf(p), m)]));
}

/** What each document would be for this person without its own setting (the drawer's "as the module" choice). */
export function documentDefaults(rules: AccessRules, docs: readonly AccessDoc[], p: Pick<AccessPerson, "email" | "role" | "departments">): Access {
  const r = normalizeAccessRules(rules);
  const email = lower(p.email);
  const people = { ...r.people };
  const own = people[email];
  if (own) people[email] = own.modules ? { modules: own.modules } : {};
  return buildAccess(docs, { version: 1, people, responsibility: r.responsibility });
}
