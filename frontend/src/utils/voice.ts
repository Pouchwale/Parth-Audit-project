// MITRA SPEAKS (REQUIREMENTS §81).
//
// "our bot will also remind with voice like in today briefing it seem to be
// real voice so if user heard it look like some one is telling them to
// complete task fast for good score."
//
// One queue for everything Mitra says aloud that is not a reply in the chat —
// the spoken reminder, the briefing, the day's notification, the praise when
// everything is done. Asked for through engine/engageBus.ts (emitSay), taken in
// by components/common/SoundVoiceHost.tsx (which checks the person has the
// voice switched on) and said here:
//
//   ENGLISH, when the server has a Groq key: Mitra's natural voice, made on
//     the server (POST /api/assistant/speak → one WAV, played with an <audio>).
//     A 503 "voice-unavailable" (the Groq organisation has not accepted the
//     speech model's terms) or "not-configured" is remembered for the browser
//     session and the browser's voice is used from then on; any other failure
//     uses the browser's voice for five minutes.
//   OTHERWISE, and for Gujarati: the browser's best voice (utils/speech.ts
//     pickVoice — Edge's natural Neerja/Prabhat, ધ્વની/નિરંજન). A Gujarati line on
//     a browser with no Gujarati voice is said in English (`en`), or not at all:
//     Mitra never reads Gujarati with an English voice.
//
// RULES THE QUEUE KEEPS
//   - Before the page has been clicked or typed in, a browser plays nothing:
//     the newest two lines wait and are said at the first click or key.
//   - Never over the person: nothing starts while the microphone listens
//     (speech.ts isListening, or setMicBusy from Mitra's recorder), or while one
//     of Mitra's chat replies is being read; a reply cuts off a line in progress.
//   - A line with a `key` is said at most once a day (settings.spokenToday).
//   - "high" goes to the front and cuts off a "low" one; a "low" one is dropped
//     when something else is waiting; lines that arrive together are sorted
//     before the first is said, so the day's notification does not talk over
//     the briefing that opened with it.
//   - Nothing waits for ever: a line not said within a minute is dropped.
//   - Never an error: every play, fetch and speech call is wrapped.
//
// The words themselves (the reminder, the briefing, the day's notification,
// "nothing is due") are made by the pure functions at the end, in English and
// Gujarati, so a test can read them without a browser.

import type { SayRequest } from "../engine/engageBus";
import { assistantConfigured } from "../engine/features";
import { generalPurposeLine, purposeLine } from "../engine/purpose";
import { gapScoreLine } from "../engine/motivation";
import { assistantApi, ApiError } from "../api/client";
import { settingsRepository, type AppSettings } from "../data/repositories/settingsRepository";
import { STRINGS, type Language } from "../i18n/strings";
import { todayISO } from "./date";
import { hadUserGesture, onFirstGesture } from "./sounds";
import { isListening, isReplySpeaking, isSpeechOutputSupported, loadVoices, onSpeechInterrupt, pickVoice, speakWithBrowser, voiceTier, type VoiceKind } from "./speech";

/** Fired on window when the sound or voice settings change (the top bar's button, Master Data, the reminder's mute). */
export const VOICE_SETTINGS_EVENT = "dcrs:voice-settings";

/** What is known of the server's natural voice this browser session. */
export type ServerVoiceState = "unknown" | "available" | "voice-unavailable" | "not-configured";

/** How long lines that arrive together are gathered before the first is said. */
const GATHER_MS = 250;
/** How often a blocked queue looks again (microphone, a reply being read). */
const RETRY_MS = 800;
/** A line not said within this long is dropped: a reminder a minute late is noise. */
const MAX_WAIT_MS = 60_000;
/** The server's own limit on one line (backend/tts.ts TTS_MAX_TEXT_CHARS). */
const SERVER_MAX_CHARS = 600;
/** After an ordinary server failure, the browser's voice is used for this long. */
const SERVER_RETRY_AFTER_MS = 5 * 60_000;
const SESSION_KEY = "dcrs:voice-server";

interface Item {
  req: SayRequest;
  at: number;
}

interface Speaking {
  item: Item;
  stopped: boolean;
  stops: (() => void)[];
  stop: () => void;
}

let pending: Item[] = [];
let pendingHook: (() => void) | null = null;
let queue: Item[] = [];
let current: Speaking | null = null;
let timer = 0;
let micBusy = false;
let serverFailedUntil = 0;
let server: { state: ServerVoiceState; message: string } = readServerState();
const listeners = new Set<() => void>();

