import type { Chip } from "./guidedChecklist";
import type { LogSheetData } from "../types";
import { hrMasterRepository } from "../data/repositories/hrMasterRepository";
import { HR_RECORD_PAGES } from "../data/seed/hrModule";
import { isDocumentIdVisible } from "./departmentScope";
import { documentsByFormatNumber } from "./formatNumbers";
import { documentOpenRoute } from "./documentRoutes";
import { todayISO } from "../utils/date";
import { t } from "../i18n";
import {
  applyFills,
  describePerson,
  HR_MASTER_LINKS,
  hrMasterLinkFor,
  lineForPerson,
  lineOfPerson,
  personFill,
  searchPeople,
  type HrMasterLink,
} from "./hrMaster";
import type { HrMasterPerson, LogSheetLayout } from "../types";

// MITRA AND HR MASTER DATA (REQUIREMENTS §53).
//
//   "open HR master data", "show the employee master"   → the sheet
//   "fetch GP3 1024", "GP3 No. 1024"                    → that person onto the open HR record
//   "fill from HR master data for Sandeep Parekh"       → the same, by name
//   "add Sandeep Parekh from the employee master"        → a line on the open register
//
// Nothing is written until the person says yes: Mitra lists what would go
// where — blank boxes and boxes it would replace alike — and waits for "Yes,
// fill it" (components/common/DocumentAssistant.tsx). All of it is worked out
// here, with no network.

export type HrMasterIntent = { kind: "open" } | { kind: "fetch"; query: string; explicit: boolean };

