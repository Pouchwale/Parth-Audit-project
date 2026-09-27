// MITRA'S VOICE (REQUIREMENTS §81, frontend/src/utils/voice.ts and speech.ts).
//
// "our bot will also remind with voice like in today briefing it seem to be
// real voice". These tests hold the voice to what makes it sound real and
// behave: the browser's natural voice is chosen over the robotic one it lists
// first (Edge's Neerja over Heera, ધ્વની for Gujarati), the person's choice of a
// female or male voice is kept, Gujarati is never read in an English voice, the
// server's natural voice is used when it answers and forgotten for the session
// when it says it cannot (the Groq terms), nothing is said before the first
// click (the newest two lines wait), nothing over the microphone, a keyed line
// once a day, a low line gives way — and the lines themselves, in English and
// Gujarati, name the person and the document and say why it matters.
// The browser's speech, audio and network are stood in for. Run: npm run test:unit -- voice
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setFeatures } from "../src/engine/features";
import { settingsRepository } from "../src/data/repositories/settingsRepository";
import { todayISO } from "../src/utils/date";
import { resetSoundsForTests, watchFirstGesture } from "../src/utils/sounds";
import { genderOfVoice, isListening, listenForUtterance, pickVoice, speak, voiceTier } from "../src/utils/speech";
import {
  briefingLine,
  cancelPending,
  isSaying,
  nothingDueLine,
  nudgeLine,
  reminderLine,
  resetVoiceForTests,
  say,
  serverVoiceState,
  setMicBusy,
  stopVoice,
  voiceInUse,
} from "../src/utils/voice";
import { VOICE_STRINGS } from "../src/i18n/strings.voice";
import { PURPOSE_MODULES, purposeLine } from "../src/engine/purpose";

// ---- the browser, stood in for ----

interface FakeVoice {
  name: string;
  lang: string;
}
const EDGE: FakeVoice[] = [
  { name: "Microsoft Heera - English (India)", lang: "en-IN" },
  { name: "Microsoft Ravi - English (India)", lang: "en-IN" },
  { name: "Microsoft David - English (United States)", lang: "en-US" },
  { name: "Microsoft Neerja Online (Natural) - English (India)", lang: "en-IN" },
  { name: "Microsoft Prabhat Online (Natural) - English (India)", lang: "en-IN" },
  { name: "Microsoft ધ્વની Online (Natural) - Gujarati (India)", lang: "gu-IN" },
  { name: "Microsoft નિરંજન Online (Natural) - Gujarati (India)", lang: "gu-IN" },
  { name: "Microsoft स्वरा Online (Natural) - Hindi (India)", lang: "hi-IN" },
];
const CHROME: FakeVoice[] = [
  { name: "Microsoft David - English (United States)", lang: "en-US" },
  { name: "Microsoft Heera - English (India)", lang: "en-IN" },
  { name: "Microsoft Ravi - English (India)", lang: "en-IN" },
  { name: "Google हिन्दी", lang: "hi-IN" },
];

