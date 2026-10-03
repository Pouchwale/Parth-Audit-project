// SOUNDS AND SPOKEN LINES, ASKED FOR FROM ANYWHERE (REQUIREMENTS §81).
//
// A celebration, a reminder, an upload read back, the day's notification —
// each wants a short sound, and some want Mitra to say something. None of them
// plays audio itself: they ask here, and the one host that owns the speaker
// (components/common/SoundVoiceHost.tsx) decides — whether sounds and voice are
// switched on, whether the browser has been clicked yet (a browser plays nothing
// before the first click or key), whether the microphone is listening (Mitra
// never talks over a person), and whether this was already said today.
//
// Events, not calls: the askers stay free of audio code, the host can be absent
// (a test, a page without it) and nothing breaks, and a test can listen for
// exactly what was asked for — "dcrs:cue" and "dcrs:say" on window.

import { REACTION_EVENT } from "./reactions";

export type CueName =
  /** Something new to look at: the bell, the day's notification, the briefing. */
  | "chime"
  /** A spoken reminder is about to start. */
  | "reminder"
  /** A record submitted on time, verified, an upload applied. */
  | "success"
  /** Submitted, but late — a soft, not a scolding, sound. */
  | "late"
  /** A record sent back. */
  | "sentBack"
  /** Everything due today is done, a streak, an achievement. */
  | "celebrate"
  /** An escalation to the super admin. */
  | "alert";

export const CUE_NAMES: readonly CueName[] = ["chime", "reminder", "success", "late", "sentBack", "celebrate", "alert"];

export const CUE_EVENT = "dcrs:cue";
export const SAY_EVENT = "dcrs:say";

export interface SayRequest {
  /** What Mitra says, in the language it is written in. */
  text: string;
  /**
   * The language `text` is in; Gujarati and Hindi are spoken only where the
   * browser has a voice for them (the voice follows each sentence's script:
   * utils/scripts.ts, REQUIREMENTS §89). Hindi only for "Hear Mitra".
   */
  lang: "en" | "gu" | "hi";
  /** The same words in English, spoken instead when `text` is Gujarati or Hindi and no voice for it exists. */
  en?: string;
  /** Said at most once a day under this key (settings.spokenToday), e.g. "briefing:morning", "remind:<recordId>:<window>". */
  key?: string;
  /** high: goes to the front and cuts off a low one; low: dropped when something else is waiting. */
  priority?: "low" | "normal" | "high";
}

function emit(name: string, detail: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    /* a sound is never worth an error */
  }
}

// WHAT THE PERSON JUST DID HERE. A submit, a verify, a send-back, an upload
// applied: each is announced (engine/recordLifecycle.ts's reaction) or asks for
// its own sound (success, late, sent back, a celebration). A change the bell
// sees right after one of those is that action's own result — a record sent
// back or reopened becomes waiting again — and has its sound already; the
// bell's chime is for something new arriving, not an echo of the click.

/** The sounds that answer something the person did here, rather than something arriving. */
const ACTION_CUES: ReadonlySet<CueName> = new Set<CueName>(["success", "late", "sentBack", "celebrate"]);
/** How long the bell waits before chiming: an action's sound can come just after the change it made (a send-back's 150 ms after it). */
export const NEWS_SETTLE_MS = 800;
/** A change the bell sees within this long after the person's own action is that action's result. */
export const OWN_ACTION_MS = 2000;

let lastActionAt = 0;
let newsTimer = 0;

if (typeof window !== "undefined") {
  try {
    window.addEventListener(REACTION_EVENT, () => {
      lastActionAt = Date.now();
    });
  } catch {
    /* no window to listen on: only the action sounds are counted */
  }
}

/** Ask for a short sound. Silent when sounds are off or the browser has not been clicked yet. */
export function emitCue(cue: CueName): void {
  if (ACTION_CUES.has(cue)) lastActionAt = Date.now();
  emit(CUE_EVENT, { cue });
}

/**
 * THE BELL GAINED SOMETHING URGENT: the chime for news — a moment later, and
 * not at all when it is only the result of the person's own action just
 * before or just after (a record they sent back or reopened; see above).
 */
export function chimeForNews(): void {
  if (typeof window === "undefined") return;
  const seenAt = Date.now();
  try {
    window.clearTimeout(newsTimer);
    newsTimer = window.setTimeout(() => {
      newsTimer = 0;
      if (lastActionAt >= seenAt - OWN_ACTION_MS) return;
      emitCue("chime");
    }, NEWS_SETTLE_MS);
  } catch {
    /* a sound is never worth an error */
  }
}

/** Ask Mitra to say something aloud. Silent when the voice is off; queued until the first click. */
export function emitSay(req: SayRequest): void {
  if (!req || typeof req.text !== "string" || !req.text.trim()) return;
  emit(SAY_EVENT, req);
}
