import { documentRepository } from "../data/repositories/documentRepository";
import { matchDocuments, parseDateRange } from "./assistantLocal";
import { todayISO } from "../utils/date";

// WHAT THE ASSISTANT CAN DO TO A RECORD, not just to its fields. Reading and
// changing a record were already understood locally (engine/recordPatch.ts);
// this adds the rest of the record's life, so anything a person can do with the
// buttons can be asked for in words — typed or spoken, since speech takes the
// same path (the department's request, 12-Sep-2026: "whatever user can do
// manually that can do with ai assistant also ... even he can speak and work
// will be done").
//
//   create      "create a new fly catcher record", "start a training record for 5 September"
//   fill        "fill it with sample data", "generate an external CAPA for me",
//               "create a complaint checklist with dummy data" — the whole
//               document filled with realistic, made-up values (engine/sampleFill.ts)
//   guide       "I want to fill the external CAPA", "help me fill this", "walk me
//               through the daily record" — opened and filled question by
//               question (engine/guidedRecord.ts, engine/guidedChecklist.ts)
//   delete      "delete this record", "remove this sheet"
//   submit      "submit this", "send it for verification"
//   verify      "verify it", "approve this record"
//   cancelEdit  "cancel the edit", "put it back as it was"
//   print       "print this", "print the document"
//
// Every one of these is parsed here with no network call, and the widget then
// asks before anything is destroyed or signed off.

export type AssistantCommand =
  | { kind: "create"; documentId: string; documentName: string; dateISO: string }
  // documentId when exactly one document was named; candidates when several
  // fit ("a CAPA record" could be three documents) and the widget asks which;
  // neither when none was named — the open record, if any.
  | { kind: "fill"; documentId?: string; documentName?: string; candidates?: string[]; dateISO: string }
  | { kind: "guide"; documentId?: string; documentName?: string; candidates?: string[]; dateISO: string }
  | { kind: "delete" }
  | { kind: "submit" }
  | { kind: "verify" }
  | { kind: "cancelEdit" }
  | { kind: "print" };

const CREATE_RE = /^(?:please\s+|can you\s+|could you\s+|i want (?:to\s+)?|i need\s+)*(?:create|make|start|open|add|prepare|give me|new)\b/i;
const NEW_THING_RE = /\b(new|another|fresh)\b/i;
const RECORD_WORD_RE = /\b(record|records|sheet|report|checklist|entry|form|document|agreement|register)\b/i;

const DELETE_RE = /\b(delete|remove|discard|throw away|get rid of|scrap)\b/i;
// "delete row 3" / "remove point 5" are edits to what the record SAYS, not to
// the record itself — they belong to engine/recordPatch.ts.
const PART_OF_RECORD_RE = /\b(row|rows|line|lines|point|points|topic|topics|attendee|attendees|activity|item|items|finding|findings|photo|photos|page|clause|contact)\b/i;
const THIS_RECORD_RE = /\b(this|the|it|current)\b/i;

const SUBMIT_RE = /\b(submit|send (?:it |this )?(?:for (?:verification|approval|checking))?)\b/i;
const VERIFY_RE = /\b(verify|approve|sign (?:it |this )?off|signoff)\b/i;
const CANCEL_EDIT_RE = /\b(cancel (?:the )?(?:edit|editing|correction)|put it back|undo (?:the )?(?:edit|correction)|never mind the edit)\b/i;
const PRINT_RE = /\b(print|printout|take a print)\b/i;

// ---- filling a whole document -------------------------------------------------
// Words that ask for invented-but-realistic values. "test" on its own is not
// one — "leak test is fail" is a real reading — so only "test data" counts.
const SAMPLE_WORDS_RE = /\b(sample|dummy|fake|demo|example|random|realistic|made[- ]up|placeholder|mock(?!\s+(?:product\s+)?(?:recall|withdrawal))|synthetic|fictitious|test (?:data|values|entries|record|records))\b/i;
const FILL_VERB_RE = /\b(fill|filled|complete|populate|generate|prepare|draft|auto-?fill|autofill)\b/i;
// "generate" / "auto-fill" mean "produce it for me" even without a sample word.
const GENERATE_RE = /\b(generate|auto-?fill|autofill)\b/i;
// "fill it for me", "fill this in yourself", "fill everything automatically".
const FILL_FOR_ME_RE =
  /\bfill(?:\s+(?:in|up|out))?\s+(?:it|this|that|everything|all of it|the (?:whole )?(?:form|record|sheet|document|checklist|report)|this (?:form|record|sheet|document|checklist|report)|the rest)(?:\s+(?:in|up|out))?\s+(?:for me|yourself|by yourself|automatically|on your own)\b/i;
