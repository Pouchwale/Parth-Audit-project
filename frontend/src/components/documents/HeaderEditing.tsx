import React, { useCallback, useId, useMemo, useState } from "react";
import type { DocumentDefinition, RecordHeaderBlock } from "../../types";
import type { AnyHeaderField, HeaderEdit, HeaderField } from "./DocumentHeader";
import { RenameBox } from "./RenameBox";
import { COMPANY } from "../../data/seed/masterData";
import { documentRepository } from "../../data/repositories/documentRepository";
import { nextRevisionNo } from "../../data/formatEdits";
import { commitFormatChange, draftOf, type FormatDraft } from "../../engine/formatOps";
import { useAppStore } from "../../store/AppStore";
import { formatDisplayDate } from "../../utils/date";

// THE HEADER BLOCK, TYPED OVER ON EVERY DOCUMENT (REQUIREMENTS §86).
//
// The owner, 02-Oct-2026, of a record's header (company, title, Format No.,
// Rev No., Date, Page No.): "make it editable, and that is applicable to each
// and every document of every module". Each value is clicked and typed over
// where it stands, as on the Sheet Designer (§77), and Enter keeps it. What a
// value BELONGS TO decides what keeping it does:
//
//   · the company, the title, the format number and the revision are the
//     FORMAT's own — every record of it prints them. Changing one changes the
//     format, under the document control the plant already has (§62): the page
//     asks why, and saving makes it the next revision, in the format's change
//     history and the activity log, exactly as Edit format would. Only the
//     header is saved — never a copy of the sheet's layout — and it is built
//     from the format as it stands at that moment, so a colleague's change made
//     meanwhile is kept.
//   · the Date and the Page No. are the RECORD's own: what this page is headed
//     with. Changing one changes this record alone, at once, with a line in its
//     history — and only while its boxes can be written on.
//
// A record kept on a superseded revision (§74) is a page of the past: nothing
// on its header takes a click.

const LABELS: Record<AnyHeaderField, string> = {
  companyName: "Company name",
  title: "Name of the format",
  formatNo: "Format No.",
  revisionNo: "Rev No.",
  revisionDate: "Date of the revision",
  date: "Date",
  page: "Page No.",
};

/** The format's cells a header usually shows: the revision date only where its Date cell prints it (no record's own date). */
export const FORMAT_HEADER_FIELDS: readonly HeaderField[] = ["companyName", "title", "formatNo", "revisionNo"];

export interface RecordHeaderEditing {
  /** The record's own header values, where they were typed over. */
  block?: RecordHeaderBlock;
  /** Its boxes can be written on now. */
  editable: boolean;
  /** What the header prints where nothing was typed: the record's date (ISO) and the view's page. */
  defaultDate: string;
  defaultPage: string;
  /**
   * Saves ONE of the record's header values — `{ date }` or `{ page }`, undefined for "what the header prints
   * anyway". The page lays it over the record AS STORED, so the other cell keeps its newest value.
   */
  save: (change: RecordHeaderBlock) => void;
}

/**
 * What a record's page hands the view that draws its header (REQUIREMENTS §86):
 * whether the record's boxes can be written on, whether its header may be typed
 * over at all (never on a superseded revision), and how to save the record's own
 * Date and Page No. — with what the header prints where nothing was typed.
 */
export interface RecordHeaderHost {
  editable: boolean;
  enabled: boolean;
  save: (change: RecordHeaderBlock, defaults: { date: string; page: string }) => void;
}

/** The record half of the options, for a view given a host — or none, where the view is drawn read-only. */
export function recordHeaderEditing(
  host: RecordHeaderHost | undefined,
  block: RecordHeaderBlock | undefined,
  defaults: { date: string; page: string }
): RecordHeaderEditing | undefined {
  if (!host) return undefined;
  return { block, editable: host.editable, defaultDate: defaults.date, defaultPage: defaults.page, save: (change) => host.save(change, defaults) };
}

export interface HeaderEditingOptions {
  /** The format whose header this is — none (another department's, or no host): nothing takes a click. */
  doc: DocumentDefinition | undefined;
  /** The format's cells this header shows. */
  formatFields?: readonly HeaderField[];
  /** The record's own Date and Page No., on a record's page. */
  record?: RecordHeaderEditing;
  /** Off on a record kept on a superseded revision. */
  enabled?: boolean;
}

/** The header's value as it stands, for a format field — the stored name, never the upper-cased title it prints. */
function currentValue(doc: DocumentDefinition, field: HeaderField): string {
  switch (field) {
    case "companyName":
      return doc.companyName ?? COMPANY.name;
    case "title":
      return doc.name;
    case "formatNo":
      return doc.formatNo;
    case "revisionNo":
      return doc.revisionNo;
    case "revisionDate":
      return doc.revisionDate ?? "";
  }
}

/** The draft one header value makes of the format as it stands — the header alone, never a copy of the layout. */
function headerDraft(doc: DocumentDefinition, field: HeaderField, value: string): FormatDraft {
  const draft: FormatDraft = { ...draftOf(doc), layout: undefined };
  switch (field) {
    case "companyName":
      return { ...draft, companyName: value };
    case "title":
      return { ...draft, name: value };
    case "formatNo":
      return { ...draft, formatNo: value };
    case "revisionNo":
      return { ...draft, revisionNo: value };
    case "revisionDate":
      return { ...draft, revisionDate: value };
  }
}

