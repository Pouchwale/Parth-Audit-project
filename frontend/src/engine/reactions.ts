// MITRA REACTS TO WORK DONE ON TIME OR LATE (REQUIREMENTS §64).
//
// "bot will give reactions on timely activity is complete or not through
// emojis." When a record is submitted, verified or sent back
// (engine/recordLifecycle.ts announces each one), Mitra says so with one emoji
// that tells the person at a glance how it went:
//
//   submitted on or before its due date      🎉  "… submitted on time."
//   submitted N days after its due date      ⏰  "… submitted N days late."
//   an as-required record                    ✅  "… submitted."  (no due date to be late for)
//   submitted again after a correction       ✅  "… submitted again, put right."  (judged by its first submission)
//   verified                                 ✅
//   sent back                                ↩️  with the reason
//   …and nothing else of theirs due or overdue   🌟  "That was the last one due today."
//
// Everything here is pure — the facts come in on the event, the words go out —
// so the toast (components/common/MitraReaction.tsx) and the chat
// (components/common/DocumentAssistant.tsx) can never say different things.

export const REACTION_EVENT = "dcrs:reaction";

export type ReactionTone = "good" | "warn" | "bad" | "info";

export type ReactionEvent =
  | {
      kind: "submitted";
      /** recordLabel(record): format number, name and the day the record is for. */
      what: string;
      dueDate: string; // ISO date
      /** The day it was submitted, ISO. */
      on: string;
      /** doc.schedule.type === "as-required": started when needed, so never late. */
      asRequired: boolean;
      /** Submitted before and put right since: judged by its FIRST submission, so this one is neither on time nor late. */
      again?: boolean;
      /** Nothing of the person's visible documents is left due today or overdue. */
      lastOneDue?: boolean;
    }
  | { kind: "verified"; what: string }
  | { kind: "rejected"; what: string; reason: string };

export interface Reaction {
  emoji: string;
  /** The whole sentence. */
  text: string;
  tone: ReactionTone;
  /** The part of `text` that names the record — a format number and a date, shown as written (REQUIREMENTS §58). */
  subject?: string;
  /** The end of `text` that somebody typed — the reason a record was sent back — shown as written too (REQUIREMENTS §58). */
  typed?: string;
  /** A second line, with an emoji of its own. */
  bonus?: { emoji: string; text: string };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days between the due date and the day of submitting; 0 or less is on time. */
export function daysLate(dueDate: string, on: string): number {
  const days = Math.round((Date.parse(on) - Date.parse(dueDate)) / MS_PER_DAY);
  return Number.isFinite(days) ? days : 0;
}

const LAST_ONE = { emoji: "🌟", text: "That was the last one due today." };

export function reactionFor(event: ReactionEvent): Reaction {
  if (event.kind === "verified") return { emoji: "✅", text: `${event.what} verified.`, tone: "good", subject: event.what };
  if (event.kind === "rejected") {
    const reason = event.reason.trim();
    return { emoji: "↩️", text: `${event.what} sent back${reason ? ` — ${reason}` : "."}`, tone: "bad", subject: event.what, typed: reason || undefined };
  }
  const bonus = event.lastOneDue ? LAST_ONE : undefined;
  if (event.again) return { emoji: "✅", text: `${event.what} submitted again, put right.`, tone: "info", subject: event.what, bonus };
  if (event.asRequired) return { emoji: "✅", text: `${event.what} submitted.`, tone: "info", subject: event.what, bonus };
  const late = daysLate(event.dueDate, event.on);
  if (late <= 0) return { emoji: "🎉", text: `${event.what} submitted on time.`, tone: "good", subject: event.what, bonus };
  return { emoji: "⏰", text: `${event.what} submitted ${late} day${late === 1 ? "" : "s"} late.`, tone: "warn", subject: event.what, bonus };
}

/**
 * Several at once — "Submit" on Today's Briefing sends a morning's records in
 * one go — said as one: "6 records submitted — 5 on time, 1 late".
 */
export function summariseReactions(events: ReactionEvent[]): Reaction {
  let onTime = 0;
  let late = 0;
  let plain = 0;
  let verified = 0;
  let sentBack = 0;
  let lastOneDue = false;
  for (const e of events) {
    if (e.kind === "verified") verified += 1;
    else if (e.kind === "rejected") sentBack += 1;
    else {
      if (e.lastOneDue) lastOneDue = true;
      if (e.asRequired) plain += 1;
      else if (daysLate(e.dueDate, e.on) <= 0) onTime += 1;
      else late += 1;
    }
  }
  const submitted = onTime + late + plain;
  const parts: string[] = [];
  if (submitted > 0) {
    const how = [onTime ? `${onTime} on time` : "", late ? `${late} late` : "", plain ? `${plain} as required` : ""].filter(Boolean).join(", ");
    parts.push(`${submitted} record${submitted === 1 ? "" : "s"} submitted — ${how}`);
  }
  if (verified > 0) parts.push(`${verified} verified`);
  if (sentBack > 0) parts.push(`${sentBack} sent back`);
  const emoji = late > 0 ? "⏰" : sentBack > 0 && submitted === 0 && verified === 0 ? "↩️" : onTime > 0 ? "🎉" : "✅";
  const tone: ReactionTone = late > 0 ? "warn" : sentBack > 0 && submitted === 0 && verified === 0 ? "bad" : onTime > 0 || verified > 0 ? "good" : "info";
  return { emoji, text: `${parts.join("; ")}.`, tone, bonus: lastOneDue ? LAST_ONE : undefined };
}
