import type { DailyPestMonitoringData, MasterData, RodentCatch, SummaryAction } from "../types";
import { generateId } from "../utils/id";

// THE DAILY REGISTER'S RODENT CATCH: ANSWERED BY THE PERSON, ITS DETAILS SUGGESTED FROM MASTER DATA (REQUIREMENTS §98,
// §118 and §177). The system never answers that a rodent was found (the owner's ask of 17-Oct-2026 for a record the
// system fills daily "so it seems real" was not built, and 28 and 30-Oct-2026 said the same): check point 7 stays No
// until a person answers Yes. The moment they do (the owner, 3-Nov-2026: "when system or user click on question 7 and
// select answer yes ... the box number, location and number of rodents should come automatically ... from master data
// ... rodent station and Areas"), the catch row is filled in from Master Data - a rodent station's number and place
// where the plant keeps stations, otherwise a numbered trap box RB-NN and one of the rodent areas - with a count, and
// the Summary of Actions gets its line ("Rodent caught in trap box RB-27 at Canteen" / "Rodent removed and disposed").
// Every one of those boxes is the person's to change; a row the person has not changed goes again when 7 goes back to
// No. A row added with "Add box" still starts EMPTY, and Submit refuses a row without a place and a count
// (engine/validation.ts). The places to choose from are the factory's real areas: the contractor's sixteen areas of the
// Rodent Control Service report (Master Data, context below), the one list the daily register and that report share;
// the plant may add its own, and any other place may be written in.

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

/** What the suggested Summary line says was done (engine/insightRules.ts counts a rodent removed as the register working, not a finding to correct). */
export const SUGGESTED_CATCH_ACTION = "Rodent removed and disposed";
/** Check point 8's line, a dead rodent seen (REQUIREMENTS §180). */
export const SUGGESTED_DEAD_RODENT_ACTION = "Dead rodent removed and disposed; the place cleaned";
/** Check point 9's line, rodent cake bitten in a box (REQUIREMENTS §180). */
export const SUGGESTED_CAKE_BITING_ACTION = "Rodent bait cake replaced and the box re-set";

/** The suggested lines by the check point they answer for: how each description begins, and its action. */
export const SUGGESTED_LINES: Record<7 | 8 | 9, { begins: RegExp; action: string }> = {
  7: { begins: /^(?:Rodent|\d+ rodents) caught in /, action: SUGGESTED_CATCH_ACTION },
  8: { begins: /^Dead rodent observed at /, action: SUGGESTED_DEAD_RODENT_ACTION },
  9: { begins: /^Rodent cake biting observed in rodent box /, action: SUGGESTED_CAKE_BITING_ACTION },
};
const SUGGESTED_CHECKPOINTS = [7, 8, 9] as const;
type SuggestedCheckpoint = (typeof SUGGESTED_CHECKPOINTS)[number];
const isSuggestedCheckpoint = (no: number): no is SuggestedCheckpoint => no === 7 || no === 8 || no === 9;

/** The most trap boxes a day's suggestion numbers when the plant keeps no stations in Master Data: check point 4's usual 100. */
export const DEFAULT_TRAP_BOXES = 100;

const pad2 = (n: number): string => String(n).padStart(2, "0");
const isPlaceholder = (v: unknown): boolean => typeof v === "string" && /^\s*to be confirmed\s*$/i.test(v);

/** Whether a Summary line still reads as the system wrote it for check point `no` (or any of 7, 8, 9): its opening words and its action (REQUIREMENTS §177, §180). */
export function inSuggestedWords(a: Pick<SummaryAction, "descriptionOfObservation" | "actionTaken">, no?: SuggestedCheckpoint): boolean {
  const description = String(a.descriptionOfObservation ?? "");
  const action = String(a.actionTaken ?? "").trim();
  return (no ? [no] : SUGGESTED_CHECKPOINTS).some((n) => SUGGESTED_LINES[n].begins.test(description) && action === SUGGESTED_LINES[n].action);
}

/** The Summary line for check point 8 (a dead rodent at `note`) or 9 (cake bitten in box `note`), dated the record's day (REQUIREMENTS §180). */
export function suggestedCheckpointAction(no: 8 | 9, note: string, dateISO: string): SummaryAction {
  const where = String(note ?? "").trim();
  const description = no === 8 ? `Dead rodent observed at ${where || "a place not named"}` : `Rodent cake biting observed in rodent box ${where || "not numbered"}`;
  return { id: generateId("act"), dateOfObservation: dateISO, descriptionOfObservation: description, actionTaken: SUGGESTED_LINES[no].action, remarks: "", suggested: true };
}

/**
 * THE DAY'S DATA AFTER A PERSON CHANGES A CATCH ROW (REQUIREMENTS §177): the row is theirs now (no longer the suggestion),
 * and a Summary line still the system's - marked suggested and in the suggested words - follows the row it describes,
 * so a box or a place corrected on the row is corrected on the line too; a line a person edited is left alone.
 */
