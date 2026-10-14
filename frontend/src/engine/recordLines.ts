import type { LogSheetLayout, LogSheetRow } from "../types";
import { getLogSheetLayoutForRecord } from "../data/seed/logSheetLayouts";
import { blankLogRow } from "./recordDefaults";
import { generateId } from "../utils/id";

// THE LINES OF EVERY RECORD KIND, IN ONE PLACE (REQUIREMENTS §113).
//
// "Mitra adds, changes and deletes anything in any record" (the owner,
// 13-Oct-2026) — and nothing is ever lost. Before this registry each path that
// touched a list decided for itself what a list allowed: the row commands knew
// a log sheet's rows, the patch checker copied a new line's shape from the
// first line it found, the sheet's Add Row button had its own rule, and a list
// sent whole through the patch quietly dropped every line it left out. This
// module says, once, for every list of every kind of record: whether lines may
// be added and removed, why not when not, what a new line looks like before
// the person writes anything, which key names a line on the paper, and which
// boxes a person writes (so "clear the line" knows what to blank). The patch
// checker (recordPatch.ts), Mitra's typed row commands (recordRowCommands.ts),
// the sheet's own buttons (components/records/LogSheetRecordView.tsx) and the
// engine host's answer to the phone all read the same rule.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

export interface LineRule {
  /** The list's key in the record's data: "rows", "entries", "findings". */
  key: string;
  /** What one line is called when Mitra speaks of it: "line", "unit", "finding". */
  noun: string;
  /** A person, or Mitra, may add a line. */
  canAdd: boolean;
  /** A person, or Mitra, may remove a line. */
  canRemove: boolean;
  /** Why lines are neither added nor removed, in plain words, when either is false. */
  whyFixed?: string;
  /** The list keeps at least this many lines (a free sheet's printed rows). */
  minLines: number;
  /** How many lines may be added at once. */
  maxAddAtOnce: number;
  /** One plain string a line (a clause, a topic), not an object. */
  scalar: boolean;
  /** The key that names a line on the paper: pcId, slNo, sNo, trapBoxNo, a time slot, an activity's srNo. */
  nameKey?: string;
  /** The key of the paper's own line number, where it numbers its lines: sNo, slNo, srNo, a Sr. No. column. */
  numberKey?: string;
  /** How a new line is numbered: its place on the sheet, or the next number never used (a finding's). */
  numbering?: "position" | "next";
  /** What a new line holds before the person writes anything: "" and null, printed values none. */
  blank: Obj | string;
  /** The keys a person writes — the ones "clear the line" blanks when no key is named. */
  writable: string[];
  /** The list this one sits inside, line by line (the checklist's activities under their sections). */
  within?: string;
}

const fixed = (noun: string, whyFixed: string, rest: Partial<LineRule> & Pick<LineRule, "key" | "blank" | "writable">): LineRule => ({
  noun,
  canAdd: false,
  canRemove: false,
  whyFixed,
  minLines: 0,
  maxAddAtOnce: 0,
  scalar: false,
  ...rest,
});

const open = (noun: string, rest: Partial<LineRule> & Pick<LineRule, "key" | "blank" | "writable">): LineRule => ({
  noun,
  canAdd: true,
  canRemove: true,
  minLines: 0,
  maxAddAtOnce: 50,
  scalar: false,
  ...rest,
});

const clauses = (key: string, noun: string): LineRule => open(noun, { key, scalar: true, blank: "", writable: [] });

/** Why a log sheet's lines are not added or removed, by the way the form prints them (engine/recordRowCommands.ts, §64). */
export const WHY_FIXED: Record<Exclude<LogSheetLayout["rowMode"]["kind"], "free">, string> = {
  timeSlots: "This sheet has one line for each time slot the form prints, so lines are not added or removed — only filled in.",
  single: "This sheet is a single line, so lines are not added or removed — only filled in.",
  fixedRows: "This form prints its own lines, so they are the format's, not this record's.",
};

/** A log sheet's rows, by the layout the record was filled on (REQUIREMENTS §74). */
export function logRowsRule(layout: LogSheetLayout): LineRule {
  const mode = layout.rowMode;
  const writable = layout.columns.filter((c) => !c.fixed && !c.computed && !c.linkedFrom).map((c) => c.key);
  const numberKey = layout.columns.find((c) => c.autoFill?.lineNumber)?.key;
  const blank = blankLogRow(layout, "");
  delete (blank as Obj).id;
  if (mode.kind === "free") {
    return open("line", { key: "rows", minLines: mode.minRows ?? 0, blank, writable, ...(numberKey ? { numberKey, numbering: "position" } : {}) });
  }
  return fixed("line", WHY_FIXED[mode.kind], { key: "rows", blank, writable, ...(mode.kind === "timeSlots" ? { nameKey: mode.slotKey } : {}), ...(numberKey ? { numberKey } : {}) });
}

const PHOTOS: LineRule = open("photo", { key: "photos", blank: { name: "", dataUrl: "" }, writable: [] });

