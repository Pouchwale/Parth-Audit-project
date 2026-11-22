// PRINTING PRINTS THE DOCUMENT, NOT THE SCREEN AROUND IT.
//
// Every screen that shows a document marks it with `data-print-doc` — a
// record's form, a register, a report sheet, the licence, a statement of
// compliance. When the page is printed — from its own Print button or from
// the browser's menu / Ctrl+P — everything outside those documents is left out
// of the printout: the page title and explanations, stat tiles, banners, tabs,
// filters, the change history, the buttons. The document prints as it is on
// screen, and nothing else does. A screen with no document marked prints as it
// always has (sidebar, top bar and .no-print parts left out by the stylesheet).
//
// For the length of the print, every element that is neither a document, inside
// one, nor on the way down to one is marked hidden; the elements on the way down
// keep their place but lose their own padding, borders and grid/flex layout
// (styles.css, "Print"), so the document starts at the top of the page. The
// marks come off again when printing ends.
//
// A DOCUMENT WIDER THAN THE PAPER IS FITTED TO IT (REQUIREMENTS §54). A grid of
// many columns — the training calendar's 29, a QC sheet's readings — used to
// run off the right-hand edge of an A4 page: the preview scrolled, the PDF was
// cut. Before printing, the narrowest each document's tables can be laid out is
// measured; a document a little wider than a portrait page is scaled down to it
// (to no less than 80%), a wider one turns the page to landscape and is scaled
// down to that if it has to be — every column on the paper, and in the PDF.
//
// THE PAPER'S OWN ORIENTATION WINS (REQUIREMENTS §117). A layout that names its
// paper (LogSheetLayout.paper: F/QC/11 and F/QC/12 landscape, F/QC/17 portrait)
// carries it as data-paper on the sheet; the page is turned as it says and the
// sheet scaled to that page's width, whatever its width would have chosen.
//
// AN EMPTY BOX PRINTS EMPTY (REQUIREMENTS §111). Chrome draws "dd-mm-yyyy" in a
// date box with no date and "--:--" in a time box with no time, and a choice box
// with nothing chosen shows its "Select…": none of it is on the paper, and the
// owner's F/QC/12 printout read "dd-mm-yyyy" in a Next Due Date nobody had
// written. For the length of the print every such box in a document is marked
// data-empty, and the stylesheet prints it blank (styles.css, "Print"). The
// record sheets mark their own as they draw them; the marks put on here come off
// when printing ends.
//
// A WRITTEN DATE PRINTS AS IT IS WRITTEN (REQUIREMENTS §111 part 6). A date box
// holding a date printed the browser's own drawing of it — "14·10·2026",
// "13 - 10 - 2026", and on the owner's printout "12..10..2026". For the length of
// the print every written date or time box in a document prints as text beside
// it — the date as the sheet writes it everywhere else ("14-Oct-2026"), the time
// as written ("10:17") — and the box itself does not print. The words come off
// when printing ends.
//
// A WRITTEN VALUE TOO LONG FOR ITS BOX PRINTS AS WORDS THAT WRAP, NEVER CUT (the
// owner, 22-Oct-2026: "print on A4 size paper so print should be print accordingly
// no mistake over there"). A text box prints on one line and cuts what does not fit:
// F/QC/03's product description, F/QC/08's makers and the complaint checklist's
// comments were cut on the paper. For the length of the print such a value prints as
// its words in the box's place, on a second line where it needs one, and the box does
// not print (writeLongBoxesAsWords):
//   * in a paper form drawn in the paper's millimetres (the same on the screen and on
//     paper), a value that does not fit even at the smallest writing (utils/fitText.ts)
//     is written on two lines inside the cell's own height, as a person writes smaller
//     and on a second line in a small box: the row keeps its height and a one-page
//     paper stays one page;
//   * on any other sheet, laid out afresh for the page, a value that fills most of its
//     box on the screen is written as words at the size it is written at, wrapping only
//     where the page's box is narrower than the screen's, the row growing to hold them.
// Every other box prints as before. The words come off, and the boxes come back, when
// printing ends.

import { logActivity } from "./activityLog";
import { formatDisplayDate } from "./date";
import { fitAll, measureWords, unfitAll } from "./fitText";
import { pagePapers, unpagePapers } from "./paperPages";

const DOC_SELECTOR = "[data-print-doc]";
const HIDDEN = "print-scope-hidden";
const ANCESTOR = "print-scope-ancestor";
const SCOPED = "print-scoped";

/** A box printed as its words: the words, and the box's own inline display where the print hid the box itself. */
type Written = { box: Element; text: Element; display?: string };

let active: { hidden: Element[]; ancestors: Element[]; emptied: Element[]; written: Written[]; split?: SplitPages; tidied?: Element[]; evened?: HTMLElement[]; sheets?: HTMLElement[] } | null = null;

const EMPTY_ATTR = "data-empty";
const EMPTY_BOXES = "input[type='date'], input[type='time'], input[type='datetime-local'], input[type='month'], select";

/** Marks every empty date, time or choice box in the documents, so it prints blank; the ones marked here are returned. */
function markEmptyBoxes(docs: Element[]): Element[] {
  const marked: Element[] = [];
  for (const d of docs) {
    for (const box of Array.from(d.querySelectorAll(EMPTY_BOXES)) as (HTMLInputElement | HTMLSelectElement)[]) {
      if (box.value !== "" || box.hasAttribute(EMPTY_ATTR)) continue;
      box.setAttribute(EMPTY_ATTR, "");
      marked.push(box);
    }
  }
  return marked;
}

/** The class of a written date or time box while its words print in its place, and of those words. */
export const PRINTED_AS_TEXT = "print-as-text";
export const PRINT_BOX_TEXT = "print-box-text";
const WRITTEN_BOXES = "input[type='date'], input[type='time']";
/** A box that prints its own words beside it (components/records/FormField.tsx): given no second copy (REQUIREMENTS §183). */
const OWN_PRINTED_WORDS = "caf-screen-only";

/** What a written date or time box prints: the date as the sheet writes dates, the time as written. */
export function printedBoxText(type: string, value: string): string {
  if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDisplayDate(value);
  return value;
}

/** Puts the words of every written date or time box in the documents beside it, for the print; the pairs are returned. */
function writeBoxesAsText(docs: Element[]): Written[] {
  const written: Written[] = [];
  for (const d of docs) {
    for (const box of Array.from(d.querySelectorAll(WRITTEN_BOXES)) as HTMLInputElement[]) {
      if (box.value === "" || box.classList.contains(PRINTED_AS_TEXT) || box.classList.contains(OWN_PRINTED_WORDS)) continue;
      const text = document.createElement("span");
      text.className = PRINT_BOX_TEXT;
      text.textContent = printedBoxText(box.type, box.value);
      box.insertAdjacentElement("afterend", text);
      box.classList.add(PRINTED_AS_TEXT);
      written.push({ box, text });
    }
  }
  return written;
}

/** The text boxes whose words may be too long for them, and the class of the words printed in their place. */
const LONG_BOXES = "input[type='text'], input:not([type])";
/** A date written in a box (F/HR/01's Date of Joining, "30-04-2025"): printed on one line, never broken at a dash (REQUIREMENTS §183). */
const ONE_LINE_DATE = /^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/;
export const PRINT_BOX_WORDS = "print-box-words";
/** The wrapped lines' pitch to their size, and the share of two lines' width the words may fill (a line breaks between words). */
const WORDS_LINE = 1.15;
const TWO_LINES = 1.8;
/** A web form's value is printed as words once it fills this much of its box on the screen. */
const WEB_FULL = 0.8;
/** A sheet whose every written value prints as words that wrap in its cell (LogSheetLayout.printWordsAll, REQUIREMENTS §189). */
const EVERY_VALUE_AS_WORDS = "[data-print-words='all']";

/** A paper form drawn in the paper's millimetres, the same on the screen and on paper (the incoming records, the line clearances, the
 *  calibration papers, the report forms, a paper's own table). Every other sheet is laid out afresh for the page. */
const PAPER_FORM = ".paper-sheet[data-paper-form]";

// A DOCUMENT OF THE QC, HR OR PURCHASE MODULE FILLS ITS A4 PAGE (REQUIREMENTS §194; the owner, 6-Nov-2026: "when user click
// on print original copy then format is not covering whole A4 size page all this applies to all documents when i take
// print on physically A4 size paper then it not coming perfectly so fix it and do this for only three module which is QC,
// HR and Purchase"). Measured on every QC, HR and Purchase printout that day: a register with one line written printed its
// header and that line in the top fifth of the page (F-QC-40.A 18%, F/QC/16 30%, the line clearances 35% - their paper's
// ten ruled lines hidden since §126), a short form stopped half way down (F/HR/13 44%, F/HR/10 52%, F/HR/06 35%), and
// F/PUR/01 printed its instructions alone on a first page, every box on the second. The record's page marks such a
// document data-print-fill="page" (engine/printFill.ts: the module decides). Printed:
//   * its words are drawn bigger, to PAGE_FILL_SCALE (10 pt -> 14 pt) where the page's width allows - a sheet that names
//     its paper too (F/HR/15, F/QC/08), though not one drawn in its paper's millimetres or points, which is its paper
//     already (grows);
//   * a REGISTER (a grid that takes free lines: LogSheetRecordView data-lines="free") is ruled with blank lines after its
//     written ones, down to the foot of its page, as the paper rules them (ruleToFoot; the line clearance papers' own ten
//     lines print again, styles.css "Print"). The owner's rule of 25-Oct-2026 (§126) still holds for what is written: a
//     line nobody wrote between written ones stays off the paper, and F/QC/12's other entries do;
//   * a FORM (no free lines) has its lines drawn taller (PAGE_ROW_MAX_MM) and its boxes, its paragraphs and its blocks set
//     further apart (spreadToPage), until the page is STRETCH_TO full;
//   * a block of boxes taller than half the page may break across pages (letBlocksBreak: F/PUR/01).
// Every other module prints as before. The lines ruled, the room given and the breaks allowed come off when printing ends.
const FILLS_PAGE = "[data-print-fill='page']";
const fillsPage = (doc: Element): boolean => doc.matches(FILLS_PAGE) || doc.closest(FILLS_PAGE) !== null || doc.querySelector(FILLS_PAGE) !== null;
const PAGE_FILL_SCALE = 1.4;
const PAGE_ROW_MAX_MM = 14;
const PAGE_BOX_MAX_MM = 12;
const PAGE_PARA_MAX_MM = 6;
const PAGE_BLOCK_MAX_MM = 10;
const SPREAD_ROUNDS = 8;
/** A register's grid, whose lines are added as the work is done (engine/recordLines.ts canAdd). */
const FREE_LINES = "table.log-sheet[data-lines='free']";
export const RULED_LINE = "print-ruled-line";
/** A ruled line is no shorter than this (a written line's own height where taller), and no more than this many are ruled. */
const RULED_MIN_MM = 7;
const RULED_MOST = 200;
/** A block of boxes taller than this share of the page may break across pages. */
const BREAKS_OVER = 0.5;
const BREAKABLE = "[data-section='sheet-boxes'], .sheet-boxes-paper, [data-section='printed-group'], .paper-foot > .card";

