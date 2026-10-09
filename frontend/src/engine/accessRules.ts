// WHO MAY DO WHAT TO WHICH DOCUMENT — ONE RULE FOR THE PAGES, THE SERVER AND THE PHONE (REQUIREMENTS §96).
//
// The owner, 7-Oct-2026: "qc is for Kapila Barad, HR is for Vinay Bhojak, SYS = Kapila Barad ... and they are the
// responsible persons for filling those documents, and for all other documents give view access ... purchase: Chirag
// Parmar, store: Bharat Ahir, PRD: Ajay Sinh Vaghela, and till PRD-13 and 17 Dharmik Mistry and Anil Ravad, from 18 to
// 26 Vishnu Jadhav who is HOD of the Pouch department ... MNT: Kapila Barad for 01, from 02 to 08 Raghunath Mane, 09 to
// 10 Ajay Zala, and Kapila Barad for MNT-11 ... HR 1 to 14 Vinay Bhojak, 15 to 18 Kapila Barad, 19 to 22 Vinay Bhojak ...
// QC-13, 34, 40 A, 40 B Ajay Zala, QC-41, 30, 32, 40 C Ankur Raval ... Kapila Barad has all access but she can only edit
// QC and SYS documents, in every other module she can only view." Then, answering two rounds of questions: each person
// views only the modules of the documents they fill; Kapila Barad and the super admin view everything; Ajay Sinh Vaghela,
// head of Production, fills every PRD document and the camera challenge test; Sandeep Parekh fills HR like Vinay Bhojak;
// whoever may fill a document may also verify it, as today; the accounts are name.surname@gpp.local.
//
// The owner, 8-Oct-2026: "Consider superadmin as boss which can see anything ... in our dashboard in audit software I can
// give access from there only, and this can do only the superadmin, and make there an option which user can do access what
// and give read, write and edit access accordingly."
//
// SO EVERY DOCUMENT HAS TWO THINGS, and this file is the only place that decides either:
//   * WHO ANSWERS FOR IT: the people who fill it. They are told when it falls due, a late record counts against them, and
//     they get Edit on it. The owner's table above is the default; the super admin can replace it for any document.
//   * WHAT EACH PERSON MAY DO WITH IT, as one of four levels (cumulative, each includes the one before):
//       none   the document is not shown at all;
//       read   see the document and its records, print and download them;
//       write  also start and fill records, save drafts, submit them and verify them (as today, whoever may fill may verify);
//       edit   also correct a record that is already signed off, delete a record, and change the format's printed words.
//     A level is set per module (department) and can be set again per document. The super admin is above all of it: every
//     document at Edit, and the only one who can change this table.
//
// A PERSON'S LEVEL ON A DOCUMENT, first match wins (level()):
//   1. the super admin                                   edit
//   2. the person's own setting for that document        whatever the super admin set
//   3. the person's own setting for that module          whatever the super admin set
//   4. they answer for the document                      edit
//   5. the module's default for them                     read, or edit for Kapila Barad in QC and SYS
//   6. an account nobody has described yet               as before this existed: every module at Edit when it has no
//                                                       departments, else those departments at Edit — so nobody is locked out
//   7. anything else                                     none
//
// WITH NO IMPORTS AT ALL, like engine/latenessCore.ts, because the server runs its .ts files with Node's type stripping,
// which cannot follow the app's extensionless imports: the browser, the engine host (the Mitra phone app's rules, run on
// the server) and backend/index.ts all read THIS file. frontend/tests/accessRules.test.ts holds it to the owner's table,
// document by document.

export type AccessLevel = "none" | "read" | "write" | "edit";

export const ACCESS_LEVELS: readonly AccessLevel[] = ["none", "read", "write", "edit"];

const RANK: Record<AccessLevel, number> = { none: 0, read: 1, write: 2, edit: 3 };

