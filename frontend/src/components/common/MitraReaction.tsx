import React, { useEffect, useRef, useState } from "react";
import { REACTION_EVENT, reactionFor, summariseReactions, type Reaction, type ReactionEvent } from "../../engine/reactions";
import { toastCheer } from "../../engine/motivation";
import { useAppStore } from "../../store/AppStore";
import { useAuth } from "../../store/AuthContext";

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
//
// ONE LINE MORE, UNDER IT (REQUIREMENTS §81): `reaction-cheer` — a short word
// from Mitra about the day ("🔥 3 on time today — a 5-day streak."), why the
// module's work matters for the first one of the day, a gentle line for a late
// one (engine/motivation.ts). Worked out in a timeout AFTER the toast is up, so
// the toast itself is never slower; the fields above it never change.

const SHOW_MS = 6000;
// Reactions that arrive in the same breath (one press, many records) are gathered before the first is shown.
const GATHER_MS = 60;
const SUMMARISE_OVER = 5;

export function MitraReaction() {
  const [shown, setShown] = useState<Reaction | null>(null);
  // The line under the toast, for the reaction it was worked out for.
  const [cheer, setCheer] = useState<{ reaction: Reaction; text: string } | null>(null);
  // The events the shown reaction was made of.
  const shownEvents = useRef<ReactionEvent[]>([]);
  const { uiLang } = useAppStore();
  const { user } = useAuth();
  const who = useRef({ user, uiLang });
  who.current = { user, uiLang };
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
    const events = queue.length > SUMMARISE_OVER ? queue.splice(0) : [queue.shift() as ReactionEvent];
    const reaction = events.length > 1 ? summariseReactions(events) : reactionFor(events[0]);
    shownEvents.current = events;
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

  // The cheer line: after the toast has been drawn, never while drawing it.
  useEffect(() => {
    if (!shown) return;
    const events = shownEvents.current;
    const wait = window.setTimeout(() => {
      let text: string | null = null;
      try {
        text = toastCheer(events, who.current.user, who.current.uiLang);
      } catch {
        text = null;
      }
      if (text) setCheer({ reaction: shown, text });
    }, 0);
    return () => window.clearTimeout(wait);
  }, [shown]);

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
        {cheer && cheer.reaction === shown && (
          <div className="mitra-reaction-cheer" data-field="reaction-cheer">
            {cheer.text}
          </div>
        )}
      </div>
    </div>
  );
}
