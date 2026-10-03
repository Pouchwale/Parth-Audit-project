// ONE TURN OF THE CONVERSATION (REQUIREMENTS §80, components/mitra).
//
// The person's message sits to the right as a soft bubble, with the chips of
// any files they attached beneath it. Mitra's sits to the left with its face,
// and is drawn in the order things happened: the steps it took (MitraSteps),
// then its words in light markdown (markdown.ts), then — while a turn is still
// running — the "thinking" line; and under the words whatever the answer
// carries: the label that says the model did not give it (REQUIREMENTS §72),
// the records it was read from (§75), the options of a question Mitra asked
// (ask_user, or a confirm before a destructive change), and the app's own
// quick-reply chips.
//
// The class names and data-attributes here are the contract the Playwright
// suites drive (SPEC "DOM contract"): .chat-msg.bot / .chat-msg.user,
// .chat-aside[data-offline], [data-section='cites'] [data-cite], .chat-chips
// .chat-chip[data-chip], .mitra-step[data-tool][data-status],
// .mitra-options .chat-chip[data-option], .mitra-thinking.
//
// COPY AND EDIT (REQUIREMENTS §85), the same as Claude: under every message
// with words, a small row — Copy on each (the words as written; for a reply
// its markdown kept as text), and Edit on the person's own. Edit turns the
// bubble into a box in place with Save and Cancel (Enter saves, Shift+Enter a
// new line, Escape cancels); the thread (MitraThread) holds which message is
// being edited and hands Save to the host, which sends the words as that turn
// again. The row sits OUTSIDE .chat-msg and its buttons carry no words of
// their own — only aria-labels and tooltips — so a suite reading a message's
// text, or clicking "button:has-text('Edit')" on a record, never meets them.
// Their hooks: [data-action='copy-message'], [data-action='edit-message'],
// the edit box .mitra-edit with textarea.mitra-edit-input, [data-action=
// 'save-edit'] and [data-action='cancel-edit'].
//
// DRAWN ONCE (the low-end-laptop rule). A message is memoised and the thread
// hands it the same functions every time (MitraThread.tsx), so a keystroke in
// the composer or in the edit box, or a step arriving on the last answer,
// draws only what changed — not every one of up to 200 messages, each through
// the markdown renderer. The words being edited live in the edit box itself.
import { memo, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { FiCheck, FiCopy, FiEdit2, FiWifiOff, FiZap } from "react-icons/fi";
import type { Chip } from "../../engine/guidedChecklist";
import type { CiteLink } from "../../engine/historyDigest";
import type { MitraStep } from "../../engine/mitraTypes";
import { unreachableLabel, type Unreachable } from "../../engine/assistantReach";
import { useT } from "../../i18n";
import { renderMarkdown } from "./markdown";
import { MitraAttachmentChips, type AttachmentChipData } from "./MitraAttachments";
import { MitraSteps } from "./MitraSteps";
import { attachmentRemembered, canSaveEdit, copyText } from "./messageActions";

/** A message as the thread draws it: the stored shape plus what the agent adds. */
export interface MitraMessageView {
  id: string;
  role: "bot" | "user";
  text: string;
  /** ISO timestamp; shown as the bubble's tooltip when `timeLabel` is given. */
  at?: string;
  chips?: Chip[];
  offline?: Unreachable;
  cites?: CiteLink[];
  /** The tools the agent called for this answer, in order. */
  steps?: MitraStep[];
  /** The files that went with the person's message. */
  attachments?: AttachmentChipData[];
  /** A question's answers, as chips: tapping one sends it (or answers a confirm). */
  options?: string[];
  /** Still being written: the thinking line shows under whatever has arrived. */
  pending?: boolean;
  /** This message is a yes/no put by a tool (MitraToolContext.confirm); `options` holds the two words. */
  confirm?: { yes: string; no: string };
}

/** What a chip DOES, for a test to find it by — never by its words, which change with the language. */
export function chipAttrs(c: Chip): { "data-chip": string; "data-placeholder": string | undefined } {
  return { "data-chip": c.action.type, "data-placeholder": c.action.type === "focusInput" && c.action.placeholder ? c.action.placeholder : undefined };
}

export interface MitraMessageProps {
  message: MitraMessageView;
  onChip: (chip: Chip) => void;
  onOption: (text: string, message: MitraMessageView) => void;
  onCite: (route: string) => void;
  compact?: boolean;
  /** How to write a timestamp for the tooltip; none → no tooltip. */
  timeLabel?: (iso: string) => string;
  /** Present on the person's own messages where the host can send a turn again: the Edit button opens this one. */
  onEdit?: (messageId: string) => void;
  /** A turn is being answered: nothing can be edited until it is over or stopped. */
  editLocked?: boolean;
  /** This message is open for editing (REQUIREMENTS §85). */
  editing?: boolean;
  /** Save of the edit: the words as they stand in the box. */
  onSaveEdit?: (message: MitraMessageView, text: string) => void;
  onCancelEdit?: () => void;
}

// Longest a message may be edited to — the composer's own limit.
const EDIT_MAX_LENGTH = 4000;
// How long the tick says "Copied".
const COPIED_MS = 1600;

/** Copy on every message with words; Edit on the person's own. Words only in tooltips and aria-labels. */
function MessageActions({ text, onEdit, editLocked, editButtonRef }: { text: string; onEdit?: () => void; editLocked?: boolean; editButtonRef?: Ref<HTMLButtonElement> }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  const copy = async () => {
    const ok = await copyText(text);
    setCopied(ok ? "yes" : "no");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), COPIED_MS);
  };
  const copyLabel = copied === "yes" ? "Copied" : copied === "no" ? "Could not copy — select the words and press Ctrl+C" : "Copy message";
  const editLabel = editLocked ? "Mitra is still answering — stop it or wait, then edit" : "Edit message";
  if (!text && !onEdit) return null;
  return (
    <div className="mitra-msg-actions">
      {text && (
        <button type="button" className="mitra-msg-action" data-action="copy-message" data-copied={copied ?? undefined} aria-label={copyLabel} title={copyLabel} onClick={() => void copy()}>
          {copied === "yes" ? <FiCheck size={13} aria-hidden="true" /> : <FiCopy size={13} aria-hidden="true" />}
          {copied === "yes" && <span className="mitra-msg-action-word">Copied</span>}
        </button>
      )}
      {onEdit && (
        <button
          ref={editButtonRef}
          type="button"
          className="mitra-msg-action"
          data-action="edit-message"
          aria-label={editLabel}
          title={editLabel}
          disabled={editLocked}
          onClick={onEdit}
        >
          <FiEdit2 size={13} aria-hidden="true" />
        </button>
      )}
      {/* Said to a screen reader when the words are copied; empty the rest of the time. */}
      <span className="mitra-sr-only" role="status" aria-live="polite">
        {copied === "yes" ? "Copied" : ""}
      </span>
    </div>
  );
}

