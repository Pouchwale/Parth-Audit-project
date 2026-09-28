import { settingsRepository } from "../data/repositories/settingsRepository";

// VOICE FOR THE ASSISTANT — speech-to-text for what the user says, and
// text-to-speech for the reply, both from the browser's own Web Speech API.
// Nothing is sent anywhere extra: recognition runs in the browser (Chrome and
// Edge route it through the platform's speech service, exactly as the address
// bar's dictation does) and the app only ever receives the finished text,
// which then follows the same path as anything typed.
//
// Listening waits for the WHOLE sentence. The API's default behaviour ends the
// session at the first pause, which cuts a speaker off mid-thought ("show me
// the daily pest control monitoring record …" — pause to think — "… for
// January"), so recognition runs in continuous mode and this module decides
// when the speaker has finished: it keeps accumulating while they talk and
// only completes after a clear silence (SILENCE_MS) once something has
// actually been said. Interim words are reported as they arrive so the
// composer can show the sentence building up, and the user can always finish
// early by pressing stop.
//
// Support is uneven — Chrome and Edge implement SpeechRecognition, Firefox
// does not — so every entry point here reports whether it is available and the
// UI hides or explains the control rather than offering a dead button.

// How long a speaker may pause, mid-sentence, before we treat the utterance as
// finished. Generous on purpose: being cut off is far more annoying than
// waiting an extra second, and the stop button is always there for an
// immediate finish.
const SILENCE_MS = 2500;
// Chrome sometimes ends a continuous session on its own after a long silence.
// While the user still means to be talking, restart — bounded, so a browser
// that refuses to listen can never spin.
const MAX_RESTARTS = 3;

type RecognitionResultLike = { isFinal: boolean; length: number; 0: { transcript: string } };
type RecognitionEventLike = { results: ArrayLike<RecognitionResultLike> };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isVoiceInputSupported(): boolean {
  return recognitionCtor() !== null;
}

export function isSpeechOutputSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// How many listening sessions are open (listenForUtterance, from its start to
// its end). Mitra never speaks over a person (REQUIREMENTS §81): utils/voice.ts
// holds its reminders and briefing while this is true.
let openSessions = 0;

/** Whether the microphone is listening for a spoken sentence right now. */
export function isListening(): boolean {
  return openSessions > 0;
}

export type VoiceErrorKind = "denied" | "other";

export interface VoiceSession {
  // Finish now with whatever has been said so far (the mic button while
  // listening) — the sentence is delivered, not discarded.
  finish: () => void;
  // Drop the session and say nothing (navigating away, unmounting).
  cancel: () => void;
}

// Listen until the speaker finishes their sentence.
//   onInterim — the sentence so far, updated as they speak (for live display)
//   onFinal   — the complete sentence, exactly once, when they have finished
//   onEnd     — always, so the caller can clear its "listening" state
export function listenForUtterance({
  lang,
  onInterim,
  onFinal,
  onError,
  onEnd,
  silenceMs = SILENCE_MS,
}: {
  lang: string;
  onInterim?: (text: string) => void;
  onFinal: (transcript: string) => void;
  onError?: (kind: VoiceErrorKind) => void;
  onEnd?: () => void;
  silenceMs?: number;
}): VoiceSession | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = lang;
  // Continuous: a pause must not end the sentence — see the header comment.
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let settled = false; // onFinal / onEnd already delivered
  let stopping = false; // deliberate finish/cancel — don't restart
  let restarts = 0;
  let finalText = "";
  let silenceTimer: number | undefined;

  const clearSilenceTimer = () => {
    if (silenceTimer !== undefined) {
      window.clearTimeout(silenceTimer);
      silenceTimer = undefined;
    }
  };

  const settle = (deliver: boolean) => {
    if (settled) return;
    settled = true;
    openSessions = Math.max(0, openSessions - 1);
    clearSilenceTimer();
    stopping = true;
    try {
      recognition.abort();
    } catch {
      /* already stopped */
    }
    const text = finalText.trim();
    if (deliver && text) onFinal(text);
    onEnd?.();
  };

  // The speaker has gone quiet for long enough — treat the sentence as done.
  const armSilenceTimer = () => {
    clearSilenceTimer();
    silenceTimer = window.setTimeout(() => {
      if (finalText.trim()) settle(true);
    }, silenceMs);
  };

  recognition.onresult = (event) => {
    let interim = "";
    finalText = "";
    // Rebuild from the whole result list rather than appending per event:
    // Chrome revises earlier segments as it hears more, and re-reading is
    // what keeps the accumulated sentence in step with those revisions.
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result?.[0]?.transcript ?? "";
      if (result?.isFinal) finalText += text;
      else interim += text;
    }
    onInterim?.((finalText + interim).trim());
    // Any speech at all — final or interim — means they're still going.
    armSilenceTimer();
  };

  recognition.onerror = (event) => {
    // "aborted" is a deliberate stop; "no-speech" just means they haven't
    // started yet, and the session either restarts or ends on its own.
    if (event?.error === "aborted") return;
    if (event?.error === "no-speech") return;
    onError?.(event?.error === "not-allowed" || event?.error === "service-not-allowed" ? "denied" : "other");
    settle(true);
  };

  recognition.onend = () => {
    if (settled || stopping) return;
    // Ended by itself: deliver if they said something, otherwise keep the
    // microphone open — they may simply not have started yet.
    if (finalText.trim()) {
      settle(true);
      return;
    }
    if (restarts < MAX_RESTARTS) {
      restarts += 1;
      try {
        recognition.start();
        return;
      } catch {
        /* fall through to settle */
      }
    }
    settle(false);
  };

  try {
    recognition.start();
  } catch {
    onError?.("other");
    onEnd?.();
    return null;
  }
  openSessions += 1;
  interruptOthers();
  return {
    finish: () => settle(true),
    cancel: () => settle(false),
  };
}

