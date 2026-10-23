// A PAPER WIDER THAN THE SCREEN IS SHOWN WHOLE (the owner, 22-Oct-2026: F/QC/12 ran past the page's right edge and its grid
// scrolled sideways, its Date column cut). A document drawn on its paper's millimetres - a landscape sheet is 287 mm, wider
// than a laptop's page - is zoomed on the screen to the width it has, as a PDF viewer fits a page to its width. Print is not
// touched: the zoom is a screen rule (styles.css), and utils/print.ts fits the printed page as before. A phone keeps its own
// stacked layout and scrolls instead (below 760 px nothing is zoomed), and nothing is made smaller than MIN_ZOOM.
import { fitBoxes, fitChanged, forgetWords } from "./fitText";

const MIN_ZOOM = 0.55;
// ...and a paper narrower than its room is enlarged to fill it, to MAX_ZOOM at most: on a laptop at the browser's 100% a
// form drawn at its paper's size reads small (the owner, 22-Oct-2026: "very small and can't able to see it with normal view").
const MAX_ZOOM = 1.5;
const DESKTOP = "(min-width: 760px)";
const DOCS = "[data-print-doc]:not([data-print-doc='ui'])";

const zoomOf = (doc: HTMLElement): number => Number(doc.style.getPropertyValue("--screen-zoom")) || 1;

function setZoom(doc: HTMLElement, zoom: number): void {
  if (Math.abs(zoom - 1) < 0.002) doc.style.removeProperty("--screen-zoom");
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
// (a paper's copy is one drawn on its paper's own measures - a QC paper form, a register drawn as its table, a statement of
// compliance, the contractor's service report; DCRS's own sheets - a register of its own make - are never made so small that
// they read badly: they scroll in their grid instead, the owner, 22-Oct-2026: "very small and can't able to see it")
const PAPER = "[data-paper-form], [data-paper-left], .soc-sheet, .svc-paper";
const OTHER_MIN = 0.85;
const fits = (doc: HTMLElement, zoom: number): boolean => zoom >= OTHER_MIN || doc.querySelector(PAPER) !== null;

/** From scratch: the zoom taken off, the paper's own width (and a grid's sideways scroll) measured against the room it has. */
function refit(doc: HTMLElement): void {
  doc.style.removeProperty("--screen-zoom");
  if (!matchMedia(DESKTOP).matches) return;
  const room = doc.clientWidth;
  const own = doc.scrollWidth;
  const inner = innerScroll(doc);
  if (room <= 0) return;
  if (Math.max(own, room + inner) <= room + 1) {
    // Narrower than its room: as wide as its words and boxes let it be (max-content), then enlarged to the room.
    const width = doc.style.width;
    doc.style.width = "max-content";
    const natural = doc.getBoundingClientRect().width;
    doc.style.width = width;
    if (natural > 0 && natural < room - 2) setZoom(doc, Math.min(MAX_ZOOM, Math.floor((room / natural) * 1000) / 1000));
    return;
  }
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
    // Words wider than their box, written smaller (utils/fitText.ts): only the boxes whose value changed are measured -
    // and every box again when the room changed (a box that fitted beside Ask Mitra may not fit once it closes).
    if (full) forgetWords(docs);
    full = false;
    fitChanged(docs);
    watchRoom();
  };
  const queue = (fromScratch: boolean) => {
    full = full || fromScratch;
    if (!queued) queued = requestAnimationFrame(run);
  };
  // The window resized, or the page's own column did (Ask Mitra docked beside it, the navigation panel shown or hidden):
  // measured from scratch once it settles.
  let settle = 0;
  const roomChanged = () => {
    // (not while a print is laid out: utils/print.ts fits the printed page itself, and afterprint measures the screen again)
    if (document.documentElement.classList.contains("print-scoped")) return;
    window.clearTimeout(settle);
    settle = window.setTimeout(() => queue(true), 150);
  };
  window.addEventListener("resize", roomChanged);
  let column: Element | null = null;
  let columnWidth = -1;
  const room = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => {
    const width = Math.round(entries[entries.length - 1].contentRect.width);
    if (columnWidth >= 0 && Math.abs(width - columnWidth) > 1) roomChanged();
    columnWidth = width;
  });
  function watchRoom(): void {
    const now = document.querySelector(".app-content");
    if (!room || now === column) return;
    if (column) room.unobserve(column);
    column = now;
    columnWidth = -1;
    if (now) room.observe(now);
  }
  // A page drawn, a record opened, a line added: looked at once a frame at most.
  new MutationObserver(() => queue(false)).observe(document.body, { childList: true, subtree: true });
  // Typed or chosen: a value changes without the page changing.
  // A keystroke fits the box typed in, once a frame: never every box of the page (a 173-line sheet stays quick to type in).
  const typed = new Set<HTMLElement>();
  let typedFrame = 0;
  const onTyped = (e: Event) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || !el.closest(DOCS)) return;
    typed.add(el);
    if (!typedFrame)
      typedFrame = requestAnimationFrame(() => {
        typedFrame = 0;
        const els = Array.from(typed);
        typed.clear();
        fitBoxes(els);
      });
  };
  document.addEventListener("input", onTyped, true);
  document.addEventListener("change", onTyped, true);
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
