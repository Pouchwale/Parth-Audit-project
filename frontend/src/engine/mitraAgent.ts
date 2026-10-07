// THE LOOP THAT MAKES MITRA AN AGENT (REQUIREMENTS §80).
//
// One turn: the person's words (with the text of any attached files) go to
// POST /api/assistant/agent with the tool schemas that apply right now
// (engine/mitraTools.ts). The model answers in words — the turn is over — or
// asks for tools; the browser runs them, one after another, appends each
// result as a tool message and asks again, until the model answers in words,
// asks the person something (ask_user), or eight rounds are up.
//
// WHAT THE CALLER SEES while it runs is a stream of events (MitraEvent): a
// thinking shimmer, one step per tool call (running → done or failed, with its
// card text), the model's interim words, a navigation, and at the end the
// final words or the question. Nothing here draws; the interface does.
//
// WHAT IT NEVER DOES: lose work. A failure of the model BEFORE any tool has
// changed anything is thrown, so the caller falls back to the app's own answer
// (REQUIREMENTS §72). After a page was opened or a record written, the same
// failure comes back as words — what was done, and that the model could not
// finish — never as a second, unrelated answer talking over the first.
//
// THE BUDGET (SPEC "Hard constraints"): history ≤ 6 pairs / 3,000 characters;
// attachment text inline ≤ 3,000 a file and 9,000 in all, the rest through the
// read_attachment tool; tool results ≤ 1,500 each and 12,000 a turn (the oldest
// replaced by "(result trimmed)" when over); the whole conversation ≤ 40 messages.
import type { AgentMessage, AgentResponse, MitraAttachment, MitraEvent, MitraStep, MitraToolContext, MitraTurnInput, MitraTurnOutput, ToolCall } from "./mitraTypes";
import { assistantApi } from "../api/client";
import { documentRepository } from "../data/repositories/documentRepository";
import { buildAssistantContext } from "./assistantLocal";
import { historyForModel } from "./historyDigest";
import { describeStep, documentOnPath, mitraTools, parseToolArgs, runTool, toolSchemas, TURN_STATE } from "./mitraTools";
import { t } from "../i18n";
import { generateId } from "../utils/id";
import { askedLanguage } from "../utils/scripts";

export const MAX_ROUNDS = 8;
export const MAX_TOOL_CHARS_PER_TURN = 12000;
export const INLINE_ATTACHMENT_CHARS = 3000;
export const INLINE_TOTAL_CHARS = 9000;
export const CONTEXT_CHARS = 2500;
/** The wire's limit on one user message (SPEC "Protocol"). */
const USER_MESSAGE_CHARS = 12000;
/** …and on the conversation. */
const MAX_MESSAGES = 40;
/** How many tool calls of one round are run; the rest are answered as not run. */
const MAX_CALLS_PER_ROUND = 8;
export const TRIMMED_RESULT = "(result trimmed)";

