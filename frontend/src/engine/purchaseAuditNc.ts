import type { LogSheetData, LogSheetRow } from "../types";

// F/PUR/02, THE SUPPLIER AUDIT REPORT (REQUIREMENTS §229; the owner, 16-Nov-2026: "in pur-02 in that all answer will be yes
// and when user select NC in C/NC/NA (Section 1) / RATING (Sections 2 to 8) so that also it should also fill"; asked: "in
// down below Section, Details of observations / NC, and Response evidence received from supplier / on-site verification
// for all three NC-1, NC-2, NC-3").
//
//   * Every audit point of a new sheet is AUDITED: Yes (the shaded sub-heading "EXTERNAL LABORATORY - IF USED" is a
//     heading, nothing against it), each the person's to change.
//   * The audit points rated NC fill the observations / NC table below, in their order, three at most: NC 1, NC 2, NC 3
//     each take the point's No. as its Section, the point's words as its Details and the point's COMMENTS as its Response
//     evidence. A box the table filled follows its point (the comments typed, the NC taken off); a box a person wrote
//     their own words in is theirs and is never written over. What the table filled is remembered under `ncAuto` (never a
//     line of the history, engine/recordHistory.ts).

export const AUDIT_DOC = "pur-supplier-audit-report";
export const NC_AUTO = "ncAuto";
const SUBHEADING = "EXTERNAL LABORATORY - IF USED";
const NC_LINES = 3;
const BOXES: [string, (r: LogSheetRow) => unknown][] = [
  ["Section", (r) => r.itemNo],
  ["Details", (r) => r.auditPoint],
  ["Response", (r) => r.comments],
];

const words = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

/** A new sheet's audit points, each AUDITED: Yes - the sub-heading left as it is. */
export function withAuditedYes(rows: LogSheetRow[]): LogSheetRow[] {
  return rows.map((r) => (r.auditPoint === SUBHEADING || words(r.audited) !== "" ? r : { ...r, audited: "Yes" }));
}

/** The audit point lines that may be answered (all but the sub-heading). */
export const isAuditPoint = (r: LogSheetRow): boolean => r.auditPoint !== SUBHEADING;

/** The observations / NC table filled from the points rated NC (above). Same object when nothing changes. */
export function withAuditNcTable<T>(documentId: string | undefined, data: T): T {
  if (documentId !== AUDIT_DOC) return data;
  const d = data as unknown as LogSheetData;
  if (!d || !Array.isArray(d.rows)) return data;
  const header: Record<string, string> = { ...(d.header ?? {}) } as Record<string, string>;
  let auto: Record<string, string> = {};
  try {
    const parsed: unknown = JSON.parse(words(header[NC_AUTO]) || "{}");
    if (parsed && typeof parsed === "object") auto = parsed as Record<string, string>;
  } catch {
    auto = {};
  }
  const ncRows = d.rows.filter((r) => isAuditPoint(r) && words(r.rating).toUpperCase() === "NC").slice(0, NC_LINES);
  const nextAuto: Record<string, string> = {};
  let changed = false;
  for (let i = 1; i <= NC_LINES; i++) {
    const row = ncRows[i - 1];
    for (const [box, of] of BOXES) {
      const key = `nc${i}${box}`;
      const want = row ? words(of(row)) : "";
      const now = words(header[key]);
      const was = auto[key];
      // The table's own box (empty, or as the table last filled it): it follows its point.
      if (now === "" || (was !== undefined && now === was)) {
        if (now !== want) {
          header[key] = want;
          changed = true;
        }
        if (want) nextAuto[key] = want;
      }
      // A person's own words: left as they are.
    }
  }
  const autoWords = Object.keys(nextAuto).length > 0 ? JSON.stringify(nextAuto) : "";
  if (words(d.header?.[NC_AUTO]) !== autoWords) {
    if (autoWords) header[NC_AUTO] = autoWords;
    else delete header[NC_AUTO];
    changed = true;
  }
  return changed ? ({ ...d, header } as unknown as T) : data;
}
