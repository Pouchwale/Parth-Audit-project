// THE STEPS MITRA TOOK (REQUIREMENTS §80, components/mitra).
//
// While the agent works, every tool it calls is shown as a small row under
// its message — a picture for the tool, the card the tool wrote ("Opened
// Insights", "Filled 4 boxes on F/HR/17"), and how it went: still running,
// done, or failed. A person can then see WHAT was done, not just read that
// something was — and a failed step is never hidden behind the words.
//
// One row per step; each element carries data-tool and data-status, which the
// Playwright suites read (SPEC "DOM contract").
import {
  FiAlertTriangle,
  FiBarChart2,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiEdit3,
  FiEye,
  FiFileText,
  FiHelpCircle,
  FiImage,
  FiLayout,
  FiList,
  FiLoader,
  FiNavigation,
  FiPaperclip,
  FiSearch,
  FiSliders,
  FiTool,
  FiUsers,
} from "react-icons/fi";
import type { MitraStep } from "../../engine/mitraTypes";
import { useT } from "../../i18n";

type Icon = typeof FiTool;

// One small picture per tool (engine/mitraTools.ts), so a row of steps reads at a glance.
const TOOL_ICONS: Record<string, Icon> = {
  navigate: FiNavigation,
  find_documents: FiSearch,
  open_document: FiFileText,
  get_open_record: FiEye,
  get_record: FiEye,
  edit_open_record: FiEdit3,
  fill_open_record_with_sample_data: FiSliders,
  start_guided_fill: FiList,
  record_action: FiCheckCircle,
  change_format: FiLayout,
  search_records: FiSearch,
  list_records: FiList,
  history_figures: FiBarChart2,
  todays_facts: FiCalendar,
  read_attachment: FiPaperclip,
  add_photo_to_open_record: FiImage,
  ask_user: FiHelpCircle,
  hr_master_lookup: FiUsers,
};

/** The picture for a tool's step — a plain spanner for one this list does not know. */
export function toolIcon(tool: string): Icon {
  return TOOL_ICONS[tool] ?? FiTool;
}

export function MitraSteps({ steps, compact }: { steps: MitraStep[]; compact?: boolean }) {
  const t = useT();
  if (steps.length === 0) return null;
  return (
    <div className={`mitra-steps${compact ? " is-compact" : ""}`}>
      {steps.map((s) => {
        const Icon = toolIcon(s.tool);
        const state = s.status === "done" ? t("ai.stepDone") : s.status === "failed" ? t("ai.stepFailed") : t("ai.working");
        return (
          <div key={s.id} className="mitra-step" data-tool={s.tool} data-status={s.status} title={`${s.label} — ${state}`}>
            <Icon size={12} className="mitra-step-icon" aria-hidden="true" />
            <span className="mitra-step-label">{s.label}</span>
            <span className="mitra-step-state" role="img" aria-label={state}>
              {s.status === "running" ? <FiLoader size={12} className="mitra-spin" /> : s.status === "done" ? <FiCheck size={12} /> : <FiAlertTriangle size={12} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}
