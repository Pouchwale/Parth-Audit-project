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
import { addFlyCatcherVisit, newVisitProblem, visitsInMonth } from "../../engine/flyRegister";
import { isEditableStatus, saveDraft } from "../../engine/recordLifecycle";
import { recordRepository } from "../../data/repositories/recordRepository";
import { useAppStore } from "../../store/AppStore";
import { todayISO } from "../../utils/date";
import { BIND_RECORD_ATTR } from "../../engine/roundTrip/bindPath";

// A FLY CATCHER VISIT ON ITS OWN PAGE, LAID OUT AS F/HR/18 PRINTS — the
// company's own Word original (source-documents/F-HR-18_Fly Catcher Inspection
// & Cleaning Record.doc, sent 16-Oct-2026; REQUIREMENTS §111 part 9): the
// header block, the "Month & Year" line, the legend of the thirteen units and
// where they hang, then the grid — PC ID NO. | DATE OF SERVICE | FLIES CATCH
// COUNT APPROX. | DATE OF TUBE LIGHT INSTALLATION | DUE DATE FOR TUBE LIGHT
// REPLACEMENT | CLEANING DONE BY | VERIFIED BY — the paper's two lines per unit,
// one for each of the month's fortnightly visits (the owner, 30-Oct-2026,
// REQUIREMENTS §147: the visit "is not showing second row"): this visit's line
// to fill in, the month's other visit's as written on its own record, and a
// blank line for a visit still to come - on the screen only, as a line nobody
// wrote never prints (§126). (The monthly register, FlyCatcherRegisterSheet.tsx,
// draws the same from the month's visits, PC-01..08 on its first page and
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
  // The month's visits in date order, this one among them; at least the paper's two lines a unit (§147).
  const [year, month] = record.dueDate.split("-").map(Number);
  const { currentUser, bump } = useAppStore();
  const [visitsSeen, setVisitsSeen] = React.useState(0);
  const others = React.useMemo(
    () => visitsInMonth(year, month - 1, record.isDemo).filter((r) => r.id !== record.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [year, month, record.isDemo, record.id, visitsSeen]
  );
  const lines: (RecordInstance<FlyCatcherData> | null)[] = [...others, record].sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  while (lines.length < 2) lines.push(null);
  const otherDate = (iso: string | null | undefined) => (iso ? paperDate(iso) : "");
  // THE MONTH'S OTHER VISIT, FILLED IN HERE TOO (the owner, 30-Oct-2026: "make sure user can add anything ... like you can
  // see in format which i have provided", §147): what is typed on its line is saved into that visit through its own
  // saveDraft - a line in its history - a moment after the last keystroke and on leaving, as the register does.
  const pending = React.useRef(new Map<string, FlyCatcherData>());
  const [typedOther, setTypedOther] = React.useState(0);
  const who = React.useRef(currentUser);
  who.current = currentUser;
  const flushOthers = React.useCallback(() => {
    if (pending.current.size === 0) return;
    for (const [id, d] of pending.current) {
      const rec = recordRepository.getById(id) as RecordInstance<FlyCatcherData> | undefined;
      if (rec && isEditableStatus(rec.status)) saveDraft(rec, d, who.current);
    }
    pending.current.clear();
  }, []);
  React.useEffect(() => {
    if (typedOther === 0) return;
    const h = window.setTimeout(flushOthers, 700);
    return () => window.clearTimeout(h);
  }, [typedOther, flushOthers]);
  React.useEffect(() => {
    window.addEventListener("pagehide", flushOthers);
    window.addEventListener("beforeunload", flushOthers);
    return () => {
      window.removeEventListener("pagehide", flushOthers);
      window.removeEventListener("beforeunload", flushOthers);
      flushOthers();
    };
  }, [flushOthers]);
  const otherData = (r: RecordInstance<FlyCatcherData>): FlyCatcherData => pending.current.get(r.id) ?? r.data;
  const updateOther = (r: RecordInstance<FlyCatcherData>, pcId: string, patch: EntryPatch) => {
    const base = otherData(r);
    pending.current.set(r.id, { ...base, entries: base.entries.map((x) => (x.pcId === pcId ? { ...x, ...patch } : x)) });
    setTypedOther((n) => n + 1);
  };
  // A BLANK LINE'S DATE OF SERVICE STARTS THAT VISIT (engine/flyRegister.ts addFlyCatcherVisit, as the register's Add
  // visit): a date in this month, not to come, not a day already on the sheet; then its line opens for the rest.
  const [addProblem, setAddProblem] = React.useState<string | null>(null);
  const startVisit = (dateISO: string) => {
    const problem = newVisitProblem(dateISO, year, month - 1, record.isDemo, todayISO());
    setAddProblem(problem);
    if (problem) return;
    addFlyCatcherVisit(dateISO, record.isDemo, currentUser);
    setVisitsSeen((n) => n + 1);
    bump();
  };
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

        {addProblem && (
          <p className="text-sm no-print" data-section="fhr18-add-problem" role="alert" style={{ color: "var(--danger, #b91c1c)", margin: "6px 0" }}>
            {addProblem}
          </p>
        )}
        <div className="doc-table register-grid-wrap">
          <table className="register-grid fhr18-grid">
            <Fhr18GridHead host={host} />
            <tbody className="fhr18-gap" data-gap="first" aria-hidden="true">
              <tr>
                <td colSpan={7} />
              </tr>
            </tbody>
            {data.entries.map((e) => {
              const pcCell = (
                <td className="pc-cell notranslate" translate="no" rowSpan={lines.length}>
                  {at(`pc:${e.pcId}`, e.pcId, "Catcher")}
                </td>
              );
              // The five boxes the person fills on a line, for whichever visit the line is: this one (the page's own
              // record) or the month's other (bound to it, saved into it).
              const boxes = (visitDate: string, entry: FlyCatcherEntry, patch: (p: EntryPatch) => void, open: boolean, bind?: (field: FlyEntryField) => Record<string, string> | undefined) => {
                const label = `${e.pcId}, visit of ${formatDisplayDate(visitDate)}`;
                return (
                  <>
                    <td className="edit-cell">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="input input-sm fhr18-input"
                        data-field="count"
                        {...bind?.("catchCountApprox")}
                        aria-label={`${label} — flies catch count approx.`}
                        disabled={!open}
                        value={entry.catchCountApprox ?? ""}
                        onChange={(ev) => {
                          const n = Number(ev.target.value);
                          patch({ catchCountApprox: ev.target.value === "" || !Number.isFinite(n) ? null : Math.max(0, n) });
                        }}
                      />
                    </td>
                    <td className="edit-cell">
                      <input
                        type="date"
                        className="input input-sm fhr18-input"
                        data-field="installed"
                        {...bind?.("tubeLightInstallDate")}
                        // An empty date prints empty, not "dd-mm-yyyy" (REQUIREMENTS §111).
                        data-empty={entry.tubeLightInstallDate ? undefined : ""}
                        aria-label={`${label} — date of tube light installation`}
                        disabled={!open}
                        value={entry.tubeLightInstallDate ?? ""}
                        onChange={(ev) => patch({ tubeLightInstallDate: ev.target.value || null })}
                      />
                    </td>
                    <td className="edit-cell">
                      <input
                        type="date"
                        className="input input-sm fhr18-input"
                        data-field="due"
                        {...bind?.("tubeLightDueDate")}
                        data-empty={entry.tubeLightDueDate ? undefined : ""}
                        aria-label={`${label} — due date for tube light replacement`}
                        disabled={!open}
                        value={entry.tubeLightDueDate ?? ""}
                        onChange={(ev) => patch({ tubeLightDueDate: ev.target.value || null })}
                      />
                    </td>
                    {/* The names signed read exactly as they were written, in either language (REQUIREMENTS §58). */}
                    <td className="edit-cell">
                      <input
                        className="input input-sm fhr18-input notranslate"
                        translate="no"
                        list="fhr18-record-people"
                        data-field="cleaning"
                        {...bind?.("cleaningDoneBy")}
                        aria-label={`${label} — cleaning done by`}
                        disabled={!open}
                        value={entry.cleaningDoneBy ?? ""}
                        onChange={(ev) => patch({ cleaningDoneBy: ev.target.value })}
                      />
                    </td>
                    <td className="edit-cell">
                      <input
                        className="input input-sm fhr18-input notranslate"
                        translate="no"
                        list="fhr18-record-people"
                        data-field="verified"
                        {...bind?.("verifiedBy")}
                        aria-label={`${label} — verified by`}
                        disabled={!open}
                        value={entry.verifiedBy ?? ""}
                        onChange={(ev) => patch({ verifiedBy: ev.target.value })}
                      />
                    </td>
                  </>
                );
              };
              return (
                <tbody key={e.pcId} className="fhr18-unit" data-pc={e.pcId}>
                  {lines.map((line, i) => {
                    if (line && line.id !== record.id) {
                      const o = otherData(line).entries?.find((x) => x.pcId === e.pcId);
                      const written = !!o && (o.catchCountApprox !== null || !!o.cleaningDoneBy || !!o.verifiedBy);
                      // Filled in here while both are open for writing; a visit handed in or verified is read as written.
                      if (o && editable && isEditableStatus(line.status)) {
                        return (
                          <tr key={line.id} className="register-row fhr18-other-visit" data-visit={line.dueDate} data-empty-line={written ? undefined : ""} {...{ [BIND_RECORD_ATTR]: line.id }}>
                            {i === 0 && pcCell}
                            <td className="date-cell notranslate" translate="no">
                              {paperDate(line.dueDate)}
                            </td>
                            {boxes(line.dueDate, o, (p) => updateOther(line, e.pcId, p), true, (field) => bindProps(flyCatcherBind.entry(e.pcId, field)))}
                          </tr>
                        );
                      }
                      return (
                        <tr key={line.id} className="register-row fhr18-other-visit" data-visit={line.dueDate} data-empty-line={written ? undefined : ""}>
                          {i === 0 && pcCell}
                          <td className="date-cell notranslate" translate="no">
                            {written ? paperDate(line.dueDate) : ""}
                          </td>
                          <td className="fhr18-other">{o?.catchCountApprox ?? ""}</td>
                          <td className="fhr18-other notranslate" translate="no">
                            {otherDate(o?.tubeLightInstallDate)}
                          </td>
                          <td className="fhr18-other notranslate" translate="no">
                            {otherDate(o?.tubeLightDueDate)}
                          </td>
                          <td className="fhr18-other notranslate" translate="no">
                            {o?.cleaningDoneBy ?? ""}
                          </td>
                          <td className="fhr18-other notranslate" translate="no">
                            {o?.verifiedBy ?? ""}
                          </td>
                        </tr>
                      );
                    }
                    if (!line) {
                      // A fortnight's visit still to come: its date of service starts it here (a printed blank line
                      // otherwise, on the screen only, §126).
                      return (
                        <tr key={`blank-${i}`} className="register-row fhr18-other-visit" data-empty-line="">
                          {i === 0 && pcCell}
                          <td className="date-cell">
                            {editable && (
                              <input
                                type="date"
                                className="input input-sm fhr18-input"
                                data-field="fhr18-add-date"
                                data-empty=""
                                aria-label={`${e.pcId}, date of service of the month's other visit`}
                                title="The date of service of the month's other visit: it starts that visit, and its line opens"
                                value=""
                                onChange={(ev) => ev.target.value && startVisit(ev.target.value)}
                              />
                            )}
                          </td>
                          <td className="fhr18-other" />
                          <td className="fhr18-other" />
                          <td className="fhr18-other" />
                          <td className="fhr18-other" />
                          <td className="fhr18-other" />
                        </tr>
                      );
                    }
                    return (
                      <tr key={record.id} className="register-row" data-visit={record.dueDate}>
                        {i === 0 && pcCell}
                        {/* The visit's date, as the paper writes it (3/08/26). */}
                        <td className="date-cell notranslate" translate="no">
                          {at(`date:${e.pcId}`, serviceDate, "Date of service")}
                        </td>
                        {boxes(record.dueDate, e, (p) => updateEntry(e.pcId, p), editable, (field) => bound(e.pcId, field))}
                      </tr>
                    );
                  })}
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
