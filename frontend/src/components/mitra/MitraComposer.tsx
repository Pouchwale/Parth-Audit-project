// THE COMPOSER (REQUIREMENTS §80, components/mitra).
//
// One rounded card, the same on the full page and in the docked widget
// (`compact`): the chips of the files attached so far, a box that grows with
// what is typed (one line to eight; Enter sends, Shift+Enter starts a new
// line), a + that offers Files / Folder / Photo, the microphone, and the
// arrow that sends. Files also arrive by dropping them on the card or pasting
// them into the box.
//
// The microphone has three lives. With a key on the server and a browser that
// can record, it records and the server writes down what was said (Groq
// Whisper) — red while recording, with the seconds; a spinner while the words
// come back. Without a key it is the browser's own speech recognition, exactly
// as before (utils/speech.ts; tests/e2e_voice.py drives that path). Where the
// browser has neither, the button stays and explains itself when pressed.
//
// WHAT THE SUITES HOLD ON TO (SPEC "DOM contract"): textarea.input
// .assistant-input, [data-action='send'] with aria-label "Send" — and the
// textarea is that button's PRECEDING SIBLING (one suite finds it that way),
// which is why the card is a grid of siblings and not nested rows —
// [data-action='voice'] with aria-pressed, [data-action='attach'] and its menu
// items attach-files / attach-folder / attach-image, the three hidden inputs
// [data-input='files'|'folder'|'image'], .mitra-attachment[data-status],
// [data-action='remove-attachment'], .mitra-composer.is-dragging,
// .mitra-recording and [data-recording-seconds].
//
// STOP (REQUIREMENTS §85). While a turn is being answered and the host can
// stop it (`onStop`), a Stop button [data-action='stop'] stands where the
// arrow was, as in Claude — the Send button is still there (hidden, and
// disabled as it always was while busy), so every suite's hook on it holds.
// A turn being answered cannot be edited; Stop is how the person gets there.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode, type Ref } from "react";
import { FiArrowUp, FiCamera, FiFolder, FiLoader, FiMic, FiMicOff, FiPaperclip, FiPlus, FiSquare } from "react-icons/fi";
import type { MitraAttachment } from "../../engine/mitraTypes";
import { useT } from "../../i18n";
import { MitraAttachmentChips } from "./MitraAttachments";

export type AttachSource = "files" | "folder" | "image" | "drop" | "paste";

export interface MitraComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** An answer is on its way: send, attach and the microphone wait; the next message can still be typed. */
  busy?: boolean;
  /** Nothing can be done here at all (the box included). */
  disabled?: boolean;
  attachments: MitraAttachment[];
  /** Absent: files cannot be attached here, and the + is not offered. */
  onAttach?: (files: File[], source: AttachSource) => void;
  onRemoveAttachment?: (id: string) => void;
  /** The microphone's state; `active` is also the browser-recognition "listening". */
  recording: { active: boolean; seconds: number; transcribing: boolean };
  onToggleVoice: () => void;
  voiceMode: "whisper" | "browser" | "none";
  placeholder: string;
  /** The narrow dock: no hint line, a shorter box. */
  compact?: boolean;
  maxLength?: number;
  /** Extra classes on the whole area (the page adds "assistant-composer"). */
  className?: string;
  inputRef?: Ref<HTMLTextAreaElement>;
  /** A line above the card: listening, recording, a refused file, a microphone problem. */
  note?: { text: ReactNode; listening?: boolean } | null;
  /** Drawn above the card, inside the area — the widget's quick chips. */
  above?: ReactNode;
  /** The turn being answered can be stopped: while `busy`, Stop shows in place of Send. */
  onStop?: () => void;
}

const DEFAULT_MAX_LENGTH = 4000;

/** "00:07", "01:30". */
function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// A phone or a tablet: the Photo item then opens the camera itself.
const isTouchDevice = (): boolean => typeof window !== "undefined" && ("ontouchstart" in window || (typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0));

const draggingFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes("Files");

