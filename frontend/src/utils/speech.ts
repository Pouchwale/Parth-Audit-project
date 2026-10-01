import { settingsRepository } from "../data/repositories/settingsRepository";
import { forTheEar, sentencesOf } from "./earText";

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
//   2. a Google voice (an online one)
//   3. any voice of the language
// and, within each, the person's choice of a female or male voice (by a small
// list of names — Gujarati names are in Gujarati script, so the match is on the
// voice's language and "Natural", never on its name alone). For English these
// come BEFORE the accent (REQUIREMENTS §85): Google's UK English voice before
// Windows' robotic Indian English one, Indian English first among equals.
// Gujarati is only ever a Gujarati voice — Mitra does not read Gujarati with an
// English voice (it says the English line instead, or nothing).
//
// Both Mitra's spoken replies (speak, below) and the reminders and briefing
// (utils/voice.ts) choose with it, and are said the same way (speakWithBrowser:
// text made for the ear, a warm rate, a pause between sentences).

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

/**
 * 0 natural (Edge's "Online (Natural)", any "Neural"), 1 an online voice that
 * is not called natural (Google's — smoother than the desktop ones), 2 a voice
 * installed with the computer (Windows' Heera, David, Zira: the robotic ones).
 */
export function voiceTier(v: VoiceLike & { localService?: boolean }): number {
  if (/natural|neural|online/i.test(v.name)) return 0;
  if (/google/i.test(v.name) || v.localService === false) return 1;
  return 2;
}

const normLang = (lang: string): string => String(lang ?? "").trim().replace(/_/g, "-").toLowerCase();

/** For English: the asked-for country first (en-IN), then British, then American, then any other English. */
function englishLocaleRank(voiceLang: string, want: string): number {
  const l = normLang(voiceLang);
  if (l === want) return 0;
  if (l === "en-in") return 1;
  if (l === "en-gb") return 2;
  if (l === "en-us") return 3;
  return 4;
}

/**
 * The best voice of `voices` for `lang` ("en-IN", "gu-IN"), preferring `kind`;
 * null when the browser has none of that language. Pure — the order the browser
 * lists voices in never decides, except between two equally good ones.
 *
 * ENGLISH (REQUIREMENTS §85): how human the voice sounds comes first, then the
 * person's choice of a female or male voice, then the accent. Chrome on Windows
 * lists the robotic "Microsoft Heera - English (India)" beside Google's online
 * voices; the old picker took any Indian English voice before a better one of
 * another English, so Mitra sounded like a machine where Google UK English was
 * sitting right there. Now: natural (Edge's Neerja or Prabhat) → Google's →
 * a desktop voice, never a robotic one when a better one exists.
 * GUJARATI: only a Gujarati voice (the exact tag, else any "gu"), natural first.
 */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang: string, kind: VoiceKind = "female"): V | null {
  const want = normLang(lang);
  const base = want.split("-")[0];
  const genderRank = (v: V) => {
    const g = genderOfVoice(v.name);
    return g === kind ? 0 : g === null ? 1 : 2;
  };
  const best = (list: V[], rankOf: (v: V, i: number) => number[]): V | null => {
    let chosen: V | null = null;
    let chosenRank: number[] = [];
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      const rank = rankOf(v, i);
      const k = rank.findIndex((r, j) => r !== chosenRank[j]);
      if (chosen === null || (k >= 0 && rank[k] < chosenRank[k])) {
        chosen = v;
        chosenRank = rank;
      }
    }
    return chosen;
  };
  if (base === "en") {
    const english = voices.filter((v) => normLang(v.lang).split("-")[0] === "en");
    return english.length ? best(english, (v, i) => [voiceTier(v), genderRank(v), englishLocaleRank(v.lang, want), i]) : null;
  }
  const byTier = (v: V, i: number) => [voiceTier(v), genderRank(v), i];
  const exact = voices.filter((v) => normLang(v.lang) === want);
  if (exact.length) return best(exact, byTier);
  const sameLanguage = voices.filter((v) => normLang(v.lang).split("-")[0] === base);
  return sameLanguage.length ? best(sameLanguage, byTier) : null;
}

