import type { MasterData, RodentCatch } from "../types";
import { generateId } from "../utils/id";

// THE DAILY REGISTER'S RODENT CATCH IS WRITTEN BY THE PERSON (REQUIREMENTS §98 and §118; the owner's ask of 17-Oct-2026
// for a record the system fills daily "so it seems real" is NOT built: a Live record never carries a count, a location, an
// answer, a time or a signature a person did not enter).
//
// A row for a rodent in a trap box starts EMPTY - no location, no count - and the person chooses where and writes how
// many; Submit refuses a row without either (engine/validation.ts). The places to choose from are the factory's real
// areas: the contractor's sixteen areas of the Rodent Control Service report (Master Data, context below), the one list
// the daily register and that report share; the plant may add its own, and any other place may be written in.

/** The master-data context of the factory's rodent areas: the Rodent Control Service report's own area list. */
export const RODENT_AREA_CONTEXT = "service-report:Rodent Control Service";

/** The factory's real areas a rodent catch is placed in, in the contractor's order. */
export function rodentAreaNames(master: Pick<MasterData, "areas">): string[] {
  return master.areas.filter((a) => a.context === RODENT_AREA_CONTEXT).map((a) => a.name);
}

/** A new catch row: nothing written - the box, the place and the number are the person's. A count of 0 is "not written yet". */
export function newRodentCatch(): RodentCatch {
  return { id: generateId("rc"), trapBoxNo: "", location: "", count: 0 };
}

/** Whether a row holds what Submit asks of a catch: a place and at least one rodent. */
export function rodentCatchComplete(c: Pick<RodentCatch, "location" | "count"> | null | undefined): boolean {
  return !!String(c?.location ?? "").trim() && Number(c?.count) >= 1;
}
