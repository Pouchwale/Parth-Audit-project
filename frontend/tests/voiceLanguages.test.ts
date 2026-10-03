// MITRA IN ENGLISH, HINDI AND GUJARATI, WITH FREE VOICES (REQUIREMENTS §89).
//
// "If the user asks in Gujarati or Hindi then the bot should reply in that
// language: Gujarati asked, Gujarati answered; the same for Hindi and English" —
// and "make the voice accent more like a human, like a real person", with no
// paid voice. These tests hold, without a browser:
//   - the script of a text decides its language (utils/scripts.ts): a question's,
//     and each sentence of a reply, Hindi and Gujarati in Latin letters too;
//   - the voice for each language, from the lists Microsoft Edge, Google Chrome
//     and a machine with no Gujarati voice really give (utils/speech.ts): Edge's
//     natural Neerja, स्वरा and ધ્વની (Prabhat, मधुर, નિરંજન for the male voice),
//     Google's voices in Chrome, never an English voice for Hindi or Gujarati,
//     and Edge 150's unnamed voices never a crash;
//   - the words made for the ear in Hindi and Gujarati, record ids never spelled
//     out, the danda ending a sentence (utils/earText.ts);
//   - a reply said by two voices in turn, a reply with no voice here shown and
//     the hint given once, Neerja speaking English before Groq's server voice, a
//     stalled online voice given up rather than hung on, the card's voice for
//     each language and its Hindi sample in the chosen gender (utils/voice.ts);
//   - the app's own answers following the question's language, and a Hindi
//     question's answer with its one Hindi line in front (engine/assistantLocal.ts).
// The browser's speech and the network are stood in for. Run: npm run test:unit -- voiceLanguages
import test, { beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { setFeatures } from "../src/engine/features";
import { settingsRepository } from "../src/data/repositories/settingsRepository";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { resetSoundsForTests, watchFirstGesture } from "../src/utils/sounds";
import { forTheEar, isLongId, sentencesOf } from "../src/utils/earText";
import { askedLanguage, sentenceLanguage, voiceSegments, wordCounts } from "../src/utils/scripts";
import {
  firstTimeWithoutVoice,
  genderOfVoice,
  isIndianNatural,
  ONLINE_START_MS,
  pickVoice,
  resetSpeechForTests,
  speak,
  speakWithBrowser,
  stopSpeaking,
  utterancePieces,
  voiceFor,
  voiceTier,
} from "../src/utils/speech";
import { noVoiceHintOnce, prepareVoice, resetVoiceForTests, sampleLine, say, voiceInUse } from "../src/utils/voice";
import { answerLanguageFor, localAnswer, withHindiNote } from "../src/engine/assistantLocal";
import { HINDI } from "../src/i18n/hindi";
import { tr } from "../src/i18n";

// ---- the browser, stood in for ----

interface FakeVoice {
  name: string;
  lang: string;
  localService?: boolean;
}
const V = (name: string, lang: string, localService: boolean): FakeVoice => ({ name, lang, localService });

// Microsoft Edge on Windows: its "Online (Natural)" voices come from Microsoft's
// service (not local), the Indian ones named in their own script as Edge 150 names
// them; beside them the voices installed with Windows.
const EDGE: FakeVoice[] = [
  V("Microsoft Heera - English (India)", "en-IN", true),
  V("Microsoft Ravi - English (India)", "en-IN", true),
  V("Microsoft David - English (United States)", "en-US", true),
  V("Microsoft Aria Online (Natural) - English (United States)", "en-US", false),
  V("Microsoft Neerja Online (Natural) - English (India)", "en-IN", false),
  V("Microsoft Prabhat Online (Natural) - English (India)", "en-IN", false),
  V("Microsoft स्वरा Online (Natural) - Hindi (India)", "hi-IN", false),
  V("Microsoft मधुर Online (Natural) - Hindi (India)", "hi-IN", false),
  V("Microsoft ધ્વની Online (Natural) - Gujarati (India)", "gu-IN", false),
  V("Microsoft નિરંજન Online (Natural) - Gujarati (India)", "gu-IN", false),
];
// The same voices named in Latin letters, as other versions of Edge name them.
const EDGE_LATIN: FakeVoice[] = EDGE.map((v) => ({
  ...v,
  name: v.name.replace("स्वरा", "Swara").replace("मधुर", "Madhur").replace("ધ્વની", "Dhwani").replace("નિરંજન", "Niranjan"),
}));
// Google Chrome on Windows: the installed voices, then Google's online ones — Hindi among them, Gujarati not at all.
const CHROME: FakeVoice[] = [
  V("Microsoft David - English (United States)", "en-US", true),
  V("Microsoft Heera - English (India)", "en-IN", true),
  V("Microsoft Ravi - English (India)", "en-IN", true),
  V("Microsoft Zira - English (United States)", "en-US", true),
  V("Google US English", "en-US", false),
  V("Google UK English Female", "en-GB", false),
  V("Google UK English Male", "en-GB", false),
  V("Google हिन्दी", "hi-IN", false),
];
// A PC with Windows' Hindi speech pack and no Gujarati voice (Firefox there lists only the installed ones).
const NO_GUJARATI: FakeVoice[] = [
  V("Microsoft David - English (United States)", "en-US", true),
  V("Microsoft Zira - English (United States)", "en-US", true),
  V("Microsoft Heera - English (India)", "en-IN", true),
  V("Microsoft Hemant - Hindi (India)", "hi-IN", true),
  V("Microsoft Kalpana - Hindi (India)", "hi-IN", true),
];
const named = (list: FakeVoice[], part: string): FakeVoice => list.find((v) => v.name.includes(part)) as FakeVoice;

class FakeUtterance {
  text: string;
  lang = "";
  voice: FakeVoice | null = null;
  rate = 0;
  pitch = 0;
  volume = 0;
  onend: (() => void) | null = null;
  onerror: ((e?: { error?: string }) => void) | null = null;
  onstart: (() => void) | null = null;
  onboundary: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

const synth = {
  voices: EDGE as FakeVoice[],
  spoken: [] as FakeUtterance[],
  cancelled: 0,
  speaking: false,
  /** A voice that neither starts nor ends: Edge's online voice stalling. */
  hang: false,
  getVoices() {
    return this.voices;
  },
  speak(u: FakeUtterance) {
    this.spoken.push(u);
    if (!this.hang) setTimeout(() => u.onend?.(), 5);
  },
  cancel() {
    this.cancelled += 1;
  },
  addEventListener() {},
  removeEventListener() {},
};

const g = globalThis as unknown as Record<string, unknown>;
g.speechSynthesis = synth;
g.SpeechSynthesisUtterance = FakeUtterance;
g.Audio = class {
  play() {
    return Promise.reject(new Error("no audio in a unit test"));
  }
  pause() {}
};
const fetches: { url: string; method: string }[] = [];
g.fetch = async (url: unknown, init?: RequestInit) => {
  fetches.push({ url: String(url), method: String(init?.method ?? "GET").toUpperCase() });
  return new Response(JSON.stringify({ available: true, code: "available", message: "", engine: "groq", model: "m", voices: { female: "hannah", male: "daniel" }, recheckAfterMs: 600000 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const click = () => {
  watchFirstGesture();
  window.dispatchEvent(new Event("pointerdown"));
};
const said = () => synth.spoken.map((u) => ({ text: u.text, voice: u.voice?.name ?? "", lang: u.lang }));

/** Runs `fn` as if this page were open in Microsoft Edge 154. */
async function inEdge<T>(fn: () => T | Promise<T>): Promise<T> {
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  Object.defineProperty(nav, "userAgent", { value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.4258.48", configurable: true });
  try {
    return await fn();
  } finally {
    delete nav.userAgent;
  }
}

beforeEach(() => {
  resetVoiceForTests();
  resetSoundsForTests();
  resetSpeechForTests();
  stopSpeaking();
  synth.voices = EDGE;
  synth.spoken = [];
  synth.cancelled = 0;
  synth.speaking = false;
  synth.hang = false;
  fetches.length = 0;
  setFeatures({ assistant: false });
  try {
    sessionStorage.clear();
  } catch {
    /* none */
  }
  settingsRepository.update({ voiceKind: "female", spokenToday: { date: "", keys: [] } });
});

// ---- the script decides the language ----

test("a question's language is the one it was asked in: its script, or Hindi and Gujarati by their everyday words in Latin letters", () => {
  assert.deepEqual(wordCounts("आज F/QC/30 भरना है"), { en: 2, hi: 3, gu: 0, other: 0 }, "words, not letters: a format number's letters count as two Latin words");
  assert.equal(askedLanguage("आज का रिकॉर्ड खोलो"), "hi");
  assert.equal(askedLanguage("aaj ka record kholo"), "hi", "Hindi in Latin letters");
  assert.equal(askedLanguage("mera score kya hai"), "hi");
  assert.equal(askedLanguage("આજનું રેકોર્ડ ખોલો"), "gu");
  assert.equal(askedLanguage("aaje nu daily record kholo"), "gu", "Gujarati in Latin letters, English words mixed in");
  assert.equal(askedLanguage("maru score shu che"), "gu");
  assert.equal(askedLanguage("Line Clearance Checklist ભરો"), "gu", "a Gujarati verb makes a sentence of English names Gujarati");
  assert.equal(askedLanguage("open today's record"), "en");
  assert.equal(askedLanguage("what is the main reason for the delay?"), "en", "'main' is an English word too, never a sign of Hindi");
  assert.equal(askedLanguage("show હીના's records"), "en", "one name in Gujarati script does not make an English question Gujarati");
  for (const bare of ["yes", "No.", "ok", "haan", "ha", "theek hai", "F/QC/30", "M-47", "  "]) assert.equal(askedLanguage(bare), null, `${JSON.stringify(bare)} has no language of its own`);
  assert.equal(sentenceLanguage("92%"), null);
  assert.equal(sentenceLanguage("पहले Viscosity Log भरें।"), "hi");
});

test("a reply is said sentence by sentence in the voice of its script: a Hindi line in front, the English answer after", () => {
  assert.deepEqual(voiceSegments(`${HINDI.note}\nToday: 3 records due, 1 done.`), [
    { lang: "hi", text: HINDI.note },
    { lang: "en", text: "Today: 3 records due, 1 done." },
  ]);
  assert.deepEqual(voiceSegments("આજે તમારે ત્રણ દસ્તાવેજ ભરવાના છે. પહેલાં Line Clearance કરો."), [
    { lang: "gu", text: "આજે તમારે ત્રણ દસ્તાવેજ ભરવાના છે. પહેલાં Line Clearance કરો." },
  ], "a Gujarati reply with a document's English name stays one Gujarati part");
  assert.deepEqual(voiceSegments("Heena, your list is ready — હીના."), [{ lang: "en", text: "Heena, your list is ready — હીના." }]);
  assert.deepEqual(voiceSegments("पहला वाक्य।दूसरा वाक्य। The third is English."), [
    { lang: "hi", text: "पहला वाक्य। दूसरा वाक्य।" },
    { lang: "en", text: "The third is English." },
  ], "the danda ends a sentence even with no space after it");
  assert.deepEqual(voiceSegments("- Viscosity Log\n- Line Clearance"), [{ lang: "en", text: "- Viscosity Log\n- Line Clearance" }], "a list keeps its lines");
  assert.deepEqual(voiceSegments("92%", "gu"), [{ lang: "gu", text: "92%" }], "no words: the language it is asked in");
  assert.deepEqual(voiceSegments(""), []);
});

// ---- the voice for each language ----

test("each language's voice in Edge (natural, the person's gender), in Chrome (Google's) and on a PC with no Gujarati voice", () => {
  const pick = (list: FakeVoice[], kind: "female" | "male") => (["en", "hi", "gu"] as const).map((l) => voiceFor(list, l, kind)?.name ?? null);
  assert.deepEqual(pick(EDGE, "female"), [
    "Microsoft Neerja Online (Natural) - English (India)",
    "Microsoft स्वरा Online (Natural) - Hindi (India)",
    "Microsoft ધ્વની Online (Natural) - Gujarati (India)",
  ]);
  assert.deepEqual(pick(EDGE, "male"), [
    "Microsoft Prabhat Online (Natural) - English (India)",
    "Microsoft मधुर Online (Natural) - Hindi (India)",
    "Microsoft નિરંજન Online (Natural) - Gujarati (India)",
  ]);
  assert.deepEqual(pick(EDGE_LATIN, "female").slice(1), ["Microsoft Swara Online (Natural) - Hindi (India)", "Microsoft Dhwani Online (Natural) - Gujarati (India)"]);
  assert.deepEqual(pick(EDGE_LATIN, "male").slice(1), ["Microsoft Madhur Online (Natural) - Hindi (India)", "Microsoft Niranjan Online (Natural) - Gujarati (India)"]);
  assert.deepEqual(pick(CHROME, "female"), ["Google UK English Female", "Google हिन्दी", null], "Chrome: Google's voices, and no Gujarati voice at all");
  assert.deepEqual(pick(CHROME, "male"), ["Google UK English Male", "Google हिन्दी", null]);
  assert.deepEqual(pick(NO_GUJARATI, "female"), ["Microsoft Heera - English (India)", "Microsoft Kalpana - Hindi (India)", null]);
  assert.deepEqual(pick(NO_GUJARATI, "male"), ["Microsoft David - English (United States)", "Microsoft Hemant - Hindi (India)", null]);
  assert.equal(voiceFor(EDGE.filter((v) => v.lang.startsWith("en")), "hi"), null, "never an English voice for Hindi");
  assert.equal(voiceFor(EDGE.filter((v) => v.lang.startsWith("en")), "gu"), null, "never an English voice for Gujarati");
  assert.equal(isIndianNatural(named(EDGE, "Neerja")), true, "Edge's Indian English natural voice");
  assert.equal(isIndianNatural(named(EDGE, "Aria")), false, "a natural voice, but American");
  assert.equal(isIndianNatural(named(EDGE, "Heera")), false, "Indian English, but the robotic installed voice");
});

test("Edge 150's unnamed voices: never a crash, a named voice first, an unnamed one only as the last resort", () => {
  const unnamed = { name: undefined as unknown as string, lang: "gu-IN" };
  const undefinedName = { name: "undefined", lang: "hi-IN" };
  assert.equal(genderOfVoice(undefined as unknown as string), null);
  assert.equal(voiceTier(unnamed), 3);
  assert.equal(voiceTier(undefinedName), 3);
  assert.equal(pickVoice([unnamed, named(EDGE, "ધ્વની")], "gu-IN")?.name, "Microsoft ધ્વની Online (Natural) - Gujarati (India)");
  assert.equal(pickVoice([unnamed], "gu-IN"), unnamed, "the only Gujarati voice there is: tried, and the watchdog guards it");
  assert.equal(pickVoice([undefinedName, named(NO_GUJARATI, "Kalpana")], "hi-IN")?.name, "Microsoft Kalpana - Hindi (India)");
});

// ---- the words, made for the ear ----

test("text for the ear in Hindi and Gujarati; a record's long id never spelled out; an English voice never given Indic script", () => {
  const now = new Date("2026-10-03T10:00:00");
  const ear = (t: string, lang: string) => forTheEar(t, lang, now);
  assert.equal(ear("आज F/QC/30 भरना है। स्कोर 92% है।", "hi"), "आज F Q C 30 भरना है। स्कोर 92 प्रतिशत है।");
  assert.equal(ear("जमा करने की तारीख 30-Sep-2026 है, पिछली 12/03/2025 थी।", "hi"), "जमा करने की तारीख 30 सितंबर है, पिछली 12 मार्च 2025 थी।");
  assert.equal(ear("**आज के काम**\n- Viscosity Log\n- Line Clearance", "hi"), "आज के काम। Viscosity Log। Line Clearance।", "a list read with a pause after each line, the danda for Hindi");
  assert.equal(ear("તારીખ 2026-10-03, રકમ ₹1,200, તાપમાન 25°C.", "gu"), "તારીખ 3 ઓક્ટોબર, રકમ 1,200 રૂપિયા, તાપમાન 25 ડિગ્રી સેલ્સિયસ.");
  assert.equal(ear("F/HR/17 આજે ભરવાનું છે — 92% ✅", "gu-IN"), "F H R 17 આજે ભરવાનું છે, 92 ટકા.", "a voice's tag works as the language");
  assert.equal(ear("Record rec-mg8x9k2a-1f-abc123 is submitted.", "en"), "Record is submitted.");
  assert.equal(ear("The record id rec-mg8x9k2a-1f-abc123 is open.", "en"), "The record is open.");
  assert.equal(ear("Saved (rec-mg8x9k2a-1f-abc123). Cited [rec:rec-mg8x9k2a-1f-abc123].", "en"), "Saved. Cited.");
  assert.equal(ear("Ref 3f2a9c1e-5b7d-4c1a-9e2f-0a1b2c3d4e5f closed.", "en"), "Ref closed.");
  assert.equal(ear("रिकॉर्ड rec-mg8x9k2a-1f-abc123 जमा हो गया।", "hi"), "रिकॉर्ड जमा हो गया।");
  const lot = ear("Lot LOT-2026-0915-A passed.", "en");
  assert.ok(lot.includes("2026") && lot.includes("0915") && lot.endsWith("passed."), `a lot number is no id: still said (${lot})`);
  assert.equal(isLongId("LOT-2026-0915-A"), false);
  assert.equal(isLongId("2026-10-03"), false);
  assert.equal(isLongId("rec-mg8x9k2a-1f-abc123"), true);
  assert.equal(ear("Heena, your list is ready — હીના.", "en"), "Heena, your list is ready.", "the Gujarati name is left out of what the English voice is given");
  assert.equal(ear("હીના", "en"), "", "nothing an English voice can say");
});

test("the danda ends a sentence, with a space after it or not; a decimal point never does", () => {
  assert.deepEqual(sentencesOf("पहला वाक्य। दूसरा वाक्य।तीसरा वाक्य"), ["पहला वाक्य।", "दूसरा वाक्य।", "तीसरा वाक्य"]);
  assert.deepEqual(sentencesOf("Score 92.5 percent. Next."), ["Score 92.5 percent.", "Next."]);
  assert.deepEqual(utterancePieces("आज तीन रिकॉर्ड बाकी हैं। पहले Viscosity Log भरें।", true), ["आज तीन रिकॉर्ड बाकी हैं।", "पहले Viscosity Log भरें।"]);
});

// ---- saying it ----

test("a Hindi line then English words: said by the Hindi voice, then the Indian English one — in Edge and in Chrome", async () => {
  const reply = `${HINDI.note}\nToday: 3 records due.`;
  speak(reply, "en-IN");
  await wait(700);
  assert.deepEqual(said(), [
    { text: HINDI.note, voice: "Microsoft स्वरा Online (Natural) - Hindi (India)", lang: "hi-IN" },
    { text: "Today: 3 records due.", voice: "Microsoft Neerja Online (Natural) - English (India)", lang: "en-IN" },
  ]);
  synth.voices = CHROME;
  synth.spoken = [];
  speak(reply, "en-IN");
  await wait(700);
  assert.deepEqual(said().map((s) => s.voice), ["Google हिन्दी", "Google UK English Female"]);
});

test("a Gujarati reply with no Gujarati voice here (Chrome) is shown, not said — and the hint is given once a session", async () => {
  synth.voices = CHROME;
  const missing: string[] = [];
  speak("આજે ત્રણ દસ્તાવેજ બાકી છે.", "en-IN", { onNoVoice: (l) => missing.push(l) });
  await wait(300);
  assert.deepEqual(said(), [], "never read by an English voice");
  assert.deepEqual(missing, ["gu"]);
  const t = (key: string) => key;
  assert.equal(noVoiceHintOnce("gu", t), "voice.noVoice.gu", "Mitra speaks Gujarati in Microsoft Edge. Open DCRS in Edge to hear it.");
  assert.equal(noVoiceHintOnce("gu", t), null, "once a session");
  assert.equal(noVoiceHintOnce("hi", t), "voice.noVoice.hi", "Hindi has its own hint");
  assert.equal(firstTimeWithoutVoice("hi"), false);
  assert.match(sessionStorage.getItem("dcrs:voice-no-voice-hinted") ?? "", /gu/, "remembered for the browser session");
  resetSpeechForTests();
  sessionStorage.clear();
  assert.equal(await inEdge(() => noVoiceHintOnce("gu", t)), "voice.noVoice.edge.gu", "in Edge itself: its voice needs the internet");
  assert.equal(tr("en", "voice.noVoice.gu"), "Mitra speaks Gujarati in Microsoft Edge. Open DCRS in Edge to hear it.");
  assert.ok(/[઀-૿]/.test(tr("gu", "voice.noVoice.gu")), "and in Gujarati on Gujarati screens");
});

test("figures alone belong to no language: with no voice for the screens' language, English says them, and no hint", async () => {
  synth.voices = CHROME;
  const missing: string[] = [];
  speak("92%", "gu-IN", { onNoVoice: (l) => missing.push(l) });
  await wait(300);
  assert.deepEqual(said().map((s) => s.text), ["92 percent."]);
  assert.deepEqual(missing, []);
});

test("Hear Mitra in Hindi: the Hindi voice, the verbs of the chosen gender; no Hindi voice, nothing said (never the English line)", async () => {
  assert.match(sampleLine("Heena", "hi", "female"), /^नमस्ते, Heena! मैं मित्र हूँ।.*दिलाऊँगी/);
  assert.match(sampleLine("", "hi", "male"), /^नमस्ते! मैं मित्र हूँ।.*दिलाऊँगा.*दूँगा।$/);
  click();
  say({ text: sampleLine("Heena", "hi", "female"), lang: "hi", priority: "high" });
  await wait(500);
  assert.equal(said()[0]?.voice, "Microsoft स्वरा Online (Natural) - Hindi (India)");
  settingsRepository.update({ voiceKind: "male" });
  synth.spoken = [];
  say({ text: sampleLine("Heena", "hi"), lang: "hi", priority: "high" });
  await wait(500);
  assert.equal(said()[0]?.voice, "Microsoft मधुर Online (Natural) - Hindi (India)", "the male voice says the male verbs");
  assert.match(said()[0]?.text ?? "", /दिलाऊँगा/);
  synth.voices = EDGE.filter((v) => !v.lang.startsWith("hi"));
  synth.spoken = [];
  say({ text: sampleLine("Heena", "hi"), lang: "hi", priority: "high" });
  await wait(500);
  assert.deepEqual(said(), []);
});

test("English in the staff's own accent: Edge's Neerja speaks before Groq's voice, and the server is never asked", async () => {
  setFeatures({ assistant: true });
  click();
  prepareVoice();
  say({ text: "Your score is 92%.", lang: "en" });
  await wait(500);
  assert.deepEqual(said(), [{ text: "Your score is 92 percent.", voice: "Microsoft Neerja Online (Natural) - English (India)", lang: "en-IN" }]);
  assert.equal(fetches.length, 0, "no GET, no POST: Groq's voice is only the fallback where the browser has no natural Indian English voice");
  const inUse = await voiceInUse();
  assert.deepEqual(inUse.languages.en, { source: "natural", name: "Microsoft Neerja Online (Natural) - English (India)" });
  assert.equal(fetches.length, 0, "the card does not ask either");
});

test("the card's voice for each language: Edge's natural three; Chrome's Google voices and no Gujarati", async () => {
  let inUse = await voiceInUse();
  assert.deepEqual(inUse.languages, {
    en: { source: "natural", name: "Microsoft Neerja Online (Natural) - English (India)" },
    hi: { source: "natural", name: "Microsoft स्वरा Online (Natural) - Hindi (India)" },
    gu: { source: "natural", name: "Microsoft ધ્વની Online (Natural) - Gujarati (India)" },
  });
  assert.equal(inUse.gujarati, true);
  synth.voices = CHROME;
  inUse = await voiceInUse();
  assert.deepEqual(inUse.languages, {
    en: { source: "online", name: "Google UK English Female" },
    hi: { source: "online", name: "Google हिन्दी" },
    gu: { source: "none", name: "" },
  });
  assert.equal(inUse.source, "online", "the card's English line, as the suites read it");
  assert.equal(inUse.gujarati, false);
});

test("Edge's online voice stalls (no start, no end): given up after ONLINE_START_MS — English goes on in an installed voice, Gujarati stops cleanly", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  synth.hang = true;
  synth.speaking = true;
  synth.spoken = [];
  try {
    let ended = 0;
    speakWithBrowser("Good morning. Two records are due today.", named(EDGE, "Neerja") as unknown as SpeechSynthesisVoice, "en-IN", () => {
      ended += 1;
    });
    assert.equal(synth.spoken.length, 1);
    mock.timers.tick(ONLINE_START_MS - 1);
    assert.equal(synth.cancelled, 0, "not yet: an online voice may take a moment to start");
    mock.timers.tick(1);
    assert.equal(synth.cancelled, 1, "the stalled voice is cancelled");
    mock.timers.tick(1);
    assert.equal(synth.spoken.length, 2, "and the words said again");
    assert.equal(synth.spoken[1].voice?.name, "Microsoft Heera - English (India)", "in the best installed voice");
    assert.equal(ended, 0, "the line goes on");

    resetSpeechForTests();
    synth.spoken = [];
    let guEnded = 0;
    speakWithBrowser("આજે ત્રણ દસ્તાવેજ બાકી છે.", named(EDGE, "ધ્વની") as unknown as SpeechSynthesisVoice, "gu-IN", () => {
      guEnded += 1;
    });
    mock.timers.tick(ONLINE_START_MS);
    assert.equal(guEnded, 1, "no installed Gujarati voice to go on with: the line ends, cleanly");
    mock.timers.tick(120_000);
    assert.equal(synth.spoken.length, 1, "nothing more is said, by no other voice");
    assert.equal(guEnded, 1, "and it ends once");

    // A voice that starts in time is never cut off by the start watchdog.
    synth.spoken = [];
    resetSpeechForTests();
    speakWithBrowser("A slow start.", named(EDGE, "Neerja") as unknown as SpeechSynthesisVoice, "en-IN");
    synth.spoken[0].onstart?.();
    const cancelledBefore = synth.cancelled;
    mock.timers.tick(ONLINE_START_MS + 10);
    assert.equal(synth.cancelled, cancelledBefore, "started: not a stall");
  } finally {
    synth.hang = false;
    synth.speaking = false;
    mock.timers.reset();
  }
});

test("a Hindi or Gujarati line is never handed to the browser without a voice of its own (its default could be English)", () => {
  assert.equal(speakWithBrowser("नमस्ते।", null, "hi-IN"), null);
  assert.equal(speakWithBrowser("નમસ્તે.", null, "gu-IN"), null);
  assert.notEqual(speakWithBrowser("Hello.", null, "en-IN"), null, "English may use the browser's own choice");
});

// ---- the app's own answers ----

test("the app's own answers follow the question's language; a Hindi question's answer has one Hindi line in front", () => {
  ensureDocumentsSeeded();
  ensureMasterSeeded();
  const en = localAnswer("what is F/HR/05?", false, "Heena");
  assert.ok(en && /^F\/HR\/05 is /.test(en.reply), String(en?.reply));
  const gu = localAnswer("F/HR/05 શું છે?", false, "Heena");
  assert.ok(gu && gu.reply.includes("એટલે") && /[઀-૿]/.test(gu.reply), `a question in Gujarati, answered in Gujarati on English screens: ${gu?.reply}`);
  assert.ok(gu && gu.chips?.some((c) => c.label === tr("gu", "ai.format.open")), "its buttons too");
  const hi = localAnswer("F/HR/05 क्या है?", false, "Heena");
  assert.ok(hi && hi.reply.startsWith(`${HINDI.note}\n`), String(hi?.reply));
  assert.ok(hi && /\nF\/HR\/05 is /.test(hi.reply), "then the answer the app can give");
  const hinglish = localAnswer("next holiday kab hai?", false, "Heena");
  assert.ok(hinglish && hinglish.reply.startsWith(`${HINDI.noteLatin}\n`), `a question in Latin letters gets the line in Latin letters: ${hinglish?.reply.slice(0, 80)}`);
  const gujaratiLatin = localAnswer("next holiday kyare che?", false, "Heena");
  assert.ok(gujaratiLatin && gujaratiLatin.chips?.some((c) => c.label === tr("gu", "ai.chip.calendar")), "Gujarati in Latin letters: the Gujarati words where the tables have them");
  assert.equal(withHindiNote(hi!.reply, "F/HR/05 क्या है?"), hi!.reply, "never twice");
  assert.equal(withHindiNote("Done.", "what is due today"), "Done.");
  assert.equal(answerLanguageFor("aaje nu record kholo"), "gu");
  assert.equal(answerLanguageFor("open the record"), "en");
  assert.equal(answerLanguageFor("aaj ka record kholo"), null, "Hindi has no table: the screens' language");
  assert.equal(answerLanguageFor("yes"), null);
  assert.equal(HINDI.note, "हिंदी में पूरा जवाब देने के लिए AI सेवा चाहिए, जो अभी उपलब्ध नहीं है।");
});