class FakeUtterance {
  text: string;
  lang = "";
  voice: FakeVoice | null = null;
  rate = 0;
  pitch = 0;
  volume = 0;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

const synth = {
  voices: EDGE as FakeVoice[],
  spoken: [] as FakeUtterance[],
  cancelled: 0,
  speaking: false,
  getVoices() {
    return this.voices;
  },
  speak(u: FakeUtterance) {
    this.spoken.push(u);
    setTimeout(() => u.onend?.(), 5);
  },
  cancel() {
    this.cancelled += 1;
  },
  addEventListener() {},
  removeEventListener() {},
};

const played: string[] = [];
let playFails = false;
class FakeAudio {
  src: string;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(src: string) {
    this.src = src;
  }
  play() {
    if (playFails) return Promise.reject(new Error("NotAllowedError"));
    played.push(this.src);
    setTimeout(() => this.onended?.(), 5);
    return Promise.resolve();
  }
  pause() {}
}

const g = globalThis as unknown as Record<string, unknown>;
g.speechSynthesis = synth;
g.SpeechSynthesisUtterance = FakeUtterance;
g.Audio = FakeAudio;

const fetches: { url: string; body: Record<string, unknown> }[] = [];
let answer: () => Response = () => new Response("{}", { status: 500 });
g.fetch = async (url: unknown, init?: RequestInit) => {
  fetches.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
  return answer();
};
const wavAnswer = () => new Response(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]), { status: 200, headers: { "content-type": "audio/wav" } });
const unavailableAnswer = () =>
  new Response(JSON.stringify({ error: "Mitra's natural voice needs the Groq organisation's admin to accept the model's terms at console.groq.com (canopylabs/orpheus-v1-english).", code: "voice-unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const click = () => {
  watchFirstGesture();
  window.dispatchEvent(new Event("pointerdown"));
};
const said = () => synth.spoken.map((u) => u.text);
const GUJARATI = /[઀-૿]/;

beforeEach(() => {
  resetVoiceForTests();
  resetSoundsForTests();
  synth.voices = EDGE;
  synth.spoken = [];
  synth.cancelled = 0;
  played.length = 0;
  playFails = false;
  fetches.length = 0;
  answer = () => new Response("{}", { status: 500 });
  setFeatures({ assistant: false });
  try {
    sessionStorage.clear();
  } catch {
    /* none */
  }
  settingsRepository.update({ voiceKind: "female", spokenToday: { date: "", keys: [] } });
});

// ---- choosing the voice ----

test("the natural voice is chosen over the robotic one the browser lists first, in the voice asked for", () => {
  assert.equal(pickVoice(EDGE, "en-IN", "female")?.name, "Microsoft Neerja Online (Natural) - English (India)");
  assert.equal(pickVoice(EDGE, "en-IN", "male")?.name, "Microsoft Prabhat Online (Natural) - English (India)");
  assert.equal(pickVoice(EDGE, "gu-IN", "female")?.name, "Microsoft ધ્વની Online (Natural) - Gujarati (India)");
  assert.equal(pickVoice(EDGE, "gu-IN", "male")?.name, "Microsoft નિરંજન Online (Natural) - Gujarati (India)");
  assert.equal(genderOfVoice("Microsoft ધ્વની Online (Natural) - Gujarati (India)"), "female", "a Gujarati name in Gujarati script");
  assert.equal(genderOfVoice("Google UK English Male"), "male");
  assert.equal(voiceTier({ name: "Microsoft Neerja Online (Natural) - English (India)", lang: "en-IN" }), 0);
  assert.equal(voiceTier({ name: "Google US English", lang: "en-US" }), 1);
  assert.equal(voiceTier({ name: "Microsoft Heera - English (India)", lang: "en-IN" }), 2);
});

test("without a natural voice: a Google one, then any of the language; English falls back to any English; Gujarati never does", () => {
  assert.equal(pickVoice(CHROME, "en-IN", "female")?.name, "Microsoft Heera - English (India)");
  assert.equal(pickVoice(CHROME, "en-IN", "male")?.name, "Microsoft Ravi - English (India)");
  assert.equal(pickVoice(CHROME, "gu-IN", "female"), null, "no Gujarati voice — and not the Hindi one");
  const noIndian = [
    { name: "Microsoft David - English (United States)", lang: "en-US" },
    { name: "Google UK English Female", lang: "en-GB" },
  ];
  assert.equal(pickVoice(noIndian, "en-IN", "female")?.name, "Google UK English Female");
  assert.equal(pickVoice([{ name: "Some voice", lang: "gu" }], "gu-IN")?.name, "Some voice", "a Gujarati voice that says only 'gu'");
  assert.equal(pickVoice([], "en-IN"), null);
});

// ---- saying ----

test("before the first click nothing is said; the newest two lines wait and are said at the click", async () => {
  say({ text: "One.", lang: "en" });
  say({ text: "Two.", lang: "en" });
  say({ text: "Three.", lang: "en" });
  await wait(350);
  assert.deepEqual(said(), [], "a browser plays nothing before the first gesture");
  assert.equal(isSaying("One."), false, "only the newest two are kept");
  assert.equal(isSaying("Three."), true);
  click();
  await wait(700);
  assert.deepEqual(said(), ["Two.", "Three."]);
});

test("the browser's best voice, at an everyday rate and pitch; the male voice when chosen", async () => {
  click();
  say({ text: "Good morning.", lang: "en" });
  await wait(400);
  const u = synth.spoken[0];
  assert.equal(u?.voice?.name, "Microsoft Neerja Online (Natural) - English (India)");
  assert.equal(u.rate, 1);
  assert.equal(u.pitch, 1);
  settingsRepository.update({ voiceKind: "male" });
  say({ text: "Good evening.", lang: "en" });
  await wait(400);
  assert.equal(synth.spoken[1]?.voice?.name, "Microsoft Prabhat Online (Natural) - English (India)");
});

test("Gujarati in a Gujarati voice; with none, the English line — or nothing, never Gujarati in an English voice", async () => {
  click();
  say({ text: "સુપ્રભાત, હીના.", lang: "gu", en: "Good morning, Heena." });
  await wait(400);
  assert.equal(synth.spoken[0]?.text, "સુપ્રભાત, હીના.");
  assert.equal(synth.spoken[0]?.voice?.lang, "gu-IN");

  synth.voices = CHROME;
  synth.spoken = [];
  say({ text: "શુભ સાંજ, હીના.", lang: "gu", en: "Good evening, Heena." });
  await wait(400);
  assert.deepEqual(said(), ["Good evening, Heena."]);
  assert.equal(synth.spoken[0]?.voice?.lang, "en-IN");

  synth.spoken = [];
  say({ text: "નમસ્કાર.", lang: "gu" });
  await wait(400);
  assert.deepEqual(said(), [], "no English line to say instead: silence");
});

test("a line with a key is said once a day", async () => {
  click();
  say({ text: "The briefing.", lang: "en", key: "briefing:morning:test" });
  await wait(400);
  assert.equal(settingsRepository.doneToday("spokenToday", todayISO(), "briefing:morning:test"), true);
  say({ text: "The briefing.", lang: "en", key: "briefing:morning:test" });
  say({ text: "The briefing, reworded.", lang: "en", key: "briefing:morning:test" });
  await wait(400);
  assert.deepEqual(said(), ["The briefing."]);
});

test("never over the microphone: nothing starts while it listens or records, and it goes on after", async () => {
  click();
  setMicBusy(true);
  say({ text: "A reminder.", lang: "en" });
  await wait(1000);
  assert.deepEqual(said(), []);
  setMicBusy(false);
  await wait(500);
  assert.deepEqual(said(), ["A reminder."]);

  // The browser's own recognition (speech.ts listenForUtterance) counts as listening.
  class FakeRecognition {
    lang = "";
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onresult = null;
    onerror = null;
    onend = null;
    start() {}
    stop() {}
    abort() {}
  }
  g.SpeechRecognition = FakeRecognition;
  const session = listenForUtterance({ lang: "en-IN", onFinal: () => undefined });
  assert.equal(isListening(), true);
  say({ text: "Another.", lang: "en" });
  await wait(1000);
  assert.deepEqual(said(), ["A reminder."]);
  session?.cancel();
  assert.equal(isListening(), false);
  await wait(1100);
  assert.deepEqual(said(), ["A reminder.", "Another."]);
});

test("a low line gives way; a high one goes first; lines that arrive together are sorted first", async () => {
  click();
  say({ text: "The day's notification.", lang: "en", priority: "low" });
  say({ text: "The briefing.", lang: "en" });
  say({ text: "All done!", lang: "en", priority: "high" });
  await wait(700);
  assert.deepEqual(said(), ["All done!", "The briefing."], "the low one gave way to what came with it");
});

test("stopping: everything waiting is dropped; a closed briefing drops only its own line", async () => {
  click();
  say({ text: "First.", lang: "en" });
  say({ text: "Second.", lang: "en" });
  cancelPending("Second.");
  await wait(500);
  assert.deepEqual(said(), ["First."]);
  say({ text: "Third.", lang: "en" });
  stopVoice();
  await wait(400);
  assert.deepEqual(said(), ["First."]);
  assert.equal(isSaying(), false);
});

test("Mitra's replies use the same picker: natural, and no Gujarati in an English voice", async () => {
  speak("Here is today's list.", "en-IN");
  await wait(50);
  assert.equal(synth.spoken[0]?.voice?.name, "Microsoft Neerja Online (Natural) - English (India)");
  synth.voices = CHROME;
  synth.spoken = [];
  speak("આજની યાદી.", "gu-IN");
  await wait(50);
  assert.deepEqual(said(), []);
  speak("Written in English with Gujarati chosen.", "gu-IN");
  await wait(50);
  assert.equal(synth.spoken[0]?.voice?.lang, "en-IN");
});

// ---- the server's natural voice ----

test("with a key, English is said in the server's natural voice", async () => {
  setFeatures({ assistant: true });
  answer = wavAnswer;
  click();
  say({ text: "Your score is 92%.", lang: "en" });
  await wait(500);
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].url, "/api/assistant/speak");
  assert.deepEqual(fetches[0].body, { text: "Your score is 92%.", voice: "female" });
  assert.equal(played.length, 1, "the WAV was played");
  assert.deepEqual(said(), [], "and the browser's voice was not used");
  assert.equal(serverVoiceState().state, "available");
  assert.equal((await voiceInUse()).source, "server");
});

