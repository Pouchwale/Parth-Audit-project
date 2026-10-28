import { PrintedWordsAt } from "./PrintedWordsAt";
import type { PrintedWords } from "../../types";
import React from "react";
import type { DocumentDefinition, FlyCatcherData, FlyCatcherEntry, RecordInstance } from "../../types";
import { DocumentHeader } from "../documents/DocumentHeader";
import { recordHeaderEditing, useHeaderEditing, type RecordHeaderHost } from "../documents/HeaderEditing";
import { recordHeaderDefaults } from "../../engine/recordLifecycle";
import { formatEditFor } from "../../data/formatEdits";
import { masterRepository } from "../../data/repositories/masterRepository";
import { formatDisplayDate } from "../../utils/date";
import { bindProps, flyCatcherBind, type FlyEntryField } from "../../engine/roundTrip/bindingsFor";
import { FHR18_PAPER_CELLS, FHR18_TITLE, Fhr18GridHead, Fhr18Legend, paperDate } from "./FlyCatcherRegisterSheet";

// A FLY CATCHER VISIT ON ITS OWN PAGE, LAID OUT AS F/HR/18 PRINTS — the
// company's own Word original (source-documents/F-HR-18_Fly Catcher Inspection
// & Cleaning Record.doc, sent 16-Oct-2026; REQUIREMENTS §111 part 9): the
// header block, the "Month & Year" line, the legend of the thirteen units and
// where they hang, then the grid — PC ID NO. | DATE OF SERVICE | FLIES CATCH
// COUNT APPROX. | DATE OF TUBE LIGHT INSTALLATION | DUE DATE FOR TUBE LIGHT
// REPLACEMENT | CLEANING DONE BY | VERIFIED BY — one line per unit for this
// visit. (The monthly register, FlyCatcherRegisterSheet.tsx, draws the paper's
// two lines per unit from the month's visits, PC-01..08 on its first page and
// PC-09..13 on its second.) Every box the person fills on the paper is a box
// here — the Month & Year, the count, both tube-light dates and the two names;
// the date of service is the visit's own date, written as the paper writes it.
// Nothing the paper does not print is drawn: no Location column, no note.
// The print and the downloaded Word file are this sheet (utils/documentExport.ts).

type EntryPatch = Partial<Omit<FlyCatcherEntry, "pcId">>;

