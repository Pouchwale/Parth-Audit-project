import React from "react";
import type { DocumentDefinition, RecordInstance, ServiceReportAreaLine, ServiceReportData } from "../../types";
import { COMPANY } from "../../data/seed/masterData";
import {
  SERVICE_PAPER_COLUMNS,
  SERVICE_PAPER_LABELS,
  SERVICE_PAPER_NARROW_AREAS,
  SERVICE_PAPER_PESTS,
  SERVICE_PAPER_PX_PER_CHAR,
  SERVICE_PAPER_TALL_AREAS,
  SERVICE_PAPER_TITLE,
  servicePaperDate,
} from "../../data/seed/serviceReportPaper";
import { isQuantityLine, normalizeServiceLines, serviceGroups } from "../../engine/serviceMaterials";
import { bindProps, serviceReportBind } from "../../engine/roundTrip/bindingsFor";
import { formatWordsAt, nextRevisionNo } from "../../data/formatEdits";
import { commitFormatChange, draftOf } from "../../engine/formatOps";
import { documentRepository } from "../../data/repositories/documentRepository";
import { isEditableStatus } from "../../engine/recordLifecycle";
import { useAppStore } from "../../store/AppStore";
import { todayISO } from "../../utils/date";
import type { RevisionChoice } from "../common/SureFirst";
import { EditableWords } from "./EditableWords";

// THE SERVICE REPORT IS THE CONTRACTOR'S SHEET (the owner, 17-Oct-2026: "make sure it looks like it only"). One printed
// grid, as the paper draws it: the title at the left, the band (the contractor, the service name, the date), the Unit
// line, then Sl.No / Area / Material / Qty used / Method / Remarks — the material, the quantity and the method ONE
// merged cell for each run of areas treated with the same material, the Remarks one merged cell for the whole report —
// and the two signatures at the foot. What a person writes sits in the paper's own cells: no boxes, no Add Area, no
// trash can (an area the plant adds or drops is a Master Data change). The three services share the sheet and differ
// in their name, their areas and their material rules (engine/serviceMaterials.ts).
//
// The quantity is typed once, on the first line of its material, and holds for every line with it; the Remarks is one
// remark for the visit and is the first line's — a remark an earlier version (or Mitra) wrote against another line is
// shown under it, never dropped.
import { PrintedWordsAt, ownLines } from "./PrintedWordsAt";

