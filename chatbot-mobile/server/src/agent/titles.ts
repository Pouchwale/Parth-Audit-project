import type { FastifyBaseLogger } from 'fastify';
import type { AiService } from '../ai.ts';
import type { Config } from '../config.ts';
import { shorten } from './transcript.ts';

/** Names a conversation after its first message. Tests swap in a fake. */
export type Titler = (firstMessage: string) => Promise<string>;

// "Using its key words" keeps a small model from paraphrasing domain terms away (it named a request about
// findings "Open Research Questions").
const INSTRUCTIONS = 'Write a 2-6 word title for a conversation that starts with this request, using its key words. Reply with the title only.';

/**
 * Titles on the short-jobs model (DCRS REQUIREMENTS §109): AI_SHORT_MODEL, gpt-5.4-nano, which answers at once with
 * reasoning_effort "none", and the second model when it cannot; on Groq GROQ_TITLE_MODEL, gpt-oss-20b thinking with low
 * effort, as before. Asked once the reply's first words are on their way, never before them (agent.ts).
 */
export function aiTitler(config: Config, service: AiService): Titler {
  const openai = service.provider === 'openai';
  return async (firstMessage) => {
    const completion = await service.complete(
      [config.titleModel, ...(openai && config.fallbackModel ? [config.fallbackModel] : [])],
      {
        messages: [
          { role: 'system', content: INSTRUCTIONS },
          { role: 'user', content: firstMessage },
        ],
        groqEffort: 'low',
        // On Groq, reasoning counts toward this (about 40 tokens at low effort), leaving room for a short title. ChatGPT's
        // short model does not reason here, and six words of Gujarati are well under 60 tokens.
        maxTokens: openai ? 60 : 100,
      },
      // A title is never worth a long wait: past this the conversation is named after its first words.
      { timeoutMs: 10_000, use: 'other' },
    );
    const choice = completion.choices[0];
    // A title cut off part-way is no title.
    return choice?.finish_reason === 'stop' ? (choice.message.content ?? '') : '';
  };
}

/** A title for a new conversation: the titler's, or the start of the first message when it has none. Never fails. */
export async function titleFor(titler: Titler | undefined, firstMessage: string, log: FastifyBaseLogger): Promise<string> {
  try {
    const title = titler ? clean(await titler(firstMessage)) : '';
    if (title) return title;
  } catch (error) {
    log.warn({ err: error }, 'could not generate a conversation title');
  }
  return shorten(firstMessage, 40);
}

function clean(title: string): string {
  return shorten(title.replace(/^[\s"'`*_“”‘’.,:;!?-]+|[\s"'`*_“”‘’.,:;!?-]+$/g, ''), 60);
}
