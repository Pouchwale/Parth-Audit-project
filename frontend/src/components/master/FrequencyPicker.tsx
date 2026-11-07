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
// AND A FREQUENCY OF THE PERSON'S OWN (REQUIREMENTS §202; the owner, 7-Nov-2026: "in frequency add customly also"):
// Custom - every so many days from a date, the chosen weekdays of every week, or the chosen days of every month. The
// Frequency panel offers the same picker to everybody for the documents they answer for (pages/FrequencyPage.tsx).

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export type Kind = ScheduleConfig["type"];
export const KINDS: { kind: Kind; label: string; frequency: Frequency }[] = [
  { kind: "daily", label: "Every day", frequency: "Daily" },
  { kind: "weekly", label: "Every week", frequency: "Weekly" },
  { kind: "fortnightly", label: "Twice a month (1st & 3rd of a weekday)", frequency: "Fortnightly" },
  { kind: "monthly", label: "Every month", frequency: "Monthly" },
  { kind: "quarterly", label: "Every quarter", frequency: "Quarterly" },
  { kind: "half-yearly", label: "Every half year", frequency: "Half-yearly" },
  { kind: "yearly", label: "Every year", frequency: "Yearly" },
  { kind: "as-required", label: "As required", frequency: "As Required" },
  { kind: "custom", label: "Custom…", frequency: "Custom" },
];

/** The three ways a custom frequency can be said (§202). */
export type CustomMode = "every" | "weekdays" | "days";
export interface CustomChoice {
  mode: CustomMode;
  everyDays: number;
  from: string;
  weekdays: number[];
  daysOfMonth: number[];
}

/** The custom choice a schedule holds, or the default one (every 10 days from today, Monday, the 1st). */
export function customOf(now: ScheduleConfig, today: string = todayISO()): CustomChoice {
  const base: CustomChoice = { mode: "every", everyDays: 10, from: today, weekdays: [1], daysOfMonth: [1] };
  if (now.type !== "custom") return base;
  if (now.everyDays !== undefined) return { ...base, mode: "every", everyDays: now.everyDays, from: now.from };
  if (now.weekdays !== undefined) return { ...base, mode: "weekdays", weekdays: [...now.weekdays] };
  return { ...base, mode: "days", daysOfMonth: [...now.daysOfMonth] };
}

/** The custom schedule the choice makes, or null while it says nothing (no weekday, no day, no count). */
export function customSchedule(c: CustomChoice): ScheduleConfig | null {
  if (c.mode === "every") {
    const everyDays = Math.floor(c.everyDays);
    return Number.isFinite(everyDays) && everyDays >= 1 && everyDays <= 366 && /^\d{4}-\d{2}-\d{2}$/.test(c.from) ? { type: "custom", everyDays, from: c.from } : null;
  }
  if (c.mode === "weekdays") {
    const weekdays = [...new Set(c.weekdays.filter((w) => Number.isInteger(w) && w >= 0 && w <= 6))].sort((a, b) => a - b);
    return weekdays.length ? { type: "custom", weekdays } : null;
  }
  const daysOfMonth = [...new Set(c.daysOfMonth.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31))].sort((a, b) => a - b);
  return daysOfMonth.length ? { type: "custom", daysOfMonth } : null;
}

/** "5, 15, 25" as the days it names, in order, each once. */
export function parseDays(text: string): number[] {
  return [...new Set((text.match(/\d{1,2}/g) ?? []).map(Number).filter((d) => d >= 1 && d <= 31))].sort((a, b) => a - b);
}

