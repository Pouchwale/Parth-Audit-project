import type { ChecklistItem, ComplaintChecklistData } from "../types";
import { isConditionalActivity } from "../data/seed/complaintChecklist";
import { codeRulesFor, COMPLAINT_NO_EXAMPLE, FG_CODE_EXAMPLE, PO_NUMBER_EXAMPLE } from "./documentFormats";
import { formatDisplayDate, fromISODate, pad2, todayISO } from "../utils/date";

// THE ASSISTANT'S WALK-THROUGH of a Customer Complaint Handling Checklist
// (F/MKT/05). A pure state machine: given the checklist data and where we
// are, it says what to ask next (a prompt + quick-reply chips), and given an
// answer it returns the updated data + a short acknowledgement. The widget
// (components/common/DocumentAssistant.tsx) just renders prompts and feeds
// answers back — no network is needed for the chip path, so this works
// even when the LLM is down. Free-text answers about an activity are
// interpreted by the backend (interpretChecklistAnswer) and arrive here
// already parsed.
//
// Order, exactly as the user asked for it: header details → Section A → B
// → C → D → E → approval.

export type HeaderField = "customerName" | "complaintNo" | "jobName" | "jobCode" | "poNo" | "complaintReceivedDate";

export const HEADER_FIELDS: { field: HeaderField; label: string; question: string; optional: boolean; isDate?: boolean }[] = [
  { field: "customerName", label: "Customer Name", question: "Which customer raised this complaint?", optional: false },
  { field: "complaintNo", label: "Complaint No.", question: `What complaint number shall I register it under? (like ${COMPLAINT_NO_EXAMPLE})`, optional: false },
  { field: "jobName", label: "Job Name", question: "Which job is it about? (job name)", optional: true },
  { field: "jobCode", label: "Job Code", question: `And the job code (FG code, like ${FG_CODE_EXAMPLE})?`, optional: true },
  { field: "poNo", label: "PO No.", question: `PO number, if you have it? (eight digits, like ${PO_NUMBER_EXAMPLE})`, optional: true },
  { field: "complaintReceivedDate", label: "Complaint Received Date", question: "When was the complaint received?", optional: false, isDate: true },
];

export type GuidedStep =
  | { kind: "header"; field: HeaderField }
  | { kind: "section-intro"; sectionIndex: number }
  | { kind: "item"; sectionIndex: number; itemIndex: number }
  | { kind: "approval" }
  | { kind: "finished" };

export type GuidedAnswer =
  | { type: "done" }
  | { type: "doneOn"; date: string }
  | { type: "notRequired" }
  | { type: "skip" }
  | { type: "text"; text: string }
  | { type: "parsed"; done: boolean; notRequired: boolean; date: string | null; comment: string }
  | { type: "sectionDone" } // "mark every remaining activity in this section done today"
  | { type: "sectionSkip" }
  | { type: "continue" };

// What a quick-reply chip does when tapped. Guided answers feed the state
// machine; the rest are widget-level actions (navigate, submit, ...).
export type ChipAction =
  | { type: "guided"; answer: GuidedAnswer }
  | { type: "pickDate" }
  | { type: "submit" }
  | { type: "later" }
  | { type: "approve" }
  | { type: "sendBack" }
  | { type: "navigate"; route: string }
  // "Where would you like to go?" — the next question of Mitra's own
  // walk-through (engine/assistantPersona.ts, REQUIREMENTS §50).
  | { type: "guide"; step: string }
  | { type: "briefing" }
  | { type: "startGuided" }
  | { type: "focusInput"; placeholder: string }
  // An assistant change to a submitted/verified record, waiting for the
  // user's go-ahead to reopen it for correction.
  | { type: "confirmCorrection" }
  | { type: "cancelCorrection" }
  // Put back what the record said before an assistant change.
  | { type: "undo"; id: string }
  // The record's own life, driven from the chat (engine/assistantCommands.ts).
  | { type: "createRecord"; documentId: string; dateISO: string }
  | { type: "askDelete" }
  | { type: "confirmDelete"; reason: string }
  | { type: "cancelDelete" }
  | { type: "askSubmit" }
  | { type: "doSubmit" }
  | { type: "doVerify" }
  | { type: "doCancelCorrection" }
  | { type: "doPrint" }
  // Filling a whole document: with sample data, or question by question
  // (engine/sampleFill.ts, engine/guidedRecord.ts). A documentId means "start
  // or open that document first, then do it there".
  | { type: "sampleFill"; documentId?: string; dateISO?: string }
  | { type: "startInterview"; documentId?: string; dateISO?: string }
  | { type: "interviewAnswer"; value: string }
  | { type: "interviewSkip" }
  | { type: "interviewStop" };

