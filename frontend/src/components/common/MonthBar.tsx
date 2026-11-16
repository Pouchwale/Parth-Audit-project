import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { MONTH_NAMES } from "../../utils/date";

// THE MONTH A DOCUMENT'S RECORDS ARE LISTED FOR (REQUIREMENTS §227; the owner, 16-Nov-2026: "add button of month in all
// modules in which user can easily switch month whenever they want to see old or new or current record"): the year,
// the month (or every month), the month before and after, and back to this month.

/** A month of a year, or the whole of every year ("all"). */
export type RecordsPeriod = { year: number; month: number | "all" };

export function MonthBar({ value, onChange, years, today }: { value: RecordsPeriod; onChange: (p: RecordsPeriod) => void; years: number[]; today: string }) {
  const thisYear = Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(5, 7)) - 1;
  const step = (by: number) => {
    const base = value.month === "all" ? { year: thisYear, month: thisMonth } : { year: value.year, month: value.month };
    const n = base.year * 12 + base.month + by;
    onChange({ year: Math.floor(n / 12), month: n % 12 });
  };
  const yearList = Array.from(new Set([...years, thisYear, value.year])).sort((a, b) => b - a);
  const isNow = value.month === thisMonth && value.year === thisYear;
  return (
    <div className="flex items-center gap-2 wrap mb-2 no-print" data-section="records-month">
      <span className="text-sm text-muted">Month</span>
      <button type="button" className="btn btn-secondary btn-sm" data-action="month-previous" onClick={() => step(-1)} aria-label="The month before">
        <FiChevronLeft size={13} /> Previous
      </button>
      <select
        className="input input-sm"
        style={{ width: 150 }}
        data-field="records-month"
        aria-label="Month"
        value={value.month === "all" ? "all" : String(value.month)}
        onChange={(e) => onChange({ year: value.year, month: e.target.value === "all" ? "all" : Number(e.target.value) })}
      >
        <option value="all">All months</option>
        {MONTH_NAMES.map((m, i) => (
          <option key={m} value={i}>
            {m}
          </option>
        ))}
      </select>
      <select
        className="input input-sm"
        style={{ width: 96 }}
        data-field="records-year"
        aria-label="Year"
        value={value.year}
        disabled={value.month === "all"}
        onChange={(e) => onChange({ year: Number(e.target.value), month: value.month })}
      >
        {yearList.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-secondary btn-sm" data-action="month-next" onClick={() => step(1)} aria-label="The month after">
        Next <FiChevronRight size={13} />
      </button>
      {!isNow && (
        <button type="button" className="btn btn-ghost btn-sm" data-action="month-now" onClick={() => onChange({ year: thisYear, month: thisMonth })}>
          This month
        </button>
      )}
    </div>
  );
}

/** Whether a record dated `dueDate` falls in the period. */
export const inPeriod = (dueDate: string, p: RecordsPeriod): boolean =>
  p.month === "all" || (Number(dueDate.slice(0, 4)) === p.year && Number(dueDate.slice(5, 7)) - 1 === p.month);