export const levelRank = (level: AccessLevel): number => RANK[level];
export const atLeast = (have: AccessLevel, need: AccessLevel): boolean => RANK[have] >= RANK[need];
const higher = (a: AccessLevel, b: AccessLevel): AccessLevel => (RANK[a] >= RANK[b] ? a : b);

/** What a person can ask to do with a document or a record of it. */
export type DocumentAction = "view" | "start" | "fill" | "submit" | "verify" | "send_back" | "correct" | "delete" | "format";

const NEEDS: Record<DocumentAction, AccessLevel> = {
  view: "read",
  start: "write",
  fill: "write",
  submit: "write",
  verify: "write",
  send_back: "write",
  correct: "edit",
  delete: "edit",
  format: "edit",
};

/** The lowest level that allows the action. */
export const levelNeeded = (action: DocumentAction): AccessLevel => NEEDS[action];

/** The levels in the owner's words, for the page that sets them and the answer that refuses one. */
export const LEVEL_WORDS: Record<AccessLevel, { name: string; can: string }> = {
  none: { name: "No access", can: "does not see the document at all" },
  read: { name: "Read", can: "can see the document and its records, and print or download them" },
  write: { name: "Write", can: "can also start and fill records, save drafts, submit them and verify them" },
  edit: { name: "Edit", can: "can also correct records that are already signed off, delete records, and change the format's printed words" },
};

/** The plant's ten modules (departments), in the order the pages list them. Equal to data/seed/documentDepartments.ts PLANT_DEPARTMENTS (the unit test holds them to it). */
export const ACCESS_MODULES: readonly string[] = ["QC", "HR", "SYS", "MNT", "PRD", "PUR", "STR", "MKT", "DISP", "QA"];

// ---------------------------------------------------------------------------
// the shapes this reads

/** The few fields of a document definition the rules read; the app's DocumentDefinition fits as it is (department from departmentOfDocument). */
export interface AccessDoc {
  id: string;
  formatNo: string;
  department: string | null;
  /** A document kept as issued (a licence, a statement of compliance, the chemical chart): it has no records, so nobody fills it. */
  reference?: boolean;
}

/** The few fields of an account the rules read; the app's AuthUser and the server's user row fit. */
export interface AccessAccount {
  email: string;
  role: string;
  departments?: readonly string[] | null;
}

/** One person's own settings, set by the super admin. A module or document not listed keeps its default. */
export interface PersonRules {
  modules?: Record<string, AccessLevel>;
  documents?: Record<string, AccessLevel>;
}

/** What the super admin has set (stored as a company item in PostgreSQL, written only by the super admin). Everything not here is the default below. */
export interface AccessRules {
  version: 1;
  /** By lower-cased email. */
  people: Record<string, PersonRules>;
  /** Document id -> who answers for it, the main person first; replaces the default table for that document. */
  responsibility: Record<string, string[]>;
}

export const EMPTY_ACCESS_RULES: AccessRules = { version: 1, people: {}, responsibility: {} };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const lower = (s: string): string => s.trim().toLowerCase();
const isLevel = (v: unknown): v is AccessLevel => typeof v === "string" && (ACCESS_LEVELS as readonly string[]).includes(v);

/**
 * WHAT WAS STORED, MADE SAFE TO USE. The stored value is JSON that came through a browser and the database: anything not
 * a level, a known module or an email is dropped, emails are lower-cased and each list kept once. Never throws; a value
 * that is not an object is no settings at all.
 */