/** The person's message open for editing: the box, the files it carries (kept), Cancel and Save. */
function EditBox({ message: m, locked, compact, onSave, onCancel }: { message: MitraMessageView; locked?: boolean; compact?: boolean; onSave: (text: string) => void; onCancel: () => void }) {
  const t = useT();
  const boxRef = useRef<HTMLTextAreaElement>(null);
  // The words being edited: here, so a keystroke draws this box and nothing else.
  const [draft, setDraft] = useState(m.text);
  const files = m.attachments ?? [];
  const gone = files.filter((a) => !attachmentRemembered(a.id)).length;
  const canSave = !locked && canSaveEdit(draft, files.length);
  const save = () => {
    if (canSave) onSave(draft.trim());
  };

  // Into the box at once, the caret after the last word.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  // The box takes the height of its words (the stylesheet stops it at twelve lines).
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      // The Escape is this box's: nothing behind it closes as well.
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      save();
    }
  };

  return (
    <div className="mitra-edit" data-editing={m.id}>
      <textarea
        ref={boxRef}
        className="mitra-edit-input"
        rows={1}
        maxLength={EDIT_MAX_LENGTH}
        aria-label="Edit your message"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {files.length > 0 && (
        <div className="mitra-msg-attachments">
          <MitraAttachmentChips attachments={files} compact={compact} />
        </div>
      )}
      {gone > 0 && (
        <div className="mitra-edit-note" data-note="files-gone">
          {gone === 1 ? "The file above" : `${gone} of the files above`} went with this message before the page was opened again, so {gone === 1 ? "its" : "their"} words are not at hand now — attach {gone === 1 ? "it" : "them"} again in a new message if Mitra needs to read {gone === 1 ? "it" : "them"}.
        </div>
      )}
      <div className="mitra-edit-bar">
        {locked && (
          <span className="mitra-edit-note" role="status">
            Mitra is still answering — stop it or wait, then save.
          </span>
        )}
        <button type="button" className="btn btn-ghost btn-sm" data-action="cancel-edit" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="button" className="btn btn-primary btn-sm" data-action="save-edit" disabled={!canSave} onClick={save}>
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}