function readServerState(): { state: ServerVoiceState; message: string } {
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_KEY) : null;
    const parsed = raw ? (JSON.parse(raw) as { state?: unknown; message?: unknown }) : null;
    if (parsed && (parsed.state === "voice-unavailable" || parsed.state === "not-configured")) {
      return { state: parsed.state, message: typeof parsed.message === "string" ? parsed.message : "" };
    }
  } catch {
    /* private window, blocked storage: ask the server again */
  }
  return { state: "unknown", message: "" };
}

function setServerState(state: ServerVoiceState, message = ""): void {
  if (server.state === state && server.message === message) return;
  server = { state, message };
  try {
    if (state === "voice-unavailable" || state === "not-configured") sessionStorage.setItem(SESSION_KEY, JSON.stringify(server));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* remembered for this page only */
  }
  notify();
}

function notify(): void {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      /* a listener's slip never stops the voice */
    }
  }
}

/** Calls `fn` whenever something is started, finished or dropped, or the server's voice is found out. */
export function onVoiceChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** What is known of the natural server voice, and — when it is unavailable — the server's words on why. */
export function serverVoiceState(): { state: ServerVoiceState; message: string } {
  return server;
}

const priorityOf = (req: SayRequest): number => (req.priority === "high" ? 0 : req.priority === "low" ? 2 : 1);
const sameLine = (a: SayRequest, b: SayRequest): boolean => a.text === b.text || (!!a.key && a.key === b.key);

function voiceKind(): VoiceKind {
  try {
    return settingsRepository.get().voiceKind === "male" ? "male" : "female";
  } catch {
    return "female";
  }
}

// ---- asking -------------------------------------------------------------------------

/**
 * Says a line (see the header for the rules). Whether the person wants the
 * voice at all is the caller's question — the host checks settings.voiceOn; a
 * button the person pressed (Hear Mitra, the briefing's 🔊) calls this directly.
 */
export function say(req: SayRequest): void {
  try {
    if (!req || typeof req.text !== "string" || !req.text.trim()) return;
    if (req.key && settingsRepository.doneToday("spokenToday", todayISO(), req.key)) return;
    const item: Item = { req, at: Date.now() };
    if (!hadUserGesture()) {
      if (pending.some((p) => sameLine(p.req, req))) return;
      pending = [...pending, item].slice(-2);
      if (!pendingHook) pendingHook = onFirstGesture(flushPending);
      notify();
      return;
    }
    enqueue(item);
  } catch {
    /* a line is never worth an error */
  }
}

function flushPending(): void {
  pendingHook = null;
  // The more important first, so a low one gives way to what came with it.
  const waiting = [...pending].sort((a, b) => priorityOf(a.req) - priorityOf(b.req));
  pending = [];
  for (const item of waiting) enqueue({ ...item, at: Date.now() });
}

function enqueue(item: Item): void {
  const p = priorityOf(item.req);
  if (queue.some((q) => sameLine(q.req, item.req)) || (current && !current.stopped && sameLine(current.item.req, item.req))) return;
  if (p === 2) {
    if (current || queue.length) return;
    queue.push(item);
  } else {
    queue = queue.filter((q) => priorityOf(q.req) !== 2);
    if (p === 0) {
      queue.unshift(item);
      if (current && priorityOf(current.item.req) === 2) current.stop();
    } else queue.push(item);
  }
  notify();
  pump(GATHER_MS);
}

function pump(delay: number): void {
  if (current || timer || typeof window === "undefined") return;
  if (!queue.length) return;
  timer = window.setTimeout(() => {
    timer = 0;
    startNext();
  }, delay);
}

function othersSpeaking(): boolean {
  if (micBusy || isListening() || isReplySpeaking()) return true;
  try {
    return isSpeechOutputSupported() && window.speechSynthesis.speaking;
  } catch {
    return false;
  }
}

function startNext(): void {
  if (current) return;
  const now = Date.now();
  const before = queue.length;
  queue = queue.filter((i) => now - i.at < MAX_WAIT_MS);
  if (!queue.length) {
    if (before) notify();
    return;
  }
  if (othersSpeaking()) {
    pump(RETRY_MS);
    return;
  }
  const item = queue.shift()!;
  const today = todayISO();
  if (item.req.key) {
    if (settingsRepository.doneToday("spokenToday", today, item.req.key)) {
      notify();
      pump(0);
      return;
    }
    settingsRepository.markDoneToday("spokenToday", today, item.req.key);
  }
  const speaking: Speaking = {
    item,
    stopped: false,
    stops: [],
    stop: () => {
      if (speaking.stopped) return;
      speaking.stopped = true;
      for (const fn of speaking.stops.splice(0)) {
        try {
          fn();
        } catch {
          /* already stopped */
        }
      }
    },
  };
  current = speaking;
  notify();
  speakItem(speaking)
    .catch(() => undefined)
    .then(() => {
      if (current === speaking) current = null;
      notify();
      pump(GATHER_MS);
    });
}

