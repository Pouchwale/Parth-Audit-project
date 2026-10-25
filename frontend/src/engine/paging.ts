// PAGES OF A LONG LIST OF PEOPLE (the owner, 25-Oct-2026: "use pagination in user access because there are many id's we
// have created currently and so low ending devices take time to load that page so make sure it should load fast").
//
// Users & Access and User access draw every account in a table - on Users & Access each staff row of the access grid is
// ten level boxes, and its defaults are worked out per person - so a plant with hundreds of accounts made the page draw
// thousands of controls before it answered. Now each list draws one page of PAGE_SIZE people, whatever the plant
// holds, and "Find a person" looks through all of them. The pure part, here; components/common/Pager.tsx draws it.

/** People to a page: a laptop's screen or two of rows. */
export const PAGE_SIZE = 25;

export interface PageOf {
  /** The page shown, counted from 0. */
  page: number;
  /** How many pages there are (1 for an empty list). */
  pages: number;
  /** The rows the page holds: from (counted) to (not counted). */
  from: number;
  to: number;
  total: number;
}

/** Which rows a page holds. A page past the end (the list grew shorter: an account removed, a search typed) is the last there is. */
export function pageOf(total: number, page: number, size: number = PAGE_SIZE): PageOf {
  const rows = Math.max(0, Math.floor(total) || 0);
  const per = Math.max(1, Math.floor(size) || PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(rows / per));
  const at = Math.min(Math.max(0, Math.floor(page) || 0), pages - 1);
  return { page: at, pages, from: at * per, to: Math.min(rows, at * per + per), total: rows };
}

/** The page numbers a pager offers: the first, the last, the current one and one each side of it; null for a gap. */
export function pageNumbers(page: number, pages: number): (number | null)[] {
  const keep = new Set([0, pages - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < pages));
  // A gap of one page is that page, not "…".
  for (const p of [...keep]) {
    if (keep.has(p + 2) && !keep.has(p + 1)) keep.add(p + 1);
  }
  const out: (number | null)[] = [];
  let last = -1;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (last >= 0 && p > last + 1) out.push(null);
    out.push(p);
    last = p;
  }
  return out;
}

/** Whether what was typed finds this person: every word of it somewhere in their name or sign-in, in any case. */
export function findsPerson(person: { name?: string | null; email?: string | null }, typed: string): boolean {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = `${person.name ?? ""} ${person.email ?? ""}`.toLowerCase();
  return words.every((w) => text.includes(w));
}
