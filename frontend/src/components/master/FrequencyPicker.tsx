import React, { useState } from "react";
import type { DocumentDefinition, Frequency, ScheduleConfig, ScheduleOverride } from "../../types";
import { scheduleLabel } from "../../engine/frequencyEngine";
import { todayISO } from "../../utils/date";
import { useAuth } from "../../store/AuthContext";
import { useSureFirst } from "../common/SureFirst";
import { SEED_DOCUMENTS } from "../../data/seed/documentDefinitions";

// THE FREQUENCY OF A DOCUMENT, SET BY THE SUPER ADMIN (REQUIREMENTS §143; the owner, 29-Oct-2026: "give me options of
// frequency in superadmin only in which superadmin can set the frequency of all documents"). On Master Data's Documents
// tab, beside each document: its frequency now, and the choices - every day, a weekday every week, the 1st and 3rd of a
// weekday, a day of the month, quarterly, yearly, as required. Saved as Master Data's scheduleOverrides, from today
// (DocumentDefinition.scheduleSince), after "Are you sure?" (§138). "As issued" drops the override.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
type Kind = ScheduleConfig["type"];
const KINDS: { kind: Kind; label: string; frequency: Frequency }[] = [
  { kind: "daily", label: "Every day", frequency: "Daily" },
  { kind: "weekly", label: "Every week", frequency: "Weekly" },
  { kind: "fortnightly", label: "Twice a month (1st & 3rd of a weekday)", frequency: "Fortnightly" },
  { kind: "monthly", label: "Every month", frequency: "Monthly" },
  { kind: "quarterly", label: "Every quarter", frequency: "Quarterly" },
  { kind: "yearly", label: "Every year", frequency: "Yearly" },
  { kind: "as-required", label: "As required", frequency: "As Required" },
];

/** The schedule of this kind, keeping what the current one shares with it (its weekday, its day of the month). */
function scheduleOf(kind: Kind, now: ScheduleConfig, weekday: number, day: number, month: number): ScheduleConfig {
  switch (kind) {
    case "daily":
      return { type: "daily" };
    case "weekly":
      return { type: "weekly", weekday };
    case "fortnightly":
      return { type: "fortnightly", weekday };
    case "monthly":
      return { type: "monthly", dayOfMonth: day };
    case "quarterly":
      return { type: "quarterly", anchorMonth: now.type === "quarterly" ? now.anchorMonth : month % 3, dayOfMonth: day };
    case "yearly":
      return { type: "yearly", month, dayOfMonth: day };
    default:
      return { type: "as-required" };
  }
}

const sameSchedule = (a: ScheduleConfig, b: ScheduleConfig): boolean => JSON.stringify(a) === JSON.stringify(b);

export function FrequencyPicker({ doc, override, onChange }: { doc: DocumentDefinition; override: ScheduleOverride | undefined; onChange: (next: ScheduleOverride | null) => void }) {
  const { user } = useAuth();
  const sure = useSureFirst();
  const now = doc.schedule;
  const [kind, setKind] = useState<Kind>(now.type);
  const [weekday, setWeekday] = useState<number>("weekday" in now && typeof now.weekday === "number" ? now.weekday : 1);
  const [day, setDay] = useState<number>("dayOfMonth" in now && typeof now.dayOfMonth === "number" ? now.dayOfMonth : 1);
  const [month, setMonth] = useState<number>(now.type === "yearly" ? now.month : now.type === "quarterly" ? now.anchorMonth : 0);
  const chosen = scheduleOf(kind, now, weekday, day, month);
  const changed = !sameSchedule(chosen, now);
  const number = doc.formatNo.startsWith("TO BE") ? doc.name : doc.formatNo;
  const save = () => {
    const frequency = KINDS.find((k) => k.kind === kind)!.frequency;
    const words = scheduleLabel({ ...doc, schedule: chosen });
    sure.ask(
      `${number} falls due ${words.charAt(0).toLowerCase()}${words.slice(1)} from today. The sheets already made stand as they are; everybody who answers for it is told the working day before each new due date.`,
      () => onChange({ schedule: chosen, frequency, since: todayISO(), by: user?.name ?? "" })
    );
  };
  const back = () => sure.ask(`${number} falls due as issued again (${scheduleLabel({ ...doc, schedule: issuedOf(doc, override) })}). The sheets already made stand as they are.`, () => onChange(null));
  return (
    <div className="flex items-center gap-1 wrap" data-section="frequency-picker">
      <select className="input input-sm" data-field="frequency-kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label={`How often ${number} falls due`}>
        {KINDS.map((k) => (
          <option key={k.kind} value={k.kind}>
            {k.label}
          </option>
        ))}
      </select>
      {(kind === "weekly" || kind === "fortnightly") && (
        <select className="input input-sm" data-field="frequency-weekday" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} aria-label="On which weekday">
          {WEEKDAYS.map((w, i) => (
            <option key={w} value={i}>
              {w}
            </option>
          ))}
        </select>
      )}
      {(kind === "monthly" || kind === "quarterly" || kind === "yearly") && (
        <input className="input input-sm" data-field="frequency-day" type="number" min={1} max={31} value={day} onChange={(e) => setDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))} style={{ width: 64 }} aria-label="On which day of the month" />
      )}
      {kind === "yearly" && (
        <select className="input input-sm" data-field="frequency-month" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="In which month">
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
      )}
      {changed && (
        <button type="button" className="btn btn-primary btn-sm" data-action="frequency-save" onClick={save}>
          Set
        </button>
      )}
      {override && !changed && (
        <button type="button" className="btn btn-ghost btn-sm" data-action="frequency-issued" onClick={back} title={`Set by ${override.by || "the super admin"} from ${override.since}`}>
          As issued
        </button>
      )}
      {sure.dialog}
    </div>
  );
}

/** The issued schedule, which the override replaced: the definition without it (the seed's). */
function issuedOf(doc: DocumentDefinition, override: ScheduleOverride | undefined): ScheduleConfig {
  if (!override) return doc.schedule;
  // The seed's own definition is what stands once the override is dropped; the document is handed in with the override
  // laid over it, so the seed is asked.
  return SEED_SCHEDULE(doc.id) ?? doc.schedule;
}

const SEED_SCHEDULE = (id: string): ScheduleConfig | undefined => SEED_DOCUMENTS.find((d) => d.id === id)?.schedule;
