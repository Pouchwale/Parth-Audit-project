// COPY, EDIT AND STOP IN MITRA'S CHAT (REQUIREMENTS §85, components/mitra).
//
// Asked for on 30-Sep-2026: "copy, and the prompt — edit it — the same as
// Claude." Every message in the conversation — Mitra's replies and the
// person's own — can be copied; every one of the person's own messages can be
// edited in place, and saving it sends the edited words as that turn again:
// everything after it is replaced by the new answer. A turn still being
// answered cannot be edited; it is stopped first, which is what Stop is for.
//
// What lives here is what the page (pages/AssistantPage.tsx) and the dock
// (components/common/DocumentAssistant.tsx) share and what can be tested
// without a browser (frontend/tests/mitraCopyEdit.test.ts):
//
//   copyText            the clipboard, with the old select-and-copy way for a
//                       page served over plain http on the office network,
//                       where the browser offers no async clipboard at all;
//   threadBefore        the conversation as it stood before the edited message;
//   remember/attachmentsForResend
//                       the files of a turn, kept in memory for as long as the
//                       tab is open so an edited turn goes with its files'
//                       words again (a stored message keeps only their names —
//                       the words themselves are far too big for the browser's
//                       store and never leave this tab);
//   startTurn/stoppableContext
//                       Stop: the turn's signal (engine/mitraAgent.ts checks it
//                       before every round) and a tool context that refuses to
//                       be used once the person has pressed Stop, so a tool
//                       call the model sent back after that is never carried out.
import type { MitraAttachment, MitraToolContext } from "../../engine/mitraTypes";
import type { AttachmentChipData } from "./MitraAttachments";

// ---------------------------------------------------------------------------
// copy

/**
 * Puts the words on the clipboard; says whether they got there. The browser's
 * clipboard API first (a secure page), else a hidden box selected and copied
 * the old way — the plant opens DCRS over plain http, where the API is absent.
 */
export async function copyText(text: string): Promise<boolean> {
  const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (clip && typeof clip.writeText === "function") {
    try {
      await clip.writeText(text);
      return true;
    } catch {
      // Refused (no permission, the tab not focused): the old way below still works.
    }
  }
  return copyBySelecting(text);
}

function copyBySelecting(text: string): boolean {
  if (typeof document === "undefined" || !document.body || typeof document.execCommand !== "function") return false;
  const before = document.activeElement as HTMLElement | null;
  const box = document.createElement("textarea");
  box.value = text;
  box.setAttribute("readonly", "");
  box.setAttribute("aria-hidden", "true");
  box.setAttribute("tabindex", "-1");
  // On the screen (a box off it cannot be selected on some browsers) but unseen and untouchable.
  box.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(box);
  let copied = false;
  try {
    box.select();
    box.setSelectionRange(0, text.length);
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(box);
    // The Copy button keeps the focus, so a keyboard user carries on from there.
    if (before && typeof before.focus === "function") before.focus({ preventScroll: true });
  }
  return copied;
}

// ---------------------------------------------------------------------------
// edit

/**
 * The conversation as it stood before the message being edited — what the
 * edited turn is answered on top of; everything from that message on is
 * replaced. Null when the message is not one of the person's own in this thread.
 */
export function threadBefore<T extends { id: string; role: string }>(messages: readonly T[], id: string): T[] | null {
  const at = messages.findIndex((m) => m.id === id);
  if (at < 0 || messages[at].role !== "user") return null;
  return messages.slice(0, at);
}

/** What an edited message may be saved as: some words, or the files it already carries. */
export function canSaveEdit(draft: string, attachmentCount: number): boolean {
  return draft.trim().length > 0 || attachmentCount > 0;
}

/** A stored message's note of a file that went with it (pages/AssistantPage.tsx, the dock). */
type AttachmentNote = Pick<AttachmentChipData, "id" | "name" | "kind" | "characters">;

