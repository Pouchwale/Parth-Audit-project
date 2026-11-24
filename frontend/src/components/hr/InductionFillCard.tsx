import React, { useEffect, useMemo, useState } from "react";
import { masterRepository } from "../../data/repositories/masterRepository";
import { dayInfo } from "../../engine/holidays";
import { inductionFillDay, inductionStanding, runInductionRound } from "../../engine/inductionRound";
import { useAppStore } from "../../store/AppStore";
import { compareISO, formatDisplayDate, todayISO } from "../../utils/date";

// F/HR/05's page: the day its forms for Supervisor and above are filled (REQUIREMENTS §303). Nothing is made until a date is set.

const named = (iso: string): string => `${dayInfo(iso, masterRepository.get()).weekday}, ${formatDisplayDate(iso)}`;

export function InductionFillCard({ onChanged }: { onChanged: () => void }) {
  const { version } = useAppStore();
  const today = todayISO();
  const stored = masterRepository.get().inductionFillDate ?? "";
  const [date, setDate] = useState(stored);
  const [made, setMade] = useState<number | null>(null);

  const fill = () => {
    const count = runInductionRound();
    setMade(count);
    if (count > 0) onChanged();
  };
  // A day the server's morning job missed (the PC was off) is caught up when this page is opened.
  useEffect(() => {
    if (runInductionRound() > 0) onChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const standing = useMemo(() => inductionStanding(today), [today, version, made]);
  const fillDay = inductionFillDay();
  const moved = !!stored && fillDay !== stored;
  const tooEarly = !!date && compareISO(date, today) < 0;

  const save = () => {
    if (!date || tooEarly) return;
    masterRepository.update({ inductionFillDate: date });
    setMade(null);
    fill();
  };
  const clear = () => {
    masterRepository.update({ inductionFillDate: "" });
    setDate("");
    setMade(null);
    onChanged();
  };

  return (
    <div className="card card-pad mb-4" data-card="induction-fill">
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Fill for Supervisor &amp; above</div>
      <div className="flex gap-2 wrap" style={{ alignItems: "center" }}>
        <label htmlFor="induction-fill-date">Fill date</label>
        <input id="induction-fill-date" className="input input-sm" style={{ width: 150 }} type="date" min={today} value={date} data-field="induction-fill-date" onChange={(e) => setDate(e.target.value)} />
        {date && <span className="text-muted">{dayInfo(date, masterRepository.get()).weekday}</span>}
        <button className="btn btn-primary btn-sm" data-action="induction-fill-set" disabled={!date || tooEarly || date === stored} onClick={save}>
          Set date
        </button>
        {stored && (
          <button className="btn btn-secondary btn-sm" data-action="induction-fill-clear" onClick={clear}>
            Clear
          </button>
        )}
      </div>
      <div className="text-muted" data-info="induction-fill" style={{ marginTop: 8 }}>
        {tooEarly && <div>Choose today or a later day.</div>}
        {!stored && <div>No date set, so nothing is filled. {standing.people} people are Supervisor or above.</div>}
        {stored && moved && <div>{named(stored)} is a holiday, so the forms are filled on the next working day.</div>}
        {stored && compareISO(fillDay, today) > 0 && <div>{standing.toMake.length} forms will be filled on {named(fillDay)}.</div>}
        {stored && compareISO(fillDay, today) <= 0 && <div>Filled from {named(fillDay)}. {made ? `${made} forms made now. ` : ""}{standing.haveForm} of {standing.people} people have a form.</div>}
        {standing.notJoined > 0 && <div>{standing.notJoined} have not joined yet, and get a form once they have.</div>}
        {standing.deleted > 0 && <div>{standing.deleted} forms were deleted and are not made again.</div>}
      </div>
    </div>
  );
}
