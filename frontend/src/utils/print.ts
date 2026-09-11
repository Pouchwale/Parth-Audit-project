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

const DOC_SELECTOR = "[data-print-doc]";
const HIDDEN = "print-scope-hidden";
const ANCESTOR = "print-scope-ancestor";
const SCOPED = "print-scoped";

let active: { hidden: Element[]; ancestors: Element[] } | null = null;

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
}

/**
 * Prints the document and nothing else. `target` is the document itself, or
 * something holding it (a report's card); with no target, every document on
 * screen is printed.
 */
export function printDocument(target?: Element | null): void {
  let docs: Element[];
  if (!target) docs = documentsOnScreen();
  else if (target.matches(DOC_SELECTOR)) docs = [target];
  else {
    const inside = documentsOnScreen(target);
    docs = inside.length ? inside : [target];
  }
  scope(docs);
  window.print();
}

/** Gives Ctrl+P and the browser's own Print menu the same printout. Call once, at start-up. */
export function installPrintScoping(): void {
  window.addEventListener("beforeprint", () => {
    // A Print button has already chosen what to print.
    if (!active) scope(documentsOnScreen());
  });
  window.addEventListener("afterprint", unscope);
}
