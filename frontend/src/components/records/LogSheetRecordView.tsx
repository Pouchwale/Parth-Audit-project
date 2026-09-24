import React from "react";
import { FiAlertTriangle, FiPlus, FiTrash2 } from "react-icons/fi";
import type { DocumentDefinition, LogColumn, LogHeaderField, LogSheetData, LogSheetRow, RecordInstance } from "../../types";
import { DocumentHeader } from "../documents/DocumentHeader";
import { getLogSheetLayout } from "../../data/seed/logSheetLayouts";
import { masterRepository } from "../../data/repositories/masterRepository";
import { hrMasterRepository } from "../../data/repositories/hrMasterRepository";
import { applyFills, hrMasterLinkFor, personFill, personNamed } from "../../engine/hrMaster";
import { HrMasterFetch, HrMasterPeopleList } from "./HrMasterFetch";
import { isOutOfBand } from "../../engine/validation";
import { withPurchaseRatings } from "../../engine/purchaseRatings";
import { documentLayoutIn, documentTextIn, keepFormAsIssued } from "../../i18n/documentText";
import { useAppStore } from "../../store/AppStore";
import { formatDisplayDate } from "../../utils/date";
import { generateId } from "../../utils/id";
import { useProgressiveCount } from "../../utils/useProgressive";

