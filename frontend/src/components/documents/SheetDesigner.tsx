import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FiArrowDown, FiArrowLeft, FiArrowRight, FiArrowUp, FiCheckCircle, FiChevronDown, FiCopy, FiCornerUpLeft, FiCornerUpRight, FiPlus, FiSave, FiSliders, FiTrash2, FiX } from "react-icons/fi";
import type { DocumentDefinition, LogColumn, LogFieldType, LogHeaderField, LogSheetLayout } from "../../types";
import { Modal } from "../common/Modal";
import { DocumentHeader } from "./DocumentHeader";
import { FormatEditor } from "./FormatEditor";
import { getLogSheetLayout } from "../../data/seed/logSheetLayouts";
import { nextRevisionNo, type FormatRevision } from "../../data/formatEdits";
import { closeDesignSession, openDesignSession } from "../../engine/designSession";
import { setLeaveGuard } from "../../store/router";
import {
  FIELD_TYPE_LABELS,
  addBox,
  addColumn,
  addPrintedRow,
  commitFormatChange,
  copyLabel,
  describeFormatChange,
  draftOf,
  duplicateBox,
  duplicateColumn,
  duplicatePrintedRow,
  moveBox,
  moveColumn,
  movePrintedRow,
  printedRowsOf,
  removeBox,
  removeColumn,
  removePrintedRow,
  renameBox,
  renameColumn,
  setBoxType,
  setColumnRequired,
  setColumnType,
  setInstructions,
  setPrintedCell,
  type BoxArea,
  type FormatDraft,
  type NewItemOptions,
  type PrintedRow,
} from "../../engine/formatOps";
import { formatDisplayDate } from "../../utils/date";
import { useProgressiveCount } from "../../utils/useProgressive";

// DESIGN A FORMAT ON THE SHEET ITSELF, THE WAY A SPREADSHEET IS EDITED
// (REQUIREMENTS §64).
//
// "Edit format" used to open a dialog of lists. A person who wants another
// column beside Remarks should not have to find Remarks in a list: they should
// see the sheet, press the arrow on the Remarks heading and say "insert column
// to the right" — and type its name where it appeared. So this draws the sheet
// as it prints — the header block, the printed instructions, the boxes above
// the grid, the grid, the boxes below — with every name on it editable in place
// and a small menu on every heading, every box and every printed line.
//
// IT DRAWS ITS OWN SHEET. LogSheetRecordView is the view every record on file
// is read and written through; design controls threaded through it would be
// paid for by every record on every page. The class names are the same, so the
// two look the same.
//
// IT WORKS ON A DRAFT, with the pure operations of engine/formatOps.ts and
// nothing else, and saves the one way a format change is saved
// (commitFormatChange): the next revision, dated, with who changed what and
// why, and one line in the activity log. Undo and redo are a stack of drafts.
// Nothing reaches the stored format — or a record — until Save.
//
// WHAT A CHANGE DOES TO RECORDS ALREADY ON FILE: nothing (REQUIREMENTS §62).
// Every pop-up that deletes something says so in plain words.
//
// While it is open it is registered with engine/designSession.ts, so a change
// TOLD TO MITRA lands on this draft, in front of the person, as one more
// undoable step — not behind the draft's back.
//
// THE NAMES ON THE SHEET READ AS STORED, in either language (REQUIREMENTS §58).
// On a record a heading follows the language chosen; here it is the very value
// being typed over, and a heading shown in Gujarati that turned into its stored
// English the moment it was clicked would be a different thing from the one the
// person chose to change. So the names, the printed cells and the change lists
// carry translate="no"; the toolbar, the hints and the pop-ups' own sentences
// follow the language like the rest of the app.

const HISTORY_CAP = 100;
const TYPES = Object.keys(FIELD_TYPE_LABELS) as LogFieldType[];

/** Undo and redo: the drafts before this one, this one, and the ones stepped back from. */
interface DraftHistory {
  past: FormatDraft[];
  present: FormatDraft;
  future: FormatDraft[];
}

/** What a menu is open on — and, for a delete, what is being deleted. */
type ItemTarget = { kind: "column"; key: string } | { kind: "box"; area: BoxArea; key: string } | { kind: "line"; index: number };

/** What is being renamed in place. */
type RenameTarget = { kind: "name" } | { kind: "instructions" } | { kind: "column"; key: string } | { kind: "box"; area: BoxArea; key: string };

type Dialog =
  | { kind: "delete"; target: ItemTarget }
  | { kind: "save" }
  | { kind: "saved"; revision: FormatRevision; changes: string[] }
  /** `then`: where the person was going when the sheet asked (store/router.tsx setLeaveGuard). */
  | { kind: "discard"; then?: () => void }
  | { kind: "more" };

const sameTarget = (a: ItemTarget, b: ItemTarget): boolean =>
  a.kind === "line" ? b.kind === "line" && a.index === b.index : a.kind === b.kind && a.key === (b as { key: string }).key;

/** The button a menu hangs from. Found again on every change, because a moved line's button is a different one. */
const anchorSelector = (t: ItemTarget): string =>
  t.kind === "line" ? `[data-action="line-menu"][data-line="${t.index}"]` : `[data-action="${t.kind}-menu"][data-${t.kind}="${CSS.escape(t.key)}"]`;

const boxesOf = (layout: LogSheetLayout, area: BoxArea): LogHeaderField[] => (area === "header" ? layout.headerFields : (layout.footerFields ?? []));

/** formatOps marks a COLUMN required; a box is marked the same way, and only the sheet offers it on its own. */
function setBoxRequired(layout: LogSheetLayout, area: BoxArea, key: string, required: boolean): LogSheetLayout {
  const boxes = boxesOf(layout, area).map((b) => (b.key === key ? { ...b, required: required || undefined } : b));
  return area === "header" ? { ...layout, headerFields: boxes } : { ...layout, footerFields: boxes };
}

/** "New column", then "New column (2)" — so two added in a row can be told apart before they are named. */
const freshLabel = (label: string, labels: string[]): string => (labels.includes(label) ? copyLabel(label, labels) : label);

