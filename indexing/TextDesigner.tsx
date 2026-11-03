// TEXT & LAYOUT: EVERY FORMAT FULLY EDITABLE FROM THE INDEX, ITS WORDS MOVABLE (the owner, 30-Oct-2026).
//
// Indexing → a format → "Text & layout" opens the format's own sheet with this panel over it. The super admin clicks
// any printed word on the sheet — a heading, a label, a line of the instructions, the company name, a column title —
// and changes it: new words, hidden, bold, bigger or smaller, lined up left / centre / right, or dragged (or nudged
// with the arrows) to where it should sit. Every change shows on the sheet at once; nothing is kept until Save, which
// saves it as the next index version (who, when, why, each word changed) — compared, restored and reset from the
// Versions tab like any other. A signed record keeps the words it was signed with (indexing/textLayout.ts).
//
// It works on whatever sheet of the format is on the screen (data-format-id), so it is the same for a log sheet, a
// certificate, a complaint checklist or a pest control register. What is typed into a record is never a printed word,
// and is never offered.
//
// TextLayerHost is mounted once by App for everybody: it starts the layer that lays the saved changes over every sheet
// (indexing/paperTextLayer.ts), and shows this panel to the super admin while a design is open.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiAlignCenter, FiAlignLeft, FiAlignRight, FiArrowDown, FiArrowLeft, FiArrowRight, FiArrowUp, FiBold, FiEyeOff, FiRotateCcw, FiSave, FiX } from "react-icons/fi";
import { useAuth } from "../frontend/src/store/AuthContext";
import { useAppStore } from "../frontend/src/store/AppStore";
import { useRouter } from "../frontend/src/store/router";
import { documentRepository } from "../frontend/src/data/repositories/documentRepository";
import { recordRepository } from "../frontend/src/data/repositories/recordRepository";
import { routeForRecord } from "../frontend/src/engine/reminders";
import type { DocumentDefinition } from "../frontend/src/types";
import { cleanEdits, describeTextEdit, isEmptyEdit, sameEdits, textEditId, textEditsFor, type TextAlign, type TextEdit } from "./textLayout";
import { printedWords, refreshPaperText, shownElementOf, startPaperTextLayer, tryTextEdits, wordAt, type PrintedWord } from "./paperTextLayer";
import { emptyDraft, saveIndexDraft } from "./indexActions";

const SESSION_KEY = "dcrs:text-design";
const EVENT = "dcrs:text-design";

