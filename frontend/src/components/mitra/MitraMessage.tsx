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
import { FiWifiOff, FiZap } from "react-icons/fi";
import type { Chip } from "../../engine/guidedChecklist";
import type { CiteLink } from "../../engine/historyDigest";
import type { MitraStep } from "../../engine/mitraTypes";
import { unreachableLabel, type Unreachable } from "../../engine/assistantReach";
import { useT } from "../../i18n";
import { renderMarkdown } from "./markdown";
import { MitraAttachmentChips, type AttachmentChipData } from "./MitraAttachments";
import { MitraSteps } from "./MitraSteps";

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
}

export function MitraMessage({ message: m, onChip, onOption, onCite, compact, timeLabel }: MitraMessageProps) {
  const t = useT();
  const time = m.at && timeLabel ? timeLabel(m.at) : undefined;

  if (m.role === "user") {
    return (
      <div className="mitra-turn user" data-message={m.id}>
        <div className="mitra-turn-body">
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
        </div>
      </div>
    );
  }

  const working = m.steps?.some((s) => s.status === "running") ?? false;
  return (
    <div className="mitra-turn bot" data-message={m.id}>
      <span className={`chat-avatar${m.pending ? " is-thinking" : ""}`} aria-hidden="true">
        <FiZap size={11} />
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
      </div>
    </div>
  );
}
