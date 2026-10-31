import type { AreaLocation, DocumentDefinition, MasterData, RecordInstance, ServiceReportAreaLine, ServiceReportData } from "../types";
import { masterRepository } from "../data/repositories/masterRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { generateId } from "../utils/id";
import { commitFormatChange, draftOf } from "./formatOps";
import { historyOf, withEditHistory } from "./recordHistory";
import { isEditableStatus } from "./recordLifecycle";
import { mayWriteRecordsOf } from "./departmentScope";
import { fixedMaterialForServiceArea, normalizeServiceLines } from "./serviceMaterials";

// A LINE ADDED TO OR REMOVED FROM THE SERVICE REPORT (the owner, 31-Oct-2026, REQUIREMENTS §154 item 6: "can able to add
// 17, 18, 19 and more or can remove also ... applied for other two pest control also"). The report's lines are the
// service's area list in Master Data (Areas, context service-report:<service>), which every new report is made from
// (engine/recordDefaults.ts). A line added or removed on the report is that list changed: asked first - a new revision or
// none (§148) - written in the format's change history and the activity log (engine/formatOps.ts), and every report not
// yet handed in is brought into line, each keeping the quantities and remarks it holds, by area. A line added below
// another carries that line's material and method (its area says them), so the paper's merged cells stay whole.

export type ServiceLineChange = { kind: "add"; afterArea: string; name: string; material: string; method: string } | { kind: "remove"; area: string };

export const SERVICE_LINES_NOTE = "The format's lines changed: brought into line with the service's area list; the quantities and remarks written here are kept.";

export const serviceContextOf = (variantKey: string | undefined): string => `service-report:${variantKey ?? ""}`;

/** The service's areas, in the paper's order. */
export function serviceAreasOf(master: MasterData, variantKey: string | undefined): AreaLocation[] {
  const context = serviceContextOf(variantKey);
  return master.areas.filter((a) => a.context === context);
}

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Why the change would be refused, or null when it can be made. */
export function serviceLineRefusal(areas: readonly AreaLocation[], change: ServiceLineChange): string | null {
  if (change.kind === "add") {
    if (!change.name.trim()) return "Give the new line its area.";
    if (areas.some((a) => sameName(a.name, change.name))) return `“${change.name.trim()}” is on the report already.`;
    if (!areas.some((a) => a.name === change.afterArea)) return "The line to add below is not on the report.";
    return null;
  }
  if (!areas.some((a) => a.name === change.area)) return "That line is not on the report.";
  if (areas.length <= 1) return "The report keeps at least one line.";
  return null;
}

/** The service's areas after the change. */
export function serviceAreasAfter(areas: readonly AreaLocation[], change: ServiceLineChange, context: string): AreaLocation[] {
  if (change.kind === "remove") return areas.filter((a) => a.name !== change.area);
  const at = areas.findIndex((a) => a.name === change.afterArea);
  const added: AreaLocation = { id: generateId("area"), name: change.name.trim(), context, material: change.material, method: change.method };
  return [...areas.slice(0, at + 1), added, ...areas.slice(at + 1)];
}

/**
 * A report's lines rebuilt on the area list: each area's line keeps the quantity and remarks it holds; a line new to the
 * report takes its block's quantity (normalizeServiceLines); the visit's remark moves to the first line when the line
 * holding it goes.
 */
export function alignedServiceLines(variantKey: string | undefined, areas: readonly AreaLocation[], lines: readonly ServiceReportAreaLine[]): ServiceReportAreaLine[] {
  const held = new Map(lines.map((l) => [l.areaName, l]));
  const built: ServiceReportAreaLine[] = areas.map((a, i) => {
    const was = held.get(a.name);
    const fixed = fixedMaterialForServiceArea(variantKey, a.name, a);
    return { slNo: i + 1, areaName: a.name, materialName: fixed.materialName, qtyUsed: was?.qtyUsed ?? "", methodOfApplication: fixed.methodOfApplication, remarks: was?.remarks ?? "" };
  });
  const lead = lines[0];
  if (lead && lead.remarks.trim() && !areas.some((a) => a.name === lead.areaName) && built[0] && !built[0].remarks.trim()) built[0] = { ...built[0], remarks: lead.remarks };
  return normalizeServiceLines(variantKey, built, { fillBlankLead: true });
}

export type ServiceLineResult = { ok: true; areas: AreaLocation[] } | { ok: false; error: string };

/**
 * Saves the change: the format's revision first (refused, nothing else moves), then Master Data's area list, then every
 * report of the format not yet handed in - `except` the one open on the page, which the page writes itself.
 */
export function commitServiceLineChange(
  doc: DocumentDefinition,
  change: ServiceLineChange,
  opts: { actor: string; except?: string; keepRevision?: boolean; revisionNo?: string; revisionDate?: string }
): ServiceLineResult {
  const master = masterRepository.get();
  const context = serviceContextOf(doc.variantKey);
  const areas = serviceAreasOf(master, doc.variantKey);
  const refusal = serviceLineRefusal(areas, change);
  if (refusal) return { ok: false, error: refusal };
  const next = serviceAreasAfter(areas, change, context);
  const latest = documentRepository.getById(doc.id) ?? doc;
  const reason = change.kind === "add" ? `Line added on the report: ${change.name.trim()}` : `Line removed on the report: ${change.area}`;
  const { actor, except, ...choice } = opts;
  const saved = commitFormatChange(latest, { ...draftOf(latest), serviceLines: { areas: next.map((a) => a.name), was: areas.map((a) => a.name) } }, { actor, reason, ...choice });
  if (!saved.ok) return { ok: false, error: saved.error };
  // The list in Master Data, the service's entries replaced where they stand.
  const all: AreaLocation[] = [];
  let placed = false;
  for (const a of master.areas) {
    if (a.context !== context) {
      all.push(a);
      continue;
    }
    if (!placed) {
      all.push(...next);
      placed = true;
    }
  }
  if (!placed) all.push(...next);
  masterRepository.update({ areas: all });
  // Every report of the format not yet handed in.
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.getAll()) {
    if (r.documentId !== doc.id || r.id === except || !isEditableStatus(r.status) || !mayWriteRecordsOf(r.documentId)) continue;
    const data = r.data as ServiceReportData;
    if (!Array.isArray(data?.lines)) continue;
    const lines = alignedServiceLines(doc.variantKey, next, data.lines);
    if (JSON.stringify(lines) === JSON.stringify(data.lines)) continue;
    const base = r.history?.length ? r : { ...r, history: historyOf(r) };
    updates.push(withEditHistory(base, { ...data, lines }, actor, { note: SERVICE_LINES_NOTE }));
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return { ok: true, areas: next };
}