// One renderer for every grid-shaped log sheet. The shape of the form —
// header fields, columns, how rows are created — comes entirely from the
// document's LogSheetLayout, so a new register is configuration, not code.
export function LogSheetRecordView({
  doc,
  record,
  editable,
  onChange,
}: {
  doc: DocumentDefinition;
  record: RecordInstance<LogSheetData>;
  editable: boolean;
  onChange: (data: LogSheetData) => void;
}) {
  // The form reads in the language chosen beside Today's Briefing: a form the
  // department issues in Gujarati reads in English while English is chosen
  // (REQUIREMENTS §58, i18n/documentText.ts). The KEYS never change, so what a
  // record holds is untouched either way.
  const { lang } = useAppStore();
  const issued = getLogSheetLayout(doc.id);
  const layout = documentLayoutIn(issued, lang);
  // A form the department issues in Gujarati already reads in Gujarati, so with
  // ગુજરાતી chosen it is not handed to Google at all — it reads as issued.
  const asIssued = keepFormAsIssued(doc.id, lang);
  // THE TWO PURCHASE MONITORING REGISTERS WORK THEIR WEIGHTED RATINGS OUT FROM
  // WHAT IS WRITTEN (engine/purchaseRatings.ts, REQUIREMENTS §68), the way the
  // calibration records work out their deviations. It is applied on the way in
  // as well as on the way out, so a formula cell is right the moment X, Y or Z
  // is entered AND right on a record that was written elsewhere.
  const data = withPurchaseRatings(doc.id, record.data ?? { header: {}, rows: [] });
  const employees = masterRepository.get().employees;
  // Once per render, not once per cell (a 58 x 25 sheet asked for it 1,450 times).
  const employeeNames = React.useMemo(() => employees.map((e) => e.name), [employees]);
  // Before the early return below: a hook called only on some renders breaks
  // React ("rendered fewer hooks than expected") the moment this component is
  // reused for a document without a layout.
  // The reference material the form prints beside the grid, shown or hidden as
  // one: F/PUR/05's four criteria tables are one printed band across the top of
  // the form, so "Show" on any of them shows the criteria (REQUIREMENTS §68).
  const [showReference, setShowReference] = React.useState(false);
  // A long sheet shows its first lines at once and the rest a batch at a time (utils/useProgressive.ts).
  const rowsShown = useProgressiveCount(data.rows.length, 25, 40);

  if (!layout) {
    return <div className="empty-state">No layout is configured for this document (id: {doc.id}).</div>;
  }

  const save = (next: LogSheetData) => onChange(withPurchaseRatings(doc.id, next));
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

  const mode = layout.rowMode;
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
      <DocumentHeader doc={doc} dateLabel={formatDisplayDate(record.dueDate)} pageLabel="1 of 1 (digital)" />

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
                  return (
                    <HeaderFieldInput
                      key={f.key}
                      field={f}
                      issuedLabel={issued?.headerFields[fi]?.label ?? f.label}
                      value={data.header?.[f.key] ?? ""}
                      editable={editable}
                      onChange={(v) => setHeader(f.key, v)}
                      employees={employeeNames}
                      list={personBox ? "hr-master-people" : undefined}
                      onBlur={personBox ? (v) => fillFromName(null, v) : undefined}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {fetching && link && <HrMasterFetch key={record.id} link={link} layout={layout} data={data} onChange={save} newRowId={() => generateId("row")} />}

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
        <table className="compact log-sheet">
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
          <tbody>
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={layout.columns.length + 2} className="text-muted text-center" style={{ padding: 16 }}>
                  No rows yet.
                </td>
              </tr>
            )}
            {data.rows.slice(0, rowsShown).map((row, i) => (
              <tr key={row.id}>
                <td className="text-muted">{i + 1}</td>
                {layout.columns.map((c, ci) => {
                  // A line the form prints blank (F/HR/05's two spare topic lines)
                  // has nothing fixed in it, so it is written in like any cell.
                  const printedBlank = c.fixed && mode.kind === "fixedRows" && mode.rows[i] !== undefined && String(mode.rows[i][c.key] ?? "") === "";
                  const col = printedBlank ? { ...c, fixed: false } : c;
                  return (
                    <td key={c.key} className={isOutOfBand(c, row[c.key]) ? "cell-out-of-band" : ""}>
                      <CellInput
                        col={col}
                        issuedLabel={issued?.columns[ci]?.label ?? c.label}
                        // A printed cell — the parameter, the material, the specification
                        // the form prints down its side — reads in the chosen language;
                        // a written one reads exactly as it was written.
                        value={col.fixed ? documentTextIn(row[c.key], lang) : row[c.key]}
                        editable={editable && !col.fixed && !col.computed}
                        onChange={(v) => setCell(row.id, c.key, v)}
                        employees={employeeNames}
                        list={fetching && link?.where === "rows" && link.nameField === c.key ? "hr-master-people" : undefined}
                        onBlur={fetching && link?.where === "rows" && link.nameField === c.key ? (v) => fillFromName(row.id, v) : undefined}
                      />
                    </td>
                  );
                })}
                {canRemoveRows && (
                  <td>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => removeRow(row.id)} title="Remove row">
                      <FiTrash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
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

      {layout.footerFields && layout.footerFields.length > 0 && (
        <div className="card mt-4">
          <div className="card-pad">
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px 16px" }}>
              {layout.footerFields.map((f, fi) => (
                <HeaderFieldInput
                  key={f.key}
                  field={f}
                  issuedLabel={issued?.footerFields?.[fi]?.label ?? f.label}
                  value={data.header?.[f.key] ?? ""}
                  editable={editable}
                  onChange={(v) => setHeader(f.key, v)}
                  employees={employeeNames}
                />
              ))}
            </div>
            <div className="text-xs text-muted mt-3 no-print">
              "Approved by (QA Manager)" on the paper form is the <strong>Verify</strong> step here — the verifier's name and time are stamped automatically.
            </div>
          </div>
        </div>
      )}
      {fetching && <HrMasterPeopleList />}
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
  const isName = /operator|name|inspected|person|sign/i.test(issuedLabel) && field.type === "text" && !/job name|customer name/i.test(issuedLabel);
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
function ParagraphInput({ value, editable, onChange }: { value: string; editable: boolean; onChange: (v: string) => void }) {
  const box = React.useRef<HTMLTextAreaElement | null>(null);
  React.useLayoutEffect(() => {
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
  const isSign = !!col.autoFill?.sign || /sign|by$/i.test(issuedLabel);
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