export interface Chip {
  label: string;
  action: ChipAction;
  tone?: "primary" | "success" | "danger";
}

export interface GuidedPrompt {
  text: string;
  chips: Chip[];
  // Free text typed at this step means: "header" → the field's value;
  // "item" → interpreted as an answer about the activity (via the backend).
  freeText: "header" | "item" | "none";
}

export function isItemAnswered(item: ChecklistItem): boolean {
  return item.done || item.notRequired || !!item.comment.trim();
}

// ONE ACTIVITY AT A TIME. The department's rule for External CAPA
// (13-Sep-2026): "section wise make one by one mandatory … if any question is
// incompleted then he will not able to answer to other questions without
// completing that." So the checklist is always waiting on exactly ONE activity
// — the first one still blank, reading A1 → E32 — and nothing after it can be
// answered until it is. This is the single definition of that rule, used by
// the form (pages/CapaPage.tsx disables the locked rows), by the assistant's
// walk-through (which asks in this order anyway) and by every change the
// assistant proposes (engine/recordPatch.ts refuses one that leapfrogs).
//
// An activity that HAS been answered always stays open, so a mistake can be
// corrected; clearing one closes everything after it again, because the
// checklist is then waiting on that one.

export interface ActivityRef {
  sectionIndex: number;
  itemIndex: number;
  /** As printed and as the app labels it, e.g. "B7". */
  label: string;
  activity: string;
}

/** The one activity the checklist is waiting on, or null when none is blank. */
export function currentActivity(data: ComplaintChecklistData): ActivityRef | null {
  for (let si = 0; si < data.sections.length; si++) {
    const s = data.sections[si];
    for (let ii = 0; ii < s.items.length; ii++) {
      if (!isItemAnswered(s.items[ii])) return { sectionIndex: si, itemIndex: ii, label: `${s.key}${s.items[ii].srNo}`, activity: s.items[ii].activity };
    }
  }
  return null;
}

/** May this activity be answered right now — is it answered already, or the one being waited on? */
export function isItemOpen(data: ComplaintChecklistData, sectionIndex: number, itemIndex: number): boolean {
  const item = data.sections[sectionIndex]?.items[itemIndex];
  if (!item) return false;
  if (isItemAnswered(item)) return true;
  const current = currentActivity(data);
  return !!current && current.sectionIndex === sectionIndex && current.itemIndex === itemIndex;
}

function headerEmpty(data: ComplaintChecklistData, field: HeaderField): boolean {
  const v = data[field];
  return v === null || v === undefined || `${v}`.trim() === "";
}

function firstUnansweredItem(data: ComplaintChecklistData, sectionIndex: number, from = 0): number {
  const items = data.sections[sectionIndex]?.items ?? [];
  for (let i = from; i < items.length; i++) if (!isItemAnswered(items[i])) return i;
  return -1;
}

// Where to begin: the first required header detail that's still blank,
// otherwise straight into Section A.
export function firstStep(data: ComplaintChecklistData): GuidedStep {
  for (const h of HEADER_FIELDS) if (!h.optional && headerEmpty(data, h.field)) return { kind: "header", field: h.field };
  return { kind: "section-intro", sectionIndex: 0 };
}

