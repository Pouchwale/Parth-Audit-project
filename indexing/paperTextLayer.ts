// THE PRINTED WORDS THE INDEX CHANGED, LAID OVER EVERY FORMAT'S SHEET (indexing/textLayout.ts).
//
// Every screen that draws a format marks its sheet `data-format-id="<format id>"` (and, for a record, the moment it was
// signed: `data-format-asof`). One watcher for the whole app (startPaperTextLayer, started once by App) finds those
// sheets and lays the format's text changes over them — the new words, hidden words, bold, size, alignment and the
// place they were moved to — every time the sheet is drawn again. Print is the same page (utils/print.ts prints the
// screen) and the downloads read the same page (utils/documentExport.ts), so all three follow.
//
// WHAT IS NEVER TOUCHED: what somebody typed. A box being filled is an input (never a text node); the figures of a
// signed record are matched by their place on the sheet as well as their words, and the place of a printed heading
// is not the place of a figure. The controls (buttons, menus, anything .no-print) are left alone too.
//
// HOW A WORD IS CHANGED WITHOUT UPSETTING THE SCREEN THAT DREW IT. React keeps the text it wrote; a new wording is
// written into that same text node (React writes it again only when its own words change, and then it is laid over
// again). A word that is styled or moved is shown by a small span beside the emptied original — the original stays
// where React expects it, so nothing breaks when the screen redraws.

import { textEditId, textEditsFor, type TextEdit } from "./textLayout";

const SHEET = "[data-format-id]";
// [data-bind]: a record's own value — on its box, and on the words a locked sheet shows (engine/roundTrip/bindPath.ts).
const SKIP = "input, textarea, select, option, button, script, style, svg, .no-print, [contenteditable], [data-bind], [data-ix-skip], [data-ix-shadow]";

interface Seen {
  /** The words as the screen drew them. */
  orig: string;
  /** The node's own text as drawn, spaces and all (what an undone change puts back). */
  raw: string;
  /** What the node shows now (after the change). */
  shown: string;
  span?: HTMLSpanElement;
  /** The parent's own text-align before the change (restored when the change is undone). */
  alignWas?: string;
  alignEl?: HTMLElement;
}

const seen = new WeakMap<Text, Seen>();
const touched = new Set<Text>();
const norm = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Changes being tried out in the designer, shown in place of the saved ones (null = none). */
let trying: { documentId: string; edits: TextEdit[] } | null = null;

/**
 * The place on the sheet: each element from the sheet down to the words, by tag. Not by class: a sheet's classes
 * differ between the blank format, a record being filled, a signed one and the other language, and the change made on
 * one must be found on all of them. (What a record holds is never a printed word — SKIP — so it cannot be mistaken.)
 */
export function pathOf(sheet: Element, el: Element): string {
  const parts: string[] = [];
  for (let e: Element | null = el; e && e !== sheet; e = e.parentElement) parts.push(e.tagName.toLowerCase());
  return parts.reverse().join(">");
}

export interface PrintedWord {
  node: Text;
  orig: string;
  path: string;
  occ: number;
  id: string;
}

/** The words a sheet prints that may be changed, in the order they stand, each known by words, place and number. */
export function printedWords(sheet: Element): PrintedWord[] {
  const out: PrintedWord[] = [];
  const counts = new Map<string, number>();
  const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const parent = (n as Text).parentElement;
      if (!parent || parent.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      // A sheet inside this one (a format shown within another) is its own.
      if (parent.closest(SHEET) !== sheet) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const s = seen.get(n);
    // The node was changed by us and still shows the change: its words are the ones it was drawn with.
    const orig = s && n.nodeValue === s.shown ? s.orig : norm(n.nodeValue ?? "");
    if (s && n.nodeValue !== s.shown) forget(n);
    if (!orig) continue;
    const path = pathOf(sheet, n.parentElement!);
    const k = `${path}|${orig}`;
    const occ = counts.get(k) ?? 0;
    counts.set(k, occ + 1);
    out.push({ node: n, orig, path, occ, id: textEditId({ orig, path, occ }) });
  }
  return out;
}

/** Back as the screen drew it. */
function restore(n: Text): void {
  const s = seen.get(n);
  if (!s) return;
  if (n.nodeValue === s.shown) n.nodeValue = s.raw;
  forget(n);
}

function forget(n: Text): void {
  const s = seen.get(n);
  if (s) {
    s.span?.remove();
    if (s.alignEl) s.alignEl.style.textAlign = s.alignWas ?? "";
  }
  seen.delete(n);
  touched.delete(n);
}