// The files sent in this tab, by id, with their words — so an edited turn goes
// with them again. In memory only (never the browser's store: a file's words
// run to 60,000 characters, a photo's picture to 2 MB), the oldest let go
// first once they add up to this many characters.
export const ATTACHMENT_MEMORY_CHARS = 4_000_000;
const remembered = new Map<string, MitraAttachment>();
let rememberedChars = 0;
const charsOf = (a: MitraAttachment): number => a.text.length + (a.dataUrl?.length ?? 0) + a.name.length;

/** Keeps the files of a message just sent, for an edit of it later in this tab. */
export function rememberAttachments(list: readonly MitraAttachment[]): void {
  for (const a of list) {
    // A file already gone (attachmentsForResend below) is not "at hand" because it was sent again.
    if (a.note === FILE_GONE_NOTE) continue;
    const old = remembered.get(a.id);
    if (old) {
      remembered.delete(a.id);
      rememberedChars -= charsOf(old);
    }
    const chars = charsOf(a);
    if (chars > ATTACHMENT_MEMORY_CHARS) continue;
    remembered.set(a.id, a);
    rememberedChars += chars;
  }
  // A Map keeps the order things were put in: the oldest go first.
  for (const [id, a] of remembered) {
    if (rememberedChars <= ATTACHMENT_MEMORY_CHARS) break;
    remembered.delete(id);
    rememberedChars -= charsOf(a);
  }
}

/** Whether a file of an earlier message is still at hand in this tab. */
export function attachmentRemembered(id: string): boolean {
  return remembered.has(id);
}

/** Said to the model (and in the edit box) of a file whose words are no longer in this tab. */
export const FILE_GONE_NOTE = "its words are no longer in this browser (the page was opened again since it was attached) — attach the file again to send it";

/**
 * The files of an edited message, to go with it again: each as it was read
 * when it was first sent, or — the tab opened again since — its name, with a
 * note in place of its words, so nothing claims to have been read that was not.
 */
export function attachmentsForResend(stored: readonly AttachmentNote[] | undefined): MitraAttachment[] {
  return (stored ?? []).map(
    (s): MitraAttachment =>
      remembered.get(s.id) ?? { id: s.id, name: s.name, kind: s.kind, size: 0, status: "failed", text: "", characters: s.characters, note: FILE_GONE_NOTE }
  );
}

/** The note a stored message keeps of each file (never the words). */
export function attachmentNotes(list: readonly MitraAttachment[]): AttachmentNote[] {
  return list.map(({ id, name, kind, characters }) => ({ id, name, kind, characters }));
}

// ---------------------------------------------------------------------------
// stop

/** The error a stopped turn's tool context throws; runTool turns it into a failed step. */
export const TURN_STOPPED = "Stopped by the person";

export interface TurnHandle {
  /** For runMitraTurn: checked before every round. */
  readonly signal: AbortSignal;
  readonly stopped: boolean;
  stop(): void;
}

/** One turn being answered, which the person can stop. */
export function startTurn(): TurnHandle {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    get stopped() {
      return controller.signal.aborted;
    },
    stop() {
      controller.abort();
    },
  };
}

/**
 * The tool context as the turn's tools see it, refusing to be used once the
 * turn is stopped. The model's answer to the last round may still arrive after
 * Stop, with tool calls in it; every tool that changes anything reads its
 * context before it does (the day, the open record, the router), so each such
 * call now fails at its first step and changes nothing. Live getters on the
 * context (the dock's `target`, `currentRoute`) stay live.
 */
export function stoppableContext(ctx: MitraToolContext, stopped: () => boolean): MitraToolContext {
  const guarded = {} as MitraToolContext;
  for (const key of Object.keys(ctx) as (keyof MitraToolContext)[]) {
    Object.defineProperty(guarded, key, {
      enumerable: true,
      get() {
        if (stopped()) throw new Error(TURN_STOPPED);
        return ctx[key];
      },
    });
  }
  return guarded;
}