export function MitraComposer({
  value,
  onChange,
  onSend,
  busy = false,
  disabled = false,
  attachments,
  onAttach,
  onRemoveAttachment,
  recording,
  onToggleVoice,
  voiceMode,
  placeholder,
  compact = false,
  maxLength = DEFAULT_MAX_LENGTH,
  className,
  inputRef,
  note,
  above,
  onStop,
}: MitraComposerProps) {
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every child the pointer crosses; the depth
  // says when it has really left the card.
  const dragDepth = useRef(0);

  // The box is ours to measure and the host's to focus.
  const setTextarea = useCallback(
    (el: HTMLTextAreaElement | null) => {
      textareaRef.current = el;
      if (typeof inputRef === "function") inputRef(el);
      else if (inputRef) (inputRef as { current: HTMLTextAreaElement | null }).current = el;
    },
    [inputRef]
  );

  // One line to eight (six in the dock): the box takes the height of its
  // words, and the stylesheet's max-height stops it there, after which it
  // scrolls. One style write per keystroke, on an element a few lines tall.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, compact]);

  // A folder can only be asked for through this attribute, which React does not know.
  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
  }, [onAttach]);

  // The menu closes on a click anywhere else, or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: PointerEvent) => {
      if (!cardRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  const reading = attachments.some((a) => a.status === "reading");
  const canSend = !disabled && !busy && !reading && (value.trim().length > 0 || attachments.some((a) => a.status === "ready"));
  const stoppable = busy && !disabled && !!onStop;

  const picked = (e: ChangeEvent<HTMLInputElement>, source: AttachSource) => {
    const files = Array.from(e.target.files ?? []);
    // Cleared, so the same file can be chosen again after it was removed.
    e.target.value = "";
    if (files.length && onAttach) onAttach(files, source);
  };

  const openMenuItem = (input: HTMLInputElement | null) => {
    setMenuOpen(false);
    input?.click();
  };

  const onDragEnter = (e: DragEvent) => {
    if (!onAttach || !draggingFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (!onAttach || !draggingFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = () => {
    if (!onAttach) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!onAttach) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) onAttach(files, "drop");
  };

  const rec = recording;
  const micIdleTitle = voiceMode === "none" ? t("ai.voiceUnsupported") : t("ai.startVoice");
  const micTitle = rec.transcribing ? t("ai.transcribing") : rec.active ? t("ai.stopVoice") : micIdleTitle;

  return (
    <div className={`mitra-composer-area${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}>
      {above}
      {note && (
        <div className={`assistant-voice-note${note.listening ? " listening" : ""}`} role="status">
          {note.text}
        </div>
      )}
      <div
        ref={cardRef}
        className={`mitra-composer${dragging ? " is-dragging" : ""}${busy ? " is-busy" : ""}${disabled ? " is-disabled" : ""}${stoppable ? " is-stoppable" : ""}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {attachments.length > 0 && <MitraAttachmentChips attachments={attachments} onRemove={onRemoveAttachment} compact={compact} />}
        <textarea
          ref={setTextarea}
          className="input assistant-input mitra-input"
          rows={1}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={placeholder}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          onPaste={(e) => {
            if (!onAttach) return;
            const files = Array.from(e.clipboardData?.files ?? []);
            if (files.length) {
              e.preventDefault();
              onAttach(files, "paste");
            }
          }}
        />
        {onAttach && (
          <button
            type="button"
            className="btn btn-ghost mitra-attach"
            data-action="attach"
            aria-label={t("ai.attach")}
            title={t("ai.attach")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={disabled || busy}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <FiPlus size={17} />
          </button>
        )}
        <button
          type="button"
          className={`btn mitra-mic${rec.active ? " btn-danger mitra-recording" : " btn-ghost"}`}
          data-action="voice"
          onClick={onToggleVoice}
          disabled={disabled || busy || rec.transcribing}
          aria-label={rec.active ? t("ai.stopVoice") : t("ai.startVoice")}
          title={micTitle}
          aria-pressed={rec.active}
        >
          {rec.transcribing ? <FiLoader size={15} className="mitra-spin" /> : rec.active ? voiceMode === "whisper" ? <FiSquare size={13} /> : <FiMicOff size={15} /> : <FiMic size={15} />}
          {rec.active && voiceMode === "whisper" && (
            <span className="mitra-rec-time" data-recording-seconds={rec.seconds}>
              {mmss(rec.seconds)}
            </span>
          )}
          {rec.active && voiceMode !== "whisper" && !compact && <span>{t("ai.done")}</span>}
          {rec.transcribing && !compact && <span>{t("ai.transcribing")}</span>}
        </button>
        {/* data-action is the stable hook for tests and shortcuts; the aria-label
            stays the English word the suites click on, the tooltip is translated. */}
        <button type="button" className="btn btn-primary mitra-send" data-action="send" aria-label="Send" title={t("ai.send")} disabled={!canSend} onClick={onSend}>
          <FiArrowUp size={16} />
        </button>
        {stoppable && (
          <button type="button" className="btn mitra-stop" data-action="stop" aria-label="Stop the answer" title="Stop the answer" onClick={onStop}>
            <FiSquare size={12} aria-hidden="true" />
          </button>
        )}
        {onAttach && menuOpen && (
          <div className="mitra-menu" role="menu">
            <button type="button" role="menuitem" className="mitra-menu-item" data-action="attach-files" onClick={() => openMenuItem(filesRef.current)}>
              <FiPaperclip size={13} /> {t("ai.attachFiles")}
            </button>
            <button type="button" role="menuitem" className="mitra-menu-item" data-action="attach-folder" onClick={() => openMenuItem(folderRef.current)}>
              <FiFolder size={13} /> {t("ai.attachFolder")}
            </button>
            <button type="button" role="menuitem" className="mitra-menu-item" data-action="attach-image" onClick={() => openMenuItem(imageRef.current)}>
              <FiCamera size={13} /> {t("ai.attachPhoto")}
            </button>
          </div>
        )}
        {onAttach && (
          <>
            <input ref={filesRef} type="file" multiple hidden data-input="files" onChange={(e) => picked(e, "files")} />
            <input ref={folderRef} type="file" multiple hidden data-input="folder" onChange={(e) => picked(e, "folder")} />
            <input ref={imageRef} type="file" accept="image/*" multiple hidden data-input="image" {...(isTouchDevice() ? { capture: "environment" as const } : {})} onChange={(e) => picked(e, "image")} />
          </>
        )}
        {dragging && (
          <div className="mitra-drop-hint" aria-hidden="true">
            {t("ai.attachDrop")}
          </div>
        )}
      </div>
      {!compact && <div className="mitra-hint">{t("ai.composerHint")}</div>}
    </div>
  );
}
