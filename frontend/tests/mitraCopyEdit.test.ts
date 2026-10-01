// COPY, EDIT AND STOP IN MITRA'S CHAT (REQUIREMENTS §85, components/mitra/
// messageActions.ts, MitraMessage.tsx, MitraThread.tsx, MitraComposer.tsx).
//
// "Add two features in the assistant: copy, and the prompt — edit it — the
// same as Claude." These check what can be checked without a browser:
//   * Copy puts the words on the clipboard — through the browser's clipboard
//     where there is one, else the old select-and-copy way (the plant opens
//     DCRS over plain http, where the async clipboard does not exist) — and
//     says when neither worked;
//   * an edit is answered on top of the conversation as it stood before the
//     edited message, and only the person's own messages can be edited;
//   * the files of a turn go with its edit again — as they were read, while the
//     tab is open; after that by name, with a note in place of their words —
//     and what is kept in memory is bounded;
//   * Stop: a tool call the model sends back after Stop is never carried out
//     (nothing navigated, no record started) and the loop asks no more;
//   * the interface: Copy on every message with words, Edit only on the
//     person's own, disabled while a turn is answered; the edit box with the
//     message's words and files, Save and Cancel; Stop in place of Send.
// The clicks themselves — Enter and Escape, the thread cut back in the stored
// conversation, the dock and the page, the agent path and the rules path —
// are driven in a browser by tests/e2e_mitra_copy_edit.py.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { AgentRequest, AgentResponse, MitraAttachment, MitraEvent, MitraToolContext, ToolCall } from "../src/engine/mitraTypes";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { runMitraTurn } from "../src/engine/mitraAgent";
import { todayISO } from "../src/utils/date";
import {
  ATTACHMENT_MEMORY_CHARS,
  FILE_GONE_NOTE,
  TURN_STOPPED,
  attachmentNotes,
  attachmentRemembered,
  attachmentsForResend,
  canSaveEdit,
  copyText,
  rememberAttachments,
  startTurn,
  stoppableContext,
  threadBefore,
} from "../src/components/mitra/messageActions";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

// store/router.tsx reads window.location the moment it loads (the navigate tool
// loads it to check a route); the harness stands up no location, so one is here.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "" }, configurable: true, writable: true });
}

const scope = globalThis as unknown as Record<string, unknown>;

/** Runs `fn` with these globals in place, and puts back what was there. */
async function withGlobals(globals: Record<string, unknown>, fn: () => Promise<void>): Promise<void> {
  const before = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(globals)) {
    before.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  try {
    await fn();
  } finally {
    for (const [name, descriptor] of before) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete scope[name];
    }
  }
}

/** A document just big enough for the select-and-copy way: a body, a box, execCommand. */
function fakeDocument(copyWorks: boolean) {
  const log: string[] = [];
  const focused = { focus: () => log.push("focus-back") };
  const box = {
    value: "",
    style: { cssText: "" },
    setAttribute: (name: string) => log.push(`attr:${name}`),
    select: () => log.push("select"),
    setSelectionRange: (from: number, to: number) => log.push(`range:${from}-${to}`),
  };
  const doc = {
    activeElement: focused,
    body: {
      appendChild: () => log.push("append"),
      removeChild: () => log.push("remove"),
    },
    createElement: (tag: string) => {
      log.push(`create:${tag}`);
      return box;
    },
    execCommand: (command: string) => {
      log.push(`exec:${command}:${box.value}`);
      return copyWorks;
    },
  };
  return { doc, log, box };
}

// ---------------------------------------------------------------------------
// copy

test("Copy uses the browser's clipboard where there is one", async () => {
  const written: string[] = [];
  const { doc, log } = fakeDocument(true);
  await withGlobals({ navigator: { clipboard: { writeText: async (s: string) => void written.push(s) } }, document: doc }, async () => {
    assert.equal(await copyText("**Bold** and a list:\n- one"), true);
  });
  assert.deepEqual(written, ["**Bold** and a list:\n- one"], "the words as written, markdown kept as text");
  assert.equal(log.length, 0, "the old way was not needed");
});

test("Copy works without the async clipboard (plain http): a hidden box, selected and copied, then taken away", async () => {
  const { doc, log } = fakeDocument(true);
  await withGlobals({ navigator: {}, document: doc }, async () => {
    assert.equal(await copyText("Filled 3 boxes on F/HR/17"), true);
  });
  assert.ok(log.includes("create:textarea"), log.join(" "));
  assert.ok(log.includes("attr:readonly") && log.includes("attr:aria-hidden"), "the box is read-only and hidden from a screen reader");
  assert.ok(log.includes("exec:copy:Filled 3 boxes on F/HR/17"), log.join(" "));
  assert.ok(log.indexOf("remove") > log.indexOf("exec:copy:Filled 3 boxes on F/HR/17"), "the box is taken away after");
  assert.equal(log[log.length - 1], "focus-back", "the focus goes back to where it was (the Copy button)");
});

