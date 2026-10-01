// Mitra's natural voice on the server (REQUIREMENTS §81): backend/tts.ts cuts a
// line into the pieces the speech model accepts, joins the WAV clips it answers
// into one, keeps the last clips in memory and words each failure for the
// route; backend/groq.ts groqSpeak asks Groq piece by piece. Groq is stood in
// for here (globalThis.fetch is replaced for the groqSpeak cases) — nothing goes
// out on the network. Run: npm run test:unit -- tts
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  chunkForSpeech,
  joinWavs,
  parseWav,
  SpeechCache,
  speakFailure,
  speakStatus,
  speechCacheKey,
  termsRequired,
  TTS_CHUNK_CHARS,
  VOICE_RECHECK_MS,
  VoiceAvailability,
  voiceUnavailableMessage,
  VoiceNotConfiguredError,
  VoiceUnavailableError,
} from "../tts.ts";
import { groqSpeak, ttsModel, ttsVoiceName } from "../groq.ts";

// ---------------------------------------------------------------------------
// a WAV writer: PCM, any rate/channels/bits, optionally written "as a stream"
// (sizes unknown) and with an extra chunk before the samples

function wav({
  samples,
  sampleRate = 24000,
  channels = 1,
  bits = 16,
  streaming = false,
  listChunk = false,
}: {
  samples: Buffer;
  sampleRate?: number;
  channels?: number;
  bits?: number;
  streaming?: boolean;
  listChunk?: boolean;
}): Buffer {
  const fmt = Buffer.alloc(16);
  const blockAlign = (channels * bits) / 8;
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(channels, 2);
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE(sampleRate * blockAlign, 8);
  fmt.writeUInt16LE(blockAlign, 12);
  fmt.writeUInt16LE(bits, 14);
  const chunk = (id: string, body: Buffer, size = body.length) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, "latin1");
    head.writeUInt32LE(size, 4);
    return Buffer.concat([head, body, body.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  // "INFO" and an odd-length body, so the reader must skip the pad byte.
  const list = listChunk ? chunk("LIST", Buffer.from("INFOISFT\u0003\u0000\u0000\u0000abc", "latin1")) : Buffer.alloc(0);
  const body = Buffer.concat([Buffer.from("WAVE", "latin1"), chunk("fmt ", fmt), list, chunk("data", samples, streaming ? 0xffffffff : samples.length)]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, "latin1");
  riff.writeUInt32LE(streaming ? 0xffffffff : body.length, 4);
  return Buffer.concat([riff, body]);
}

const pcm = (...values: number[]): Buffer => {
  const b = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => b.writeInt16LE(v, i * 2));
  return b;
};

// ---------------------------------------------------------------------------

