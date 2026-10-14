import { RULER_POINTS } from "../data/seed/qcRulerVerificationLayouts";
import { makeRng } from "../utils/random";
import { addDays } from "../utils/date";

// DEMO MODE AND SAMPLE DATA ONLY (REQUIREMENTS §98, §111 part 8): F/QC/17 as a real verification, never the page of
// 24.09.2024 copied. Called from engine/autoFill.ts alone; a Live record's master calibration, ruler, readings and name
// are the person's.
//
//   the master scale  Kristeen, QC-44, 0 - 600 mm, 1 mm (the layout's standing values), calibrated outside every year
//                     on 23 September as on the supplied page (23.09.2024, due 22.09.2025), its certificate numbered
//                     on the page's series — CAL/LPI/GP-23/23 for 2024, one on each year
//   the ruler         the page's own: Ajanta, GP-3/MS/04, 0-600 mm, 1 mm; verified the day the record is for, due a
//                     year less a day later (24.09.2024 -> 23.09.2025)
//   the readings      at the six printed points, read to the ruler's 1 mm least count: most read the master's figure,
//                     now and then one is a millimetre off — inside the printed + / - 1 mm, so the ruler passes

export interface RulerVerification {
  header: Record<string, string>;
  /** The observed reading at each printed point, in mm. */
  observed: number[];
}

/** The master's last outside calibration on or before the day: 23 September of that year or the one before. */
function masterCalibratedBy(dueDate: string): string {
  const year = Number(dueDate.slice(0, 4));
  const thisYear = `${year}-09-23`;
  return dueDate >= thisYear ? thisYear : `${year - 1}-09-23`;
}

/** The same day a year on (29 February goes to 1 March). */
function yearAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function rulerVerificationSample(dueDate: string): RulerVerification {
  const rng = makeRng(`ruler-verification|${dueDate}`);
  const calibrated = masterCalibratedBy(dueDate);
  const year = Number(calibrated.slice(0, 4));
  const header: Record<string, string> = {
    masterCalibrationDate: calibrated,
    masterCalibrationDueDate: addDays(`${year + 1}-09-23`, -1),
    masterCalibrationReportNo: `CAL/LPI/GP-23/${23 + (year - 2024)}`,
    make: "Ajanta",
    serialNo: "GP-3/MS/04",
    range: "0-600 mm",
    leastCount: "1 mm",
    calibrationDate: dueDate,
    calibrationDueDate: addDays(yearAfter(dueDate), -1),
  };
  // One point in five reads a millimetre off the master, never more than one point on a sheet.
  const off = rng.chance(0.2) ? rng.int(0, RULER_POINTS.length - 1) : -1;
  const observed = RULER_POINTS.map((mm, i) => (i === off ? mm + (rng.chance(0.5) ? 1 : -1) : mm));
  return { header, observed };
}