// ---- THE VOICE MITRA SPEAKS WITH (REQUIREMENTS §81) ----------------------------
//
// "in today briefing it seem to be real voice". Browsers list their voices in no
// useful order: in Edge the robotic "Microsoft Heera - English (India)" comes
// before the natural "Microsoft Neerja Online (Natural)", and the old picker took
// the first voice of the language — so Mitra sounded like a machine where a
// natural voice was sitting right there. pickVoice chooses, for the language:
//   1. a natural voice (Edge's "Online (Natural)", any "Neural") — Neerja or
//      Prabhat for Indian English, ધ્વની or નિરંજન for Gujarati
//   2. a Google voice
//   3. any voice of the language
// and, within each, the person's choice of a female or male voice (by a small
// list of names — Gujarati names are in Gujarati script, so the match is on the
// voice's language and "Natural", never on its name alone). English falls back
// to any English voice; Gujarati never does — Mitra does not read Gujarati with
// an English voice (it says the English line instead, or nothing).
//
// Both Mitra's spoken replies (speak, below) and the reminders and briefing
// (utils/voice.ts) choose with it.

export type VoiceKind = "female" | "male";

/** The part of a SpeechSynthesisVoice the picker reads (a test hands in plain objects). */
export interface VoiceLike {
  name: string;
  lang: string;
}

const FEMALE_NAMES = new Set([
  "neerja", "heera", "ધ્વની", "dhwani", "swara", "स्वरा", "kajal", "aditi", "raveena", "priya", "ananya", "shruti", "veena", "lekha", "kalpana",
  "zira", "hazel", "susan", "aria", "jenny", "sonia", "libby", "natasha", "clara", "emma", "ava", "michelle", "samantha", "karen", "moira",
  "tessa", "sara", "sarah", "linda", "catherine", "elsa", "maisie", "nancy", "female", "woman",
]);
const MALE_NAMES = new Set([
  "prabhat", "ravi", "નિરંજન", "niranjan", "madhur", "मधुर", "hemant", "rishi", "prakash", "kunal", "aarav", "arjun",
  "david", "mark", "george", "guy", "ryan", "william", "christopher", "eric", "brian", "andrew", "daniel", "alex", "thomas", "james",
  "liam", "fred", "tom", "oliver", "male", "man",
]);

/** A voice's gender as far as its name says, or null. Whole words only: "Microsoft ધ્વની Online (Natural) - Gujarati (India)". */
export function genderOfVoice(name: string): VoiceKind | null {
  const words = name.toLowerCase().split(/[\s()\-–,_/]+/).filter(Boolean);
  if (words.some((w) => FEMALE_NAMES.has(w))) return "female";
  if (words.some((w) => MALE_NAMES.has(w))) return "male";
  return null;
}