export function stepAfter(data: ComplaintChecklistData, step: GuidedStep): GuidedStep {
  switch (step.kind) {
    case "header": {
      const idx = HEADER_FIELDS.findIndex((h) => h.field === step.field);
      for (let i = idx + 1; i < HEADER_FIELDS.length; i++) {
        if (headerEmpty(data, HEADER_FIELDS[i].field)) return { kind: "header", field: HEADER_FIELDS[i].field };
      }
      return { kind: "section-intro", sectionIndex: 0 };
    }
    case "section-intro": {
      const i = firstUnansweredItem(data, step.sectionIndex);
      if (i >= 0) return { kind: "item", sectionIndex: step.sectionIndex, itemIndex: i };
      return nextSectionOrApproval(data, step.sectionIndex);
    }
    case "item": {
      // Look on from here, then back to anything left behind: a section is
      // finished before the next one starts (the department's rule for
      // External CAPA, 12-Sep-2026 — "make section mandatory each after each
      // question"), so nothing can be left blank by walking past it.
      const i = firstUnansweredItem(data, step.sectionIndex, step.itemIndex + 1);
      if (i >= 0) return { kind: "item", sectionIndex: step.sectionIndex, itemIndex: i };
      const back = firstUnansweredItem(data, step.sectionIndex);
      if (back >= 0) return { kind: "item", sectionIndex: step.sectionIndex, itemIndex: back };
      return nextSectionOrApproval(data, step.sectionIndex);
    }
    case "approval":
      return { kind: "finished" };
    default:
      return { kind: "finished" };
  }
}

function nextSectionOrApproval(data: ComplaintChecklistData, sectionIndex: number): GuidedStep {
  if (sectionIndex + 1 < data.sections.length) return { kind: "section-intro", sectionIndex: sectionIndex + 1 };
  // Last section done — but approval waits for any earlier section that isn't.
  const unfinished = firstUnfinishedSection(data);
  return unfinished >= 0 ? { kind: "section-intro", sectionIndex: unfinished } : { kind: "approval" };
}

/** The first section with an activity still blank, or -1 when they are all done. */
export function firstUnfinishedSection(data: ComplaintChecklistData): number {
  return data.sections.findIndex((s) => s.items.some((it) => !isItemAnswered(it)));
}

/** Every activity still blank, section by section — what stops a submit. */
export function unansweredActivities(data: ComplaintChecklistData): { key: string; srNo: number; activity: string }[] {
  return data.sections.flatMap((s) => s.items.filter((it) => !isItemAnswered(it)).map((it) => ({ key: s.key, srNo: it.srNo, activity: it.activity })));
}

export interface ChecklistSummary {
  total: number;
  done: number;
  notRequired: number;
  blank: number;
}

export function summarise(data: ComplaintChecklistData): ChecklistSummary {
  let total = 0;
  let done = 0;
  let notRequired = 0;
  for (const s of data.sections) {
    for (const it of s.items) {
      total += 1;
      if (it.done) done += 1;
      else if (it.notRequired) notRequired += 1;
    }
  }
  return { total, done, notRequired, blank: total - done - notRequired };
}

export function promptFor(step: GuidedStep, data: ComplaintChecklistData, preparedByName: string): GuidedPrompt {
  switch (step.kind) {
    case "header": {
      const h = HEADER_FIELDS.find((x) => x.field === step.field)!;
      const chips: Chip[] = [];
      if (h.isDate) {
        chips.push({ label: "Today", action: { type: "guided", answer: { type: "doneOn", date: todayISO() } }, tone: "primary" });
        chips.push({ label: "Pick a date…", action: { type: "pickDate" } });
      }
      if (h.optional) chips.push({ label: "Skip", action: { type: "guided", answer: { type: "skip" } } });
      return { text: h.question, chips, freeText: "header" };
    }
    case "section-intro": {
      const s = data.sections[step.sectionIndex];
      const remaining = s.items.filter((it) => !isItemAnswered(it)).length;
      const text =
        remaining === 0
          ? `Section ${s.key} — ${titleCase(s.title)} is already complete. Moving on.`
          : `Section ${s.key} — ${titleCase(s.title)}: ${remaining} activit${remaining === 1 ? "y" : "ies"} to go through. Every one has to be answered before the next section — done, done on a date, or not required. I'll ask one at a time; tap an answer or just tell me what happened.`;
      return {
        text,
        chips:
          remaining === 0
            ? [{ label: "Continue", action: { type: "guided", answer: { type: "continue" } }, tone: "primary" }]
            : [
                { label: "Let's go", action: { type: "guided", answer: { type: "continue" } }, tone: "primary" },
                { label: `All ${remaining} done today`, action: { type: "guided", answer: { type: "sectionDone" } } },
              ],
        freeText: "none",
      };
    }
    case "item": {
      const s = data.sections[step.sectionIndex];
      const it = s.items[step.itemIndex];
      // No "Skip" here: every activity of every section is mandatory. What it
      // isn't is compulsory WORK — "Not required" is a real answer, and the one
      // the conditional activities on the printed form expect.
      const chips: Chip[] = [
        { label: "Done today", action: { type: "guided", answer: { type: "done" } }, tone: "success" },
        { label: "Done on a date…", action: { type: "pickDate" } },
        { label: isConditionalActivity(it.activity) ? "Not required" : "Not applicable", action: { type: "guided", answer: { type: "notRequired" } } },
      ];
      return {
        text: `${s.key}${it.srNo}. ${it.activity} — done?`,
        chips,
        freeText: "item",
      };
    }
    case "approval": {
      const sum = summarise(data);
      const parts = [`${sum.done} of ${sum.total} activities done`];
      if (sum.notRequired) parts.push(`${sum.notRequired} not required`);
      if (sum.blank) parts.push(`${sum.blank} left blank`);
      return {
        text: `That's all five sections — ${parts.join(", ")}. Prepared by ${preparedByName || "you"}. Shall I submit it for approval now? The approver signs it off as "Approved By".`,
        chips: [
          { label: "Submit for approval", action: { type: "submit" }, tone: "success" },
          { label: "Not yet", action: { type: "later" } },
        ],
        freeText: "none",
      };
    }
    default:
      return { text: "All done here.", chips: [], freeText: "none" };
  }
}

