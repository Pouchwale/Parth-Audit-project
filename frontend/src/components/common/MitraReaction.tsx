import React, { useEffect, useRef, useState } from "react";
import { REACTION_EVENT, reactionFor, summariseReactions, type Reaction, type ReactionEvent } from "../../engine/reactions";

// MITRA'S REACTION TO WORK DONE (REQUIREMENTS §64): a record submitted on time,
// submitted late, verified or sent back is answered with one emoji and one
// sentence (engine/reactions.ts), wherever on the portal it was done.
//
// ONE AT A TIME, bottom-left — the docked assistant owns the right-hand side
// (REQUIREMENTS §60) and the record's own Submit sits bottom-right, so neither
// is ever covered. It goes by itself after six seconds, or at a click. Several
// at once are queued; more than five waiting are said as one ("6 records
// submitted — 5 on time, 1 late"), because Today's Briefing can submit a
// morning's records with one press and nobody wants to sit through eight toasts.
// It never prints.

const SHOW_MS = 6000;
// Reactions that arrive in the same breath (one press, many records) are gathered before the first is shown.
const GATHER_MS = 60;
const SUMMARISE_OVER = 5;

export function MitraReaction() {
  const [shown, setShown] = useState<Reaction | null>(null);
  const waiting = useRef<ReactionEvent[]>([]);
  const timer = useRef<number | null>(null);
  const busy = useRef(false);

  const next = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const queue = waiting.current;
    if (queue.length === 0) {
      busy.current = false;
      setShown(null);
      return;
    }
    const reaction = queue.length > SUMMARISE_OVER ? summariseReactions(queue.splice(0)) : reactionFor(queue.shift() as ReactionEvent);
    busy.current = true;
    setShown(reaction);
    timer.current = window.setTimeout(next, SHOW_MS);
  };
  // The listener is attached once; it always calls the latest `next`.
  const nextRef = useRef(next);
  nextRef.current = next;

  useEffect(() => {
    const onReaction = (e: Event) => {
      const detail = (e as CustomEvent<ReactionEvent>).detail;
      if (!detail || typeof detail !== "object" || !("kind" in detail)) return;
      waiting.current.push(detail);
      if (busy.current) return;
      busy.current = true;
      timer.current = window.setTimeout(() => nextRef.current(), GATHER_MS);
    };
    window.addEventListener(REACTION_EVENT, onReaction);
    return () => {
      window.removeEventListener(REACTION_EVENT, onReaction);
      if (timer.current !== null) window.clearTimeout(timer.current);
      // Nothing is left half-shown: a remount starts from an empty queue.
      timer.current = null;
      busy.current = false;
      waiting.current = [];
    };
  }, []);

  if (!shown) return null;
  // What names the record (a format number, a date) and what somebody typed (the
  // reason it was sent back) read as written; Mitra's own words between them are
  // the app's, and translate with the page (REQUIREMENTS §58).
  const subject = shown.subject && shown.text.startsWith(shown.subject) ? shown.subject : "";
  const typed = shown.typed && shown.text.endsWith(shown.typed) && shown.text.length >= subject.length + shown.typed.length ? shown.typed : "";
  const between = shown.text.slice(subject.length, shown.text.length - typed.length);
  return (
    <div className="mitra-reaction no-print" data-section="mitra-reaction" data-tone={shown.tone} role="status" aria-live="polite" title="Click to dismiss" onClick={next}>
      <span className="mitra-reaction-emoji" data-field="reaction-emoji" aria-hidden="true">
        {shown.emoji}
      </span>
      <div className="mitra-reaction-text">
        <div data-field="reaction-text">
          {subject && (
            <span className="notranslate" translate="no">
              {subject}
            </span>
          )}
          {between}
          {typed && (
            <span className="notranslate" translate="no">
              {typed}
            </span>
          )}
        </div>
        {shown.bonus && (
          <div className="mitra-reaction-bonus" data-field="reaction-bonus">
            <span aria-hidden="true">{shown.bonus.emoji}</span> {shown.bonus.text}
          </div>
        )}
      </div>
    </div>
  );
}
