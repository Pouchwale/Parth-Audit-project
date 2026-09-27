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
  /** The language `text` is in; Gujarati is spoken only where the browser has a Gujarati voice. */
  lang: "en" | "gu";
  /** The same words in English, spoken instead when `text` is Gujarati and no Gujarati voice exists. */
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

/** Ask for a short sound. Silent when sounds are off or the browser has not been clicked yet. */
export function emitCue(cue: CueName): void {
  emit(CUE_EVENT, { cue });
}

/** Ask Mitra to say something aloud. Silent when the voice is off; queued until the first click. */
export function emitSay(req: SayRequest): void {
  if (!req || typeof req.text !== "string" || !req.text.trim()) return;
  emit(SAY_EVENT, req);
}
