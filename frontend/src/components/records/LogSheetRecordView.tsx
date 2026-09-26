import React from "react";
import { FiAlertTriangle, FiPlus, FiTrash2 } from "react-icons/fi";
import type { DocumentDefinition, LogColumn, LogHeaderField, LogSheetData, LogSheetRow, RecordInstance } from "../../types";
import { DocumentHeader } from "../documents/DocumentHeader";
import { getLogSheetLayoutForRecord } from "../../data/seed/logSheetLayouts";
import { departmentOfDocument } from "../../data/seed/departments";
import { masterRepository } from "../../data/repositories/masterRepository";
import { hrMasterRepository } from "../../data/repositories/hrMasterRepository";
import { applyFills, hrMasterLinkFor, personFill, personNamed } from "../../engine/hrMaster";
import { HrMasterFetch, HrMasterPeopleList } from "./HrMasterFetch";
import { equipmentLinkFor, equipmentMasterVisible, machineBlankFills } from "../../engine/equipmentMaster";
import { EquipmentFetch, EquipmentMachineList } from "./EquipmentFetch";
import { isOutOfBand, supersededRevisionOf } from "../../engine/validation";
import { withComputedCells } from "../../engine/computedCells";
import { documentLayoutIn, documentTextIn, keepFormAsIssued } from "../../i18n/documentText";
import { useAppStore } from "../../store/AppStore";
import { formatDisplayDate } from "../../utils/date";
import { generateId } from "../../utils/id";
import { useProgressiveCount } from "../../utils/useProgressive";
import { SheetChart } from "../charts/SheetChart";

/** A sheet open for writing with more lines than this draws only those near the screen (REQUIREMENTS §76). */
const DRAW_NEAR_FROM = 60;
/** How far above and below the screen a line is still drawn: some thirty lines, so a line is drawn before it can be seen. */
const DRAW_NEAR_MARGIN = "1500px 0px";