// An online voice (Edge's natural ones, Google's) needs the internet. When one
// fails to start, the browser's installed voices are used for ten minutes —
// asked once, remembered, never an error on the page.
const ONLINE_RESTS_MS = 10 * 60_000;
let onlineFailedAt = 0;

const onlineResting = (): boolean => onlineFailedAt > 0 && Date.now() - onlineFailedAt < ONLINE_RESTS_MS;

/** For the unit tests: online voices trusted again, as on a new page. */
export function resetSpeechForTests(): void {
  onlineFailedAt = 0;
}

function currentVoices(): SpeechSynthesisVoice[] {
  try {
    const all = isSpeechOutputSupported() ? window.speechSynthesis.getVoices() : [];
    return onlineResting() ? all.filter((v) => v.localService !== false) : all;
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

/** The longest piece given to the browser at once: Chrome stops a long utterance part-way by itself. */
const PIECE_CHARS = 220;

/** A sentence longer than a piece: cut at its commas, else between words. */
function cutLong(sentence: string): string[] {
  if (sentence.length <= PIECE_CHARS) return [sentence];
  const out: string[] = [];
  let current = "";
  for (const part of sentence.split(/(?<=[,;:])\s+|\s+/)) {
    if (current && current.length + 1 + part.length > PIECE_CHARS) {
      out.push(current);
      current = part;
    } else current = current ? `${current} ${part}` : part;
  }
  if (current) out.push(current);
  return out;
}

/**
 * The pieces a line is said in. A natural voice keeps its sentences together
 * (it phrases across them like a person, and each piece is a trip to its
 * service), packed up to PIECE_CHARS; any other voice says ONE SENTENCE A
 * PIECE, with a pause between (speakWithBrowser), because a desktop voice runs
 * its sentences together.
 */
export function utterancePieces(text: string, oneSentenceEach = false): string[] {
  const sentences = sentencesOf(text).flatMap(cutLong);
  if (oneSentenceEach) return sentences;
  const out: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + 1 + sentence.length > PIECE_CHARS) {
      out.push(current);
      current = sentence;
    } else current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) out.push(current);
  return out;
}

/**
 * HOW MITRA SOUNDS IN THE BROWSER (REQUIREMENTS §85): a warm, unhurried rate —
 * a touch under the browser's everyday 1, more so for a desktop voice, which is
 * hard to follow at full speed — at its natural pitch, with a breath between
 * sentences where the voice does not make one itself.
 */
export function prosodyFor(voice: (VoiceLike & { localService?: boolean }) | null): { rate: number; pitch: number; pauseMs: number } {
  const tier = voice ? voiceTier(voice) : 2;
  if (tier === 0) return { rate: 0.96, pitch: 1, pauseMs: 0 };
  if (tier === 1) return { rate: 0.94, pitch: 1, pauseMs: 280 };
  return { rate: 0.9, pitch: 1, pauseMs: 320 };
}

/** Whether a voice needs the internet (Edge's natural voices, Google's). */
const isOnlineVoice = (v: SpeechSynthesisVoice | null): boolean => !!v && (v.localService === false || /online|google/i.test(v.name));

/**
 * Says `text` with the browser's speech: made for the ear first (utils/earText.ts
 * — "form F H R 17", "30th September", no symbols read out), in `voice` when
 * there is one (else the browser's own choice for `lang`), at the voice's warm
 * rate with a pause between sentences (prosodyFor). The pieces are said one
 * after another, each when the last has ended. When an online voice fails
 * before a word is said (no internet), the rest is said in the best installed
 * voice and online voices rest for ten minutes. onEnd is called exactly once —
 * when it has been said, failed, been cancelled, or (a browser that never says
 * it has finished) after a generous time. Never throws.
 */