export function withCatchEdited(data: DailyPestMonitoringData, id: string, patch: Partial<RodentCatch>): DailyPestMonitoringData {
  const catches = (data.rodentCatches ?? []).map((c) => (c.id === id ? { ...withoutSuggested(c), ...patch } : c));
  const first = catches[0];
  const summaryActions = (data.summaryActions ?? []).map((a) => {
    if (!a.suggested || !inSuggestedWords(a) || !first) return a;
    const fresh = suggestedCatchAction(first, a.dateOfObservation);
    return { ...a, descriptionOfObservation: fresh.descriptionOfObservation };
  });
  return { ...data, rodentCatches: catches, summaryActions };
}

/** The day's data with every "suggested" mark taken off: the person's Submit confirms the rows as the day's (REQUIREMENTS §177). */
export function withSuggestionsConfirmed(data: DailyPestMonitoringData): DailyPestMonitoringData {
  const catches = data.rodentCatches;
  const marked = (catches ?? []).some((c) => c.suggested) || (data.summaryActions ?? []).some((a) => a.suggested);
  if (!marked) return data;
  return { ...data, ...(catches ? { rodentCatches: catches.map(withoutSuggested) } : {}), summaryActions: (data.summaryActions ?? []).map(withoutSuggested) };
}

/** The row without its "suggested" mark: what a person has edited is theirs. */
export function withoutSuggested<T extends { suggested?: boolean }>(row: T): T {
  const copy = { ...row };
  delete copy.suggested;
  return copy;
}

/** The area name a station's place matches, letter for letter (any case, spaces trimmed), or null. */
function areaNamed(areas: readonly string[], place: string): string | null {
  const key = place.trim().toLowerCase();
  return areas.find((a) => a.trim().toLowerCase() === key) ?? null;
}

/**
 * A CATCH SUGGESTED FROM MASTER DATA (REQUIREMENTS §177), for the moment check point 7 is answered Yes:
 *   - where the plant keeps rodent stations (Master Data > Rodent Stations), one Active station chosen at random - its
 *     Station ID as the trap box number, its place as the location (the area of that name when there is one, so the
 *     choice box shows it; else the station's own words);
 *   - otherwise a trap box RB-NN numbered at random up to `traps` (check point 4's count; 100 when not known) and one of
 *     the rodent areas at random;
 *   - and a count of 1 to 3 rodents.
 * `rand` is drawn in this order: the count, then the station or the area, then (stations absent) the box number - so a
 * test can hand in its own. A station's status counts as Active however it was typed ("active", " Active "). The row
 * is marked suggested until a person changes it (withoutSuggested).
 */
export function suggestedRodentCatch(master: Pick<MasterData, "areas" | "rodentStations">, opts: { rand?: () => number; traps?: number } = {}): RodentCatch {
  const rand = opts.rand ?? Math.random;
  const count = 1 + Math.min(2, Math.max(0, Math.floor(rand() * 3)));
  const box = suggestedBox(master, { rand, traps: opts.traps });
  return { id: generateId("rc"), trapBoxNo: box.trapBoxNo, location: box.location, count, suggested: true };
}

/**
 * A trap box and its place from Master Data (REQUIREMENTS §177, §180): an Active rodent station chosen at random (its ID,
 * its place as the area of that name when one fits), else a box RB-NN numbered at random up to `traps` (100 when not
 * known) in one of the rodent areas chosen at random. `rand` is drawn for the station or the area, then the box number.
 */
export function suggestedBox(master: Pick<MasterData, "areas" | "rodentStations">, opts: { rand?: () => number; traps?: number } = {}): { trapBoxNo: string; location: string } {
  const rand = opts.rand ?? Math.random;
  const pick = <T,>(arr: readonly T[]): T => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(rand() * arr.length)))];
  const areas = rodentAreaNames(master);
  const stations = (master.rodentStations ?? []).filter((s) => /^active$/i.test(String(s.status ?? "").trim()) && String(s.id ?? "").trim() && String(s.location ?? "").trim() && !isPlaceholder(s.id) && !isPlaceholder(s.location));
  if (stations.length > 0) {
    const s = pick(stations);
    return { trapBoxNo: s.id.trim(), location: areaNamed(areas, s.location) ?? s.location.trim() };
  }
  const location = areas.length ? pick(areas) : "";
  const boxes = Number.isFinite(opts.traps) && (opts.traps as number) >= 1 ? Math.floor(opts.traps as number) : DEFAULT_TRAP_BOXES;
  const n = 1 + Math.min(boxes - 1, Math.max(0, Math.floor(rand() * boxes)));
  return { trapBoxNo: `RB-${pad2(n)}`, location };
}

