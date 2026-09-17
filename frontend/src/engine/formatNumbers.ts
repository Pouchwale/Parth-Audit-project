import type { DocumentDefinition } from "../types";
import type { Chip } from "./guidedChecklist";
import { documentRepository } from "../data/repositories/documentRepository";
import { documentDepartmentLabel } from "./departmentScope";
import { documentOpenRoute } from "./documentRoutes";
import { todayISO } from "../utils/date";
import { t } from "../i18n";

// A DOCUMENT BY ITS FORMAT NUMBER (REQUIREMENTS §52).
//
// The plant names its paperwork by format number — "F/HR/05", "F-QC-30" — and
// writes the same number several ways: F/HR/05, F-HR-05, F HR 05, FHR05, HR/05,
// hr 5, F-QC-40.C, F/QC/40C. Search and Mitra both take any of those, in any
// module, through one canonical key ("HR-5", "QC-40C"). Numbers that don't
// follow the F/<dept>/<nn> pattern — the complaint acknowledgement's
// QA-CAF-00, the provider's licence number — are matched as written, spaces and
// punctuation aside.
//
// What is found is only ever the person's own departments' (the scoped
// repository, §40). A number that belongs to another department is answered
// by naming that department, never the document; a number the system doesn't
// hold is said to be not here yet.

const DEPARTMENT_CODES = "SYS|MKT|PUR|STR|QC|QA|PRD|MNT|HR|DISP";
const STANDARD = new RegExp(`(?<![A-Z0-9])F?\\s*[-/ ]?\\s*(${DEPARTMENT_CODES})\\s*[-/ ]?\\s*(\\d{1,2})(?:[.-]?([A-Z]))?(?![A-Z0-9])`, "gi");
const WHOLE = new RegExp(`^\\s*F?\\s*[-/ ]?\\s*(${DEPARTMENT_CODES})\\s*[-/ ]?\\s*(\\d{1,2})\\s*(?:[.-]?\\s*([A-Z]))?\\s*$`, "i");

const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const knownNumber = (doc: DocumentDefinition) => !!doc.formatNo && doc.formatNo !== "TO BE CONFIRMED";

/** The canonical key of a format number — "HR-5", "QC-40C" — or null when it isn't an F/<dept>/<nn> number. */
export function formatKey(formatNo: string): string | null {
  const m = WHOLE.exec(formatNo);
  return m ? `${m[1].toUpperCase()}-${Number(m[2])}${m[3] ? m[3].toUpperCase() : ""}` : null;
}

interface Reference {
  /** As the person wrote it. */
  written: string;
  key?: string;
  /** A document matched by a number of its own shape (QA-CAF-00, the licence). */
  documentId?: string;
}

function references(text: string): Reference[] {
  const found: Reference[] = [];
  for (const m of text.matchAll(STANDARD)) {
    const key = `${m[1].toUpperCase()}-${Number(m[2])}${m[3] ? m[3].toUpperCase() : ""}`;
    if (!found.some((r) => r.key === key)) found.push({ written: m[0].trim(), key });
  }
  const unscoped = documentRepository.getAllUnscoped().filter((d) => knownNumber(d) && !formatKey(d.formatNo));
  for (const word of text.split(/\s+/)) {
    const token = squash(word);
    // A number of its own shape has letters and digits both (QA-CAF-00,
    // FP1230000675) — so an ordinary word or a date is never taken for one.
    if (token.length < 6 || !/[A-Z]/.test(token) || !/\d/.test(token)) continue;
    const doc = unscoped.find((d) => squash(d.formatNo).includes(token));
    if (doc && !found.some((r) => r.documentId === doc.id)) found.push({ written: word.replace(/[?.,!]+$/, ""), documentId: doc.id });
  }
  return found;
}

interface Resolved {
  written: string;
  doc?: DocumentDefinition;
  /** Held by another department. */
  department?: string;
}

function resolve(ref: Reference): Resolved {
  const visible = documentRepository.getAll();
  const all = documentRepository.getAllUnscoped();
  const byKey = (list: DocumentDefinition[], key: string) => list.find((d) => knownNumber(d) && formatKey(d.formatNo) === key);
  const pick = (list: DocumentDefinition[]) => {
    if (ref.documentId) return list.find((d) => d.id === ref.documentId);
    if (!ref.key) return undefined;
    // "F/QC/40" for F-QC-40.C: a suffix-less number finds the one lettered format.
    return byKey(list, ref.key) ?? (ref.key.match(/[A-Z]$/) ? byKey(list, ref.key.replace(/[A-Z]$/, "")) : undefined) ?? list.find((d) => knownNumber(d) && formatKey(d.formatNo)?.replace(/[A-Z]$/, "") === ref.key);
  };
  const doc = pick(visible);
  if (doc) return { written: doc.formatNo, doc };
  const elsewhere = pick(all);
  if (elsewhere) return { written: elsewhere.formatNo, department: documentDepartmentLabel(elsewhere.id, elsewhere.formatNo) };
  return { written: ref.written.toUpperCase() };
}

