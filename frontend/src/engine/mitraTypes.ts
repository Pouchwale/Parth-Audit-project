// THE SHAPES MITRA'S AGENT SHARES between the engine (engine/mitraAgent.ts,
// engine/mitraTools.ts, engine/mitraAttachments.ts), the interface
// (components/mitra/*) and the server (backend/mitraAgent.ts mirrors the wire
// shapes below by hand). REQUIREMENTS §80: Mitra as an agent with tools.
import type { AssistantTarget } from "../store/AssistantContext";
import type { ChipAction } from "./guidedChecklist";

// ---- the wire (frontend ⇄ POST /api/assistant/agent) ---------------------

/** One tool the model may call, in the OpenAI function shape Groq takes. */
export interface ToolSchema {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** A call the model asked for; `arguments` is JSON text. */
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface AgentRequest {
  today: string;
  currentRoute: string;
  language: "en" | "gu";
  userName?: string;
  context?: string;
  tools: ToolSchema[];
  messages: AgentMessage[];
  /** One id for every round of one turn: the server counts the turn once (REQUIREMENTS §94). */
  turnId?: string;
  /** The language and script of the person's latest message, for the reply (REQUIREMENTS §89, §94). */
  answerLanguage?: "en" | "hi" | "gu";
}

// ---- a fill's one small model call (POST /api/assistant/fill, REQUIREMENTS §94) ----

/** What the browser sends: the person's words, the form's card, and — when the document is not certain — the candidates. */
export interface FillModelRequest {
  words: string;
  card?: string;
  candidates?: string;
  today: string;
  language: "en" | "hi" | "gu";
  turnId?: string;
}

/** What comes back: the values in the fixed shape, or the document picked. */
export type FillModelResponse =
  | { kind: "values"; values: Record<string, unknown>; usage?: { total: number } }
  | { kind: "pick"; doc: string | null; date: string | null; unclear: string; usage?: { total: number } };

export type AgentResponse = { kind: "final"; text: string } | { kind: "tools"; text: string | null; calls: ToolCall[] };

// ---- attachments -----------------------------------------------------------

export type AttachmentKind = "pdf" | "docx" | "xlsx" | "csv" | "text" | "image" | "unknown";

export interface MitraAttachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  size: number;
  status: "reading" | "ready" | "failed";
  /** The file's words as the server read them (empty until read, or when it had none). */
  text: string;
  characters: number;
  truncated?: boolean;
  /** Plain words for the person when the file could not be read, or was read only in part. */
  note?: string;
  /** Images only (≤ 2 MB): for the preview and add_photo_to_open_record. */
  dataUrl?: string;
  readBy?: "text" | "ocr";
}

/** What POST /api/assistant/extract answers. */
export interface ExtractResult {
  name: string;
  kind: AttachmentKind;
  text: string;
  characters: number;
  truncated: boolean;
  pages?: number;
  sheets?: string[];
  note?: string;
  readBy: "text" | "ocr";
}

/** What POST /api/assistant/transcribe answers. */
export interface TranscribeResult {
  text: string;
  language?: string;
  seconds?: number;
}

// ---- tools -----------------------------------------------------------------

export interface MitraToolContext {
  today: string;
  isDemo: boolean;
  language: "en" | "gu";
  userName: string;
  currentRoute: string;
  navigate: (route: string) => void;
  /**
   * The open record's bindings (store/AssistantContext.tsx); null on any other
   * page. Best handed over as a live getter (`get target() { return getTarget(); }`):
   * the loop asks again each round, so a record opened by one tool can be
   * filled by the next in the same turn.
   */
  target: AssistantTarget | null;
  /** AppStore.bump — after a change to the working copy. */
  bump: () => void;
  /** This conversation's attachments, text already read. */
  attachments: MitraAttachment[];
  /** Asked of the person as two chips; resolves with their click. */
  confirm: (question: string, yes: string, no: string) => Promise<boolean>;
  /** The widget's own flows — startInterview, sampleFill, askSubmit … — when the widget is the host. */
  runWidgetAction?: (action: ChipAction) => void;
  /** The person's words this turn, for history notes ("Asked of Mitra: …"). */
  userWords: string;
  /**
   * The host's fill (components/mitra/useMitraFill.ts): DCRS's own engine reads
   * the values from userWords, plans, asks about a finding, writes and answers in
   * the person's language. The fill_record tool hands a fill here (REQUIREMENTS §94).
   */
  fill?: (args: { documentId?: string; dateISO?: string; recordId?: string; sample?: boolean }) => Promise<MitraToolResult>;
}

export interface MitraToolResult {
  ok: boolean;
  /** Compact, JSON-serialisable; the loop stringifies and caps it. */
  result: unknown;
  /** What the interface shows for this step, e.g. "Opened Insights". */
  card: string;
  /** The route the tool sent the person to, if it did. */
  navigated?: string;
}

export interface MitraTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>, ctx: MitraToolContext) => Promise<MitraToolResult> | MitraToolResult;
  /**
   * The turn ends with this tool: ask_user with its question; fill_record and
   * start_guided_fill with the words their result carries (`say`), or the
   * question they ask (`question` with `options`).
   */
  endsTurn?: boolean;
  /**
   * The tool changes something the person can see — a page opened, a record
   * written, a format saved. Once one has succeeded in a turn, a failure of the
   * model afterwards is reported as words rather than thrown, so the caller's
   * fallback never repeats or talks over the work already done.
   */
  writes?: boolean;
}

/** What running one tool call came to (engine/mitraTools.ts runTool): the result, and its capped JSON for the model. */
export interface MitraToolRun {
  ok: boolean;
  result: unknown;
  /** `JSON.stringify(result)`, at most 1,500 characters — the tool message's content. */
  content: string;
  card: string;
  navigated?: string;
}

// ---- the loop's events and output ------------------------------------------

export type MitraEvent =
  | { type: "thinking" }
  | { type: "step"; id: string; tool: string; label: string; status: "running" | "done" | "failed" }
  | { type: "text"; text: string }
  | { type: "final"; text: string }
  | { type: "ask"; question: string; options: string[] }
  | { type: "navigated"; route: string };

export interface MitraStep {
  id: string;
  tool: string;
  label: string;
  status: "running" | "done" | "failed";
}

export interface MitraTurnInput {
  text: string;
  attachments: MitraAttachment[];
  /** Earlier user/assistant turns of this conversation (tool messages dropped), at most six pairs. */
  history: AgentMessage[];
  ctx: MitraToolContext;
  onEvent: (e: MitraEvent) => void;
  signal?: AbortSignal;
}

export interface MitraTurnOutput {
  /** This turn's messages, to append to the stored history (user, assistant, tool …). */
  messages: AgentMessage[];
  final: string | null;
  ask?: { question: string; options: string[] };
  steps: MitraStep[];
  navigated?: string;
}
