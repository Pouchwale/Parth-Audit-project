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

/** The date the user named, or today. */
function whenFrom(text: string, today: string): string {
  const range = parseDateRange(text, today);
  return range ? range.from : today;
}

// Mid-walk-through, what the user types is normally the ANSWER to the question
// on screen — and an answer can easily contain one of these words ("Gujarat
// Printpack", "delete the damaged stock"). So while the assistant is asking
// questions, only a message that BEGINS with the instruction counts as one.
const STRICT_START_RE = /^(?:please\s+|now\s+)?(submit|verify|approve|sign it off|delete|remove|print|cancel)\b/i;

/**
 * Reads an instruction about the record itself. `hasTarget` says whether a
 * record is open — "delete this" means nothing without one. `strict` is for
 * while a walk-through is running (see above).
 */
export function parseAssistantCommand(text: string, hasTarget: boolean, today = todayISO(), opts: { strict?: boolean } = {}): AssistantCommand | null {
  const t = text.trim();
  if (!t) return null;
  if (opts.strict && !STRICT_START_RE.test(t)) return null;

  // ---- create: a document has to be named, and it has to read like an order
  if (CREATE_RE.test(t) && (NEW_THING_RE.test(t) || RECORD_WORD_RE.test(t))) {
    const ids = matchDocuments(t.toLowerCase());
    // One document only: "create a record for pest control" could mean any of
    // ten, and quietly picking one would be worse than asking.
    if (ids.length === 1) {
      const doc = documentRepository.getById(ids[0]);
      if (doc) return { kind: "create", documentId: doc.id, documentName: doc.name, dateISO: whenFrom(t, today) };
    }
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