const RULES: Record<string, LineRule[]> = {
  "daily-pest-monitoring": [
    // F/HR/17 — a rodent in a trap box: which box, where, how many (one of the Rodent Control areas).
    open("catch", { key: "rodentCatches", nameKey: "trapBoxNo", blank: { trapBoxNo: "", location: "", count: null }, writable: ["trapBoxNo", "location", "count"] }),
    // F/HR/17 — the summary of actions at the foot of the sheet.
    open("observation", {
      key: "summaryActions",
      blank: { dateOfObservation: "", descriptionOfObservation: "", actionTaken: "", remarks: "" },
      writable: ["dateOfObservation", "descriptionOfObservation", "actionTaken", "remarks"],
    }),
  ],
  "fly-catcher": [
    fixed("unit", "This register prints one line for each fly catcher unit, so units are not added or removed — only filled in or cleared.", {
      key: "entries",
      nameKey: "pcId",
      blank: { pcId: "", catchCountApprox: null, tubeLightInstallDate: null, tubeLightDueDate: null, cleaningDoneBy: "", verifiedBy: "" },
      writable: ["catchCountApprox", "tubeLightInstallDate", "tubeLightDueDate", "cleaningDoneBy", "verifiedBy"],
    }),
  ],
  "service-report": [
    fixed("area", "This report prints one line for each area of the service, so areas are not added or removed — only the quantity and remarks are written or cleared.", {
      key: "lines",
      nameKey: "slNo",
      numberKey: "slNo",
      blank: { slNo: 0, areaName: "", materialName: "", qtyUsed: "", methodOfApplication: "", remarks: "" },
      writable: ["qtyUsed", "remarks"],
    }),
  ],
  "gap-inspection": [
    // A finding starts Open and Internal: the printed form's starting state, not data. Its number is never reused.
    open("finding", {
      key: "findings",
      nameKey: "sNo",
      numberKey: "sNo",
      numbering: "next",
      blank: {
        sNo: 1,
        findingOfInspection: "",
        commentsOnFindings: "",
        correctiveActionContractor: "",
        correctiveActionClient: "",
        targetDate: null,
        actualDateOfAction: null,
        verifiedByServiceProvider: "",
        status: "Open",
        source: "Internal",
      },
      writable: ["findingOfInspection", "commentsOnFindings", "correctiveActionContractor", "correctiveActionClient", "targetDate", "actualDateOfAction", "verifiedByServiceProvider"],
    }),
    clauses("generalComments", "comment"),
  ],
  "training-record": [
    open("attendee", { key: "attendees", nameKey: "employeeName", blank: { employeeName: "", department: "" }, writable: ["employeeName", "department"] }),
    clauses("topics", "topic"),
  ],
  "complaint-checklist": [
    fixed("section", "The checklist prints its sections and activities, so none are added or removed — only answered or cleared.", {
      key: "sections",
      nameKey: "key",
      blank: { key: "", title: "", items: [] },
      writable: [],
    }),
    fixed("activity", "The checklist prints its sections and activities, so none are added or removed — only answered or cleared.", {
      key: "items",
      within: "sections",
      nameKey: "srNo",
      numberKey: "srNo",
      blank: { srNo: 0, activity: "", done: false, date: null, comment: "", notRequired: false },
      writable: ["done", "date", "comment", "notRequired"],
    }),
  ],
  "complaint-ack": [PHOTOS],
  "pest-responsibilities": [
    clauses("siteResponsibilities", "point"),
    clauses("equipmentStorage", "point"),
    open("contact", { key: "emergencyCalls", nameKey: "issue", blank: { issue: "", name: "", phone: "" }, writable: ["issue", "name", "phone"] }),
    clauses("ehsClauses", "clause"),
    clauses("serviceClauses", "clause"),
  ],
  "service-agreement": [
    clauses("scopeOfServices", "clause"),
    clauses("serviceSchedule", "clause"),
    clauses("obligations", "clause"),
    clauses("commercialTerms", "clause"),
    clauses("generalTerms", "clause"),
    open("page", { key: "scans", blank: { name: "", kind: "image", dataUrl: "", addedAt: "" }, writable: [] }),
  ],
};

/** Which record a rule is for, where that decides the layout: the revision it was filled on (REQUIREMENTS §74). */
export type LineRecord = { formatRevision?: string } | null | undefined;

// The names the record pages register with Mitra's dock for two kinds (pages/GapPage.tsx, TrainingPage.tsx) beside
// the catalogue's own, so the same rule answers both.
const KIND_ALIASES: Record<string, string> = { gap: "gap-inspection", training: "training-record" };

/** Every list of this kind of record, with what each allows. A reference document (kept as issued) has none. */
export function lineRulesFor(kind: string, documentId: string, record?: LineRecord): LineRule[] {
  kind = KIND_ALIASES[kind] ?? kind;
  if (kind === "log-sheet") {
    const layout = getLogSheetLayoutForRecord(documentId, record);
    if (!layout) return [];
    return [logRowsRule(layout), ...(layout.photoBelowGrid ? [PHOTOS] : [])];
  }
  return RULES[kind] ?? [];
}

/** The rule for one list of this record, or undefined when the form has no such list. */
export function lineRuleFor(kind: string, documentId: string, listKey: string, record?: LineRecord): LineRule | undefined {
  return lineRulesFor(kind, documentId, record).find((r) => r.key === listKey);
}