/** Puts the words of every written value too long for its box in its place, for the print (after fitAll); the pairs are returned. */
function writeLongBoxesAsWords(docs: Element[]): Written[] {
  // Every box read first, then every one written: one layout for the lot.
  const plan: { box: HTMLInputElement; size: number; floor: number; height: number | null; align: string; oneLine?: boolean }[] = [];
  for (const d of docs) {
    for (const box of Array.from(d.querySelectorAll<HTMLInputElement>(LONG_BOXES))) {
      if (box.value.trim() === "" || box.classList.contains(PRINTED_AS_TEXT) || box.classList.contains(OWN_PRINTED_WORDS) || box.clientWidth === 0) continue;
      const { need, room, own, now, floor } = measureWords(box);
      const align = getComputedStyle(box).textAlign;
      if (box.closest(PAPER_FORM)) {
        // The paper's cell: cut even at the smallest writing, the words go on two lines inside the cell's own height.
        if ((need * floor) / own <= room + 1) continue;
        plan.push({ box, size: Math.min(own, Math.max(floor, (own * TWO_LINES * room) / need)), floor, height: box.clientHeight, align });
        // Any other sheet: a value that fills most of its box (written smaller to fit, or nearly full) keeps the size it is
        // written at, and wraps only where the page's box is narrower than the screen's: the printout is as before, uncut.
      } else if (box.closest(EVERY_VALUE_AS_WORDS) || (need * now) / own > room * WEB_FULL) {
        // A date stays on one line, written as small as it needs to be to fit its box (no smaller than the smallest writing).
        // The sheet never grows wider for it (F/MNT/09's week columns ran into the paper's margin): measured on the page below,
        // after every box is written.
        if (ONE_LINE_DATE.test(box.value.trim())) plan.push({ box, size: Math.max(floor, Math.min(now, ((room * own) / need) * 0.97)), floor, height: null, align, oneLine: true });
        // A sheet whose every value prints as words writes them at the box's own size: they wrap, so none is printed smaller
        // than its neighbours for being long (Purchase Master Data's "water-based specialty coatings", 6-Nov-2026).
        else plan.push({ box, size: box.closest(EVERY_VALUE_AS_WORDS) ? own : now, floor, height: null, align });
      }
    }
  }
  const written: Written[] = [];
  for (const { box, size, height, align, oneLine } of plan) {
    const text = document.createElement("span");
    text.className = `${PRINT_BOX_TEXT} ${PRINT_BOX_WORDS}`;
    text.textContent = box.value;
    // Inline, so that no rule written for a date's one line (its nowrap, a line's height) holds the words to one line - but a
    // date itself is one line, as wide as its box (REQUIREMENTS §183).
    // On a sheet whose every value prints as words, a word is broken only where it is longer than its whole column: a name or a
    // phone number prints whole ("Rajnaraya / n", "87540139 / 55" did), the grid fitted to the page by its words (refitToWords).
    const wrap = box.closest(EVERY_VALUE_AS_WORDS) ? "break-word" : "anywhere";
    Object.assign(text.style, { whiteSpace: "pre-wrap", overflowWrap: wrap, height: "auto", maxHeight: "none", overflow: "visible", textAlign: align, fontSize: `${size}px` });
    if (oneLine) Object.assign(text.style, { whiteSpace: "nowrap", overflowWrap: "normal" });
    if (height !== null) text.style.lineHeight = String(WORDS_LINE);
    // A date's line takes its cell's width and never widens the cell (no width of its own for the grid to make room for); its
    // writing is sized from the cell's own printed width (a share of it, cqw), so it fits however the page lays the grid out -
    // never larger than it is written, a digit being about 0.56 of the size and a dash 0.33.
    else if (oneLine) {
      // (A container of its own width: what it holds never counts towards the cell's width, so the cell is never widened.)
      Object.assign(text.style, { display: "block", width: "100%", containerType: "inline-size" });
      const words = text.textContent ?? "";
      const share = Math.floor((1000 / (5.6 * words.length + 2)) * 10) / 10;
      text.textContent = "";
      const inner = document.createElement("span");
      inner.textContent = words;
      inner.style.fontSize = `min(${size}px, ${share}cqw)`;
      text.appendChild(inner);
    } else text.style.display = "block";
    box.insertAdjacentElement("afterend", text);
    box.classList.add(PRINTED_AS_TEXT);
    written.push({ box, text, display: box.style.display });
    box.style.display = "none";
  }
  // In the paper's cell the lines stay inside the cell's own height, written smaller where they need it (to the smallest writing):
  // a one-page paper stays one page.
  for (let round = 0; round < 4; round++) {
    const over = plan
      .map((p, i) => ({ p, text: written[i].text as HTMLElement }))
      .filter(({ p, text }) => p.height !== null && p.height > 0 && text.scrollHeight > p.height + 1)
      .map(({ p, text }) => ({ p, text, size: Math.max(p.floor, p.size * Math.sqrt(p.height! / text.scrollHeight) * 0.97) }))
      .filter(({ p, size }) => size < p.size - 0.05);
    if (!over.length) break;
    for (const { p, text, size } of over) {
      p.size = size;
      text.style.fontSize = `${size}px`;
    }
  }
  return written;
}

const PAGE_STYLE_ID = "print-page-fit";
const PX_PER_MM = 96 / 25.4;
// A4 less the 12 mm each side that a printed document keeps for itself
// (styles.css, "Print"; the page itself has no margin, so that the browser
// cannot print the date and the time in it — REQUIREMENTS §59).
const PRINTABLE_WIDTH = { portrait: (210 - 24) * PX_PER_MM, landscape: (297 - 24) * PX_PER_MM };
// A FRAMED PAPER (data-frame on the sheet, LogSheetRecordView / data/seed/qcPageFrames.ts) is drawn to 8.446 mm of the
// page's edge, as the owner's Word files are, so its page keeps that margin and not the 12 mm of every other document.
const FRAMED_MARGIN_MM = 8.446;
// What the frame takes of the page inside it, each side: its heavy rule (2 px, styles.css --b2) and the sheet's padding (1.8 mm). The
// grids are fitted to what is left, so that none runs over the frame's right rule.
const FRAMED_INSET = 2 * (2.05 + 1.8 * PX_PER_MM);
const FRAMED_WIDTH = {
  portrait: (210 - 2 * FRAMED_MARGIN_MM) * PX_PER_MM - FRAMED_INSET,
  landscape: (297 - 2 * FRAMED_MARGIN_MM) * PX_PER_MM - FRAMED_INSET,
};
const isFramed = (doc: Element): boolean => doc.matches("[data-frame]") || doc.querySelector("[data-frame]") !== null;
// A PAPER DRAWN AS ITS OWN TABLE (data-paper-left on the sheet, components/records/PaperTableSheet.tsx, §117 round 2) stands
// where the paper stands on the page, its own millimetres from the page's left edge: the page keeps that margin, and the
// sheet is scaled only where it would run past the page's right edge (2 mm short of it).
const PAGE_WIDTH_MM = { portrait: 210, landscape: 297 };
function ownLeftMargin(doc: Element): number | null {
  const el = doc.matches("[data-paper-left]") ? doc : doc.querySelector("[data-paper-left]");
  const mm = el ? Number(el.getAttribute("data-paper-left")) : NaN;
  return Number.isFinite(mm) ? mm : null;
}
const SMALLEST_SCALE = 0.3;
// FILLING THE PAGE (REQUIREMENTS §123; the owner, 24-Oct-2026: "Still some document are not able to print not proper
// because of they are not able to cover whole A4 size paper which result when user take print out on physical paper the
// print will come properly but it not cover whole page and font size on that paper will be very small"). Measured on
// every document's printout, one-page sheets of DCRS's own make used 27-55% of the page's height where their papers
// use 80-95%: a register prints only the lines written while its paper rules lines down to its foot, and a form of a
// few lines prints at 10 pt in the top third. So, while print measures the page (html.print-measure, at the page's
// own width):
//   - a ONE-PAGE sheet of DCRS's own make is drawn bigger - to FILL_SCALE at most (10 pt -> 13 pt), never wider than
//     the page - until it reaches FILL_TO of the page's height;
//   - a REGISTER prints the lines written and no others (the owner, 25-Oct-2026: "the user filled row are only should
//     show and not whole default format"): no blank line is ruled under them, and a line nobody wrote leaves the
//     printout (LogSheetRecordView data-empty-line, styles.css) - it was ruled with blank lines to its foot from
//     24-Oct-2026 until then.
// A paper form drawn in millimetres, a framed paper, a sheet that names its paper, one standing at its own margin, a
// sheet drawn in points to its own paper (DRAWN_TO_PAPER): none of these - each is already drawn to its paper.
// THE HEIGHT IS MEASURED WITH THE PRINT'S OWN RULES ON
// (withPrintRules: every @media print rule laid on for the moment of measuring), against the whole A4 page with its
// 12 mm margin: measured in the screen's styles it read 15-68% high and the fill stopped well short. Close, not exact
// - a value too long for its box is written as words only afterwards - so FILL_TO keeps a margin, and nothing runs
// onto a second page.
const FILL_TO = 0.94;
const FILL_SCALE = 1.3;
// FILLING EACH PAGE (the owner, 28-Oct-2026, with F/HR/17's first page on the screen: "make sure this page will print
// complete on A4 size paper like fonts should be good which cover the whole page ... when any this kind of page is which is
// small then it should cover whole A4 size page when user take physical print so it should present completely fill").
// Measured, F/HR/17's register printed its three pages a third to a half high - each page of its own is never "one-page" -
// and a one-page sheet drawn to FILL_SCALE could still stop half way down. So:
//   - a sheet printed as pages of its own (PAGE_SECTIONS: F/HR/17's register - the check points, days 1 to 19, days 20
//     to 31 and the summary, each page as its paper) has each page drawn bigger as a one-page sheet is (FILL_SCALE at
//     most, never wider than the page, to FILL_TO of its height);
//   - then, last of all (stretchToPages, after every box is written for the print), a page still short of STRETCH_TO
//     has its lines drawn taller, as a ruled paper's: a table's lines all to one height, no taller than ROW_MAX_MM; on
//     a page with no table, a list's items further apart, by ITEM_MAX_MM each at most. A register printing only its
//     written lines (§126) keeps them a ruled line high at most - two lines never stretch down a page - and a page that
//     would run onto a second one is put back as it was.
// A sheet drawn to its paper (above) is drawn as its paper, as before.
const PAGE_SECTIONS = "section.register-page";
const STRETCH_TO = 0.92;
const ROW_MAX_MM = 11;
// A paper's own drawing short of its page: its lines drawn up to this tall (§228).
const PAPER_ROW_MAX_MM = 16;
const ITEM_MAX_MM = 14;
// A form a little too wide for a portrait page stays portrait, slightly smaller.
const PORTRAIT_SCALE = 0.9;
let fitted: HTMLElement[] = [];