// ---- saying one line ----------------------------------------------------------------

function onStop(speaking: Speaking, fn: () => void): void {
  if (speaking.stopped) fn();
  else speaking.stops.push(fn);
}

function useServer(): boolean {
  return assistantConfigured() && server.state !== "voice-unavailable" && server.state !== "not-configured" && Date.now() >= serverFailedUntil;
}

async function speakItem(speaking: Speaking): Promise<void> {
  const { req } = speaking.item;
  const kind = voiceKind();
  let text = req.text;
  if (req.lang === "gu") {
    const voices = await loadVoices();
    if (speaking.stopped) return;
    const gujarati = pickVoice(voices, "gu-IN", kind);
    if (gujarati) return speakBrowser(speaking, text, gujarati, "gu-IN");
    // No Gujarati voice: the English line, or nothing.
    if (!req.en || !req.en.trim()) return;
    text = req.en;
  }
  if (useServer() && (await speakServer(speaking, text, kind))) return;
  if (speaking.stopped) return;
  const voices = await loadVoices();
  if (speaking.stopped) return;
  return speakBrowser(speaking, text, pickVoice(voices, "en-IN", kind), "en-IN");
}

function speakBrowser(speaking: Speaking, text: string, voice: SpeechSynthesisVoice | null, lang: string): Promise<void> {
  return new Promise((resolve) => {
    const spoken = speakWithBrowser(text, voice, lang, () => resolve());
    if (!spoken) {
      resolve();
      return;
    }
    onStop(speaking, () => spoken.cancel());
  });
}

/** The first 600 characters, cut at a sentence's end where there is one. */
function forServer(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= SERVER_MAX_CHARS) return clean;
  const cut = clean.slice(0, SERVER_MAX_CHARS);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 200 ? cut.slice(0, end + 1) : cut;
}

/** True when the line was said (or stopped) with the server's voice; false to use the browser's. */
async function speakServer(speaking: Speaking, text: string, kind: VoiceKind): Promise<boolean> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  onStop(speaking, () => controller?.abort());
  let clip: Blob;
  try {
    clip = await assistantApi.speak(forServer(text), kind, controller?.signal);
  } catch (err) {
    if (speaking.stopped) return true;
    if (err instanceof ApiError && (err.code === "voice-unavailable" || err.code === "not-configured")) setServerState(err.code, err.message);
    else serverFailedUntil = Date.now() + SERVER_RETRY_AFTER_MS;
    return false;
  }
  if (speaking.stopped) return true;
  setServerState("available");
  return new Promise<boolean>((resolve) => {
    let done = false;
    let url = "";
    let audio: HTMLAudioElement | null = null;
    let watchdog = 0;
    const finish = (said: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(watchdog);
      try {
        audio?.pause();
      } catch {
        /* not playing */
      }
      try {
        if (url) URL.revokeObjectURL(url);
      } catch {
        /* already gone */
      }
      resolve(said);
    };
    try {
      url = URL.createObjectURL(clip);
      audio = new Audio(url);
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      onStop(speaking, () => finish(true));
      watchdog = window.setTimeout(() => finish(true), Math.min(90_000, 8000 + text.length * 90));
      const playing = audio.play();
      if (playing && typeof playing.catch === "function") playing.catch(() => finish(false));
    } catch {
      finish(false);
    }
  });
}

// ---- stopping -----------------------------------------------------------------------

/** Stops what is being said and forgets everything waiting. */
export function stopVoice(): void {
  queue = [];
  pending = [];
  pendingHook?.();
  pendingHook = null;
  if (timer) {
    window.clearTimeout(timer);
    timer = 0;
  }
  current?.stop();
  notify();
}

/** Drops a line that has not started yet (the briefing closed before it was read); one already being said goes on. */
export function cancelPending(text: string): void {
  const q = queue.length;
  const p = pending.length;
  queue = queue.filter((i) => i.req.text !== text);
  pending = pending.filter((i) => i.req.text !== text);
  if (q !== queue.length || p !== pending.length) notify();
}

/** Stops this line, whether it is being said or still waiting. */
export function stopLine(text: string): void {
  cancelPending(text);
  if (current && current.item.req.text === text) current.stop();
}

/** Whether this line is being said or waiting to be; with no text, whether anything is. */
export function isSaying(text?: string): boolean {
  const all = [...(current && !current.stopped ? [current.item] : []), ...queue, ...pending];
  return text === undefined ? all.length > 0 : all.some((i) => i.req.text === text);
}