test("Copy falls back when the clipboard refuses, and says so when nothing works", async () => {
  const refusing = { clipboard: { writeText: async () => Promise.reject(new Error("NotAllowedError")) } };
  const works = fakeDocument(true);
  await withGlobals({ navigator: refusing, document: works.doc }, async () => {
    assert.equal(await copyText("hello"), true);
  });
  assert.ok(works.log.includes("exec:copy:hello"));
  const fails = fakeDocument(false);
  await withGlobals({ navigator: refusing, document: fails.doc }, async () => {
    assert.equal(await copyText("hello"), false, "neither way copied: the button says it could not");
  });
  assert.ok(fails.log.includes("remove"), "the box is taken away even so");
});

// ---------------------------------------------------------------------------
// edit

const thread = [
  { id: "b0", role: "bot", text: "Hello" },
  { id: "u1", role: "user", text: "open the reports" },
  { id: "b1", role: "bot", text: "Opened Reports." },
  { id: "u2", role: "user", text: "and the calendar" },
  { id: "b2", role: "bot", text: "Opened the Calendar." },
];

test("an edited message is answered on top of the conversation as it stood before it", () => {
  assert.deepEqual(
    threadBefore(thread, "u2")?.map((m) => m.id),
    ["b0", "u1", "b1"],
    "everything from the edited message on is replaced"
  );
  assert.deepEqual(threadBefore(thread, "u1")?.map((m) => m.id), ["b0"]);
  assert.equal(threadBefore(thread, "b1"), null, "Mitra's own messages are not edited");
  assert.equal(threadBefore(thread, "nope"), null, "a message that is gone cannot be saved");
  assert.equal(canSaveEdit("  ", 0), false, "nothing to send");
  assert.equal(canSaveEdit("  ", 2), true, "the files alone may go again");
  assert.equal(canSaveEdit("open insights", 0), true);
});

const attachment = (id: string, text: string, over: Partial<MitraAttachment> = {}): MitraAttachment => ({
  id,
  name: `${id}.csv`,
  kind: "csv",
  size: text.length,
  status: "ready",
  text,
  characters: text.length,
  ...over,
});

test("the files of a turn go with its edit again: as read, while the tab is open; else by name, with a note", () => {
  const sheet = attachment("att-sheet", "time,viscosity\n14:00,20.4");
  rememberAttachments([sheet]);
  const notes = attachmentNotes([sheet]);
  assert.deepEqual(notes, [{ id: "att-sheet", name: "att-sheet.csv", kind: "csv", characters: sheet.characters }], "a stored message keeps the note, never the words");
  const again = attachmentsForResend(notes);
  assert.equal(again.length, 1);
  assert.equal(again[0].text, sheet.text, "the words, as they were read");
  assert.equal(again[0].status, "ready");

  const gone = attachmentsForResend([{ id: "att-from-yesterday", name: "report.pdf", kind: "pdf", characters: 1200 }]);
  assert.equal(gone[0].name, "report.pdf", "kept by name");
  assert.equal(gone[0].status, "failed", "nothing claims to have been read");
  assert.equal(gone[0].text, "");
  assert.equal(gone[0].note, FILE_GONE_NOTE);
  rememberAttachments(gone);
  assert.equal(attachmentRemembered("att-from-yesterday"), false, "a file that is gone is not 'at hand' because it was sent again");
  assert.deepEqual(attachmentsForResend(undefined), []);
});

test("what is kept in memory is bounded: the oldest files are let go first", () => {
  const half = Math.floor(ATTACHMENT_MEMORY_CHARS / 2);
  rememberAttachments([attachment("big-1", "a".repeat(half))]);
  rememberAttachments([attachment("big-2", "b".repeat(half))]);
  assert.ok(attachmentRemembered("big-1") || attachmentRemembered("big-2"));
  rememberAttachments([attachment("big-3", "c".repeat(half))]);
  assert.equal(attachmentRemembered("big-1"), false, "the oldest went");
  assert.equal(attachmentRemembered("big-3"), true, "the newest stays");
  rememberAttachments([attachment("huge", "d".repeat(ATTACHMENT_MEMORY_CHARS + 1))]);
  assert.equal(attachmentRemembered("huge"), false, "one file bigger than the whole allowance is not kept");
  assert.equal(attachmentRemembered("big-3"), true, "…and does not push the others out");
});

// ---------------------------------------------------------------------------
// stop

const today = todayISO();

function ctxOf(over: Partial<MitraToolContext> = {}): MitraToolContext & { navigated: string[] } {
  const navigated: string[] = [];
  return {
    today,
    isDemo: true,
    language: "en",
    userName: "Unit Test",
    currentRoute: "/assistant",
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

const call = (id: string, name: string, args: unknown): ToolCall => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });

/** POST /api/assistant/agent answered by `answer`, every request kept. */
async function withModel(answer: (n: number) => AgentResponse, fn: (requests: AgentRequest[]) => Promise<void>): Promise<void> {
  const real = globalThis.fetch;
  const requests: AgentRequest[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)) as AgentRequest);
    return new Response(JSON.stringify(answer(requests.length)), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    await fn(requests);
  } finally {
    globalThis.fetch = real;
  }
}

test("the tool context of a stopped turn refuses to be used; before Stop it is the context itself, getters live", () => {
  let route = "/dashboard";
  const base = {
    ...ctxOf(),
    get currentRoute() {
      return route;
    },
  } as MitraToolContext;
  const turn = startTurn();
  const guarded = stoppableContext(base, () => turn.stopped);
  assert.equal(guarded.today, today);
  assert.equal(guarded.currentRoute, "/dashboard");
  route = "/insights";
  assert.equal(guarded.currentRoute, "/insights", "a live getter stays live");
  assert.deepEqual(Object.keys(guarded).sort(), Object.keys(base).sort());
  assert.equal(turn.stopped, false);
  turn.stop();
  assert.equal(turn.stopped, true);
  assert.equal(turn.signal.aborted, true, "runMitraTurn's signal");
  assert.throws(() => guarded.navigate, new RegExp(TURN_STOPPED));
  assert.throws(() => guarded.isDemo, new RegExp(TURN_STOPPED));
});

test("Stop: tool calls the model sends back after it are never carried out, and the loop asks no more", async () => {
  const doc = documentRepository.getById("daily-pest-monitoring");
  assert.ok(doc, "the Daily Pest Monitoring record is a seeded document");
  const before = recordRepository.query({ documentId: doc.id, isDemo: true, dueDate: today }).length;
  const turn = startTurn();
  const ctx = ctxOf();
  const events: MitraEvent[] = [];
  await withModel(
    () => {
      // The person presses Stop while the model is still thinking; its answer arrives after.
      turn.stop();
      return { kind: "tools", text: null, calls: [call("c1", "navigate", { route: "/insights" }), call("c2", "open_document", { documentId: doc.id, create: true })] };
    },
    async (requests) => {
      const out = await runMitraTurn({ text: "open insights and start today's pest record", attachments: [], history: [], ctx: stoppableContext(ctx, () => turn.stopped), signal: turn.signal, onEvent: (e) => events.push(e) });
      assert.equal(requests.length, 1, "nothing more is asked of the model");
      assert.deepEqual(ctx.navigated, [], "nothing navigated");
      assert.equal(recordRepository.query({ documentId: doc.id, isDemo: true, dueDate: today }).length, before, "no record started");
      assert.deepEqual(
        out.steps.map((s) => [s.tool, s.status]),
        [
          ["navigate", "failed"],
          ["open_document", "failed"],
        ],
        "each call shows as not done"
      );
      assert.equal(out.navigated, undefined);
      assert.match(out.final ?? "", /Stopped/);
    }
  );
});

test("a turn that is not stopped runs its tools through the same context as before", async () => {
  const turn = startTurn();
  const ctx = ctxOf();
  await withModel(
    (n) => (n === 1 ? { kind: "tools", text: null, calls: [call("c1", "navigate", { route: "/insights" })] } : { kind: "final", text: "Opened **Insights**." }),
    async (requests) => {
      const out = await runMitraTurn({ text: "open insights", attachments: [], history: [], ctx: stoppableContext(ctx, () => turn.stopped), signal: turn.signal, onEvent: () => {} });
      assert.equal(requests.length, 2);
      assert.deepEqual(ctx.navigated, ["/insights"]);
      assert.equal(out.final, "Opened **Insights**.");
    }
  );
});

test("a turn stopped before it begins asks the model nothing", async () => {
  const turn = startTurn();
  turn.stop();
  await withModel(
    () => ({ kind: "final", text: "should not be asked" }),
    async (requests) => {
      const out = await runMitraTurn({ text: "hello", attachments: [], history: [], ctx: stoppableContext(ctxOf(), () => turn.stopped), signal: turn.signal, onEvent: () => {} });
      assert.equal(requests.length, 0);
      assert.match(out.final ?? "", /Stopped/);
    }
  );
});

// ---------------------------------------------------------------------------
// the interface