describe("chunkForSpeech — the pieces the model is asked to say", () => {
  it("keeps a short line whole, collapsing its spaces", () => {
    assert.deepEqual(chunkForSpeech("  Good morning,   Heena!\n"), ["Good morning, Heena!"]);
    assert.deepEqual(chunkForSpeech(""), []);
    assert.deepEqual(chunkForSpeech("   "), []);
  });

  it("cuts a long briefing at the ends of sentences, every piece within the model's 200 characters, nothing lost", () => {
    const text =
      "Good morning, Heena. You have three records ready for your OK, two that need a detail only you know, and one still open from earlier. " +
      "Start with the Line Clearance Checklist, then the Daily Pest Control Monitoring Record. " +
      "Every check you record is a customer who never receives a faulty pack. Your score this month is 92.5% — keep it there. " +
      "Finish the late one first; it counts against the on-time score until it is in.";
    const pieces = chunkForSpeech(text);
    assert.ok(pieces.length >= 3, `expected several pieces, got ${pieces.length}`);
    for (const p of pieces) assert.ok(p.length <= TTS_CHUNK_CHARS, `a piece of ${p.length} characters: ${p}`);
    assert.equal(pieces.join(" "), text.replace(/\s+/g, " ").trim());
    // A sentence that fits is never cut in the middle.
    for (const p of pieces) assert.match(p, /[.!?]$/, `a piece that does not end a sentence: ${p}`);
    // A decimal point is not the end of a sentence.
    assert.ok(pieces.some((p) => p.includes("92.5%")));
  });

  it("cuts one over-long sentence at its commas, then between words", () => {
    const clause = "the adhesive mixing record for the second shift of the lamination line";
    const sentence = `Please finish ${[clause, clause, clause, clause].join(", ")}.`;
    assert.ok(sentence.length > TTS_CHUNK_CHARS);
    const pieces = chunkForSpeech(sentence);
    assert.ok(pieces.length >= 2);
    for (const p of pieces) assert.ok(p.length <= TTS_CHUNK_CHARS);
    assert.equal(pieces.join(" "), sentence);
    assert.ok(pieces.slice(0, -1).every((p) => p.endsWith(",")), `cut at a comma: ${JSON.stringify(pieces)}`);

    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const byWords = chunkForSpeech(words);
    for (const p of byWords) assert.ok(p.length <= TTS_CHUNK_CHARS);
    assert.equal(byWords.join(" "), words);
  });

  it("cuts a 'word' longer than a whole piece anywhere, rather than send it too long", () => {
    const long = "x".repeat(450);
    const pieces = chunkForSpeech(`Code ${long} ends.`, 200);
    for (const p of pieces) assert.ok(p.length <= 200);
    assert.equal(pieces.join("").replace(/\s/g, ""), `Code${long}ends.`);
  });

  it("the 600 characters a browser may send are four pieces at most", () => {
    const text = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} is here, with a few more words.`).join(" ").slice(0, 600);
    assert.ok(chunkForSpeech(text).length <= 4);
  });
});

describe("parseWav and joinWavs — one clip from several", () => {
  it("reads a WAV's format and where its samples are, past other chunks and a pad byte", () => {
    const samples = pcm(1, 2, 3, 4);
    const info = parseWav(wav({ samples, listChunk: true }));
    assert.equal(info.audioFormat, 1);
    assert.equal(info.channels, 1);
    assert.equal(info.sampleRate, 24000);
    assert.equal(info.bitsPerSample, 16);
    assert.equal(info.blockAlign, 2);
    assert.equal(info.dataLength, samples.length);
  });

  it("reads a clip written as a stream (sizes unknown) to the end of the file", () => {
    const samples = pcm(5, 6, 7);
    const info = parseWav(wav({ samples, streaming: true }));
    assert.equal(info.dataLength, samples.length);
  });

  it("refuses what is not a WAV", () => {
    assert.throws(() => parseWav(Buffer.from("{\"error\":{}}")));
    assert.throws(() => parseWav(Buffer.alloc(4)));
  });

  it("joins clips: one header, the samples one after another, the sizes rewritten", () => {
    const a = pcm(1, 2, 3);
    const b = pcm(4, 5);
    const c = pcm(6);
    const joined = joinWavs([wav({ samples: a }), wav({ samples: b, streaming: true }), wav({ samples: c, listChunk: true })]);
    const info = parseWav(joined);
    const all = Buffer.concat([a, b, c]);
    assert.equal(info.dataLength, all.length);
    assert.deepEqual(joined.subarray(info.dataOffset, info.dataOffset + info.dataLength), all);
    assert.equal(joined.readUInt32LE(4), joined.length - 8, "the RIFF size is the file less its first eight bytes");
    assert.equal(joined.toString("latin1", 0, 4), "RIFF");
    assert.equal(info.sampleRate, 24000);
    // Only one header in the whole file.
    assert.equal(joined.toString("latin1").split("WAVE").length - 1, 1);
  });

  it("drops a clip's trailing part-frame so the next clip starts on a frame", () => {
    const whole = pcm(1, 2);
    const ragged = Buffer.concat([whole, Buffer.from([9])]);
    const joined = joinWavs([wav({ samples: ragged }), wav({ samples: pcm(3) })]);
    const info = parseWav(joined);
    assert.deepEqual(joined.subarray(info.dataOffset, info.dataOffset + info.dataLength), Buffer.concat([whole, pcm(3)]));
  });

  it("refuses clips of different formats", () => {
    assert.throws(() => joinWavs([wav({ samples: pcm(1) }), wav({ samples: pcm(1), sampleRate: 22050 })]));
    assert.throws(() => joinWavs([]));
  });
});

describe("SpeechCache — the last clips, in memory", () => {
  it("keeps at most its number of clips, forgetting the least recently used", () => {
    const cache = new SpeechCache(3, 1000);
    cache.set("a", Buffer.alloc(10));
    cache.set("b", Buffer.alloc(10));
    cache.set("c", Buffer.alloc(10));
    assert.ok(cache.get("a"), "a used again");
    cache.set("d", Buffer.alloc(10));
    assert.equal(cache.size, 3);
    assert.equal(cache.get("b"), undefined, "b was the least recently used");
    assert.ok(cache.get("a") && cache.get("c") && cache.get("d"));
  });

  it("keeps at most its bytes, and never a clip bigger than all of them", () => {
    const cache = new SpeechCache(60, 100);
    cache.set("a", Buffer.alloc(60));
    cache.set("b", Buffer.alloc(60));
    assert.equal(cache.get("a"), undefined);
    assert.equal(cache.bytes, 60);
    cache.set("huge", Buffer.alloc(101));
    assert.equal(cache.get("huge"), undefined);
    cache.set("b", Buffer.alloc(30));
    assert.equal(cache.bytes, 30, "a clip set again replaces the old one's bytes");
  });

  it("is keyed by voice and text", () => {
    assert.notEqual(speechCacheKey("female", "Hello"), speechCacheKey("male", "Hello"));
  });
});

describe("what the route answers when the voice cannot be made", () => {
  it("knows Groq's terms answer, in JSON or not", () => {
    const body = JSON.stringify({ error: { message: "The model requires terms acceptance.", type: "invalid_request_error", code: "model_terms_required" } });
    assert.equal(termsRequired(body), true);
    assert.equal(termsRequired("error: model_terms_required"), true);
    assert.equal(termsRequired(JSON.stringify({ error: { code: "rate_limit_exceeded" } })), false);
    assert.equal(termsRequired(""), false);
  });

  it("503 voice-unavailable, with what the admin must do; 503 not-configured; 502 otherwise — never Groq's words", () => {
    const unavailable = speakFailure(new VoiceUnavailableError("canopylabs/orpheus-v1-english"));
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.code, "voice-unavailable");
    assert.equal(
      unavailable.body.error,
      "Mitra's natural voice needs the Groq organisation's admin to accept the model's terms at console.groq.com (canopylabs/orpheus-v1-english)."
    );
    assert.equal(voiceUnavailableMessage("m"), "Mitra's natural voice needs the Groq organisation's admin to accept the model's terms at console.groq.com (m).");
    const none = speakFailure(new VoiceNotConfiguredError());
    assert.equal(none.status, 503);
    assert.equal(none.body.code, "not-configured");
    const other = speakFailure(new Error("Speech request failed (500): {\"error\":{\"message\":\"secret org org_123\"}}"));
    assert.equal(other.status, 502);
    assert.equal(other.body.code, "failed");
    assert.doesNotMatch(other.body.error, /org_123|500/);
  });
});

describe("groqSpeak — piece by piece, with Groq stood in for", () => {
  const realFetch = globalThis.fetch;
  const realKey = process.env.GROQ_API_KEY;
  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = realKey;
    delete process.env.GROQ_TTS_VOICE_MALE;
  });

  const answerWith = (handler: (body: Record<string, unknown>, n: number) => Response) => {
    const calls: Record<string, unknown>[] = [];
    let inFlight = 0;
    let most = 0;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push(body);
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return handler(body, calls.length);
    }) as typeof fetch;
    return { calls, most: () => most };
  };

  it("asks for each piece in turn, in the chosen voice, and joins the clips", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const stub = answerWith((_body, n) => new Response(new Uint8Array(wav({ samples: pcm(n, n) })), { status: 200, headers: { "content-type": "audio/wav" } }));
    const text = Array.from({ length: 8 }, (_, i) => `This is sentence ${i + 1} of the morning briefing for the plant.`).join(" ");
    const clip = await groqSpeak({ text, voice: "female" });
    const pieces = chunkForSpeech(text);
    assert.equal(stub.calls.length, pieces.length);
    assert.equal(stub.most(), 1, "one call at a time");
    for (const [i, call] of stub.calls.entries()) {
      assert.equal(call.input, pieces[i]);
      assert.ok(String(call.input).length <= TTS_CHUNK_CHARS);
      assert.equal(call.model, ttsModel());
      assert.equal(call.voice, "hannah");
      assert.equal(call.response_format, "wav");
    }
    const info = parseWav(clip);
    assert.equal(info.dataLength, pieces.length * 4);
  });

  it("uses the male voice, and the plant's own choice of it", async () => {
    process.env.GROQ_API_KEY = "test-key";
    assert.equal(ttsVoiceName("male"), "daniel");
    process.env.GROQ_TTS_VOICE_MALE = "troy";
    const stub = answerWith(() => new Response(new Uint8Array(wav({ samples: pcm(1) })), { status: 200, headers: { "content-type": "audio/wav" } }));
    await groqSpeak({ text: "Hello.", voice: "male" });
    assert.equal(stub.calls[0].voice, "troy");
  });

  it("the terms not accepted: VoiceUnavailableError, after one call", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const stub = answerWith(
      () =>
        new Response(JSON.stringify({ error: { message: "The model `canopylabs/orpheus-v1-english` requires terms acceptance.", type: "invalid_request_error", code: "model_terms_required" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })
    );
    await assert.rejects(groqSpeak({ text: "Good morning. ".repeat(30), voice: "female" }), (err: unknown) => err instanceof VoiceUnavailableError);
    assert.equal(stub.calls.length, 1);
  });

  it("any other failure is an ordinary error; no key is VoiceNotConfiguredError", async () => {
    process.env.GROQ_API_KEY = "test-key";
    answerWith(() => new Response("upstream down", { status: 500 }));
    await assert.rejects(groqSpeak({ text: "Hello.", voice: "female" }), (err: unknown) => err instanceof Error && !(err instanceof VoiceUnavailableError));
    answerWith(() => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
    await assert.rejects(groqSpeak({ text: "Hello.", voice: "female" }), /instead of audio/);
    delete process.env.GROQ_API_KEY;
    await assert.rejects(groqSpeak({ text: "Hello.", voice: "female" }), (err: unknown) => err instanceof VoiceNotConfiguredError);
  });
});

// ---------------------------------------------------------------------------
// REQUIREMENTS §85: whether the server can speak — learnt once, remembered, and
// told to a browser with a 200 (GET /api/assistant/speak), never found out by a
// failed request in its console.

describe("VoiceAvailability and speakStatus — asked once, remembered", () => {
  const model = "canopylabs/orpheus-v1-english";
  const voices = { female: "hannah", male: "daniel" };

  it("knows nothing at first: the server must ask Groq once", () => {
    const a = new VoiceAvailability();
    assert.equal(a.current(1000), null);
    assert.equal(a.refusing(1000), false);
  });

  it("the terms not accepted: remembered for ten minutes, news only the first time (one line in the server's log)", () => {
    const a = new VoiceAvailability();
    assert.equal(a.markUnavailable(model, 0), true);
    assert.equal(a.markUnavailable(model, 1000), false, "already known: not said again");
    assert.equal(a.refusing(5 * 60 * 1000), true);
    assert.equal(a.current(1000 + VOICE_RECHECK_MS["voice-unavailable"]), null, "asked again after ten minutes: the admin may have accepted them");
    assert.equal(a.markUnavailable(model, 20 * 60 * 1000), true, "news again once it had run out");
  });

  it("a failure is kept two minutes, a working voice an hour", () => {
    const a = new VoiceAvailability();
    a.markFailed(model, 0);
    assert.equal(a.current(1000)?.code, "failed");
    assert.equal(a.refusing(1000), false, "a failure is not a refusal: a line may still be tried");
    assert.equal(a.current(VOICE_RECHECK_MS.failed), null);
    a.markAvailable(model, 0);
    assert.equal(a.current(59 * 60 * 1000)?.code, "available");
    assert.equal(a.current(60 * 60 * 1000), null);
    a.forget();
    assert.equal(a.current(0), null);
  });

  it("the GET's answer: available or not, why in plain words, the voices, and how long to keep it", () => {
    const ok = speakStatus("available", model, voices, 0, VOICE_RECHECK_MS.available);
    assert.deepEqual(
      { available: ok.available, code: ok.code, engine: ok.engine, voices: ok.voices, recheck: ok.recheckAfterMs },
      { available: true, code: "available", engine: "groq", voices, recheck: VOICE_RECHECK_MS.available }
    );
    const terms = speakStatus("voice-unavailable", model, voices, 4 * 60 * 1000, 10 * 60 * 1000);
    assert.equal(terms.available, false);
    assert.equal(terms.engine, null);
    assert.equal(terms.message, voiceUnavailableMessage(model), "what the Groq organisation's admin must do");
    assert.match(terms.message, /accept the model's terms at console\.groq\.com/);
    assert.equal(terms.recheckAfterMs, 6 * 60 * 1000, "only as long as the server itself goes by it");
    const none = speakStatus("not-configured", model, voices);
    assert.equal(none.available, false);
    assert.equal(none.voices, null);
    assert.match(none.message, /GROQ_API_KEY/);
    const failed = speakStatus("failed", model, voices, 0);
    assert.equal(failed.recheckAfterMs, VOICE_RECHECK_MS.failed);
    for (const s of [ok, terms, none, failed]) assert.doesNotMatch(s.message, /invalid_request_error|api key|Bearer/i, "never Groq's own words");
    assert.ok(speakStatus("voice-unavailable", model, voices, 10, 11).recheckAfterMs >= 1000, "never a zero that would have a browser ask at once");
  });
});