/** The format whose words are being designed (null: none). */
function designing(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** Where a format's sheet is drawn: a log sheet's own page shows it blank; the others, on a record of theirs. */
export function pageOfFormat(doc: DocumentDefinition): string {
  switch (doc.kind) {
    case "log-sheet":
      return `/document/${doc.id}`;
    case "chemical-master":
      return "/chemical-master";
    case "licence":
      return "/licence";
    case "compliance-statement":
      return `/soc/${doc.id}`;
    default: {
      const latest = recordRepository
        .queryUnscoped({ documentId: doc.id })
        .slice()
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
      return latest ? routeForRecord(doc, latest.id) : `/document/${doc.id}`;
    }
  }
}

/** Opens the format's sheet with the text & layout panel over it. */
export function startTextDesign(doc: DocumentDefinition, navigate: (to: string) => void): void {
  try {
    sessionStorage.setItem(SESSION_KEY, doc.id);
  } catch {
    /* the panel still opens for this screen */
  }
  window.dispatchEvent(new Event(EVENT));
  navigate(pageOfFormat(doc));
}

function stopTextDesign(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing kept */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Mounted once by App. */
export function TextLayerHost() {
  const { version } = useAppStore();
  const { user } = useAuth();
  const [docId, setDocId] = useState<string | null>(() => designing());
  useEffect(() => startPaperTextLayer(), []);
  // The index may have changed (saved, synced from another computer): lay the changes over again.
  useEffect(() => refreshPaperText(), [version]);
  useEffect(() => {
    const on = () => setDocId(designing());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  if (!docId || user?.role !== "admin") return null;
  return (
    <>
      <style>{CSS_TEXT}</style>
      <TextDesigner key={docId} documentId={docId} actor={user?.name ?? "Super Admin"} />
    </>
  );
}

export const CSS_TEXT = `
.ix-text-panel { position: fixed; right: 16px; bottom: 16px; z-index: 900; width: min(360px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.18); padding: 12px; font-size: 13px; }
.ix-text-panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
.ix-text-panel textarea, .ix-text-panel input { width: 100%; }
.ix-text-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 6px; }
.ix-text-foot { border-top: 1px solid var(--color-border); margin-top: 10px; padding-top: 8px; }
.ix-text-list { max-height: 140px; overflow: auto; margin: 4px 0 0; padding-left: 16px; }
.ix-text-list .link-button { background: none; border: 0; padding: 0; color: var(--color-primary); cursor: pointer; text-decoration: underline; font: inherit; }
[data-ix-designing] { cursor: pointer; outline: 2px dashed var(--color-info); outline-offset: 4px; }
[data-ix-designing] * { cursor: pointer !important; }
.ix-text-selected { outline: 2px solid var(--color-primary) !important; outline-offset: 1px; background: color-mix(in srgb, var(--color-primary) 12%, transparent); cursor: move !important; }
@media print { .ix-text-selected { outline: none !important; background: none !important; } [data-ix-designing] { outline: none; } }
`;

export function TextDesigner({ documentId, actor }: { documentId: string; actor: string }) {
  const { bump } = useAppStore();
  const { navigate } = useRouter();
  const doc = useMemo(() => documentRepository.getByIdUnscoped(documentId), [documentId]);
  const saved = useMemo(() => textEditsFor(documentId), [documentId]);
  const [edits, setEdits] = useState<TextEdit[]>(saved);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<HTMLElement | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedNow, setSavedNow] = useState<TextEdit[]>(saved);
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const dirty = !sameEdits(edits, savedNow);

  // Show the changes on the sheet as they are made.
  useEffect(() => {
    tryTextEdits(documentId, cleanEdits(edits));
  }, [documentId, edits, sheet]);
  useEffect(() => () => tryTextEdits(null), []);

  // Find the format's sheet on the screen (it comes and goes with the page).
  useEffect(() => {
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-format-id="${CSS.escape(documentId)}"]`);
      setSheet((prev) => (prev === el ? prev : el));
    };
    find();
    const t = window.setInterval(find, 600);
    return () => window.clearInterval(t);
  }, [documentId]);

  useEffect(() => {
    if (!sheet) return;
    sheet.setAttribute("data-ix-designing", "");
    return () => sheet.removeAttribute("data-ix-designing");
  }, [sheet]);

  const wordById = useCallback((id: string | null): PrintedWord | null => (sheet && id ? (printedWords(sheet).find((w) => w.id === id) ?? null) : null), [sheet]);

  const update = useCallback((word: { orig: string; path: string; occ: number }, change: Partial<TextEdit>) => {
    setEdits((list) => {
      const id = textEditId(word);
      const now = list.find((e) => textEditId(e) === id) ?? { orig: word.orig, path: word.path, occ: word.occ };
      const next = { ...now, ...change };
      const rest = list.filter((e) => textEditId(e) !== id);
      return isEmptyEdit(next) ? rest : [...rest, next];
    });
    setMessage(null);
  }, []);

  // Outline the chosen word.
  useEffect(() => {
    if (!sheet || !selected) return;
    const w = wordById(selected);
    const el = w ? shownElementOf(w.node) : null;
    el?.classList.add("ix-text-selected");
    return () => el?.classList.remove("ix-text-selected");
  });

  // Clicks on the sheet choose a word (and do nothing else: no box opens, no button fires); a chosen word is dragged.
  useEffect(() => {
    if (!sheet) return;
    let drag: { word: PrintedWord; x: number; y: number; dx: number; dy: number; moved: boolean } | null = null;
    const pick = (e: MouseEvent | PointerEvent): { word: PrintedWord } | null => {
      const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null; caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null };
      const hit = doc.caretPositionFromPoint?.(e.clientX, e.clientY)?.offsetNode ?? doc.caretRangeFromPoint?.(e.clientX, e.clientY)?.startContainer;
      const fromCaret = hit && hit.nodeType === 3 && sheet.contains(hit) ? wordAt(hit) : null;
      const found = fromCaret ?? wordAt(e.target as Node);
      return found && found.sheet === sheet ? { word: found.word } : null;
    };
    const inSheet = (e: Event) => e.target instanceof Node && sheet.contains(e.target);
    const down = (e: PointerEvent) => {
      if (!inSheet(e) || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const found = pick(e);
      if (!found) return;
      setSelected(found.word.id);
      const now = editsRef.current.find((x) => textEditId(x) === found.word.id);
      drag = { word: found.word, x: e.clientX, y: e.clientY, dx: now?.dx ?? 0, dy: now?.dy ?? 0, moved: false };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.moved = true;
      e.preventDefault();
      update(drag.word, { dx: drag.dx + dx, dy: drag.dy + dy });
    };
    const up = () => {
      drag = null;
    };
    const swallow = (e: Event) => {
      if (!inSheet(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    for (const t of ["mousedown", "click", "dblclick", "focusin", "keydown", "change", "input"]) document.addEventListener(t, swallow, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      for (const t of ["mousedown", "click", "dblclick", "focusin", "keydown", "change", "input"]) document.removeEventListener(t, swallow, true);
    };
  }, [sheet, update]);

  const word = wordById(selected);
  const edit = word ? (edits.find((e) => textEditId(e) === word.id) ?? null) : null;
  const shownText = edit?.text ?? word?.orig ?? "";
  const nudge = (dx: number, dy: number, big: boolean) => {
    if (!word) return;
    const step = big ? 10 : 1;
    update(word, { dx: (edit?.dx ?? 0) + dx * step, dy: (edit?.dy ?? 0) + dy * step });
  };

  const exit = () => {
    if (dirty && !window.confirm("Leave Text & layout without saving? The changes not saved are dropped.")) return;
    tryTextEdits(null);
    stopTextDesign();
  };

  const save = () => {
    const result = saveIndexDraft({ ...emptyDraft(), texts: { [documentId]: cleanEdits(edits) } }, reason, actor, "text & layout");
    if (!result.ok) {
      setMessage({ ok: false, text: result.error });
      return;
    }
    setSavedNow(cleanEdits(edits));
    setReason("");
    setMessage({ ok: true, text: `Saved as Indexing version ${result.versionNo} (${result.changes.length} change${result.changes.length === 1 ? "" : "s"}).` });
    window.dispatchEvent(new Event("dcrs:index-text"));
    bump();
  };

  const changed = cleanEdits(edits);
  const title = doc ? `${doc.formatNo} ${doc.name}` : documentId;

  return (
    <div className="ix-text-panel no-print" data-ix-skip role="dialog" aria-label="Text and layout">
      <div className="ix-text-panel-head">
        <div>
          <div className="font-semibold">Text &amp; layout</div>
          <div className="text-xs text-muted" translate="no">
            {title}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={exit} title="Close Text & layout" aria-label="Close">
          <FiX size={14} />
        </button>
      </div>

      {!sheet ? (
        <div className="text-sm">
          <p className="mb-2">This format's sheet isn't on this screen.</p>
          {doc && (
            <button className="btn btn-secondary btn-sm" onClick={() => navigate(pageOfFormat(doc))}>
              Open the format
            </button>
          )}
        </div>
      ) : !word ? (
        <p className="text-sm text-muted">Click any printed word on the sheet to change it. Drag a chosen word to move it.</p>
      ) : (
        <div className="ix-text-edit">
          <div className="text-xs text-muted mb-1">
            As issued: <span translate="no">“{word.orig}”</span>
          </div>
          <textarea className="input" rows={2} value={shownText} translate="no" onChange={(e) => update(word, { text: e.target.value })} aria-label="The words" />
          <div className="ix-text-tools">
            {(["left", "center", "right"] as TextAlign[]).map((a) => (
              <button key={a} className={`btn btn-sm ${edit?.align === a ? "btn-primary" : "btn-secondary"}`} title={`Line up ${a === "center" ? "in the centre" : `on the ${a}`}`} onClick={() => update(word, { align: edit?.align === a ? undefined : a })}>
                {a === "left" ? <FiAlignLeft size={12} /> : a === "center" ? <FiAlignCenter size={12} /> : <FiAlignRight size={12} />}
              </button>
            ))}
            <button className={`btn btn-sm ${edit?.bold ? "btn-primary" : "btn-secondary"}`} title="Bold" onClick={() => update(word, { bold: !edit?.bold })}>
              <FiBold size={12} />
            </button>
            <button className="btn btn-secondary btn-sm" title="Smaller" onClick={() => update(word, { size: Math.max(50, (edit?.size ?? 100) - 10) })}>
              A−
            </button>
            <span className="text-xs">{edit?.size ?? 100}%</span>
            <button className="btn btn-secondary btn-sm" title="Bigger" onClick={() => update(word, { size: Math.min(250, (edit?.size ?? 100) + 10) })}>
              A+
            </button>
            <button className={`btn btn-sm ${edit?.text === "" ? "btn-primary" : "btn-secondary"}`} title="Hide these words on the format" onClick={() => update(word, { text: edit?.text === "" ? undefined : "" })}>
              <FiEyeOff size={12} />
            </button>
          </div>
          <div className="ix-text-tools">
            <span className="text-xs text-muted">Move (Shift = 10px):</span>
            <button className="btn btn-secondary btn-sm" title="Left" onClick={(e) => nudge(-1, 0, e.shiftKey)}>
              <FiArrowLeft size={12} />
            </button>
            <button className="btn btn-secondary btn-sm" title="Up" onClick={(e) => nudge(0, -1, e.shiftKey)}>
              <FiArrowUp size={12} />
            </button>
            <button className="btn btn-secondary btn-sm" title="Down" onClick={(e) => nudge(0, 1, e.shiftKey)}>
              <FiArrowDown size={12} />
            </button>
            <button className="btn btn-secondary btn-sm" title="Right" onClick={(e) => nudge(1, 0, e.shiftKey)}>
              <FiArrowRight size={12} />
            </button>
            <span className="text-xs">
              {edit?.dx ?? 0}, {edit?.dy ?? 0}px
            </span>
          </div>
          {edit && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEdits((l) => l.filter((e) => textEditId(e) !== word.id))}>
              <FiRotateCcw size={12} /> These words back as issued
            </button>
          )}
        </div>
      )}

      <div className="ix-text-foot">
        <div className="text-xs text-muted mb-1">
          {changed.length} word{changed.length === 1 ? "" : "s"} changed on this format{dirty ? " — not saved yet" : ""}
        </div>
        {changed.length > 0 && (
          <ul className="ix-text-list text-xs" translate="no">
            {changed.map((e) => (
              <li key={textEditId(e)}>
                <button className="link-button" onClick={() => setSelected(textEditId(e))}>
                  “{e.orig}”
                </button>{" "}
                {describeTextEdit(e)}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 wrap mt-2">
          <button className="btn btn-ghost btn-sm" disabled={!dirty} onClick={() => setEdits(savedNow)}>
            Undo unsaved
          </button>
          <button className="btn btn-ghost btn-sm" disabled={changed.length === 0} onClick={() => setEdits([])} title="Every word of this format back as issued (saved as a version when you press Save)">
            All as issued
          </button>
        </div>
        {dirty && (
          <div className="mt-2">
            <input className="input" placeholder="Why the words are changing (kept with the version)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn btn-primary btn-sm mt-2" onClick={save} disabled={!reason.trim()}>
              <FiSave size={12} /> Save as an Indexing version
            </button>
          </div>
        )}
        {message && (
          <div className={`text-xs mt-2 ${message.ok ? "text-success" : "text-danger"}`} role="status">
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