/** The narrowest the tables in `el` can be laid out, in CSS pixels. */
function narrowestWidth(el: Element): number {
  let widest = 0;
  for (const table of Array.from(el.querySelectorAll("table")) as HTMLElement[]) {
    if (!isShown(table)) continue;
    const width = table.style.width;
    table.style.width = "min-content";
    widest = Math.max(widest, table.getBoundingClientRect().width);
    table.style.width = width;
  }
  return widest;
}

function pageStyle(): HTMLStyleElement {
  const existing = document.getElementById(PAGE_STYLE_ID);
  if (existing instanceof HTMLStyleElement) return existing;
  const style = document.createElement("style");
  style.id = PAGE_STYLE_ID;
  document.head.appendChild(style);
  return style;
}

/** The page a document's paper is (LogSheetLayout.paper, carried as data-paper on the sheet), or null where its layout says nothing. */
export function paperOf(doc: Element): "portrait" | "landscape" | null {
  const el = doc.matches("[data-paper]") ? doc : doc.querySelector("[data-paper]");
  const v = el?.getAttribute("data-paper");
  return v === "portrait" || v === "landscape" ? v : null;
}

function fitToPage(docs: Element[]): void {
  unfit();
  // The screen's own zoom (utils/screenFit.ts) is off while the page is measured for print: the print fits the sheet at
  // its own size. Put back by screenFit's afterprint pass.
  for (const d of Array.from(document.querySelectorAll<HTMLElement>("[data-print-doc]"))) d.style.removeProperty("--screen-zoom");
  // Measured as it PRINTS (styles.css html.print-measure: the print's paddings, box minimums and sizes), not as the screen draws it.
  document.documentElement.classList.add("print-measure");
  try {
    measureAndFit(docs);
  } finally {
    document.documentElement.classList.remove("print-measure");
  }
}

/** The text of every rule the page's stylesheets keep for print (@media print), read once. */
let printRules: string | null = null;
function printRulesText(): string {
  if (printRules !== null) return printRules;
  const out: string[] = [];
  const walk = (rules: CSSRuleList, inPrint: boolean) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        const media = rule.media.mediaText.toLowerCase();
        walk(rule.cssRules, inPrint || (/\bprint\b/.test(media) && !/\bscreen\b/.test(media)));
      } else if (rule instanceof CSSSupportsRule) walk(rule.cssRules, inPrint);
      else if (inPrint && rule instanceof CSSStyleRule) out.push(rule.cssText);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules, false);
    } catch {
      /* a sheet from elsewhere: its rules cannot be read */
    }
  }
  printRules = out.join("\n");
  return printRules;
}

/** Runs `measure` with the print's own rules laid on the screen (taken off before anything is painted). */
function withPrintRules<T>(measure: () => T): T {
  const style = document.createElement("style");
  style.textContent = printRulesText();
  document.head.appendChild(style);
  try {
    return measure();
  } finally {
    style.remove();
  }
}

/**
 * Runs `measure` with `doc` laid out as wide as the page is at `zoom` - its own zoom and `part`'s off, so that what is
 * measured is in the sheet's own pixels - then puts it back.
 */
function laidOutAt<T>(doc: HTMLElement, part: HTMLElement, zoom: number, landscape: boolean, measure: () => T): T {
  const pageW = (landscape ? 297 : 210) * PX_PER_MM;
  const keep = { width: doc.style.width, boxSizing: doc.style.boxSizing, zoom: doc.style.zoom, part: part.style.zoom };
  doc.style.zoom = "";
  part.style.zoom = "";
  doc.style.boxSizing = "border-box";
  doc.style.width = `${pageW / zoom}px`;
  try {
    return measure();
  } finally {
    doc.style.width = keep.width;
    doc.style.boxSizing = keep.boxSizing;
    doc.style.zoom = keep.zoom;
    part.style.zoom = keep.part;
  }
}

/**
 * How many A4 pages `doc` - or `part` of it, a page of its own - fills printed at `zoom` (FILLING THE PAGE): laid out as
 * wide as the page is at that zoom, its 12 mm margin and all, with the print's rules on (withPrintRules), against the
 * page's full height; then put back.
 */
function pagesAt(doc: HTMLElement, zoom: number, landscape: boolean, part: HTMLElement = doc): number {
  const pageH = (landscape ? 210 : 297) * PX_PER_MM;
  return laidOutAt(doc, part, zoom, landscape, () => (part.getBoundingClientRect().height * zoom) / pageH);
}

// Sheets drawn in points to their own paper (§118): the contractor's service report is the March sheet to 1.5 pt (the
// owner: "make sure it looks like it only"), F/HR/18 is its Word page with its own margins. Drawn as they are.
const DRAWN_TO_PAPER = ".svc-paper, .fhr18-sheet, .fhr18-record";

// F/HR/18 PRINTS EACH OF ITS PAGES WHOLE (the owner, 31-Oct-2026, with a printout whose PC-08 had its second line, and no PC
// number, alone on the next page). Its pages are drawn to the Word page's points; with 15 PCs in the legend - or a paper,
// a margin or a scale a little smaller than A4's - a page of 8 PCs ran past the paper and the browser cut it. Each of its
// pages (PAGE_SECTIONS) that measures taller than FIT_DRAWN_TO of the page is drawn just small enough to fit it, so every
// printed page keeps its header, its legend and its 8 PCs; and a PC's two lines never part (styles.css).
const FIT_DRAWN = ".fhr18-sheet, .fhr18-record";
// (only a page that would run past its paper: one that fits prints at its own size, as the paper's PDF does)
const FIT_DRAWN_TO = 0.985;
// A PAGE OF DCRS'S OWN MAKE PRINTS WHOLE TOO (the owner, 7-Nov-2026, §198: a printout "should cover whole page" and no
// more): the rodent and lizard catch trends' landscape page measured 1.09 pages - the chart, the table and the signature's
// line fill it, and "Report prepared by" printed alone on a second sheet. A page of its own (PAGE_SECTIONS) up to
// FIT_OWN_OVER pages tall is drawn just small enough to fit its paper, as F/HR/18's are; one taller flows on as before.
const FIT_OWN_OVER = 1.25;

/**
 * F/HR/18's pages, and a page of its own a little over its paper, each drawn small enough to print whole (above) - and,
 * since §241, A ONE-PAGE SHEET OF DCRS'S OWN MAKE a little over its paper too (the owner, 17-Nov-2026: "make sure when
 * user take print on A4 size paper ... not this kind of mistake print happens in any document"): F/HR/17's day, headed
 * "1 of 1", printed its "Summary of Actions Taken" alone on a second sheet. Returns the sheet's zoom: the one it was
 * given, or that one drawn smaller to fit.
 */
