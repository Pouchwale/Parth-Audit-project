// WORDS WIDER THAN THEIR BOX ARE WRITTEN SMALLER, NEVER CUT (the owner, 22-Oct-2026: on F/QC/12 and the line clearances a
// date, a customer's name or "100.000 gm" was cut off at the cell's edge). A paper's cell keeps the paper's width; what is
// written in it is made smaller until it fits - as a person writes smaller in a small box - down to MIN of its own size.
// On the screen the boxes whose value changed are looked at (utils/screenFit.ts calls fitChanged); in print, every written box
// and every date's printed words (utils/print.ts calls fitAll, then unfitAll when the print is done).
// A paper's cell keeps the paper's width, so its words may go down to MIN; a box of the screen's own make (a web form's)
// only a little (OTHER_MIN) - its words scroll in the box past that, never too small to read.
const MIN = 0.55;
const OTHER_MIN = 0.85;
// (a paper's copy: drawn on its paper's own measures; a sheet of DCRS's own make keeps its words readable, 22-Oct-2026)
const PAPER = "[data-paper-form], [data-paper-left], .soc-sheet, .svc-paper";
const floorOf = (el: HTMLElement): number => (el.closest(PAPER) ? MIN : OTHER_MIN);
const BOXES = "input:not([type='hidden']):not([type='checkbox']):not([type='radio']):not([type='file']), select, .print-box-text";

const base = new WeakMap<HTMLElement, number>();
const lastValue = new WeakMap<HTMLElement, string>();
let printed: HTMLElement[] = [];

const valueOf = (el: HTMLElement): string => (el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.value : (el.textContent ?? ""));
// A date or time box draws its words where they cannot be measured (scrollWidth stays its own): measured as its words would be.
let pen: CanvasRenderingContext2D | null | undefined;
function widthOf(el: HTMLElement): number {
  if (!(el instanceof HTMLInputElement) || (el.type !== "date" && el.type !== "time")) return el.scrollWidth;
  pen ??= document.createElement("canvas").getContext("2d");
  if (!pen) return el.scrollWidth;
  const cs = getComputedStyle(el);
  pen.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  // (the box spaces its day, month and year apart: measured in Chrome, about a third wider than the words alone)
  return Math.ceil(pen.measureText(el.type === "date" ? "00-00-0000" : "00:00 AM").width * 1.35 + parseFloat(cs.paddingLeft || "0") + parseFloat(cs.paddingRight || "0") + 4);
}
const wider = (el: HTMLElement): boolean => el.clientWidth > 0 && widthOf(el) > el.clientWidth + 1;

/** How wide a box's words are at `size` px, measured with a canvas (no layout); null where the box cannot be read so. */
function wordsAt(el: HTMLElement, cs: CSSStyleDeclaration, size: number): number | null {
  pen ??= document.createElement("canvas").getContext("2d");
  if (!pen) return null;
  pen.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.textIndent) || 0);
  if (el instanceof HTMLInputElement) {
    // (a date box spaces its day, month and year apart: measured in Chrome, about a third wider than the words alone)
    if (el.type === "date") return pen.measureText("00-00-0000").width * 1.35 + pad + 4;
    if (el.type === "time") return pen.measureText("00:00 AM").width * 1.35 + pad + 4;
    return pen.measureText(el.value).width + pad + 2;
  }
  if (el instanceof HTMLSelectElement) {
    const shown = el.selectedIndex >= 0 ? (el.options[el.selectedIndex]?.text ?? "") : "";
    return pen.measureText(shown).width + pad + 18; // (the arrow)
  }
  return null;
}

/**
 * Each box's words made smaller until they fit its width, in one step: every box read first (its room, its own size, its
 * words measured with a canvas at that size), then every new size written - one layout, whatever the number of boxes.
 */
function fit(els: HTMLElement[]): HTMLElement[] {
  const plan: { el: HTMLElement; size: string }[] = [];
  for (const el of els) {
    const room = el.clientWidth;
    if (room <= 0) continue;
    const cs = getComputedStyle(el);
    if (!base.has(el)) base.set(el, parseFloat(cs.fontSize) || 12);
    const own = base.get(el)!;
    const words = wordsAt(el, cs, own);
    if (words === null) {
      // (a printed date's words, a span: measured as it is laid out, at its size now)
      const now = parseFloat(cs.fontSize) || own;
      const need = el.scrollWidth;
      if (need > room + 1) plan.push({ el, size: `${Math.max(own * floorOf(el), Math.floor(now * (room / need) * 0.97 * 10) / 10)}px` });
      continue;
    }
    const size = words > room + 1 ? Math.max(own * floorOf(el), Math.floor(own * (room / words) * 0.97 * 10) / 10) : own;
    plan.push({ el, size: size >= own - 0.05 ? "" : `${size}px` });
  }
  const shrunk: HTMLElement[] = [];
  for (const { el, size } of plan) {
    if (el.style.fontSize !== size) el.style.fontSize = size;
    if (size) shrunk.push(el);
  }
  return shrunk;
}

/** The boxes given (the ones typed in), each fitted to its box (utils/screenFit.ts, on a keystroke). */
export function fitBoxes(els: HTMLElement[]): void {
  const boxes = els.filter((el) => el.isConnected && el.matches(BOXES));
  for (const el of boxes) lastValue.set(el, valueOf(el));
  if (boxes.length) fit(boxes);
}

/** The boxes of `docs` whose value changed since they were last looked at (every written box, the first time). */
export function fitChanged(docs: Element[]): void {
  const changed: HTMLElement[] = [];
  for (const d of docs) {
    for (const el of Array.from(d.querySelectorAll<HTMLElement>(BOXES))) {
      const v = valueOf(el);
      if (lastValue.get(el) === v) continue;
      lastValue.set(el, v);
      if (v !== "" || base.has(el)) changed.push(el);
    }
  }
  if (changed.length) fit(changed);
}

/** The boxes of `docs` are measured again by the next fitChanged, whatever their values: the room they have changed. */
export function forgetWords(docs: Element[]): void {
  for (const d of docs) for (const el of Array.from(d.querySelectorAll<HTMLElement>(BOXES))) lastValue.delete(el);
}

/** Every written box of `docs`, as the page now lays them out (print). */
export function fitAll(docs: Element[]): void {
  const els: HTMLElement[] = [];
  for (const d of docs) for (const el of Array.from(d.querySelectorAll<HTMLElement>(BOXES))) if (valueOf(el) !== "") els.push(el);
  printed = fit(els);
}

/**
 * A box's words on one line at the box's own size (`need`), against the room it has (`room`), with its own size, the size
 * it is written at now and the smallest its words may be (`own`, `now`, `floor`, in px): read once, after fitAll, by
 * utils/print.ts, which prints as wrapping words a value its box would cut.
 */
export function measureWords(el: HTMLInputElement): { need: number; room: number; own: number; now: number; floor: number } {
  const cs = getComputedStyle(el);
  const now = parseFloat(cs.fontSize) || 12;
  const own = base.get(el) ?? now;
  // The words' own width, as the box writes them (a box's scrollWidth is never less than the box: it cannot say how full it is).
  pen ??= document.createElement("canvas").getContext("2d");
  let words = widthOf(el);
  if (pen) {
    pen.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    words = pen.measureText(el.value).width + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.textIndent) || 0);
  }
  return { need: (words * own) / now, room: el.clientWidth, own, now, floor: own * floorOf(el) };
}

/** After a print: the boxes the print made smaller are measured again by the screen's own pass. */
export function unfitAll(): void {
  for (const el of printed) {
    el.style.fontSize = "";
    lastValue.delete(el);
  }
  printed = [];
}