/**
 * The microphone is recording (Mitra's composer, while a Whisper recording
 * runs): what is being said stops, and nothing starts until it is false again.
 */
export function setMicBusy(busy: boolean): void {
  micBusy = !!busy;
  if (micBusy) {
    current?.stop();
    return;
  }
  // Free again: look now, not at the next retry.
  if (timer) {
    window.clearTimeout(timer);
    timer = 0;
  }
  pump(GATHER_MS);
}

/** Whether Mitra must stay quiet for the microphone. */
export function isMicBusy(): boolean {
  return micBusy || isListening();
}

// A chat reply about to be read, or speech stopped for the microphone: the line in progress stops.
onSpeechInterrupt(() => current?.stop());

// ---- the settings ---------------------------------------------------------------------

type VoiceSettings = Pick<AppSettings, "soundsOn" | "voiceOn" | "voiceKind" | "remindEveryMin">;

/** Changes the sound and voice settings, tells every control showing them, and hushes Mitra when the voice goes off. */
export function updateVoiceSettings(patch: Partial<VoiceSettings>): void {
  try {
    settingsRepository.update(patch);
  } catch {
    /* the store is full: the switch still takes effect for now below */
  }
  if (patch.voiceOn === false) stopVoice();
  try {
    window.dispatchEvent(new Event(VOICE_SETTINGS_EVENT));
  } catch {
    /* nobody listening */
  }
  notify();
}

export type VoiceSource = "server" | "server-untested" | "natural" | "basic" | "none";

/**
 * Which voice Mitra's English lines are said with here, for the settings card:
 * the server's natural voice, the browser's natural voice (Edge), a basic
 * browser voice, or none. Also whether the browser has a Gujarati voice.
 */
export async function voiceInUse(): Promise<{ source: VoiceSource; name: string; gujarati: boolean }> {
  let voices: SpeechSynthesisVoice[] = [];
  try {
    voices = await loadVoices();
  } catch {
    voices = [];
  }
  const kind = voiceKind();
  const gujarati = !!pickVoice(voices, "gu-IN", kind);
  if (assistantConfigured() && server.state === "available") return { source: "server", name: "", gujarati };
  if (useServer()) return { source: "server-untested", name: "", gujarati };
  const english = pickVoice(voices, "en-IN", kind);
  if (!english) return { source: "none", name: "", gujarati };
  return { source: voiceTier(english) === 0 ? "natural" : "basic", name: english.name, gujarati };
}

// ---- the words ----------------------------------------------------------------------

function words(lang: Language, key: string, vars?: Record<string, string | number>): string {
  const table = (STRINGS[lang] ?? STRINGS.en) as Record<string, string>;
  const template = table[key] ?? (STRINGS.en as Record<string, string>)[key] ?? key;
  return vars ? template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole)) : template;
}

const capitalise = (s: string): string => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s);

/** "Heena, the …" — or "The …" when there is no name. */
function addressed(firstName: string, rest: string): string {
  return firstName ? `${firstName}, ${rest}` : capitalise(rest);
}

/** A stable pick among `n` variants for a seed. */
export function variant(seed: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % n;
}

export interface ReminderFacts {
  firstName: string;
  /** The document's name as the plant calls it (no format number: it does not read aloud well). */
  documentName: string;
  /** 0 = due today; negative = that many days late. */
  daysUntilDue: number;
  /** Their on-time score this month, when it is known; null leaves the number out. */
  score: number | null;
  /** The document's module, for the line on why it matters. */
  module?: string;
  /**
   * Today's own work, for the day's score said aloud (REQUIREMENTS §81): 8 of 10
   * done is "minus 20 today — finish 2 more to reach zero". Absent → the on-time nudge.
   */
  day?: { done: number; total: number };
  /** The record and the day: the same moment always reads the same way, the next one differently. */
  seed: string;
}

/**
 * THE SPOKEN REMINDER: who, which document, how late or that it is due today,
 * a nudge to finish it now for the on-time score (their score when known) —
 * and why it matters beyond the score (engine/purpose.ts).
 */