/** The schedule of this kind, keeping what the current one shares with it (its weekday, its day of the month). */
export function scheduleOf(kind: Kind, now: ScheduleConfig, weekday: number, day: number, month: number, custom?: CustomChoice): ScheduleConfig {
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
    case "half-yearly":
      // Twice a year from the month chosen (January and July when none is), on the day chosen (REQUIREMENTS §163).
      return { type: "half-yearly", anchorMonth: now.type === "half-yearly" ? now.anchorMonth : month % 6, dayOfMonth: day };
    case "yearly":
      return { type: "yearly", month, dayOfMonth: day };
    case "custom":
      // Nothing chosen yet: the current schedule stands (so nothing changed, nothing to set).
      return customSchedule(custom ?? customOf(now)) ?? now;
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
  const [month, setMonth] = useState<number>(now.type === "yearly" ? now.month : now.type === "quarterly" || now.type === "half-yearly" ? now.anchorMonth : 0);
  const [custom, setCustom] = useState<CustomChoice>(() => customOf(now));
  const [daysText, setDaysText] = useState<string>(() => customOf(now).daysOfMonth.join(", "));
  const chosen = scheduleOf(kind, now, weekday, day, month, custom);
  const customSaid = kind !== "custom" || customSchedule(custom) !== null;
  const changed = !sameSchedule(chosen, now) && customSaid;
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
  const setCustomPart = (part: Partial<CustomChoice>) => setCustom((c) => ({ ...c, ...part }));
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
      {(kind === "monthly" || kind === "quarterly" || kind === "half-yearly" || kind === "yearly") && (
        <input className="input input-sm" data-field="frequency-day" type="number" min={1} max={31} value={day} onChange={(e) => setDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))} style={{ width: 64 }} aria-label="On which day of the month" />
      )}
      {(kind === "yearly" || kind === "half-yearly") && (
        <select className="input input-sm" data-field="frequency-month" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label={kind === "half-yearly" ? "From which month (and six months on)" : "In which month"}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
      )}
      {kind === "custom" && (
        <>
          {/* The custom frequency's own words (§202): every so many days from a date, the weekdays, or the days of the month. */}
          <select className="input input-sm" data-field="frequency-custom-mode" value={custom.mode} onChange={(e) => setCustomPart({ mode: e.target.value as CustomMode })} aria-label="Which kind of custom frequency">
            <option value="every">Every … days</option>
            <option value="weekdays">Chosen weekdays</option>
            <option value="days">Chosen days of the month</option>
          </select>
          {custom.mode === "every" && (
            <>
              <span className="text-sm text-muted">every</span>
              <input
                className="input input-sm"
                data-field="frequency-every-days"
                type="number"
                min={1}
                max={366}
                value={custom.everyDays}
                onChange={(e) => setCustomPart({ everyDays: Math.min(366, Math.max(1, Number(e.target.value) || 1)) })}
                style={{ width: 64 }}
                aria-label="Every how many days"
              />
              <span className="text-sm text-muted">days from</span>
              <input className="input input-sm" data-field="frequency-from" type="date" value={custom.from} onChange={(e) => setCustomPart({ from: e.target.value })} aria-label="From which date" />
            </>
          )}
          {custom.mode === "weekdays" && (
            <span className="flex items-center gap-1 wrap" data-field="frequency-weekdays" role="group" aria-label="On which weekdays">
              {WEEKDAYS.map((w, i) => (
                <label key={w} className="text-sm flex items-center gap-1" style={{ marginRight: 4 }}>
                  <input
                    type="checkbox"
                    checked={custom.weekdays.includes(i)}
                    onChange={(e) => setCustomPart({ weekdays: e.target.checked ? [...custom.weekdays, i] : custom.weekdays.filter((x) => x !== i) })}
                    aria-label={w}
                  />
                  {w.slice(0, 3)}
                </label>
              ))}
            </span>
          )}
          {custom.mode === "days" && (
            <input
              className="input input-sm"
              data-field="frequency-days-of-month"
              value={daysText}
              placeholder="e.g. 5, 15, 25"
              onChange={(e) => {
                setDaysText(e.target.value);
                setCustomPart({ daysOfMonth: parseDays(e.target.value) });
              }}
              style={{ width: 140 }}
              aria-label="On which days of the month, separated by commas"
            />
          )}
        </>
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