/** The person's own documents a piece of text names by format number, in the order named. */
export function documentsByFormatNumber(text: string): DocumentDefinition[] {
  const out: DocumentDefinition[] = [];
  for (const r of references(text).map(resolve)) if (r.doc && !out.some((d) => d.id === r.doc!.id)) out.push(r.doc);
  return out;
}

/** Whether the text names at least one format number. */
export const namesFormatNumber = (text: string): boolean => references(text).length > 0;

// Words that turn "F/HR/05" into a question about the document rather than
// into data for a record: "open F/HR/05", "what is F-QC-12?", "show me hr 5".
const QUERY_WORDS = new Set(
  "open show view see go to take me bring up display please pls kindly the a an and or also both what whats is are which about tell find search for format formats number numbers no doc docs document documents form forms record records sheet sheets register it this that these those of where can i get".split(" ")
);
const OPEN_RE = /^\s*(?:please\s+|pls\s+|kindly\s+)?(?:open|show|view|see|go\s+to|take\s+me\s+to|bring\s+up|display)\b/i;

/** Whether the message is only a format number, or a request to open or name one — and not data to fill in. */
export function isFormatNumberQuery(text: string): boolean {
  const refs = references(text);
  if (refs.length === 0) return false;
  let rest = text;
  for (const r of refs) rest = rest.split(r.written).join(" ");
  const words = rest.toLowerCase().replace(/[^a-z']+/g, " ").split(/\s+/).filter(Boolean);
  return words.every((w) => QUERY_WORDS.has(w.replace(/'/g, "")));
}

function describe(doc: DocumentDefinition): string {
  const where = [t(`module.${doc.module}`), doc.section].filter(Boolean).join(" · ");
  return `${doc.name} — ${where}, ${doc.frequency.toLowerCase()}`;
}

/** What Mitra may do with the document — each a button, so nothing is done without the person's say-so. */
export function formatChips(doc: DocumentDefinition): Chip[] {
  const chips: Chip[] = [{ label: t("ai.format.open"), action: { type: "navigate", route: documentOpenRoute(doc) }, tone: "primary" }];
  const holdsRecords = !doc.isReferenceOnly && !["chemical-master", "licence", "compliance-statement"].includes(doc.kind);
  if (holdsRecords) {
    const today = todayISO();
    chips.push({ label: t("ai.format.startNew"), action: { type: "createRecord", documentId: doc.id, dateISO: today } });
    chips.push({ label: t("ai.format.askMe"), action: { type: "startInterview", documentId: doc.id, dateISO: today } });
    chips.push({ label: t("ai.format.sample"), action: { type: "sampleFill", documentId: doc.id, dateISO: today } });
  }
  return chips;
}

export interface FormatAnswer {
  reply: string;
  chips: Chip[];
  navigate?: string;
}

/**
 * Mitra's answer to a message that names documents by format number: what the
 * document is and what it can do with it (asking first), or — told to open it —
 * opening it. Null when the message is not about format numbers, or carries
 * more than a format number (then it is an instruction or data, and the usual
 * paths take it, with the number already understood by matchDocuments).
 */
export function formatNumberAnswer(text: string): FormatAnswer | null {
  if (!isFormatNumberQuery(text)) return null;
  const resolved = references(text).map(resolve);
  const somewhereElse: Chip = { label: t("ai.guide.whereTo"), action: { type: "guide", step: "home" } };

  if (resolved.length === 1) {
    const r = resolved[0];
    if (r.doc) {
      if (OPEN_RE.test(text)) {
        return { reply: t("ai.format.opening", { formatNo: r.doc.formatNo, name: r.doc.name }), chips: [somewhereElse], navigate: documentOpenRoute(r.doc) };
      }
      return { reply: t("ai.format.is", { formatNo: r.doc.formatNo, what: describe(r.doc) }), chips: formatChips(r.doc) };
    }
    if (r.department) return { reply: t("ai.format.notYours", { formatNo: r.written, department: r.department }), chips: [somewhereElse] };
    return {
      reply: t("ai.format.unknown", { formatNo: r.written }),
      chips: [
        { label: t("ai.format.library"), action: { type: "navigate", route: "/library" } },
        { label: t("ai.guide.searchScreen"), action: { type: "navigate", route: "/search" } },
      ],
    };
  }

  const lines = resolved.map((r) =>
    r.doc ? `• ${r.doc.formatNo} — ${r.doc.name}` : r.department ? `• ${r.written} — ${t("ai.format.otherDepartment", { department: r.department })}` : `• ${r.written} — ${t("ai.format.notHere")}`
  );
  const chips: Chip[] = resolved
    .filter((r): r is Resolved & { doc: DocumentDefinition } => !!r.doc)
    .map((r) => ({ label: `${t("ai.format.open")}: ${r.doc.formatNo}`, action: { type: "navigate", route: documentOpenRoute(r.doc) } }));
  return { reply: `${t("ai.format.several")}\n${lines.join("\n")}`, chips: chips.length ? chips : [somewhereElse] };
}
