import React, { useEffect, useMemo, useRef, useState } from "react";
import { REACTION_EVENT, type ReactionEvent } from "../../engine/reactions";
import { emitCue, emitSay } from "../../engine/engageBus";
import {
  allDoneView,
  askAccountsFor,
  badgeFor,
  celebrationKind,
  cheerText,
  markCelebrated,
  motivationFor,
  newAchievements,
  notableAchievements,
  outcomeOf,
  praiseKindFor,
  praiseLine,
  spokenAllDone,
  spokenStreak,
  type AllDoneView,
  type BadgeView,
  type MotivationStats,
} from "../../engine/motivation";
import { useAppStore } from "../../store/AppStore";
import { useAuth } from "../../store/AuthContext";
import { todayISO } from "../../utils/date";

// MITRA CELEBRATES WORK DONE (REQUIREMENTS §81).
//
// "If user complete all the task the bot will enthusiasm them … show reactions
// when user complete the task in given time frame and this is applicable to
// each and every module." Every module's submit, verify and send-back comes
// through engine/recordLifecycle.ts, which announces it as a "dcrs:reaction";
// Mitra's toast (MitraReaction.tsx) answers it in words, and this answers it
// with a little ceremony — 150 ms later, so the toast is always up first:
//
//   handed in on time      a small burst of confetti from the toast's corner, a bright sound
//   handed in late         a soft sound, no confetti — never a scolding
//   verified / sent back   a sound of its own
//   the last one due today the big one: confetti falling over the screen, a fanfare, Mitra
//                          saying so aloud with the person's first name (once a day), and a
//                          card under the top bar — today's score at its best (0: nothing
//                          missing), today's count, the streak, the month's on-time share,
//                          the badges earned, and why it matters
//   a badge earned today   (a streak of 3/5/10/20/50 days, an early bird, a clean week, a
//                          whole module on time) a smaller card with the badge — once a day
//                          each (settings celebratedToday)
//
// NEVER IN THE WAY. Everything here is `pointer-events: none` — a click goes
// straight through to whatever is beneath — except the card's own small close
// button; nothing is a dialog, nothing takes the focus, nothing prints, and all
// of it is drawn with transforms and opacity inside a fixed, clipped layer so it
// never widens the page. Nothing names a document or a module. With reduced
// motion asked for, there is no confetti at all. And nothing here can throw:
// a celebration is never worth an error.
//
// Mounted once, after the app shell (App.tsx), beside MitraReaction.

/** After the toast (MitraReaction gathers for 60 ms) — so the pinned toast always shows first. */
const AFTER_MS = 150;
const BURST_MS = 1300;
const RAIN_MS = 2700;
const CARD_MS = 9000;
const POP_MS = 5200;
const BURST_PIECES = 18;
const RAIN_PIECES = 36;
/** A burst starts 48 px in from the left and ends 1.15 × this far right: inside a 390 px phone. */
const MAX_BURST_DX = 280;
/** The brand's burgundy family and the warm palette (REQUIREMENTS §90): confetti never carries words, so it may be literal colours. */
const COLORS = ["#7E3C40", "#E0A4A7", "#B07440", "#E2B07E", "#3E7A66", "#7CBFA9", "#FBF0D2", "#9F4E53", "#F4F3EE"];

function reducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** A small seeded generator, so each celebration is spread a little differently. */
function randomFrom(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

type Piece = React.CSSProperties & Record<`--${string}`, string>;

/** Where each piece goes: a burst fans up and right from the lower-left corner; rain falls across the whole width. */
export function confettiPieces(kind: "burst" | "rain", seed: number): Piece[] {
  const rnd = randomFrom(seed);
  const out: Piece[] = [];
  const n = kind === "burst" ? BURST_PIECES : RAIN_PIECES;
  for (let i = 0; i < n; i++) {
    const color = COLORS[(i + seed) % COLORS.length];
    const round = rnd() < 0.3;
    const w = 6 + Math.round(rnd() * 4);
    const h = round ? w : 9 + Math.round(rnd() * 6);
    if (kind === "burst") {
      const angle = ((12 + rnd() * 70) * Math.PI) / 180;
      const dist = 150 + rnd() * 220;
      out.push({
        // Never further right than a phone's screen has room for (the layer clips the rest anyway).
        "--dx": `${Math.min(MAX_BURST_DX, Math.round(Math.cos(angle) * dist))}px`,
        "--dy": `${Math.round(Math.sin(angle) * dist)}px`,
        "--r": `${Math.round(180 + rnd() * 540)}deg`,
        "--d": `${Math.round(rnd() * 140)}ms`,
        "--c": color,
        width: `${w}px`,
        height: `${h}px`,
        borderRadius: round ? "50%" : "2px",
      });
    } else {
      out.push({
        "--x": `${(2 + rnd() * 96).toFixed(1)}%`,
        "--dx": `${Math.round((rnd() - 0.5) * 140)}px`,
        "--r": `${Math.round((rnd() < 0.5 ? -1 : 1) * (240 + rnd() * 480))}deg`,
        "--t": `${Math.round(1500 + rnd() * 700)}ms`,
        "--d": `${Math.round(rnd() * 380)}ms`,
        "--c": color,
        width: `${w}px`,
        height: `${h}px`,
        borderRadius: round ? "50%" : "2px",
      });
    }
  }
  return out;
}

function Confetti({ kind, seed }: { kind: "burst" | "rain"; seed: number }) {
  const pieces = useMemo(() => confettiPieces(kind, seed), [kind, seed]);
  return (
    <div className="cheer-confetti no-print" data-section="mitra-confetti" data-kind={kind} aria-hidden="true">
      {pieces.map((style, i) => (
        <i key={i} style={style} />
      ))}
    </div>
  );
}

function Badges({ badges, field }: { badges: BadgeView[]; field: string }) {
  if (badges.length === 0) return null;
  return (
    <div className="cheer-badges" data-field={field}>
      {badges.map((b) => (
        <span key={b.key} className="cheer-badge" data-badge={b.key.startsWith("module-hero:") ? "module-hero" : b.key}>
          {`${b.emoji} ${b.label}`}
        </span>
      ))}
    </div>
  );
}

type Slot = "confetti" | "card" | "pop";

export function Celebration() {
  const { lang, uiLang } = useAppStore();
  const { user } = useAuth();
  const live = useRef({ lang, uiLang, user });
  live.current = { lang, uiLang, user };

  // The accounts of the person's departments, asked once they are signed in (and kept a few minutes), so a
  // record a colleague of a shared department handed in is never celebrated as theirs (engine/motivation.ts).
  const accountsKey = user ? `${user.id}|${(user.departments ?? []).join(",")}` : "";
  useEffect(() => {
    if (!accountsKey) return;
    askAccountsFor(live.current.user).catch(() => undefined);
  }, [accountsKey]);

  const [confetti, setConfetti] = useState<{ id: number; kind: "burst" | "rain" } | null>(null);
  const [card, setCard] = useState<(AllDoneView & { id: number }) | null>(null);
  const [pop, setPop] = useState<{ id: number; title: string; line: string; badges: BadgeView[] } | null>(null);

  useEffect(() => {
    let seq = 0;
    let waiting: ReactionEvent[] = [];
    let gather: number | null = null;
    const timers: Partial<Record<Slot, number>> = {};
    const later = (slot: Slot, ms: number, then: () => void) => {
      if (timers[slot] !== undefined) window.clearTimeout(timers[slot]);
      timers[slot] = window.setTimeout(() => {
        timers[slot] = undefined;
        then();
      }, ms);
    };
    const showConfetti = (kind: "burst" | "rain") => {
      if (reducedMotion()) return;
      seq += 1;
      setConfetti({ id: seq, kind });
      later("confetti", kind === "rain" ? RAIN_MS : BURST_MS, () => setConfetti(null));
    };

    const celebrate = (events: ReactionEvent[]) => {
      const outcome = outcomeOf(events);
      const handedIn = outcome.onTime + outcome.plain + outcome.again;
      const { lang: spoken, uiLang: shown, user: person } = live.current;
      const today = todayISO();
      const seed = `${today}|${events.map((e) => e.recordId ?? e.what).join(",")}`;

      // What today has earned, worked out now — after the submit is stored, off the paint.
      let stats: MotivationStats | null = null;
      if (handedIn + outcome.late > 0) {
        try {
          stats = motivationFor(person, false);
        } catch {
          stats = null;
        }
      }
      const fresh = stats ? newAchievements(stats) : [];
      const kind = celebrationKind(outcome, fresh);

      // THE BIG ONE: the last thing due today went in (the toast's own 🌟 "last one due today").
      if (kind === "all-done") {
        markCelebrated(fresh, today);
        showConfetti("rain");
        emitCue("celebrate");
        seq += 1;
        setPop(null);
        setCard({ ...allDoneView(stats, fresh, shown, seed), id: seq });
        later("card", CARD_MS, () => setCard(null));
        const en = spokenAllDone(stats, "en", seed);
        emitSay({ text: spoken === "en" ? en : spokenAllDone(stats, spoken, seed), lang: spoken, en, key: `all-done:${today}`, priority: "high" });
        return;
      }

      // A badge earned by this work: a streak reached, an early start, a clean week, a whole module on time.
      const notable = notableAchievements(fresh);
      if (kind === "badge") {
        markCelebrated(fresh, today);
        showConfetti("burst");
        emitCue("celebrate");
        seq += 1;
        setPop({
          id: seq,
          title: cheerText(shown, notable.length === 1 ? "cheer.pop.title.one" : "cheer.pop.title.many"),
          line: praiseLine(praiseKindFor(notable), stats, shown, seed),
          badges: notable.map((k) => badgeFor(k, shown)),
        });
        later("pop", POP_MS, () => setPop(null));
        const milestone = notable.find((k) => k.startsWith("streak-"));
        if (milestone && stats) {
          const en = spokenStreak(stats, "en", seed);
          emitSay({ text: spoken === "en" ? en : spokenStreak(stats, spoken, seed), lang: spoken, en, key: `${milestone}:${today}` });
        }
        return;
      }

      // The everyday answer: a burst and a bright sound for work in on time; a soft one otherwise.
      if (handedIn > 0) markCelebrated(fresh.filter((k) => k === "first-on-time-today"), today);
      if (outcome.onTime + outcome.plain > 0) {
        showConfetti("burst");
        emitCue("success");
      } else if (outcome.again > 0) emitCue("success");
      else if (outcome.late > 0) emitCue("late");
      else if (outcome.verified > 0) emitCue("success");
      else if (outcome.sentBack > 0) emitCue("sentBack");
    };

    const onReaction = (e: Event) => {
      const detail = (e as CustomEvent<ReactionEvent>).detail;
      if (!detail || typeof detail !== "object" || !("kind" in detail)) return;
      waiting.push(detail);
      if (gather !== null) return;
      gather = window.setTimeout(() => {
        gather = null;
        const batch = waiting;
        waiting = [];
        try {
          celebrate(batch);
        } catch {
          /* a celebration is never worth an error */
        }
      }, AFTER_MS);
    };
    window.addEventListener(REACTION_EVENT, onReaction);
    return () => {
      window.removeEventListener(REACTION_EVENT, onReaction);
      if (gather !== null) window.clearTimeout(gather);
      for (const slot of Object.keys(timers) as Slot[]) if (timers[slot] !== undefined) window.clearTimeout(timers[slot]);
    };
  }, []);

  // Escape puts the card away too (the close button is the other way; it also goes by itself).
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCard(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card]);

  const closeLabel = cheerText(uiLang, "cheer.close");
  return (
    <>
      {confetti && <Confetti key={confetti.id} kind={confetti.kind} seed={confetti.id} />}
      {card && (
        <div key={card.id} className="cheer-card no-print" data-section="mitra-celebration" role="status" aria-live="polite">
          <button type="button" className="cheer-card-close" data-action="close-celebration" aria-label={closeLabel} title={closeLabel} onClick={() => setCard(null)}>
            ×
          </button>
          <div className="cheer-card-title" data-field="celebration-title">
            {card.title}
          </div>
          <div className="cheer-card-score" data-field="celebration-score" data-score="0">
            {card.score}
          </div>
          <div className="cheer-card-facts">
            <span className="cheer-card-fact" data-field="celebration-count">
              {card.count}
            </span>
            <span className="cheer-card-fact cheer-card-streak" data-field="celebration-streak">
              {card.streak}
            </span>
            {card.onTime && (
              <span className="cheer-card-fact" data-field="celebration-ontime">
                {card.onTime}
              </span>
            )}
          </div>
          <Badges badges={card.badges} field="celebration-badges" />
          {card.praise && (
            <div className="cheer-card-praise" data-field="celebration-praise">
              {card.praise}
            </div>
          )}
          <div className="cheer-card-purpose" data-field="celebration-purpose">
            {card.purpose}
          </div>
        </div>
      )}
      {pop && !card && (
        <div key={pop.id} className="cheer-pop no-print" data-section="mitra-achievement" role="status" aria-live="polite">
          <div className="cheer-pop-title">{pop.title}</div>
          <Badges badges={pop.badges} field="achievement-badges" />
          {pop.line && <div className="cheer-pop-line">{pop.line}</div>}
        </div>
      )}
    </>
  );
}