function fitDrawnSections(doc: HTMLElement, zoom: number, landscape: boolean): number {
  const drawn = doc.matches(FIT_DRAWN) || doc.querySelector(FIT_DRAWN) !== null;
  // A sheet printed on one page, all its lines (LogSheetLayout.onePage, §259): fitted however tall it is.
  const onePage = doc.matches("[data-one-page]") || doc.querySelector("[data-one-page]") !== null;
  let docZoom = zoom;
  // A MONTH ON TWO PAGES (LogSheetLayout.printPages, §263): the sheet breaks before the 16th (styles.css
  // tr[data-page-start]) and its heading block stands on both pages; drawn so the longer half, with the heading, fills one A4.
  const halves = (doc.matches("[data-print-pages]") ? doc : doc.querySelector<HTMLElement>("[data-print-pages]"))?.getAttribute("data-print-pages");
  if (halves === "2") {
    withPrintRules(() => {
      const body = doc.querySelector<HTMLElement>("table.log-sheet tbody");
      const start = body?.querySelector<HTMLElement>("tr[data-page-start]");
      if (!body || !start) return;
      const rows = Array.from(body.children) as HTMLElement[];
      const at = rows.indexOf(start);
      const pageH = (landscape ? 210 : 297) * PX_PER_MM;
      const measured = laidOutAt(doc, doc, zoom, landscape, () => {
        const whole = doc.getBoundingClientRect().height;
        const top = body.getBoundingClientRect();
        const first = rows.slice(0, at).reduce((h, r) => h + r.getBoundingClientRect().height, 0);
        const second = rows.slice(at).reduce((h, r) => h + r.getBoundingClientRect().height, 0);
        return { head: whole - top.height, half: Math.max(first, second) };
      });
      const page = ((measured.head + measured.half) * zoom) / pageH;
      if (page <= 0) return;
      // as large as fills the page (never above FILL_SCALE), and never over it
      const z = Math.min(FILL_SCALE, Math.floor((FIT_DRAWN_TO / page) * 1000) / 1000);
      docZoom = Math.floor(zoom * z * 1000) / 1000;
    });
    return docZoom;
  }
  withPrintRules(() => {
    const sections = pageSections(doc);
    if (!drawn && !onePage && sections.length === 0 && !ownMake(doc)) return;
    const parts = sections.length ? sections : [doc];
    // (a page already drawn bigger to fill its paper - FILLING EACH PAGE - is measured as drawn, and keeps that over the fit)
    const own = (sec: HTMLElement) => (sec === doc ? 1 : Number(sec.style.zoom) || 1);
    // Every page drawn at the one size the tallest needs, so the pages of one record match as the paper's do.
    const tallest = Math.max(0, ...parts.map((sec) => pagesAt(doc, zoom * own(sec), landscape, sec)));
    if (tallest <= FIT_DRAWN_TO || (!drawn && !onePage && tallest > FIT_OWN_OVER)) return;
    const z = Math.floor((FIT_DRAWN_TO / tallest) * 1000) / 1000;
    for (const sec of parts) {
      // (the sheet itself: its zoom over the one it was given, set by the caller - which would set it after this)
      if (sec === doc) {
        docZoom = Math.floor(zoom * z * 1000) / 1000;
        continue;
      }
      sec.style.zoom = String(Math.floor(own(sec) * z * 1000) / 1000);
      fitted.push(sec);
    }
  });
  return docZoom;
}

/** Whether `doc` is a sheet of DCRS's own make: not a paper form, not a sheet that names its paper, not one drawn in
 * points to its paper. */
function ownMake(doc: HTMLElement): boolean {
  return ![PAPER_FORM, "[data-paper]", DRAWN_TO_PAPER].some((s) => doc.matches(s) || doc.querySelector(s) !== null);
}

/**
 * Whether `doc` is drawn to fill its page: a sheet of DCRS's own make - or, in a module that fills its page (FILLS_PAGE,
 * §194), a sheet that names its paper (F/HR/15, F/QC/08) without being drawn in its paper's millimetres or points.
 */
function grows(doc: HTMLElement): boolean {
  return ownMake(doc) || (fillsPage(doc) && ![PAPER_FORM, DRAWN_TO_PAPER].some((s) => doc.matches(s) || doc.querySelector(s) !== null));
}

/** The most a sheet is drawn bigger by: 1.3x, or 1.4x in a module that fills its page (§194). */
const fillScale = (doc: HTMLElement): number => (fillsPage(doc) ? PAGE_FILL_SCALE : FILL_SCALE);

/** FILLING THE PAGE (above): the zoom that brings a short one-page sheet of DCRS's own make toward FILL_TO. */
function fillPage(doc: HTMLElement, zoom: number, width: number, across: number, landscape: boolean): number {
  // The contractor's service report prints across the A4 page too (the owner, 31-Oct-2026, REQUIREMENTS §154: "completely
  // perfect on A4 Size page and every fonts are visible"): drawn at 576 px it filled three quarters of the width.
  if (!grows(doc) && !doc.querySelector(".svc-paper")) return zoom;
  return withPrintRules(() => fillMeasured(doc, zoom, width, across, landscape));
}

/** The pages a sheet prints as pages of its own (PAGE_SECTIONS), its own and not a sheet's inside it. */
function pageSections(doc: HTMLElement): HTMLElement[] {
  return (Array.from(doc.querySelectorAll(PAGE_SECTIONS)) as HTMLElement[]).filter((s) => isShown(s) && s.closest(DOC_SELECTOR) === doc);
}

/** FILLING EACH PAGE (above): each page of a sheet printed as pages of its own, drawn bigger as a one-page sheet is. */
function fillSections(doc: HTMLElement, sections: HTMLElement[], zoom: number, across: number, landscape: boolean): void {
  withPrintRules(() => {
    for (const sec of sections) {
      const grown = fillMeasured(doc, zoom, narrowestWidth(sec), across, landscape, sec);
      if (grown <= zoom) continue;
      // (the page's own zoom, over the sheet's)
      sec.style.zoom = String(Math.floor((grown / zoom) * 1000) / 1000);
      fitted.push(sec);
    }
  });
}

function fillMeasured(doc: HTMLElement, zoom: number, width: number, across: number, landscape: boolean, part: HTMLElement = doc): number {
  const now = pagesAt(doc, zoom, landscape, part);
  if (now <= 0 || now >= FILL_TO) return zoom;
  // (a document with no table - a form of labelled boxes - flows to whatever width it is given: only FILL_SCALE holds it)
  const byWidth = width > 0 ? Math.floor(((across * 0.98) / width) * 1000) / 1000 : fillScale(doc);
  const byHeight = Math.floor(zoom * (FILL_TO / now) * 1000) / 1000;
  const grown = Math.min(fillScale(doc), byWidth, byHeight);
  if (grown > zoom) {
    // Measured again at that size (its words wrap anew across the narrower layout); a hair too tall there, the largest
    // zoom between that keeps to FILL_TO, the gap halved six times (once the margin was measured as it prints, a sheet
    // just over at the grown zoom fell back to half the growth, or to none: 92% of the page became 67%, 28-Oct-2026).
    if (pagesAt(doc, grown, landscape, part) <= FILL_TO) zoom = grown;
    else {
      let [fits, over] = [zoom, grown];
      for (let i = 0; i < 6; i++) {
        const mid = Math.floor(((fits + over) / 2) * 1000) / 1000;
        if (pagesAt(doc, mid, landscape, part) <= FILL_TO) fits = mid;
        else over = mid;
      }
      zoom = fits;
    }
  }
  return zoom;
}

// A WIDE GRID'S CELLS CLOSED UP, SO ITS LETTERS PRINT LARGER (the owner, 21-Nov-2026, REQUIREMENTS §274: "do some format in
// Landscape and some in portrait ... because some print are very small"). Measured on all 138 formats, each printed both
// ways: a sheet that prints small is held by its width, and most are already on the wider page. What a sheet below
// CLOSE_BELOW of its size gives up is the empty space inside its cells: it is laid out again with them closed up, and the page
// turns if it now fits upright (F/PRD/22 and 24). Kept only where the letters come out larger and each sheet still fits its page.
const PRINT_CLOSE = "print-close";
const CLOSE_BELOW = 0.85;
let closedUp: HTMLElement[] = [];

/** The tallest sheet, in pages, as laid out now (a month on two pages is two sheets here, one a page: splitPages). */
function tallestSheet(docs: HTMLElement[]): number {
  const landscape = document.documentElement.dataset.printPage === "landscape";
  return withPrintRules(() => Math.max(...docs.map((d) => pagesAt(d, Number(d.style.zoom) || 1, landscape))));
}

/** F/HR/15 and F/HR/16: their columns are set for the A4 page in styles.css, so they are never shrunk to fit it (§279). */
const CLEANING_SHEETS = '[data-sheet="hr-daily-cleaning"], [data-sheet="hr-monthly-cleaning"]';

function measureAndFit(docs: Element[]): void {
  layOutOnPage(docs);
  const all = docs as HTMLElement[];
  const small = all.filter((d) => paperOf(d) === null && ownLeftMargin(d) === null && !isFramed(d) && d.querySelector("table.log-sheet") !== null && (Number(d.style.zoom) || 1) < CLOSE_BELOW);
  if (small.length === 0) return;
  const zoomBefore = small.map((d) => Number(d.style.zoom) || 1);
  // Only sheets of one page each: a longer one repeats its heading on every page, and larger could run to a page more.
  if (tallestSheet(all) > 1) return;
  const closeUp = (on: boolean) => {
    unfit();
    if (on) {
      for (const d of small) d.classList.add(PRINT_CLOSE);
      closedUp = small;
    }
    layOutOnPage(docs);
  };
  closeUp(true);
  const larger = small.every((d, i) => (Number(d.style.zoom) || 1) >= zoomBefore[i]) && small.some((d, i) => (Number(d.style.zoom) || 1) > zoomBefore[i]);
  if (!larger || tallestSheet(all) > 1) closeUp(false);
}

