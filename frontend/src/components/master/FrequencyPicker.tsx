import React, { useState } from "react";
import type { DocumentDefinition, ScheduleConfig, ScheduleOverride } from "../../types";
import { scheduleLabel } from "../../engine/frequencyEngine";
import { KINDS, customOf, customSchedule, parseDays, scheduleOf, type CustomChoice, type CustomMode, type Kind } from "../../engine/frequencyChoice";
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
// Frequency panel offers the same picker to everybody for the documents they answer for (pages/FrequencyPage.tsx), and
// Mitra sets the same by word (engine/mitraTools.ts). The kinds and the schedules they make: engine/frequencyChoice.ts.

export { KINDS, customOf, customSchedule, parseDays, scheduleOf };
export type { CustomChoice, CustomMode, Kind };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