export function FlyCatcherRecordView({
  doc,
  record,
  editable,
  onChange,
  header,
}: {
  doc: DocumentDefinition;
  record: RecordInstance<FlyCatcherData>;
  editable: boolean;
  onChange: (data: FlyCatcherData) => void;
  /** The record page's: its header typed over in place (REQUIREMENTS §86). */
  header?: RecordHeaderHost;
}) {
  const data = record.data;
  const headerDefaults = recordHeaderDefaults(record);
  const { edit: headerEdit, panel: headerPanel } = useHeaderEditing({
    doc: header ? doc : undefined,
    enabled: header?.enabled,
    record: recordHeaderEditing(header, record.headerBlock, headerDefaults),
  });
  const master = masterRepository.get();
  const pcLocations = master.pcLocations;
  // The paper's own title and date — until the format itself is changed (§86).
  const formatChanged = formatEditFor(doc.id);

  const updateEntry = (pcId: string, patch: EntryPatch) => {
    onChange({
      ...data,
      entries: data.entries.map((e) => (e.pcId === pcId ? { ...e, ...patch } : e)),
    });
  };

  // Every value below carries where it lives in the record, so an edited Word
  // or Excel file can be read back (REQUIREMENTS §81, engine/roundTrip/bindingsFor.ts).
  const bound = (pcId: string, field: FlyEntryField) => bindProps(flyCatcherBind.entry(pcId, field));
  const serviceDate = paperDate(record.dueDate);
  // EVERY PRINTED WORD OF THE VISIT'S SHEET, TYPED OVER ON IT (REQUIREMENTS §137): each catcher's number and area, the
  // visit's date on each line, the headings - this visit's own words once changed; Master Data keeps the plant's.
  const host = { words: data.printedWords, editable, onWords: (printedWords: PrintedWords) => onChange({ ...data, printedWords }) };
  const at = (place: string, original: string, label?: string) => (
    <PrintedWordsAt place={place} words={data.printedWords} original={original} editable={editable} onWords={host.onWords} label={label} />
  );

  return (
    <div className="fhr18-record" data-bind-record={record.id}>
      <section className="register-page">
        <DocumentHeader
          doc={doc}
          title={formatChanged?.name ? undefined : FHR18_TITLE}
          pageLabel={record.headerBlock?.page ?? headerDefaults.page}
          edit={headerEdit}
          labels={FHR18_PAPER_CELLS}
          dotDates
        />
        {headerPanel}

        {/* "Month & Year ____": the underlined blank the person fills. */}
        <div className="fhr18-month">
          <label className="k" htmlFor="fhr18-month-year">
            Month &amp; Year
          </label>
          <input
            id="fhr18-month-year"
            className="v fhr18-month-input notranslate"
            translate="no"
            {...bindProps(flyCatcherBind.monthYear())}
            disabled={!editable}
            value={data.monthYear}
            onChange={(e) => onChange({ ...data, monthYear: e.target.value })}
          />
        </div>

        <Fhr18Legend pcLocations={pcLocations} host={host} />

        <div className="doc-table register-grid-wrap">
          <table className="register-grid fhr18-grid">
            <Fhr18GridHead host={host} />
            <tbody className="fhr18-gap" data-gap="first" aria-hidden="true">
              <tr>
                <td colSpan={7} />
              </tr>
            </tbody>
            {data.entries.map((e) => {
              const label = `${e.pcId}, visit of ${formatDisplayDate(record.dueDate)}`;
              return (
                <tbody key={e.pcId} className="fhr18-unit" data-pc={e.pcId}>
                  <tr className="register-row">
                    <td className="pc-cell notranslate" translate="no">
                      {at(`pc:${e.pcId}`, e.pcId, "Catcher")}
                    </td>
                    {/* The visit's date, as the paper writes it (3/08/26). */}
                    <td className="date-cell notranslate" translate="no">
                      {at(`date:${e.pcId}`, serviceDate, "Date of service")}
                    </td>
                    <td className="edit-cell">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="input input-sm fhr18-input"
                        data-field="count"
                        {...bound(e.pcId, "catchCountApprox")}
                        aria-label={`${label} — flies catch count approx.`}
                        disabled={!editable}
                        value={e.catchCountApprox ?? ""}
                        onChange={(ev) => {
                          const n = Number(ev.target.value);
                          updateEntry(e.pcId, { catchCountApprox: ev.target.value === "" || !Number.isFinite(n) ? null : Math.max(0, n) });
                        }}
                      />
                    </td>
                    <td className="edit-cell">
                      <input
                        type="date"
                        className="input input-sm fhr18-input"
                        data-field="installed"
                        {...bound(e.pcId, "tubeLightInstallDate")}
                        // An empty date prints empty, not "dd-mm-yyyy" (REQUIREMENTS §111).
                        data-empty={e.tubeLightInstallDate ? undefined : ""}
                        aria-label={`${label} — date of tube light installation`}
                        disabled={!editable}
                        value={e.tubeLightInstallDate ?? ""}
                        onChange={(ev) => updateEntry(e.pcId, { tubeLightInstallDate: ev.target.value || null })}
                      />
                    </td>
                    <td className="edit-cell">
                      <input
                        type="date"
                        className="input input-sm fhr18-input"
                        data-field="due"
                        {...bound(e.pcId, "tubeLightDueDate")}
                        data-empty={e.tubeLightDueDate ? undefined : ""}
                        aria-label={`${label} — due date for tube light replacement`}
                        disabled={!editable}
                        value={e.tubeLightDueDate ?? ""}
                        onChange={(ev) => updateEntry(e.pcId, { tubeLightDueDate: ev.target.value || null })}
                      />
                    </td>
                    {/* The names signed read exactly as they were written, in either language (REQUIREMENTS §58). */}
                    <td className="edit-cell">
                      <input
                        className="input input-sm fhr18-input notranslate"
                        translate="no"
                        list="fhr18-record-people"
                        data-field="cleaning"
                        {...bound(e.pcId, "cleaningDoneBy")}
                        aria-label={`${label} — cleaning done by`}
                        disabled={!editable}
                        value={e.cleaningDoneBy}
                        onChange={(ev) => updateEntry(e.pcId, { cleaningDoneBy: ev.target.value })}
                      />
                    </td>
                    <td className="edit-cell">
                      <input
                        className="input input-sm fhr18-input notranslate"
                        translate="no"
                        list="fhr18-record-people"
                        data-field="verified"
                        {...bound(e.pcId, "verifiedBy")}
                        aria-label={`${label} — verified by`}
                        disabled={!editable}
                        value={e.verifiedBy}
                        onChange={(ev) => updateEntry(e.pcId, { verifiedBy: ev.target.value })}
                      />
                    </td>
                  </tr>
                </tbody>
              );
            })}
          </table>
        </div>
      </section>

      {editable && (
        <datalist id="fhr18-record-people">
          {master.employees.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
      )}
    </div>
  );
}
