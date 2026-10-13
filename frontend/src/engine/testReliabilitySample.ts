import { hrMasterRepository } from "../data/repositories/hrMasterRepository";
import { RELIABILITY_ACCEPTED, RELIABILITY_CHECKS, SAMPLES_PER_CHECK, type ReliabilityCheck } from "../data/seed/qcTestReliabilityLayouts";
import { compareISO } from "../utils/date";
import { makeRng, type Rng } from "../utils/random";

// F-QC-14 FILLED AS A REAL EXERCISE — DEMO MODE AND SAMPLE DATA ONLY (REQUIREMENTS §98, §111, rule 3 of the owner's
// brief of 13-Oct-2026). The internal test reliability record is four inspectors testing the same three samples for
// each check. Its sample used to be the workbook of 12.02.2022 copied onto any day: the reel 9460/5234 and FGLA 11430
// for ever, and inspectors who have since left. A sample exercise here is the plant's own:
//   * the reel's batch and rolls on the plant's series, written as the workbook writes them ("9460/5234/15": the
//     reel's number, its batch, the roll) — 9460/5234 on 12.02.2022, climbing as the GRN series does (some eight a
//     day); on the sleeve sheet the film's own reel, a little older, as the workbook's 9396/5146 is; three rolls;
//   * the finished job's FG code on the plant's label (FGLA) and sleeve (FGSL) series, as the workbook names it;
//   * every reading inside the specification printed over its check, the four inspectors a reading or two apart, as
//     four people measuring one sample are; the sizes, the scuff test, the shade and the corona treatment as written;
//   * Inspector - 1 the QA Manager (the workbook's Kapila), the other three QC's lab executives on HR Master Data who
//     had joined by that day;
//   * every check concluded in the workbook's words, as every reading is inside its specification.
// Never a Live record: the morning prepare writes only the date (engine/knownParts.ts).

/** The two F-QC-14 documents this fills. */
export const RELIABILITY_DOCUMENTS: ReadonlySet<string> = new Set(Object.keys(RELIABILITY_CHECKS));

/** The workbook's reel, 9460/5234, on 12.02.2022, and how fast the two numbers climb (the GRN series, about eight a day). */
const REEL_SERIES = { onDate: "2022-02-12", reel: 9460, batch: 5234, reelPerDay: 8.35, batchPerDay: 8.6 };
/** The workbook's finished jobs, FGLA 11430 and FGSL1241, on 12.02.2022, and how fast the plant's codes climb. */
const FG_SERIES = { onDate: "2022-02-12", label: 11430, labelPerDay: 2, sleeve: 1241, sleevePerDay: 0.3 };

const DAY_MS = 86_400_000;
const daysSince = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS));

