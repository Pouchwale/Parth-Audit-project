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

import { logActivity } from "./activityLog";

const DOC_SELECTOR = "[data-print-doc]";
const HIDDEN = "print-scope-hidden";
const ANCESTOR = "print-scope-ancestor";
const SCOPED = "print-scoped";

let active: { hidden: Element[]; ancestors: Element[] } | null = null;

const PAGE_STYLE_ID = "print-page-fit";
const PX_PER_MM = 96 / 25.4;
// A4 less the 12 mm each side that a printed document keeps for itself
// (styles.css, "Print"; the page itself has no margin, so that the browser
// cannot print the date and the time in it — REQUIREMENTS §59).
const PRINTABLE_WIDTH = { portrait: (210 - 24) * PX_PER_MM, landscape: (297 - 24) * PX_PER_MM };
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

function fitToPage(docs: Element[]): void {
  unfit();
  const needs = docs.map((d) => ({ doc: d as HTMLElement, width: narrowestWidth(d) }));
  const widest = Math.max(0, ...needs.map((n) => n.width));
  const landscape = widest > PRINTABLE_WIDTH.portrait / PORTRAIT_SCALE;
  const paper = landscape ? PRINTABLE_WIDTH.landscape : PRINTABLE_WIDTH.portrait;
  pageStyle().textContent = landscape ? "@page { size: A4 landscape; margin: 0; }" : "";
  document.documentElement.dataset.printPage = landscape ? "landscape" : "portrait";
  for (const { doc, width } of needs) {
    if (width <= paper) continue;
    doc.style.zoom = String(Math.max(SMALLEST_SCALE, Math.floor((paper / width) * 1000) / 1000));
    fitted.push(doc);
  }
}

function unfit(): void {
  for (const doc of fitted) doc.style.zoom = "";
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
  if (!active) return;
  for (const el of active.hidden) el.classList.remove(HIDDEN);
  for (const el of active.ancestors) el.classList.remove(ANCESTOR);
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
  active = { hidden, ancestors };
  fitToPage(docs);
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