test("the interface: Copy on every message with words, Edit on the person's own, the edit box, Stop in place of Send", async () => {
  const [auth, store, router, assistant, threadMod, messageMod, composerMod] = await Promise.all([
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
    import("../src/store/AssistantContext"),
    import("../src/components/mitra/MitraThread"),
    import("../src/components/mitra/MitraMessage"),
    import("../src/components/mitra/MitraComposer"),
  ]);
  const render = (el: ReactElement): string =>
    renderToStaticMarkup(h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(assistant.AssistantProvider, null, el)))));
  const count = (html: string, what: RegExp): number => html.match(new RegExp(what.source, "g"))?.length ?? 0;
  const noop = () => {};
  const messages = [
    { id: "u1", role: "user" as const, text: "what is due today?", attachments: [{ id: "a1", name: "sheet.csv", kind: "csv" as const, characters: 42 }] },
    { id: "b1", role: "bot" as const, text: "**Two** records are due:\n- F/HR/17\n- F/HR/18" },
    { id: "b2", role: "bot" as const, text: "", pending: true },
  ];

  const html = render(h(threadMod.MitraThread, { messages, thinking: false, onChip: noop, onOption: noop, onCite: noop, onEdit: () => true }));
  assert.equal(count(html, /data-action="copy-message"/), 2, "Copy on the person's message and on Mitra's reply — not on an answer still being written");
  assert.equal(count(html, /data-action="edit-message"/), 1, "Edit on the person's own message only");
  assert.match(html, /data-action="copy-message"[^>]*aria-label="Copy message"/);
  assert.match(html, /data-action="edit-message"[^>]*aria-label="Edit message"/);
  assert.ok(!/<button[^>]*data-action="edit-message"[^>]*disabled/.test(html), "Edit is ready when no turn is being answered");
  assert.ok(!/class="chat-msg user"[^>]*>[^<]*<button/.test(html), "the buttons are outside the message's own words");
  assert.ok(!/>Copy<|>Edit</.test(html), "no visible words on the buttons (a suite's has-text('Edit') on a record never meets them)");

  const locked = render(h(threadMod.MitraThread, { messages, thinking: true, onChip: noop, onOption: noop, onCite: noop, onEdit: () => true, editLocked: true }));
  assert.match(locked, /<button[^>]*data-action="edit-message"[^>]*disabled=""/, "a turn being answered: Edit waits");
  assert.match(locked, /aria-label="Mitra is still answering — stop it or wait, then edit"/);

  const noEdit = render(h(threadMod.MitraThread, { messages, thinking: false, onChip: noop, onOption: noop, onCite: noop }));
  assert.equal(count(noEdit, /data-action="edit-message"/), 0, "no host to send it again: no Edit");
  assert.equal(count(noEdit, /data-action="copy-message"/), 2);

  const editing = { onEdit: noop, editing: true, onSaveEdit: noop, onCancelEdit: noop };
  const box = render(h(messageMod.MitraMessage, { message: messages[0], onChip: noop, onOption: noop, onCite: noop, ...editing }));
  assert.match(box, /class="mitra-turn user is-editing"/);
  assert.match(box, /<textarea[^>]*class="mitra-edit-input"[^>]*aria-label="Edit your message"[^>]*>what is due today\?<\/textarea>/, "the message's words, in a box in place");
  assert.match(box, /class="mitra-edit"[\s\S]*data-kind="csv"[\s\S]*sheet\.csv/, "the files of that turn are kept");
  assert.match(box, /data-note="files-gone"/, "a file not at hand in this tab is said so");
  assert.match(box, /data-action="cancel-edit"[^>]*>Cancel</);
  assert.match(box, /data-action="save-edit"[^>]*>Save</);
  assert.ok(!/<button[^>]*data-action="save-edit"[^>]*disabled/.test(box), "Save is ready");
  assert.ok(!/class="chat-msg user"/.test(box), "the bubble gives way to the box");
  const lockedBox = render(h(messageMod.MitraMessage, { message: messages[0], onChip: noop, onOption: noop, onCite: noop, ...editing, editLocked: true }));
  assert.match(lockedBox, /<button[^>]*data-action="save-edit"[^>]*disabled=""/);
  assert.match(lockedBox, /Mitra is still answering — stop it or wait, then save\./);

  const composer = (busy: boolean, onStop?: () => void) =>
    render(
      h(composerMod.MitraComposer, {
        value: "",
        onChange: noop,
        onSend: noop,
        busy,
        attachments: [],
        recording: { active: false, seconds: 0, transcribing: false },
        onToggleVoice: noop,
        voiceMode: "none",
        placeholder: "Ask Mitra",
        onStop,
      })
    );
  const answering = composer(true, noop);
  assert.match(answering, /class="mitra-composer is-busy is-stoppable"/);
  assert.match(answering, /data-action="stop"[^>]*aria-label="Stop the answer"/);
  assert.match(answering, /data-action="send" aria-label="Send"[^>]*disabled=""/, "Send is still there (hidden), disabled as it always was while busy");
  assert.ok(!/data-action="stop"/.test(composer(false, noop)), "nothing to stop: no Stop");
  assert.ok(!/data-action="stop"/.test(composer(true)), "a wait that cannot be stopped keeps the busy Send");
});
