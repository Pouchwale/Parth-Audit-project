import type { DailyPestMonitoringData } from "../types";

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