export function speakWithBrowser(text: string, voice: SpeechSynthesisVoice | null, lang: string, onEnd?: () => void): BrowserSpeech | null {
  if (!isSpeechOutputSupported()) return null;
  const spoken = forTheEar(text, lang);
  let using = voice;
  let shape = prosodyFor(using);
  const pieces = utterancePieces(spoken, shape.pauseMs > 0);
  if (!pieces.length) return null;
  let ended = false;
  let cancelled = false;
  let next = 0;
  let saidOne = false;
  let fellBack = false;
  let watchdog = 0;
  let pause = 0;
  // Held until the end: Chrome forgets an utterance nobody holds and never says it has ended.
  const held: SpeechSynthesisUtterance[] = [];
  const end = () => {
    if (ended) return;
    ended = true;
    window.clearTimeout(watchdog);
    window.clearTimeout(pause);
    try {
      onEnd?.();
    } catch {
      /* a caller's slip never reaches the page */
    }
  };
  const sayNext = () => {
    if (ended || cancelled) return;
    if (next >= pieces.length) {
      end();
      return;
    }
    const piece = pieces[next++];
    let over = false;
    // A browser that never says this piece has ended: about 11 characters a second, and some room. Per piece,
    // so a long reply is read to its end however long it is. A sentence full of figures is slower than that
    // ("1,248" is five characters and six words): while the browser still says it is speaking, the piece is
    // given as long again, up to four times. Then it counts as said and the NEXT piece is said - only the last
    // piece's time running out ends the reply, never a sentence in the middle of it.
    window.clearTimeout(watchdog);
    const allowed = 5000 + piece.length * 90;
    let waits = 0;
    const expire = () => {
      if (over || ended || cancelled) return;
      waits += 1;
      let speaking = false;
      try {
        speaking = window.speechSynthesis.speaking === true;
      } catch {
        speaking = false;
      }
      if (speaking && waits < 4) {
        watchdog = window.setTimeout(expire, allowed);
        return;
      }
      over = true;
      if (next >= pieces.length) end();
      else sayNext();
    };
    watchdog = window.setTimeout(expire, allowed);
    const u = new SpeechSynthesisUtterance(piece);
    held.push(u);
    u.lang = using?.lang || lang;
    try {
      if (using) u.voice = using;
    } catch {
      /* not a voice this browser accepts: its own choice for the language */
    }
    u.rate = shape.rate;
    u.pitch = shape.pitch;
    u.volume = 1;
    u.onend = () => {
      if (over) return;
      over = true;
      window.clearTimeout(watchdog);
      saidOne = true;
      if (next >= pieces.length) end();
      else pause = window.setTimeout(sayNext, shape.pauseMs);
    };
    u.onerror = (e?: { error?: string }) => {
      if (over) return;
      over = true;
      window.clearTimeout(watchdog);
      const why = e?.error ?? "";
      if (cancelled || why === "canceled" || why === "interrupted") {
        end();
        return;
      }
      if (!saidOne && !fellBack && isOnlineVoice(using)) {
        // No internet for the online voice: the installed voices from now on, this line again with the best of them.
        fellBack = true;
        onlineFailedAt = Date.now();
        using = pickVoice(currentVoices(), lang, preferredKind());
        shape = prosodyFor(using);
        next -= 1;
        pause = window.setTimeout(sayNext, 0);
        return;
      }
      // One piece the browser could not say: the rest are still said.
      if (next >= pieces.length) end();
      else pause = window.setTimeout(sayNext, shape.pauseMs);
    };
    try {
      window.speechSynthesis.speak(u);
    } catch {
      end();
    }
  };
  try {
    sayNext();
  } catch {
    end();
    return null;
  }
  return {
    cancel: () => {
      if (ended) return;
      cancelled = true;
      window.clearTimeout(pause);
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

// The reply being read: a new reply or a stop ends it — its later sentences,
// said one after another, must not come after the new one.
let replyReading: BrowserSpeech | null = null;

function endReplyReading(): void {
  const reading = replyReading;
  replyReading = null;
  reading?.cancel();
}

export function speak(text: string, requested: string): void {
  if (!isSpeechOutputSupported() || !text.trim()) return;
  interruptOthers();
  const generation = ++replyGeneration;
  endReplyReading();
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
      else replyReading = spoken;
    })
    .catch(() => {
      replyActive = false;
    });
}

export function stopSpeaking(): void {
  replyGeneration += 1;
  replyActive = false;
  endReplyReading();
  interruptOthers();
  if (!isSpeechOutputSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* nothing was speaking */
  }
}
