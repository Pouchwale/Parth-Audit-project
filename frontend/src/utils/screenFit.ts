// A PAPER WIDER THAN THE SCREEN IS SHOWN WHOLE (the owner, 22-Oct-2026: F/QC/12 ran past the page's right edge and its grid
// scrolled sideways, its Date column cut). A document drawn on its paper's millimetres - a landscape sheet is 287 mm, wider
// than a laptop's page - is zoomed on the screen to the width it has, as a PDF viewer fits a page to its width. Print is not
// touched: the zoom is a screen rule (styles.css), and utils/print.ts fits the printed page as before. A phone keeps its own
// stacked layout and scrolls instead (below 760 px nothing is zoomed), and nothing is made smaller than MIN_ZOOM.
import { fitChanged } from "./fitText";

const MIN_ZOOM = 0.6;
const DESKTOP = "(min-width: 760px)";
const DOCS = "[data-print-doc]:not([data-print-doc='ui'])";

const zoomOf = (doc: HTMLElement): number => Number(doc.style.getPropertyValue("--screen-zoom")) || 1;

function setZoom(doc: HTMLElement, zoom: number): void {
  if (zoom >= 0.999) doc.style.removeProperty("--screen-zoom");
  else doc.style.setProperty("--screen-zoom", String(zoom));
}

/** How far a grid inside the document scrolls sideways in a box of its own (F/QC/12's grid in the sheet's width). */
function innerScroll(doc: HTMLElement): number {
  let extra = 0;
  for (const box of Array.from(doc.querySelectorAll<HTMLElement>(".doc-table, [style*='overflow']"))) extra = Math.max(extra, box.scrollWidth - box.clientWidth);
  return extra;
}

const zoomFor = (room: number, need: number): number => Math.max(MIN_ZOOM, Math.floor((room / need) * 1000) / 1000);
// A paper's copy is fitted to the screen whatever it takes (to MIN_ZOOM); a register of the screen's own make far wider than any
// screen (a year's columns, a skill matrix) keeps its size and scrolls in its grid as a spreadsheet does - fitted only when a
// little zoom is enough.
const PAPER = ".paper-sheet, .register-sheet, .soc-sheet";
const OTHER_MIN = 0.85;
const fits = (doc: HTMLElement, zoom: number): boolean => zoom >= OTHER_MIN || doc.querySelector(PAPER) !== null;

/** From scratch: the zoom taken off, the paper's own width (and a grid's sideways scroll) measured against the room it has. */
function refit(doc: HTMLElement): void {
  doc.style.removeProperty("--screen-zoom");
  if (!matchMedia(DESKTOP).matches) return;
  const room = doc.clientWidth;
  const own = doc.scrollWidth;
  const inner = innerScroll(doc);
  if (room <= 0 || Math.max(own, room + inner) <= room + 1) return;
  const zoom = zoomFor(room, Math.max(own, room + inner));
  if (!fits(doc, zoom)) return;
  setZoom(doc, zoom);
  // A grid in a box of the paper's own fixed width scrolls at any zoom: then only the document's own width is fitted. A
  // register far wider than any screen keeps the zoom that helped, and scrolls the rest in its own box.
  const left = inner > 1 ? innerScroll(doc) : 0;
  if (left > 1 && left > inner * 0.9) {
    if (own > room + 1) setZoom(doc, zoomFor(room, own));
    else doc.style.removeProperty("--screen-zoom");
  }
}

/** As it stands: a paper that grew wider than its room (a line added) is zoomed further; nothing is measured twice. */
function shrinkIfWider(doc: HTMLElement): void {
  if (!matchMedia(DESKTOP).matches) return;
  const room = doc.clientWidth;
  const need = doc.scrollWidth;
  if (room <= 0 || need <= room + 1) return;
  const zoom = Math.max(MIN_ZOOM, Math.floor(((zoomOf(doc) * room) / need) * 1000) / 1000);
  if (fits(doc, zoom)) setZoom(doc, zoom);
}

const outermost = (els: HTMLElement[]): HTMLElement[] => els.filter((el) => !els.some((other) => other !== el && other.contains(el)));
const docsOnPage = (): HTMLElement[] => outermost(Array.from(document.querySelectorAll<HTMLElement>(DOCS)));

export function installScreenFit(): void {
  let queued = 0;
  let full = true;
  const seen = new WeakSet<HTMLElement>();
  const run = () => {
    queued = 0;
    const docs = docsOnPage();
    for (const doc of docs) {
      // A document new on the page, or every one after the window changed size: measured from scratch.
      if (full || !seen.has(doc)) refit(doc);
      else shrinkIfWider(doc);
      seen.add(doc);
    }
    full = false;
    // Words wider than their box, written smaller (utils/fitText.ts): only the boxes whose value changed are measured.
    fitChanged(docs);
  };
  const queue = (fromScratch: boolean) => {
    full = full || fromScratch;
    if (!queued) queued = requestAnimationFrame(run);
  };
  window.addEventListener("resize", () => queue(true));
  // A page drawn, a record opened, a line added: looked at once a frame at most.
  new MutationObserver(() => queue(false)).observe(document.body, { childList: true, subtree: true });
  // Typed or chosen: a value changes without the page changing.
  document.addEventListener("input", () => queue(false), true);
  document.addEventListener("change", () => queue(false), true);
  // A value written by the app (Mitra's fill, a carried line) changes no element and fires no event: looked at once a
  // second, reading values only - the words are measured only where a value changed.
  window.setInterval(() => {
    if (document.visibilityState === "visible") fitChanged(docsOnPage());
  }, 1000);
  // The printout is fitted by utils/print.ts on its own; back on the screen, measured again.
  window.addEventListener("afterprint", () => queue(true));
  document.fonts?.ready.then(() => queue(true)).catch(() => undefined);
  queue(true);
}