const SHEET_WORDS = /\b(?:hr\s+master(?:\s+(?:data|sheet|list))?|employees?\s+master(?:\s+(?:data|sheet|list))?|master\s+(?:sheet|list)\s+of\s+employees)\b/i;
const MASTER_DATA = /\bmaster\s+(?:data|sheet)\b/i;
const GP3_RE = /\bgp\s*-?\s*3\s*(?:no\.?|number|#)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9/-]*)/i;
const FETCH_VERB = /^\s*(?:please\s+|pls\s+|kindly\s+|can\s+you\s+|could\s+you\s+)?(?:fetch|fill|pull|bring(?!\s+up\b)|get|load|take(?!\s+me\s+to\b)|copy|add|put|use|insert|import)\b/i;
// "fetch Sandeep Parekh" on an HR record needs no mention of the sheet.
const FETCH_ONLY = /^\s*(?:please\s+|pls\s+|kindly\s+|can\s+you\s+|could\s+you\s+)?fetch\b/i;
const OPEN_VERB = /^\s*(?:please\s+|pls\s+|kindly\s+)?(?:open|show|view|see|display|go\s+to|take\s+me\s+to|bring\s+up)\b/i;
const FILLER =
  /\b(?:please|pls|kindly|can|could|you|fetch|fill|pull|bring|get|load|take|copy|add|put|use|insert|import|in|into|on|onto|from|the|hr|master|data|sheet|list|employees?|details?|of|for|this|that|record|form|me|with|his|her|their|person|name|named|line|lines|a|an|and|to|it|here|up|register|format|document|no|number)\b/gi;

// "from the HR master data", "in the employee master", "using master sheet" …
const SHEET_PHRASE = /\b(?:(?:from|in|on|using|with|via)\s+)?(?:the\s+)?(?:(?:hr|employees?)\s+master(?:\s+(?:data|sheet|list))?|master\s+(?:data|sheet|list)(?:\s+of\s+employees)?)\b/gi;
const EDGE_WORDS = new Set(
  "please pls kindly it this that record form register line lines in into on onto to for of the a an with me us person employee employees details detail data named name his her their entry here now".split(" ")
);

/**
 * Whose details a fetch names: the message without its leading instruction and
 * the sheet's name, and without linking words at either end — never from the
 * middle, so a name with "A" or "Import" in it keeps them.
 */
function personQuery(text: string): string {
  const words = text
    .replace(FETCH_VERB, " ")
    .replace(SHEET_PHRASE, " ")
    .replace(/'s\b/gi, "")
    .replace(/[^\p{L}\p{N}.'\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length && EDGE_WORDS.has(words[0].toLowerCase())) words.shift();
  while (words.length && EDGE_WORDS.has(words[words.length - 1].toLowerCase())) words.pop();
  return words.join(" ");
}

/** What a message asks of HR Master Data, if anything. `onLinkedRecord`: an HR record that fetches people is open. */
export function hrMasterIntent(text: string, onLinkedRecord: boolean): HrMasterIntent | null {
  const s = text.trim();
  const gp3Match = GP3_RE.exec(s);
  const gp3 = gp3Match && /\d/.test(gp3Match[1]) ? gp3Match[1] : null;
  const namesSheet = SHEET_WORDS.test(s) || (onLinkedRecord && MASTER_DATA.test(s));
  if (!namesSheet && !gp3) return onLinkedRecord && FETCH_ONLY.test(s) ? { kind: "fetch", query: personQuery(s), explicit: true } : null;
  if (SHEET_WORDS.test(s) && !gp3 && !FETCH_VERB.test(s)) {
    const rest = s.replace(SHEET_WORDS, " ").replace(OPEN_VERB, " ").replace(FILLER, " ").replace(/[^\p{L}\p{N}]+/gu, "");
    if (OPEN_VERB.test(s) || rest === "") return { kind: "open" };
  }
  if (FETCH_VERB.test(s)) return { kind: "fetch", query: gp3 ?? personQuery(s), explicit: true };
  if (gp3 && s.replace(GP3_RE, "").replace(/[^\p{L}\p{N}]+/gu, "") === "") return { kind: "fetch", query: gp3, explicit: false };
  return null;
}

export const hrMasterVisible = (): boolean => HR_RECORD_PAGES.some((p) => isDocumentIdVisible(p.docId));

const openSheetChip = (): Chip => ({ label: t("nav.hrMasterData"), action: { type: "navigate", route: "/hr/master-data" } });

export interface HrMasterChatAnswer {
  reply: string;
  chips: Chip[];
  navigate?: string;
}

const LINKED_FORMATS = () =>
  HR_MASTER_LINKS.map((l) => l.formatNo)
    .join(", ")
    .replace(/, ([^,]*)$/, " and $1");

/**
 * The answer when no HR record that fetches people is open: open the sheet,
 * or say where a fetch can be done. Null when the message is not about the
 * sheet.
 */
export function hrMasterChatAnswer(text: string): HrMasterChatAnswer | null {
  const intent = hrMasterIntent(text, false);
  if (!intent) return null;
  if (!hrMasterVisible()) {
    return { reply: "HR Master Data is Human Resources' employee sheet, which isn't one of your departments — ask the system administrator if you need it.", chips: [] };
  }
  if (intent.kind === "open") {
    const count = hrMasterRepository.all().length;
    return {
      reply: `Opening HR Master Data — ${count} employee${count === 1 ? "" : "s"}, with their GP3 No., joining date, department, designation and date of birth. The HR formats fetch people from it.`,
      chips: [openSheetChip()],
      navigate: "/hr/master-data",
    };
  }
  // A fetch said away from a record: which record it could go onto.
  const named = documentsByFormatNumber(text).filter((d) => hrMasterLinkFor(d.id));
  const found = intent.query ? searchPeople(intent.query, hrMasterRepository.all()) : null;
  const who = found?.exact ? ` ${describePerson(found.exact)} is on HR Master Data.` : "";
  if (named.length === 1) {
    const doc = named[0];
    return {
      reply: `Open the ${doc.formatNo} record the details should go on, then tell me again — I'll show you what goes where before anything is written.${who}`,
      chips: [
        { label: t("ai.format.startNew"), action: { type: "createRecord", documentId: doc.id, dateISO: todayISO() }, tone: "primary" },
        { label: t("ai.format.open"), action: { type: "navigate", route: documentOpenRoute(doc) } },
      ],
    };
  }
  return {
    reply: `A person is fetched from HR Master Data onto an open HR record — ${LINKED_FORMATS()}. Open the record, then say e.g. “fetch GP3 1024” or “fetch Sandeep Parekh”.${who}`,
    chips: [openSheetChip(), { label: "HR records", action: { type: "navigate", route: "/hr" } }],
  };
}

export interface MasterFillProposal {
  person: HrMasterPerson;
  /** Everything the sheet has, written in — replacing what differs. */
  next: LogSheetData;
  /** Only the blank boxes filled (the same as `next` when nothing would be replaced). */
  blanksOnly: LogSheetData;
  replaces: boolean;
  /** "added a line" / "filled line 3" / "filled the form" */
  where: string;
}

export type MasterFillLookup =
  | { kind: "proposal"; proposal: MasterFillProposal }
  | { kind: "candidates"; people: HrMasterPerson[] }
  | { kind: "not-found" }
  | { kind: "nothing"; person: HrMasterPerson; where: string }
  | { kind: "several-lines"; person: HrMasterPerson; lines: number[] };

/** What fetching the person a query names onto this record would write. */
export function proposeMasterFill(link: HrMasterLink, layout: LogSheetLayout, data: LogSheetData, query: string, personId?: string, newRowId = () => `row-${Date.now().toString(36)}`): MasterFillLookup {
  const people = hrMasterRepository.all();
  let person = personId ? people.find((p) => p.id === personId) : undefined;
  if (!person) {
    const { exact, candidates } = searchPeople(query, people);
    if (!exact) return candidates.length > 0 ? { kind: "candidates", people: candidates } : { kind: "not-found" };
    person = exact;
  }
  if (link.where === "header") {
    const header = data.header ?? {};
    const { fills, conflicts } = personFill(link, person, header);
    if (fills.length === 0 && conflicts.length === 0) return { kind: "nothing", person, where: "the form" };
    return {
      kind: "proposal",
      proposal: {
        person,
        next: { ...data, header: applyFills(header, [...fills, ...conflicts]) },
        blanksOnly: { ...data, header: applyFills(header, fills) },
        replaces: conflicts.length > 0,
        where: "the form",
      },
    };
  }
  const rows = data.rows ?? [];
  const match = lineOfPerson(link, rows, person, people);
  if (match.kind === "several") return { kind: "several-lines", person, lines: match.indexes.map((i) => i + 1) };
  if (match.kind === "none") {
    const blank = Object.fromEntries(layout.columns.map((c) => [c.key, c.type === "number" ? null : c.autoFill?.default !== undefined && c.type !== "text" ? String(c.autoFill.default) : ""]));
    const line = lineForPerson(link, person, { ...blank, id: newRowId() });
    const next = { ...data, rows: [...rows, line] };
    return { kind: "proposal", proposal: { person, next, blanksOnly: next, replaces: false, where: `a new line ${rows.length + 1}` } };
  }
  const index = match.index;
  const { fills, conflicts } = personFill(link, person, rows[index]);
  if (fills.length === 0 && conflicts.length === 0) return { kind: "nothing", person, where: `line ${index + 1}` };
  const withFills = (list: typeof fills) => ({ ...data, rows: rows.map((r, i) => (i === index ? applyFills(r, list) : r)) });
  return { kind: "proposal", proposal: { person, next: withFills([...fills, ...conflicts]), blanksOnly: withFills(fills), replaces: conflicts.length > 0, where: `line ${index + 1}` } };
}
