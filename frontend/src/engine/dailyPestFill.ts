import type { DailyPestMonitoringData, RodentCatch, RodentStation } from "../types";

// F/HR/17 ANSWERED ON OPENING (the owner, 30-Oct-2026, REQUIREMENTS §149: "the system should filled it on daily basis
// and user will verify and submit it"). When a person who may fill the day's record opens it and nothing is answered
// on it yet, every check point takes the plant's usual answer - doors proofed, no gaps, fly catchers working, 100 traps,
// numbered and in place, NOTHING TRAPPED, NO DEAD RODENT, NO CAKE BITING, tube lights valid - the time of checking is
// the time it was opened and the checker is that person. Every answer stays theirs to change before they submit: a
// rodent or a lizard really found is answered Yes with its box, place and count (rodentCatches), and only that reaches
// the rodent trend. Nothing is ever written as found that nobody found (declined 28 and 30-Oct-2026). A holiday's
// record, and a day already answered, are left as they are.

export const DAILY_PEST_FILL_NOTE = "Answered as the plant's usual day on opening, in the opener's name: nothing found; every answer the person's to change before submitting (REQUIREMENTS §149)";

/** The plant's usual answer to each check point; 7, 8 and 9 are "nothing found". */
export const DAILY_PEST_USUAL: Record<number, string | number> = { 1: "Yes", 2: "No", 3: "Yes", 4: 100, 5: "Yes", 6: "Yes", 7: "No", 8: "No", 9: "No", 10: "Yes" };

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

/** The day answered as usual in `signer`'s name at `time` (HH:MM), or null when it is a holiday or already answered. */
export function dailyPestFillOnOpen(data: DailyPestMonitoringData | undefined, signer: string, time: string): DailyPestMonitoringData | null {
  if (!data || data.isHoliday || !data.checkpoints) return null;
  if (!Object.values(data.checkpoints).every((a) => blank(a?.value))) return null;
  const checkpoints: DailyPestMonitoringData["checkpoints"] = { ...data.checkpoints };
  for (const [no, value] of Object.entries(DAILY_PEST_USUAL)) checkpoints[Number(no)] = { ...(checkpoints[Number(no)] ?? {}), value };
  return {
    ...data,
    checkpoints,
    timeOfChecking: blank(data.timeOfChecking) ? time : data.timeOfChecking,
    checker: blank(data.checker) && signer.trim() ? signer.trim() : data.checker,
  };
}

// A CATCH A PERSON ENTERS, FOLLOWED UP (the owner, 31-Oct-2026, REQUIREMENTS §151): its trap box written as a rodent
// station of Master Data takes that station's place; and every catch with a count gets its line in the summary of
// actions - "Caught and disposed" as the action taken - the line's words following the catch until the person writes
// their own. Nothing here makes a catch: only one a person entered is followed up.

/** The summary line that follows a catch, by the catch's id. */
export const catchActionId = (catchId: string) => `act-${catchId}`;
const catchWords = (c: RodentCatch) => `${c.count} caught in trap box ${c.trapBoxNo || "—"}${c.location ? ` (${c.location})` : ""}`;

export function withCatchFollowUps(
  next: DailyPestMonitoringData,
  before: DailyPestMonitoringData,
  stations: readonly RodentStation[],
  dateISO: string
): DailyPestMonitoringData {
  const was = new Map((before.rodentCatches ?? []).map((c) => [c.id, c] as const));
  const catches = (next.rodentCatches ?? []).map((c) => {
    const old = was.get(c.id);
    const station = stations.find((s) => s.id.trim().toLowerCase() === c.trapBoxNo.trim().toLowerCase());
    return station && station.location && (!old || old.trapBoxNo !== c.trapBoxNo) ? { ...c, location: station.location } : c;
  });
  let actions = [...next.summaryActions];
  for (const c of catches) {
    if (!(c.count > 0)) continue;
    const id = catchActionId(c.id);
    const line = actions.find((a) => a.id === id);
    const old = was.get(c.id);
    if (!line) actions.push({ id, dateOfObservation: dateISO, descriptionOfObservation: catchWords(c), actionTaken: "Caught and disposed", remarks: "" });
    else if (old && line.descriptionOfObservation === catchWords(old)) actions = actions.map((a) => (a.id === id ? { ...a, descriptionOfObservation: catchWords(c) } : a));
  }
  return { ...next, rodentCatches: catches, summaryActions: actions };
}

// CHECK POINTS 8 AND 9 ANSWERED YES, FOLLOWED UP (the owner, 31-Oct-2026, REQUIREMENTS §152): a person answering Yes gets
// the note filled from the day's catch where one was entered - 8 its location, 9 its trap box - and a line in the Summary
// of Actions: 8 "Caught and disposed", 9 "Bait cake replaced, box checked". The note and the line's words follow until
// the person writes their own; answered No again, the line the system made is taken off. Nothing is answered Yes for them.

const CHECKPOINT_FOLLOW_UP: Record<8 | 9, { from: (c: RodentCatch) => string; words: (note: string) => string; action: string }> = {
  8: { from: (c) => c.location, words: (n) => `Dead rodent observed${n ? ` at ${n}` : ""}`, action: "Caught and disposed" },
  9: { from: (c) => c.trapBoxNo, words: (n) => `Rodent cake biting${n ? ` in box ${n}` : ""}`, action: "Bait cake replaced, box checked" },
};
export const checkpointActionId = (no: number) => `act-cp${no}`;

export function withCheckpointFollowUps(next: DailyPestMonitoringData, before: DailyPestMonitoringData, dateISO: string): DailyPestMonitoringData {
  const checkpoints = { ...next.checkpoints };
  let actions = [...next.summaryActions];
  const firstCatch = (next.rodentCatches ?? []).find((c) => c.trapBoxNo.trim() || c.location.trim());
  for (const no of [8, 9] as const) {
    const rule = CHECKPOINT_FOLLOW_UP[no];
    const answer = checkpoints[no];
    const old = before.checkpoints?.[no];
    const id = checkpointActionId(no);
    const line = actions.find((a) => a.id === id);
    if (answer?.value !== "Yes") {
      // No again: the line the system made, still in its words, goes; one the person wrote over stays.
      if (line && old && line.descriptionOfObservation === rule.words(String(old.note ?? ""))) actions = actions.filter((a) => a.id !== id);
      continue;
    }
    let note = String(answer.note ?? "");
    if (!note.trim() && firstCatch && rule.from(firstCatch).trim()) {
      note = rule.from(firstCatch).trim();
      checkpoints[no] = { ...answer, note };
    }
    if (!line) actions.push({ id, dateOfObservation: dateISO, descriptionOfObservation: rule.words(note), actionTaken: rule.action, remarks: "" });
    else if (line.descriptionOfObservation === rule.words(String(old?.note ?? ""))) actions = actions.map((a) => (a.id === id ? { ...a, descriptionOfObservation: rule.words(note) } : a));
  }
  return { ...next, checkpoints, summaryActions: actions };
}