// A key is never reused, not even across revisions: formatOps' newKey puts the
// moment a thing was added into its key, so every column this sheet adds under
// the placeholder "New column" still gets a key of its own (REQUIREMENTS §64).
const addColumnNamed = addColumn;
const addBoxNamed = addBox;

const copyOfColumn = duplicateColumn;
const copyOfBox = duplicateBox;

const countLabel = (n: number): string => `${n} change${n === 1 ? "" : "s"}`;

const inTextBox = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

export function SheetDesigner({
  doc,
  actor,
  onSaved,
  onExit,
}: {
  doc: DocumentDefinition;
  actor: string;
  /** The stored format has just changed: the page around the sheet reads it again. */
  onSaved: () => void;
  /** Design mode is over — saved, discarded, or handed to the dialog which saved. */
  onExit: () => void;
}) {
  const stored = getLogSheetLayout(doc.id);
  // The format as it is on file: what the draft is compared with, and what Save is measured against.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const base = useMemo(() => draftOf(doc), [doc.id, doc.name, stored]);

  const [history, setHistory] = useState<DraftHistory>(() => ({ past: [], present: draftOf(doc), future: [] }));
  // Every change reads the draft from here, not from the render it was made in:
  // a rename committed by the same click that adds a column — or two changes
  // Mitra applies one after the other — must each build on the one before.
  const live = useRef(history);
  const commit = useCallback((next: DraftHistory) => {
    live.current = next;
    setHistory(next);
  }, []);

  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  const [menu, setMenu] = useState<ItemTarget | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [focusCell, setFocusCell] = useState<{ index: number; key: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const put = useCallback(
    (next: FormatDraft) => {
      const h = live.current;
      if (next === h.present) return;
      commit({ past: [...h.past, h.present].slice(-HISTORY_CAP), present: next, future: [] });
    },
    [commit]
  );
  const putLayout = useCallback(
    (change: (layout: LogSheetLayout) => LogSheetLayout) => {
      const d = live.current.present;
      if (d.layout) put({ ...d, layout: change(d.layout) });
    },
    [put]
  );
  // What was being renamed, or had a menu open, may not be on the sheet after a step back.
  const undo = useCallback(() => {
    const h = live.current;
    if (h.past.length === 0) return;
    setRenaming(null);
    setMenu(null);
    commit({ past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] });
  }, [commit]);
  const redo = useCallback(() => {
    const h = live.current;
    if (h.future.length === 0) return;
    setRenaming(null);
    setMenu(null);
    commit({ past: [...h.past, h.present].slice(-HISTORY_CAP), present: h.future[0], future: h.future.slice(1) });
  }, [commit]);

  const noticeTimer = useRef<number | undefined>(undefined);
  const flash = useCallback((text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 6000);
  }, []);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  // A change told to Mitra while the sheet is open is made HERE (engine/designSession.ts).
  useEffect(() => {
    openDesignSession({
      documentId: doc.id,
      getDraft: () => live.current.present,
      apply: (next, what) => {
        // What a menu was open on — or a pop-up was asking about: a line is known
        // by its number — may be the very thing Mitra was told to delete or move.
        setMenu(null);
        setDialog((d) => (d?.kind === "delete" ? null : d));
        put(next);
        flash(what);
      },
    });
    return () => closeDesignSession(doc.id);
  }, [doc.id, put, flash]);

  const draft = history.present;
  const layout = draft.layout;
  const changes = useMemo(() => describeFormatChange(base, draft), [base, draft]);
  const dirty = changes.length > 0;

  // Closing the tab or reloading with changes on the sheet asks first.
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chromium before 119 asks only when this is set.
      e.returnValue = true;
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  // So does going anywhere else in the app — the sidebar, a Back button, Mitra opening a page.
  useEffect(() => {
    if (!dirty) return;
    return setLeaveGuard((go) => {
      setMenu(null);
      setRenaming(null);
      setDialog({ kind: "discard", then: go });
    });
  }, [dirty]);

  // Ctrl+Z / Ctrl+Y belong to the sheet — except inside a text box, where they
  // are the box's own, and under a pop-up, which has the floor.
  const dialogOpen = useRef(false);
  dialogOpen.current = dialog !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      // A key press a browser's autofill makes up carries no `key` at all.
      const key = (e.key ?? "").toLowerCase();
      if ((key !== "z" && key !== "y") || inTextBox(e.target) || dialogOpen.current) return;
      e.preventDefault();
      if (key === "y" || e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const closeMenu = useCallback(() => setMenu(null), []);
  const toggleMenu = useCallback((t: ItemTarget) => setMenu((m) => (m && sameTarget(m, t) ? null : t)), []);
  const toggleLineMenu = useCallback((index: number) => toggleMenu({ kind: "line", index }), [toggleMenu]);
  const setCell = useCallback((index: number, key: string, value: string) => putLayout((l) => setPrintedCell(l, index, key, value)), [putLayout]);
  const clearFocusCell = useCallback(() => setFocusCell(null), []);

  const printed = layout ? printedRowsOf(layout) : null;
  // A long printed list shows its first lines at once and the rest a batch at a time (REQUIREMENTS §56).
  const linesShown = useProgressiveCount(printed?.length ?? 0, 25, 40);

  if (!layout) {
    return (
      <div className="empty-state" data-section="sheet-designer" data-document={doc.id}>
        <p className="mb-3">This form is drawn by the program itself, so there is no sheet of it to design here.</p>
        <button className="btn btn-secondary btn-sm" data-action="designer-discard" onClick={onExit}>
          Leave design mode
        </button>
      </div>
    );
  }

  // ---- what a person does on the sheet -----------------------------------
  // Whatever is added arrives with a placeholder name already selected, so the
  // person just types what it is called.

  const insertColumn = (where?: { afterKey?: string; beforeKey?: string }) => {
    const d = live.current.present;
    if (!d.layout) return;
    const added = addColumnNamed(d.layout, freshLabel("New column", d.layout.columns.map((c) => c.label)), where);
    put({ ...d, layout: added.layout });
    setMenu(null);
    setRenaming({ kind: "column", key: added.key });
  };
  const copyColumn = (key: string) => {
    const d = live.current.present;
    const copy = d.layout && copyOfColumn(d.layout, key);
    if (!copy) return;
    put({ ...d, layout: copy.layout });
    setMenu(null);
    setRenaming({ kind: "column", key: copy.key });
  };
  const insertBox = (area: BoxArea, where?: { afterKey?: string; beforeKey?: string }) => {
    const d = live.current.present;
    if (!d.layout) return;
    const added = addBoxNamed(d.layout, area, freshLabel("New box", boxesOf(d.layout, area).map((b) => b.label)), where);
    put({ ...d, layout: added.layout });
    setMenu(null);
    setRenaming({ kind: "box", area, key: added.key });
  };
  const copyBox = (area: BoxArea, key: string) => {
    const d = live.current.present;
    const copy = d.layout && copyOfBox(d.layout, area, key);
    if (!copy) return;
    put({ ...d, layout: copy.layout });
    setMenu(null);
    setRenaming({ kind: "box", area, key: copy.key });
  };
  const insertLine = (index?: number) => {
    const d = live.current.present;
    const rows = d.layout ? printedRowsOf(d.layout) : null;
    if (!d.layout || !rows) return;
    const first = d.layout.columns.find((c) => c.fixed);
    const at = index ?? rows.length;
    put({ ...d, layout: addPrintedRow(d.layout, at, first ? { [first.key]: "New line" } : {}) });
    setMenu(null);
    if (first) setFocusCell({ index: at, key: first.key });
  };
  const copyLine = (index: number) => {
    const d = live.current.present;
    if (!d.layout) return;
    const first = d.layout.columns.find((c) => c.fixed);
    put({ ...d, layout: duplicatePrintedRow(d.layout, index) });
    setMenu(null);
    if (first) setFocusCell({ index: index + 1, key: first.key });
  };
  // A moved line keeps its menu, so it can be moved again without finding it again.
  const moveLine = (index: number, by: number) => {
    putLayout((l) => movePrintedRow(l, index, by));
    setMenu({ kind: "line", index: index + by });
  };

  const commitRename = (value: string) => {
    const target = renaming;
    setRenaming(null);
    const d = live.current.present;
    if (!target || !d.layout) return;
    if (target.kind === "instructions") {
      const next = setInstructions(d.layout, value.split(/\r?\n/));
      if ((next.instructions ?? []).join("\n") !== (d.layout.instructions ?? []).join("\n")) put({ ...d, layout: next });
      return;
    }
    // Nothing on a format is nameless: a name rubbed out stays what it was.
    const text = value.trim();
    if (!text) return;
    if (target.kind === "name") {
      if (text !== d.name) put({ ...d, name: text });
    } else if (target.kind === "column") {
      const column = d.layout.columns.find((c) => c.key === target.key);
      if (column && column.label !== text) put({ ...d, layout: renameColumn(d.layout, target.key, text) });
    } else {
      const box = boxesOf(d.layout, target.area).find((b) => b.key === target.key);
      if (box && box.label !== text) put({ ...d, layout: renameBox(d.layout, target.area, target.key, text) });
    }
  };
  const cancelRename = () => setRenaming(null);

  const confirmDelete = () => {
    if (dialog?.kind !== "delete") return;
    const t = dialog.target;
    if (t.kind === "column") putLayout((l) => removeColumn(l, t.key));
    else if (t.kind === "box") putLayout((l) => removeBox(l, t.area, t.key));
    else putLayout((l) => removePrintedRow(l, t.index));
    setDialog(null);
  };
  const askDelete = (target: ItemTarget) => {
    setMenu(null);
    setDialog({ kind: "delete", target });
  };

  const leave = () => (dirty ? setDialog({ kind: "discard" }) : onExit());

  // ---- the menu that is open, if any --------------------------------------

  const columns = layout.columns;
  let menuBody: React.ReactNode = null;
  if (menu?.kind === "column") {
    const i = columns.findIndex((c) => c.key === menu.key);
    const c = columns[i];
    if (c) {
      const key = c.key;
      const locked = c.fixed ? "Printed on the form, so it is always text and never asked for." : c.computed ? "Worked out by the system, so it is never typed or asked for." : undefined;
      menuBody = (
        <>
          <MenuItem action="insert-column-left" icon={<FiPlus size={13} />} onClick={() => insertColumn({ beforeKey: key })}>
            Insert column to the left
          </MenuItem>
          <MenuItem action="insert-column-right" icon={<FiPlus size={13} />} onClick={() => insertColumn({ afterKey: key })}>
            Insert column to the right
          </MenuItem>
          <MenuItem action="duplicate-column" icon={<FiCopy size={13} />} onClick={() => copyColumn(key)}>
            Duplicate column
          </MenuItem>
          <MenuItem action="move-column-left" icon={<FiArrowLeft size={13} />} disabled={i === 0} onClick={() => putLayout((l) => moveColumn(l, key, -1))}>
            Move left
          </MenuItem>
          <MenuItem action="move-column-right" icon={<FiArrowRight size={13} />} disabled={i === columns.length - 1} onClick={() => putLayout((l) => moveColumn(l, key, 1))}>
            Move right
          </MenuItem>
          <div className="designer-menu-rule" />
          <ItemSettings
            key={key}
            item={c}
            locked={locked}
            onType={(type) => putLayout((l) => setColumnType(l, key, type))}
            onChoices={(options) => putLayout((l) => setColumnType(l, key, "select", options))}
            onRequired={(required) => putLayout((l) => setColumnRequired(l, key, required))}
          />
          <div className="designer-menu-rule" />
          <MenuItem
            action="delete-column"
            icon={<FiTrash2 size={13} />}
            danger
            disabled={columns.length === 1}
            title={columns.length === 1 ? "A sheet needs at least one column." : undefined}
            onClick={() => askDelete({ kind: "column", key })}
          >
            Delete column
          </MenuItem>
        </>
      );
    }
  } else if (menu?.kind === "box") {
    const { area } = menu;
    const boxes = boxesOf(layout, area);
    const i = boxes.findIndex((b) => b.key === menu.key);
    const b = boxes[i];
    if (b) {
      const key = b.key;
      menuBody = (
        <>
          <MenuItem action="insert-box-before" icon={<FiPlus size={13} />} onClick={() => insertBox(area, { beforeKey: key })}>
            Insert box before
          </MenuItem>
          <MenuItem action="insert-box-after" icon={<FiPlus size={13} />} onClick={() => insertBox(area, { afterKey: key })}>
            Insert box after
          </MenuItem>
          <MenuItem action="duplicate-box" icon={<FiCopy size={13} />} onClick={() => copyBox(area, key)}>
            Duplicate box
          </MenuItem>
          <MenuItem action="move-box-before" icon={<FiArrowLeft size={13} />} disabled={i === 0} onClick={() => putLayout((l) => moveBox(l, area, key, -1))}>
            Move earlier
          </MenuItem>
          <MenuItem action="move-box-after" icon={<FiArrowRight size={13} />} disabled={i === boxes.length - 1} onClick={() => putLayout((l) => moveBox(l, area, key, 1))}>
            Move later
          </MenuItem>
          <div className="designer-menu-rule" />
          <ItemSettings
            key={key}
            item={b}
            onType={(type) => putLayout((l) => setBoxType(l, area, key, type))}
            onChoices={(options) => putLayout((l) => setBoxType(l, area, key, "select", options))}
            onRequired={(required) => putLayout((l) => setBoxRequired(l, area, key, required))}
          />
          <div className="designer-menu-rule" />
          <MenuItem action="delete-box" icon={<FiTrash2 size={13} />} danger onClick={() => askDelete({ kind: "box", area, key })}>
            Delete box
          </MenuItem>
        </>
      );
    }
  } else if (menu?.kind === "line" && printed && printed[menu.index]) {
    const index = menu.index;
    menuBody = (
      <>
        <MenuItem action="insert-line-above" icon={<FiPlus size={13} />} onClick={() => insertLine(index)}>
          Insert line above
        </MenuItem>
        <MenuItem action="insert-line-below" icon={<FiPlus size={13} />} onClick={() => insertLine(index + 1)}>
          Insert line below
        </MenuItem>
        <MenuItem action="duplicate-line" icon={<FiCopy size={13} />} onClick={() => copyLine(index)}>
          Duplicate line
        </MenuItem>
        <MenuItem action="move-line-up" icon={<FiArrowUp size={13} />} disabled={index === 0} onClick={() => moveLine(index, -1)}>
          Move up
        </MenuItem>
        <MenuItem action="move-line-down" icon={<FiArrowDown size={13} />} disabled={index === printed.length - 1} onClick={() => moveLine(index, 1)}>
          Move down
        </MenuItem>
        <div className="designer-menu-rule" />
        <MenuItem action="delete-line" icon={<FiTrash2 size={13} />} danger onClick={() => askDelete({ kind: "line", index })}>
          Delete line
        </MenuItem>
      </>
    );
  }

  // ---- the pieces of the sheet --------------------------------------------

  const boxGrid = (area: BoxArea, minWidth: number) => {
    const boxes = boxesOf(layout, area);
    if (boxes.length === 0) {
      return (
        <div className="text-xs text-faint no-print" data-section={`designer-no-${area}-boxes`}>
          No boxes {area === "header" ? "above" : "below"} the grid — “+ Box {area === "header" ? "above" : "below"}” adds one.
        </div>
      );
    }
    return (
      <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: "10px 16px" }}>
        {boxes.map((f) => {
          const isRenaming = renaming?.kind === "box" && renaming.key === f.key;
          const open = menu?.kind === "box" && menu.key === f.key;
          return (
            <div key={f.key} className="field designer-box" data-designer-item="box" data-key={f.key} data-area={area}>
              <div className="designer-heading">
                {isRenaming ? (
                  <RenameBox field="rename-box" label="Name of the box" initial={f.label} onCommit={commitRename} onCancel={cancelRename} />
                ) : (
                  <button type="button" className="designer-label notranslate" translate="no" data-action="rename-box" data-box={f.key} title="Click to rename" onClick={() => setRenaming({ kind: "box", area, key: f.key })}>
                    {f.label}
                    {f.required ? " *" : ""}
                  </button>
                )}
                <button
                  type="button"
                  className="designer-menu-button no-print"
                  data-action="box-menu"
                  data-box={f.key}
                  data-area={area}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  aria-label={`What can be done to the box ${f.label}`}
                  onClick={() => toggleMenu({ kind: "box", area, key: f.key })}
                >
                  <FiChevronDown size={13} />
                </button>
              </div>
              {/* Where a person writes on a record — empty on the format, saying only what it takes. */}
              <div className="input input-sm designer-sample">
                <span className="no-print">{typeHint(f)}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const nextRev = nextRevisionNo(doc.revisionNo);
  const instructions = layout.instructions ?? [];
  const deleting = dialog?.kind === "delete" ? dialog.target : null;

  return (
    <div ref={root} data-section="sheet-designer" data-document={doc.id}>
      <div className="designer-toolbar no-print" data-section="designer-toolbar" role="toolbar" aria-label="Design the format">
        <button className="btn btn-secondary btn-sm" data-action="designer-add-column" onClick={() => insertColumn()}>
          + Column
        </button>
        <button className="btn btn-secondary btn-sm" data-action="designer-add-box-above" onClick={() => insertBox("header")}>
          + Box above
        </button>
        <button className="btn btn-secondary btn-sm" data-action="designer-add-box-below" onClick={() => insertBox("footer")}>
          + Box below
        </button>
        {printed && (
          <button className="btn btn-secondary btn-sm" data-action="designer-add-line" onClick={() => insertLine()}>
            + Line
          </button>
        )}
        <span className="designer-rule" />
        <button className="btn btn-ghost btn-sm" data-action="designer-undo" onClick={undo} disabled={history.past.length === 0} title="Undo (Ctrl+Z)">
          <FiCornerUpLeft size={13} /> Undo
        </button>
        <button className="btn btn-ghost btn-sm" data-action="designer-redo" onClick={redo} disabled={history.future.length === 0} title="Redo (Ctrl+Y)">
          <FiCornerUpRight size={13} /> Redo
        </button>
        <span className={`designer-count${dirty ? " is-dirty" : ""}`} data-section="designer-count" data-count={changes.length} title={changes.join("\n") || undefined}>
          {countLabel(changes.length)}
        </span>
        <span className="designer-gap" />
        {/* The dialog starts from the STORED format, so it is offered only when the sheet holds nothing it would lose. */}
        <button
          className="btn btn-ghost btn-sm"
          data-action="designer-more"
          onClick={() => setDialog({ kind: "more" })}
          disabled={dirty}
          title={dirty ? "Save the changes on the sheet, or discard them, first — the dialog starts from the format as it is on file." : "The revision history, restoring the issued format, and the same changes as lists"}
        >
          <FiSliders size={13} /> More options…
        </button>
        <button className="btn btn-ghost btn-sm" data-action="designer-discard" onClick={leave}>
          <FiX size={13} /> {dirty ? "Discard" : "Leave design mode"}
        </button>
        <button className="btn btn-primary btn-sm" data-action="designer-save" onClick={() => setDialog({ kind: "save" })} disabled={!dirty} title={dirty ? undefined : "Nothing about the format has been changed yet."}>
          <FiSave size={13} />
          {/* One span: the button lays its children out in a row with gaps, which would part "Rev" from its number. */}
          <span>
            Save as Rev{" "}
            <span className="notranslate" translate="no">
              {nextRev}
            </span>
            …
          </span>
        </button>
      </div>

      {notice && (
        <div className="designer-notice no-print" data-section="designer-notice" role="status">
          <FiCheckCircle size={13} style={{ verticalAlign: -2 }} /> {notice}
        </div>
      )}

      <p className="text-xs text-muted mt-2 no-print">
        This is the format, not a record. Click any name to change it; the small arrow beside {printed ? "a heading, a box or a line's number" : "a heading or a box"} opens what else can be done to it. Nothing is
        saved until Save, and records already on file are never rewritten.
      </p>

      <div className="designer-name mt-3 no-print" data-section="designer-name">
        <span className="text-xs text-muted">Name of the format</span>
        {renaming?.kind === "name" ? (
          <RenameBox field="designer-name" label="Name of the format" initial={draft.name} onCommit={commitRename} onCancel={cancelRename} />
        ) : (
          <button type="button" className="designer-label designer-name-label notranslate" translate="no" data-action="rename-name" title="Click to rename" onClick={() => setRenaming({ kind: "name" })}>
            {draft.name}
          </button>
        )}
      </div>

      {/* The sheet as it will print: everything that is a control on it is .no-print (utils/print.ts). */}
      <div className="designer-sheet mt-2" data-print-doc>
        <DocumentHeader doc={doc} title={draft.name} pageLabel="1 of 1 (digital)" />

        {/* A sheet with no instructions and no boxes above prints no card there (LogSheetRecordView); here the card is where they are added, so it is a control. */}
        <div className={`card mt-4${instructions.length || layout.headerFields.length ? "" : " no-print"}`}>
          <div className="card-pad">
            {renaming?.kind === "instructions" ? (
              <RenameBox field="designer-instructions" label="Printed instructions, one per line" multiline initial={instructions.join("\n")} onCommit={commitRename} onCancel={cancelRename} />
            ) : (
              <button type="button" className={`designer-label designer-block notranslate${instructions.length ? "" : " no-print"}`} translate="no" data-action="rename-instructions" title="Click to reword — one instruction per line" onClick={() => setRenaming({ kind: "instructions" })}>
                {instructions.length === 0 && <span className="text-sm text-faint">No printed instructions — click to write them, one per line.</span>}
                {instructions.map((line, i) => (
                  <span key={i} className={`text-sm ${i === 0 ? "font-semibold" : "text-muted"}`} style={{ display: "block", marginBottom: i < instructions.length - 1 ? 4 : 0 }}>
                    {line}
                  </span>
                ))}
              </button>
            )}
            {layout.referenceTables?.map((t) => (
              <div key={t.title} className="text-xs text-faint mt-2 no-print">
                {t.title} — reference material printed with the form; it stays as issued.
              </div>
            ))}
            <div className="mt-3">{boxGrid("header", 200)}</div>
          </div>
        </div>

        <div className="doc-table mt-4" style={{ overflowX: "auto" }}>
          <table className="compact log-sheet" data-table="designer-grid">
            <thead>
              <tr>
                <th style={{ width: printed ? 64 : 44 }}>Sr. No.</th>
                {columns.map((c) => {
                  const isRenaming = renaming?.kind === "column" && renaming.key === c.key;
                  const open = menu?.kind === "column" && menu.key === c.key;
                  return (
                    <th key={c.key} style={c.width ? { minWidth: c.width } : undefined} data-designer-item="column" data-key={c.key}>
                      <div className="designer-heading">
                        {isRenaming ? (
                          <RenameBox field="rename-column" label="Column heading" initial={c.label} onCommit={commitRename} onCancel={cancelRename} />
                        ) : (
                          <button type="button" className="designer-label notranslate" translate="no" data-action="rename-column" data-column={c.key} title="Click to rename" onClick={() => setRenaming({ kind: "column", key: c.key })}>
                            {c.label}
                            {c.required ? " *" : ""}
                          </button>
                        )}
                        <button
                          type="button"
                          className="designer-menu-button no-print"
                          data-action="column-menu"
                          data-column={c.key}
                          aria-haspopup="menu"
                          aria-expanded={open}
                          aria-label={`What can be done to the column ${c.label}`}
                          onClick={() => toggleMenu({ kind: "column", key: c.key })}
                        >
                          <FiChevronDown size={13} />
                        </button>
                      </div>
                      <span className="designer-type no-print">{c.fixed ? "Printed on the form" : c.computed ? "Worked out" : typeHint(c)}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {printed ? (
                <>
                  {printed.length === 0 && (
                    <tr>
                      <td colSpan={columns.length + 1} className="text-muted text-center no-print" style={{ padding: 16 }}>
                        No printed lines — “+ Line” adds one.
                      </td>
                    </tr>
                  )}
                  {printed.slice(0, linesShown).map((row, i) => (
                    <PrintedLine
                      key={i}
                      index={i}
                      row={row}
                      columns={columns}
                      focusKey={focusCell?.index === i ? focusCell.key : null}
                      menuOpen={menu?.kind === "line" && menu.index === i}
                      onCell={setCell}
                      onMenu={toggleLineMenu}
                      onFocused={clearFocusCell}
                    />
                  ))}
                </>
              ) : (
                // Two lines of the sheet as a record has them: blank, for whoever fills it in.
                [0, 1].map((i) => (
                  <tr key={i} className="designer-sample-line">
                    <td className="text-muted">{i + 1}</td>
                    {columns.map((c) => (
                      <td key={c.key} className="notranslate" translate="no">
                        {layout.rowMode.kind === "timeSlots" && layout.rowMode.slotKey === c.key ? (layout.rowMode.slots[i] ?? "") : ""}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!printed && (
          <p className="text-xs text-muted mt-2 no-print" data-section="designer-lines-note">
            The lines of this sheet are written on each record, so there is nothing of the format&apos;s to design there — the two above only show where they go.
          </p>
        )}

        <div className={`card mt-4${layout.footerFields?.length ? "" : " no-print"}`}>
          <div className="card-pad">{boxGrid("footer", 220)}</div>
        </div>
      </div>

      {menu && menuBody && (
        <DesignerMenu root={root} selector={anchorSelector(menu)} watch={draft} onClose={closeMenu}>
          {menuBody}
        </DesignerMenu>
      )}

      {deleting && (
        <Modal
          title={deleting.kind === "column" ? "Delete this column?" : deleting.kind === "box" ? "Delete this box?" : "Delete this printed line?"}
          onClose={() => setDialog(null)}
          width={480}
          footer={
            <div className="flex justify-end gap-2" style={{ width: "100%" }}>
              <button className="btn btn-ghost btn-sm" data-action="cancel-delete" onClick={() => setDialog(null)}>
                Keep it
              </button>
              <button className="btn btn-danger btn-sm" data-action="confirm-delete" onClick={confirmDelete}>
                <FiTrash2 size={12} /> Yes, delete it
              </button>
            </div>
          }
        >
          <div data-section="designer-confirm" data-kind={deleting.kind}>
            <p className="text-sm mb-2">
              {deleting.kind === "line" ? `Line ${deleting.index + 1} ` : deleting.kind === "column" ? "The column " : "The box "}
              <strong className="notranslate" translate="no">
                “{deletedName(layout, deleting)}”
              </strong>{" "}
              comes off the format.
            </p>
            <p className="text-sm text-muted mb-2">
              {deleting.kind === "line"
                ? "Records already on file keep the lines they were started with; a record started from now on is printed without this one."
                : `Records already on file keep what was written in this ${deleting.kind}; it is simply no longer drawn.`}
            </p>
            <p className="text-xs text-faint">Nothing is final until the format is saved — Undo puts it back.</p>
          </div>
        </Modal>
      )}

      {dialog?.kind === "save" && (
        <SaveDialog
          doc={doc}
          draft={draft}
          changes={changes}
          actor={actor}
          onClose={() => setDialog(null)}
          onSaved={(revision) => {
            setDialog({ kind: "saved", revision, changes });
            onSaved();
          }}
        />
      )}

      {dialog?.kind === "saved" && (
        <Modal
          title="The format is saved"
          onClose={onExit}
          width={520}
          footer={
            <div className="flex justify-end" style={{ width: "100%" }}>
              <button className="btn btn-primary btn-sm" data-action="designer-saved-close" onClick={onExit}>
                Back to the format&apos;s page
              </button>
            </div>
          }
        >
          <div data-section="designer-saved">
            <p className="text-sm mb-2">
              <FiCheckCircle size={14} style={{ verticalAlign: -2, color: "var(--color-success)" }} /> Saved as{" "}
              <strong>
                Rev{" "}
                <span className="notranslate" translate="no">
                  {dialog.revision.revisionNo}
                </span>
              </strong>
              , dated{" "}
              <span className="notranslate" translate="no">
                {formatDisplayDate(dialog.revision.revisionDate)}
              </span>
              , by{" "}
              <span className="notranslate" translate="no">
                {dialog.revision.by}
              </span>
              .
            </p>
            <ChangeList changes={dialog.changes} />
            <p className="text-sm text-muted mt-2">
              Reason:{" "}
              <span className="notranslate" translate="no">
                {dialog.revision.reason}
              </span>
            </p>
            <p className="text-xs text-faint mt-2">It is in the format&apos;s change history and the activity log. Records already on file are as they were.</p>
          </div>
        </Modal>
      )}

      {dialog?.kind === "discard" && (
        <Modal
          title="Leave without saving?"
          onClose={() => setDialog(null)}
          width={480}
          footer={
            <div className="flex justify-end gap-2" style={{ width: "100%" }}>
              <button className="btn btn-ghost btn-sm" data-action="cancel-discard" onClick={() => setDialog(null)}>
                Keep designing
              </button>
              <button
                className="btn btn-danger btn-sm"
                data-action="confirm-discard"
                onClick={() => {
                  const then = dialog.then;
                  onExit();
                  then?.();
                }}
              >
                Throw the changes away
              </button>
            </div>
          }
        >
          <div data-section="designer-discard-dialog">
            <p className="text-sm mb-2">The sheet holds {countLabel(changes.length)} that {changes.length === 1 ? "has" : "have"} not been saved:</p>
            <ChangeList changes={changes} />
            <p className="text-sm text-muted mt-2">
              The format on file stays exactly as it is, at Rev{" "}
              <span className="notranslate" translate="no">
                {doc.revisionNo}
              </span>
              .
            </p>
          </div>
        </Modal>
      )}

      {dialog?.kind === "more" && <FormatEditor doc={doc} actor={actor} onClose={() => setDialog(null)} onSaved={onExit} />}
    </div>
  );
}

/** What a box or a column takes, in the app's words: "Text", "Choice: Yes / No". */
function typeHint(item: LogHeaderField | LogColumn): string {
  const unit = "unit" in item && item.unit ? ` (${item.unit})` : "";
  if (item.type === "select" && item.options?.length) return `${FIELD_TYPE_LABELS.select}: ${item.options.join(" / ")}`;
  return `${FIELD_TYPE_LABELS[item.type] ?? item.type}${unit}`;
}

/** The name the delete pop-up calls the thing by. A line is called by the first words printed on it. */
function deletedName(layout: LogSheetLayout, target: ItemTarget): string {
  if (target.kind === "column") return layout.columns.find((c) => c.key === target.key)?.label ?? "";
  if (target.kind === "box") return boxesOf(layout, target.area).find((b) => b.key === target.key)?.label ?? "";
  const row = printedRowsOf(layout)?.[target.index] ?? {};
  const first = layout.columns.find((c) => c.fixed && String(row[c.key] ?? "").trim() !== "");
  return first ? String(row[first.key]).split("\n")[0] : "a blank line";
}

function ChangeList({ changes }: { changes: string[] }) {
  return (
    <ul className="designer-changes notranslate" translate="no" data-section="designer-change-list">
      {/* By position: two columns given the same name read as the same sentence. */}
      {changes.map((c, i) => (
        <li key={i}>{c}</li>
      ))}
    </ul>
  );
}

/**
 * A name being typed where it stands. It arrives focused with the old name
 * selected, so typing replaces it. Enter — or clicking anywhere else — keeps
 * what was typed; Escape leaves the name as it was. The instructions take
 * several lines, so there Enter is a new line and Ctrl+Enter keeps them.
 */
function RenameBox({ field, label, initial, multiline, onCommit, onCancel }: { field: string; label: string; initial: string; multiline?: boolean; onCommit: (value: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const line = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  // Enter takes the box off the sheet, and the blur that follows must not keep the name a second time.
  const done = useRef(false);
  useEffect(() => {
    const el = line.current ?? area.current;
    el?.focus();
    el?.select();
  }, []);
  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    if (keep) onCommit(text);
    else onCancel();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      // The Escape is this box's: a menu or a pop-up underneath is not to close on it as well.
      e.stopPropagation();
      finish(false);
    }
  };
  return multiline ? (
    <textarea
      ref={area}
      className="input designer-rename notranslate"
      translate="no"
      rows={Math.min(10, Math.max(3, text.split("\n").length + 1))}
      value={text}
      aria-label={label}
      data-field={field}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(true)}
    />
  ) : (
    <input ref={line} className="input input-sm designer-rename notranslate" translate="no" value={text} aria-label={label} data-field={field} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} onBlur={() => finish(true)} />
  );
}

/**
 * One line the form prints down its side. Remembered, so a change to one line —
 * or a menu opening, or a name being typed — builds that line and no other
 * (REQUIREMENTS §56).
 */
const PrintedLine = React.memo(function PrintedLine({
  index,
  row,
  columns,
  focusKey,
  menuOpen,
  onCell,
  onMenu,
  onFocused,
}: {
  index: number;
  row: PrintedRow;
  columns: LogColumn[];
  /** The printed cell of this line to put the cursor in — a line just added — or null. */
  focusKey: string | null;
  menuOpen: boolean;
  onCell: (index: number, key: string, value: string) => void;
  onMenu: (index: number) => void;
  onFocused: () => void;
}) {
  return (
    <tr data-designer-item="line" data-index={index}>
      <td className="text-muted designer-line-no">
        {index + 1}
        <button type="button" className="designer-menu-button no-print" data-action="line-menu" data-line={index} aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`What can be done to line ${index + 1}`} onClick={() => onMenu(index)}>
          <FiChevronDown size={13} />
        </button>
      </td>
      {columns.map((c) =>
        c.fixed ? (
          <td key={c.key}>
            <PrintedCell index={index} columnKey={c.key} label={c.label} value={String(row[c.key] ?? "")} select={focusKey === c.key} onCommit={onCell} onFocused={onFocused} />
          </td>
        ) : (
          // Written on each record, so blank on the format.
          <td key={c.key} className="designer-blank" />
        )
      )}
    </tr>
  );
});

/**
 * The words printed in one cell. Typed locally and put on the draft when the
 * cell is left, so a reworded specification is one step to undo, not one per
 * letter. A text area, not a one-line box: a specification is often printed as
 * several lines in the one cell, and a one-line box would drop the line breaks.
 */
const PrintedCell = React.memo(function PrintedCell({
  index,
  columnKey,
  label,
  value,
  select,
  onCommit,
  onFocused,
}: {
  index: number;
  columnKey: string;
  label: string;
  value: string;
  select: boolean;
  onCommit: (index: number, key: string, value: string) => void;
  onFocused: () => void;
}) {
  const [text, setText] = useState(value);
  // Lines have no identity of their own, so a cell may be handed another line's
  // words when one is inserted above it; what is typed follows what is printed.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }
  const box = useRef<HTMLTextAreaElement>(null);
  const reverting = useRef(false);
  useEffect(() => {
    if (!select) return;
    box.current?.focus();
    box.current?.select();
    onFocused();
  }, [select, onFocused]);
  return (
    <textarea
      ref={box}
      className="designer-printed notranslate"
      translate="no"
      rows={Math.max(1, text.split("\n").length)}
      value={text}
      aria-label={`${label}, line ${index + 1}`}
      data-field="printed-cell"
      data-line={index}
      data-column={columnKey}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        reverting.current = true;
        setText(value);
        e.currentTarget.blur();
      }}
      onBlur={() => {
        if (reverting.current) reverting.current = false;
        else if (text !== value) onCommit(index, columnKey, text);
      }}
    />
  );
});

function MenuItem({ action, icon, danger, disabled, title, onClick, children }: { action: string; icon: React.ReactNode; danger?: boolean; disabled?: boolean; title?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="menuitem" className={`designer-menu-item${danger ? " is-danger" : ""}`} data-action={action} disabled={disabled} title={title} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

/** Type, the choices of a Choice, and Required — the same three for a column and for a box. */
function ItemSettings({
  item,
  locked,
  onType,
  onChoices,
  onRequired,
}: {
  item: LogHeaderField | LogColumn;
  /** Why this one's type and "required" cannot change — a printed or worked-out column — when they cannot. */
  locked?: string;
  onType: (type: LogFieldType) => void;
  onChoices: (options: string[]) => void;
  onRequired: (required: boolean) => void;
}) {
  return (
    <div className="designer-menu-fields">
      <label className="designer-menu-field">
        <span>Type</span>
        <select className="input input-sm" data-field="item-type" value={item.type} disabled={!!locked} onChange={(e) => onType(e.target.value as LogFieldType)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {FIELD_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      {item.type === "select" && !locked && <ChoicesBox options={item.options ?? []} onCommit={onChoices} />}
      <label className="designer-menu-check">
        <input type="checkbox" data-field="item-required" checked={!!item.required} disabled={!!locked} onChange={(e) => onRequired(e.target.checked)} /> Required
      </label>
      {locked && <div className="text-xs text-faint">{locked}</div>}
    </div>
  );
}

/**
 * The choices of a Choice, separated by commas. Kept when the box is left, on
 * Enter — and when the menu closes under it: a click outside the menu takes the
 * box off the page before it can lose the focus, and what was typed must not go
 * with it.
 */
function ChoicesBox({ options, onCommit }: { options: string[]; onCommit: (options: string[]) => void }) {
  const [text, setText] = useState(options.join(", "));
  const latest = useRef({ text, kept: options.join(", "), onCommit });
  latest.current.text = text;
  latest.current.onCommit = onCommit;
  const keep = useCallback(() => {
    const now = latest.current;
    const list = now.text.split(",").map((o) => o.trim()).filter(Boolean);
    const joined = list.join(", ");
    if (joined === now.kept) return;
    now.kept = joined;
    now.onCommit(list);
  }, []);
  useEffect(() => keep, [keep]);
  return (
    <label className="designer-menu-field">
      <span>Choices, separated by commas</span>
      <input
        className="input input-sm notranslate"
        translate="no"
        data-field="item-choices"
        value={text}
        placeholder="e.g. OK, Not OK"
        onChange={(e) => setText(e.target.value)}
        onBlur={keep}
        onKeyDown={(e) => {
          if (e.key === "Enter") keep();
        }}
      />
    </label>
  );
}

/**
 * The menu of a heading, a box or a line. It is drawn OVER the page at the
 * button it hangs from, not inside the sheet: the grid scrolls sideways inside
 * its frame, and a menu inside that frame would be cut off by it.
 */
function DesignerMenu({ root, selector, watch, onClose, children }: { root: React.RefObject<HTMLDivElement | null>; selector: string; watch: unknown; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  // Under its button; above it when there is no room below; never off the side of the screen.
  const place = useCallback(() => {
    const anchor = root.current?.querySelector(selector);
    const el = box.current;
    if (!anchor || !el) return onClose();
    const a = anchor.getBoundingClientRect();
    // Scrolled off the screen, the button has nothing for a menu to hang from.
    if (a.bottom < 0 || a.top > window.innerHeight || a.right < 0 || a.left > window.innerWidth) return onClose();
    const m = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(a.left, window.innerWidth - m.width - 8));
    const below = a.bottom + 4;
    const top = below + m.height > window.innerHeight - 8 ? Math.max(8, a.top - m.height - 4) : below;
    setAt((was) => (was && was.left === left && was.top === top ? was : { left, top }));
  }, [root, selector, onClose]);

  // Placed again whenever the draft changes: a column that was moved took its button with it.
  useLayoutEffect(place, [place, watch]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || root.current?.querySelector(selector)?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // The menu FOLLOWS its button as the page scrolls rather than closing: a
    // touchpad is still drifting when the arrow is clicked, and a menu that
    // closed on that would shut the moment it opened.
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [root, selector, onClose, place]);

  return (
    <div ref={box} className="designer-menu no-print" role="menu" data-section="designer-menu" style={at ? { left: at.left, top: at.top } : { left: 0, top: 0, visibility: "hidden" }}>
      {children}
    </div>
  );
}

/**
 * SAVE, as a pop-up: what changed in words, the revision it becomes, and the
 * reason — which is required, because it goes in the change history. Its boxes
 * are its own, so typing the reason does not rebuild the sheet underneath.
 */
function SaveDialog({ doc, draft, changes, actor, onClose, onSaved }: { doc: DocumentDefinition; draft: FormatDraft; changes: string[]; actor: string; onClose: () => void; onSaved: (revision: FormatRevision) => void }) {
  const [revisionNo, setRevisionNo] = useState(nextRevisionNo(doc.revisionNo));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const result = commitFormatChange(doc, draft, { actor, reason, revisionNo });
    if (result.ok) onSaved(result.revision);
    else setError(result.error);
  };
  return (
    <Modal
      title="Save the format"
      onClose={onClose}
      width={560}
      footer={
        <div className="flex justify-end gap-2" style={{ width: "100%" }}>
          <button className="btn btn-ghost btn-sm" data-action="designer-cancel-save" onClick={onClose}>
            Back to the sheet
          </button>
          <button className="btn btn-primary btn-sm" data-action="designer-confirm-save" onClick={save}>
            <FiSave size={12} /> Confirm and save
          </button>
        </div>
      }
    >
      <div data-section="designer-save-dialog">
        <p className="text-sm mb-2">
          Now at{" "}
          <strong>
            Rev{" "}
            <span className="notranslate" translate="no">
              {doc.revisionNo}
            </span>
          </strong>
          {doc.revisionDate ? (
            <>
              {" "}
              of{" "}
              <span className="notranslate" translate="no">
                {formatDisplayDate(doc.revisionDate)}
              </span>
            </>
          ) : null}
          . This is what changes:
        </p>
        <ChangeList changes={changes} />
        <div className="grid mt-3" style={{ gridTemplateColumns: "1fr 2fr", gap: "10px 16px" }}>
          <div className="field">
            <label htmlFor="designer-revision">New revision number</label>
            <input id="designer-revision" className="input input-sm notranslate" translate="no" value={revisionNo} onChange={(e) => setRevisionNo(e.target.value)} data-field="designer-revision" />
          </div>
          <div className="field">
            <label htmlFor="designer-reason">Why is the format changing? *</label>
            <input
              id="designer-reason"
              className="input input-sm notranslate"
              translate="no"
              value={reason}
              autoFocus
              placeholder="e.g. Customer audit asked for the batch number on every line"
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
              data-field="designer-reason"
            />
          </div>
        </div>
        {error && (
          <div className="text-sm text-danger mt-3" role="alert" data-section="designer-save-error">
            {error}
          </div>
        )}
        <p className="text-xs text-faint mt-3">
          It is dated today and recorded as changed by{" "}
          <span className="notranslate" translate="no">
            {actor}
          </span>
          . Records already on file keep everything written on them.
        </p>
      </div>
    </Modal>
  );
}
