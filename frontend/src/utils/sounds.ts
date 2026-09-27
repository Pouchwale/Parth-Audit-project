// MITRA'S SOUNDS (REQUIREMENTS §81).
//
// "Add some noise in notification." A short, soft sound for each moment the
// app wants noticed — something new in the bell, a spoken reminder about to
// start, a record in on time, a record in late, a record sent back, everything
// done for the day, an escalation. Made here with the Web Audio API — a few
// sine and triangle notes with a quick rise and a gentle fall — so there are no
// sound files to download, cache or license, and nothing new on the network.
//
// A browser plays nothing before the page has been clicked or typed in, so the
// one AudioContext is made at the first pointerdown or keydown (a capture
// listener, once) — or at once, when the browser says the page already had one
// (signing in is a click). Until then a cue is simply dropped: a sound that
// arrives late is worse than none. Between cues the context is suspended, so an
// idle tab does not keep an audio stream running on a low-end laptop.
//
// Everything is wrapped: a cue never throws, never logs an error, and a
// browser without Web Audio is silent. Whether sounds are wanted at all is the
// host's question (components/common/SoundVoiceHost.tsx reads settings.soundsOn).
//
// THE NOTES ARE DATA (CUE_SCHEDULE), so a unit test checks every cue — its
// length, its notes, how loud it may be — without a browser.

import type { CueName } from "../engine/engageBus";

export interface ToneNote {
  /** Seconds after the cue starts. */
  at: number;
  /** Hz. */
  freq: number;
  /** Seconds the note rings (its fall included). */
  dur: number;
  /** 0–1, before the master volume. */
  gain: number;
  type: "sine" | "triangle" | "square";
  /** A quieter overtone at this multiple of `freq`, for a bell's shimmer. */
  overtone?: number;
}

/** How loud the whole of every cue is, at most: modest, under whatever else is playing. */
export const MASTER_VOLUME = 0.22;

// Equal-tempered pitches used below.
const C4 = 261.63;
const E4 = 329.63;
const F4 = 349.23;
const G4 = 392.0;
const A4 = 440.0;
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880.0;
const C6 = 1046.5;
const E6 = 1318.51;
const C7 = 2093.0;
const E7 = 2637.02;
const G7 = 3135.96;
const C8 = 4186.01;

export const CUE_SCHEDULE: Record<CueName, readonly ToneNote[]> = {
  // Two soft bell notes, high then a third lower: "something new".
  chime: [
    { at: 0, freq: E6, dur: 0.6, gain: 0.45, type: "sine", overtone: 2.76 },
    { at: 0.16, freq: C6, dur: 0.7, gain: 0.4, type: "sine", overtone: 2.76 },
  ],
  // Three rising notes: "listen — Mitra is about to say something".
  reminder: [
    { at: 0, freq: C5, dur: 0.26, gain: 0.4, type: "triangle" },
    { at: 0.14, freq: E5, dur: 0.26, gain: 0.42, type: "triangle" },
    { at: 0.28, freq: G5, dur: 0.4, gain: 0.45, type: "triangle" },
  ],
  // A bright major arpeggio up to the octave: in on time.
  success: [
    { at: 0, freq: C5, dur: 0.2, gain: 0.38, type: "triangle" },
    { at: 0.07, freq: E5, dur: 0.2, gain: 0.4, type: "triangle" },
    { at: 0.14, freq: G5, dur: 0.22, gain: 0.42, type: "triangle" },
    { at: 0.21, freq: C6, dur: 0.45, gain: 0.45, type: "sine", overtone: 2 },
  ],
  // A soft two-tone, falling a third: done, a little late — never a buzzer.
  late: [
    { at: 0, freq: A4, dur: 0.32, gain: 0.34, type: "sine" },
    { at: 0.2, freq: F4, dur: 0.42, gain: 0.3, type: "sine" },
  ],
  // Gently descending: it has come back to be looked at again.
  sentBack: [
    { at: 0, freq: G4, dur: 0.28, gain: 0.34, type: "sine" },
    { at: 0.15, freq: E4, dur: 0.28, gain: 0.32, type: "sine" },
    { at: 0.3, freq: C4, dur: 0.42, gain: 0.3, type: "sine" },
  ],
  // A little fanfare, and a sparkle on top: everything done for the day.
  celebrate: [
    { at: 0, freq: G4, dur: 0.14, gain: 0.36, type: "triangle" },
    { at: 0.12, freq: C5, dur: 0.14, gain: 0.38, type: "triangle" },
    { at: 0.24, freq: E5, dur: 0.14, gain: 0.4, type: "triangle" },
    { at: 0.36, freq: G5, dur: 0.5, gain: 0.45, type: "triangle", overtone: 2 },
    { at: 0.52, freq: C7, dur: 0.16, gain: 0.14, type: "sine" },
    { at: 0.6, freq: E7, dur: 0.16, gain: 0.12, type: "sine" },
    { at: 0.68, freq: G7, dur: 0.16, gain: 0.1, type: "sine" },
    { at: 0.76, freq: C8, dur: 0.22, gain: 0.08, type: "sine" },
  ],
  // Two firm notes: an escalation, for the super admin.
  alert: [
    { at: 0, freq: A5, dur: 0.18, gain: 0.2, type: "square" },
    { at: 0.22, freq: A5, dur: 0.24, gain: 0.2, type: "square" },
  ],
};

