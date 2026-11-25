import React from "react";
import type { LogSheetLayout } from "../../types";
import { paperFrameStyle, paperTablePrint, type PaperCell, type PaperTable } from "../../data/seed/qcPaperTables";
import { registerPaperPager } from "../../utils/paperPages";
import { PaperTablePart, type PaperTableParts } from "./PaperTableSheet";
import { EditableWords } from "./EditableWords";

// A RECORD THAT IS NOT A LOG SHEET, DRAWN AS THE OWNER'S OWN PAPER (REQUIREMENTS §372): the CAPA module's two formats, F/MKT/05
// Customer Complaint Handling Checklist and the Pest control GAP analysis report, keep their own pages (pages/CapaPage.tsx,
// pages/GapPage.tsx) and their own records, and are drawn and printed on the same paper sheet as every paper of a log sheet
// (components/records/PaperTableSheet.tsx, the print's own rules in styles.css and utils/print.ts): the paper's rows in its
// millimetres, its pages each with their head and foot, its page frame, filled to the A4 page. The page hands each place a
// person writes in its own box; every printed word is the paper's, typed over on the record by its place (ownWords, §275).

/** A layout with nothing of its own: the paper's words are all its cells' (the record is not a log sheet). */
export const NO_LAYOUT = (documentId: string): LogSheetLayout => ({ documentId, headerFields: [], columns: [], rowMode: { kind: "single" }, specimenSource: "" });

export function OwnPaperSheet({
  form,
  documentId,
  recordId,
  box,
  gridCell,
  rowCount = 0,
  words,
  onWords,
}: {
  form: PaperTable;
  documentId: string;
  recordId: string;
  /** The record's box filling a cell (PaperCell.box). */
  box: (key: string, cell: PaperCell) => React.ReactNode;
  /** A cell of the record's lines (PaperCell.col and ln, or a register's line). */
  gridCell: (line: number, col: string, cell: PaperCell) => React.ReactNode;
  /** How many lines the record holds (a register's ruled lines beyond them print blank). */
  rowCount?: number;
  /** The paper's printed words as this record words them, by their place ("paper:<row>:<cell>"). */
  words?: Record<string, string>;
  /** Words typed over at a place; absent where the record cannot be written on. */
  onWords?: (key: string, words: string) => void;
}) {
  // A long register's printed pages, each with its head again (utils/paperPages.ts, §277).
  const [pageBreaks, setPageBreaks] = React.useState<number[] | null>(null);
  React.useEffect(() => registerPaperPager(recordId, setPageBreaks), [recordId]);
  const parts: PaperTableParts = {
    form,
    layout: NO_LAYOUT(documentId),
    rowCount,
    pageBreaks,
    words: {},
    box,
    gridCell,
    printed: (place: string, own: string, drawn: React.ReactNode) => {
      const key = `paper:${place}`;
      const shown = words?.[key] ?? own;
      return (
        <EditableWords className="pt-words" shown={shown} editable={!!onWords} onChange={(w) => onWords?.(key, w)} label={own}>
          {shown === own ? drawn : shown}
        </EditableWords>
      );
    },
  };
  const print = paperTablePrint(form, true);
  const paged = !!pageBreaks?.length || [...form.head, ...form.body].some((r) => r.pb);
  return (
    <div
      className="paper-sheet paper-table-sheet"
      data-bind-record={recordId}
      data-paper={form.page}
      data-paper-left={print.left}
      data-sheet={documentId}
      data-paper-form="table"
      data-paper-own=""
      data-fill-a4=""
      data-paper-paged={paged ? "" : undefined}
      data-paper-pages={pageBreaks?.length ? pageBreaks.length + 1 : undefined}
      data-paper-flows={form.flows || form.lines ? "" : undefined}
      style={{ "--pt-left": String(print.left), "--pt-top": String(print.top), "--pt-print-scale": String(print.scale) } as React.CSSProperties}
    >
      {paged && <div className="pt-page-top" aria-hidden="true" />}
      <div className="paper-head">
        {form.pageFrame && <div className={`pt-page-frame${form.pageFrame.double ? " pt-page-frame-double" : ""}`} aria-hidden="true" style={paperFrameStyle(form, print)} />}
        <div className="doc-header doc-header-paper">
          <div className="doc-letterhead">
            <PaperTablePart part="head" parts={parts} />
          </div>
        </div>
      </div>
      <div className="paper-body">
        <PaperTablePart part="body" parts={parts} />
      </div>
      <div className="paper-foot">
        <PaperTablePart part="foot" parts={parts} />
      </div>
      <div className="paper-page-foot" aria-hidden="true" />
    </div>
  );
}
