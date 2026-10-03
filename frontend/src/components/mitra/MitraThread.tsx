// THE CONVERSATION (REQUIREMENTS §80, components/mitra).
//
// The scrolling log of turns, the same on the full page (pages/AssistantPage
// .tsx, where it is centred at 860 px) and in the docked widget (components/
// common/DocumentAssistant.tsx, `compact`). It owns the one behaviour a log
// needs: it follows the conversation — scrolled to the bottom when a message
// arrives, and kept there while an answer grows, unless the person has
// scrolled up to read something, in which case it leaves them where they are.
//
// `thinking` shows the three dots the app has always shown while an answer is
// on its way (the suites wait for ".chat-typing" to go); when the last message
// is the agent's own pending answer, that message shows its "thinking" line
// instead, so the two are never on screen together.
//
// EDITING (REQUIREMENTS §85): the thread knows which of the person's messages
// is open for editing — one at a time; the words being typed live in that
// message's own box (MitraMessage.tsx). Save hands them to the host
// (`onEdit`), which cuts the conversation back to just before that message and
// sends the words as that turn again; the box then closes, and the new message
// and its answer arrive like any other. While a turn is being answered
// (`editLocked`) Edit and Save wait: the person stops it first.
//
// The thread hands every message the SAME functions on every draw (the host's
// are read through a ref when called), so the memoised messages draw again
// only when they themselves change — a keystroke in the composer, a step on
// the last answer or the Edit box opening no longer redraws all of them.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FiZap } from "react-icons/fi";
import type { Chip } from "../../engine/guidedChecklist";
import { MitraMessage, type MitraMessageView } from "./MitraMessage";

export interface MitraThreadProps {
  messages: MitraMessageView[];
  /** An answer is on its way (the typing dots). */
  thinking: boolean;
  onChip: (chip: Chip) => void;
  onOption: (text: string, message: MitraMessageView) => void;
  onCite: (route: string) => void;
  /** Drawn when there are no messages (the page's welcome, the widget's opening). */
  emptyState?: ReactNode;
  /** The narrow dock: no faces beside the messages, tighter spacing. */
  compact?: boolean;
  /** Extra classes on the log itself (the page adds "assistant-log"). */
  className?: string;
  style?: CSSProperties;
  timeLabel?: (iso: string) => string;
  /** Rows after the messages — the widget's inline date picker, for one. */
  children?: ReactNode;
  /**
   * Save of an edited message (REQUIREMENTS §85): the host sends `text` as
   * that turn again, replacing everything after it. Answers false when it
   * could not (the box then stays open). Absent: the person's messages have no Edit.
   */
  onEdit?: (message: MitraMessageView, text: string) => boolean | void;
  /** A turn is being answered: Edit and Save wait until it is over or stopped. */
  editLocked?: boolean;
}

// How close to the bottom (px) still counts as "reading along".
const FOLLOW_WITHIN = 80;

export function MitraThread({ messages, thinking, onChip, onOption, onCite, emptyState, compact, className, style, timeLabel, children, onEdit, editLocked }: MitraThreadProps) {
  const logRef = useRef<HTMLDivElement>(null);
  // Whether the person is at the bottom — read when THEY scroll, so following
  // the answer costs one property write and no measuring on every event.
  const following = useRef(true);
  // The one message open for editing (its words being edited live in its box).
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingHere = editingId !== null && messages.some((m) => m.id === editingId && m.role === "user");
  // The message went away (another conversation opened, the thread replaced): so does its box.
  useEffect(() => {
    if (editingId !== null && !editingHere) setEditingId(null);
  }, [editingId, editingHere]);

  // The host's handlers as they are now, called through functions that never change.
  const live = useRef({ onChip, onOption, onCite, onEdit, editLocked });
  live.current = { onChip, onOption, onCite, onEdit, editLocked };
  const stable = useMemo(
    () => ({
      onChip: (chip: Chip) => live.current.onChip(chip),
      onOption: (text: string, message: MitraMessageView) => live.current.onOption(text, message),
      onCite: (route: string) => live.current.onCite(route),
      startEdit: (id: string) => setEditingId(id),
      cancelEdit: () => setEditingId(null),
      saveEdit: (message: MitraMessageView, text: string) => {
        const { onEdit: host, editLocked: locked } = live.current;
        if (locked || !host) return;
        if (host(message, text) !== false) setEditingId(null);
      },
    }),
    []
  );

  const last = messages[messages.length - 1];
  const lastPending = !!last && last.role === "bot" && !!last.pending;
  // What makes the last message taller as it grows: its words, its steps, its options.
  const growth = last ? last.text.length + (last.steps?.length ?? 0) * 7 + (last.options?.length ?? 0) + (last.chips?.length ?? 0) : 0;

  // A new message, or the dots: to the bottom, and following again. An empty
  // thread shows its welcome from the top — scrolled to the bottom, a welcome
  // taller than the log opened with its greeting out of sight.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = messages.length === 0 && !thinking ? 0 : el.scrollHeight;
    following.current = true;
  }, [messages.length, thinking]);
  // The last message grew: stay at the bottom only if that is where the person
  // was. With no message there is nothing to follow (this runs on the first draw
  // too, and would undo the welcome's place at the top).
  const hasMessages = messages.length > 0;
  useEffect(() => {
    const el = logRef.current;
    if (el && hasMessages && following.current) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [growth]);

  const onScroll = () => {
    const el = logRef.current;
    if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_WITHIN;
  };

  return (
    <div ref={logRef} className={`chat-log${className ? ` ${className}` : ""}${compact ? " is-compact" : ""}`} style={style} onScroll={onScroll}>
      <div className="mitra-thread">
        {messages.length === 0 && emptyState}
        {messages.map((m) => (
          <MitraMessage
            key={m.id}
            message={m}
            onChip={stable.onChip}
            onOption={stable.onOption}
            onCite={stable.onCite}
            compact={compact}
            timeLabel={timeLabel}
            {...(onEdit && m.role === "user"
              ? { onEdit: stable.startEdit, editLocked, editing: editingHere && m.id === editingId, onSaveEdit: stable.saveEdit, onCancelEdit: stable.cancelEdit }
              : {})}
          />
        ))}
        {children}
        {thinking && !lastPending && (
          <div className="mitra-turn bot">
            <span className="chat-avatar is-thinking" aria-hidden="true">
              <FiZap size={12} />
            </span>
            <div className="mitra-turn-body">
              <div className="chat-msg bot mitra-typing">
                <span className="chat-typing">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