export function normalizeAccessRules(value: unknown): AccessRules {
  if (!isRecord(value)) return { version: 1, people: {}, responsibility: {} };
  const people: Record<string, PersonRules> = {};
  if (isRecord(value.people)) {
    for (const [rawEmail, rawRules] of Object.entries(value.people)) {
      const email = lower(rawEmail);
      if (!email.includes("@") || !isRecord(rawRules)) continue;
      const rules: PersonRules = {};
      if (isRecord(rawRules.modules)) {
        const modules: Record<string, AccessLevel> = {};
        for (const [code, level] of Object.entries(rawRules.modules)) {
          const module = code.trim().toUpperCase();
          if (ACCESS_MODULES.includes(module) && isLevel(level)) modules[module] = level;
        }
        rules.modules = modules;
      }
      if (isRecord(rawRules.documents)) {
        const documents: Record<string, AccessLevel> = {};
        for (const [id, level] of Object.entries(rawRules.documents)) if (id.trim() && isLevel(level)) documents[id.trim()] = level;
        rules.documents = documents;
      }
      people[email] = rules;
    }
  }
  const responsibility: Record<string, string[]> = {};
  if (isRecord(value.responsibility)) {
    for (const [id, list] of Object.entries(value.responsibility)) {
      if (!id.trim() || !Array.isArray(list)) continue;
      const emails = Array.from(new Set(list.filter((e): e is string => typeof e === "string").map(lower).filter((e) => e.includes("@"))));
      responsibility[id.trim()] = emails;
    }
  }
  return { version: 1, people, responsibility };
}

// ---------------------------------------------------------------------------
// a format number, read

const DEPARTMENT_CODES = "SYS|MKT|PUR|STR|QC|QA|PRD|MNT|HR|DISP";
// The same shapes engine/formatNumbers.ts reads: F/HR/05, F-QC-30, F/QC-38, F/QC/15-A, F-QC-40.C, F/SYS/04-A.
const WHOLE = new RegExp(`^\\s*F?\\s*[-/ ]?\\s*(${DEPARTMENT_CODES})\\s*[-/ ]?\\s*(\\d{1,2})\\s*(?:[.-]?\\s*([A-Z]))?\\s*$`, "i");

/** "F/QC/40.C" -> { department: "QC", number: 40, suffix: "C" }; null for a number of another shape (QA-CAF-00, "TO BE CONFIRMED", the camera test's). */
export function parseFormatNo(formatNo: string): { department: string; number: number; suffix: string } | null {
  const m = WHOLE.exec(formatNo);
  return m ? { department: m[1]!.toUpperCase(), number: Number(m[2]), suffix: m[3] ? m[3].toUpperCase() : "" } : null;
}

// ---------------------------------------------------------------------------
// the plant's people, and who answers for what by default

/** The people the owner named, as the accounts the super admin creates for them (name.surname@gpp.local, 7-Oct-2026). */
export const DEFAULT_PEOPLE: readonly { email: string; name: string }[] = [
  { email: "kapila.barad@gpp.local", name: "Kapila Barad" },
  { email: "vinay.bhojak@gpp.local", name: "Vinay Bhojak" },
  { email: "sandeep.parekh@gpp.local", name: "Sandeep Parekh" },
  { email: "chirag.parmar@gpp.local", name: "Chirag Parmar" },
  { email: "bharat.ahir@gpp.local", name: "Bharat Ahir" },
  { email: "ajaysinh.vaghela@gpp.local", name: "Ajay Sinh Vaghela" },
  { email: "dharmik.mistry@gpp.local", name: "Dharmik Mistry" },
  { email: "anil.ravad@gpp.local", name: "Anil Ravad" },
  { email: "vishnu.jadhav@gpp.local", name: "Vishnu Jadhav" },
  { email: "raghunath.mane@gpp.local", name: "Raghunath Mane" },
  { email: "ajay.zala@gpp.local", name: "Ajay Zala" },
  { email: "ankur.raval@gpp.local", name: "Ankur Raval" },
];

const KAPILA = "kapila.barad@gpp.local";
const VINAY = "vinay.bhojak@gpp.local";
const SANDEEP = "sandeep.parekh@gpp.local";
const CHIRAG = "chirag.parmar@gpp.local";
const BHARAT = "bharat.ahir@gpp.local";
const AJAY_SINH = "ajaysinh.vaghela@gpp.local";
const DHARMIK = "dharmik.mistry@gpp.local";
const ANIL = "anil.ravad@gpp.local";
const VISHNU = "vishnu.jadhav@gpp.local";
const RAGHUNATH = "raghunath.mane@gpp.local";
const AJAY_ZALA = "ajay.zala@gpp.local";
const ANKUR = "ankur.raval@gpp.local";