function say(key: string, english: string, vars: Record<string, string | number> = {}): string {
  const said = t(key, vars);
  if (said !== key.split(".").pop()) return said;
  return english.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// ---------------------------------------------------------------------------
// what goes up

/**
 * The person's words with their attachments' text inline: each under a
 * `[Attachment n: …]` heading the system prompt tells the model is data, the
 * first 3,000 characters of a file and 9,000 in all, and a line saying the
 * rest is had through read_attachment. A file that could not be read says so.
 */
export function buildUserContent(text: string, attachments: MitraAttachment[]): string {
  let body = text.trim();
  const bodyRoom = USER_MESSAGE_CHARS - 1500;
  if (body.length > bodyRoom) body = `${body.slice(0, bodyRoom - 1)}…`;
  if (attachments.length === 0) return body;
  const budget = Math.max(0, Math.min(INLINE_TOTAL_CHARS, USER_MESSAGE_CHARS - body.length - 800));
  let used = 0;
  let more = false;
  const blocks = attachments.map((a, i) => {
    const head = `[Attachment ${i + 1}: ${a.name} (${a.kind}, ${a.characters} chars; id=${a.id})]`;
    if (a.status === "failed") return `${head}\n(could not be read${a.note ? `: ${a.note}` : ""})`;
    if (a.status === "reading") {
      more = true;
      return `${head}\n(still being read — use read_attachment for its text)`;
    }
    if (!a.text.trim()) return `${head}\n(${a.note ?? "no readable text"})`;
    const room = Math.max(0, Math.min(INLINE_ATTACHMENT_CHARS, budget - used));
    const slice = a.text.slice(0, room);
    used += slice.length;
    if (slice.length < a.text.length) more = true;
    return `${head}\n${slice}${slice.length < a.text.length ? "\n…" : ""}`;
  });
  const tail = more ? "\n\n(Only the first part of each file is shown above. Use read_attachment(id, from, to) for the rest.)" : "";
  return `${body}\n\n${blocks.join("\n\n")}${tail}`.trim();
}

/**
 * The facts the model relies on: one line about the record or document on
 * screen, the attachments' ids, then the app's live facts (today, the weekly
 * off, what is due — engine/assistantLocal.ts). At most 2,500 characters.
 */
export function buildContext(ctx: MitraToolContext, round = 0): string {
  const lines: string[] = [];
  const tgt = ctx.target;
  if (tgt) {
    const doc = documentRepository.getById(tgt.documentId);
    const state = tgt.editable ? "editable" : `not editable${tgt.reopen ? " (can be reopened for correction)" : ""}`;
    lines.push(`Open record: ${tgt.title ?? doc?.name ?? tgt.documentId} — document ${tgt.documentId} (${tgt.documentKind}), status ${tgt.status}, ${state}, id ${tgt.recordId}. Read it with get_open_record before changing it.`);
  } else {
    const onPath = documentOnPath(ctx.currentRoute);
    const doc = onPath ? documentRepository.getById(onPath) : undefined;
    if (doc) lines.push(`Document page open: ${doc.formatNo} ${doc.name} (id ${doc.id}); no record is open.`);
  }
  // After the first round only the line about the screen goes up: the facts were said once (REQUIREMENTS §94).
  if (round > 0) return lines.join("\n").slice(0, CONTEXT_CHARS);
  if (ctx.attachments.length > 0) {
    const listed = ctx.attachments.map((a, i) => `${i + 1}. ${a.name} (${a.status}, ${a.characters} chars, id=${a.id})`).join("; ");
    lines.push(`Attachments in this conversation: ${listed}.`.slice(0, 400));
  }
  lines.push(buildAssistantContext(ctx.isDemo, ctx.userName));
  return lines.join("\n").slice(0, CONTEXT_CHARS);
}

/** How long the loop waits, after a tool opened a page, for that page to be on screen and its record registered. */
export const SCREEN_WAIT_MS = 2000;
const SCREEN_POLL_MS = 50;

/**
 * WAIT FOR THE PAGE A TOOL OPENED (REQUIREMENTS §94). The record page registers
 * its record in an effect after it is drawn; the round right after open_document
 * used to be built from the OLD screen, with no record to fill. So after a
 * navigation the loop waits — every 50 ms, at most 2 s — until the route is the
 * new one and, for /record/<id>, that record is the one registered.
 */
export async function waitForScreen(ctx: Pick<MitraToolContext, "currentRoute" | "target">, route: string, maxMs = SCREEN_WAIT_MS): Promise<boolean> {
  const want = route.length > 1 ? route.replace(/\/+$/, "") : route;
  const recordId = /^\/record\/([^/]+)/.exec(want)?.[1] ?? null;
  const there = (): boolean => {
    try {
      const at = ctx.currentRoute.length > 1 ? ctx.currentRoute.replace(/\/+$/, "") : ctx.currentRoute;
      return at === want && (!recordId || ctx.target?.recordId === recordId);
    } catch {
      return true;
    }
  };
  const started = Date.now();
  while (!there()) {
    if (Date.now() - started >= maxMs) return false;
    await new Promise((r) => setTimeout(r, SCREEN_POLL_MS));
  }
  return true;
}

// Words that claim something was filled in (REQUIREMENTS §94): never said when nothing was.
const CLAIMS_FILL_RE = /\b(?:filled|filling|entered|written|wrote|recorded|updated|saved)\b|भरा|भर दिया|भर दी|लिख दिया|ભર્યું|ભરી દીધું|લખ્યું|નોંધ્યું/i;
const FILL_ASK_RE = /\b(?:fill|enter|write|put|note|record|sample)\b|भर|लिख|दर्ज|ભર|લખ|નોંધ|\bbhar|\blikh/i;
const FILL_TOOLS = new Set(["fill_record", "edit_open_record", "fill_open_record_with_sample_data", "add_photo_to_open_record"]);

/** The language of the person's latest message, else the screens'. */
export function answerLanguageOf(text: string, fallback: "en" | "gu"): "en" | "hi" | "gu" {
  return askedLanguage(text) ?? fallback;
}

/**
 * The earlier turns of the conversation for the model — the person's and
 * Mitra's words only (tool messages are never stored): at most six, 800
 * characters each, 3,000 in all, the most recent kept (historyDigest.ts).
 */
export function historyForAgent(stored: readonly { role: "user" | "assistant"; text: string }[]): AgentMessage[] {
  return historyForModel(stored).map((x): AgentMessage => ({ role: x.role, content: x.text }));
}

// ---------------------------------------------------------------------------
// the turn

/** The oldest tool results replaced by a marker until the turn's results fit the budget. */
function trimToolResults(results: { content: string }[], budget = MAX_TOOL_CHARS_PER_TURN): void {
  let total = results.reduce((n, m) => n + m.content.length, 0);
  for (const m of results) {
    if (total <= budget) break;
    if (m.content === TRIMMED_RESULT) continue;
    total -= m.content.length - TRIMMED_RESULT.length;
    m.content = TRIMMED_RESULT;
  }
}

/** "Done so far: Opened the Dashboard; Filled 3 boxes on …." — what the steps that succeeded did. */
function soFar(steps: readonly MitraStep[], tail: string): string {
  const done = steps.filter((s) => s.status === "done" && s.tool !== "ask_user").map((s) => s.label);
  const lead = done.length ? say("ai.agent.doneSoFar", "Done so far: {what}.", { what: done.slice(0, 4).join("; ") }) : "";
  return [lead, tail].filter(Boolean).join(" ");
}

export async function runMitraTurn(input: MitraTurnInput): Promise<MitraTurnOutput> {
  const { ctx } = input;
  const turn: AgentMessage[] = [{ role: "user", content: buildUserContent(input.text, input.attachments) }];
  // One id for every round: the server counts the turn once against the person's allowance (REQUIREMENTS §94).
  const turnId = generateId("turn");
  TURN_STATE.set(ctx, {});
  const answerLanguage = answerLanguageOf(input.text, ctx.language);
  // The person asked for something to be written (not a question about what was).
  const askedFill = FILL_ASK_RE.test(input.text) && !/[?？]\s*$/.test(input.text.trim());
  const toolResults: { content: string }[] = [];
  const steps: MitraStep[] = [];
  let navigated: string | undefined;
  // Something the person can see has been done — a page opened, a record written.
  let changed = false;

  const emit = (e: MitraEvent): void => {
    try {
      input.onEvent(e);
    } catch (err) {
      console.error("A Mitra event handler failed", err);
    }
  };
  const finish = (raw: string): MitraTurnOutput => {
    // Words that claim a fill when nothing was written are not shown: what was done is (REQUIREMENTS §94).
    const wrote = steps.some((s) => s.status === "done" && FILL_TOOLS.has(s.tool));
    const text = askedFill && CLAIMS_FILL_RE.test(raw) && !wrote && !steps.some((s) => s.tool === "start_guided_fill" && s.status === "done") ? soFar(steps, say("ai.agent.nothingWritten", "Nothing was written on a record.")) : raw;
    turn.push({ role: "assistant", content: text });
    emit({ type: "final", text });
    return { messages: turn, final: text, steps, ...(navigated ? { navigated } : {}) };
  };

  emit({ type: "thinking" });
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (input.signal?.aborted) return finish(soFar(steps, say("ai.agent.stopped", "Stopped.")));
    // The tools that apply NOW, round by round: a record opened by the last
    // round's open_document is on screen by this one — when the host hands
    // `ctx.target` over as a live getter (see the wiring notes) — so "open
    // today's record and fill in the checker" is one turn, not two.
    const tools = mitraTools(ctx);
    const schemas = toolSchemas(tools);
    // The conversation stays under the wire's 40 messages: this turn's own come first, the history gives way.
    const room = Math.max(0, MAX_MESSAGES - turn.length - 2);
    const history = input.history.slice(Math.max(0, input.history.length - room));
    let res: AgentResponse;
    try {
      res = await assistantApi.agent({
        today: ctx.today,
        currentRoute: ctx.currentRoute,
        language: ctx.language,
        ...(ctx.userName.trim() ? { userName: ctx.userName.trim().slice(0, 40) } : {}),
        context: buildContext(ctx, round),
        tools: schemas,
        messages: [...history, ...turn],
        turnId,
        answerLanguage,
      });
    } catch (err) {
      // Nothing done yet: the caller falls back to the app's own answer (§72).
      if (!changed) throw err;
      console.error("Mitra's model could not finish the turn", err);
      return finish(soFar(steps, say("ai.agent.couldNotFinish", "The model could not finish the reply — what was done is done.")));
    }

    const calls: ToolCall[] = res.kind === "tools" && Array.isArray(res.calls) ? res.calls.filter((c) => !!c && typeof c.function?.name === "string") : [];
    if (res.kind === "final" || calls.length === 0) {
      const words = (res.kind === "final" ? res.text : res.text ?? "") || "";
      return finish(words.trim() || say("ai.agent.noWords", "Done."));
    }
    if (res.text && res.text.trim()) emit({ type: "text", text: res.text });
    turn.push({ role: "assistant", content: res.text ?? null, tool_calls: calls });

    let ask: { question: string; options: string[] } | undefined;
    let ended: string | undefined;
    for (const [index, call] of calls.entries()) {
      const id = call.id || generateId("call");
      const name = call.function.name;
      const tool = tools.find((x) => x.name === name);
      const answer = (content: string): void => {
        const m = { role: "tool" as const, tool_call_id: id, content };
        turn.push(m);
        toolResults.push(m);
      };
      if (!tool) {
        answer(JSON.stringify({ ok: false, error: "unknown tool" }));
        const step: MitraStep = { id, tool: name, label: say("ai.agent.unknownTool", "{tool} is not one of Mitra's tools", { tool: name }), status: "failed" };
        steps.push(step);
        emit({ type: "step", ...step });
        continue;
      }
      if (ask || ended !== undefined || index >= MAX_CALLS_PER_ROUND) {
        answer(JSON.stringify({ ok: false, error: ask || ended !== undefined ? "not run: the turn ended" : "not run: too many calls in one round" }));
        continue;
      }
      const label = describeStep(name, parseToolArgs(call.function.arguments) ?? {});
      emit({ type: "step", id, tool: name, label, status: "running" });
      const run = await runTool(tool, call.function.arguments, ctx);
      if (run.ok && tool.writes) changed = true;
      const step: MitraStep = { id, tool: name, label: run.card || label, status: run.ok ? "done" : "failed" };
      steps.push(step);
      emit({ type: "step", ...step });
      if (run.navigated) {
        navigated = run.navigated;
        emit({ type: "navigated", route: run.navigated });
        // The next tool, and the next round, see the page that was opened.
        await waitForScreen(ctx, run.navigated);
      }
      answer(run.content);
      if (tool.endsTurn) {
        const r = run.result as { question?: unknown; options?: unknown; say?: unknown } | null;
        const options = Array.isArray(r?.options) ? r.options.map((o) => str(o)).filter(Boolean) : [];
        // A fill (or a walk-through) ends with the engine's own words, or with the question it asks.
        if (str(r?.say) && (options.length === 0 || !str(r?.question))) ended = str(r?.say);
        else if (run.ok || str(r?.question)) ask = { question: str(r?.question) || label, options };
      }
    }
    trimToolResults(toolResults);
    if (ended !== undefined) return finish(ended);
    if (ask) {
      emit({ type: "ask", ...ask });
      return { messages: turn, final: null, ask, steps, ...(navigated ? { navigated } : {}) };
    }
  }
  return finish(soFar(steps, say("ai.agent.roundsUsed", "I stopped there — tell me how to go on.")));
}
