import { AiConnectionError, type AiService } from '../ai.ts';
import type { Config } from '../config.ts';
import type { Connector } from '../connectors/types.ts';

export interface Recording {
  data: Buffer;
  /** Its extension tells the service the audio format. */
  filename: string;
  mimeType: string;
}

/** Turns a voice recording into text. Tests swap in a fake. */
export type Transcriber = (audio: Recording) => Promise<string>;

/** The languages people speak to Mitra, and a short request in each, in its own script. */
const LANGUAGES = "English, Gujarati, Hindi: Open today's record. આજનો રેકોર્ડ ખોલો. आज का रिकॉर्ड खोलो.";

/**
 * The words the model is shown before it hears a recording: the assistant's name, each connected system with the words
 * people say about it (DCRS's short name, the plant, its format numbers), then the three languages, named and each
 * shown by a short request in its own script. Groq's docs (console.groq.com/docs/speech-to-text): the prompt is to
 * "guide the model's style or specify how to spell unfamiliar words", it is "limited to 224 tokens", and it should "use
 * the same language as the language of the audio file"; OpenAI's transcription models take a prompt the same way. A
 * recording may be in any of the three, so all three are there. With the DCRS connector it is 123 tokens in Whisper's
 * own tokenizer (multilingual.tiktoken), where a Gujarati letter can take two or three.
 */
export function transcriptionPrompt(connectors: readonly Connector[]): string {
  const systems = connectors.map((c) => [c.name, ...(c.spokenTerms ?? [])].join(', ')).join('; ');
  return `Mitra; ${systems}. ${LANGUAGES}`;
}

/**
 * What a person said (DCRS REQUIREMENTS §109): on ChatGPT gpt-4o-mini-transcribe (AI_TRANSCRIBE_MODEL), which hears
 * Gujarati, Hindi and English and answers "json" with the tokens it used, counted against the day's allowance; on Groq
 * Whisper (GROQ_TRANSCRIPTION_MODEL), as before. A Whisper model is asked for "json" at temperature 0 on either. No
 * language is set: the model tells it from the audio, as people speak English, Gujarati or Hindi, and often mix them.
 */
export function aiTranscriber(config: Config, service: AiService, connectors: readonly Connector[]): Transcriber {
  const prompt = transcriptionPrompt(connectors);
  const whisper = /whisper/i.test(config.transcriptionModel);
  return async ({ data, filename, mimeType }) => {
    service.ready('other');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(data)], { type: mimeType }), filename);
    form.append('model', config.transcriptionModel);
    form.append('prompt', prompt);
    form.append('response_format', 'json');
    if (whisper) form.append('temperature', '0');
    // A recording is at most a minute or two, heard in a few seconds; the rest is room for a slow upload.
    const response = await service.send('/audio/transcriptions', form, { timeoutMs: 60_000 });
    if (!response.ok) throw await service.refusal(response);
    let body: { text?: unknown; usage?: { type?: unknown; total_tokens?: unknown } } | null;
    try {
      body = (await response.json()) as typeof body;
    } catch {
      throw new AiConnectionError('The transcription came back in a way this server does not understand.');
    }
    if (body?.usage?.type === 'tokens') service.meter.count(body.usage.total_tokens);
    if (typeof body?.text !== 'string') throw new AiConnectionError('The transcription came back without its text.');
    return body.text.trim();
  };
}