function layOutOnPage(docs: Element[]): void {
  const needs = docs.map((d) => ({ doc: d as HTMLElement, width: narrowestWidth(d) }));
  const widest = Math.max(0, ...needs.map((n) => n.width));
  // The paper's own orientation (§117); without one, the width decides (§54).
  const asked = needs.map((n) => paperOf(n.doc)).find((p) => p !== null) ?? null;
  const landscape = asked ? asked === "landscape" : widest > PRINTABLE_WIDTH.portrait / PORTRAIT_SCALE;
  const widths = needs.every((n) => isFramed(n.doc)) ? FRAMED_WIDTH : PRINTABLE_WIDTH;
  const paper = landscape ? widths.landscape : widths.portrait;
  pageStyle().textContent = landscape ? "@page { size: A4 landscape; margin: 0; }" : "";
  document.documentElement.dataset.printPage = landscape ? "landscape" : "portrait";
  for (const { doc, width } of needs) {
    // (an HR paper is drawn at the size that fills its A4 page, PaperTable.fillA4: §275; the cleaning records' columns are set for it: §279)
    if (doc.matches("[data-paper-own]") || doc.querySelector("[data-paper-own]") || doc.querySelector(CLEANING_SHEETS)) continue;
    const own = ownLeftMargin(doc);
    // (its right side as clear of the sheet's edge as a printer needs, §277)
    const room = own !== null ? (PAGE_WIDTH_MM[landscape ? "landscape" : "portrait"] - own - 5.5) * PX_PER_MM : paper;
    // (2% of the room kept: the print is measured as it prints, closely but not to the pixel)
    let zoom = width <= room ? 1 : Math.max(SMALLEST_SCALE, Math.floor(((room * 0.98) / width) * 1000) / 1000);
    // A short one-page sheet is drawn to fill its page (FILLING THE PAGE, above); a sheet printed as pages of its own, each
    // of its pages (FILLING EACH PAGE).
    if (own === null && !isFramed(doc)) {
      const sections = grows(doc) ? pageSections(doc) : [];
      if (sections.length > 1) fillSections(doc, sections, zoom, room, landscape);
      else zoom = fillPage(doc, zoom, width, room, landscape);
    }
    // F/HR/18: no page of it runs past its paper; nor a one-page sheet of DCRS's own a little over its paper (§241).
    zoom = fitDrawnSections(doc, zoom, landscape);
    if (zoom === 1) continue;
    doc.style.zoom = String(zoom);
    // A framed page is as tall as the paper (styles.css): the zoom shrinks its millimetres, so it says by how much.
    doc.style.setProperty("--print-zoom", String(zoom));
    fitted.push(doc);
    // Text does not scale in a straight line: a framed page, whose frame a grid must not run over, is measured again as it stands.
    if (isFramed(doc)) {
      const after = narrowestWidth(doc);
      if (after > paper) {
        zoom = Math.max(SMALLEST_SCALE, Math.floor(((zoom * paper) / after) * 1000) / 1000);
        doc.style.zoom = String(zoom);
        doc.style.setProperty("--print-zoom", String(zoom));
      }
    }
  }
}

/** A line drawn taller for the print (FILLING EACH PAGE), a box given room or a block let break (§194), and what it was. */
type Stretched = { el: HTMLElement; prop: "height" | "paddingBottom" | "paddingTop" | "breakInside"; was: string };
let stretched: Stretched[] = [];

function stretch(el: HTMLElement, prop: Stretched["prop"], value: string): void {
  stretched.push({ el, prop, was: el.style[prop] });
  el.style[prop] = value;
}

/** The lines a page's tables print: their body's rows shown, not the header block's nor a table's inside a cell. */
function linesOf(part: HTMLElement): HTMLElement[] {
  return (Array.from(part.querySelectorAll("table > tbody > tr")) as HTMLElement[]).filter(
    (tr) => isShown(tr) && !tr.closest(".doc-header") && !tr.parentElement?.parentElement?.parentElement?.closest("table")
  );
}

/** The items of a page's lists, outside any table and the header block. */
function itemsOf(part: HTMLElement): HTMLElement[] {
  return (Array.from(part.querySelectorAll("ol > li, ul > li")) as HTMLElement[]).filter((li) => isShown(li) && !li.closest("table, .doc-header"));
}

/** FILLING EACH PAGE (above), last of all: on every page of a sheet of DCRS's own make still short of STRETCH_TO, the lines drawn taller. */
function stretchToPages(docs: Element[]): void {
  const landscape = document.documentElement.dataset.printPage === "landscape";
  document.documentElement.classList.add("print-measure");
  try {
    withPrintRules(() => {
      for (const d of docs) {
        const doc = d as HTMLElement;
        // The HR papers keep their own lines' heights, as the company's file draws them (REQUIREMENTS §275).
        if (doc.matches("[data-paper-own]") || doc.querySelector("[data-paper-own]") || doc.querySelector(CLEANING_SHEETS)) continue;
        // A QC, HR or Purchase paper drawn short of its page (REQUIREMENTS §228; the owner, 16-Nov-2026: "in A4 size page it
        // is not covering fully ... check for other document also of QC, HR and Purchase modules"): its lines drawn taller,
        // to STRETCH_TO at most - no ruled lines added, nothing spread, never onto a second page.
        if (fillsPage(doc) && !isFramed(doc) && [PAPER_FORM, "[data-paper-left]"].some((s) => doc.matches(s) || doc.querySelector(s) !== null)) {
          stretchPart(doc, doc, Number(doc.style.zoom) || 1, landscape, PAPER_ROW_MAX_MM);
          continue;
        }
        if (!grows(doc) || ownLeftMargin(doc) !== null || isFramed(doc)) continue;
        const zoom = Number(doc.style.zoom) || 1;
        if (fillsPage(doc)) letBlocksBreak(doc, zoom, landscape);
        const sections = pageSections(doc);
        if (sections.length > 1) for (const sec of sections) stretchPart(doc, sec, zoom * (Number(sec.style.zoom) || 1), landscape);
        else stretchPart(doc, doc, zoom, landscape);
      }
    });
  } finally {
    document.documentElement.classList.remove("print-measure");
  }
}

function stretchPart(doc: HTMLElement, part: HTMLElement, zoom: number, landscape: boolean, paperRowMax?: number): void {
  const pageH = (landscape ? 210 : 297) * PX_PER_MM;
  // (a paper's drawing: its lines only, taller - never a ruled line added nor its blocks spread, §228)
  const fills = paperRowMax === undefined && fillsPage(doc);
  laidOutAt(doc, part, zoom, landscape, () => {
    // (a module that fills its page measures the sheet as it prints: the 12 mm the measure's rules put under the document
    // - which the print does not, the sheet's own foot carrying its 12 mm since §183 - left out, so a register is ruled
    // and a form spread to where the paper's foot is, not 12 mm short of it; a page of its own (PAGE_SECTIONS) prints
    // with its own 12 mm foot, left out the same - F/HR/17's days 1 to 19 stopped 24 mm short of the paper's foot, §198)
    const under = fills ? parseFloat(getComputedStyle(part).paddingBottom) || 0 : 0;
    const share = () => ((part.getBoundingClientRect().height - under) * zoom) / pageH;
    // A register of a module that fills its page is ruled to the foot, its lines as they are (§194).
    if (fills && ruleToFoot(part, zoom, share)) return;
    const before = share();
    if (before <= 0 || before >= STRETCH_TO) return;
    // What the page still has, in the sheet's own pixels (before its zoom).
    let room = ((STRETCH_TO - before) * pageH) / zoom;
    const from = stretched.length;
    // (a paper's empty spacer line between its groups - one cell across, nothing in it - stays the paper's height, §228)
    const spacer = (tr: HTMLElement) => tr instanceof HTMLTableRowElement && tr.cells.length === 1 && !tr.textContent?.trim() && !tr.querySelector("input, select, textarea");
    const rows = paperRowMax === undefined ? linesOf(part) : linesOf(part).filter((tr) => !spacer(tr) && !tr.classList.contains("log-gap-line"));
    if (rows.length > 0) {
      // Every line shorter than `line` is drawn `line` high: the one height that takes up the room, a ruled line's at most.
      const heights = rows.map((r) => r.getBoundingClientRect().height);
      const most = ((paperRowMax ?? (fills ? PAGE_ROW_MAX_MM : ROW_MAX_MM)) * PX_PER_MM) / zoom;
      const grow = (t: number) => heights.reduce((sum, h) => sum + Math.max(0, t - h), 0);
      let line = Math.min(...heights);
      if (most > line) {
        if (grow(most) <= room) line = most;
        else {
          let [lo, hi] = [line, most];
          for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (grow(mid) <= room) lo = mid;
            else hi = mid;
          }
          line = lo;
        }
        rows.forEach((r, i) => {
          if (heights[i] < line - 0.5) stretch(r, "height", `${line.toFixed(2)}px`);
        });
        room -= grow(line);
      }
    } else if (!fills) {
      // A page of words and no table (F/HR/17's check points): its list's items further apart - the room between them,
      // none under the last, which would be blank paper (the tenth check point stopped at 84% of the page so).
      const gaps = itemsOf(part).slice(0, -1);
      if (gaps.length > 0 && room > 1) {
        const add = Math.min((ITEM_MAX_MM * PX_PER_MM) / zoom, room / gaps.length);
        for (const li of gaps) stretch(li, "paddingBottom", `${(parseFloat(getComputedStyle(li).paddingBottom) || 0) + add}px`);
      }
    }
    // A form of a module that fills its page: its boxes, paragraphs and blocks set further apart (§194).
    if (fills) spreadToPage(part, zoom, share, pageH);
    // Never onto a second page: measured again as drawn, and put back as it was if it would be.
    if (stretched.length > from && share() > FILL_TO) {
      for (const s of stretched.splice(from).reverse()) s.el.style[s.prop] = s.was;
    }
  });
}

/** The blank lines ruled under a register for the print (§194 ruleToFoot), taken off when printing ends. */
let ruled: HTMLElement[] = [];

/**
 * RULED TO THE FOOT (§194): where `part` holds a register - a grid that takes free lines (FREE_LINES), the outermost -
 * blank lines are ruled after its written ones, each a copy of its last line emptied, no shorter than RULED_MIN_MM, until
 * the page is FILL_TO full (measured with the 12 mm under the sheet's foot: the last line ends about 30 mm from the
 * paper's edge, as the paper's do), and never past it. True where `part` holds such a grid, ruled or not.
 */