export interface ApplyResult {
  data: ComplaintChecklistData;
  ack: string;
  // Stay on the same step (e.g. a date that couldn't be read).
  stay?: boolean;
  // Go here next instead of the usual stepAfter() — "Skip this section".
  next?: GuidedStep;
}

export function applyAnswer(data: ComplaintChecklistData, step: GuidedStep, answer: GuidedAnswer, today = todayISO()): ApplyResult {
  if (step.kind === "header") {
    const h = HEADER_FIELDS.find((x) => x.field === step.field)!;
    if (answer.type === "skip") return { data, ack: `Skipped ${h.label.toLowerCase()} — you can add it later.` };
    if (h.isDate) {
      const iso = answer.type === "doneOn" ? answer.date : answer.type === "text" ? parseUserDate(answer.text, today) : null;
      if (!iso) return { data, ack: "I couldn't read that as a date — try something like 08-09-2026, 8 Sep, or \"today\".", stay: true };
      return { data: { ...data, complaintReceivedDate: iso }, ack: `Received ${formatDisplayDate(iso)}.` };
    }
    if (answer.type === "text") {
      const v = answer.text.trim();
      if (!v) return { data, ack: "Type it in, or tap Skip.", stay: true };
      // The complaint number, job code and PO number are written the plant's
      // way (engine/documentFormats.ts): tidy what was said, and ask again if
      // it still doesn't read like one of those codes.
      const rule = codeRulesFor("complaint-checklist")[h.field];
      const value = rule ? rule.normalise(v) : v;
      const problem = rule?.problem(value);
      if (problem) return { data, ack: `${problem} What shall I put?`, stay: true };
      return { data: { ...data, [h.field]: value }, ack: `${h.label}: ${value}.` };
    }
    return { data, ack: "Type the value, or tap Skip.", stay: true };
  }

  if (step.kind === "section-intro") {
    const s = data.sections[step.sectionIndex];
    if (answer.type === "sectionDone") {
      const items = s.items.map((it) => (isItemAnswered(it) ? it : { ...it, done: true, notRequired: false, date: today }));
      const n = items.filter((it, i) => it.done && !s.items[i].done).length;
      return { data: replaceSection(data, step.sectionIndex, items), ack: `Marked ${n} activit${n === 1 ? "y" : "ies"} in Section ${s.key} as done today.` };
    }
    // stepAfter() from a section's intro goes INTO the section, which is what
    // "Let's go" wants — a skip has to name the step past it instead.
    // A section can't be skipped any more: it is finished before the next one.
    if (answer.type === "sectionSkip") return { data, ack: `Section ${s.key} has to be finished before the next one — let's go through it.`, stay: true };
    return { data, ack: "" };
  }

  if (step.kind === "item") {
    const s = data.sections[step.sectionIndex];
    const it = s.items[step.itemIndex];
    let next: ChecklistItem = it;
    let ack = "";
    switch (answer.type) {
      case "done":
        next = { ...it, done: true, notRequired: false, date: today };
        ack = `${s.key}${it.srNo} done today.`;
        break;
      case "doneOn":
        next = { ...it, done: true, notRequired: false, date: answer.date };
        ack = `${s.key}${it.srNo} done on ${formatDisplayDate(answer.date)}.`;
        break;
      case "notRequired":
        next = { ...it, done: false, notRequired: true, comment: it.comment || "Not required" };
        ack = `${s.key}${it.srNo} marked not required.`;
        break;
      case "skip":
        // Every activity is mandatory now, so "skip" asks the same question
        // again rather than walking past it — "Not required" is the answer for
        // something that genuinely doesn't apply.
        return {
          data,
          ack: `${s.key}${it.srNo} still needs an answer — every activity in a section has to be answered. Tap "Not required" if it doesn't apply.`,
          stay: true,
        };
      case "text":
        // Un-interpreted free text (backend unavailable): keep it as the
        // comment and treat the activity as done — never lose what the user
        // typed, and they can untick it on the form if that's wrong.
        next = { ...it, done: true, notRequired: false, date: it.date ?? today, comment: answer.text.trim() };
        ack = `Noted for ${s.key}${it.srNo}: "${answer.text.trim()}".`;
        break;
      case "parsed": {
        const done = answer.done && !answer.notRequired;
        next = {
          ...it,
          done,
          notRequired: answer.notRequired,
          date: done ? answer.date ?? it.date ?? today : it.date,
          comment: answer.comment.trim() || (answer.notRequired ? it.comment || "Not required" : it.comment),
        };
        ack = answer.notRequired
          ? `${s.key}${it.srNo} marked not required${next.comment ? ` — "${next.comment}"` : ""}.`
          : done
            ? `${s.key}${it.srNo} done${next.date ? ` on ${formatDisplayDate(next.date)}` : ""}${next.comment ? ` — "${next.comment}"` : ""}.`
            : `Noted for ${s.key}${it.srNo}${next.comment ? `: "${next.comment}"` : ""} — not marked done yet.`;
        break;
      }
      default:
        return { data, ack: "" };
    }
    const items = s.items.map((x, i) => (i === step.itemIndex ? next : x));
    return { data: replaceSection(data, step.sectionIndex, items), ack };
  }

  return { data, ack: "" };
}

