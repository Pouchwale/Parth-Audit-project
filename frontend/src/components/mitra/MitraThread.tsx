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
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
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
}

// How close to the bottom (px) still counts as "reading along".
const FOLLOW_WITHIN = 80;

export function MitraThread({ messages, thinking, onChip, onOption, onCite, emptyState, compact, className, style, timeLabel, children }: MitraThreadProps) {
  const logRef = useRef<HTMLDivElement>(null);
  // Whether the person is at the bottom — read when THEY scroll, so following
  // the answer costs one property write and no measuring on every event.
  const following = useRef(true);

  const last = messages[messages.length - 1];
  const lastPending = !!last && last.role === "bot" && !!last.pending;
  // What makes the last message taller as it grows: its words, its steps, its options.
  const growth = last ? last.text.length + (last.steps?.length ?? 0) * 7 + (last.options?.length ?? 0) + (last.chips?.length ?? 0) : 0;

  // A new message, or the dots: to the bottom, and following again.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    following.current = true;
  }, [messages.length, thinking]);
  // The last message grew: stay at the bottom only if that is where the person was.
  useEffect(() => {
    const el = logRef.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
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
          <MitraMessage key={m.id} message={m} onChip={onChip} onOption={onOption} onCite={onCite} compact={compact} timeLabel={timeLabel} />
        ))}
        {children}
        {thinking && !lastPending && (
          <div className="mitra-turn bot">
            <span className="chat-avatar is-thinking" aria-hidden="true">
              <FiZap size={11} />
            </span>
            <div className="mitra-turn-body">
              <div className="chat-msg bot">
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