function ruleToFoot(part: HTMLElement, zoom: number, share: () => number): boolean {
  const table = Array.from(part.querySelectorAll<HTMLTableElement>(FREE_LINES)).find((t) => isShown(t) && !t.parentElement?.closest("table"));
  if (!table) return false;
  const body = table.tBodies[0];
  if (!body || share() >= FILL_TO) return true;
  const lines = Array.from(body.rows).filter((r) => isShown(r) && !r.classList.contains("log-gap-line"));
  if (lines.length === 0) return true;
  // The line ruled: the last entry's row - its two rows, where an entry takes two (data-line first / second) - emptied.
  const last = lines[lines.length - 1];
  const entry = last.classList.contains("log-second-line") && lines.length > 1 ? [lines[lines.length - 2], last] : [last];
  const least = (RULED_MIN_MM * PX_PER_MM) / zoom;
  const rule = (): HTMLElement[] =>
    entry.map((row) => {
      const line = row.cloneNode(true) as HTMLElement;
      line.classList.add(RULED_LINE);
      line.setAttribute("aria-hidden", "true");
      for (const attr of ["data-empty-line", "data-continues", "data-bind-row", "data-row"]) line.removeAttribute(attr);
      for (const cell of Array.from(line.children)) {
        cell.replaceChildren();
        cell.removeAttribute("data-empty-line");
      }
      line.style.height = `${Math.max(least, row.getBoundingClientRect().height).toFixed(2)}px`;
      body.appendChild(line);
      ruled.push(line);
      return line;
    });
  let added: HTMLElement[][] = [];
  while (added.length < RULED_MOST && share() < FILL_TO) added.push(rule());
  // (the last line ruled may run past the foot: taken off again)
  while (added.length > 0 && share() > FILL_TO) {
    for (const line of added.pop()!) {
      line.remove();
      ruled = ruled.filter((r) => r !== line);
    }
  }
  return true;
}

/** A part of a form set further apart to fill its page (§194 spreadToPage): the most it may be given (mm), what it had, what it has been given. */
type Spread = { el: HTMLElement; prop: "paddingBottom" | "paddingTop"; most: number; base: number; given: number };

/** The parts of a form that may be set further apart: its boxes, its paragraphs, its lists' items (under each) and its blocks (above each) - outside any table, the header block or a paper's own table. */
function spreadables(part: HTMLElement): Spread[] {
  const out: Spread[] = [];
  const free = (el: Element): boolean => isShown(el) && !el.closest("table, .doc-header, [data-pf]");
  const take = (sel: string, prop: Spread["prop"], most: number, keep: (el: Element) => boolean = () => true) => {
    for (const el of Array.from(part.querySelectorAll<HTMLElement>(sel))) {
      if (free(el) && keep(el)) out.push({ el, prop, most, base: parseFloat(getComputedStyle(el)[prop]) || 0, given: 0 });
    }
  };
  take(".field", "paddingBottom", PAGE_BOX_MAX_MM, (el) => !el.parentElement?.closest(".field"));
  take("p", "paddingBottom", PAGE_PARA_MAX_MM, (el) => !el.closest(".field, li"));
  take("ol > li, ul > li", "paddingBottom", ITEM_MAX_MM);
  take(".paper-body > .card, .paper-foot > .card", "paddingTop", PAGE_BLOCK_MAX_MM);
  return out;
}

/**
 * SET FURTHER APART (§194): the page's room shared out among the form's parts, round after round - a part given its share
 * up to the most it may have; boxes side by side take the one room, so a round is measured as drawn and the next shares
 * out what is still left - until the page is STRETCH_TO full, every part has all it may have, or nothing more is given. A
 * round that runs past FILL_TO is undone.
 */
function spreadToPage(part: HTMLElement, zoom: number, share: () => number, pageH: number): void {
  const parts = spreadables(part);
  if (parts.length === 0) return;
  for (let round = 0; round < SPREAD_ROUNDS; round++) {
    const now = share();
    if (now >= STRETCH_TO - 0.005) break;
    const room = ((STRETCH_TO - now) * pageH) / zoom;
    const open = parts.filter((p) => p.given < (p.most * PX_PER_MM) / zoom - 0.5);
    if (open.length === 0) break;
    const each = room / open.length;
    const from = stretched.length;
    let added = 0;
    for (const p of open) {
      const add = Math.min(each, (p.most * PX_PER_MM) / zoom - p.given);
      if (add < 0.5) continue;
      p.given += add;
      added += add;
      stretch(p.el, p.prop, `${(p.base + p.given).toFixed(2)}px`);
    }
    if (added < 1) break;
    if (share() > FILL_TO) {
      for (const s of stretched.splice(from).reverse()) s.el.style[s.prop] = s.was;
      break;
    }
  }
}

/** A BLOCK OF BOXES TALLER THAN HALF THE PAGE MAY BREAK (§194): F/PUR/01's boxes, one block kept whole, printed their instructions alone on the first page. */
function letBlocksBreak(doc: HTMLElement, zoom: number, landscape: boolean): void {
  const pageH = (landscape ? 210 : 297) * PX_PER_MM;
  laidOutAt(doc, doc, zoom, landscape, () => {
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>(BREAKABLE))) {
      if (isShown(el) && (el.getBoundingClientRect().height * zoom) / pageH > BREAKS_OVER) stretch(el, "breakInside", "auto");
    }
  });
}

function unfit(): void {
  for (const doc of closedUp) doc.classList.remove(PRINT_CLOSE);
  closedUp = [];
  for (const doc of fitted) {
    doc.style.zoom = "";
    doc.style.removeProperty("--print-zoom");
  }
  fitted = [];
  for (const s of stretched.reverse()) s.el.style[s.prop] = s.was;
  stretched = [];
  for (const line of ruled) line.remove();
  ruled = [];
  const style = document.getElementById(PAGE_STYLE_ID);
  if (style) style.textContent = "";
  delete document.documentElement.dataset.printPage;
}

const isShown = (el: Element): boolean => el.getClientRects().length > 0;

/** The outermost of `els` — a document inside another one prints as part of it. */
function outermost(els: Element[]): Element[] {
  return els.filter((el) => !els.some((other) => other !== el && other.contains(el)));
}

/** The documents on screen now, or inside `within` when given. */
export function documentsOnScreen(within: ParentNode = document): Element[] {
  return outermost(Array.from(within.querySelectorAll(DOC_SELECTOR)).filter(isShown));
}

/** Sheets whose foot was too tall for the browser to repeat, printed for now with it once at the end (§277). */
let footsOnce: Element[] = [];

/**
 * The browser repeats a table's footer only while it is short beside the page. A taller foot (F/SYS's HARA sheet, 63 mm) was not
 * repeated, so its 12 mm went with it and the first page's lines ran to 0.6 mm of the paper's edge. Such a sheet prints that foot
 * once, after its last line, and keeps its margin in its own short foot (.paper-page-foot).
 */
function footsTooTall(docs: Element[]): Element[] {
  const pageH = (document.documentElement.dataset.printPage === "landscape" ? 210 : 297) * PX_PER_MM;
  const out: Element[] = [];
  document.documentElement.classList.add("print-measure");
  try {
    withPrintRules(() => {
      for (const d of docs) {
        const sel = ".paper-sheet:not([data-frame]):not([data-paper-form]):not([data-foot])";
        for (const sheet of d.matches(sel) ? [d] : Array.from(d.querySelectorAll(sel))) {
          const foot = sheet.querySelector(":scope > .paper-foot");
          if (foot && sheet.querySelector(":scope > .paper-page-foot") && foot.getBoundingClientRect().height > pageH * 0.2) out.push(sheet);
        }
      }
    });
  } finally {
    document.documentElement.classList.remove("print-measure");
  }
  for (const s of out) s.setAttribute("data-foot", "once");
  return out;
}

function unscope(): void {
  clearScope();
  unpagePapers();
}

function clearScope(): void {
  for (const s of footsOnce) s.removeAttribute("data-foot");
  footsOnce = [];
  unfit();
  unfitAll();
  if (!active) return;
  for (const el of active.hidden) el.classList.remove(HIDDEN);
  for (const el of active.ancestors) el.classList.remove(ANCESTOR);
  for (const el of active.emptied) el.removeAttribute(EMPTY_ATTR);
  for (const { box, text, display } of active.written) {
    box.classList.remove(PRINTED_AS_TEXT);
    if (display !== undefined) (box as HTMLElement).style.display = display;
    text.remove();
  }
  if (active.split) unsplit(active.split);
  for (const td of active.tidied ?? []) td.classList.remove(PRINT_CENTER, PRINT_ONE_LINE);
  // (the lines evened for the print go back to the heights the page-fill gave them, which unfit then takes off)
  for (const tr of active.evened ?? []) tr.style.removeProperty("height");
  document.documentElement.classList.remove(SCOPED);
  active = null;
}

// THE HR MODULE'S LINES EVEN, ITS NUMBERS IN THE MIDDLE (the owner, 20-Nov-2026, REQUIREMENTS §266, with the Skill Matrix's
// printout: "make those numbers in middle and see in this all that so line are small and some are big so do this fix this
// kind of problem where the problem is present"). Measured on every HR sheet's print: the lines ran 14 to 35 px on F/HR/03,
// 21 to 53 on F/HR/01, 13 to 31 on F/HR/05 - a name, a designation or a department of a few words wrapping to two or three
// lines in a squeezed column. For the print, on an HR sheet (data-sheet="hr-..."), each grid cell holding
//   - a number, a date, a grade or a yes / no stands in the middle of its box (PRINT_CENTER);
//   - any other short value (40 letters at most, one line as written) stays on one line (PRINT_ONE_LINE), so every line is
//     one line high - the sheet is then drawn to its page by the fit that follows.
// A sentence (a check point, a topic) wraps as on the paper. Put back after the print (unscope).
const PRINT_CENTER = "print-center";
const PRINT_ONE_LINE = "print-one-line";
const HR_SHEET = '[data-sheet^="hr-"]';
const CENTRED_VALUE = /^(?:[-+]?\d+(?:[.,:/-]\d+)*\s*%?|[A-Z]{1,3}|Yes|No|N\/?A|Nil|-|—|✓|✔|✗)$/i;
/**
 * What a grid cell shows: its words, or - on a record still being written, where the value stands in a box - the box's value
 * (§270: F/HR/04's YES / NO is a choice box; read by its words alone, it held nothing, and its "No" printed at the left).
 */
