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

const DOC_SELECTOR = "[data-print-doc]";
const HIDDEN = "print-scope-hidden";
const ANCESTOR = "print-scope-ancestor";
const SCOPED = "print-scoped";

/** A box printed as its words: the words, and the box's own inline display where the print hid the box itself. */
type Written = { box: Element; text: Element; display?: string };

let active: { hidden: Element[]; ancestors: Element[]; emptied: Element[]; written: Written[] } | null = null;

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
      if (box.value === "" || box.classList.contains(PRINTED_AS_TEXT)) continue;
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
export const PRINT_BOX_WORDS = "print-box-words";
/** The wrapped lines' pitch to their size, and the share of two lines' width the words may fill (a line breaks between words). */
const WORDS_LINE = 1.15;
const TWO_LINES = 1.8;
/** A web form's value is printed as words once it fills this much of its box on the screen. */
const WEB_FULL = 0.8;

/** A paper form drawn in the paper's millimetres, the same on the screen and on paper (the incoming records, the line clearances, the
 *  calibration papers, the report forms, a paper's own table). Every other sheet is laid out afresh for the page. */
const PAPER_FORM = ".paper-sheet[data-paper-form]";

/** Puts the words of every written value too long for its box in its place, for the print (after fitAll); the pairs are returned. */
function writeLongBoxesAsWords(docs: Element[]): Written[] {
  // Every box read first, then every one written: one layout for the lot.
  const plan: { box: HTMLInputElement; size: number; floor: number; height: number | null; align: string }[] = [];
  for (const d of docs) {
    for (const box of Array.from(d.querySelectorAll<HTMLInputElement>(LONG_BOXES))) {
      if (box.value.trim() === "" || box.classList.contains(PRINTED_AS_TEXT) || box.clientWidth === 0) continue;
      const { need, room, own, now, floor } = measureWords(box);
      const align = getComputedStyle(box).textAlign;
      if (box.closest(PAPER_FORM)) {
        // The paper's cell: cut even at the smallest writing, the words go on two lines inside the cell's own height.
        if ((need * floor) / own <= room + 1) continue;
        plan.push({ box, size: Math.min(own, Math.max(floor, (own * TWO_LINES * room) / need)), floor, height: box.clientHeight, align });
        // Any other sheet: a value that fills most of its box (written smaller to fit, or nearly full) keeps the size it is
        // written at, and wraps only where the page's box is narrower than the screen's: the printout is as before, uncut.
      } else if ((need * now) / own > room * WEB_FULL) plan.push({ box, size: now, floor, height: null, align });
    }
  }
  const written: Written[] = [];
  for (const { box, size, height, align } of plan) {
    const text = document.createElement("span");
    text.className = `${PRINT_BOX_TEXT} ${PRINT_BOX_WORDS}`;
    text.textContent = box.value;
    // Inline, so that no rule written for a date's one line (its nowrap, a line's height) holds the words to one line.
    Object.assign(text.style, { whiteSpace: "pre-wrap", overflowWrap: "anywhere", height: "auto", maxHeight: "none", overflow: "visible", textAlign: align, fontSize: `${size}px` });
    if (height !== null) text.style.lineHeight = String(WORDS_LINE);
    else text.style.display = "block";
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
// A form a little too wide for a portrait page stays portrait, slightly smaller.
const PORTRAIT_SCALE = 0.8;
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
    const own = ownLeftMargin(doc);
    const room = own !== null ? (PAGE_WIDTH_MM[landscape ? "landscape" : "portrait"] - own - 2) * PX_PER_MM : paper;
    if (width <= room) continue;
    let zoom = Math.max(SMALLEST_SCALE, Math.floor((room / width) * 1000) / 1000);
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

function unfit(): void {
  for (const doc of fitted) {
    doc.style.zoom = "";
    doc.style.removeProperty("--print-zoom");
  }
  fitted = [];
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

function unscope(): void {
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
  document.documentElement.classList.remove(SCOPED);
  active = null;
}

function scope(targets: Element[]): void {
  unscope();
  const docs = outermost(targets);
  if (docs.length === 0) return;
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
  active = { hidden, ancestors, emptied: markEmptyBoxes(docs), written: writeBoxesAsText(docs) };
  fitToPage(docs);
  // Words wider than their box print smaller, never cut (utils/fitText.ts)...
  fitAll(docs);
  // ...and a value too long for its box even so prints as words that wrap.
  active.written.push(...writeLongBoxesAsWords(docs));
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
