// THE AGENT LOOP (REQUIREMENTS §80, engine/mitraAgent.ts), driven against a
// scripted /api/assistant/agent: the model asks for tools, the browser runs
// them and asks again, until the model answers in words or asks the person.
//   * the events come in order — thinking, the interim words, each step
//     running then done or failed, a navigation, the final words;
//   * an unknown tool is answered as one, so the model can read it;
//   * ask_user ends the turn with the question and its options;
//   * a failure of the model before anything was changed is thrown (the caller
//     falls back, §72); after a page was opened it comes back as words;
//   * eight rounds at most; tool results trimmed to 12,000 characters a turn;
//   * what goes up is capped: attachments inline, the history, the context.
import test from "node:test";
import assert from "node:assert/strict";
import type { AgentRequest, AgentResponse, MitraAttachment, MitraEvent, MitraToolContext, ToolCall } from "../src/engine/mitraTypes";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { ApiError } from "../src/api/client";
import { buildContext, buildUserContent, historyForAgent, runMitraTurn, TRIMMED_RESULT } from "../src/engine/mitraAgent";
import { todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

// store/router.tsx reads window.location the moment it loads (the navigate tool
// loads it to check a route); the harness stands up no location, so one is here.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "" }, configurable: true, writable: true });
}

const today = todayISO();

interface Scripted {
  status: number;
  body: unknown;
}