/** 0 natural, 1 Google, 2 any other voice. */
export function voiceTier(v: VoiceLike): number {
  if (/natural|neural|online/i.test(v.name)) return 0;
  if (/google/i.test(v.name)) return 1;
  return 2;
}

const normLang = (lang: string): string => String(lang ?? "").trim().replace(/_/g, "-").toLowerCase();

/**
 * The best voice of `voices` for `lang` ("en-IN", "gu-IN"), preferring `kind`;
 * null when the browser has none of that language (for English: none of any
 * English). Pure — the order the browser lists voices in never decides, except
 * between two equally good ones.
 */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang: string, kind: VoiceKind = "female"): V | null {
  const want = normLang(lang);
  const base = want.split("-")[0];
  const genderRank = (v: V) => {
    const g = genderOfVoice(v.name);
    return g === kind ? 0 : g === null ? 1 : 2;
  };
  const best = (list: V[]): V | null => {
    let chosen: V | null = null;
    let chosenRank: number[] = [];
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      const rank = [voiceTier(v), genderRank(v), i];
      const k = rank.findIndex((r, j) => r !== chosenRank[j]);
      if (chosen === null || (k >= 0 && rank[k] < chosenRank[k])) {
        chosen = v;
        chosenRank = rank;
      }
    }
    return chosen;
  };
  const exact = voices.filter((v) => normLang(v.lang) === want);
  if (exact.length) return best(exact);
  const sameLanguage = voices.filter((v) => normLang(v.lang).split("-")[0] === base);
  return sameLanguage.length ? best(sameLanguage) : null;
}

function currentVoices(): SpeechSynthesisVoice[] {
  try {
    return isSpeechOutputSupported() ? window.speechSynthesis.getVoices() : [];
  } catch {
    return [];
  }
}

let voicesWait: Promise<SpeechSynthesisVoice[]> | null = null;

/**
 * The browser's voices. Chrome and Edge fill the list a moment after the page
 * loads (and Edge's natural voices later still), so the first ask waits for
 * `voiceschanged` — once, and 1.5 s at most; after that the list is read as it is.
 */
export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  const now = currentVoices();
  if (now.length || !isSpeechOutputSupported()) return Promise.resolve(now);
  if (!voicesWait) {
    voicesWait = new Promise((resolve) => {
      const synth = window.speechSynthesis;
      let done = false;
      let timer = 0;
      const finish = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        try {
          synth.removeEventListener("voiceschanged", finish);
        } catch {
          /* an old browser without it */
        }
        resolve(currentVoices());
      };
      timer = window.setTimeout(finish, timeoutMs);
      try {
        synth.addEventListener("voiceschanged", finish);
      } catch {
        /* the timeout answers instead */
      }
    });
  }
  return voicesWait.then((v) => (v.length ? v : currentVoices()));
}

/** The person's choice of voice (Master Data → Working Hours & Briefing). */
function preferredKind(): VoiceKind {
  try {
    return settingsRepository.get().voiceKind === "male" ? "male" : "female";
  } catch {
    return "female";
  }
}

// ---- speaking with the browser's voice ----

/** One line being said by the browser; cancel() stops it (and says nothing further of it). */
export interface BrowserSpeech {
  cancel: () => void;
}

/** Cut at sentence ends into pieces of about 200 characters: Chrome stops a long utterance part-way by itself. */
function utterancePieces(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 220) return clean ? [clean] : [];
  const out: string[] = [];
  let current = "";
  for (const sentence of clean.split(/(?<=[.!?।…])\s+/)) {
    if (current && current.length + 1 + sentence.length > 220) {
      out.push(current);
      current = sentence;
    } else current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) out.push(current);
  return out;
}

/**
 * Says `text` with the browser's speech: at an everyday rate and pitch, in
 * `voice` when there is one (else the browser's own choice for `lang`). onEnd
 * is called exactly once — when it has been said, failed, been cancelled, or
 * (a browser that never says it has finished) after a generous time. Never throws.
 */