function cellValueText(td: HTMLElement): string {
  const box = td.querySelector("select, input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea") as HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement | null;
  if (!box || box.classList.contains(PRINTED_AS_TEXT)) return (td.innerText ?? "").trim();
  return (box instanceof HTMLSelectElement ? (box.value ? (box.selectedOptions[0]?.text ?? box.value) : "") : box.value).trim();
}
function tidyHrCells(docs: Element[]): Element[] {
  const touched: Element[] = [];
  for (const doc of docs) {
    const sheets = doc.matches(HR_SHEET) ? [doc] : Array.from(doc.querySelectorAll(HR_SHEET));
    for (const sheet of sheets) {
      for (const table of Array.from(sheet.querySelectorAll("table.log-sheet"))) {
        // By column: one is centred when nearly all its values are numbers, dates or grades - a designation that happens to
        // be "QC" stays where its column's words stand.
        const columns = new Map<number, { td: HTMLElement; text: string }[]>();
        for (const tr of Array.from(table.querySelectorAll(":scope > tbody > tr"))) {
          Array.from(tr.children).forEach((td, i) => {
            const text = cellValueText(td as HTMLElement);
            if (!text) return;
            if (!columns.has(i)) columns.set(i, []);
            columns.get(i)!.push({ td: td as HTMLElement, text });
          });
        }
        for (const cells of columns.values()) {
          const centred = cells.filter((c) => CENTRED_VALUE.test(c.text)).length >= Math.max(1, cells.length * 0.8);
          for (const { td, text } of cells) {
            if (centred) td.classList.add(PRINT_CENTER);
            else if (text.length <= 40 && !text.includes(String.fromCharCode(10))) td.classList.add(PRINT_ONE_LINE);
            else continue;
            touched.push(td);
          }
        }
      }
    }
  }
  return touched;
}

/**
 * ...AND A SHORT TABLE'S LINES ALL ONE HEIGHT (§266): where a sentence still runs to two lines beside one-line neighbours -
 * F/HR/21's attributes, F/HR/06's topics, F/HR/08's induction topics - each line of a table of 40 lines at most is drawn as
 * tall as its tallest (measured with the print's rules), when that is under twice the shortest (three times on 25 lines or fewer). A long register (F/HR/19's
 * 55 points) keeps its lines as written, so it runs to no more pages. Put back after the print.
 */
function evenHrLines(docs: Element[]): HTMLElement[] {
  const evened: HTMLElement[] = [];
  document.documentElement.classList.add("print-measure");
  try {
    withPrintRules(() => {
      for (const doc of docs) {
        const sheets = doc.matches(HR_SHEET) ? [doc] : Array.from(doc.querySelectorAll(HR_SHEET));
        const docEl = doc as HTMLElement;
        // (the cleaning records' lines are set for their one page, §279)
        if (docEl.querySelector(CLEANING_SHEETS)) continue;
        const landscape = (paperOf(docEl) ?? (document.documentElement.dataset.printPage === "landscape" ? "landscape" : "portrait")) === "landscape";
        const zoom = Number(docEl.style.zoom) || 1;
        const pageH = (landscape ? 210 : 297) * PX_PER_MM;
        for (const sheet of sheets) {
          for (const table of Array.from(sheet.querySelectorAll("table.log-sheet"))) {
            const rows = (Array.from(table.querySelectorAll(":scope > tbody > tr")) as HTMLElement[]).filter((r) => isShown(r) && r.children.length > 1);
            if (rows.length < 3 || rows.length > 40) continue;
            // Measured as the page lays the sheet out (its width at its zoom), not as the screen does.
            const kept = rows.map((r) => r.style.height);
            const result = laidOutAt(docEl, docEl, zoom, landscape, () => {
              const pages = () => Math.ceil(((docEl.getBoundingClientRect().height * zoom) / pageH) * 0.999 + 0.0001);
              const before = pages();
              const hs = rows.map((r) => r.getBoundingClientRect().height);
              const low = Math.min(...hs);
              const high = Math.max(...hs);
              // (under twice the shortest; a table of 25 lines or fewer under three times)
              if (low <= 0 || high < low * 1.1 || high >= low * (rows.length <= 25 ? 3 : 2)) return false;
              for (const r of rows) r.style.height = `${Math.ceil(high)}px`;
              // only where it runs onto no further page
              if (pages() > before) {
                rows.forEach((r, i) => (r.style.height = kept[i]));
                return false;
              }
              return true;
            });
            if (result) evened.push(...rows);
          }
        }
      }
    });
  } finally {
    document.documentElement.classList.remove("print-measure");
  }
  return evened;
}