/** POST /api/assistant/agent answered from a script, each request kept for the checks. */
function mockAgent(replies: Scripted[]) {
  const real = globalThis.fetch;
  const requests: { url: string; body: AgentRequest }[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as AgentRequest;
    requests.push({ url: String(url), body });
    const reply = replies.shift() ?? { status: 502, body: { error: "no reply was scripted for this call" } };
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return {
    requests,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

const call = (id: string, name: string, args: unknown): ToolCall => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const tools = (text: string | null, calls: ToolCall[]): Scripted => ({ status: 200, body: { kind: "tools", text, calls } satisfies AgentResponse });
const final = (text: string): Scripted => ({ status: 200, body: { kind: "final", text } satisfies AgentResponse });
const failure = (): Scripted => ({ status: 502, body: { error: "The assistant could not be reached." } });

interface TestCtx extends MitraToolContext {
  navigated: string[];
}

function ctxOf(over: Partial<MitraToolContext> = {}): TestCtx {
  const navigated: string[] = [];
  return {
    today,
    isDemo: true,
    language: "en",
    userName: "Unit Test",
    currentRoute: "/dashboard",
    navigate: (route) => {
      navigated.push(route);
    },
    target: null,
    bump: () => {},
    attachments: [],
    confirm: async () => true,
    userWords: "",
    ...over,
    navigated,
  };
}

const kinds = (events: MitraEvent[]) => events.map((e) => (e.type === "step" ? `step:${e.status}` : e.type));

// ---------------------------------------------------------------------------

test("a turn runs the tools the model asks for, in order, and comes back with the model's words", async () => {
  const mock = mockAgent([tools("Opening it…", [call("c1", "navigate", { route: "/reports" }), call("c2", "no_such_tool", {})]), final("Opened the Reports page.")]);
  try {
    const events: MitraEvent[] = [];
    const ctx = ctxOf();
    const out = await runMitraTurn({
      text: "open the reports",
      attachments: [],
      history: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "Hello! What shall we do?" },
      ],
      ctx,
      onEvent: (e) => events.push(e),
    });
    assert.equal(out.final, "Opened the Reports page.");
    assert.equal(out.navigated, "/reports");
    assert.deepEqual(ctx.navigated, ["/reports"]);
    assert.deepEqual(kinds(events), ["thinking", "text", "step:running", "step:done", "navigated", "step:failed", "final"]);
    const running = events.find((e) => e.type === "step" && e.status === "running");
    assert.ok(running && running.type === "step" && /Opening Reports/.test(running.label), "the running label says what is being done");
    const done = events.find((e) => e.type === "step" && e.status === "done");
    assert.ok(done && done.type === "step" && done.id === "c1" && done.tool === "navigate" && /Opened Reports/.test(done.label));
    assert.deepEqual(
      out.steps.map((s) => [s.tool, s.status]),
      [
        ["navigate", "done"],
        ["no_such_tool", "failed"],
      ]
    );
    assert.deepEqual(out.messages.map((m) => m.role), ["user", "assistant", "tool", "tool", "assistant"]);

    assert.equal(mock.requests.length, 2);
    for (const r of mock.requests) assert.equal(r.url, "/api/assistant/agent");
    const first = mock.requests[0].body;
    assert.equal(first.today, today);
    assert.equal(first.currentRoute, "/dashboard");
    assert.equal(first.language, "en");
    assert.equal(first.userName, "Unit Test");
    assert.ok(first.context && first.context.length <= 2500 && /Today:/.test(first.context));
    assert.ok(first.tools.some((t) => t.type === "function" && t.function.name === "navigate"));
    assert.deepEqual(first.messages.map((m) => m.role), ["user", "assistant", "user"]);
    assert.equal(first.messages[2].content, "open the reports");

    const second = mock.requests[1].body;
    assert.deepEqual(second.messages.map((m) => m.role), ["user", "assistant", "user", "assistant", "tool", "tool"]);
    const asked = second.messages[3];
    assert.ok(asked.role === "assistant" && asked.tool_calls?.length === 2 && asked.content === "Opening it…");
    const results = second.messages.filter((m) => m.role === "tool");
    assert.ok(results[0].role === "tool" && results[0].tool_call_id === "c1" && /"route":"\/reports"/.test(results[0].content));
    assert.ok(results[1].role === "tool" && results[1].tool_call_id === "c2" && results[1].content === JSON.stringify({ ok: false, error: "unknown tool" }));
  } finally {
    mock.restore();
  }
});

test("ask_user ends the turn with the question and its options; nothing more is asked of the model", async () => {
  const mock = mockAgent([tools(null, [call("q1", "ask_user", { question: "Which day's record?", options: ["Today", "Yesterday"] }), call("q2", "navigate", { route: "/reports" })])]);
  try {
    const events: MitraEvent[] = [];
    const ctx = ctxOf();
    const out = await runMitraTurn({ text: "open the daily record", attachments: [], history: [], ctx, onEvent: (e) => events.push(e) });
    assert.equal(out.final, null);
    assert.deepEqual(out.ask, { question: "Which day's record?", options: ["Today", "Yesterday"] });
    assert.equal(events[events.length - 1].type, "ask");
    assert.equal(mock.requests.length, 1);
    assert.deepEqual(ctx.navigated, [], "a call after ask_user in the same round is not run");
    const notRun = out.messages.find((m) => m.role === "tool" && m.tool_call_id === "q2");
    assert.ok(notRun && notRun.role === "tool" && /not run/.test(notRun.content));
  } finally {
    mock.restore();
  }
});

test("a failure of the model before anything was changed is thrown — the caller falls back; after a page was opened it comes back as words", async () => {
  const before = mockAgent([failure()]);
  try {
    await assert.rejects(
      runMitraTurn({ text: "hello", attachments: [], history: [], ctx: ctxOf(), onEvent: () => {} }),
      (err: unknown) => err instanceof ApiError && err.status === 502
    );
  } finally {
    before.restore();
  }

  // A read-only tool ran, nothing changed: still thrown, so the app's own answer can be given.
  const readOnly = mockAgent([tools(null, [call("f1", "find_documents", { query: "F/HR/17" })]), failure()]);
  try {
    await assert.rejects(runMitraTurn({ text: "what is F/HR/17", attachments: [], history: [], ctx: ctxOf(), onEvent: () => {} }), (err: unknown) => err instanceof ApiError);
  } finally {
    readOnly.restore();
  }

  const after = mockAgent([tools(null, [call("n1", "navigate", { route: "/insights" })]), failure()]);
  try {
    const events: MitraEvent[] = [];
    const ctx = ctxOf();
    const out = await runMitraTurn({ text: "open insights", attachments: [], history: [], ctx, onEvent: (e) => events.push(e) });
    assert.ok(out.final, "words came back");
    assert.match(out.final!, /Done so far: Opened Insights/);
    assert.match(out.final!, /could not finish/);
    assert.equal(out.navigated, "/insights");
    assert.equal(events[events.length - 1].type, "final");
  } finally {
    after.restore();
  }
});

test("eight rounds at most: when the model still asks for tools, the turn ends with what was done so far", async () => {
  const mock = mockAgent(Array.from({ length: 12 }, (_, i) => tools(null, [call(`r${i}`, "todays_facts", {})])));
  try {
    const out = await runMitraTurn({ text: "keep going", attachments: [], history: [], ctx: ctxOf(), onEvent: () => {} });
    assert.equal(mock.requests.length, 8);
    assert.equal(out.steps.length, 8);
    assert.ok(out.final && /stopped there/i.test(out.final), out.final ?? "");
  } finally {
    mock.restore();
  }
});

test("the turn's tool results are kept under 12,000 characters: the oldest are replaced by a marker", async () => {
  const attachment: MitraAttachment = { id: "big", name: "big.txt", kind: "text", size: 9000, status: "ready", text: "q".repeat(9000), characters: 9000 };
  const eight = (round: number) => tools(null, Array.from({ length: 8 }, (_, i) => call(`t${round}-${i}`, "read_attachment", { id: "big", from: i * 1000 })));
  const mock = mockAgent([eight(1), eight(2), final("Read it all.")]);
  try {
    const out = await runMitraTurn({ text: "read the file", attachments: [attachment], history: [], ctx: ctxOf({ attachments: [attachment] }), onEvent: () => {} });
    assert.equal(out.final, "Read it all.");
    const third = mock.requests[2].body.messages;
    const results = third.filter((m) => m.role === "tool").map((m) => (m.role === "tool" ? m.content : ""));
    assert.equal(results.length, 16);
    const total = results.reduce((n, c) => n + c.length, 0);
    assert.ok(total <= 12000, `${total} characters of tool results`);
    assert.ok(results.some((c) => c === TRIMMED_RESULT), "the oldest results were trimmed");
    assert.ok(results[0] === TRIMMED_RESULT && results[results.length - 1] !== TRIMMED_RESULT, "oldest first, newest kept");
    for (const m of third) if (m.role === "tool") assert.ok(m.content.length <= 1500);
    assert.ok(third.length <= 40);
  } finally {
    mock.restore();
  }
});

test("buildUserContent puts the attachments' text inline — 3,000 characters a file, 9,000 in all — and points to read_attachment for the rest", () => {
  const files: MitraAttachment[] = [1, 2, 3, 4].map((i) => ({ id: `a${i}`, name: `f${i}.txt`, kind: "text", size: 4000, status: "ready", text: "q".repeat(4000), characters: 4000 }));
  const content = buildUserContent("read these", files);
  assert.ok(content.startsWith("read these"));
  assert.equal((content.match(/q/g) ?? []).length, 9000, "9,000 characters of file text in all");
  assert.match(content, /\[Attachment 1: f1\.txt \(text, 4000 chars; id=a1\)\]/);
  assert.match(content, /\[Attachment 4: f4\.txt/);
  assert.match(content, /read_attachment/);
  assert.ok(content.length <= 12000);
  const failed: MitraAttachment = { id: "x", name: "scan.png", kind: "image", size: 10, status: "failed", text: "", characters: 0, note: "no OCR data" };
  assert.match(buildUserContent("look", [failed]), /could not be read: no OCR data/);
  const empty: MitraAttachment = { id: "y", name: "blank.png", kind: "image", size: 10, status: "ready", text: "", characters: 0, note: "This picture has no readable text" };
  assert.match(buildUserContent("look", [empty]), /no readable text/);
  assert.equal(buildUserContent("  just words  ", []), "just words");
  const short: MitraAttachment = { id: "s", name: "note.txt", kind: "text", size: 5, status: "ready", text: "hello", characters: 5 };
  assert.ok(!/read_attachment/.test(buildUserContent("hi", [short])), "a file shown whole needs no pointer");
});

test("historyForAgent keeps at most six turns, 800 characters each and 3,000 in all — the most recent", () => {
  const stored = Array.from({ length: 20 }, (_, i) => ({ role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant", text: `${i}-${"w".repeat(1000)}` }));
  const out = historyForAgent(stored);
  assert.ok(out.length <= 6);
  for (const m of out) assert.ok(typeof m.content === "string" && m.content.length <= 800);
  assert.ok(out.reduce((n, m) => n + (typeof m.content === "string" ? m.content.length : 0), 0) <= 3000);
  assert.ok(typeof out[out.length - 1].content === "string" && (out[out.length - 1].content as string).startsWith("19-"), "the last turn is kept");
  assert.deepEqual(historyForAgent([]), []);
});

test("buildContext names the open record in one line and stays under 2,500 characters", () => {
  const target = {
    documentKind: "log-sheet",
    documentId: "qc-viscosity",
    recordId: "rec-1",
    status: "Submitted" as const,
    editable: false,
    currentData: {},
    getData: () => ({}),
    commit: () => {},
    reopen: () => {},
    title: "F-QC-30 of 26-Sep-2026",
  };
  const context = buildContext(ctxOf({ target }));
  assert.ok(context.length <= 2500);
  assert.match(context, /^Open record: F-QC-30 of 26-Sep-2026 — document qc-viscosity \(log-sheet\), status Submitted, not editable \(can be reopened for correction\)/);
  assert.match(context, /Today:/);
  const page = buildContext(ctxOf({ currentRoute: "/document/qc-viscosity" }));
  assert.match(page, /^Document page open: .*qc-viscosity/);
  const plain = buildContext(ctxOf());
  assert.match(plain, /^Today:/);
});
