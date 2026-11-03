import type { DailyPestMonitoringData } from "../types";

// F/HR/17 ANSWERED ON OPENING (the owner, 30-Oct-2026, REQUIREMENTS §149: "the system should filled it on daily basis
// and user will verify and submit it"). When a person who may fill the day's record opens it and nothing is answered
// on it yet, every check point takes the plant's usual answer - doors proofed, no gaps, fly catchers working, 100 traps,
// numbered and in place, NOTHING TRAPPED, NO DEAD RODENT, NO CAKE BITING, tube lights valid. The time of checking is a
// time of the morning round, between 09:00 and 09:30, and the checker is Kapila Barad (the owner, 3-Nov-2026, §177:
// "it should take time every day between 9:00 am to 9:30 am ... time will come random and name is fix which is Kapila
// barad but editable"; until then the time it was opened and the opener's name). Every answer stays the person's to
// change before they submit: a rodent or a lizard really found is answered Yes with its box, place and count
// (rodentCatches - suggested from Master Data the moment 7 is answered Yes, §177), and only that reaches the rodent
// trend. Nothing is ever written as FOUND that nobody found (declined 28 and 30-Oct-2026): the fill answers 7 No. A
// holiday's record, and a day already answered, are left as they are.

export const DAILY_PEST_FILL_NOTE = "Answered as the plant's usual day on opening: nothing found, the round at a time between 09:00 and 09:30 in Kapila Barad's name; every answer the person's to change before submitting (REQUIREMENTS §149, §177)";

/** The checker the fill writes (the owner, 3-Nov-2026): a fixed name, the box still the person's to change. */
export const DAILY_PEST_CHECKER = "Kapila Barad";

/** A time of the morning round, 09:00 to 09:30 inclusive, drawn at random ("HH:MM" for the time box); `rand` is injectable for tests. */
export function dailyPestRoundTime(rand: () => number = Math.random): string {
  const minute = Math.min(30, Math.max(0, Math.floor(rand() * 31)));
  return `09:${String(minute).padStart(2, "0")}`;
}

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