// A MONTH ON TWO PAGES, EACH A WHOLE SHEET (the owner, 20-Nov-2026, REQUIREMENTS §263: F/PRD/10, 22, 23 and 24, two lines a
// date, "Two A4 pages"). For the print only, a sheet that says so (data-print-pages="2") is printed as two copies of itself:
// the first holds the 1st to the 15th, the second - on a page of its own - the 16th to the month's end, each with the
// heading and the stock note, its PAGE NO. "1 of 2" and "2 of 2". Each is then fitted to its own A4 (data-one-page). The
// copy goes and every line and label is put back after the print (unscope).
interface SplitPages {
  copies: Element[];
  rows: HTMLElement[];
  labels: { el: Element; text: string }[];
  marked: Element[];
}
function splitPages(docs: Element[]): { docs: Element[]; split: SplitPages } {
  const split: SplitPages = { copies: [], rows: [], labels: [], marked: [] };
  const out: Element[] = [];
  for (const doc of docs) {
    out.push(doc);
    const sheet = doc.matches('[data-print-pages="2"]') ? doc : doc.querySelector('[data-print-pages="2"]');
    const start = sheet?.querySelector<HTMLElement>("table.log-sheet tbody tr[data-page-start]");
    if (!sheet || !start) continue;
    const copy = doc.cloneNode(true) as HTMLElement;
    copy.setAttribute("data-print-copy", "");
    copy.style.breakBefore = "page";
    copy.style.pageBreakBefore = "always";
    doc.after(copy);
    split.copies.push(copy);
    // The first page: the lines before the 16th; the second: from it on.
    const rowsOf = (root: Element) => Array.from(root.querySelectorAll<HTMLElement>("table.log-sheet tbody > tr"));
    const mine = rowsOf(doc);
    const at = mine.indexOf(start);
    for (const r of mine.slice(at)) {
      r.classList.add(HIDDEN);
      split.rows.push(r);
    }
    // (a copy keeps no choice made in a box: each box of the copy takes its original's value)
    const boxes = Array.from(doc.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"));
    const copied = Array.from(copy.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"));
    boxes.forEach((box, i) => {
      const c = copied[i];
      if (!c) return;
      if (c instanceof HTMLInputElement && (c.type === "checkbox" || c.type === "radio")) c.checked = (box as HTMLInputElement).checked;
      else c.value = box.value;
    });
    const theirs = rowsOf(copy);
    for (const r of theirs.slice(0, at)) r.remove();
    for (const [root, label] of [[doc, "1 of 2"], [copy, "2 of 2"]] as const) {
      // the PAGE NO. box: the sheet's heading writes it in a bold label or, on a format the plant may re-word, in its own box
      for (const b of Array.from(root.querySelectorAll('b, [data-action="rename-page-no"]'))) {
        if ((b.textContent ?? "").trim() !== "1 of 1") continue;
        if (root === doc) split.labels.push({ el: b, text: b.textContent ?? "" });
        b.textContent = label;
      }
      // each half a page of its own, fitted as one
      const own = root.matches("[data-print-pages]") ? root : root.querySelector("[data-print-pages]");
      if (own) {
        own.removeAttribute("data-print-pages");
        if (root === doc) split.marked.push(own);
      }
    }
    out.push(copy);
  }
  return { docs: out, split };
}
function unsplit(split: SplitPages): void {
  for (const c of split.copies) c.remove();
  for (const r of split.rows) r.classList.remove(HIDDEN);
  for (const { el, text } of split.labels) el.textContent = text;
  for (const m of split.marked) m.setAttribute("data-print-pages", "2");
}

function scope(targets: Element[]): void {
  unscope();
  if (outermost(targets).length === 0) return;
  const measuring = <T,>(measure: () => T): T => {
    document.documentElement.classList.add("print-measure");
    try {
      return withPrintRules(measure);
    } finally {
      document.documentElement.classList.remove("print-measure");
    }
  };
  // A value shown as words prints in a box (§279), unless that would run the sheet to a page more: F/MNT/04's blank month is
  // one page because its empty cells keep it small. Measured both ways, ready to print.
  valuesAsBoxes = true;
  if (outermost(targets).some((d) => d.querySelector(READ_ONLY_VALUE) !== null)) {
    const tallest = () => measuring(() => tallestSheet(active?.sheets ?? []));
    valuesAsBoxes = false;
    prepareScope(targets);
    const asWords = tallest();
    clearScope();
    valuesAsBoxes = true;
    prepareScope(targets);
    if (tallest() > Math.max(1, asWords) + 0.01) {
      clearScope();
      valuesAsBoxes = false;
      prepareScope(targets);
    }
  } else prepareScope(targets);
  // A long HR register: each page with its own head and number (§277). Its pages are measured with the sheet ready to print
  // (its lines evened, its boxes written as words), then it is drawn so and made ready again.
  if (pagePapers(outermost(targets), measuring)) {
    clearScope();
    prepareScope(targets);
  }
}

// A RECORD THAT CANNOT BE WRITTEN ON PRINTS AS ONE THAT CAN (REQUIREMENTS §279; the owner, 22-Nov-2026, with F/QC/12 printed from
// its document's page on two sheets: "when i click on open record ... it should come perfect but when i click print on outside
// ... this problem is happening", every module). The page outside the record, and a submitted or verified record, show a value
// as words (LogSheetRecordView); an open record shows it in a box. The print fits, centres and wraps boxes, so words took other
// column widths, wrapped a name over three lines and ran past the page. For the print each such value stands in a box of the
// open record's kind; a value of several lines stays as words. Taken off when the print is done (clearScope).
const READ_ONLY_VALUE = "table.log-sheet td .cell-text:not([data-computed]):not([data-locked]):not([data-printed]):not([data-heading-box])";
const SHOWN_DATE = /^(\d{2})-(\d{2})-(\d{4})$/;
let valuesAsBoxes = true;

function readOnlyValuesAsBoxes(docs: Element[]): Written[] {
  const written: Written[] = [];
  const standIn = (words: HTMLElement, box: HTMLInputElement | HTMLSelectElement) => {
    box.className = "input input-sm";
    box.tabIndex = -1;
    // (on a sheet laid out for the page, no taller than the words: a line never grows, so a sheet runs to no more pages. A paper's
    // cell keeps the paper's own height.)
    if (!words.closest(PAPER_FORM)) Object.assign(box.style, { height: "auto", minHeight: "0", paddingTop: "0", paddingBottom: "0" });
    words.insertAdjacentElement("afterend", box);
    written.push({ box: words, text: box, display: words.style.display });
    words.style.display = "none";
  };
  for (const d of docs) {
    for (const words of Array.from(d.querySelectorAll<HTMLElement>(READ_ONLY_VALUE))) {
      const value = words.textContent ?? "";
      if (value.includes("\n")) continue;
      if (words.dataset.boxKind === "select" || words.dataset.boxKind === "yesno") {
        const choice = document.createElement("select");
        choice.add(new Option("—", "", !value, !value));
        if (value) choice.add(new Option(value, value, true, true));
        standIn(words, choice);
        continue;
      }
      const box = document.createElement("input");
      box.readOnly = true;
      const date = words.classList.contains("cell-date") ? SHOWN_DATE.exec(value.trim()) : null;
      box.type = date ? "date" : "text";
      box.value = date ? `${date[3]}-${date[2]}-${date[1]}` : value;
      // (a date the calendar has no such day for stays its words)
      if (date && box.value === "") {
        box.type = "text";
        box.value = value;
      }
      box.setAttribute("value", box.value);
      standIn(words, box);
    }
  }
  return written;
}

function prepareScope(targets: Element[]): void {
  const docs = outermost(targets);
  const keep = new Set<Element>(docs);
  const ancestors: Element[] = [];
  for (const d of docs) {
    for (let n = d.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      if (keep.has(n)) continue;
      keep.add(n);
      ancestors.push(n);
    }
  }
  const hidden: Element[] = [];
  for (const a of ancestors) {
    for (const child of Array.from(a.children)) {
      if (keep.has(child) || child.classList.contains(HIDDEN)) continue;
      child.classList.add(HIDDEN);
      hidden.push(child);
    }
    if (a !== document.body) a.classList.add(ANCESTOR);
  }
  document.documentElement.classList.add(SCOPED);
  // (a value shown as words, on a record that cannot be written on, printed as an open record prints it: §279)
  const asBoxes = valuesAsBoxes ? readOnlyValuesAsBoxes(outermost(targets)) : [];
  active = { hidden, ancestors, emptied: markEmptyBoxes(outermost(targets)), written: [...writeBoxesAsText(outermost(targets)), ...asBoxes] };
  // A month on two pages (§263): its second page a copy of the sheet, from the 16th on - made once its boxes are written.
  const { docs: pages, split } = splitPages(docs);
  if (split.copies.length) active.split = split;
  // The HR sheets' values: numbers in the middle, short words on one line (§266) - before the sheet is fitted to its page.
  active.tidied = tidyHrCells(pages);
  docs.splice(0, docs.length, ...pages);
  active.sheets = docs as HTMLElement[];
  fitToPage(docs);
  footsOnce = footsTooTall(docs);
  // Words wider than their box print smaller, never cut (utils/fitText.ts)...
  fitAll(docs);
  // ...and a value too long for its box even so prints as words that wrap.
  active.written.push(...writeLongBoxesAsWords(docs));
  // A sheet whose every value prints as words is fitted again by those words (refitToWords).
  refitToWords(docs);
  // Then a page still short of its foot has its lines drawn taller (FILLING EACH PAGE).
  stretchToPages(docs);
  // ...and an HR table's lines all as tall as its tallest, where that keeps the sheet to its pages (§266).
  active.evened = evenHrLines(docs);
  // Last of all, nothing wider than the page: a grid still running past its printable width is drawn smaller (§269).
  keepWithinPage(docs);
}

// A SHEET WHOSE EVERY VALUE PRINTS AS WORDS (EVERY_VALUE_AS_WORDS: Purchase Master Data, F/PUR/03; REQUIREMENTS §189) IS
// FITTED AGAIN ONCE ITS WORDS ARE WRITTEN: the words, not the boxes they stand in for, set how narrow its grid can be laid
// out. Fitted by its boxes, Purchase Master Data printed 1,090 px of grid on a 1,032 px page, its rows 59 px high
// (6-Nov-2026). Measured with the words in place and the print's rules on, the sheet is drawn as large as the page's width
// takes - smaller where it ran over, larger where it had room - and never above its own size.
function refitToWords(docs: Element[]): void {
  const landscape = document.documentElement.dataset.printPage === "landscape";
  const room = PRINTABLE_WIDTH[landscape ? "landscape" : "portrait"] * 0.98;
  document.documentElement.classList.add("print-measure");
  try {
    withPrintRules(() => {
      for (const d of docs) {
        const doc = d as HTMLElement;
        if (!(doc.matches(EVERY_VALUE_AS_WORDS) || doc.querySelector(EVERY_VALUE_AS_WORDS))) continue;
        if (ownLeftMargin(doc) !== null || isFramed(doc) || pageSections(doc).length > 1) continue;
        // (measured as drawn, so a zoom's own rounding of the words is caught by the next round)
        for (let round = 0; round < 3; round++) {
          const zoom = Number(doc.style.zoom) || 1;
          const width = narrowestWidth(doc);
          if (width <= 0) break;
          const z = Math.min(1, Math.max(SMALLEST_SCALE, Math.floor(((zoom * room) / width) * 1000) / 1000));
          if (Math.abs(z - zoom) < 0.004) break;
          doc.style.zoom = String(z);
          doc.style.setProperty("--print-zoom", String(z));
          if (!fitted.includes(doc)) fitted.push(doc);
        }
      }
    });
  } finally {
    document.documentElement.classList.remove("print-measure");
  }
}

// NOTHING CUT AT THE PAGE'S EDGE (REQUIREMENTS §269; the owner, 20-Nov-2026, with F/HR/01's printout running off the right of
// the A4: "when user taking print on A4 size paper then it should print properly only no line should cut ... when there are
// many columns in document"). Last of all - every box written as it prints, every line drawn - each sheet's grids are
// measured as narrow as they can be laid out, with the print's own rules on; one still wider than the page's printable
// width (A4 less its 12 mm each side, 2% kept) is drawn smaller until it fits. Never larger: a sheet that fits is left as the
// steps above drew it. A framed paper, one standing at its own margin and one printed as pages of its own fit themselves.
function keepWithinPage(docs: Element[]): void {
  const landscape = document.documentElement.dataset.printPage === "landscape";
  const room = PRINTABLE_WIDTH[landscape ? "landscape" : "portrait"] * 0.98;
  document.documentElement.classList.add("print-measure");
  try {
    withPrintRules(() => {
      for (const d of docs) {
        const doc = d as HTMLElement;
        // (an HR paper sizes itself to the A4 page, PaperTable.fillA4: §275)
        if (ownLeftMargin(doc) !== null || isFramed(doc) || pageSections(doc).length > 1 || doc.matches("[data-paper-own]") || doc.querySelector("[data-paper-own]") || doc.querySelector(CLEANING_SHEETS)) continue;
        for (let round = 0; round < 3; round++) {
          const zoom = Number(doc.style.zoom) || 1;
          const width = narrowestWidth(doc);
          if (width <= room + 1) break;
          const z = Math.max(SMALLEST_SCALE, Math.floor(((zoom * room) / width) * 1000) / 1000);
          if (z >= zoom) break;
          doc.style.zoom = String(z);
          doc.style.setProperty("--print-zoom", String(z));
          if (!fitted.includes(doc)) fitted.push(doc);
        }
      }
    });
  } finally {
    document.documentElement.classList.remove("print-measure");
  }
}

/**
 * Prints the document and nothing else. `target` is the document itself, or
 * something holding it (a report's card); with no target, every document on
 * screen is printed.
 */
export function printDocument(target?: Element | null): void {
  preparePrint();
  let docs: Element[];
  if (!target) docs = documentsOnScreen();
  else if (target.matches(DOC_SELECTOR)) docs = [target];
  else {
    const inside = documentsOnScreen(target);
    docs = inside.length ? inside : [target];
  }
  scope(docs);
  // One line in the activity log for what went to the printer (REQUIREMENTS §62).
  const titles = docs.map((d) => d.querySelector(".doc-title")?.textContent?.trim() ?? "").filter(Boolean);
  logActivity("Document printed", titles.join(" · ") || document.title, window.location.hash.replace(/^#/, ""));
  window.print();
}

/** Gives Ctrl+P and the browser's own Print menu the same printout. Call once, at start-up. */
/** Fired before a printout is measured: long lists still being built put in every line (utils/useProgressive.ts). */
export const PRINT_PREPARE_EVENT = "dcrs:print-prepare";

function preparePrint(): void {
  window.dispatchEvent(new Event(PRINT_PREPARE_EVENT));
}

export function installPrintScoping(): void {
  window.addEventListener("beforeprint", () => {
    preparePrint();
    // A Print button has already chosen what to print.
    if (active) return;
    const docs = documentsOnScreen();
    if (docs.length > 0) scope(docs);
    else {
      // A screen with no document marked still has its wide tables fitted.
      const content = document.querySelector(".app-content");
      if (content) fitToPage([content]);
    }
  });
  window.addEventListener("afterprint", unscope);
}
