import { flushSync } from "react-dom";

// A LONG HR REGISTER, EACH PRINTED PAGE WITH ITS OWN NUMBER (REQUIREMENTS §277). A heading the browser repeats is the same words on
// every page, so a register of 112 names printed "Page No.: 1 Of 1" four times. For the print the page works out where each page
// ends, and the paper draws its head again there with that page's number. Taken back when the print is done.

type SetBreaks = (breaks: number[] | null) => void;
const pagers = new Map<string, SetBreaks>();

const PX_PER_MM = 96 / 25.4;
/** The foot's margin (styles.css .paper-page-foot) and a little kept in hand: the print is measured closely, not to the pixel. */
const FOOT_MM = 9 + 1.5;
const SHEETS = ".paper-table-sheet[data-paper-own][data-paper-flows]:not([data-paper-pages])";

/** A paper on the screen says how to draw its pages. Returns how to take that back. */
export function registerPaperPager(recordId: string, set: SetBreaks): () => void {
  pagers.set(recordId, set);
  return () => {
    if (pagers.get(recordId) === set) pagers.delete(recordId);
  };
}

const heightOf = (els: Element[]): number => els.reduce((a, e) => a + e.getBoundingClientRect().height, 0);

/** The lines each later page starts at, from the sheet as it prints. */
function breaksOf(sheet: HTMLElement): number[] {
  const pageH = sheet.getAttribute("data-paper") === "landscape" ? 210 : 297;
  const top = Number(sheet.style.getPropertyValue("--pt-top")) || 12;
  const room = (pageH - top - FOOT_MM) * PX_PER_MM;
  const shown = (tr: Element) => getComputedStyle(tr).display !== "none";
  const lines = Array.from(sheet.querySelectorAll(".paper-body tr[data-pt-line]")).filter(shown);
  if (lines.length === 0) return [];
  const head = heightOf(Array.from(sheet.querySelectorAll(".paper-head table.pt-table")));
  // (a continued page repeats the letterhead down to its number band: PaperTableSheet pageHeadRows)
  const headRows = Array.from(sheet.querySelectorAll(".paper-head table.pt-table tr"));
  let band = -1;
  headRows.forEach((tr, i) => {
    if (/Format No|Page\s*No|F\/HR\/\d+/i.test(tr.textContent ?? "")) band = i;
  });
  if (band >= 0 && headRows[band + 1] && !(headRows[band + 1].textContent ?? "").trim()) band += 1;
  const again = band >= 0 ? heightOf(headRows.slice(0, band + 1)) : head;
  const heading = heightOf(Array.from(sheet.querySelectorAll(".paper-body tr[data-pt-heading]")).filter(shown));
  const bodyTop = sheet.querySelector(".paper-body table.pt-table")?.getBoundingClientRect().top ?? lines[0].getBoundingClientRect().top;
  // (a foot that starts pages of its own keeps only its first page's rows under the last line: F/SYS/04's item 8 result, §325)
  const footTables = Array.from(sheet.querySelectorAll(".paper-foot table.pt-table"));
  const foot = sheet.querySelector(".paper-foot tr.pt-pb") ? heightOf(footTables.slice(0, 1)) : heightOf(footTables);
  const lineOf = (tr: Element) => Number(tr.getAttribute("data-pt-line")) - 1;
  const breaks: number[] = [];
  // (where the paper draws a page of its own above the first line, that page is the one the lines start on)
  const firstTop = lines[0].getBoundingClientRect().top;
  const ownPage = Array.from(sheet.querySelectorAll(".paper-body tr.pt-pb")).filter((tr) => tr.getBoundingClientRect().top <= firstTop).pop();
  let used = ownPage ? firstTop - ownPage.getBoundingClientRect().top : head + (firstTop - bodyTop);
  for (const tr of lines) {
    const h = tr.getBoundingClientRect().height;
    if (used + h > room) {
      breaks.push(lineOf(tr));
      used = again + heading;
    }
    used += h;
  }
  // (the paper's foot stands under its last line, on the same page)
  if (foot > 0 && used + foot > room) {
    const last = lineOf(lines[lines.length - 1]);
    if (!breaks.includes(last)) breaks.push(last);
  }
  return breaks;
}

/** Works out the pages of the long registers among `docs` and draws them so; `measuring` lays the sheet out as it prints. */
export function pagePapers(docs: Element[], measuring: <T>(measure: () => T) => T): boolean {
  const found: { set: SetBreaks; breaks: number[] }[] = [];
  measuring(() => {
    for (const doc of docs) {
      const sheets = doc.matches(SHEETS) ? [doc] : Array.from(doc.querySelectorAll(SHEETS));
      for (const sheet of sheets) {
        const set = pagers.get(sheet.getAttribute("data-bind-record") ?? "");
        if (!set) continue;
        const breaks = breaksOf(sheet as HTMLElement);
        if (breaks.length > 0) found.push({ set, breaks });
      }
    }
  });
  if (found.length === 0) return false;
  flushSync(() => {
    for (const f of found) f.set(f.breaks);
  });
  return true;
}

/** The papers as the screen draws them again. */
export function unpagePapers(): void {
  if (!document.querySelector(".paper-table-sheet[data-paper-pages]")) return;
  flushSync(() => {
    for (const set of pagers.values()) set(null);
  });
}