/** How long a cue sounds, in seconds: its last note's end. */
export function cueDuration(name: CueName): number {
  return CUE_SCHEDULE[name].reduce((end, n) => Math.max(end, n.at + n.dur), 0);
}

// ---- the first click or key ------------------------------------------------

type AudioCtor = typeof AudioContext;

let gestured = false;
let ctx: AudioContext | null = null;
let installed = false;
const gestureWaiters = new Set<() => void>();
let suspendTimer = 0;
let lastCue: { name: string; at: number } | null = null;

function audioCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Whether the browser says this page has already been clicked or typed in (a sign-in counts). */
function browserSaysActive(): boolean {
  try {
    const nav = (typeof navigator !== "undefined" ? navigator : null) as (Navigator & { userActivation?: { hasBeenActive?: boolean } }) | null;
    return nav?.userActivation?.hasBeenActive === true;
  } catch {
    return false;
  }
}

function makeContext(): void {
  if (ctx) return;
  const Ctor = audioCtor();
  if (!Ctor) return;
  try {
    ctx = new Ctor();
    // Made, then put to sleep until a cue wakes it: an idle context still runs.
    ctx.suspend().catch(() => undefined);
  } catch {
    ctx = null;
  }
}

function onGesture(): void {
  if (gestured) return;
  gestured = true;
  removeListeners();
  makeContext();
  const waiting = [...gestureWaiters];
  gestureWaiters.clear();
  for (const fn of waiting) {
    try {
      fn();
    } catch {
      /* one waiter's slip never stops the rest */
    }
  }
}

function removeListeners(): void {
  if (typeof window === "undefined" || typeof window.removeEventListener !== "function") return;
  try {
    window.removeEventListener("pointerdown", onGesture, true);
    window.removeEventListener("keydown", onGesture, true);
  } catch {
    /* nothing to remove */
  }
}

/**
 * Starts watching for the first click or key (once; any later call does
 * nothing). If the browser says the page was already used — the person has
 * just signed in — that counts as the first gesture straight away.
 */
export function watchFirstGesture(): void {
  if (installed || gestured) return;
  installed = true;
  if (browserSaysActive()) {
    onGesture();
    return;
  }
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  try {
    window.addEventListener("pointerdown", onGesture, { capture: true, passive: true });
    window.addEventListener("keydown", onGesture, { capture: true, passive: true });
  } catch {
    /* no events: nothing will ever play, which is safe */
  }
}

/** Whether the page has been clicked or typed in yet — before that, a browser plays nothing. */
export function hadUserGesture(): boolean {
  if (!gestured && browserSaysActive()) onGesture();
  return gestured;
}

/** Calls `fn` at the first click or key (at once if it has happened); the returned function takes it back. */
export function onFirstGesture(fn: () => void): () => void {
  if (hadUserGesture()) {
    fn();
    return () => undefined;
  }
  watchFirstGesture();
  gestureWaiters.add(fn);
  return () => gestureWaiters.delete(fn);
}

// ---- playing ---------------------------------------------------------------

function scheduleNote(context: AudioContext, out: AudioNode, note: ToneNote, start: number, freq: number, gain: number): void {
  const osc = context.createOscillator();
  const env = context.createGain();
  osc.type = note.type;
  osc.frequency.setValueAtTime(freq, start);
  const t0 = start + note.at;
  const peak = Math.max(0.0002, gain * MASTER_VOLUME);
  // A quick rise (no click) and an exponential fall to silence.
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(peak, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + note.dur);
  osc.connect(env);
  env.connect(out);
  osc.start(t0);
  osc.stop(t0 + note.dur + 0.03);
}

/**
 * Plays a cue. Dropped — silently — before the page's first click or key, in
 * a browser without Web Audio, or when the same cue was asked for a moment ago
 * (a burst of submits is one sound, not seven). Never throws.
 */
export function playCue(name: CueName): void {
  try {
    const notes = CUE_SCHEDULE[name];
    if (!notes || !hadUserGesture()) return;
    makeContext();
    const context = ctx;
    if (!context) return;
    const now = Date.now();
    if (lastCue && lastCue.name === name && now - lastCue.at < 300) return;
    lastCue = { name, at: now };
    if (context.state !== "running") context.resume().catch(() => undefined);
    const start = context.currentTime + 0.03;
    const out = context.destination;
    for (const note of notes) {
      scheduleNote(context, out, note, start, note.freq, note.gain);
      if (note.overtone) scheduleNote(context, out, { ...note, dur: note.dur * 0.6 }, start, note.freq * note.overtone, note.gain * 0.18);
    }
    // Asleep again once the last note has rung out.
    window.clearTimeout(suspendTimer);
    suspendTimer = window.setTimeout(
      () => {
        if (ctx && ctx.state === "running") ctx.suspend().catch(() => undefined);
      },
      Math.ceil((cueDuration(name) + 0.4) * 1000)
    );
  } catch {
    /* a sound is never worth an error */
  }
}

/** For the unit test: forget the gesture and the context, as a fresh page would. */
export function resetSoundsForTests(): void {
  removeListeners();
  gestured = false;
  installed = false;
  ctx = null;
  lastCue = null;
  gestureWaiters.clear();
}