function apply(word: PrintedWord, e: TextEdit): void {
  const n = word.node;
  const prev = seen.get(n);
  const words = e.text ?? word.orig;
  const styled = !!(e.dx || e.dy || e.bold || (e.size && e.size !== 100));
  const s: Seen = prev ?? { orig: word.orig, raw: n.nodeValue ?? "", shown: n.nodeValue ?? "" };
  if (styled) {
    let span = s.span;
    if (!span || !span.isConnected) {
      span = document.createElement("span");
      span.setAttribute("data-ix-shadow", "");
      span.setAttribute("translate", "no");
      n.parentNode?.insertBefore(span, n.nextSibling);
      s.span = span;
    }
    if (span.textContent !== words) span.textContent = words;
    span.style.position = e.dx || e.dy ? "relative" : "";
    span.style.left = e.dx ? `${e.dx}px` : "";
    span.style.top = e.dy ? `${e.dy}px` : "";
    span.style.fontWeight = e.bold ? "700" : "";
    span.style.fontSize = e.size && e.size !== 100 ? `${e.size}%` : "";
    span.style.whiteSpace = "pre-wrap";
    if (n.nodeValue !== "") n.nodeValue = "";
    s.shown = "";
  } else {
    if (s.span) {
      s.span.remove();
      s.span = undefined;
    }
    const lead = /^\s*/.exec(s.raw)?.[0] ?? "";
    const trail = /\s*$/.exec(s.raw)?.[0] ?? "";
    const next = e.text === undefined ? s.raw : lead + e.text + trail;
    if (n.nodeValue !== next) n.nodeValue = next;
    s.shown = next;
  }
  const parent = n.parentElement;
  if (e.align && parent) {
    if (!s.alignEl) {
      s.alignEl = parent;
      s.alignWas = parent.style.textAlign;
    }
    parent.style.textAlign = e.align;
  } else if (s.alignEl) {
    s.alignEl.style.textAlign = s.alignWas ?? "";
    s.alignEl = undefined;
  }
  seen.set(n, s);
  touched.add(n);
}

/** Lays `edits` over one sheet; the words no longer changed go back as drawn. */
export function applyToSheet(sheet: HTMLElement, edits: readonly TextEdit[]): void {
  const byId = new Map(edits.map((e) => [textEditId(e), e]));
  const done = new Set<Text>();
  if (byId.size) {
    for (const w of printedWords(sheet)) {
      const e = byId.get(w.id);
      if (!e) continue;
      apply(w, e);
      done.add(w.node);
    }
  }
  for (const n of [...touched]) {
    if (done.has(n)) continue;
    if (!n.isConnected) {
      forget(n);
      continue;
    }
    if (sheet.contains(n)) restore(n);
  }
}

function editsOfSheet(sheet: HTMLElement): TextEdit[] {
  const id = sheet.getAttribute("data-format-id") ?? "";
  if (trying && trying.documentId === id) return trying.edits;
  return textEditsFor(id, sheet.getAttribute("data-format-asof") || undefined);
}

let observer: MutationObserver | null = null;
let queued = false;
let applying = false;

/** Lays the changes over every sheet on the screen now. */
export function refreshPaperText(): void {
  if (typeof document === "undefined") return;
  applying = true;
  try {
    const sheets = Array.from(document.querySelectorAll<HTMLElement>(SHEET));
    for (const sheet of sheets) {
      const edits = editsOfSheet(sheet);
      if (edits.length || [...touched].some((n) => sheet.contains(n))) applyToSheet(sheet, edits);
    }
    for (const n of [...touched]) if (!n.isConnected) forget(n);
  } finally {
    observer?.takeRecords();
    applying = false;
  }
}

function queue(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    refreshPaperText();
  });
}

/** Started once by the app: every sheet drawn, now or later, gets its format's changes. */
export function startPaperTextLayer(): () => void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined" || observer) return () => undefined;
  observer = new MutationObserver((records) => {
    if (applying) return;
    for (const r of records) {
      const t = r.target.nodeType === 1 ? (r.target as Element) : r.target.parentElement;
      if (!t) continue;
      if (t.closest(SHEET) || (r.type === "childList" && Array.from(r.addedNodes).some((a) => a.nodeType === 1 && ((a as Element).matches(SHEET) || (a as Element).querySelector(SHEET))))) {
        queue();
        return;
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  // The index changed (saved here, or synced from another computer): lay the new changes over.
  const onStorage = () => queue();
  window.addEventListener("storage", onStorage);
  window.addEventListener("dcrs:index-text", onStorage);
  queue();
  return () => {
    observer?.disconnect();
    observer = null;
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("dcrs:index-text", onStorage);
  };
}

/** The designer's changes, shown on the sheet before they are saved (null: back to the saved ones). */
export function tryTextEdits(documentId: string | null, edits: TextEdit[] = []): void {
  trying = documentId ? { documentId, edits } : null;
  refreshPaperText();
}

/** The word a node belongs to (the node itself, or the span showing it), on its sheet. */
export function wordAt(target: Node): { sheet: HTMLElement; word: PrintedWord } | null {
  let node: Node | null = target;
  // A styled / moved word is shown by its span: the word is the emptied original before it.
  const shadow = (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest("[data-ix-shadow]");
  if (shadow) {
    for (const [n, s] of touchedEntries()) if (s.span === shadow) node = n;
  }
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
  const sheet = el?.closest<HTMLElement>(SHEET);
  if (!sheet) return null;
  const words = printedWords(sheet);
  if (node.nodeType === 3) {
    const w = words.find((x) => x.node === node);
    return w ? { sheet, word: w } : null;
  }
  // An element was clicked: its own first word.
  const w = words.find((x) => (node as Element).contains(x.node));
  return w ? { sheet, word: w } : null;
}

function* touchedEntries(): Generator<[Text, Seen]> {
  for (const n of touched) {
    const s = seen.get(n);
    if (s) yield [n, s];
  }
}

/** The element showing a word now (its span when styled or moved, else its parent) — what the designer outlines. */
export function shownElementOf(node: Text): HTMLElement | null {
  const s = seen.get(node);
  if (s?.span?.isConnected) return s.span;
  return node.parentElement;
}