/** QA's four on this day: the QA Manager first, then three lab executives who had joined by then. */
function inspectorsOn(dueDate: string, rng: Rng, fallback: string): string[] {
  const people = hrMasterRepository.all();
  const joined = (p: { joiningDate: string }) => !p.joiningDate || compareISO(p.joiningDate, dueDate) <= 0;
  const manager = people.find((p) => /manager\s*-?\s*qa\b/i.test(p.designation) && joined(p))?.fullName ?? fallback;
  const lab = people.filter((p) => /^lab\b/i.test(p.department) && /executive/i.test(p.designation) && joined(p) && p.fullName !== manager).map((p) => p.fullName);
  for (let i = lab.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [lab[i], lab[j]] = [lab[j], lab[i]];
  }
  const four = [manager, ...lab.slice(0, 3)];
  while (four.length < 4) four.push("");
  return four;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Four readings of one sample: the sample's own value, each inspector a step or two from it, inside [lo, hi]. */
function fourOf(rng: Rng, base: number, step: number, lo: number, hi: number): string[] {
  return Array.from({ length: 4 }, () => String(clamp(base + rng.int(-step, step), lo, hi)));
}

/** Mostly the nominal, now and then one off it: a thickness gauge read by four people. */
function gauge(rng: Rng, nominal: number): string[] {
  return Array.from({ length: 4 }, () => String(nominal + (rng.chance(0.2) ? rng.pick([-1, 1]) : 0)));
}

/** The four readings of one line of a check, by the check's name and the sheet it is on. */
function readings(check: ReliabilityCheck, sleeve: boolean, rng: Rng): string[] {
  switch (check.name) {
    case "GSM - Total": // 70 ± 5%
      return fourOf(rng, rng.int(69, 72), 1, 67, 73);
    case "GSM - Adhesive": // 16.0 ± 2
      return fourOf(rng, rng.int(14, 16), 1, 14, 18);
    case "Thickness": // 110 micron on the label stock, 40 micron on the sleeve film
      return gauge(rng, sleeve ? 40 : 110);
    case "Peel Strength": // more than 1000 gms
      return fourOf(rng, rng.int(1150, 1200), 30, 1080, 1260);
    case "Gloss Testing": // gloss at 60˚
      return fourOf(rng, rng.int(80, 83), 1, 78, 85);
    case "Dimension (Length & Width)":
      return Array(4).fill(sleeve ? "L:203 & W:178" : "L:50 & W:40");
    case "Scuff Test":
    case "Corona Treatment":
      return Array(4).fill("Pass");
    case "Coloue shade":
      return Array(4).fill("OK");
    case "Shrinkage Ratio": {
      // TD 60 ± 2 %, MD 0 ~ 6%, written "TD-61,MD-3".
      const td = rng.int(60, 61);
      const md = rng.int(3, 4);
      return Array.from({ length: 4 }, () => `TD-${clamp(td + rng.int(-1, 1), 58, 62)},MD-${md}`);
    }
    default:
      return ["", "", "", ""];
  }
}

export interface ReliabilitySample {
  header: Record<string, string>;
  rows: Record<string, string>[];
}

/**
 * One exercise of F-QC-14 for `documentId` on `dueDate`: the boxes (the four inspectors, the FG code, each check's
 * Conclusion) and every line's sample and four readings, in the layout's order. Deterministic per (document, date).
 * `fallback` names Inspector - 1 where HR Master Data names no QA Manager.
 */
export function testReliabilitySample(documentId: string, dueDate: string, fallback: string): ReliabilitySample | null {
  const checks = RELIABILITY_CHECKS[documentId];
  if (!checks) return null;
  const sleeve = documentId === "qc-test-reliability-sleeve";
  const rng = makeRng(`test-reliability|${documentId}|${dueDate}`);
  const days = daysSince(REEL_SERIES.onDate, dueDate);
  const reel = REEL_SERIES.reel + Math.round(days * REEL_SERIES.reelPerDay) - rng.int(10, 60);
  const batch = REEL_SERIES.batch + Math.round(days * REEL_SERIES.batchPerDay) - rng.int(10, 60);
  // On the sleeve sheet the film's own reel, a little older, as the workbook's 9396/5146 is beside 9460/5234.
  const film = { reel: reel - rng.int(40, 90), batch: batch - rng.int(40, 90) };
  const firstRoll = rng.int(3, 28);
  const rolls = [firstRoll + 1, firstRoll, firstRoll + 2];
  const filmRolls = [1, 1 + rng.int(2, 4), 1 + rng.int(5, 8)];
  const fgDays = daysSince(FG_SERIES.onDate, dueDate);
  const fgCode = sleeve
    ? `FGSL${FG_SERIES.sleeve + Math.round(fgDays * FG_SERIES.sleevePerDay) - rng.int(0, 15)}`
    : `FGLA ${FG_SERIES.label + Math.round(fgDays * FG_SERIES.labelPerDay) - rng.int(0, 40)}`;

  const [inspector1, inspector2, inspector3, inspector4] = inspectorsOn(dueDate, rng, fallback);
  const header: Record<string, string> = { inspector1, inspector2, inspector3, inspector4, fgCode };
  const rows: Record<string, string>[] = [];
  checks.forEach((check, c) => {
    header[`conclusion${c + 1}`] = RELIABILITY_ACCEPTED;
    for (let s = 0; s < SAMPLES_PER_CHECK; s++) {
      // The sleeve sheet's rolls are the film's (the workbook's thickness lines carry the label stock's reel, written
      // across from the Label sheet; a sample exercise samples the film it tests).
      const sampleNo =
        check.sampled === "sample" ? String(s + 1) : sleeve ? `${film.reel}/${film.batch}/${filmRolls[s]}` : `${reel}/${batch}/${rolls[s]}`;
      const [reading1, reading2, reading3, reading4] = readings(check, sleeve, rng);
      rows.push({ sampleNo, reading1, reading2, reading3, reading4 });
    }
  });
  return { header, rows };
}
