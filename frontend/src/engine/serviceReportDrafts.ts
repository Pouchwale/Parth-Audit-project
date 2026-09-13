import type { RecordInstance, ServiceReportData } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { historyOf, withEditHistory } from "./recordHistory";
import { isEditableStatus } from "./recordLifecycle";
import { normalizeServiceLines } from "./serviceMaterials";

// SERVICE-REPORT DRAFTS FOLLOW THE QUANTITY RULE. Drafts written before the
// rule (engine/serviceMaterials.ts, normalizeServiceLines) carry a different
// quantity on every area, and possibly a material or method someone typed
// over. Runs at every boot (idempotent) and touches drafts only — Scheduled,
// Due, In Progress. A submitted, verified or rejected report is signed
// paperwork and changes only through a correction. The change goes into the
// record's history, by "System"; updatedAt is left alone (upsertMany), so a
// prepared draft nobody has opened still reads as untouched to the clean-ups.

export const SERVICE_RULE_NOTE =
  "Brought into line with the service's fixed rules: material and method are the fixed values for each area, and the quantity is entered once per material — the same on every line with that material.";

export function alignServiceReportDrafts(): number {
  const variants = new Map(
    documentRepository
      // Unscoped: a boot-time clean-up works on the whole catalogue.
      .getAllUnscoped()
      .filter((d) => d.kind === "service-report")
      .map((d) => [d.id, d.variantKey] as const)
  );
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.getAll()) {
    if (!variants.has(r.documentId) || !isEditableStatus(r.status)) continue;
    const data = r.data as ServiceReportData;
    if (!Array.isArray(data?.lines) || data.lines.length === 0) continue;
    const lines = normalizeServiceLines(variants.get(r.documentId), data.lines, { fillBlankLead: true });
    if (lines.every((l, i) => l === data.lines[i])) continue;
    // Keep the timeline the panel showed before (e.g. "prepared by the
    // assistant", derived from the stamps) ahead of this entry.
    const base = r.history?.length ? r : { ...r, history: historyOf(r) };
    updates.push(withEditHistory(base, { ...data, lines }, "System", { note: SERVICE_RULE_NOTE }));
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