export function speakWithBrowser(text: string, voice: SpeechSynthesisVoice | null, lang: string, onEnd?: () => void): BrowserSpeech | null {
  if (!isSpeechOutputSupported()) return null;
  const pieces = utterancePieces(text);
  if (!pieces.length) return null;
  let ended = false;
  let watchdog = 0;
  const end = () => {
    if (ended) return;
    ended = true;
    window.clearTimeout(watchdog);
    try {
      onEnd?.();
    } catch {
      /* a caller's slip never reaches the page */
    }
  };
  try {
    const synth = window.speechSynthesis;
    pieces.forEach((piece, i) => {
      const u = new SpeechSynthesisUtterance(piece);
      u.lang = voice?.lang || lang;
      try {
        if (voice) u.voice = voice;
      } catch {
        /* not a voice this browser accepts: its own choice for the language */
      }
      u.rate = 1;
      u.pitch = 1;
      u.volume = 1;
      u.onerror = end;
      if (i === pieces.length - 1) u.onend = end;
      synth.speak(u);
    });
    // About 14 characters a second, and some room; a minute and a half at most.
    watchdog = window.setTimeout(end, Math.min(90_000, 5000 + text.length * 90));
  } catch {
    end();
    return null;
  }
  return {
    cancel: () => {
      if (ended) return;
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* nothing was speaking */
      }
      end();
    },
  };
}

// ---- Mitra's spoken replies ----

// Something else that speaks (utils/voice.ts — the reminders and the briefing)
// is told when a reply starts or speech is stopped, so the two never talk over
// each other: a reply is what the person just asked for, and goes first.
const interruptHooks = new Set<() => void>();

/** Called whenever a reply is about to be spoken, or speech is stopped (the microphone about to listen). */
export function onSpeechInterrupt(fn: () => void): () => void {
  interruptHooks.add(fn);
  return () => interruptHooks.delete(fn);
}

function interruptOthers(): void {
  for (const fn of interruptHooks) {
    try {
      fn();
    } catch {
      /* never let one listener stop the rest */
    }
  }
}

let replyGeneration = 0;
let replyActive = false;

/** Whether one of Mitra's replies is being read out right now. */
export function isReplySpeaking(): boolean {
  return replyActive;
}

// Read a reply out loud, in the best voice the browser has for the language
// (pickVoice above) — natural where the browser has one.
//
// WHICH VOICE IS DECIDED BY THE TEXT, not only by the language chosen. A reply
// with no Gujarati letters in it is read with the English voice even when
// Gujarati is chosen: with Google Translate on, the app's own replies are
// written in English (Google translates them on screen, not for the voice),
// and a Gujarati voice reading English words is hard to follow. A reply
// WRITTEN in Gujarati — most of its letters Gujarati — is Gujarati whatever
// the screens are in: Mitra answers in the script it was asked in, so a
// question typed in Gujarati with English chosen gets a Gujarati reply. A
// Gujarati reply on a browser with no Gujarati voice is not read at all — an
// English voice reading Gujarati script is noise (REQUIREMENTS §81). One
// Gujarati name in an English reply does not make it Gujarati.
const GUJARATI_SCRIPT = /[઀-૿]/;

/** Whether `text` is written in Gujarati: Gujarati letters, at least half of all its letters. */
export function writtenInGujarati(text: string): boolean {
  const letters = String(text ?? "").match(/\p{L}/gu) ?? [];
  let gujarati = 0;
  for (const ch of letters) if (GUJARATI_SCRIPT.test(ch)) gujarati += 1;
  return gujarati > 0 && gujarati * 2 >= letters.length;
}

export function speak(text: string, requested: string): void {
  if (!isSpeechOutputSupported() || !text.trim()) return;
  interruptOthers();
  const generation = ++replyGeneration;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* nothing was speaking */
  }
  const asksGujarati = requested.startsWith("gu");
  // Gujarati chosen: any Gujarati letter; otherwise a reply written in Gujarati. Either way a Gujarati voice, or silence.
  const gujarati = GUJARATI_SCRIPT.test(text) && (asksGujarati || writtenInGujarati(text));
  const lang = gujarati ? "gu-IN" : asksGujarati ? "en-IN" : requested;
  replyActive = true;
  loadVoices()
    .then((voices) => {
      if (generation !== replyGeneration) return;
      const voice = pickVoice(voices, lang, preferredKind());
      if (gujarati && !voice) {
        replyActive = false;
        return;
      }
      const spoken = speakWithBrowser(text, voice, lang, () => {
        if (generation === replyGeneration) replyActive = false;
      });
      if (!spoken) replyActive = false;
    })
    .catch(() => {
      replyActive = false;
    });
}

export function stopSpeaking(): void {
  replyGeneration += 1;
  replyActive = false;
  interruptOthers();
  if (!isSpeechOutputSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* nothing was speaking */
  }
}