test("503 voice-unavailable (the Groq terms): the browser's voice, and the server not asked again this session", async () => {
  setFeatures({ assistant: true });
  answer = unavailableAnswer;
  click();
  say({ text: "First line.", lang: "en" });
  await wait(500);
  assert.equal(fetches.length, 1);
  assert.deepEqual(said(), ["First line."], "fell back to the browser's natural voice");
  assert.equal(synth.spoken[0]?.voice?.name, "Microsoft Neerja Online (Natural) - English (India)");
  assert.equal(serverVoiceState().state, "voice-unavailable");
  assert.match(serverVoiceState().message, /accept the model's terms/);
  assert.match(sessionStorage.getItem("dcrs:voice-server") ?? "", /voice-unavailable/, "remembered for the session");
  say({ text: "Second line.", lang: "en" });
  await wait(500);
  assert.equal(fetches.length, 1, "not asked again");
  assert.deepEqual(said(), ["First line.", "Second line."]);
  assert.equal((await voiceInUse()).source, "natural");
});

test("an audio clip the browser will not play falls back to the browser's voice; Gujarati never goes to the server", async () => {
  setFeatures({ assistant: true });
  answer = wavAnswer;
  playFails = true;
  click();
  say({ text: "Blocked clip.", lang: "en" });
  await wait(500);
  assert.deepEqual(said(), ["Blocked clip."]);
  fetches.length = 0;
  say({ text: "ગુજરાતી લાઇન.", lang: "gu", en: "A Gujarati line." });
  await wait(500);
  assert.equal(fetches.length, 0);
  assert.equal(synth.spoken[1]?.text, "ગુજરાતી લાઇન.");
});

// ---- the words ----

test("the spoken reminder: the first name, the document, how late or due today, the score when known, why it matters", () => {
  const base = { firstName: "Heena", documentName: "Line Clearance Checklist", daysUntilDue: 0, score: 92, module: "Quality Control — Inspection Records", seed: "rec-1|2026-09-27" };
  const today = reminderLine(base, "en");
  assert.match(today, /^Heena, the Line Clearance Checklist is due today\. /);
  assert.match(today, /92%/);
  assert.ok(today.endsWith(purposeLine(base.module, "en", base.seed)), "ends with why the record matters");
  const late = reminderLine({ ...base, daysUntilDue: -3, score: null }, "en");
  assert.match(late, /is 3 days late\./);
  assert.doesNotMatch(late, /%/, "no score when it is not known");
  assert.match(reminderLine({ ...base, daysUntilDue: -1 }, "en"), /is a day late\./);
  assert.match(reminderLine({ ...base, firstName: "" }, "en"), /^The Line Clearance Checklist is due today\./);
  const gu = reminderLine(base, "gu");
  assert.match(gu, /^Heena, Line Clearance Checklist આજે ભરવાનું છે\./);
  assert.ok(GUJARATI.test(gu) && gu.includes("92%"));
  // Different records read differently.
  const nudges = new Set(Array.from({ length: 12 }, (_, i) => reminderLine({ ...base, seed: `rec-${i}` }, "en").split(". ")[1]));
  assert.ok(nudges.size >= 2, "more than one way of saying it");
});

test("the spoken briefing: the greeting and name, what is waiting, the first two things, why it matters", () => {
  const facts = { firstName: "Heena", slot: "morning" as const, hour: 9, ready: 3, needsInput: 1, overdue: 2, awaiting: 0, top: ["Adhesive Mixing Record", "Line Clearance Checklist", "Third"], module: "Lamination — Quality Control", seed: "d" };
  const en = briefingLine(facts, "en");
  assert.match(en, /^Good morning, Heena\. You have 3 filled in and ready for your OK, 1 needing a detail only you know and 2 still open from earlier\. /);
  assert.match(en, /Start with the Adhesive Mixing Record, then the Line Clearance Checklist\./);
  assert.doesNotMatch(en, /Third/, "two things at most");
  assert.ok(en.endsWith(purposeLine(facts.module, "en", facts.seed)));
  assert.match(briefingLine({ ...facts, slot: "evening", hour: 17 }, "en"), /^Before you go, Heena\./);
  assert.match(briefingLine({ ...facts, hour: 14 }, "en"), /^Good afternoon/);
  const clear = briefingLine({ ...facts, ready: 0, needsInput: 0, overdue: 0, top: [], module: undefined }, "en");
  assert.match(clear, /Everything is up to date/);
  const gu = briefingLine(facts, "gu");
  assert.match(gu, /^સુપ્રભાત, Heena\./);
  assert.match(gu, /પહેલાં Adhesive Mixing Record કરો, પછી Line Clearance Checklist\./);
});

test("the day's notification and 'nothing is due', in both languages", () => {
  assert.equal(nothingDueLine("Heena", "en", "s").startsWith("Nothing is due — well done, Heena."), true);
  assert.equal(nothingDueLine("", "gu", "s").startsWith("કંઈ બાકી નથી — શાબાશ!"), true);
  const facts = { firstName: "Heena", total: 5, overdue: 2, high: 3, theirOwn: true };
  assert.equal(nudgeLine(facts, "en"), "Heena, you have 2 late and 3 more due today. Let's clear them.");
  assert.match(nudgeLine(facts, "gu"), /^Heena, 2 દસ્તાવેજ મોડા છે અને બીજા 3 આજે ભરવાના છે\./);
  assert.match(nudgeLine({ ...facts, overdue: 0 }, "en"), /you have 5 waiting today, 3 of them high priority\./);
  assert.match(nudgeLine({ ...facts, total: 0, overdue: 0 }, "en"), /^Nothing is waiting for you today, Heena — every one/);
});

test("every spoken line has Gujarati words of its own; every module has a line on why it matters", () => {
  const spokenKeys = Object.keys(VOICE_STRINGS.en).filter((k) => /^voice\.(remind|nudge|nothingDue|brief|sample)/.test(k) && k !== "voice.brief.and");
  for (const k of spokenKeys) {
    const gu = (VOICE_STRINGS.gu as Record<string, string>)[k];
    assert.ok(gu && GUJARATI.test(gu), `${k} is in Gujarati`);
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    assert.equal(holes(gu), holes((VOICE_STRINGS.en as Record<string, string>)[k]), `${k} fills the same blanks`);
  }
  assert.ok(PURPOSE_MODULES.length >= 10);
});
