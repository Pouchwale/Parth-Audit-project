import { masterRepository } from "./repositories/masterRepository";
import { documentRepository } from "./repositories/documentRepository";
import { frequencyDocsFor } from "../engine/frequencyPanel";
import { isBossSignedIn } from "../engine/departmentScope";
import { logActivity } from "../utils/activityLog";

/**
 * THE THREE SERVICE REPORTS ON THEIR SATURDAYS (REQUIREMENTS §221; the owner, 15-Nov-2026: "twice a month and on saturday
 * ... for all three service record"). A frequency set on the Frequency page for one of them on or before that day - the
 * Super Admin's 1st and 3rd Sunday for General and Fly, set that morning - is taken off, so all three follow the issued
 * 1st and 3rd Saturday, with a line in the activity log. One set after that day is the plant's newer word and stays.
 * Run at every start by whoever may set those frequencies; nothing to do, nothing written. Returns how many were taken off.
 */
export const SERVICE_REPORT_IDS = ["service-report-rodent", "service-report-general", "service-report-fly"] as const;
const SATURDAYS_FROM = "2026-11-15";

export function serviceReportsOnSaturdays(): number {
  const master = masterRepository.get();
  const overrides = master.scheduleOverrides ?? {};
  const mine = new Set(frequencyDocsFor(documentRepository.getRecordableUnscoped(), isBossSignedIn()).map((d) => d.id));
  const off = SERVICE_REPORT_IDS.filter((id) => overrides[id] && overrides[id].since <= SATURDAYS_FROM && mine.has(id));
  if (off.length === 0) return 0;
  const next = { ...overrides };
  for (const id of off) delete next[id];
  masterRepository.update({ scheduleOverrides: next });
  for (const id of off) {
    const doc = documentRepository.getByIdUnscoped(id);
    logActivity("Frequency changed", doc ? doc.name : id, "back to the issued frequency: the 1st and 3rd Saturday (REQUIREMENTS §221)", id);
  }
  return off.length;
}
