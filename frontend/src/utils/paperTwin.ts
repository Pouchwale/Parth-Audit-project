import { flushSync } from "react-dom";
import { recordRepository } from "../data/repositories/recordRepository";
import { paperTableFor } from "../data/seed/qcPaperTables";
import { paperWordEdits } from "./originalFill/paperWords";

// AN HR PAPER DOWNLOADS FROM ITS RECORD'S BOXES (REQUIREMENTS §275). The HR formats are drawn on the screen as the company's
// own papers: a scale ticked across seven cells, a Yes and a No column, a box inside a sentence. The filler of the company's
// Word and Excel files (utils/originalFill) reads a record's boxes and grids as the plain sheet draws them, so for the moment
// of a download the record's plain sheet is drawn off the screen, read, and taken away. Nobody ever sees it.

type Show = (on: boolean) => void;
const twins = new Map<string, Show>();

export const PLAIN_TWIN_ATTR = "data-plain-twin";

/** A paper on the screen says how to draw its plain sheet. Returns how to take that back. */
export function registerPaperTwin(recordId: string, show: Show): () => void {
  twins.set(recordId, show);
  return () => {
    if (twins.get(recordId) === show) twins.delete(recordId);
  };
}

const nextFrame = (): Promise<void> => new Promise((resolve) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => resolve()) : setTimeout(resolve, 16)));

/** Runs `read` on the plain sheets of the papers among `roots` (every other root as it is), then takes them away. */
export async function withPlainTwins<T>(roots: Element[], read: (roots: Element[]) => Promise<T>): Promise<T> {
  const shown: { show: Show; id: string; root: Element }[] = [];
  for (const root of roots) {
    const el = root.matches(".paper-table-sheet[data-bind-record]") ? root : root.querySelector(".paper-table-sheet[data-bind-record]");
    const id = el?.getAttribute("data-bind-record");
    const show = id ? twins.get(id) : undefined;
    if (id && show) shown.push({ show, id, root });
  }
  if (shown.length === 0) return read(roots);
  try {
    flushSync(() => {
      for (const s of shown) s.show(true);
    });
    await nextFrame();
    const swapped = roots.map((root) => {
      const s = shown.find((x) => x.root === root);
      return (s && document.querySelector(`[${PLAIN_TWIN_ATTR}="${CSS.escape(s.id)}"]`)) || root;
    });
    // (the paper's own name for the company, in a file made from the plain sheet where the company has no such file)
    for (const el of swapped) {
      if (!el.hasAttribute(PLAIN_TWIN_ATTR)) continue;
      // ...and the words this record typed over on its paper, in that file too
      const id = el.getAttribute(PLAIN_TWIN_ATTR) ?? "";
      const record = recordRepository.getById(id);
      const headings = (record?.data as { words?: { headings?: Record<string, string> } } | undefined)?.words?.headings;
      const edits = record ? paperWordEdits(paperTableFor(record.documentId), headings) : [];
      const key = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) {
        const n = walk.currentNode;
        const typed = edits.find((e) => key(e.from) === key(n.textContent ?? ""));
        if (typed) n.textContent = typed.to;
        if (/PUBLICATIONS\s+PVT\.?\s+LTD/i.test(n.textContent ?? "")) n.textContent = (n.textContent ?? "").replace(/PUBLICATIONS\s+PVT\.?\s+LTD\.?/i, "PUBLICATION PRIVATE LIMITED");
      }
    }
    return await read(swapped);
  } finally {
    flushSync(() => {
      for (const s of shown) s.show(false);
    });
  }
}
