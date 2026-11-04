import { parseWrittenDate } from "./hrMaster";
import { writtenDate } from "./trainingCalendar";

// EVERY DATE ON THE HR REGISTERS AS THE APP WRITES DATES (REQUIREMENTS §171, §183). The owner, 3-Nov-2026: "make sure the
// date format in all the records is like dd-mm-yyyy ... for all modules". The registers carried over from the paper kept the
// paper's spellings on their lines - F/HR/01's "01.04.2014" and "4/30/2025", F/HR/03's "5/13/2008", F/HR/09's "7/22/2026",
// F/HR/08's period "01.04.2026 ~ 31.03.2027" - and printed and downloaded them so. Each is written here as the app writes a
// date, "30-04-2025", wherever the register is shown or stored (engine/computedCells.ts): a box holding a date and nothing
// else, or a period of two dates; anything else in the box ("Fresher", "NA", "Yes") is left as it is. A slashed date is read
// in the register's own order (F/HR/01 and F/HR/03 month first, F/HR/06 and F/HR/13 day first, engine/hrMaster.ts); F/HR/09's
// in its month's column, so "2/4/2027" under February is the 4th (engine/trainingCalendar.ts writtenDate).

interface Rule {
  /** Header boxes that hold a date or a period. */
  header?: readonly string[];
  /** Columns that hold a date. */
  rows?: (key: string) => boolean;
  /** How the register's own slashed dates are ordered. */
  slash: "mdy" | "dmy";
  /** F/HR/09: each month column read in its own month. */
  calendar?: boolean;
}

const RULES: Record<string, Rule> = {
  "hr-competence": { header: ["reviewedOn"], rows: (k) => k === "dateOfJoining" || k === "dateOfLeaving", slash: "mdy" },
  "hr-skill-matrix": { header: ["statusAsOn"], rows: (k) => k === "dateOfJoining", slash: "mdy" },
  "hr-training-needs": { header: ["period"], slash: "mdy" },
  "hr-training-calendar": { header: ["period"], rows: (k) => /^m\d+(Plan|Actual)$/.test(k), slash: "mdy", calendar: true },
  "hr-induction-operators": { rows: (k) => k === "dateOfJoiningInduction", slash: "dmy" },
  "hr-mobile-authorization": { rows: (k) => k === "dateOfAllowance", slash: "dmy" },
};

const WRITTEN = /^\d{1,2}[./-]\d{1,2}[./-](\d{2}|\d{4})$/;
const PERIOD = /^(\S+)\s*(~|\bto\b)\s*(\S+)$/i;

const dayFirst = (iso: string): string => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/** A box's words as the app writes them: a date, or a period of two, re-written; anything else as it was. */
export function asAppDate(value: unknown, slash: "mdy" | "dmy", read?: (text: string) => string | null): unknown {
  if (typeof value !== "string") return value;
  const t = value.trim();
  if (!t) return value;
  const one = (s: string): string | null => {
    if (!WRITTEN.test(s)) return null;
    const iso = read ? read(s) : parseWrittenDate(s, slash);
    return iso ? dayFirst(iso) : null;
  };
  const whole = one(t);
  if (whole) return whole === value ? value : whole;
  const p = PERIOD.exec(t);
  if (p) {
    const a = one(p[1]);
    const b = one(p[3]);
    if (a && b) {
      const out = `${a} ${p[2]} ${b}`;
      return out === value ? value : out;
    }
  }
  return value;
}

/** The year a calendar's period starts in ("01-04-2026 ~ 31-03-2027" -> 2026). */
function periodStart(period: unknown): number | null {
  const m = /(\d{4})/.exec(String(period ?? ""));
  return m ? Number(m[1]) : null;
}

/** The register's data with every date as the app writes dates; the very same object when nothing changed. */
export function withRegisterDates<T>(documentId: string | undefined, data: T): T {
  const rule = documentId ? RULES[documentId] : undefined;
  if (!rule || !data || typeof data !== "object") return data;
  const d = data as unknown as { header?: Record<string, unknown>; rows?: Record<string, unknown>[] };
  let header = d.header;
  for (const key of rule.header ?? []) {
    if (!header || !(key in header)) continue;
    const next = asAppDate(header[key], rule.slash);
    if (next !== header[key]) header = { ...header, [key]: next };
  }
  let rows = d.rows;
  if (rule.rows && Array.isArray(rows)) {
    const start = rule.calendar ? (periodStart(header?.period) ?? new Date().getFullYear()) : 0;
    let changed = false;
    const next = rows.map((row) => {
      if (!row || typeof row !== "object") return row;
      let out = row;
      for (const key of Object.keys(row)) {
        if (!rule.rows!(key)) continue;
        let read: ((s: string) => string | null) | undefined;
        if (rule.calendar) {
          // m0 is April: the month and the year of the column's own month.
          const i = Number(/^m(\d+)/.exec(key)?.[1] ?? 0);
          const month = ((i + 3) % 12) + 1;
          const year = start + (i >= 9 ? 1 : 0);
          read = (s) => writtenDate(s, year, month);
        }
        const v = asAppDate(row[key], rule.slash, read);
        if (v !== row[key]) {
          if (out === row) out = { ...row };
          out[key] = v;
        }
      }
      if (out !== row) changed = true;
      return out;
    });
    if (changed) rows = next;
  }
  if (header === d.header && rows === d.rows) return data;
  return { ...d, header, rows } as unknown as T;
}