export function reminderLine(f: ReminderFacts, lang: Language): string {
  const late = Math.max(0, -Math.round(f.daysUntilDue));
  const intro =
    late === 0 ? words(lang, "voice.remind.today", { doc: f.documentName }) : late === 1 ? words(lang, "voice.remind.lateOne", { doc: f.documentName }) : words(lang, "voice.remind.late", { doc: f.documentName, days: late });
  const kind = late === 0 ? "today" : "late";
  const scored = typeof f.score === "number" && Number.isFinite(f.score);
  // The day's loss-framed score when today's own work is known (8 of 10 → "minus 20"); else the on-time nudge.
  const nudge =
    f.day && f.day.total > 0 && f.day.done < f.day.total
      ? gapScoreLine(f.day.done, f.day.total, lang)
      : words(lang, `voice.nudge.${kind}${scored ? ".score" : ""}.${variant(`${f.seed}|nudge`, 3) + 1}`, scored ? { score: Math.round(f.score as number) } : undefined);
  return `${addressed(f.firstName, intro)} ${nudge} ${purposeLine(f.module, lang, f.seed)}`;
}

/** Said when the person asks what to do next and nothing of theirs is due or late. */
export function nothingDueLine(firstName: string, lang: Language, seed = ""): string {
  const first = firstName ? words(lang, "voice.nothingDueName", { name: firstName }) : words(lang, "voice.nothingDue");
  return `${first} ${generalPurposeLine(lang, seed)}`;
}

export interface BriefingFacts {
  firstName: string;
  /** The briefing's showing: the evening one says "before you go". */
  slot: "first" | "morning" | "evening" | "manual";
  /** The hour of the day (0–23), for good morning / afternoon / evening. */
  hour: number;
  ready: number;
  needsInput: number;
  overdue: number;
  awaiting: number;
  /** The first things to do, by name — two at most are said. */
  top: string[];
  /** The first thing's module, for the line on why it matters. */
  module?: string;
  seed: string;
}

/** THE SPOKEN BRIEFING: a greeting with the first name, what is waiting, the first two things by name, and why it matters. */
export function briefingLine(f: BriefingFacts, lang: Language): string {
  const greetingWord = f.slot === "evening" ? words(lang, "voice.brief.beforeYouGo") : words(lang, f.hour < 12 ? "voice.brief.morning" : f.hour < 17 ? "voice.brief.afternoon" : "voice.brief.evening");
  const greeting = f.firstName ? `${greetingWord}, ${f.firstName}.` : `${greetingWord}.`;
  const parts: string[] = [];
  if (f.ready > 0) parts.push(words(lang, "voice.brief.ready", { n: f.ready }));
  if (f.needsInput > 0) parts.push(words(lang, "voice.brief.needsInput", { n: f.needsInput }));
  if (f.overdue > 0) parts.push(words(lang, "voice.brief.overdue", { n: f.overdue }));
  if (f.awaiting > 0) parts.push(words(lang, "voice.brief.awaiting", { n: f.awaiting }));
  const list = parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")}${words(lang, "voice.brief.and")}${parts[parts.length - 1]}`;
  const headline = parts.length ? words(lang, "voice.brief.have", { list }) : words(lang, "voice.brief.clear");
  const top = f.top.filter(Boolean).slice(0, 2);
  const first = top.length === 2 ? words(lang, "voice.brief.startTwo", { a: top[0], b: top[1] }) : top.length === 1 ? words(lang, "voice.brief.startOne", { a: top[0] }) : "";
  const why = f.module ? purposeLine(f.module, lang, f.seed) : generalPurposeLine(lang, f.seed);
  return [greeting, headline, first, why].filter(Boolean).join(" ");
}

export interface NudgeFacts {
  firstName: string;
  total: number;
  overdue: number;
  high: number;
  theirOwn: boolean;
}

/** The day's notification, spoken — the same counts as its headline (engine/notifications.ts encourage). */
export function nudgeLine(f: NudgeFacts, lang: Language): string {
  if (f.total === 0) return f.theirOwn ? capitalise(words(lang, f.firstName ? "voice.nudge.none.name" : "voice.nudge.none", { name: f.firstName })) : words(lang, "voice.nudge.noneAnywhere");
  const rest = f.total - f.overdue;
  const line =
    f.overdue > 0
      ? rest > 0
        ? words(lang, "voice.nudge.lateAndDue", { late: f.overdue, due: rest })
        : words(lang, "voice.nudge.lateOnly", { late: f.overdue })
      : f.high > 0
        ? words(lang, "voice.nudge.waitingHigh", { n: f.total, high: f.high })
        : words(lang, "voice.nudge.waiting", { n: f.total });
  return addressed(f.firstName, line);
}

/** What "Hear Mitra" says. */
export function sampleLine(firstName: string, lang: Language): string {
  return firstName ? words(lang, "voice.sample.name", { name: firstName }) : words(lang, "voice.sample");
}

/** For the unit test: an empty queue and a fresh session, as a new page would have. */
export function resetVoiceForTests(): void {
  stopVoice();
  micBusy = false;
  serverFailedUntil = 0;
  server = { state: "unknown", message: "" };
}
