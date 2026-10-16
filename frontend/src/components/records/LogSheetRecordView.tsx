import React from "react";
import { FiAlertTriangle, FiPlus, FiTrash2 } from "react-icons/fi";
import type { DocumentDefinition, LogColumn, LogHeaderField, LogSheetData, LogSheetRow, RecordInstance, SheetPhoto } from "../../types";
import { DocumentHeader } from "../documents/DocumentHeader";
import { recordHeaderEditing, useHeaderEditing, type RecordHeaderHost } from "../documents/HeaderEditing";
import { recordHeaderDefaults } from "../../engine/recordLifecycle";
import { getLogSheetLayoutForRecord } from "../../data/seed/logSheetLayouts";
import { formatEditFor } from "../../data/formatEdits";
import { departmentOfDocument } from "../../data/seed/departments";
import { masterRepository } from "../../data/repositories/masterRepository";
import { hrMasterRepository } from "../../data/repositories/hrMasterRepository";
import { applyFills, hrMasterLinkFor, personFill, personNamed } from "../../engine/hrMaster";
import { HrMasterFetch, HrMasterPeopleList } from "./HrMasterFetch";
import { equipmentLinkFor, equipmentMasterVisible, machineBlankFills, machineByNumber, machineValue } from "../../engine/equipmentMaster";
import {
  currentPmIndex,
  currentSchedules,
  dayDotMonth,
  dueWords,
  isLinkedLine,
  pmActuals,
  pmDoneTitle,
  pmDue,
  pmSheetMachine,
  PM_MONTH_KEYS,
  PM_RECORD_DOC_ID,
  PM_SCHEDULE_DOC_ID,
  scheduleForYear,
  scheduleYear,
  type PmRowActuals,
} from "../../engine/pmSchedule";
import { EquipmentFetch, EquipmentMachineList } from "./EquipmentFetch";
import { isOutOfBand, supersededRevisionOf } from "../../engine/validation";
import { boxOutOfBand, judgeFor, outOfBandCount, type CellJudge } from "../../engine/printedBands";
import { withoutLineNumber } from "../../engine/lineNumbers";
import { numbersOwnLines } from "../../engine/formLineNumbers";
import { withComputedCells } from "../../engine/computedCells";
import { documentLayoutIn, documentTextIn, keepFormAsIssued, sheetLanguage } from "../../i18n/documentText";
import { imageFileToDataUrl } from "../../utils/image";
import { useAppStore } from "../../store/AppStore";
import { formatDisplayDate, todayISO } from "../../utils/date";
import { generateId } from "../../utils/id";
import { logRowsRule, newRow } from "../../engine/recordLines";
import { useProgressiveCount } from "../../utils/useProgressive";
import { SheetChart } from "../charts/SheetChart";
import { BIND_APPEND_ATTR, BIND_SECOND_LINE_ATTR, BIND_TABLE_ATTR, bindColAttrs } from "../../engine/roundTrip/bindPath";
import { bindProps, effectiveColumn, logCellBind, logColumnBind, logHeaderBind, logRowName } from "../../engine/roundTrip/bindingsFor";
import {
  answerAcrossOf,
  boxGroupsBesideGrid,
  choiceWords,
  columnHeading,
  footerGroupsBesideGrid,
  gridHeadBoxes,
  gridHeadSpans,
  gridLines,
  headingParts,
  inBoxTable,
  continuationsOf,
  isPrintedBox,
  mergedRuns,
  panelsOf,
  letterheadTable,
  paperColumnProps,
  placedTables,
  runStarts,
  srNoText,
  type AnswerAcross,
  type BoxGroup,
  type GridLines,
  type Panels,
} from "../../engine/paperLayout";
import { BoxTable } from "./BoxTable";
import { NotesBelow } from "./NotesBelow";
import { PrintedTable } from "./PrintedTable";

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
  header,
}: {
  doc: DocumentDefinition;
  record: RecordInstance<LogSheetData>;
  editable: boolean;
  onChange: (data: LogSheetData) => void;
  /** The record page's: its header typed over in place (REQUIREMENTS §86). None where the sheet is only shown. */
  header?: RecordHeaderHost;
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
  // A QC paper printed in Gujarati reads as issued in every language (REQUIREMENTS §111): its own words are its Gujarati.
  const { lang: chosenLang, version } = useAppStore();
  const lang = sheetLanguage(doc.id, chosenLang);
  // The layout THIS RECORD was filled on: the format as it stands, or — for a
  // page kept on a revision the format has since replaced — that revision's
  // own boxes and columns (REQUIREMENTS §74).
  const issued = getLogSheetLayoutForRecord(doc.id, record);
  const layout = documentLayoutIn(issued, lang);
  const superseded = supersededRevisionOf(record);
  // A form the department issues in Gujarati already reads in Gujarati, so with
  // ગુજરાતી chosen it is not handed to Google at all — it reads as issued.
  const asIssued = keepFormAsIssued(doc.id, chosenLang);
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
  // THE HEADER BLOCK, TYPED OVER ON THE RECORD (REQUIREMENTS §86): the format's
  // company, title, number, revision and its date, and this record's own Page No.
  // (no Date cell of the record's own on the header, §117).
  const headerDefaults = recordHeaderDefaults(record);
  const { edit: headerEdit, panel: headerPanel } = useHeaderEditing({
    doc: header ? doc : undefined,
    enabled: header?.enabled && !superseded,
    record: recordHeaderEditing(header, record.headerBlock, headerDefaults),
  });
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

  // F/MNT/03 FOLLOWS F/MNT/02 (REQUIREMENTS §82). A column `linkedFrom` another
  // document is READ from that document's records each time the sheet is drawn
  // and never stored here: F/MNT/03's Actual dates come from the machines'
  // F/MNT/02 sheets (engine/pmSchedule.ts). They are worked out apart from
  // `data` — never through withComputedCells, whose answer is saved, so an
  // out-of-date copy can never be written into the schedule. F/MNT/02 in turn
  // shows the machine's next planned PM from the year's schedule. The PMs are
  // read once per change to the F/MNT/02 records (currentPmIndex), and again
  // when the store moves on (a PM saved on another computer, pulled here).
  const readsPm = doc.id === PM_RECORD_DOC_ID || !!layout?.columns.some((c) => c.linkedFrom === PM_RECORD_DOC_ID);
  const pmIndex = React.useMemo(() => (readsPm ? currentPmIndex(record.isDemo) : null), [readsPm, record.isDemo, version]);
  const pmLines = React.useMemo(
    () => (pmIndex && doc.id === PM_SCHEDULE_DOC_ID && layout?.columns.some((c) => c.linkedFrom === PM_RECORD_DOC_ID) ? pmActuals(data.rows, scheduleYear(record), pmIndex, listedAs) : null),
    [pmIndex, doc.id, layout, data.rows, record.dueDate]
  );
  // One unchanging object per line while what it shows is the same, so a
  // keystroke in a Plan redraws that line and not all forty-two.
  const linkCache = React.useRef(new Map<string, { sig: string; value: RowLinks }>());
  const rowLinks = React.useMemo(() => {
    if (!pmLines || !layout) return null;
    const out = new Map<string, RowLinks>();
    const linkedCols = layout.columns.filter((c) => c.linkedFrom);
    data.rows.forEach((row, i) => {
      const value = rowLinksOf(pmLines[i], linkedCols);
      const sig = JSON.stringify(value);
      const hit = linkCache.current.get(row.id);
      if (hit && hit.sig === sig) out.set(row.id, hit.value);
      else {
        linkCache.current.set(row.id, { sig, value });
        out.set(row.id, value);
      }
    });
    return out;
  }, [pmLines, layout, data.rows]);
  const pmPlanLine = React.useMemo(
    () => (pmIndex && doc.id === PM_RECORD_DOC_ID ? planLineFor(String(data.header?.machineIdNo ?? ""), record.isDemo, pmIndex) : null),
    [pmIndex, doc.id, data.header?.machineIdNo, record.isDemo, version]
  );

  // ONE CELL DOWN A RUN OF LINES, AND A BLANK LINE BETWEEN RUNS (REQUIREMENTS §111, the review of 13-Oct-2026): the
  // Gujarati line clearance's process and its two signatures once per process, F/QC/13's one પાસ?. Worked out once
  // per version of the lines, and only on a sheet that has such a column.
  const merged = React.useMemo(() => (layout ? mergedRuns(layout, data.rows) : new Map<string, number[]>()), [layout, data.rows]);
  const gaps = React.useMemo(() => (layout ? runStarts(layout, data.rows) : new Set<number>()), [layout, data.rows]);

  if (!layout) {
    return <div className="empty-state">No layout is configured for this document (id: {doc.id}).</div>;
  }

  const save = (next: LogSheetData) => onChange(withComputedCells(doc.id, next));
  const setHeader = (key: string, value: string) => save({ ...data, header: { ...data.header, [key]: value } });
  const setCell = (rowId: string, key: string, value: string | number | null) =>
    save({ ...data, rows: data.rows.map((r) => (r.id === rowId ? { ...r, [key]: value } : r)) });
  // Add Row starts a line blank in every box (REQUIREMENTS §98): no "ALC DONE: Yes" or "Cleaning: Dry" decided for the
  // person. A paper that numbers its lines in a column of its own (F/QC/16's Sr. No., REQUIREMENTS §111) gets the next number.
  // The line is the one registry's (engine/recordLines.ts, §113): the same line Mitra's "add a row" and its patch build.
  const addRow = () => save({ ...data, rows: [...data.rows, newRow(layout, data.rows, generateId("row"))] });
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

  // One box above the grid: a person's or a machine's box offers the people or the machines it can be filled from.
  // `inTable`: a cell of the paper's table of boxes (boxTable, REQUIREMENTS §111), headed by the table's words.
  const headerBox = (f: LogHeaderField, fi: number, inTable = false) => {
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
        inTable={inTable}
        outOfBand={boxOutOfBand(f, data.header)}
      />
    );
  };
  // One box below the grid.
  const footerBox = (f: LogHeaderField, fi: number, inTable = false) => (
    <SheetBox
      key={f.key}
      field={f}
      issuedLabel={issued?.footerFields?.[fi]?.label ?? f.label}
      value={data.header?.[f.key] ?? ""}
      editable={editable}
      onBox={onBox}
      employees={employeeNames}
      list={lists?.[f.key] ?? f.list}
      inTable={inTable}
      outOfBand={boxOutOfBand(f, data.header)}
    />
  );
  // The printed tables offered behind "Show" above the sheet: all but those the paper prints in a place of their
  // own among the boxes (tableAbove — the certificates' TOLERANCE, REQUIREMENTS §111), which are drawn there, open.
  const placed = placedTables(layout);
  const letterhead = letterheadTable(layout);
  const topTables = (layout.referenceTables ?? []).filter((t) => !placed.has(t.title));

  const mode = layout.rowMode;
  const qcForm = departmentOfDocument(doc.id, doc.formatNo) === "QC";
  // Whether lines may be added or removed is the registry's rule (engine/recordLines.ts, REQUIREMENTS §113): a sheet
  // with printed lines shows no Add Row and no bin; a free sheet keeps the lines the form prints.
  const linesRule = logRowsRule(layout);
  const canAddRows = editable && linesRule.canAdd;
  const canRemoveRows = editable && linesRule.canRemove && data.rows.length > linesRule.minLines;
  // Every reading outside the band its paper prints: a column's, a tolerance box's, a line's specification, a box
  // against its tolerance (engine/printedBands.ts, REQUIREMENTS §111 rule 2). The judge is made again only when a
  // tolerance box changes, so a keystroke elsewhere redraws no line of the grid.
  const judge = judgeFor(layout, data.header);
  const outOfBand = outOfBandCount(layout, data);
  // F/QC/11's Pass/Fail and Sign. lines: one cell a plate (groupCellLines).
  const groupCells = layout.groupCellLines;
  // F/QC/18's "On Glass surface" line under DRYING TEST: its Sr. No. and parameter merged with the line above (part 6).
  const joined = continuationsOf(layout, data.rows);
  const joinedLines = new Set(joined.keys());
  // A FORM THE PAPER PRINTS AS BOXES ALONE has no grid to draw — the Supplier
  // Registration Form is labelled lines and prose blocks from the top of page 1
  // to the bottom of page 3 (REQUIREMENTS §68). Drawing the empty table would
  // put a Sr. No. column on a form that has none.
  const hasGrid = layout.columns.length > 0;
  // ONE NUMBER PER LINE (REQUIREMENTS §102): a form that numbers its own lines (a "#" or "Sr.No."
  // column, F/HR/04's 01 to 10) gets no Sr. No. column of the sheet's, and on every other form a
  // printed line's words never repeat the Sr. No. beside them.
  const numbered = !numbersOwnLines(layout);
  // AN ENTRY OF TWO LINES (REQUIREMENTS §111): where the paper gives each entry a second line
  // (F/QC/12's "Deviation %"), the columns drawn on it are left out of the heading and drawn on
  // that line, under the column each names (engine/paperLayout.ts). Every other sheet: one line.
  const lines = gridLines(layout);
  const issuedFirst = issued ? gridLines(issued).first : undefined;
  // One answer across the paper's columns, their headings on a printed line (F/QC/25, §111 part 4); null on every other sheet.
  const answerAcross = answerAcrossOf(layout);
  // The paper's small tables, F-QC-14's checks two to a row (REQUIREMENTS §111, the review of 13-Oct-2026); null elsewhere.
  const panels = panelsOf(layout);
  // A photograph the paper prints under its table (F/QC/29's analysis report): added, kept and printed there.
  const setPhotos = (photos: SheetPhoto[]) => save({ ...data, photos });
  // The boxes below the grid the sheet draws in its footer card: those the paper prints inside its small tables are drawn there.
  const footerGroups = footerGroupsBesideGrid(layout);
  // "Approved by (QA Manager) is the Verify step" is said only under a paper that prints such an approval and has no box for it (REQUIREMENTS §74, §111).
  const sayVerifyIsApproval = qcForm && !!layout.approvedOnVerify && !paperHasItsOwnApproval(layout);
  // The heading rows: the columns grouped into the runs the paper draws under
  // one spanning heading, and two rows instead of one where there is such a run.
  const headRuns = headingRuns(lines.first);
  // A group whose columns print no heading of their own is ONE heading over them (REQUIREMENTS §111, part 8):
  // F-QC-40.A prints "08:30 HRS" over the one cell its temperature and its humidity are written in. A sheet of free
  // lines keeps the columns' own headings, which name the box of a line a downloaded file holds (§81).
  const headless = (run: { group?: string; columns: LogColumn[] }) =>
    mode.kind !== "free" && run.group !== undefined && run.columns.every((c) => columnHeading(c) === "");
  const headRows = headRuns.some((r) => r.group !== undefined && !headless(r)) ? 2 : 1;
  // THE DAY IN THE SR. NO. COLUMN (REQUIREMENTS §111): F-QC-30 writes the record's date there on the
  // first line and nothing on the others; every other sheet numbers its lines.
  const recordDate = formatDisplayDate(record.headerBlock?.date ?? headerDefaults.date);
  // A SHEET OF FREE LINES says so on its grid (REQUIREMENTS §81): the list the
  // lines are, and — wherever a line can be added, now or once a signed-off
  // sheet is reopened for correction — that lines added to the downloaded
  // file become new lines here. Each heading names the box of a line it holds.
  const freeRows = mode.kind === "free";
  // Entries of two lines say what the second is headed, so a downloaded file's "Deviation %" line is never read as a new entry (§111).
  const gridBind = freeRows
    ? { [BIND_TABLE_ATTR]: "rows", ...(superseded ? {} : { [BIND_APPEND_ATTR]: "1" }), ...(lines.second ? { [BIND_SECOND_LINE_ATTR]: lines.second.label } : {}) }
    : undefined;

  // THE BOXES ABOVE THE GRID. As many boxes to a line as the paper draws, where it says (F/QC/12's three rows of three,
  // REQUIREMENTS §111); otherwise as many as the screen holds. A phone takes them one under another (styles.css). A
  // group the paper heads (F/QC/06's LABEL STOCK) is drawn under its heading, and one the paper prints as a table (its
  // LABEL STOCK, Material × Face Material ...) as that table. A box the paper prints on the grid's top line (F/QC/25's
  // OID :- and Job Code:, §111 part 4) or inside its small tables (F-QC-14's inspectors) is drawn there, not here. Where
  // the paper prints its boxes above its paragraph (F/QC/15-A to G's machine box, the review of 13-Oct-2026) they come first.
  const boxesFirst = !!layout.boxesAboveInstructions;
  const wordsAbove = (layout.instructions?.length ?? 0) > 0 || topTables.length > 0;
  const headerBoxes = boxGroupsBesideGrid(layout).map((group, gi) =>
    group.lead ? (
      <BoxLine key={gi} group={group} minWidth={200} section="sheet-boxes" className={!boxesFirst && wordsAbove ? "mt-3" : ""}>
        {group.boxes.map(({ field, index }) => headerBox(field, index))}
      </BoxLine>
    ) : (
      <PrintedGroup key={gi} area="header" group={group} className={gi > 0 || (!boxesFirst && wordsAbove) ? "mt-3" : ""}>
        {group.boxes.map(({ field, index }, bi) => headerBox(field, index, inBoxTable(group, bi)))}
      </PrintedGroup>
    )
  );

  // A sheet whose paper writes its headings in its own letters prints them so (REQUIREMENTS §111, part 4): a
  // certificate's "Length(mm)", which the sheet's capitals made "LENGTH(MM)".
  const rootClass = [asIssued ? "notranslate" : "", layout.headingsAsPrinted ? "headings-as-printed" : ""].filter(Boolean).join(" ");
  return (
    <div className={rootClass || undefined} translate={asIssued ? "no" : undefined} data-bind-record={record.id}>
      <DocumentHeader
        doc={doc}
        // The title as the paper prints it, unless the plant has renamed the format since (REQUIREMENTS §111).
        title={layout.paperTitle && !formatEditFor(doc.id)?.name ? layout.paperTitle : undefined}
        // The paper's letters, its lines under the company's name and its own letterhead in place of the company's
        // line (F/QC/25), before the title, as the paper prints them (REQUIREMENTS §111 part 6).
        titleAsPrinted={layout.titleAsPrinted}
        underCompany={layout.underCompany}
        letterhead={letterhead ? <div className="doc-letterhead"><PrintedTable table={letterhead} /></div> : undefined}
        pageLabel={record.headerBlock?.page ?? headerDefaults.page}
        revision={superseded ? { no: superseded.revisionNo, date: superseded.revisionDate } : undefined}
        edit={headerEdit}
        language={lang}
        numberNotPrinted={!!layout.numberNotPrinted}
        printedWithNumber={layout.printedWithNumber}
      />
      {headerPanel}
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

      {((layout.instructions?.length ?? 0) > 0 || layout.headerFields.length > 0 || topTables.length > 0) && (
        <div className="card mt-4">
          <div className={`card-pad${boxesFirst ? " boxes-above-instructions" : ""}`}>
            {boxesFirst && headerBoxes}
            {layout.instructions?.map((line, i) => (
              <p
                key={i}
                className={`text-sm ${i === 0 ? "font-semibold" : "text-muted"} ${i < (layout.instructions?.length ?? 0) - 1 ? "mb-1" : ""}${boxesFirst && i === 0 ? " mt-3" : ""}`}
              >
                {line}
              </p>
            ))}
            {topTables.map((t) => (
              <div key={t.title} className="mt-2" data-reference-table={t.printed ? "printed" : "on-request"}>
                {/* A table the paper prints in full (F/QC/13's grade criteria, REQUIREMENTS §111) is drawn open,
                    on screen and in print, with no "Show" of DCRS's above it. */}
                {!t.printed && (
                  <button className="btn btn-ghost btn-sm no-print" style={{ padding: "2px 6px" }} onClick={() => setShowReference((s) => !s)}>
                    {showReference ? "Hide" : "Show"} {t.title}
                  </button>
                )}
                {(showReference || t.printed) && (
                  <div className={`doc-table${t.printed ? "" : " mt-2"}`} style={{ overflowX: "auto" }}>
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
                              <td key={ci} className={`text-xs ${ci === 0 ? "font-semibold" : ""}`} style={{ verticalAlign: "top", whiteSpace: t.printed ? "pre-line" : "normal" }}>
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
            {!boxesFirst && headerBoxes}
          </div>
        </div>
      )}

      {fetching && link && <HrMasterFetch key={record.id} link={link} layout={layout} data={data} onChange={save} newRowId={() => generateId("row")} />}
      {eqFetching && eqLink && <EquipmentFetch key={`eq-${record.id}`} link={eqLink} layout={layout} data={data} onChange={save} newRowId={() => generateId("row")} />}

      {pmPlanLine && <PmPlanLine line={pmPlanLine} />}
      {pmLines && <PmLinkNotice lines={pmLines} />}

      {outOfBand > 0 && (
        <div className="card mt-4 no-print" style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}>
          <div className="card-pad text-sm">
            <FiAlertTriangle size={13} style={{ verticalAlign: -2 }} /> {outOfBand} reading{outOfBand === 1 ? " is" : "s are"} outside the printed acceptance band (highlighted). Add a remark
            explaining the deviation and inform the shift in-charge.
          </div>
        </div>
      )}

      {/* THE GRID PRINTED ACROSS (REQUIREMENTS §111): a certificate's PRINTING numbers its colours 1 to 10
          across the page, with Given By Client and Color Shade Verified on the lines under them. */}
      {hasGrid && layout.gridAcross && (
        <AcrossGrid
          columns={lines.first}
          issuedColumns={issuedFirst}
          rows={data.rows}
          fixedRows={mode.kind === "fixedRows" ? mode.rows : undefined}
          editable={editable}
          lang={lang}
          employees={employeeNames}
          lists={lists}
          onCell={onCell}
        />
      )}

      {/* ONE ANSWER ACROSS THE PAPER'S COLUMNS (REQUIREMENTS §111, part 4): F/QC/25's one box a line, but for the
          lines written in its four paper columns, headed on its line 7; its OID :- and Job Code: on the top line. */}
      {hasGrid && answerAcross && (
        <AnswerAcrossGrid
          spec={answerAcross}
          headBoxes={gridHeadBoxes(layout).map(({ field, index }) => headerBox(field, index))}
          rows={data.rows}
          fixedRows={mode.kind === "fixedRows" ? mode.rows : undefined}
          issuedColumns={issued?.columns}
          columns={layout.columns}
          editable={editable}
          lang={lang}
          employees={employeeNames}
          lists={lists}
          onCell={onCell}
        />
      )}

      {/* THE PAPER'S SMALL TABLES (REQUIREMENTS §111, the review of 13-Oct-2026): F-QC-14's checks, two to a row, each
          headed with its check over the inspectors and their names, its Conclusion under its three lines. */}
      {hasGrid && panels && (
        <PanelGrid
          panels={panels}
          layout={layout}
          rows={data.rows}
          header={data.header ?? {}}
          issuedColumns={issued?.columns}
          editable={editable}
          lang={lang}
          employees={employeeNames}
          lists={lists}
          onCell={onCell}
          onBox={onBox}
        />
      )}

      {hasGrid && !layout.gridAcross && !answerAcross && !panels && (
      <div className="doc-table mt-4" style={{ overflowX: "auto" }}>
        <table className={editable ? "compact log-sheet is-editing" : "compact log-sheet"} {...gridBind}>
          <thead>
            <tr>
              {numbered && (
                <th style={{ width: layout.srNoShowsDate ? 96 : 44 }} rowSpan={headRows}>
                  {/* "SR NO" on F-QC-40.C, nothing over F/QC/30's numbered points (REQUIREMENTS §111). */}
                  {layout.srNoLabel ?? "Sr. No."}
                </th>
              )}
              {/* A run of columns the paper draws under ONE spanning heading gets
                  that heading here and its own headings on the row below; every
                  other column spans both rows, as it does on the paper. */}
              {headRuns.map((run, ri) => (
                <React.Fragment key={`${run.group ?? "column"}-${ri}`}>
                  {run.group === undefined ? (
                    run.columns.map((c) => <ColumnHead key={c.key} col={c} rowSpan={headRows} bound={freeRows} />)
                  ) : (
                    <th className="col-group" colSpan={run.columns.length} rowSpan={headless(run) ? headRows : undefined} data-group-alone={headless(run) ? "" : undefined}>
                      {run.group}
                    </th>
                  )}
                </React.Fragment>
              ))}
              {canRemoveRows && <th style={{ width: 36 }} rowSpan={headRows}></th>}
            </tr>
            {headRows === 2 && (
              <tr>
                {headRuns
                  .filter((run) => run.group !== undefined && !headless(run))
                  .flatMap((run) => run.columns)
                  .map((c) => (
                    <ColumnHead key={c.key} col={c} bound={freeRows} />
                  ))}
              </tr>
            )}
          </thead>
          <tbody ref={bodyRef}>
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={lines.first.length + (numbered ? 2 : 1)} className="text-muted text-center" style={{ padding: 16 }}>
                  No rows yet.
                </td>
              </tr>
            )}
            {data.rows.slice(0, rowsShown).map((row, i) => (
              <React.Fragment key={row.id}>
              {/* A blank line where the paper leaves one between its processes (gapBetweenRuns, REQUIREMENTS §111). */}
              {gaps.has(i) && (
                <tr className="log-gap-line" aria-hidden="true" data-gap-line="">
                  <td colSpan={lines.first.length + (numbered ? 1 : 0) + (canRemoveRows ? 1 : 0)} />
                </tr>
              )}
              <SheetRow
                row={row}
                index={i}
                spans={merged.size > 0 ? spansAt(merged, i) : undefined}
                columns={lines.first}
                issuedColumns={issuedFirst}
                second={lines.second}
                fixedRow={mode.kind === "fixedRows" ? mode.rows[i] : undefined}
                judge={judge}
                groupCells={groupCells?.includes(i)}
                numbered={numbered}
                srNo={numbered ? srNoText(layout, i, recordDate, joinedLines) : undefined}
                spanDown={joined.get(i + 1)}
                joinsAbove={joined.get(i)}
                editable={editable}
                lang={lang}
                employees={employeeNames}
                lists={lists}
                personKey={fetching && link?.where === "rows" ? link.nameField : undefined}
                machineKey={eqFetching && eqLink?.where === "rows" ? eqLink.idField : undefined}
                linked={rowLinks?.get(row.id)}
                canRemove={canRemoveRows}
                onCell={onCell}
                onPersonBlur={onPersonBlur}
                onMachineBlur={onMachineBlur}
                onRemove={onRemoveRow}
              />
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {pmLines && (
        <div className="text-xs text-muted mt-2" data-section="pm-actuals-note">
          Actual dates read from F/MNT/02 on {formatDisplayDate(todayISO())}; * marks a PM whose F/MNT/02 is not yet Verified.
        </div>
      )}
      {hasGrid && canAddRows && (
        <button className="btn btn-secondary btn-sm mt-2" onClick={addRow}>
          <FiPlus size={13} /> Add Row
        </button>
      )}
      {/* The paper's own text below the grid, word for word (REQUIREMENTS §111): F/QC/11's and F/QC/12's PROCEDURE. */}
      {layout.notesBelow && layout.notesBelow.length > 0 && <NotesBelow lines={layout.notesBelow} />}

      {/* The photograph the paper prints under its table (F/QC/29's analysis report, REQUIREMENTS §111). */}
      {layout.photoBelowGrid && <SheetPhotos photos={data.photos ?? []} editable={editable} onChange={setPhotos} />}

      {/* The charts the form prints from its own figures (REQUIREMENTS §77). */}
      {layout.charts?.map((chart, i) => (
        <SheetChart key={i} chart={chart} data={data} />
      ))}

      {(footerGroups.length > 0 || sayVerifyIsApproval) && (
        <div className="card mt-4">
          <div className="card-pad">
            {/* Lines (or a table) the paper prints across the sheet above a box start a group of their
                own, drawn under them: F/MNT/08's hand-over in the paper's two columns (REQUIREMENTS §93), a
                certificate's COATING, FINISHING and TOLERANCE (§111); every other form's boxes are as they were. */}
            {footerGroups.map((group, gi) =>
              group.lead ? (
                <BoxLine key={gi} group={group} minWidth={220}>
                  {group.boxes.map(({ field, index }) => footerBox(field, index))}
                </BoxLine>
              ) : (
                <PrintedGroup key={gi} area="footer" group={group} className={gi > 0 ? "mt-3" : ""}>
                  {group.boxes.map(({ field, index }, bi) => footerBox(field, index, inBoxTable(group, bi)))}
                </PrintedGroup>
              )
            )}
            {/* The QA Manager's approval is a QC form's own box, so the line
                about it belongs under QC forms only: under a Maintenance or a
                Purchase footer it named a signature those forms do not have
                (REQUIREMENTS §74). */}
            {/* ...and only where the form has no APPROVED BY box of its own to write it in (§111), no box of the QA
                Manager's own (F/QC/25's "Sign By (QA Manager)") and does not print that it needs no signature (the
                certificates of analysis' "IT DOES NOT REQUIRE A SIGNATURE."): there the line named an approval the
                paper does not have. */}
            {/* ...and, since the review of 13-Oct-2026, only under a paper that prints an approval DCRS stamps on Verify
                (approvedOnVerify: F/QC/34, /35, /37): F-QC-14 and F/QC/13 print none, and the line named one. */}
            {sayVerifyIsApproval && (
              <div className={`text-xs text-muted no-print${footerGroups.length > 0 ? " mt-3" : ""}`}>
                "Approved by (QA Manager)" on the paper form is the <strong>Verify</strong> step here — the verifier's name and time are stamped automatically.
              </div>
            )}
          </div>
        </div>
      )}
      {/* The paper's own text at the foot of the sheet, after every box (REQUIREMENTS §111): the certificates' "THIS IS A SYSTEM GENERATED DOCUMENT." */}
      {layout.notesAtFoot && layout.notesAtFoot.length > 0 && <NotesBelow lines={layout.notesAtFoot} section="notes-at-foot" />}
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

// ---------------------------------------------------------------------------
// F/MNT/03's Actuals read from F/MNT/02, and F/MNT/02's line from F/MNT/03 (REQUIREMENTS §82)

/** One cell read from another document: each PM as a link to the F/MNT/02 it is written on, or why the line is not linked. */
interface LinkedCellView {
  links: { recordId: string; text: string; title: string }[];
  unlinked?: string;
}
type RowLinks = Record<string, LinkedCellView>;

/** What F/MNT/01 says a machine is, for the reason a duplicated number is not linked: "the DK-450 Label Slitting Machine". */
function listedAs(machine: string): string | null {
  if (!equipmentMasterVisible()) return null;
  const m = machineByNumber(machine);
  if (!m) return null;
  const words = [machineValue(m, "model"), machineValue(m, "description")].filter(Boolean).join(" ");
  return words ? `the ${words}` : null;
}

function rowLinksOf(line: PmRowActuals | undefined, columns: LogColumn[]): RowLinks {
  const out: RowLinks = {};
  for (const c of columns) {
    if (!line) out[c.key] = { links: [] };
    else if (!isLinkedLine(line)) out[c.key] = { links: [], unlinked: line.unlinked };
    else {
      const month = PM_MONTH_KEYS.indexOf(c.key.replace(/Actual$/, "") as (typeof PM_MONTH_KEYS)[number]);
      const cell = month >= 0 ? line.months[month] : [];
      out[c.key] = { links: cell.map((d) => ({ recordId: d.recordId, text: `${dayDotMonth(d.dateISO)}${d.status === "Verified" ? "" : "*"}`, title: pmDoneTitle(d) })) };
    }
  }
  return out;
}

/** A cell read from another document: text, never a box — each value a link to the record it was read from. */
function LinkedCell({ colKey, from, cell }: { colKey: string; from: string; cell: LinkedCellView | undefined }) {
  if (!cell || cell.links.length === 0) {
    return (
      <span className="cell-text notranslate text-faint" translate="no" data-computed={colKey} data-linked-from={from} data-unlinked={cell?.unlinked ? "1" : undefined} title={cell?.unlinked}>
        {""}
      </span>
    );
  }
  return (
    <span className="cell-text notranslate" translate="no" data-computed={colKey} data-linked-from={from}>
      {cell.links.map((l, i) => (
        <React.Fragment key={`${l.recordId}-${l.text}-${i}`}>
          {i > 0 ? " · " : ""}
          <a href={`#/record/${l.recordId}`} data-linked-record={l.recordId} title={l.title}>
            {l.text}
          </a>
        </React.Fragment>
      ))}
    </span>
  );
}

/** Above F/MNT/03's grid: where its Actuals come from, and each line that cannot be linked, with why. */
function PmLinkNotice({ lines }: { lines: PmRowActuals[] }) {
  const reasons: { machine: string; reason: string; rows: number[] }[] = [];
  lines.forEach((l, i) => {
    if (isLinkedLine(l)) return;
    const had = reasons.find((r) => r.reason === l.unlinked);
    if (had) had.rows.push(i + 1);
    else reasons.push({ machine: l.machine, reason: l.unlinked, rows: [i + 1] });
  });
  return (
    <div className="card mt-4 no-print" data-section="pm-link-notice">
      <div className="card-pad text-sm">
        <div>
          Each <strong>Actual</strong> date is read from the machine&apos;s F/MNT/02 (Preventive Maintenance Schedule &amp; Record) whenever this sheet is shown, and is
          never written here: record a PM on that sheet and it appears under its plan. Click a date to open the F/MNT/02 it is written on.
        </div>
        {reasons.map((r) => (
          <div key={r.reason} className="mt-2" data-state="pm-unlinked" data-machine={r.machine} style={{ color: "var(--color-warning)" }}>
            <FiAlertTriangle size={13} style={{ verticalAlign: -2 }} /> Line{r.rows.length === 1 ? "" : "s"} {r.rows.join(", ")}: {r.reason}
          </div>
        ))}
      </div>
    </div>
  );
}

interface PmPlanLineView {
  machine: string;
  scheduleId: string | null;
  year: number;
  /** "Monthly planned 10.10 — due in 11 days", one per frequency; or one sentence saying why there is none. */
  parts: string[];
  note?: string;
}

/** F/MNT/02's line: the machine's next planned PM on the current year's F/MNT/03 — or why there is none. */
function planLineFor(machineIdNo: string, isDemo: boolean, index: ReturnType<typeof currentPmIndex>): PmPlanLineView | null {
  const machine = pmSheetMachine(machineIdNo);
  if (!machine) return null;
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const schedule = scheduleForYear(currentSchedules(isDemo), year);
  if (!schedule) return { machine, scheduleId: null, year, parts: [], note: `No ${year} schedule (F/MNT/03) on Rev 01 is written yet, so there is no plan for ${machine} to show.` };
  const rows = schedule.data?.rows ?? [];
  const lines = pmActuals(rows, year, index, listedAs);
  const mine = lines.map((l, i) => ({ l, i })).filter(({ i }) => pmSheetMachine(rows[i]?.machineNo) === machine);
  if (mine.length === 0) return { machine, scheduleId: schedule.id, year, parts: [], note: `${machine} is not on the ${year} schedule (F/MNT/03).` };
  const unlinked = mine.find(({ l }) => !isLinkedLine(l));
  if (unlinked && !isLinkedLine(unlinked.l)) return { machine, scheduleId: schedule.id, year, parts: [], note: unlinked.l.unlinked };
  const due = pmDue(rows, year, index, today, lines);
  const parts: string[] = [];
  for (const { i } of mine) {
    const label = String(rows[i]?.frequency ?? "").trim();
    const open = due.filter((d) => d.rowIndex === i);
    const overdue = open.filter((d) => d.daysPast > 0);
    const next = open.find((d) => d.daysPast <= 0);
    // The next plan still to come; failing that, the latest one passed. Plans
    // passed with no PM recorded against them are named after it, so a missed
    // PM is not hidden behind the next one.
    const shown = next ?? overdue[overdue.length - 1];
    if (!shown) continue;
    const earlier = overdue.filter((d) => d !== shown);
    parts.push(
      `${label} planned ${dayDotMonth(shown.plan)} — ${dueWords(shown.daysPast)}` +
        (earlier.length ? ` (not recorded yet: ${earlier.slice(-3).map((d) => dayDotMonth(d.plan)).join(", ")}${earlier.length > 3 ? ` and ${earlier.length - 3} more` : ""})` : "")
    );
  }
  return { machine, scheduleId: schedule.id, year, parts, ...(parts.length === 0 ? { note: `Every PM planned for ${machine} on the ${year} schedule is recorded.` } : {}) };
}

function PmPlanLine({ line }: { line: PmPlanLineView }) {
  const schedule = line.scheduleId ? (
    <a href={`#/record/${line.scheduleId}`} data-action="open-pm-schedule">
      the {line.year} schedule (F/MNT/03)
    </a>
  ) : (
    <>the {line.year} schedule (F/MNT/03)</>
  );
  return (
    <div className="card mt-4 no-print" data-section="pm-plan-line" data-machine={line.machine}>
      <div className="card-pad text-sm">
        {line.parts.length > 0 ? (
          <>
            On {schedule}: {line.parts.join(" · ")}
          </>
        ) : (
          <>
            {line.note} {line.scheduleId ? <>See {schedule}.</> : null}
          </>
        )}
      </div>
    </div>
  );
}

// The columns as the grid heads them: consecutive columns carrying the same
// `group` become one run, and every other column is a run of its own.
/**
 * A printed cell as the record holds it, or — where the record was written before the format printed that
 * column (F/QC/13's own સ.નં, REQUIREMENTS §111) — as the format prints it on that line.
 */
function printedCell(row: LogSheetRow, key: string, fixedRow: Record<string, string | number | null> | undefined): string | number | null | undefined {
  const held = row[key];
  return held === undefined && fixedRow ? fixedRow[key] : held;
}

function headingRuns(columns: LogColumn[]): { group?: string; columns: LogColumn[] }[] {
  const runs: { group?: string; columns: LogColumn[] }[] = [];
  for (const col of columns) {
    const last = runs[runs.length - 1];
    // "Observation (24Hrs.)" over Freeze, again over Desiccator: the paper's own cell over each (groupApart, §111).
    if (last && last.group !== undefined && last.group === col.group && !col.groupApart) last.columns.push(col);
    else runs.push({ group: col.group, columns: [col] });
  }
  return runs;
}

/** One line's spans of the merged columns: on a run's first line how many lines the cell runs down, 0 on the lines it covers. */
function spansAt(merged: Map<string, number[]>, index: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, spans] of merged) out[key] = spans[index] ?? 1;
  return out;
}

function ColumnHead({
  col,
  rowSpan,
  colSpan,
  bound,
}: {
  col: LogColumn;
  rowSpan?: number;
  /** A heading over the columns one answer stands across (answerAcross, REQUIREMENTS §111 part 4). */
  colSpan?: number;
  /** A free-row sheet's heading names the box of a line it holds (REQUIREMENTS §81). */
  bound?: boolean;
}) {
  const b = bound ? logColumnBind(col) : null;
  return (
    <th
      {...(b ? bindColAttrs(b.key, b.type, b.options) : undefined)}
      style={col.width ? { minWidth: col.width } : undefined}
      rowSpan={rowSpan}
      colSpan={colSpan}
      title={col.nominal !== undefined ? `Nominal ${col.nominal}${col.unit ? " " + col.unit : ""}; band ${col.min}–${col.max}` : undefined}
    >
      {/* The paper's own heading, "" where it prints none (F/QC/25's descriptions, REQUIREMENTS §111). */}
      {columnHeading(col)}
    </th>
  );
}

/**
 * WHETHER THE PAPER SAYS WHO APPROVES IT, so the screen's line that "Approved by (QA Manager)" on the paper is
 * the Verify step here would be wrong (REQUIREMENTS §74, §111): an APPROVED BY box of its own (the incoming
 * records), a box of the QA Manager's (F/QC/25's Sign By), or the words that it needs no signature at all
 * (the certificates of analysis).
 */
export function paperHasItsOwnApproval(layout: { footerFields?: { label: string }[]; notesAtFoot?: string[] }): boolean {
  return (
    (layout.footerFields ?? []).some((f) => /approved by|qa manager/i.test(f.label)) ||
    (layout.notesAtFoot ?? []).some((line) => /does not require a signature/i.test(line))
  );
}

/**
 * ONE RUN OF BOXES, as many to a line as the paper puts there (REQUIREMENTS §111) or, where it does not
 * say, as many as the screen holds. A phone takes them one under another (styles.css .sheet-boxes-paper).
 */
function BoxLine({ group, minWidth, section, className, children }: { group: BoxGroup; minWidth: number; section?: string; className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`grid${className ? ` ${className}` : ""}${group.perLine ? " sheet-boxes-paper" : ""}`}
      data-section={section}
      style={
        group.perLine
          ? ({ "--paper-box-columns": group.perLine, gap: "10px 16px" } as React.CSSProperties)
          : { gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: "10px 16px" }
      }
    >
      {children}
    </div>
  );
}

/**
 * A GROUP OF BOXES UNDER WHAT THE PAPER PRINTS ABOVE IT (REQUIREMENTS §93, §111): its printed table, open
 * (the certificates' TOLERANCE), the lines printed across the sheet (F/MNT/08's declaration, a certificate's
 * LABEL STOCK, COATING, FINISHING, its notes), then its boxes — as the paper's table where it prints them as
 * one (boxTable: a certificate's Specified Size, LABEL STOCK, SLEEVE FILM and Minimum Gloss line).
 */
function PrintedGroup({ area, group, className, children }: { area: "header" | "footer"; group: BoxGroup; className?: string; children: React.ReactNode }) {
  return (
    <div className={className || undefined} data-section="printed-group" data-area={area}>
      {group.table && <PrintedTable table={group.table} />}
      {group.lines.map((line, i) => (
        <p key={i} className="text-sm font-semibold mb-2" style={{ whiteSpace: "pre-wrap" }}>
          {line}
        </p>
      ))}
      {group.boxTable ? (
        <BoxTable table={group.boxTable} cells={React.Children.toArray(children)} />
      ) : (
        <BoxLine group={group} minWidth={area === "header" ? 200 : 220}>
          {children}
        </BoxLine>
      )}
    </div>
  );
}

/**
 * THE PAPER'S SMALL TABLES (REQUIREMENTS §111, the review of 13-Oct-2026), as F-QC-14 prints its checks: two to a row,
 * each headed with its check and specification over the inspectors, each inspector's name under his heading in
 * brackets, its first column headed with what was sampled ("Paper Reel SAP batch no.", "Roll no.", "FGLA 11430
 * sample no."), its three lines, and "Conclusion" with the check's own conclusion under them. The cells are the
 * record's own (the same bindings, the same words for a printed cell); the boxes written in the headings are the
 * record's boxes above the grid — typed in the first table that names each, shown as written in the others — and
 * each Conclusion is its box below the grid. A phone takes the tables one under another (styles.css).
 */
function PanelGrid({
  panels,
  layout,
  rows,
  header,
  issuedColumns,
  editable,
  lang,
  employees,
  lists,
  onCell,
  onBox,
}: {
  panels: Panels;
  layout: { columns: LogColumn[]; headerFields: LogHeaderField[] };
  rows: LogSheetRow[];
  header: Record<string, string>;
  issuedColumns: LogColumn[] | undefined;
  editable: boolean;
  lang: Parameters<typeof documentTextIn>[1];
  employees: string[];
  lists?: Record<string, string>;
  onCell: (rowId: string, key: string, value: string | number | null) => void;
  onBox: (key: string, value: string) => void;
}) {
  const boxes = new Map(layout.headerFields.map((f) => [f.key, f]));
  // Each box written in a heading is typed (and bound, for a downloaded file) in the first table that names it.
  const host = new Map<string, number>();
  for (const t of panels.tables) {
    for (const p of headingParts(t.firstHeading)) if ("box" in p && !host.has(p.box)) host.set(p.box, t.index);
  }
  for (const key of Object.values(panels.namesUnder)) if (!host.has(key)) host.set(key, 0);
  const headingBox = (key: string, table: number) => {
    const field = boxes.get(key);
    if (!field) return null;
    return <HeadingBox field={field} value={header[key] ?? ""} editable={editable} bound={host.get(key) === table} onBox={onBox} list={lists?.[key] ?? field.list} />;
  };
  const [first, ...readings] = panels.columns;
  return (
    <div className="paper-panels mt-4" data-section="paper-panels" style={{ "--paper-panels": panels.perRow } as React.CSSProperties}>
      {panels.tables.map((t) => (
        <div key={t.index} className="doc-table" style={{ overflowX: "auto" }} data-panel={t.index}>
          <table className={editable ? "compact log-sheet paper-panel is-editing" : "compact log-sheet paper-panel"}>
            <thead>
              <tr>
                <th rowSpan={2} className="paper-panel-first">
                  {headingParts(t.firstHeading).map((p, pi) => ("box" in p ? <React.Fragment key={pi}>{headingBox(p.box, t.index)}</React.Fragment> : <React.Fragment key={pi}>{p.text}</React.Fragment>))}
                </th>
                <th className="col-group paper-panel-heading" colSpan={Math.max(1, readings.length)}>
                  {documentTextIn(t.heading, lang)}
                </th>
              </tr>
              <tr>
                {readings.map((c) => {
                  const nameKey = panels.namesUnder[c.key];
                  const name = nameKey ? (header[nameKey] ?? "") : "";
                  return (
                    <th key={c.key}>
                      {columnHeading(c)}
                      {nameKey && (editable || name) ? (
                        <>
                          {"\n("}
                          {headingBox(nameKey, t.index)}
                          {")"}
                        </>
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.slice(t.first, t.first + t.length).map((row, j) => {
                const i = t.first + j;
                const rowName = logRowName(row, layout.columns);
                return (
                  <tr key={row.id}>
                    {[first, ...readings].map((c) => {
                      const at = layout.columns.indexOf(c);
                      return (
                        <td key={c.key} className={isOutOfBand(c, row[c.key]) ? "cell-out-of-band" : ""}>
                          <CellInput
                            col={c}
                            bind={bindProps(logCellBind(row, i, c, rowName))}
                            issuedLabel={issuedColumns?.[at]?.label ?? c.label}
                            value={c.fixed ? documentTextIn(row[c.key], lang) : row[c.key]}
                            editable={editable && !c.fixed && !c.computed}
                            onChange={(v) => onCell(row.id, c.key, v)}
                            employees={employees}
                            list={lists?.[c.key] ?? c.list}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            {t.footer && (
              <tfoot>
                <tr data-panel-footer={t.footer.key}>
                  <th scope="row" className="paper-panel-footer-label">
                    {panels.footerLabel}
                  </th>
                  <td colSpan={Math.max(1, readings.length)}>
                    <HeaderFieldInput field={t.footer} issuedLabel={t.footer.label} value={header[t.footer.key] ?? ""} editable={editable} onChange={(v) => onBox(t.footer!.key, v)} employees={employees} inTable />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ))}
    </div>
  );
}

/**
 * A box above the grid written inside a heading of the paper's small tables (F-QC-14's inspectors' names, its FG code):
 * typed where it is bound, shown as written everywhere else. Its name is what a screen reader says.
 */
function HeadingBox({
  field,
  value,
  editable,
  bound,
  onBox,
  list,
}: {
  field: LogHeaderField;
  value: string;
  editable: boolean;
  bound: boolean;
  onBox: (key: string, value: string) => void;
  list?: string;
}) {
  const bind = bound ? bindProps(logHeaderBind(field)) : undefined;
  if (!editable || !bound) {
    return (
      // A copy written again where the paper writes it again says so: its value is bound where it is typed.
      <span className="cell-text notranslate" translate="no" data-heading-box={field.key} data-repeats={bound ? undefined : field.key} {...bind}>
        {value}
      </span>
    );
  }
  return <input className="input input-sm paper-panel-box" {...bind} aria-label={field.label} data-heading-box={field.key} value={value} list={list} onChange={(e) => onBox(field.key, e.target.value)} />;
}

/** A sheet holds one photograph where its paper prints one (F/QC/29's analysis report). */
const SHEET_PHOTOS_MAX = 1;

/**
 * THE PHOTOGRAPH A PAPER PRINTS UNDER ITS TABLE (REQUIREMENTS §111, the review of 13-Oct-2026): F/QC/29's analysis
 * report prints the label roll it analysed. Added from a picture while the record is open for writing — scaled down to
 * a JPEG as the complaint report's photographs are (utils/image.ts) — kept in the record and printed in its place.
 */
function SheetPhotos({ photos, editable, onChange }: { photos: SheetPhoto[]; editable: boolean; onChange: (photos: SheetPhoto[]) => void }) {
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  if (!editable && photos.length === 0) return null;
  const add = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      onChange([...photos, { id: generateId("photo"), name: file.name, dataUrl: await imageFileToDataUrl(file) }].slice(0, SHEET_PHOTOS_MAX));
      setProblem(null);
    } catch {
      setProblem(`${file.name} couldn't be read as a photograph — use a JPG or PNG.`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return (
    <div className="sheet-photos mt-4" data-section="sheet-photos">
      {photos.map((p) => (
        <figure key={p.id} className="sheet-photo" data-photo={p.id}>
          <img src={p.dataUrl} alt={p.name || "Photograph"} />
          {editable && (
            <button className="btn btn-ghost btn-sm no-print" title="Remove this photograph" aria-label="Remove this photograph" data-action="remove-sheet-photo" onClick={() => onChange(photos.filter((x) => x.id !== p.id))}>
              <FiTrash2 size={13} />
            </button>
          )}
        </figure>
      ))}
      {editable && photos.length < SHEET_PHOTOS_MAX && (
        <button type="button" className="btn btn-secondary btn-sm no-print" data-action="add-sheet-photo" disabled={busy} onClick={() => fileRef.current?.click()}>
          <FiPlus size={13} /> {busy ? "Adding…" : "Add photograph"}
        </button>
      )}
      {editable && <input ref={fileRef} type="file" accept="image/*" hidden data-field="sheet-photo-upload" onChange={(e) => void add(e.target.files)} />}
      {problem && (
        <div className="text-xs no-print mt-1" style={{ color: "var(--color-warning)" }}>
          {problem}
        </div>
      )}
    </div>
  );
}

/**
 * THE GRID PRINTED ACROSS THE PAGE (REQUIREMENTS §111): each line of the record is a column and each
 * column a line, as F/QC/06 and F/QC/07 print their PRINTING table — "No. of Colors" over 1 to 10, then
 * Given By Client and Color Shade Verified. The cells are the record's own (the same binding, the same
 * words for a printed cell, the same highlight out of band), so what is written, checked, downloaded and
 * read back is as on any grid. The spanning heading the columns share (PRINTING) heads the table.
 */
function AcrossGrid({
  columns,
  issuedColumns,
  rows,
  fixedRows,
  editable,
  lang,
  employees,
  lists,
  onCell,
}: {
  columns: LogColumn[];
  issuedColumns: LogColumn[] | undefined;
  rows: LogSheetRow[];
  fixedRows: Record<string, string | number | null>[] | undefined;
  editable: boolean;
  lang: Parameters<typeof documentTextIn>[1];
  employees: string[];
  lists?: Record<string, string>;
  onCell: (rowId: string, key: string, value: string | number | null) => void;
}) {
  const shared = columns.length > 0 && columns.every((c) => c.group !== undefined && c.group === columns[0].group) ? columns[0].group : undefined;
  return (
    <div className="doc-table mt-4" style={{ overflowX: "auto" }}>
      <table className={editable ? "compact log-sheet log-sheet-across is-editing" : "compact log-sheet log-sheet-across"} data-across="">
        {shared && (
          <thead>
            <tr>
              <th className="col-group" colSpan={rows.length + 1}>
                {shared}
              </th>
            </tr>
          </thead>
        )}
        <tbody>
          {columns.map((c, ci) => (
            <tr key={c.key} data-column={c.key}>
              <th scope="row" className="log-sheet-across-head">
                {columnHeading(c)}
              </th>
              {rows.map((row, i) => {
                const col = effectiveColumn(c, fixedRows?.[i]);
                return (
                  <td key={row.id} className={isOutOfBand(c, row[c.key]) ? "cell-out-of-band" : ""}>
                    <CellInput
                      col={col}
                      bind={bindProps(logCellBind(row, i, col, logRowName(row, columns)))}
                      issuedLabel={issuedColumns?.[ci]?.label ?? c.label}
                      // A printed cell (the colour's number) reads in the chosen language; a written one as it was written.
                      value={col.fixed ? documentTextIn(row[c.key], lang) : row[c.key]}
                      editable={editable && !col.fixed && !col.computed}
                      onChange={(v) => onCell(row.id, c.key, v)}
                      employees={employees}
                      list={lists?.[c.key] ?? c.list}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * ONE ANSWER ACROSS THE PAPER'S COLUMNS (REQUIREMENTS §111, part 4), as F/QC/25 prints its fourteen lines: the top
 * line holds Sr.No., the printed words' empty heading and the boxes the paper prints there (OID :- and Job Code:);
 * every line has its one answer box across the paper's four columns, but the lines written in those columns (7.1,
 * 7.2, 7.3), whose headings — GSM over Specified GSM and Tested GSM, BF, Grade of Paper — stand on the printed line
 * the paper heads them on (7, Material Specification). The cells are the record's own (the same binding, the same
 * words for a printed cell, the same highlight out of band); the record still holds every column on every line.
 */
function AnswerAcrossGrid({
  spec,
  headBoxes,
  rows,
  fixedRows,
  columns,
  issuedColumns,
  editable,
  lang,
  employees,
  lists,
  onCell,
}: {
  spec: AnswerAcross;
  /** The boxes the paper prints on the grid's top line, drawn by the sheet (they are header boxes). */
  headBoxes: React.ReactNode[];
  rows: LogSheetRow[];
  fixedRows: Record<string, string | number | null>[] | undefined;
  columns: LogColumn[];
  issuedColumns: LogColumn[] | undefined;
  editable: boolean;
  lang: Parameters<typeof documentTextIn>[1];
  employees: string[];
  lists?: Record<string, string>;
  onCell: (rowId: string, key: string, value: string | number | null) => void;
}) {
  const { answer, across, lead, headingLine, lines } = spec;
  const spans = gridHeadSpans(headBoxes.length, across.length);
  const runs = headingRuns(across);
  const twoHeadingRows = runs.some((r) => r.group !== undefined);
  const cell = (c: LogColumn, row: LogSheetRow, i: number, extra: { colSpan?: number; rowSpan?: number } = {}) => {
    const col = effectiveColumn(c, fixedRows?.[i]);
    const at = columns.indexOf(c);
    return (
      <td key={c.key} className={isOutOfBand(c, row[c.key]) ? "cell-out-of-band" : ""} {...extra}>
        <CellInput
          col={col}
          bind={bindProps(logCellBind(row, i, col, logRowName(row, columns)))}
          issuedLabel={issuedColumns?.[at]?.label ?? c.label}
          // A printed cell (the line's number, its words) reads in the chosen language; a written one as it was written.
          value={col.fixed ? documentTextIn(row[c.key], lang) : row[c.key]}
          editable={editable && !col.fixed && !col.computed}
          onChange={(v) => onCell(row.id, c.key, v)}
          employees={employees}
          list={lists?.[c.key] ?? c.list}
        />
      </td>
    );
  };
  return (
    <div className="doc-table mt-4" style={{ overflowX: "auto" }}>
      <table className={editable ? "compact log-sheet log-sheet-answer-across is-editing" : "compact log-sheet log-sheet-answer-across"} data-answer-across={answer.key}>
        <thead>
          <tr>
            {lead.map((c) => (
              <ColumnHead key={c.key} col={c} />
            ))}
            {headBoxes.length > 0 ? (
              headBoxes.map((box, bi) => (
                <th key={bi} className="grid-head-box" colSpan={spans[bi] ?? 1}>
                  {box}
                </th>
              ))
            ) : (
              <ColumnHead col={answer} colSpan={across.length} />
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            if (i === headingLine) {
              // The printed line that heads the paper's columns: its own number and words, then their headings.
              return (
                <React.Fragment key={row.id}>
                  <tr data-heading-line="">
                    {lead.map((c) => cell(c, row, i, twoHeadingRows ? { rowSpan: 2 } : {}))}
                    {runs.map((run, ri) =>
                      run.group !== undefined ? (
                        <th key={`g-${ri}`} className="col-group" colSpan={run.columns.length}>
                          {run.group}
                        </th>
                      ) : (
                        run.columns.map((c) => <ColumnHead key={c.key} col={c} rowSpan={twoHeadingRows ? 2 : undefined} />)
                      )
                    )}
                  </tr>
                  {twoHeadingRows && (
                    <tr data-heading-line="">
                      {across
                        .filter((c) => c.group !== undefined)
                        .map((c) => (
                          <ColumnHead key={c.key} col={c} />
                        ))}
                    </tr>
                  )}
                </React.Fragment>
              );
            }
            return (
              <tr key={row.id}>
                {lead.map((c) => cell(c, row, i))}
                {lines.has(i) ? across.map((c) => cell(c, row, i)) : cell(answer, row, i, { colSpan: across.length })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * How many cells the column at `at` spans on a line drawn one cell a heading (groupCellLines): the whole run of
 * columns under its heading for the run's first column, 0 for the others (drawn by the first), 1 for a column
 * under no heading.
 */
function groupSpan(columns: LogColumn[], at: number): number {
  const group = columns[at].group;
  if (group === undefined) return 1;
  if (at > 0 && columns[at - 1].group === group) return 0;
  let n = 1;
  while (at + n < columns.length && columns[at + n].group === group) n += 1;
  return n;
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
  spans,
  columns,
  issuedColumns,
  second,
  fixedRow,
  judge,
  groupCells,
  spanDown,
  joinsAbove,
  numbered,
  srNo,
  editable,
  lang,
  employees,
  lists,
  personKey,
  machineKey,
  linked,
  canRemove,
  onCell,
  onPersonBlur,
  onMachineBlur,
  onRemove,
}: {
  row: LogSheetRow;
  index: number;
  /** By merged column, how many lines its cell runs down from this line — 0 where a cell above covers it (LogColumn.merged, REQUIREMENTS §111). */
  spans?: Record<string, number>;
  columns: LogColumn[];
  issuedColumns: LogColumn[] | undefined;
  /** The entry's second line, where the paper gives it one (REQUIREMENTS §111): its heading, and the column under each of `columns`. */
  second?: GridLines["second"];
  /** The line the form prints here, on a form that prints its lines. */
  fixedRow: Record<string, string | number | null> | undefined;
  /** Whether a cell is outside the band its paper prints (engine/printedBands.ts): the same function until a tolerance box changes. */
  judge: CellJudge;
  /** A line the paper prints with one cell under each heading (LogSheetLayout.groupCellLines): F/QC/11's Pass/Fail and Sign. */
  groupCells?: boolean;
  /** The printed cells of this line that stand down over the next, which continues it (continuationLines): its Sr. No. too. */
  spanDown?: string[];
  /** The printed cells of this line drawn by the line above, which it continues: and its Sr. No. */
  joinsAbove?: string[];
  /** The sheet's own Sr. No. is drawn (the form does not number its lines itself, REQUIREMENTS §102). */
  numbered: boolean;
  /** What the Sr. No. shows: the line's number, or the record's date on a sheet that writes the day there (REQUIREMENTS §111). */
  srNo?: string;
  editable: boolean;
  lang: Parameters<typeof documentTextIn>[1];
  employees: string[];
  lists?: Record<string, string>;
  /** The column that names a person HR Master Data can fill a line from (REQUIREMENTS §53). */
  personKey?: string;
  /** The column that names a machine the equipment master can fill a line from (REQUIREMENTS §74). */
  machineKey?: string;
  /** The line's cells read from another document (REQUIREMENTS §82), by column key; never stored on the line. */
  linked?: RowLinks;
  canRemove: boolean;
  onCell: (rowId: string, key: string, value: string | number | null) => void;
  onPersonBlur: (rowId: string | null, value: string) => void;
  onMachineBlur: (rowId: string | null, value: string) => void;
  onRemove: (rowId: string) => void;
}) {
  // What the line is called in a downloaded file's list of boxes: its time slot, its parameter (REQUIREMENTS §81).
  const rowName = logRowName(row, columns);
  const lineSpan = second ? 2 : undefined;
  // A second line headed with nothing (F-QC-40.C's sign under each reading, REQUIREMENTS §111): the first column — the
  // day — runs down both lines, as the one cell of the paper holds the reading and the sign.
  const leadSpans = !!second && second.label === "";
  const firstLine = (
    <tr data-line={second ? "first" : undefined} data-continues={joinsAbove ? "" : undefined}>
      {numbered && !joinsAbove && (
        <td className="text-muted" rowSpan={spanDown ? 2 : lineSpan} data-sr-no="">
          {srNo ?? index + 1}
        </td>
      )}
      {columns.map((c, ci) => {
        // ONE CELL A HEADING (REQUIREMENTS §111): on F/QC/11's Pass/Fail and Sign. lines a plate's size and Deviation
        // columns are one cell, the first column's; the record keeps the others, empty.
        const across = groupCells && c.group !== undefined ? groupSpan(columns, ci) : 1;
        if (across === 0) return null;
        // A printed cell the line above draws down over this one (F/QC/18's DRYING TEST, §111 part 6).
        if (joinsAbove?.includes(c.key)) return null;
        // A line the form prints blank (F/HR/05's two spare topic lines)
        // has nothing fixed in it, so it is written in like any cell.
        const col = effectiveColumn(c, fixedRow);
        if (c.linkedFrom) {
          return (
            <td key={c.key}>
              <LinkedCell colKey={c.key} from={c.linkedFrom} cell={linked?.[c.key]} />
            </td>
          );
        }
        // A cell the paper merges down a run of lines is drawn on the run's first line only, across the run.
        const span = spans?.[c.key];
        if (span === 0) return null;
        // A printed cell standing down over the next line, which continues it (F/QC/18's DRYING TEST, §111 part 6).
        const rowSpan = span !== undefined && span > 1 ? span : spanDown?.includes(c.key) || (ci === 0 && leadSpans) ? 2 : undefined;
        return (
          <td
            key={c.key}
            className={judge(row, c, fixedRow) ? "cell-out-of-band" : ""}
            colSpan={across > 1 ? across : undefined}
            rowSpan={rowSpan}
            data-merged={span !== undefined && span > 1 ? String(span) : undefined}
          >
            <CellInput
              col={col}
              bind={bindProps(logCellBind(row, index, col, rowName))}
              issuedLabel={issuedColumns?.[ci]?.label ?? c.label}
              // A printed cell — the parameter, the material, the specification
              // the form prints down its side — reads in the chosen language;
              // a written one reads exactly as it was written. Its own number is the Sr. No.'s (§102).
              value={col.fixed ? documentTextIn(numbered ? withoutLineNumber(printedCell(row, c.key, fixedRow), index + 1) : printedCell(row, c.key, fixedRow), lang) : row[c.key]}
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
        <td rowSpan={lineSpan}>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onRemove(row.id)} title="Remove row">
            <FiTrash2 size={13} />
          </button>
        </td>
      )}
    </tr>
  );
  if (!second) return firstLine;
  // THE ENTRY'S SECOND LINE (REQUIREMENTS §111): its heading in the first column, and under each
  // column of the first line the column the paper draws beneath it — F/QC/12's Deviation % under
  // each Tested Value. The values are the same line's; nothing is stored apart.
  return (
    <>
      {firstLine}
      <tr data-line="second" className="log-second-line">
        {columns.map((c, ci) => {
          if (ci === 0) {
            if (leadSpans) return null;
            return (
              <td key={c.key} className="second-line-label">
                {second.label}
              </td>
            );
          }
          const under = second.under[ci];
          if (!under) return <td key={c.key} />;
          return (
            <td key={c.key} className={judge(row, under, fixedRow) ? "cell-out-of-band" : ""} data-beneath={under.key}>
              <CellInput
                col={under}
                bind={bindProps(logCellBind(row, index, under, rowName))}
                issuedLabel={under.label}
                value={row[under.key]}
                editable={editable && !under.fixed && !under.computed}
                onChange={(v) => onCell(row.id, under.key, v)}
                employees={employees}
                list={lists?.[under.key] ?? under.list}
              />
            </td>
          );
        })}
      </tr>
    </>
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
  inTable,
  outOfBand,
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
  /** A cell of the paper's table of boxes (boxTable, REQUIREMENTS §111). */
  inTable?: boolean;
  /** Outside the paper's tolerance of the box it is judged against (LogHeaderField.within, REQUIREMENTS §111 rule 2). */
  outOfBand?: boolean;
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
      inTable={inTable}
      outOfBand={outOfBand}
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
  inTable = false,
  outOfBand = false,
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
  /** A cell of the paper's table of boxes (boxTable, REQUIREMENTS §111): the table's words head it. */
  inTable?: boolean;
  /** Outside the paper's tolerance (LogHeaderField.within): highlighted as a reading outside its band is. */
  outOfBand?: boolean;
}) {
  // A CELL OF THE PAPER'S TABLE OF BOXES (REQUIREMENTS §111) — F/QC/06's LABEL STOCK — is headed by the
  // table's own words, so it draws no label of its own: its name is what a screen reader says. Every other
  // box stands under its label, in its column of the line where the paper puts it there (paperColumn).
  const named = inTable ? { "aria-label": field.label } : {};
  // THE WORDS THE PAPER PRINTS UNDER THE BOX (REQUIREMENTS §111, part 4): "QA INSPECTOR" under the space INSPECTED BY
  // is signed in. Printed words, not a value: a downloaded file names the box by its label, as before.
  const below = field.printedBelow ? (
    <span className="box-printed-below" aria-hidden="true" data-printed-below={field.key}>
      {field.printedBelow}
    </span>
  ) : null;
  const box = (plain: string, label: React.ReactNode, body: React.ReactNode) => {
    const className = outOfBand ? `${plain} field-out-of-band` : plain;
    return inTable ? (
      <div className={`${className} field-in-table`} data-box={field.key}>
        {body}
      </div>
    ) : (
      <div className={below ? `${className} field-printed-below` : className} {...paperColumnProps(field)}>
        {label}
        {body}
        {below}
      </div>
    );
  };
  // A box that names a PERSON offers the employee names. "Machine Name:",
  // "Name of Equipment:" and "EQUIPMENT NAME" name a machine (REQUIREMENTS §74),
  // and offering them the people on the payroll put a person's name one tap
  // away from a machine's box. "Sign" is a word of its own: "Designation" holds
  // a post, not a person (REQUIREMENTS §76).
  // A Gujarati paper's label is read by its English (F/QC/13's "ઓપરેટર", "QA પર્સન", REQUIREMENTS §111).
  const readLabel = `${issuedLabel} ${documentTextIn(issuedLabel, "en")}`;
  const isName =
    /operator|name|inspected|person|\bsign/i.test(readLabel) && field.type === "text" && !/job name|customer name|machine|equipment|equipoment/i.test(readLabel);
  // Where the box's value lives in the record — header and footer boxes alike
  // live in data.header — for an edited Excel file read back (REQUIREMENTS §81).
  // A box the sheet works out is not bound.
  const bound = bindProps(logHeaderBind(field));
  // A BOX THE PAPER FILLS IN PRINT — F/QC/11's Device ID No "1-54, 2-55, 3-56, 4-57" — reads as the
  // paper prints it, as text, and is never typed into (REQUIREMENTS §111). What a record holds there is
  // the same words (engine/paperLayout.ts), so nothing is bound.
  if (isPrintedBox(field)) {
    return box(
      "field",
      <label>{field.printedLabel ?? field.label}</label>,
      <span className="cell-text notranslate" translate="no" data-printed={field.key}>
        {field.printed}
      </span>
    );
  }
  // A box WORKED OUT from the sheet — F/MKT/02's totals and its % Satisfaction
  // Index (REQUIREMENTS §77) — reads as text, as a worked-out cell does.
  if (field.computed) {
    return box(
      "field",
      <label>{field.printedLabel ?? field.label}</label>,
      <span className="cell-text notranslate" translate="no" data-computed={field.key}>
        {value}
      </span>
    );
  }
  // The "*" of a box that must be written is the screen's mark, not the paper's: it does not print
  // (REQUIREMENTS §111, part 4 — the incoming records printed "Date of Inspection *").
  const required = field.required ? <span className="no-print"> *</span> : null;
  const label = (
    <label>
      {field.inSentence ? field.inSentence.before : (field.printedLabel ?? field.label)}
      {required}
    </label>
  );
  // A block of prose is its own kind of box: it takes the width of the row it
  // sits in and grows with what is written (REQUIREMENTS §68).
  if (field.type === "paragraph") {
    return box("field field-paragraph", label, <ParagraphInput value={value} editable={editable} onChange={onChange} bind={bound} />);
  }
  const input = (
    <input
      className="input input-sm"
      {...bound}
      {...named}
      type={field.type === "date" ? "date" : field.type === "time" ? "time" : "text"}
      // An empty date or time box prints empty, not "dd-mm-yyyy" (REQUIREMENTS §111, styles.css).
      data-empty={value ? undefined : ""}
      list={list ?? (isName ? "log-sheet-employees" : undefined)}
      disabled={!editable}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
    />
  );
  // THE PAPER'S HEADING, WRITTEN BY THE PERSON (REQUIREMENTS §111, the review of 13-Oct-2026): F/QC/29's "PSL Analysis
  // Report", centred over the table in bold with no label. The label stays the box's name for a downloaded file and a
  // screen reader, and is not printed.
  if (field.asHeading && field.type === "text") {
    return box("field field-as-heading", <label className="sr-only">{field.label}</label>, input);
  }
  // THE VALUE INSIDE THE PAPER'S SENTENCE (REQUIREMENTS §111, part 4): "This material should be retested on
  // 03/07/2022 before usage." on one line. The words after the box are printed words: a downloaded file names
  // the box by the words before it and holds the date alone, as before.
  if (field.inSentence && field.type !== "select" && field.type !== "yesno") {
    return box(
      "field field-in-sentence",
      label,
      <>
        {input}
        <span className="field-sentence-after" aria-hidden="true">
          {field.inSentence.after}
        </span>
      </>
    );
  }
  // A BOX THE FORM PRINTS AS A CHOICE is offered as one, and "yesno"
  // means the same thing here as it does in the grid above: the two
  // answers, without them having to be written out in the layout. It did
  // not, and so F/PUR/01's "DO YOU HOLD ISO 9001 ... CERTIFICATION:"
  // asked a yes-or-no question and gave a free text box to answer it
  // (REQUIREMENTS §68, found while adding F/STR/01 in §71, whose stamp is
  // seven such questions).
  if (field.type !== "select" && field.type !== "yesno") return box("field", label, input);
  const choice = (
    <select className="input input-sm" {...bound} {...named} data-empty={value ? undefined : ""} disabled={!editable} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select…</option>
      {(field.type === "yesno" ? ["Yes", "No"] : (field.options ?? [])).map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
  // THE CHOICES THE PAPER PRINTS ACROSS THE LINE (REQUIREMENTS §111, part 4): an incoming record's "LOT STATUS
  // ⇒ ACCEPTED | REJECT & SEND BACK TO SUPPLIER / SCRAP | SEGREGATION | ACCEPTED ON DEVIATION", the one that
  // holds marked. Open for writing, the choice box is what is used and the words print; signed off, the words
  // are what is shown. The choice box stays the record's bound box either way (the downloads, a screen reader).
  const words = choiceWords(field, value);
  if (words) {
    return box(
      `field field-choices-across${editable ? " is-editable" : ""}`,
      label,
      <>
        {choice}
        <span className="choices-across" aria-hidden="true" data-choices-across={field.key}>
          {words.map((w) => (
            <span key={w.option} className={w.chosen ? "choice-across is-chosen" : "choice-across"} data-chosen={w.chosen ? "" : undefined}>
              {w.word}
            </span>
          ))}
        </span>
      </>
    );
  }
  return box("field", label, choice);
}

/**
 * The box a form prints for a block of prose. It is never given a placeholder —
 * a hint sitting in an empty box on a controlled record could be read as
 * something somebody wrote — and it is sized to what it holds, so the whole
 * block is on the paper with no scrollbar cutting it off. A record that cannot
 * be written on shows the block as text, exactly as it was written.
 */
const SIZES_ITSELF = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content");

function ParagraphInput({ value, editable, onChange, bind }: { value: string; editable: boolean; onChange: (v: string) => void; bind?: Record<string, string> }) {
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
      <p className="paragraph-text notranslate" translate="no" {...bind}>
        {value}
      </p>
    );
  }
  return <textarea ref={box} className="input input-sm input-paragraph" {...bind} rows={2} value={value} onChange={(e) => onChange(e.target.value)} />;
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
  bind,
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
  /** Where the cell's value lives in the record (REQUIREMENTS §81) — on the box, and on the words a locked sheet shows. None on a printed cell. */
  bind?: Record<string, string>;
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
      <span className="cell-text notranslate" translate="no" {...bind}>
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
        {...bind}
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
      <select className="input input-sm" {...bind} data-empty={value ? undefined : ""} disabled={!editable} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
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
        {...bind}
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
      {...bind}
      // An empty date or time box prints empty, not "dd-mm-yyyy" or "--:--" (REQUIREMENTS §111, styles.css).
      data-empty={value === null || value === undefined || value === "" ? "" : undefined}
      list={list ?? (isSign && employees.length ? "log-sheet-employees" : undefined)}
      disabled={!editable}
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
    />
  );
}
