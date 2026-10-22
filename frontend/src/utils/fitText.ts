// WORDS WIDER THAN THEIR BOX ARE WRITTEN SMALLER, NEVER CUT (the owner, 22-Oct-2026: on F/QC/12 and the line clearances a
// date, a customer's name or "100.000 gm" was cut off at the cell's edge). A paper's cell keeps the paper's width; what is
// written in it is made smaller until it fits - as a person writes smaller in a small box - down to MIN of its own size.
// On the screen the boxes whose value changed are looked at (utils/screenFit.ts calls fitChanged); in print, every written box
// and every date's printed words (utils/print.ts calls fitAll, then unfitAll when the print is done).
// A paper's cell keeps the paper's width, so its words may go down to MIN; a box of the screen's own make (a web form's)
// only a little (OTHER_MIN) - its words scroll in the box past that, never too small to read.
const MIN = 0.55;
const OTHER_MIN = 0.85;
const PAPER = ".paper-sheet, .register-sheet, .soc-sheet";
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

/** Each box's words made smaller until they fit its width: one layout read and one write per round, never one per box. */
function fit(els: HTMLElement[]): HTMLElement[] {
  // Back to its own size first: a shorter value needs no shrinking any more.
  for (const el of els) if (base.has(el)) el.style.fontSize = "";
  const shrunk: HTMLElement[] = [];
  let todo = els.filter(wider);
  for (let round = 0; round < 4 && todo.length; round++) {
    const plan = todo.map((el) => {
      const now = parseFloat(getComputedStyle(el).fontSize) || 12;
      if (!base.has(el)) base.set(el, now);
      const own = base.get(el)!;
      return { el, size: Math.max(own * floorOf(el), Math.floor(now * (el.clientWidth / widthOf(el)) * 0.97 * 10) / 10) };
    });
    for (const { el, size } of plan) {
      el.style.fontSize = `${size}px`;
      if (round === 0) shrunk.push(el);
    }
    todo = plan.filter(({ el, size }) => size > base.get(el)! * floorOf(el) && wider(el)).map((p) => p.el);
  }
  return shrunk;
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