function replaceSection(data: ComplaintChecklistData, sectionIndex: number, items: ChecklistItem[]): ComplaintChecklistData {
  return { ...data, sections: data.sections.map((s, i) => (i === sectionIndex ? { ...s, items } : s)) };
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\(capa\)/i, "(CAPA)");
}

// Reads the everyday ways someone types a date — "today", "yesterday",
// "8/9/2026", "08-09-26", "8 Sep", "2026-09-08" — as an ISO date.
// Day-first (Indian convention) for numeric forms. Returns null if unsure.
export function parseUserDate(text: string, today = todayISO()): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (t === "today" || t === "now") return today;
  if (t === "yesterday") {
    const d = fromISODate(today);
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return build(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return build(y, +m[2], +m[1]);
  }
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  m = t.match(/^(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?(?:\s+(\d{4}))?$/);
  if (m) {
    const mi = months.findIndex((x) => m![2].startsWith(x));
    if (mi >= 0) return build(m[3] ? +m[3] : fromISODate(today).getFullYear(), mi + 1, +m[1]);
  }
  m = t.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/);
  if (m) {
    const mi = months.findIndex((x) => m![1].startsWith(x));
    if (mi >= 0) return build(m[3] ? +m[3] : fromISODate(today).getFullYear(), mi + 1, +m[2]);
  }
  return null;
}

function build(y: number, mo: number, d: number): string | null {
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // 31/02 or 31/09 would otherwise be stored as-is and read back as a day in
  // the following month.
  if (new Date(Date.UTC(y, mo - 1, d)).getUTCMonth() !== mo - 1) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}