export function ServiceReportRecordView({
  doc,
  record,
  editable,
  countersignEditable = false,
  onChange,
}: {
  doc: DocumentDefinition;
  record: RecordInstance<ServiceReportData>;
  editable: boolean;
  // While the report waits for verification, the customer's representative
  // still countersigns it — and Verify requires that signature — so that one
  // field stays writable then (everything else is locked).
  countersignEditable?: boolean;
  onChange: (data: ServiceReportData) => void;
}) {
  const data = record.data;
  const lines = data.lines;

  // Every change to the lines goes through the service's fixed rules
  // (engine/serviceMaterials.ts): material and method follow the area, and the
  // quantity follows the first line of its material.
  const setLines = (next: ServiceReportAreaLine[]) => onChange({ ...data, lines: normalizeServiceLines(doc.variantKey, next) });
  const updateLine = (slNo: number, patch: Partial<ServiceReportAreaLine>) => setLines(lines.map((l) => (l.slNo === slNo ? { ...l, ...patch } : l)));

  const groups = serviceGroups(lines);
  const groupAt = new Map(groups.map((g) => [g.first, g]));
  const tall = new Set(SERVICE_PAPER_TALL_AREAS[doc.variantKey ?? ""] ?? []);
  const narrow = new Set(SERVICE_PAPER_NARROW_AREAS[doc.variantKey ?? ""] ?? []);
  const pests = SERVICE_PAPER_PESTS[doc.variantKey ?? ""] ?? SERVICE_PAPER_PESTS[data.serviceName] ?? "";
  const lead = lines[0];
  const others = lines.slice(1).filter((l) => l.remarks.trim() && l.remarks.trim() !== (lead?.remarks ?? "").trim());
  const customerOpen = editable || countersignEditable;
  const { currentUser, bump } = useAppStore();
  const [problem, setProblem] = React.useState<string | null>(null);
  // EVERY PRINTED WORD OF THE REPORT IS THE FORMAT'S (the owner, 31-Oct-2026, REQUIREMENTS §154: "whatever user change in
  // format then it should be change from that format to all upcoming formats"): the title, the contractor, the plant, the
  // service, the headings, each area, each material and method, the captions. Typed over, it is asked first - a new
  // revision with its number and date, or none (§148) - then saved on the format, and this report and every one after it
  // print it; a report handed in before keeps the words it was handed in with. A report's own words from before (§137)
  // stand until that place is changed again. The date is the report's own.
  const handedInAt = isEditableStatus(record.status) ? undefined : (record.submittedAt ?? record.verifiedAt ?? record.updatedAt);
  const number = doc.formatNo.startsWith("TO BE") ? doc.name : doc.formatNo;
  const offer = { current: { no: doc.revisionNo ?? "", date: doc.revisionDate ?? "" }, next: { no: nextRevisionNo(doc.revisionNo), date: todayISO() } };
  const saveFormatWords = (place: string, typed: string, was: string, choice?: RevisionChoice) => {
    const latest = documentRepository.getById(doc.id) ?? doc;
    const result = commitFormatChange(latest, { ...draftOf(latest), wordsAt: { place, words: typed, was } }, { actor: currentUser, reason: "Printed words reworded on the report", ...choice });
    if (!result.ok) return setProblem(result.error);
    setProblem(null);
    const own = data.printedWords;
    if (own && own[place] !== undefined) {
      const rest = { ...own };
      delete rest[place];
      onChange({ ...data, printedWords: rest });
    }
    bump();
  };
  const at = (place: string, issued: string, children?: React.ReactNode, label?: string) => {
    if (place === "date")
      return (
        <PrintedWordsAt place={place} words={data.printedWords} original={issued} editable={editable} onWords={(printedWords) => onChange({ ...data, printedWords })} label={label}>
          {children}
        </PrintedWordsAt>
      );
    const own = data.printedWords?.[place];
    const formats = formatWordsAt(doc.id, place, issued, handedInAt);
    const shown = own ?? formats;
    return (
      <EditableWords shown={shown} editable={editable} label={label} format={{ number, offer }} onChange={(typed, choice) => saveFormatWords(place, typed, shown, choice)}>
        {own !== undefined || formats !== issued ? ownLines(shown) : (children ?? issued)}
      </EditableWords>
    );
  };

  // Every value a person writes carries where it lives in the record, so an
  // edited Excel file can be read back (REQUIREMENTS §81). Material and method
  // follow the area and are not bound; the quantity is bound on the one line of
  // its material it is written on.
  return (
    <div data-bind-record={record.id} className="svc-paper-wrap">
      <table className="svc-paper" data-table="service-lines" data-paper-sheet data-xl-pt-per-px="1" data-xl-sheet="Service Report">
        <colgroup>
          {SERVICE_PAPER_COLUMNS.map((chars, i) => (
            <col key={i} data-xl-w={chars} style={{ width: Math.round(chars * SERVICE_PAPER_PX_PER_CHAR * 10) / 10 }} />
          ))}
        </colgroup>
        <tbody>
          <tr className="svc-title-row">
            <td colSpan={6} className="svc-title">
              {at("title", SERVICE_PAPER_TITLE)}
            </td>
          </tr>
          <tr className="svc-band-row">
            <td colSpan={3} className="svc-band svc-left notranslate" translate="no">
              {at("provider", SERVICE_PAPER_LABELS.provider)}
            </td>
            <td colSpan={2} className="svc-band svc-left">
              {at("serviceNameLabel", SERVICE_PAPER_LABELS.serviceName)}
            </td>
            <td className="svc-band svc-date-label">{at("dateLabel", SERVICE_PAPER_LABELS.date)}</td>
          </tr>
          <tr className="svc-unit-row">
            {/* The provider, the plant and its address read as issued in either language (REQUIREMENTS §58). */}
            <td colSpan={3} className="svc-band svc-left notranslate" translate="no" data-cell="unit">
              {at("unit", `${SERVICE_PAPER_LABELS.unit} ${COMPANY.name}, ${COMPANY.address.toUpperCase().replace("–", "-")}`)}
            </td>
            <td colSpan={2} className="svc-band svc-left" data-cell="service-name">
              {at(
                "serviceName",
                pests ? `${data.serviceName}\n${pests}` : data.serviceName,
                <>
                  {data.serviceName}
                  {pests && (
                    <>
                      <br />
                      {pests}
                    </>
                  )}
                </>
              )}
            </td>
            <td className="svc-band svc-date-value" data-cell="date">
              {at("date", servicePaperDate(record.dueDate))}
            </td>
          </tr>
          <tr className="svc-head-row">
            {SERVICE_PAPER_LABELS.headings.map((h, i) => (
              <td key={h} className={`svc-head${i === 1 || i === 5 ? " svc-left" : ""}`}>
                {at(`heading:${i}`, h)}
              </td>
            ))}
          </tr>
          {lines.length === 0 && (
            <tr data-line="none">
              <td colSpan={6} className="svc-none">
                No fixed area list exists for this service yet: the areas are set in Master Data.
              </td>
            </tr>
          )}
          {lines.map((l, i) => {
            const group = groupAt.get(i);
            const entersQty = isQuantityLine(lines, i);
            const qtyBind = bindProps(serviceReportBind.qty(lines, i));
            const sharing = lines.filter((x) => x.materialName === l.materialName);
            return (
              <tr key={l.slNo} data-line={l.slNo} className={`${group ? "svc-group-start" : ""}${tall.has(l.areaName) ? " svc-tall" : ""}${narrow.has(l.areaName) ? " svc-narrow" : ""}`}>
                <td className="svc-no">{l.slNo}</td>
                <td className="svc-area" data-cell="area">
                  <span {...bindProps(serviceReportBind.line(l, "areaName"))}>{at(`area:${l.slNo}`, l.areaName, undefined, "Area")}</span>
                </td>
                {group && (
                  <>
                    {/* The chemical and the method come from the Chemical Master and read as it names them, in either language (REQUIREMENTS §58). */}
                    <td
                      rowSpan={group.size}
                      className="svc-merged notranslate"
                      translate="no"
                      data-cell="material"
                      title="Fixed for this service — the SOP / Chemical Master material for these areas"
                    >
                      {at(`material:${l.slNo}`, l.materialName, l.materialName || <span className="text-faint">—</span>, "Material Name")}
                    </td>
                    <td rowSpan={group.size} className="svc-merged" data-cell="qty">
                      {editable && entersQty ? (
                        <input
                          data-field="qty"
                          aria-label={`Quantity used — ${l.materialName}`}
                          {...qtyBind}
                          placeholder="Qty used"
                          value={l.qtyUsed}
                          onChange={(e) => updateLine(l.slNo, { qtyUsed: e.target.value })}
                          title={sharing.length > 1 ? `Entered once — the same on all ${sharing.length} ${l.materialName} lines` : undefined}
                        />
                      ) : (
                        <span {...qtyBind} data-field={entersQty ? "qty" : undefined} title={entersQty ? undefined : `Same as line ${sharing[0]?.slNo} — the quantity is entered once, on the first ${l.materialName} line`}>
                          {l.qtyUsed}
                        </span>
                      )}
                    </td>
                    <td rowSpan={group.size} className="svc-merged notranslate" translate="no" data-cell="method" title="Fixed for this service — the SOP method for these areas">
                      {at(`method:${l.slNo}`, l.methodOfApplication, l.methodOfApplication || <span className="text-faint">—</span>, "Method of Application")}
                    </td>
                  </>
                )}
                {i === 0 && (
                  <td rowSpan={lines.length} className="svc-merged svc-remarks" data-cell="remarks">
                    {editable ? (
                      <textarea
                        aria-label="Remarks"
                        rows={3}
                        {...bindProps(serviceReportBind.line(l, "remarks"))}
                        value={l.remarks}
                        onChange={(e) => updateLine(l.slNo, { remarks: e.target.value })}
                      />
                    ) : (
                      <span className="svc-words" {...bindProps(serviceReportBind.line(l, "remarks"))}>
                        {l.remarks}
                      </span>
                    )}
                    {others.length > 0 && (
                      <div className="svc-more" data-field="other-remarks">
                        {others.map((x) => (
                          <div key={x.slNo}>
                            {x.slNo}. {x.remarks}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {/* The paper's foot: room above the rule for the two names, then the two captions. */}
          <tr className="svc-sign-space">
            <td className="svc-edge" />
            <td className="svc-sign">
              <input
                className="svc-sign-input"
                aria-label="GPC Technician Sign"
                {...bindProps(serviceReportBind.technicianSign())}
                disabled={!editable}
                value={data.technicianSign}
                onChange={(e) => onChange({ ...data, technicianSign: e.target.value })}
                placeholder="Technician name"
              />
            </td>
            <td colSpan={3} className="svc-sign">
              <input
                className="svc-sign-input"
                data-field="customer-sign"
                aria-label="Customer's representative sign"
                {...bindProps(serviceReportBind.customerSign())}
                disabled={!customerOpen}
                value={data.customerSign}
                onChange={(e) => onChange({ ...data, customerSign: e.target.value })}
                placeholder="Customer representative name (required to verify)"
              />
            </td>
            <td className="svc-edge svc-edge-right" />
          </tr>
          <tr className="svc-sign-captions">
            <td className="svc-edge svc-foot" />
            <td className="svc-caption">{at("technicianCaption", SERVICE_PAPER_LABELS.technician)}</td>
            <td colSpan={3} className="svc-caption">
              {at("customerCaption", SERVICE_PAPER_LABELS.customer)}
            </td>
            <td className="svc-edge svc-edge-right svc-foot" />
          </tr>
        </tbody>
      </table>
      {editable && (
        <div className="text-xs text-muted mt-2 no-print" data-section="service-note">
          Every printed word can be typed over (a click puts the caret in it): the change is the format's, asked first - a new revision or not - and
          this report and every one after it print it. The quantity is entered once, on the first line of each material, and is the same on every line
          with that material.
        </div>
      )}
      {problem && (
        <div className="text-xs mt-1 no-print" role="alert" data-section="service-format-problem" style={{ color: "var(--danger, #b42318)" }}>
          {problem}
        </div>
      )}
      {countersignEditable && !data.customerSign.trim() && (
        <div className="text-xs text-muted mt-1 no-print">The customer's representative countersigns here — it's needed before this report can be verified.</div>
      )}
    </div>
  );
}