/** One of the rodent areas at random: the place a dead rodent was seen (check point 8, REQUIREMENTS §180). "" when the list is empty. */
export function suggestedPlace(master: Pick<MasterData, "areas">, rand: () => number = Math.random): string {
  const areas = rodentAreaNames(master);
  return areas.length ? areas[Math.min(areas.length - 1, Math.max(0, Math.floor(rand() * areas.length)))] : "";
}

/** The Summary of Actions line for a catch (REQUIREMENTS §177): what was found, where, and that it was removed and disposed of; dated the record's day. */
export function suggestedCatchAction(c: Pick<RodentCatch, "trapBoxNo" | "location" | "count">, dateISO: string): SummaryAction {
  const n = Math.max(1, Math.floor(Number(c.count) || 1));
  const box = String(c.trapBoxNo ?? "").trim();
  const place = String(c.location ?? "").trim();
  const where = [box ? `trap box ${box}` : "a trap box", place ? `at ${place}` : ""].filter(Boolean).join(" ");
  return { id: generateId("act"), dateOfObservation: dateISO, descriptionOfObservation: `${n === 1 ? "Rodent" : `${n} rodents`} caught in ${where}`, actionTaken: SUGGESTED_CATCH_ACTION, remarks: "", suggested: true };
}

/**
 * THE DAY'S DATA AFTER A CHECK POINT IS ANSWERED (the record page's one handler, REQUIREMENTS §177): check point 7 answered
 * Yes with no catch row yet gets the suggested row and the Summary line; answered anything else, every catch row goes
 * (the catch table is hidden while 7 is not Yes, so a row left there could neither be seen nor taken away, yet the
 * reports and the v1 API would still count it) and so do the Summary lines still marked suggested; Summary lines a
 * person wrote or changed stay, in the table they can see. Every other check point is simply answered.
 */
export function withCheckpointAnswer(
  data: DailyPestMonitoringData,
  no: number,
  patch: Partial<{ value: string | number | null; note: string }>,
  ctx: { master: Pick<MasterData, "areas" | "rodentStations">; dueDate: string; rand?: () => number }
): DailyPestMonitoringData {
  const next: DailyPestMonitoringData = {
    ...data,
    checkpoints: { ...data.checkpoints, [no]: { ...(data.checkpoints[no] ?? { value: null }), ...patch } },
  };
  if (!isSuggestedCheckpoint(no)) return next;
  const traps = Number(data.checkpoints[4]?.value);
  const trapsOpt = Number.isFinite(traps) && traps >= 1 ? traps : undefined;
  const lines = next.summaryActions ?? [];
  // The system's own line for this check point, still in its words (a line a person reworded by any path is theirs).
  const ownLine = (a: SummaryAction) => !!a.suggested && inSuggestedWords(a, no);
  if (!("value" in patch)) {
    // A note changed on 8 or 9: the line still the system's follows it (as the catch row's line follows the row, withCatchEdited).
    if (no !== 7 && "note" in patch) {
      const note = String(patch.note ?? "");
      next.summaryActions = lines.map((a) => (ownLine(a) ? { ...a, descriptionOfObservation: suggestedCheckpointAction(no, note, a.dateOfObservation).descriptionOfObservation } : a));
    }
    return next;
  }
  if (patch.value === "Yes") {
    if (no === 7) {
      if ((next.rodentCatches ?? []).length > 0) return next;
      const suggested = suggestedRodentCatch(ctx.master, { rand: ctx.rand, traps: trapsOpt });
      next.rodentCatches = [suggested];
      next.summaryActions = [...lines, suggestedCatchAction(suggested, ctx.dueDate)];
      return next;
    }
    // 8: the place a dead rodent was seen; 9: the box whose cake was bitten - the note box filled when it is blank, the line written once.
    const current = String(next.checkpoints[no]?.note ?? "").trim();
    const note = current || (no === 8 ? suggestedPlace(ctx.master, ctx.rand) : suggestedBox(ctx.master, { rand: ctx.rand, traps: trapsOpt }).trapBoxNo);
    next.checkpoints = { ...next.checkpoints, [no]: { ...next.checkpoints[no], value: "Yes", note } };
    if (!lines.some(ownLine)) next.summaryActions = [...lines, suggestedCheckpointAction(no, note, ctx.dueDate)];
    return next;
  }
  // Back to No (or blank): what the system suggested for this check point goes; what a person wrote or reworded stays.
  if (no === 7) {
    if (next.rodentCatches && next.rodentCatches.length > 0) next.rodentCatches = [];
  } else {
    next.checkpoints = { ...next.checkpoints, [no]: { ...next.checkpoints[no], note: "" } };
  }
  next.summaryActions = lines.filter((a) => !ownLine(a));
  return next;
}