const isRecordField = (f: AnyHeaderField): f is "date" | "page" => f === "date" || f === "page";

/**
 * The header's in-place editing for one page: the `edit` to hand DocumentHeader,
 * and the panel that asks why a format is changing, to be drawn beside it.
 */
export function useHeaderEditing(o: HeaderEditingOptions): { edit?: HeaderEdit; panel: React.ReactNode } {
  const { currentUser, bump } = useAppStore();
  const [editing, setEditing] = useState<AnyHeaderField | null>(null);
  const [pending, setPending] = useState<{ field: HeaderField; value: string } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();
  const { doc, record } = o;
  const enabled = o.enabled !== false && !!doc;
  const formatFields = o.formatFields ?? FORMAT_HEADER_FIELDS;
  const recordEditable = !!record?.editable;

  const fields = useMemo(() => {
    const set = new Set<AnyHeaderField>(formatFields);
    if (record && recordEditable) {
      set.add("date");
      set.add("page");
    }
    return set;
  }, [formatFields, record, recordEditable]);

  const commit = useCallback(
    (field: AnyHeaderField, typed: string) => {
      setEditing(null);
      const value = typed.trim();
      if (isRecordField(field)) {
        if (!record || !record.editable) return;
        if (field === "date") {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
          record.save({ date: value === record.defaultDate ? undefined : value });
        } else {
          // Rubbed out, the page number is the view's own again.
          record.save({ page: !value || value === record.defaultPage ? undefined : value });
        }
        return;
      }
      // The format's own value: blank or unchanged keeps what is there; otherwise the page asks why.
      if (!doc || !value || value === currentValue(doc, field)) return;
      if (field === "revisionDate" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
      setError(null);
      setReason("");
      setPending({ field, value });
    },
    [doc, record]
  );

  const save = () => {
    if (!pending || !doc) return;
    // The format as it stands NOW — a colleague's change made while this one was typed is kept.
    const fresh = documentRepository.getById(doc.id) ?? doc;
    const result = commitFormatChange(fresh, headerDraft(fresh, pending.field, pending.value), {
      actor: currentUser,
      reason,
      reissue: pending.field === "revisionNo" || pending.field === "revisionDate",
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPending(null);
    setReason("");
    setError(null);
    // Every view of the format reads its header again.
    bump();
  };

  const edit = useMemo<HeaderEdit | undefined>(() => {
    if (!enabled || !doc || fields.size === 0) return undefined;
    return {
      editing,
      fields,
      values: {},
      onEdit: (field) => {
        if (pending) return;
        setEditing(field);
      },
      box: (field) => {
        const recordValue = (): string =>
          field === "date" ? (record?.block?.date ?? record?.defaultDate ?? "") : (record?.block?.page ?? record?.defaultPage ?? "");
        return (
          <RenameBox
            field={`header-${field}`}
            label={LABELS[field]}
            inputType={field === "date" || field === "revisionDate" ? "date" : undefined}
            initial={isRecordField(field) ? recordValue() : currentValue(doc, field)}
            onCommit={(v) => commit(field, v)}
            onCancel={() => setEditing(null)}
          />
        );
      },
    };
  }, [enabled, fields, editing, pending, record, doc, commit]);

  if (!doc) return { edit: undefined, panel: null };
  const nextRev = pending ? (pending.field === "revisionNo" ? pending.value : nextRevisionNo(doc.revisionNo)) : "";
  const shown = pending ? (pending.field === "revisionDate" ? formatDisplayDate(pending.value) : pending.value) : "";
  const number = doc.formatNo.startsWith("TO BE") ? doc.name : doc.formatNo;
  const panel = pending ? (
    <div className="card mt-3 no-print header-change" data-section="header-change" role="group" aria-label="Change the format's header">
      <div className="card-pad">
        <div className="text-sm">
          <strong>{LABELS[pending.field]}</strong> → <span className="notranslate" translate="no">“{shown}”</span>. This is the format's own header: every record of{" "}
          <span className="notranslate" translate="no">{number}</span> prints it from now on, and the format becomes{" "}
          <strong className="notranslate" translate="no">Rev {nextRev}</strong> — in its change history and the activity log, as Edit format would.
        </div>
        <label className="text-xs text-muted mt-2" style={{ display: "block" }} htmlFor={reasonId}>
          Why is the format changing? It goes in its change history.
        </label>
        <textarea
          id={reasonId}
          className="input mt-1"
          rows={2}
          value={reason}
          data-field="header-change-reason"
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        {error && (
          <div className="text-sm mt-1" style={{ color: "var(--color-danger)" }} data-section="header-change-error" role="alert">
            {error}
          </div>
        )}
        <div className="flex gap-2 mt-2 wrap">
          <button type="button" className="btn btn-primary btn-sm" data-action="header-change-save" onClick={save}>
            Save as Rev {nextRev}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-action="header-change-cancel"
            onClick={() => {
              setPending(null);
              setError(null);
            }}
          >
            Keep the header as it is
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { edit, panel };
}