// One renderer for every grid-shaped log sheet. The shape of the form —
// header fields, columns, how rows are created — comes entirely from the
// document's LogSheetLayout, so a new register is configuration, not code.
export function LogSheetRecordView({
  doc,
  record,
  editable,
  onChange,
  lists,
}: {
  doc: DocumentDefinition;
  record: RecordInstance<LogSheetData>;
  editable: boolean;
  onChange: (data: LogSheetData) => void;
  /**
   * The suggestion list a box offers, by the box's key — the id of a
   * <datalist> the page draws, e.g. { machineIdNo: "equipment-machines" }
   * (REQUIREMENTS §74). It takes the place of the layout's own `list` and of
   * the employee names a box whose label names a person would otherwise offer.
   */
  lists?: Record<string, string>;
}) {
  // The form reads in the language chosen beside Today's Briefing: a form the
  // department issues in Gujarati reads in English while English is chosen
  // (REQUIREMENTS §58, i18n/documentText.ts). The KEYS never change, so what a
  // record holds is untouched either way.
  const { lang, version } = useAppStore();
  // The layout THIS RECORD was filled on: the format as it stands, or — for a
  // page kept on a revision the format has since replaced — that revision's
  // own boxes and columns (REQUIREMENTS §74).
  const issued = getLogSheetLayoutForRecord(doc.id, record);
  const layout = documentLayoutIn(issued, lang);
  const superseded = supersededRevisionOf(record);
  // A form the department issues in Gujarati already reads in Gujarati, so with
  // ગુજરાતી chosen it is not handed to Google at all — it reads as issued.
  const asIssued = keepFormAsIssued(doc.id, lang);
  // EVERY WORKED-OUT CELL IS WORKED OUT FROM WHAT IS WRITTEN — the purchase
  // registers' weighted ratings (§68), the calibration deviations (§61), the
  // breakdown register's total minutes (§74) — in one pass
  // (engine/computedCells.ts). It is applied on the way in as well as on the
  // way out, so a formula cell is right the moment a figure is entered AND
  // right on a record that was written elsewhere. Worked out once per version
  // of the record rather than on every render, so a long register is not
  // walked again for a render that changed nothing in it.
  const stored = record.data;
  const data = React.useMemo(() => withComputedCells(doc.id, stored ?? { header: {}, rows: [] }), [doc.id, stored]);
  // Read when the store moves on, not on every render: a keystroke is a render,
  // and typing into F/SYS/01's 173 lines read the master data from storage on
  // every key (REQUIREMENTS §76). The store's version moves with every change
  // made here or pulled from the server, so a name added to Master Data on
  // another computer is offered here too. One array for the whole sheet also
  // lets each line skip a render it does not need.
  const employees = React.useMemo(() => masterRepository.get().employees, [doc.id, version]);
  const employeeNames = React.useMemo(() => employees.map((e) => e.name), [employees]);
  // THE SAME HANDLERS ON EVERY RENDER (REQUIREMENTS §76). A line or a box is
  // drawn again only when what it shows changes (SheetRow, SheetBox below): a
  // keystroke in one cell of a 173-line register redraws that line, not 1,557
  // boxes — every one of which the browser then laid out again. These forward to
  // the latest handlers, which are set further down on every render.
  const handlers = React.useRef<{
    setCell: (rowId: string, key: string, value: string | number | null) => void;
    setHeader: (key: string, value: string) => void;
    fillFromName: (rowId: string | null, value: string) => void;
    fillFromMachine: (rowId: string | null, value: string) => void;
    removeRow: (rowId: string) => void;
  } | null>(null);
  const onCell = React.useCallback((rowId: string, key: string, value: string | number | null) => handlers.current?.setCell(rowId, key, value), []);
  const onBox = React.useCallback((key: string, value: string) => handlers.current?.setHeader(key, value), []);
  const onPersonBlur = React.useCallback((rowId: string | null, value: string) => handlers.current?.fillFromName(rowId, value), []);
  const onMachineBlur = React.useCallback((rowId: string | null, value: string) => handlers.current?.fillFromMachine(rowId, value), []);
  const onRemoveRow = React.useCallback((rowId: string) => handlers.current?.removeRow(rowId), []);
  // Before the early return below: a hook called only on some renders breaks
  // React ("rendered fewer hooks than expected") the moment this component is
  // reused for a document without a layout.
  // The reference material the form prints beside the grid, shown or hidden as
  // one: F/PUR/05's four criteria tables are one printed band across the top of
  // the form, so "Show" on any of them shows the criteria (REQUIREMENTS §68).
  const [showReference, setShowReference] = React.useState(false);
  // A long sheet shows its first lines at once and the rest a batch at a time (utils/useProgressive.ts).
  const rowsShown = useProgressiveCount(data.rows.length, 25, 40);
  // A LONG REGISTER OPEN FOR WRITING DRAWS ONLY THE LINES NEAR THE SCREEN
  // (REQUIREMENTS §76). Every box the browser draws is work on every keystroke,
  // wherever it is: typing into F/SYS/01's 173 lines of nine boxes cost a slow
  // laptop a fifth of a second a key with all of them drawn. A line more than
  // about thirty lines off the screen is marked is-far and not drawn
  // (styles.css); it keeps its place, its boxes and what they hold, and is
  // drawn again before it scrolls into sight. Printing and the downloads
  // (utils/documentExport.ts) take every line.
  const bodyRef = React.useRef<HTMLTableSectionElement | null>(null);
  const drawNear = editable && rowsShown > DRAW_NEAR_FROM;
  // Which lines there are — a new line, or a sheet whose lines were all
  // replaced, is watched afresh. Not the rows themselves: a keystroke makes
  // new ones.
  const lineIds = React.useMemo(() => data.rows.map((r) => r.id).join("\u0001"), [data.rows]);
  React.useEffect(() => {
    const body = bodyRef.current;
    if (!drawNear || !body || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.target.classList.toggle("is-far", !e.isIntersecting);
      },
      { rootMargin: DRAW_NEAR_MARGIN }
    );
    const lines = Array.from(body.rows);
    for (const tr of lines) io.observe(tr);
    return () => {
      io.disconnect();
      for (const tr of lines) tr.classList.remove("is-far");
    };
  }, [drawNear, rowsShown, lineIds]);

  if (!layout) {
    return <div className="empty-state">No layout is configured for this document (id: {doc.id}).</div>;
  }

  const save = (next: LogSheetData) => onChange(withComputedCells(doc.id, next));
  const setHeader = (key: string, value: string) => save({ ...data, header: { ...data.header, [key]: value } });
  const setCell = (rowId: string, key: string, value: string | number | null) =>
    save({ ...data, rows: data.rows.map((r) => (r.id === rowId ? { ...r, [key]: value } : r)) });
  const addRow = () => {
    const row: LogSheetRow = { id: generateId("row") };
    for (const c of layout.columns) row[c.key] = c.type === "number" ? null : c.autoFill?.default !== undefined && c.type !== "text" ? String(c.autoFill.default) : "";
    save({ ...data, rows: [...data.rows, row] });
  };
  const removeRow = (rowId: string) => save({ ...data, rows: data.rows.filter((r) => r.id !== rowId) });

  // HR formats that name a person fetch them from HR Master Data (REQUIREMENTS
  // §53): the bar above the form, and a name box left holding a name — or a GP3
  // No. — that is on the sheet has that person's BLANK boxes filled. Nothing
  // already written is changed here.
  const link = hrMasterLinkFor(doc.id);
  const fetching = !!link && editable;
  const fillFromName = (rowId: string | null, value: string) => {
    if (!link || !editable) return;
    const person = personNamed(value, hrMasterRepository.all());
    if (!person) return;
    if (rowId === null) {
      const header = { ...data.header, [link.nameField]: value };
      const { fills } = personFill(link, person, header);
      if (fills.length > 0) save({ ...data, header: applyFills(header, fills) });
      return;
    }
    const row = data.rows.find((r) => r.id === rowId);
    if (!row) return;
    const current = { ...row, [link.nameField]: value };
    const { fills } = personFill(link, person, current);
    if (fills.length > 0) save({ ...data, rows: data.rows.map((r) => (r.id === rowId ? applyFills(current, fills) : r)) });
  };

  // THE MAINTENANCE FORMATS FETCH A MACHINE FROM THE EQUIPMENT MASTER, F/MNT/01
  // (REQUIREMENTS §74), the same way the HR formats fetch a person: the bar
  // above the form, the list of machine numbers on the Machine No. box, and a
  // number left in that box fills the machine's BLANK boxes. Nothing already
  // written is changed here. Only for an account that may see Maintenance's
  // list, and never on F/MNT/01 itself.
  const eqLink = equipmentLinkFor(doc.id);
  const eqFetching = !!eqLink && editable && equipmentMasterVisible();
  const fillFromMachine = (rowId: string | null, value: string) => {
    if (!eqLink || !eqFetching) return;
    if (rowId === null) {
      const header = { ...data.header, [eqLink.idField]: value };
      const fills = machineBlankFills(eqLink, header, value);
      if (fills.length > 0) save({ ...data, header: applyFills(header, fills) });
      return;
    }
    const row = data.rows.find((r) => r.id === rowId);
    if (!row) return;
    const current = { ...row, [eqLink.idField]: value };
    const fills = machineBlankFills(eqLink, current, value);
    if (fills.length > 0) save({ ...data, rows: data.rows.map((r) => (r.id === rowId ? applyFills(current, fills) : r)) });
  };
  // A machine box offers the machine numbers; the machine's OTHER boxes offer
  // nothing — without the "" a "Machine Name:" box would offer employees.
  const machineHeaderList = (key: string): string | undefined => {
    if (!eqLink || eqLink.where !== "header" || !eqLink.fields.some((x) => x.key === key)) return undefined;
    return eqFetching && eqLink.idField === key ? "equipment-machines" : "";
  };
  // What the stable handlers above forward to: this render's, which hold this render's data.
  handlers.current = { setCell, setHeader, fillFromName, fillFromMachine, removeRow };

  const mode = layout.rowMode;
  const qcForm = departmentOfDocument(doc.id, doc.formatNo) === "QC";
  const canAddRows = editable && mode.kind === "free";
  const canRemoveRows = editable && mode.kind === "free" && data.rows.length > (mode.minRows ?? 0);
  const outOfBand = data.rows.reduce((n, row) => n + layout.columns.filter((c) => isOutOfBand(c, row[c.key])).length, 0);
  // A FORM THE PAPER PRINTS AS BOXES ALONE has no grid to draw — the Supplier
  // Registration Form is labelled lines and prose blocks from the top of page 1
  // to the bottom of page 3 (REQUIREMENTS §68). Drawing the empty table would
  // put a Sr. No. column on a form that has none.
  const hasGrid = layout.columns.length > 0;
  // The heading rows: the columns grouped into the runs the paper draws under
  // one spanning heading, and two rows instead of one where there is such a run.
  const headRuns = headingRuns(layout.columns);
  const headRows = headRuns.some((r) => r.group !== undefined) ? 2 : 1;

  return (
    <div className={asIssued ? "notranslate" : undefined} translate={asIssued ? "no" : undefined}>
      <DocumentHeader
        doc={doc}
        dateLabel={formatDisplayDate(record.dueDate)}
        pageLabel="1 of 1 (digital)"
        revision={superseded ? { no: superseded.revisionNo, date: superseded.revisionDate } : undefined}
      />
      {/* A page kept on the revision it was written on says so (REQUIREMENTS §74). */}
      {superseded && (
        <div className="card mt-4 no-print" data-superseded-revision={superseded.revisionNo}>
          <div className="card-pad text-sm">
            Filled on Rev {superseded.revisionNo} of this format ({formatDisplayDate(superseded.revisionDate)}), which Rev {doc.revisionNo} has since replaced. It is
            shown as it was written, on the revision it was written on, and is kept as it is.
            {superseded.note ? ` ${superseded.note}` : ""}
          </div>
        </div>
      )}

      {(layout.instructions?.length || layout.headerFields.length > 0) && (
        <div className="card mt-4">
          <div className="card-pad">
            {layout.instructions?.map((line, i) => (
              <p key={i} className={`text-sm ${i === 0 ? "font-semibold" : "text-muted"} ${i < (layout.instructions?.length ?? 0) - 1 ? "mb-1" : ""}`}>
                {line}
              </p>
            ))}
            {layout.referenceTables?.map((t) => (
              <div key={t.title} className="mt-2">
                <button className="btn btn-ghost btn-sm no-print" style={{ padding: "2px 6px" }} onClick={() => setShowReference((s) => !s)}>
                  {showReference ? "Hide" : "Show"} {t.title}
                </button>
                {showReference && (
                  <div className="doc-table mt-2" style={{ overflowX: "auto" }}>
                    <table className="compact">
                      <thead>
                        <tr>
                          {t.columns.map((c) => (
                            <th key={c}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {t.rows.map((r, ri) => (
                          <tr key={ri}>
                            {r.map((cell, ci) => (
                              <td key={ci} className={`text-xs ${ci === 0 ? "font-semibold" : ""}`} style={{ verticalAlign: "top", whiteSpace: "normal" }}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {layout.headerFields.length > 0 && (
              <div className="grid mt-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px 16px" }}>
                {layout.headerFields.map((f, fi) => {
                  const personBox = fetching && link?.where === "header" && link.nameField === f.key;
                  const machineList = machineHeaderList(f.key);
                  const machineIdBox = eqFetching && eqLink?.where === "header" && eqLink.idField === f.key;
                  return (
                    <SheetBox
                      key={f.key}
                      field={f}
                      issuedLabel={issued?.headerFields[fi]?.label ?? f.label}
                      value={data.header?.[f.key] ?? ""}
                      editable={editable}
                      onBox={onBox}
                      employees={employeeNames}
                      list={personBox ? "hr-master-people" : machineList !== undefined ? machineList : (lists?.[f.key] ?? f.list)}
                      onBoxBlur={personBox ? onPersonBlur : machineIdBox ? onMachineBlur : undefined}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {fetching && link && <HrMasterFetch key={record.id} link={link} layout={layout} data={data} onChange={save} newRowId={() => generateId("row")} />}
      {eqFetching && eqLink && <EquipmentFetch key={`eq-${record.id}`} link={eqLink} layout={layout} data={data} onChange={save} newRowId={() => generateId("row")} />}

      {outOfBand > 0 && (
        <div className="card mt-4 no-print" style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}>
          <div className="card-pad text-sm">
            <FiAlertTriangle size={13} style={{ verticalAlign: -2 }} /> {outOfBand} reading{outOfBand === 1 ? " is" : "s are"} outside the printed acceptance band (highlighted). Add a remark
            explaining the deviation and inform the shift in-charge.
          </div>
        </div>
      )}

      {hasGrid && (
      <div className="doc-table mt-4" style={{ overflowX: "auto" }}>
        <table className={editable ? "compact log-sheet is-editing" : "compact log-sheet"}>
          <thead>
            <tr>
              <th style={{ width: 44 }} rowSpan={headRows}>
                Sr. No.
              </th>
              {/* A run of columns the paper draws under ONE spanning heading gets
                  that heading here and its own headings on the row below; every
                  other column spans both rows, as it does on the paper. */}
              {headRuns.map((run, ri) => (
                <React.Fragment key={run.group ?? `column-${ri}`}>
                  {run.group === undefined ? (
                    run.columns.map((c) => <ColumnHead key={c.key} col={c} rowSpan={headRows} />)
                  ) : (
                    <th className="col-group" colSpan={run.columns.length}>
                      {run.group}
                    </th>
                  )}
                </React.Fragment>
              ))}
              {canRemoveRows && <th style={{ width: 36 }} rowSpan={headRows}></th>}
            </tr>
            {headRows === 2 && (
              <tr>
                {layout.columns.filter((c) => c.group !== undefined).map((c) => (
                  <ColumnHead key={c.key} col={c} />
                ))}
              </tr>
            )}
          </thead>
          <tbody ref={bodyRef}>
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={layout.columns.length + 2} className="text-muted text-center" style={{ padding: 16 }}>
                  No rows yet.
                </td>
              </tr>
            )}
            {data.rows.slice(0, rowsShown).map((row, i) => (
              <SheetRow
                key={row.id}
                row={row}
                index={i}
                columns={layout.columns}
                issuedColumns={issued?.columns}
                fixedRow={mode.kind === "fixedRows" ? mode.rows[i] : undefined}
                editable={editable}
                lang={lang}
                employees={employeeNames}
                lists={lists}
                personKey={fetching && link?.where === "rows" ? link.nameField : undefined}
                machineKey={eqFetching && eqLink?.where === "rows" ? eqLink.idField : undefined}
                canRemove={canRemoveRows}
                onCell={onCell}
                onPersonBlur={onPersonBlur}
                onMachineBlur={onMachineBlur}
                onRemove={onRemoveRow}
              />
            ))}
          </tbody>
        </table>
      </div>
      )}
      {hasGrid && canAddRows && (
        <button className="btn btn-secondary btn-sm mt-2" onClick={addRow}>
          <FiPlus size={13} /> Add Row
        </button>
      )}

      {/* The charts the form prints from its own figures (REQUIREMENTS §77). */}
      {layout.charts?.map((chart, i) => (
        <SheetChart key={i} chart={chart} data={data} />
      ))}

      {layout.footerFields && layout.footerFields.length > 0 && (
        <div className="card mt-4">
          <div className="card-pad">
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px 16px" }}>
              {layout.footerFields.map((f, fi) => (
                <SheetBox
                  key={f.key}
                  field={f}
                  issuedLabel={issued?.footerFields?.[fi]?.label ?? f.label}
                  value={data.header?.[f.key] ?? ""}
                  editable={editable}
                  onBox={onBox}
                  employees={employeeNames}
                  list={lists?.[f.key] ?? f.list}
                />
              ))}
            </div>
            {/* The QA Manager's approval is a QC form's own box, so the line
                about it belongs under QC forms only: under a Maintenance or a
                Purchase footer it named a signature those forms do not have
                (REQUIREMENTS §74). */}
            {qcForm && (
              <div className="text-xs text-muted mt-3 no-print">
                "Approved by (QA Manager)" on the paper form is the <strong>Verify</strong> step here — the verifier's name and time are stamped automatically.
              </div>
            )}
          </div>
        </div>
      )}
      {fetching && <HrMasterPeopleList />}
      {eqFetching && <EquipmentMachineList />}
      <datalist id="log-sheet-employees">
        {employees.map((e) => (
          <option key={e.id} value={e.name} />
        ))}
      </datalist>
      <div className="text-xs text-faint mt-3 no-print">Specimen source: {layout.specimenSource}</div>
    </div>
  );
}

// The columns as the grid heads them: consecutive columns carrying the same
// `group` become one run, and every other column is a run of its own.
function headingRuns(columns: LogColumn[]): { group?: string; columns: LogColumn[] }[] {
  const runs: { group?: string; columns: LogColumn[] }[] = [];
  for (const col of columns) {
    const last = runs[runs.length - 1];
    if (last && last.group !== undefined && last.group === col.group) last.columns.push(col);
    else runs.push({ group: col.group, columns: [col] });
  }
  return runs;
}

function ColumnHead({ col, rowSpan }: { col: LogColumn; rowSpan?: number }) {
  return (
    <th
      style={col.width ? { minWidth: col.width } : undefined}
      rowSpan={rowSpan}
      title={col.nominal !== undefined ? `Nominal ${col.nominal}${col.unit ? " " + col.unit : ""}; band ${col.min}–${col.max}` : undefined}
    >
      {col.label}
    </th>
  );
}

/**
 * ONE LINE OF THE GRID, drawn again only when that line changes (REQUIREMENTS
 * §76). Everything it is handed is either the line itself — a new object only
 * when one of its cells was written — or the same on every render: the layout's
 * columns, the handlers (which carry the line's id when they are called), the
 * employee names. So a keystroke in one cell of F/SYS/01's 173 lines redraws one
 * line, where it used to redraw every box on the sheet and the browser then laid
 * all 1,557 of them out again: 900 ms a keystroke on a slow laptop.
 */
const SheetRow = React.memo(function SheetRow({
  row,
  index,
  columns,
  issuedColumns,
  fixedRow,
  editable,
  lang,
  employees,
  lists,
  personKey,
  machineKey,
  canRemove,
  onCell,
  onPersonBlur,
  onMachineBlur,
  onRemove,
}: {
  row: LogSheetRow;
  index: number;
  columns: LogColumn[];
  issuedColumns: LogColumn[] | undefined;
  /** The line the form prints here, on a form that prints its lines. */
  fixedRow: Record<string, string | number | null> | undefined;
  editable: boolean;
  lang: Parameters<typeof documentTextIn>[1];
  employees: string[];
  lists?: Record<string, string>;
  /** The column that names a person HR Master Data can fill a line from (REQUIREMENTS §53). */
  personKey?: string;
  /** The column that names a machine the equipment master can fill a line from (REQUIREMENTS §74). */
  machineKey?: string;
  canRemove: boolean;
  onCell: (rowId: string, key: string, value: string | number | null) => void;
  onPersonBlur: (rowId: string | null, value: string) => void;
  onMachineBlur: (rowId: string | null, value: string) => void;
  onRemove: (rowId: string) => void;
}) {
  return (
    <tr>
      <td className="text-muted">{index + 1}</td>
      {columns.map((c, ci) => {
        // A line the form prints blank (F/HR/05's two spare topic lines)
        // has nothing fixed in it, so it is written in like any cell.
        const printedBlank = c.fixed && fixedRow !== undefined && String(fixedRow[c.key] ?? "") === "";
        const col = printedBlank ? { ...c, fixed: false } : c;
        return (
          <td key={c.key} className={isOutOfBand(c, row[c.key]) ? "cell-out-of-band" : ""}>
            <CellInput
              col={col}
              issuedLabel={issuedColumns?.[ci]?.label ?? c.label}
              // A printed cell — the parameter, the material, the specification
              // the form prints down its side — reads in the chosen language;
              // a written one reads exactly as it was written.
              value={col.fixed ? documentTextIn(row[c.key], lang) : row[c.key]}
              editable={editable && !col.fixed && !col.computed}
              onChange={(v) => onCell(row.id, c.key, v)}
              employees={employees}
              list={personKey === c.key ? "hr-master-people" : machineKey === c.key ? "equipment-machines" : (lists?.[c.key] ?? c.list)}
              onBlur={personKey === c.key ? (v) => onPersonBlur(row.id, v) : machineKey === c.key ? (v) => onMachineBlur(row.id, v) : undefined}
            />
          </td>
        );
      })}
      {canRemove && (
        <td>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onRemove(row.id)} title="Remove row">
            <FiTrash2 size={13} />
          </button>
        </td>
      )}
    </tr>
  );
});

/**
 * One box above or below the grid, drawn again only when its own value changes
 * (REQUIREMENTS §76) — F/SYS/04's eighty boxes are not redrawn for a keystroke in
 * its objectives table. The handlers are the sheet's stable ones and are handed
 * the box's key when they are called.
 */
const SheetBox = React.memo(function SheetBox({
  field,
  issuedLabel,
  value,
  editable,
  onBox,
  employees,
  list,
  onBoxBlur,
}: {
  field: LogHeaderField;
  issuedLabel: string;
  value: string;
  editable: boolean;
  onBox: (key: string, value: string) => void;
  employees: string[];
  list?: string;
  /** The person or machine fetch a box offers when it is left (REQUIREMENTS §53, §74); called with no line. */
  onBoxBlur?: (rowId: string | null, value: string) => void;
}) {
  return (
    <HeaderFieldInput
      field={field}
      issuedLabel={issuedLabel}
      value={value}
      editable={editable}
      onChange={(v) => onBox(field.key, v)}
      employees={employees}
      list={list}
      onBlur={onBoxBlur ? (v) => onBoxBlur(null, v) : undefined}
    />
  );
});

function HeaderFieldInput({
  field,
  issuedLabel,
  value,
  editable,
  onChange,
  employees,
  list,
  onBlur,
}: {
  field: LogHeaderField;
  /** The label AS ISSUED — which boxes offer the employee list cannot depend on the language being read (REQUIREMENTS §58). */
  issuedLabel: string;
  value: string;
  editable: boolean;
  onChange: (v: string) => void;
  employees: string[];
  /** A suggestion list of its own (HR Master Data's people), in place of the employees. */
  list?: string;
  onBlur?: (v: string) => void;
}) {
  // A box that names a PERSON offers the employee names. "Machine Name:",
  // "Name of Equipment:" and "EQUIPMENT NAME" name a machine (REQUIREMENTS §74),
  // and offering them the people on the payroll put a person's name one tap
  // away from a machine's box. "Sign" is a word of its own: "Designation" holds
  // a post, not a person (REQUIREMENTS §76).
  const isName =
    /operator|name|inspected|person|\bsign/i.test(issuedLabel) && field.type === "text" && !/job name|customer name|machine|equipment|equipoment/i.test(issuedLabel);
  // A box WORKED OUT from the sheet — F/MKT/02's totals and its % Satisfaction
  // Index (REQUIREMENTS §77) — reads as text, as a worked-out cell does.
  if (field.computed) {
    return (
      <div className="field">
        <label>{field.label}</label>
        <span className="cell-text notranslate" translate="no" data-computed={field.key}>
          {value}
        </span>
      </div>
    );
  }
  // A block of prose is its own kind of box: it takes the width of the row it
  // sits in and grows with what is written (REQUIREMENTS §68).
  if (field.type === "paragraph") {
    return (
      <div className="field field-paragraph">
        <label>
          {field.label}
          {field.required ? " *" : ""}
        </label>
        <ParagraphInput value={value} editable={editable} onChange={onChange} />
      </div>
    );
  }
  return (
    <div className="field">
      <label>
        {field.label}
        {field.required ? " *" : ""}
      </label>
      {/* A BOX THE FORM PRINTS AS A CHOICE is offered as one, and "yesno"
          means the same thing here as it does in the grid above: the two
          answers, without them having to be written out in the layout. It did
          not, and so F/PUR/01's "DO YOU HOLD ISO 9001 ... CERTIFICATION:"
          asked a yes-or-no question and gave a free text box to answer it
          (REQUIREMENTS §68, found while adding F/STR/01 in §71, whose stamp is
          seven such questions). */}
      {field.type === "select" || field.type === "yesno" ? (
        <select className="input input-sm" disabled={!editable} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {(field.type === "yesno" ? ["Yes", "No"] : (field.options ?? [])).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="input input-sm"
          type={field.type === "date" ? "date" : field.type === "time" ? "time" : "text"}
          list={list ?? (isName ? "log-sheet-employees" : undefined)}
          disabled={!editable}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
        />
      )}
      {isName && employees.length === 0 ? null : null}
    </div>
  );
}

/**
 * The box a form prints for a block of prose. It is never given a placeholder —
 * a hint sitting in an empty box on a controlled record could be read as
 * something somebody wrote — and it is sized to what it holds, so the whole
 * block is on the paper with no scrollbar cutting it off. A record that cannot
 * be written on shows the block as text, exactly as it was written.
 */
const SIZES_ITSELF = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content");

function ParagraphInput({ value, editable, onChange }: { value: string; editable: boolean; onChange: (v: string) => void }) {
  const box = React.useRef<HTMLTextAreaElement | null>(null);
  React.useLayoutEffect(() => {
    // A browser that sizes the box to its words by itself (styles.css,
    // field-sizing) is left to: measuring every box in turn made opening a form
    // of 37 of them for Edit wait on 37 layouts (REQUIREMENTS §76).
    if (SIZES_ITSELF) return;
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, editable]);
  if (!editable) {
    return (
      <p className="paragraph-text notranslate" translate="no">
        {value}
      </p>
    );
  }
  return <textarea ref={box} className="input input-sm input-paragraph" rows={2} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function CellInput({
  col,
  issuedLabel,
  value,
  editable,
  onChange,
  employees,
  list,
  onBlur,
}: {
  col: LogColumn;
  /** As in HeaderFieldInput: the issued label, so a signature column is one in either language. */
  issuedLabel: string;
  value: string | number | null | undefined;
  editable: boolean;
  onChange: (v: string | number | null) => void;
  employees: string[];
  list?: string;
  onBlur?: (v: string) => void;
}) {
  if (col.fixed) return <span className={`text-sm ${col.key === "specification" || col.key === "testChart" ? "text-muted" : "font-semibold"}`} style={{ whiteSpace: "pre-line" }}>{value ?? ""}</span>;
  // A sheet that cannot be written on (a preview, a submitted or verified record)
  // shows what is written as text: the same words, without a greyed-out box —
  // and a fraction of the page to build (a disabled choice box carried every
  // option with it).
  if (!editable) {
    const shown = value === null || value === undefined ? "" : col.type === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDisplayDate(value) : String(value);
    // What was WRITTEN into the record — a reading, a name signed, a remark —
    // reads exactly as it was written in either language (REQUIREMENTS §58).
    // The form's own printed cells are above, and those do follow the language.
    return (
      <span className="cell-text notranslate" translate="no">
        {shown}
      </span>
    );
  }
  if (col.type === "number") {
    return (
      <input
        type="number"
        step={col.decimals === 0 ? 1 : Math.pow(10, -(col.decimals ?? 2))}
        className="input input-sm"
        disabled={!editable}
        value={value === null || value === undefined ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        title={col.unit}
      />
    );
  }
  if (col.type === "yesno" || col.type === "select") {
    const opts = col.type === "yesno" ? ["Yes", "No"] : (col.options ?? []);
    return (
      <select className="input input-sm" disabled={!editable} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  // A cell of several lines — a bulleted observation, a requirement's text —
  // is written in a box that keeps its line breaks (REQUIREMENTS §76). It is
  // sized by the stylesheet (field-sizing) and its line count, never measured
  // in a layout effect: a checklist of 150 such cells would otherwise force 150
  // reflows as it opened on a slow laptop.
  if (col.multiline && col.type === "text") {
    const written = typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
    return (
      <textarea
        className="input input-sm input-cell-multiline"
        rows={Math.min(8, Math.max(2, written.split("\n").length))}
        value={written}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
      />
    );
  }
  const isSign = !!col.autoFill?.sign || /\bsign|by$/i.test(issuedLabel);
  return (
    <input
      type={col.type === "time" ? "time" : col.type === "date" ? "date" : "text"}
      className="input input-sm"
      list={list ?? (isSign && employees.length ? "log-sheet-employees" : undefined)}
      disabled={!editable}
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
    />
  );
}