/** The person who has every module to read, and Edit in QC and SYS (the owner, 7-Oct-2026: "she can only edit QC and SYS documents, in every other module she can only view"). */
const SEES_EVERYTHING = new Map<string, Record<string, AccessLevel>>([[KAPILA, { QC: "edit", SYS: "edit" }]]);

/** Documents the owner named one by one, or whose number cannot tell them apart (F-QC-30 the viscosity record and F/QC/30 the minutes). */
const NAMED: Record<string, string[]> = {
  "qc-camera-challenge-test": [AJAY_SINH],
  "qc-viscosity": [ANKUR],
  "qc-minutes-of-meetings": [KAPILA],
};

const inRange = (n: number, from: number, to: number): boolean => n >= from && n <= to;

/**
 * WHO ANSWERS FOR A DOCUMENT BY DEFAULT: the owner's table, by the format number, so a format supplied later lands with
 * the right person. A document whose number is not of the F/<department>/<nn> shape follows its department. The main
 * person comes first. An empty answer means no one is named, and the super admin answers: that is the answer for a
 * reference document, which is viewed by the modules that can see it and filled by nobody (the owner, 7-Oct-2026).
 */
export function defaultResponsible(doc: AccessDoc): string[] {
  if (doc.reference) return [];
  const named = NAMED[doc.id];
  if (named) return named.slice();
  const department = doc.department ?? "";
  const parsed = parseFormatNo(doc.formatNo);
  const number = parsed && parsed.department === department ? parsed.number : null;
  const suffix = parsed && parsed.department === department ? parsed.suffix : "";
  switch (department) {
    case "QC":
      if (number === 13 || number === 34 || (number === 40 && (suffix === "A" || suffix === "B"))) return [AJAY_ZALA];
      if (number === 32 || number === 41 || (number === 40 && suffix === "C")) return [ANKUR];
      return [KAPILA];
    case "HR":
      if (number !== null && (inRange(number, 1, 14) || inRange(number, 19, 22))) return [VINAY, SANDEEP];
      return [KAPILA];
    case "MNT":
      if (number !== null && inRange(number, 2, 8)) return [RAGHUNATH];
      if (number === 9 || number === 10) return [AJAY_ZALA];
      return [KAPILA];
    case "PRD":
      if (number !== null && (inRange(number, 1, 13) || number === 17)) return [DHARMIK, ANIL, AJAY_SINH];
      if (number !== null && inRange(number, 18, 26)) return [VISHNU, AJAY_SINH];
      return [AJAY_SINH];
    case "PUR":
      return [CHIRAG];
    case "STR":
      return [BHARAT];
    case "SYS":
    case "MKT":
    case "DISP":
    case "QA":
      return [KAPILA];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// the rules, built once for a catalogue

export interface Access {
  /** Who answers for the document (emails, the main one first). Empty: nobody is named and the super admin answers. */
  responsible(documentId: string): string[];
  /** The account's level on the document. */
  level(account: AccessAccount, documentId: string): AccessLevel;
  /** Whether the account may do this to the document. */
  may(account: AccessAccount, documentId: string, action: DocumentAction): boolean;
  /** The ids of the documents the account answers for AND may fill: the ones it is told about and counted against. */
  answersFor(account: AccessAccount): string[];
  /** The modules the account sees at all (a document in it at Read or more), with the highest level it has in each; the super admin has all ten at Edit. */
  modules(account: AccessAccount): { module: string; level: AccessLevel }[];
  /** The level the account has on the module as a whole, before any document of its own (the cell of the super admin's grid). */
  moduleLevel(account: AccessAccount, module: string): AccessLevel;
  /** True for the super admin, who sees and does everything and alone changes these rules. */
  isBoss(account: AccessAccount): boolean;
}

/**
 * THE RULES FOR ONE CATALOGUE AND WHAT THE SUPER ADMIN HAS SET. Built once and asked many times: every answer is a map
 * lookup, so a page may ask for every document of a module in one render.
 */
export function buildAccess(docs: readonly AccessDoc[], storedRules?: unknown): Access {
  const stored = normalizeAccessRules(storedRules);
  const byId = new Map<string, AccessDoc>(docs.map((d) => [d.id, d] as const));
  const answers = new Map<string, string[]>();
  // Whom each person sees a module through, by what they answer for: their own module (the owner, 7-Oct-2026: "own module only").
  const derivedModules = new Map<string, Set<string>>();
  for (const d of docs) {
    const list = stored.responsibility[d.id] ?? defaultResponsible(d);
    answers.set(d.id, list);
    for (const email of list) {
      if (!d.department) continue;
      let set = derivedModules.get(email);
      if (!set) derivedModules.set(email, (set = new Set<string>()));
      set.add(d.department);
    }
  }
  const described = new Set<string>([...DEFAULT_PEOPLE.map((p) => p.email), ...Object.keys(stored.people), ...derivedModules.keys()]);

  const isBoss = (a: AccessAccount): boolean => a.role === "admin";

  /** The module's level for a person before any document is looked at: the setting, else the default. */
  const moduleBase = (email: string, module: string): AccessLevel => {
    const set = stored.people[email]?.modules?.[module];
    if (set !== undefined) return set;
    let level: AccessLevel = "none";
    if (SEES_EVERYTHING.has(email)) level = higher(level, SEES_EVERYTHING.get(email)![module] ?? "read");
    if (derivedModules.get(email)?.has(module)) level = higher(level, "read");
    return level;
  };

  const level = (account: AccessAccount, documentId: string): AccessLevel => {
    if (isBoss(account)) return "edit";
    const doc = byId.get(documentId);
    if (!doc) return "none";
    const email = lower(account.email ?? "");
    const person = stored.people[email];
    const own = person?.documents?.[documentId];
    if (own !== undefined) return own;
    const module = doc.department ?? "";
    const ownModule = person?.modules?.[module];
    if (ownModule !== undefined) return ownModule;
    if (answers.get(documentId)?.includes(email)) return "edit";
    const base = moduleBase(email, module);
    if (base !== "none") return base;
    if (described.has(email)) return "none";
    // An account nobody has described yet keeps what it had: every module when it has no departments, else those departments.
    const departments = (account.departments ?? []).map((d) => d.trim().toUpperCase()).filter(Boolean);
    if (departments.length === 0) return "edit";
    return departments.includes(module) ? "edit" : "none";
  };

  return {
    responsible: (documentId) => (answers.get(documentId) ?? []).slice(),
    level,
    may: (account, documentId, action) => atLeast(level(account, documentId), NEEDS[action]),
    answersFor: (account) => {
      if (isBoss(account)) return [];
      const email = lower(account.email ?? "");
      const ids: string[] = [];
      for (const d of docs) if (answers.get(d.id)?.includes(email) && atLeast(level(account, d.id), "write")) ids.push(d.id);
      return ids;
    },
    modules: (account) => {
      const top = new Map<string, AccessLevel>();
      for (const d of docs) {
        if (!d.department) continue;
        const have = level(account, d.id);
        if (have !== "none") top.set(d.department, higher(top.get(d.department) ?? "none", have));
      }
      return ACCESS_MODULES.filter((m) => top.has(m)).map((module) => ({ module, level: top.get(module)! }));
    },
    moduleLevel: (account, module) => {
      if (isBoss(account)) return "edit";
      const email = lower(account.email ?? "");
      const base = moduleBase(email, module);
      if (base !== "none" || described.has(email)) return base;
      const departments = (account.departments ?? []).map((d) => d.trim().toUpperCase()).filter(Boolean);
      return departments.length === 0 || departments.includes(module) ? "edit" : "none";
    },
    isBoss,
  };
}