// Nothing but "fill it" / "fill this record" — no data given, so it is a
// request to do the whole thing.
const BARE_FILL_RE =
  /^(?:please\s+|can you\s+|could you\s+|just\s+)*(?:auto[- ]?)?fill(?:\s+(?:in|up|out))?(?:\s+(?:it|this|that|everything|all of it|the (?:whole )?(?:form|record|sheet|document|checklist|report)|this (?:form|record|sheet|document|checklist|report)))?(?:\s+(?:in|up|out))?(?:\s+(?:for me|yourself|by yourself|automatically|on your own|please))?\s*$/i;

// Asking to be taken through it: "walk me through", "ask me", "I want to fill …".
const GUIDE_RE =
  /\b(walk me through|step by step|question by question|one by one|one at a time|guide me|help me (?:to )?fill|help me with|ask me (?:the )?questions|ask me what|ask me|start (?:filling|assigning|the questions|asking)|let'?s fill|let'?s start|i want to fill|i need to fill|i have to fill|i want to start|interview me|take me through)\b/i;
// A value being dictated ("fill the daily record: checker is Vijay") is data
// entry, not a request to be asked questions.
const DICTATES_VALUE_RE = /[:=]|\b(is|was|are|were|should be|becomes)\s+\S/i;

/** The date the user named, or today. */
function whenFrom(text: string, today: string): string {
  const range = parseDateRange(text, today);
  return range ? range.from : today;
}

// Mid-walk-through, what the user types is normally the ANSWER to the question
// on screen — and an answer can easily contain one of these words ("Gujarat
// Printpack", "delete the damaged stock"). So while the assistant is asking
// questions, only a message that BEGINS with the instruction counts as one.
const STRICT_START_RE = /^(?:please\s+|now\s+|just\s+)?(submit|verify|approve|sign it off|delete|remove|print|cancel|stop|fill|generate|auto-?fill|autofill)\b/i;

function named(lower: string): { documentId?: string; documentName?: string; candidates?: string[] } {
  const ids = matchDocuments(lower);
  if (ids.length === 1) {
    const doc = documentRepository.getById(ids[0]);
    return doc ? { documentId: doc.id, documentName: doc.name } : {};
  }
  if (ids.length > 1) return { candidates: ids };
  return {};
}

/**
 * Reads an instruction about the record itself. `hasTarget` says whether a
 * record is open — "delete this" means nothing without one. `strict` is for
 * while a walk-through is running (see above).
 */
export function parseAssistantCommand(text: string, hasTarget: boolean, today = todayISO(), opts: { strict?: boolean } = {}): AssistantCommand | null {
  const t = text.trim();
  if (!t) return null;
  if (opts.strict && !STRICT_START_RE.test(t)) return null;
  const lower = t.toLowerCase();
  const doc = named(lower);
  const namesDocument = !!doc.documentId || !!doc.candidates;
  const dateISO = whenFrom(t, today);

  // ---- fill with sample data: a fill verb plus a sample word, "generate <document>",
  // "fill it for me", or nothing but "fill it" on an open record.
  if (
    (FILL_VERB_RE.test(t) && SAMPLE_WORDS_RE.test(t)) ||
    FILL_FOR_ME_RE.test(t) ||
    (GENERATE_RE.test(t) && (namesDocument || hasTarget) && !DICTATES_VALUE_RE.test(t)) ||
    (hasTarget && BARE_FILL_RE.test(t))
  ) {
    return { kind: "fill", ...doc, dateISO };
  }

  // ---- question by question: asked for outright, or "fill <document>" with no
  // value dictated — the person wants to be taken through it.
  if (GUIDE_RE.test(t) && (namesDocument || hasTarget || /\b(fill|record|document|form|sheet|checklist|report)\b/i.test(t))) {
    return { kind: "guide", ...doc, dateISO };
  }
  if (/\b(fill|complete)\b/i.test(t) && namesDocument && !DICTATES_VALUE_RE.test(t) && !CREATE_RE.test(t)) {
    return { kind: "guide", ...doc, dateISO };
  }

  // ---- create: a document has to be named, and it has to read like an order
  if (CREATE_RE.test(t) && (NEW_THING_RE.test(t) || RECORD_WORD_RE.test(t))) {
    // One document only: "create a record for pest control" could mean any of
    // ten, and quietly picking one would be worse than asking.
    if (doc.documentId && doc.documentName) return { kind: "create", documentId: doc.documentId, documentName: doc.documentName, dateISO };
  }

  if (!hasTarget) return null;

  if (DELETE_RE.test(t) && !PART_OF_RECORD_RE.test(t) && (THIS_RECORD_RE.test(t) || RECORD_WORD_RE.test(t))) return { kind: "delete" };
  if (CANCEL_EDIT_RE.test(t)) return { kind: "cancelEdit" };
  if (PRINT_RE.test(t) && !/\bprint(ed)? (name|copy of the|out the format)\b/i.test(t)) return { kind: "print" };
  // Verify before submit: "approve and submit" is an approval.
  if (VERIFY_RE.test(t)) return { kind: "verify" };
  if (SUBMIT_RE.test(t) && RECORD_WORD_RE.test(t + " record")) return { kind: "submit" };
  return null;
}
