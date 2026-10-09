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
// REQUIREMENTS §85 ("it should sound like a human only") adds: in Chrome,
// Google's online voices before Windows' robotic ones (the voice's quality
// before its accent), a warm rate and a pause between sentences for a voice
// that does not make one, an online voice that fails (no internet) giving way to
// an installed one, the words made for the ear ("form F H R 17", "30th
// September", "2:30 PM", no symbols), and the server ASKED ONCE whether it can
// speak (a GET that is always a 200) — never a failed request in the console for
// a voice that is not available.
// The browser's speech, audio and network are stood in for. Run: npm run test:unit -- voice
import test, { beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { setFeatures } from "../src/engine/features";
import { settingsRepository } from "../src/data/repositories/settingsRepository";
import { todayISO } from "../src/utils/date";
import { resetSoundsForTests, watchFirstGesture } from "../src/utils/sounds";
import { forTheEar, ordinal, sentencesOf } from "../src/utils/earText";
import {
  genderOfVoice,
  isListening,
  listenForUtterance,
  pickVoice,
  prosodyFor,
  resetSpeechForTests,
  speak,
  speakWithBrowser,
  stopSpeaking,
  utterancePieces,
  voiceTier,
  writtenInGujarati,
} from "../src/utils/speech";
import {
  briefingLine,
  cancelPending,
  forServer,
  isSaying,
  knowServerVoice,
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
  localService?: boolean;
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
// Chrome on Windows as it really lists them: the desktop voices, then Google's online ones.
const CHROME_ONLINE: FakeVoice[] = [
  { name: "Microsoft David - English (United States)", lang: "en-US", localService: true },
  { name: "Microsoft Heera - English (India)", lang: "en-IN", localService: true },
  { name: "Microsoft Ravi - English (India)", lang: "en-IN", localService: true },
  { name: "Microsoft Zira - English (United States)", lang: "en-US", localService: true },
  { name: "Google US English", lang: "en-US", localService: false },
  { name: "Google UK English Female", lang: "en-GB", localService: false },
  { name: "Google UK English Male", lang: "en-GB", localService: false },
  { name: "Google हिन्दी", lang: "hi-IN", localService: false },
];

class FakeUtterance {
  text: string;
  lang = "";
  voice: FakeVoice | null = null;
  rate = 0;
  pitch = 0;
  volume = 0;
  onend: (() => void) | null = null;
  onerror: ((e?: { error?: string }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

const synth = {
  voices: EDGE as FakeVoice[],
  spoken: [] as FakeUtterance[],
  at: [] as number[],
  cancelled: 0,
  speaking: false,
  /** A browser that never says an utterance has ended. */
  hang: false,
  /** No internet: an online voice fails to start. */
  offline: false,
  getVoices() {
    return this.voices;
  },
  speak(u: FakeUtterance) {
    if (this.offline && u.voice?.localService === false) {
      setTimeout(() => u.onerror?.({ error: "network" }), 5);
      return;
    }
    this.spoken.push(u);
    this.at.push(Date.now());
    if (!this.hang) setTimeout(() => u.onend?.(), 5);
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

// The server: GET /api/assistant/speak says whether it can speak (always a 200), POST makes a line.
const fetches: { url: string; method: string; body: Record<string, unknown> }[] = [];
let answer: () => Response = () => new Response("{}", { status: 500 });
let statusAnswer: () => Response = () => statusOf("available");
let statusUnreachable = false;
g.fetch = async (url: unknown, init?: RequestInit) => {
  const method = String(init?.method ?? "GET").toUpperCase();
  fetches.push({ url: String(url), method, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
  if (method === "GET") {
    if (statusUnreachable) throw new TypeError("Failed to fetch");
    return statusAnswer();
  }
  return answer();
};
const TERMS = "Mitra's natural voice needs the Groq organisation's admin to accept the model's terms at console.groq.com (canopylabs/orpheus-v1-english).";
function statusOf(code: "available" | "voice-unavailable" | "not-configured" | "failed", recheckAfterMs = 10 * 60_000): Response {
  return new Response(
    JSON.stringify({
      available: code === "available",
      code,
      message: code === "voice-unavailable" ? TERMS : code === "available" ? "Mitra speaks with Groq's natural voice, made on this server." : "",
      engine: code === "available" ? "groq" : null,
      model: "canopylabs/orpheus-v1-english",
      voices: { female: "hannah", male: "daniel" },
      recheckAfterMs,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
const wavAnswer = () => new Response(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]), { status: 200, headers: { "content-type": "audio/wav" } });
const unavailableAnswer = () =>
  new Response(JSON.stringify({ error: TERMS, code: "voice-unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
const posts = () => fetches.filter((f) => f.method === "POST");
const gets = () => fetches.filter((f) => f.method === "GET");

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
  resetSpeechForTests();
  stopSpeaking();
  synth.voices = EDGE;
  synth.spoken = [];
  synth.at = [];
  synth.cancelled = 0;
  synth.offline = false;
  played.length = 0;
  playFails = false;
  fetches.length = 0;
  answer = () => new Response("{}", { status: 500 });
  statusAnswer = () => statusOf("available");
  statusUnreachable = false;
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

test("§85: in Chrome, Google's online voices before Windows' robotic ones — how human first, then female or male, then the accent", () => {
  assert.equal(pickVoice(CHROME_ONLINE, "en-IN", "female")?.name, "Google UK English Female", "not Microsoft Heera, though it is Indian English");
  assert.equal(pickVoice(CHROME_ONLINE, "en-IN", "male")?.name, "Google UK English Male", "not Microsoft Ravi");
  assert.equal(voiceTier(CHROME_ONLINE[4]), 1, "an online voice");
  assert.equal(voiceTier({ name: "Some Voice", lang: "en-US", localService: false }), 1, "online by the browser's word, whatever its name");
  assert.equal(voiceTier(CHROME_ONLINE[1]), 2, "a desktop voice");
  // Edge: natural Indian English stays first among the natural ones, female or male as chosen.
  const edgeMore = [...EDGE, { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US" }, { name: "Microsoft Guy Online (Natural) - English (United States)", lang: "en-US" }];
  assert.equal(pickVoice(edgeMore, "en-IN", "female")?.name, "Microsoft Neerja Online (Natural) - English (India)");
  assert.equal(pickVoice(edgeMore, "en-IN", "male")?.name, "Microsoft Prabhat Online (Natural) - English (India)");
  // A natural voice of the other gender still beats a robotic one of the chosen gender.
  assert.equal(pickVoice([{ name: "Microsoft Zira - English (United States)", lang: "en-US" }, { name: "Microsoft Prabhat Online (Natural) - English (India)", lang: "en-IN" }], "en-IN", "female")?.name, "Microsoft Prabhat Online (Natural) - English (India)");
  // Gujarati: only a Gujarati voice, never Google's Hindi one.
  assert.equal(pickVoice(CHROME_ONLINE, "gu-IN", "female"), null);
});

test("§85: the warm rate and the pauses — a natural voice keeps its sentences together, any other says one at a time with a breath between", () => {
  assert.deepEqual(prosodyFor({ name: "Microsoft Neerja Online (Natural) - English (India)", lang: "en-IN" }), { rate: 0.96, pitch: 1, pauseMs: 0 });
  assert.deepEqual(prosodyFor({ name: "Google UK English Female", lang: "en-GB" }), { rate: 0.94, pitch: 1, pauseMs: 280 });
  assert.deepEqual(prosodyFor({ name: "Microsoft Heera - English (India)", lang: "en-IN" }), { rate: 0.9, pitch: 1, pauseMs: 320 });
  assert.deepEqual(prosodyFor(null), { rate: 0.9, pitch: 1, pauseMs: 320 });
  const line = "Good morning, Heena. You have 3 waiting. Start with the Viscosity Log.";
  assert.deepEqual(utterancePieces(line), [line], "packed for a natural voice");
  assert.deepEqual(utterancePieces(line, true), ["Good morning, Heena.", "You have 3 waiting.", "Start with the Viscosity Log."]);
  const long = `${"word ".repeat(80).trim()}.`;
  assert.ok(utterancePieces(long, true).every((p) => p.length <= 220), "a sentence longer than Chrome allows is cut");
  assert.equal(utterancePieces(long, true).join(" "), long);
});

test("§85: a desktop voice says a line a sentence at a time, with a pause between; the words made for the ear", async () => {
  synth.voices = CHROME;
  click();
  say({ text: "Heena, F/HR/17 is due on 30-Sep-2026 at 14:30. Your score is 92% ✅ — keep going!", lang: "en" });
  await wait(1400);
  const year = new Date().getFullYear();
  const date = year === 2026 ? "30th September" : "30th September 2026";
  assert.deepEqual(said(), [`Heena, form F H R 17 is due on ${date} at 2:30 PM.`, "Your score is 92 percent, keep going!"]);
  assert.equal(synth.spoken[0]?.voice?.name, "Microsoft Heera - English (India)");
  assert.equal(synth.spoken[0]?.rate, 0.9);
  assert.ok(synth.at[1] - synth.at[0] >= 300, `a breath between the sentences (${synth.at[1] - synth.at[0]} ms)`);
});

test("§85: an online voice that cannot start (no internet) gives way to an installed one — the line is still said, and online voices rest", async () => {
  synth.voices = CHROME_ONLINE;
  synth.offline = true;
  click();
  say({ text: "The first line.", lang: "en" });
  await wait(500);
  assert.deepEqual(said(), ["The first line."]);
  assert.equal(synth.spoken[0]?.voice?.name, "Microsoft Heera - English (India)", "the best installed voice");
  synth.spoken = [];
  say({ text: "The second line.", lang: "en" });
  await wait(500);
  assert.equal(synth.spoken[0]?.voice?.name, "Microsoft Heera - English (India)", "not tried online again for a while");
  assert.equal(pickVoice(CHROME_ONLINE, "en-IN", "female")?.name, "Google UK English Female", "the picker itself is unchanged: the list it is given is");
});

test("§85: text made for the ear", () => {
  const now = new Date("2026-09-30T10:00:00");
  const ear = (t: string, lang = "en") => forTheEar(t, lang, now);
  assert.equal(ear("Heena, F/HR/17 is due today."), "Heena, form F H R 17 is due today.");
  assert.equal(ear("Open F/QC/15-B, F/QC-09 and F-QC-40.C."), "Open form F Q C 15 B, form F Q C 0 9 and form F Q C 40 C.");
  assert.equal(ear("The format F/MNT/05."), "The format F M N T 0 5.", "no 'form' said twice");
  assert.equal(ear("Due 30-Sep-2026 at 14:30; then 2026-10-02 at 09:00; last 12/03/2025."), "Due 30th September at 2:30 PM; then 2nd October at 9 AM; last 12th March 2025.");
  assert.equal(ear("3 may be late. 30 Sep, 12 records."), "3 may be late. 30th September, 12 records.", "'may' is not a month, a count is not a year");
  assert.equal(ear("**Due today** — `F/QC/01` ✅ Your score is 92%."), "Due today, form F Q C 0 1, Your score is 92 percent.");
  assert.equal(ear("## Today\n- Viscosity Log\n- Line Clearance (late)"), "Today. Viscosity Log. Line Clearance, late.");
  assert.equal(ear("Machine M-16 ran 10-20 hrs at 25°C ± 2 for ₹1,200. Yes/No, N/A, e.g. this & that."), "Machine M 16 ran 10 to 20 hours at 25 degrees Celsius plus or minus 2 for 1,200 rupees. Yes or No, not applicable, for example this and that.");
  assert.equal(ear("You are at −20 today — finish 2 more."), "You are at minus 20 today, finish 2 more.");
  assert.equal(ear("See [the page](https://a.example/x) or https://b.example/y."), "See the page or a link.");
  assert.equal(ear("Hello! I'm Mitra. I'll tell you when something is due."), "Hello! I'm Mitra. I'll tell you when something is due.", "a plain line is left as it is");
  assert.equal(ear("સુપ્રભાત, હીના. F/HR/17 આજે ભરવાનું છે — 92% ✅", "gu"), "સુપ્રભાત, હીના. F H R 17 આજે ભરવાનું છે, 92 ટકા.", "Gujarati: no English word added");
  assert.equal(ear(""), "");
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st"]);
  assert.deepEqual(sentencesOf("At 92.5 percent! Start at 2:30 PM? Yes."), ["At 92.5 percent!", "Start at 2:30 PM?", "Yes."]);
  assert.equal(forServer("Your score is 92% — F/HR/17."), "Your score is 92 percent, form F H R 17.", "what the server's voice is given is made for the ear too");

  // Found in review (REQUIREMENTS §85): a comparison is said, never dropped; a code stays one code; a full stop is kept.
  const grade = ear("<11% of total ups = A · <21% = B · <25% = C · >25% = F.");
  assert.ok(grade.includes("less than 25 percent is C") && grade.includes("more than 25 percent is F"), grade);
  assert.ok(ear("RH < 60% and temperature >= 20.").includes("less than 60 percent") && ear("RH < 60% and temperature >= 20.").includes("at least 20"));
  assert.ok(!ear("QC/WP/38 is due for review.").includes(" or "), ear("QC/WP/38 is due for review."));
  assert.ok(!ear("FLX/SOP/19 is the gowning procedure.").includes(" or "));
  assert.equal(ear("Choose Yes/No."), "Choose Yes or No.");
  assert.equal(ear("Please fill F/QC/15. A reminder will follow."), "Please fill form F Q C 15. A reminder will follow.");
  // ...a quote mark at a line's start is dropped, but never the ">" of a comparison there.
  assert.equal(ear(">25% = F"), "more than 25 percent is F.");
  assert.equal(ear("> note this"), "note this.");
  // ...a rate is "per", a score "out of", a frequency "a" - never two choices (the plant's own text).
  for (const [line, said] of [
    ["Bulk Density 1.3 gm/ccm, GSM 120 gm/sq.m.", "1.3 gm per ccm"],
    ["Bulk Density 1.3 gm/ccm, GSM 120 gm/sq.m.", "120 gm per sq"],
    ["BRUSTING STRENGTH (kg/cm²) is 12.", "kg per cm"],
    ["Strength 12 kg/cm² at least.", "12 kilograms per cm"],
    ["Dilution 20 ml / 1 lit of water.", "20 millilitres per 1 lit"],
    ["Frequency Once / Year.", "Once a Year"],
    ["Scored 45 / 50 this time.", "45 out of 50"],
  ] as const) {
    assert.ok(ear(line).includes(said) && !ear(line).includes(" or "), `${line} -> ${ear(line)}`);
  }
});

test("§85: a sentence still being said is not cut off; one that never ends gives way to the next; only the last ends the reply", () => {
  // Found in review: the per-piece watchdog ended the WHOLE reply when a sentence full of figures took longer than
  // its estimate. A browser that never fires onend is stood in for (hang), still speaking at first.
  mock.timers.enable({ apis: ["setTimeout"] });
  const before = { hang: synth.hang, speaking: synth.speaking, voices: synth.voices };
  synth.hang = true;
  synth.speaking = true;
  synth.voices = [];
  synth.spoken.length = 0;
  let ended = 0;
  try {
    speakWithBrowser("Maintenance filled 1,248 of 1,312 on time, and QC 2,034 of 2,210. Stores did the best of all this month.", null, "en-IN", () => {
      ended += 1;
    });
    assert.equal(synth.spoken.length, 1, "one sentence at a time (no natural voice)");
    const allowed = (u: { text: string }) => 5000 + u.text.length * 90;
    // One estimate at a time (a timer set while the mock clock ticks counts from where the tick ends).
    for (let i = 0; i < 3; i++) mock.timers.tick(allowed(synth.spoken[0]));
    assert.equal(ended, 0, "still speaking at three times its estimate: the reply is not ended");
    assert.equal(synth.spoken.length, 1, "...and the next sentence waits");
    mock.timers.tick(allowed(synth.spoken[0]));
    assert.equal(synth.spoken.length, 2, "at four times its estimate it counts as said: the next sentence is said");
    assert.equal(ended, 0, "...and the reply goes on");
    synth.speaking = false; // its onend lost, and nothing speaking: no extra wait
    mock.timers.tick(allowed(synth.spoken[1]));
    assert.equal(ended, 1, "the last sentence's time running out ends the reply, once");
    mock.timers.tick(60_000);
    assert.equal(ended, 1);
  } finally {
    Object.assign(synth, before);
    mock.timers.reset();
  }
});

test("§85: a new reply ends the last one's sentences still to come", async () => {
  synth.voices = CHROME;
  speak("First reply. It has a second sentence. And a third.", "en-IN");
  await wait(60);
  speak("The new reply.", "en-IN");
  await wait(1200);
  assert.deepEqual(said(), ["First reply.", "The new reply."]);
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

test("the browser's best voice, at a warm rate and its natural pitch; the male voice when chosen", async () => {
  click();
  say({ text: "Good morning.", lang: "en" });
  await wait(400);
  const u = synth.spoken[0];
  assert.equal(u?.voice?.name, "Microsoft Neerja Online (Natural) - English (India)");
  assert.equal(u.rate, 0.96, "a touch under the everyday rate: unhurried");
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

test("a reply WRITTEN in Gujarati is Gujarati with English chosen too: a Gujarati voice, or silence — one Gujarati name does not count", async () => {
  // Mitra answers in the script it was asked in: a question typed in Gujarati with the screens in English.
  const reply = "આજે તમારે ત્રણ દસ્તાવેજ ભરવાના છે. પહેલાં Line Clearance કરો.";
  assert.equal(writtenInGujarati(reply), true, "mostly Gujarati letters, a document's English name among them");
  assert.equal(writtenInGujarati("Heena, your list is ready — હીના."), false, "one Gujarati name in an English reply");
  assert.equal(writtenInGujarati("Your score is 92%."), false);

  speak(reply, "en-IN");
  await wait(50);
  assert.equal(synth.spoken.length, 1);
  assert.equal(synth.spoken[0]?.voice?.lang, "gu-IN", "read in the Gujarati voice, not the English one");
  assert.equal(synth.spoken[0]?.lang, "gu-IN");

  synth.voices = CHROME;
  synth.spoken = [];
  speak(reply, "en-IN");
  await wait(50);
  assert.deepEqual(said(), [], "no Gujarati voice: not read at all — never by the English voice");

  speak("Heena, your list is ready — હીના.", "en-IN");
  await wait(50);
  assert.equal(synth.spoken[0]?.voice?.lang, "en-IN", "an English reply with a Gujarati name is still read");
});

// ---- the server's natural voice ----
// REQUIREMENTS §89: Edge's natural Indian English voice (Neerja, Prabhat) speaks
// English before Groq's voice, so the server's voice is tested here on Chrome's
// list (no natural Indian English voice); the Edge case is
// voiceLanguages.test.ts's "Neerja first, the server never asked".

test("with a key and no natural Indian English voice here, the server is asked once whether it can speak, and English is said in its natural voice", async () => {
  synth.voices = CHROME;
  setFeatures({ assistant: true });
  answer = wavAnswer;
  click();
  say({ text: "Your score is 92%.", lang: "en" });
  await wait(500);
  assert.equal(gets().length, 1, "asked first: GET /api/assistant/speak");
  assert.equal(gets()[0].url, "/api/assistant/speak");
  assert.equal(posts().length, 1);
  assert.equal(posts()[0].url, "/api/assistant/speak");
  assert.deepEqual(posts()[0].body, { text: "Your score is 92 percent.", voice: "female" }, "the words made for the ear");
  assert.equal(played.length, 1, "the WAV was played");
  assert.deepEqual(said(), [], "and the browser's voice was not used");
  assert.equal(serverVoiceState().state, "available");
  const inUse = await voiceInUse();
  assert.equal(inUse.source, "server");
  assert.equal(inUse.name, "hannah", "the server voice's name, for the card");
  say({ text: "Another line.", lang: "en" });
  await wait(500);
  assert.equal(gets().length, 1, "not asked again: remembered");
  assert.equal(posts().length, 2);
});

test("§85: the Groq terms not accepted — the server SAYS so with a 200, no line is ever asked for, and it is remembered", async () => {
  synth.voices = CHROME;
  setFeatures({ assistant: true });
  statusAnswer = () => statusOf("voice-unavailable");
  answer = unavailableAnswer;
  click();
  say({ text: "First line.", lang: "en" });
  await wait(500);
  assert.equal(gets().length, 1);
  assert.equal(posts().length, 0, "no POST that would answer 503 — no failed request in the console");
  assert.deepEqual(said(), ["First line."], "the browser's own voice");
  assert.equal(synth.spoken[0]?.voice?.name, "Microsoft Heera - English (India)");
  assert.equal(serverVoiceState().state, "voice-unavailable");
  assert.match(serverVoiceState().message, /accept the model's terms/);
  assert.match(sessionStorage.getItem("dcrs:voice-server") ?? "", /voice-unavailable/, "remembered for the session");
  say({ text: "Second line.", lang: "en" });
  await wait(500);
  assert.equal(fetches.length, 1, "not asked again");
  assert.deepEqual(said(), ["First line.", "Second line."]);
  const inUse = await voiceInUse();
  assert.equal(inUse.source, "basic");
  assert.equal(inUse.server, "voice-unavailable");
  assert.equal(fetches.length, 1, "the card does not ask again either");
});

test("§85: the answer is kept only as long as the server says — then asked again (the admin may have accepted the terms)", async () => {
  setFeatures({ assistant: true });
  statusAnswer = () => statusOf("voice-unavailable", 40);
  await knowServerVoice();
  assert.equal(serverVoiceState().state, "voice-unavailable");
  await knowServerVoice();
  assert.equal(gets().length, 1, "kept");
  await wait(80);
  statusAnswer = () => statusOf("available");
  await knowServerVoice();
  assert.equal(gets().length, 2, "asked again once the answer ran out");
  assert.equal(serverVoiceState().state, "available");
});

test("§85: without a key nothing is asked; a server that cannot be asked is asked again later, the browser speaking meanwhile", async () => {
  synth.voices = CHROME;
  click();
  say({ text: "No key here.", lang: "en" });
  await wait(400);
  assert.equal(fetches.length, 0, "features.assistant false: the server is never asked");
  assert.deepEqual(said(), ["No key here."]);

  setFeatures({ assistant: true });
  statusUnreachable = true;
  say({ text: "Server away.", lang: "en" });
  await wait(400);
  assert.equal(gets().length, 1);
  assert.equal(posts().length, 0);
  assert.deepEqual(said(), ["No key here.", "Server away."]);
  assert.equal(serverVoiceState().state, "failed");
  statusUnreachable = false;
  say({ text: "Still away.", lang: "en" });
  await wait(400);
  assert.equal(gets().length, 1, "not asked again at once: two minutes");
});

test("a 503 all the same (the terms revoked after the server said yes): the browser's voice, remembered", async () => {
  synth.voices = CHROME;
  setFeatures({ assistant: true });
  answer = unavailableAnswer;
  click();
  say({ text: "First line.", lang: "en" });
  await wait(500);
  assert.equal(posts().length, 1);
  assert.deepEqual(said(), ["First line."]);
  assert.equal(serverVoiceState().state, "voice-unavailable");
  say({ text: "Second line.", lang: "en" });
  await wait(500);
  assert.equal(posts().length, 1, "not asked again");
});

test("an audio clip the browser will not play falls back to the browser's voice; Gujarati never goes to the server", async () => {
  synth.voices = CHROME;
  setFeatures({ assistant: true });
  answer = wavAnswer;
  playFails = true;
  click();
  say({ text: "Blocked clip.", lang: "en" });
  await wait(500);
  assert.equal(posts().length, 1, "the server's clip was fetched");
  assert.deepEqual(said(), ["Blocked clip."]);
  fetches.length = 0;
  synth.voices = EDGE;
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
  assert.match(en, /^Good morning, Heena\. You have 3 prepared and ready for your OK, 1 needing a detail only you know and 2 still open from earlier\. /);
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