export const MitraMessage = memo(function MitraMessage({ message: m, onChip, onOption, onCite, compact, timeLabel, onEdit, editLocked, editing, onSaveEdit, onCancelEdit }: MitraMessageProps) {
  const t = useT();
  const time = m.at && timeLabel ? timeLabel(m.at) : undefined;
  const editButtonRef = useRef<HTMLButtonElement>(null);
  // Cancelled: the focus goes back to the Edit button it started from, not to the top of the page.
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editing) {
      wasEditing.current = true;
      return;
    }
    if (!wasEditing.current) return;
    wasEditing.current = false;
    const focused = typeof document !== "undefined" ? document.activeElement : null;
    if (!focused || focused === document.body) editButtonRef.current?.focus({ preventScroll: true });
  }, [editing]);

  if (m.role === "user") {
    return (
      <div className={`mitra-turn user${editing ? " is-editing" : ""}`} data-message={m.id}>
        <div className="mitra-turn-body">
          {editing ? (
            <EditBox message={m} locked={editLocked} compact={compact} onSave={(text) => onSaveEdit?.(m, text)} onCancel={() => onCancelEdit?.()} />
          ) : (
            <>
              {m.text && (
                <div className="chat-msg user" title={time}>
                  {m.text}
                </div>
              )}
              {m.attachments && m.attachments.length > 0 && (
                <div className="mitra-msg-attachments">
                  <MitraAttachmentChips attachments={m.attachments} compact={compact} />
                </div>
              )}
              <MessageActions text={m.text} onEdit={onEdit ? () => onEdit(m.id) : undefined} editLocked={editLocked} editButtonRef={editButtonRef} />
            </>
          )}
        </div>
      </div>
    );
  }

  const working = m.steps?.some((s) => s.status === "running") ?? false;
  return (
    <div className="mitra-turn bot" data-message={m.id}>
      <span className={`chat-avatar${m.pending ? " is-thinking" : ""}`} aria-hidden="true">
        <FiZap size={12} />
      </span>
      <div className="mitra-turn-body">
        {m.steps && m.steps.length > 0 && <MitraSteps steps={m.steps} compact={compact} />}
        {m.text && (
          <div className="chat-msg bot mitra-md" title={time}>
            {renderMarkdown(m.text)}
          </div>
        )}
        {m.pending && (
          <div className="mitra-thinking" role="status" aria-live="polite">
            {working ? t("ai.working") : t("ai.thinking")}
          </div>
        )}
        {/* Answered by the app itself, not by the model (REQUIREMENTS §72). */}
        {m.offline && (
          <div className="chat-aside" data-offline={m.offline}>
            <FiWifiOff size={11} /> {unreachableLabel(m.offline, t)}
          </div>
        )}
        {/* THE RECORDS AN ANSWER WAS READ FROM (REQUIREMENTS §75): only ones the
            evidence named and this account may open. Kept with the answer: a
            record a figure came from does not go stale. */}
        {m.cites && m.cites.length > 0 && (
          <div className="chat-chips" data-section="cites">
            {m.cites.map((c) => (
              <button key={c.recordId} type="button" className="chat-chip mitra-cite" data-cite={c.recordId} onClick={() => onCite(c.route)}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        {/* A question Mitra asked: tap an answer, or type one. */}
        {m.options && m.options.length > 0 && (
          <div className="mitra-options">
            {m.options.map((o) => (
              <button key={o} type="button" className="chat-chip" data-option={o} onClick={() => onOption(o, m)}>
                {o}
              </button>
            ))}
            {!compact && !m.confirm && <span className="mitra-options-hint">{t("ai.optionsHint")}</span>}
          </div>
        )}
        {m.chips && m.chips.length > 0 && (
          <div className="chat-chips">
            {m.chips.map((c) => (
              <button key={c.label} type="button" className={`chat-chip ${c.tone ?? ""}`} {...chipAttrs(c)} onClick={() => onChip(c)}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        {/* Copy, once the words are all there (REQUIREMENTS §85). */}
        {m.text && !m.pending && <MessageActions text={m.text} />}
      </div>
    </div>
  );
});