/** The kinds the registry knows, for the checks that walk them all. */
export const LINE_KINDS: string[] = ["log-sheet", ...Object.keys(RULES)];

// ---------------------------------------------------------------------------
// building and placing lines

/**
 * A new line before the person writes anything: the rule's blank, an id of its
 * own where the list's lines carry one, and its number where the paper numbers
 * its lines (its place on the sheet, or the next number never used).
 */
export function newLine(rule: LineRule, existing: unknown[], at: number = existing.length): Obj | string {
  if (rule.scalar) return "";
  const line: Obj = JSON.parse(JSON.stringify(rule.blank));
  if (hasIds(rule, existing)) line.id = generateId(rule.key === "rows" ? "row" : rule.key);
  if (rule.numberKey && rule.numbering) line[rule.numberKey] = nextNumber(rule, existing, at);
  return line;
}

/** A log sheet's new row, exactly as the sheet's own Add Row builds one. */
export function newRow(layout: LogSheetLayout, existing: LogSheetRow[], id: string = generateId("row")): LogSheetRow {
  const row = newLine(logRowsRule(layout), existing) as Obj;
  return { ...row, id } as LogSheetRow;
}

/** Whether the lines of this list carry an id (rows, catches, findings, attendees, photos do; printed units and areas do not). */
export function hasIds(rule: LineRule, existing: unknown[]): boolean {
  if (rule.scalar) return false;
  const first = existing.find(isObj);
  if (first) return typeof first.id === "string";
  return !["entries", "lines", "sections", "items", "emergencyCalls"].includes(rule.key);
}

/** The number a new line takes: its place (a Sr. No. column), or one more than the highest on the list (a finding's). */
export function nextNumber(rule: LineRule, existing: unknown[], at: number): number | string {
  if (rule.numbering === "next") {
    const highest = existing.reduce<number>((m, l) => (isObj(l) && Number.isFinite(Number(l[rule.numberKey!])) ? Math.max(m, Number(l[rule.numberKey!])) : m), 0);
    return highest + 1;
  }
  return String(at + 1);
}

/** The blank value of one box of a line: a number's null, a tick's false, words' "". */
export function blankValueOf(rule: LineRule, key: string): unknown {
  const v = isObj(rule.blank) ? rule.blank[key] : "";
  if (typeof v === "boolean") return false;
  if (v === null || typeof v === "number") return null;
  if (Array.isArray(v)) return [];
  return "";
}

/** Lines inserted at `index` (clamped to the list), the list otherwise untouched. */
export function insertLines<T>(list: T[], index: number, lines: T[]): T[] {
  const i = Math.max(0, Math.min(list.length, index));
  return [...list.slice(0, i), ...lines, ...list.slice(i)];
}

/** The list without the lines at these (0-based) indexes. */
export function withoutLines<T>(list: T[], indexes: number[]): T[] {
  const drop = new Set(indexes);
  return list.filter((_, i) => !drop.has(i));
}

/** The line with these boxes blanked (every writable one when none are named); a box the rule does not list is left alone. */
export function clearedLine(rule: LineRule, line: unknown, keys?: string[]): unknown {
  if (rule.scalar) return "";
  if (!isObj(line)) return line;
  const out: Obj = { ...line };
  for (const k of keys ?? rule.writable) if (rule.writable.includes(k)) out[k] = blankValueOf(rule, k);
  return out;
}

/** Whether a line has nothing written in its writable boxes. */
export function lineIsBlank(rule: LineRule, line: unknown): boolean {
  if (rule.scalar) return String(line ?? "").trim() === "";
  if (!isObj(line)) return true;
  return rule.writable.every((k) => {
    const v = line[k];
    return v === null || v === undefined || v === false || (typeof v === "string" && v.trim() === "");
  });
}

/**
 * A line's values in words, for a history line or a confirmation card:
 * "09:00, 19.87, Jeni" — the written boxes in their order, blanks left out,
 * never longer than 120 characters.
 */
export function lineWords(rule: LineRule | undefined, line: unknown, limit = 120): string {
  const parts: string[] = [];
  if (rule?.scalar || typeof line === "string") parts.push(String(line ?? ""));
  else if (isObj(line)) {
    const keys = rule ? [...(rule.nameKey && !rule.writable.includes(rule.nameKey) ? [rule.nameKey] : []), ...Object.keys(line).filter((k) => k !== "id" && !Array.isArray(line[k]) && !isObj(line[k]))] : Object.keys(line);
    for (const k of Array.from(new Set(keys))) {
      if (k === "id" || k === "insightKey" || k === "sourceRecordIds" || k === "dataUrl") continue;
      const v = line[k];
      if (v === null || v === undefined || v === false || v === "" || Array.isArray(v) || isObj(v)) continue;
      parts.push(v === true ? "Yes" : String(v));
    }
  }
  const words = parts.map((p) => p.trim()).filter(Boolean).join(", ");
  if (!words) return "(blank)";
  return words.length > limit ? `${words.slice(0, limit - 1)}…` : words;
}
