import type { LogSheetData, LogSheetLayout, LogSheetRow, MasterData } from "../types";
import { hrMasterRepository } from "../data/repositories/hrMasterRepository";
import { jobsFor, type LotOutcome } from "./plantSimulation";
import { isLotAccepted } from "./validation";
import { addDays, compareISO } from "../utils/date";
import { makeRng, type Rng } from "../utils/random";

// DEMO MODE AND SAMPLE DATA THAT LOOK REAL, FOR THE PAPERS OF REQUIREMENTS §111 (rule 3 of the
// owner's 13-Oct-2026 brief): the fourteen incoming material inspection records, F/QC/36, the three
// certificates of analysis and the Nivea tolerance card.
//
// What Demo Mode wrote on them before was the blank form with a lot status and a name: no supplier,
// no product, no GRN, no reading, a lot ACCEPTED with nothing observed, and the QA inspector's and
// the QA Manager's boxes both signed by the same person. A record of an inspection that looks like
// that is no example of one. Here each lot is a lot:
//   * the supplier from the plant's own documents (Avery Dennison on its traceability test, Centroiid
//     Plastopack on its sleeve certificate) or the Purchase module's approved list (F/PUR/03, F/PUR/05:
//     "Sample Supplier C" for BOPP and PET films, "B" for offset ink...), and in the same way "Sample
//     Supplier L" to "P" for the materials that list does not name (corrugated boxes, kraft paper,
//     flexo ink, the two adhesives); no other outside company is named, as nowhere in the sample data
//     (engine/sampleFill.ts);
//   * the GRN number on the plant's own series (GRN no. 16741 of 03.07.2024 and 17229 of 17.08.2024
//     on its traceability records, some eleven a day), the batch written GRN/batch as those records
//     write it, the report numbered within the financial year;
//   * every reading inside the specification the paper prints beside it, at the scatter one lot has;
//   * inspected by one of QC's lab executives on HR Master Data who had joined by that day, and
//     approved by the QA Manager (Manager - QA) — two people, as the paper's two boxes are.
//
// ONLY EVER DEMO MODE OR A TEST SERVER. This is called from engine/autoFill.ts alone, the simulation
// that writes a Demo Mode record and the sample data of a test server (engine/sampleFill.ts,
// engine/guidedRecord.ts's typical readings); a Live record is prepared by engine/knownParts.ts,
// which writes none of this (REQUIREMENTS §98).

/** QC's people on HR Master Data, as the paper's boxes name them. */
interface Signers {
  inspector: string;
  manager: string;
}

/**
 * The lab executive who inspected on this day (one who had joined by then) and the QA Manager, from HR
 * Master Data; where it holds neither (a server not yet set up), the document's responsible person and
 * Master Data's Manager - QA.
 */
export function qcPaperSigners(dueDate: string, seed: string, master: MasterData, fallback: string): Signers {
  const people = hrMasterRepository.all();
  const joined = (p: { joiningDate: string }) => !p.joiningDate || compareISO(p.joiningDate, dueDate) <= 0;
  const lab = people.filter((p) => /^lab\b/i.test(p.department) && /executive/i.test(p.designation) && joined(p)).map((p) => p.fullName);
  const manager =
    people.find((p) => /manager\s*-?\s*qa\b/i.test(p.designation))?.fullName ??
    master.employees.find((e) => e.active && /manager\s*-\s*qa\b/i.test(e.role))?.name.replace(/^Ms\.\s*|^Mr\.\s*/, "") ??
    fallback;
  const rng = makeRng(`paper-signer|${seed}|${dueDate}`);
  return { inspector: lab.length > 0 ? rng.pick(lab) : fallback, manager };
}

/** QC's lab executives on HR Master Data, longest-serving first, for each list of people it hands out. */
const labByPeople = new WeakMap<object, { name: string; joined: string }[]>();
function labExecutives(): { name: string; joined: string }[] {
  const people = hrMasterRepository.all();
  const hit = labByPeople.get(people);
  if (hit) return hit;
  const lab = people
    .filter((p) => /^lab\b/i.test(p.department) && /executive/i.test(p.designation))
    .map((p) => ({ name: p.fullName, joined: p.joiningDate || "" }))
    .sort((a, b) => compareISO(a.joined || "0000-01-01", b.joined || "0000-01-01") || a.name.localeCompare(b.name));
  labByPeople.set(people, lab);
  return lab;
}

/**
 * WHO SIGNS A QC LINE IN DEMO MODE AND SAMPLE DATA (REQUIREMENTS §111 part 6, rule 3 of the brief: signed by people
 * of HR Master Data). The papers' own day and night testers (F-QC-30's and F-QC-32's "Jeni" and "Singh", F/QC/11's
 * "Rashmi") are not on HR Master Data, nor are "Pooja P" or Demo Mode's "Priya Solanki". So a QC line or box is
 * signed by QC's lab executives who had joined by the day: the longest-serving on the day shift (08:00 to 18:00),
 * the next on the night shift. Where HR Master Data holds none (a server not yet set up), the name given.
 */
export function qcShiftSigner(dueDate: string, time: string | undefined, fallback: string): string {
  const lab = labExecutives().filter((p) => !p.joined || compareISO(p.joined, dueDate) <= 0);
  if (lab.length === 0) return fallback;
  const hour = Number(String(time ?? "09:00").split(":")[0]);
  const night = Number.isFinite(hour) && (hour >= 18 || hour < 8);
  return night ? (lab[1] ?? lab[0]).name : lab[0].name;
}

// ---------------------------------------------------------------------------
// numbers on the plant's own series

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** The plant's GRN series: no. 16741 on 03.07.2024 and 17229 on 17.08.2024 (data/seed/sysHaraTraceabilityRecords.ts), some eleven a day. */
const GRN_SERIES = { onDate: "2024-07-03", base: 16741, perDay: 10.8 };
/** Its internal batch series beside it: 12760 then 13128. */
const BATCH_SERIES = { onDate: "2024-07-03", base: 12760, perDay: 8.2 };

/** The first GRN of a day; each of the day's lots takes its own number after it (`place`, the paper's place in the list). */
const grnOn = (dueDate: string, place: number): number => Math.max(1, Math.round(GRN_SERIES.base + daysBetween(GRN_SERIES.onDate, dueDate) * GRN_SERIES.perDay) + (place % 10));
function batchOn(dueDate: string, rng: Rng): number {
  return Math.max(1, Math.round(BATCH_SERIES.base + daysBetween(BATCH_SERIES.onDate, dueDate) * BATCH_SERIES.perDay) + rng.int(0, 6));
}
/** The financial year a day falls in, as the plant writes it: "26-27" for 01.04.2026 to 31.03.2027. */
function financialYear(dueDate: string): { label: string; start: string } {
  const y = Number(dueDate.slice(0, 4));
  const startYear = Number(dueDate.slice(5, 7)) >= 4 ? y : y - 1;
  return { label: `${String(startYear % 100).padStart(2, "0")}-${String((startYear + 1) % 100).padStart(2, "0")}`, start: `${startYear}-04-01` };
}
/** The inspection report's number: the lot's place among the year's GRNs, so no two lots share one. */
const reportNumberOf = (grn: number, dueDate: string): string => {
  const fy = financialYear(dueDate);
  return `IR/${fy.label}/${String(Math.max(1, grn - grnOn(fy.start, 0) + 1)).padStart(4, "0")}`;
};
/** The label and sleeve production orders: PO 89480 on the F/QC/13 sheet of 06.09.2026, some four a day. */
const LABEL_PO_SERIES = { onDate: "2026-09-06", base: 89480, perDay: 4 };
function productionOrderOn(dueDate: string, rng: Rng): string {
  return String(LABEL_PO_SERIES.base + daysBetween(LABEL_PO_SERIES.onDate, dueDate) * LABEL_PO_SERIES.perDay + rng.int(0, LABEL_PO_SERIES.perDay - 1));
}

const fig = (rng: Rng, lo: number, hi: number, decimals = 0): string => (lo + rng.next() * (hi - lo)).toFixed(decimals);
const dotted = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

// ---------------------------------------------------------------------------
// 1. The incoming material inspection records

/** One lot as the inspector writes it: the header box's words, and what is written on each printed line (three samples where the paper has three). */
interface IncomingLot {
  supplier: string;
  product: string;
  qty: string;
  lines: (string | [string, string, string])[];
}

type LotMaker = (rng: Rng) => IncomingLot;

const three = (make: () => string): [string, string, string] => [make(), make(), make()];

/** Each paper's lot, its lines in the paper's order. Every figure sits inside the specification printed beside it. */
const INCOMING_LOTS: Record<string, LotMaker> = {
  // F/QC/01: size as P.O. (+2/-0), transparent, thickness ±1 micron, both sides at least 36 dynes.
  "qc-bopp-film": (rng) => {
    const [mic, width] = rng.pick([[20, 1020], [18, 840], [25, 1100]] as [number, number][]);
    return {
      supplier: "Sample Supplier C",
      product: `BOPP Plain Transparent Film ${mic} mic x ${width} mm`,
      qty: `${rng.int(14, 32) * 50} kg`,
      lines: [String(width + rng.int(0, 2)), "Transparent", fig(rng, mic - 0.6, mic + 0.6, 1), `Both side ${rng.int(37, 40)} dynes`],
    };
  },
  // F/QC/02: three boxes measured; size ±5, the ply, 5 ply bursting 12 ± 1 and compression 250 ± 50.
  "qc-corrugated-box": (rng) => {
    const [l, w, hgt] = rng.pick([[455, 305, 260], [390, 290, 210], [500, 340, 300]] as [number, number, number][]);
    const size = () => `${l + rng.int(-2, 2)} x ${w + rng.int(-2, 2)} x ${hgt + rng.int(-2, 2)}`;
    return {
      supplier: "Sample Supplier L",
      product: `5 Ply Corrugated Box ${l} x ${w} x ${hgt} mm`,
      qty: `${rng.int(8, 30) * 100} Nos`,
      lines: [three(size), ["5", "5", "5"], three(() => fig(rng, 11.5, 12.8, 1)), three(() => String(rng.int(235, 290)))],
    };
  },
  // F/QC/03: the chromo label stock of the plant's own certificates — 80 GSM face, 27 GSM hot melt, 60 GSM glassine.
  "qc-label-stock": (rng) => {
    const face = rng.int(78, 82);
    const adhesive = rng.int(26, 28);
    const liner = rng.int(58, 62);
    return {
      supplier: rng.pick(["Avery Dennison", "Sample Supplier A"]),
      product: "Chromo Paper 80 GSM / Hot Melt / Glassine 60 GSM, 1020 mm",
      qty: `${rng.int(6, 16) * 2000} Mtr`,
      lines: [
        String(1020 + rng.int(0, 1)),
        String(face + adhesive + liner),
        String(face),
        String(adhesive),
        String(liner),
        "Hot Melt",
        String(rng.int(76, 80)),
        String(rng.int(50, 54)),
        String(rng.int(19, 23) * 100),
        "As per specification",
      ],
    };
  },
  // F/QC/04: three cores; outer 90 (+2/-1), inner 76 (+2/-0), wall 7 (±0.5), length as PO ±5, moisture at most 15%.
  "qc-paper-core": (rng) => {
    const length = rng.pick([1020, 840, 1100]);
    return {
      supplier: "Sample Supplier E",
      product: `Paper Core 76 mm ID x 7 mm wall x ${length} mm`,
      qty: `${rng.int(4, 12) * 100} Nos`,
      lines: [
        three(() => fig(rng, 90.1, 91.4, 1)),
        three(() => fig(rng, 76.1, 77.2, 1)),
        three(() => fig(rng, 6.8, 7.3, 1)),
        three(() => String(length + rng.int(-3, 3))),
        three(() => fig(rng, 8.5, 11.5, 1)),
        ["As per COA", "As per COA", "As per COA"],
      ],
    };
  },
  // F/QC/05: the PVC blown film of the plant's sleeve certificate (Centroiid Plastopack PVC Blown 40 mic 200 mm).
  "qc-pvc-pet-film": (rng) => {
    const width = rng.pick([200, 230, 260]);
    return {
      supplier: rng.pick(["Centroiid Plastopack", "Sample Supplier K"]),
      product: `PVC Blown Shrink Film 40 mic x ${width} mm`,
      qty: `${rng.int(10, 30) * 25} kg`,
      lines: [
        fig(rng, width - 0.8, width + 0.8, 1),
        `PVC BLOWN: TD ${fig(rng, 48.6, 51.4, 1)} %, MD ${fig(rng, 2, 5, 1)} %`,
        fig(rng, 38.6, 41.4, 1),
        `Both side ${rng.int(37, 40)} dynes`,
      ],
    };
  },
  // F/QC/18: an offset process ink; dE below 3.0, flow at most 120 mm.
  "qc-offset-ink": (rng) => {
    const shade = rng.pick(["Process Cyan", "Process Magenta", "Process Yellow", "Process Black", "Pantone 151 C"]);
    return {
      supplier: "Sample Supplier B",
      product: `Offset Ink ${shade}, 2.5 kg tin`,
      qty: `${rng.int(4, 16) * 2.5} kg`,
      lines: [
        "As per PO",
        "Matching with master",
        fig(rng, 0.6, 2.2, 1),
        "No skinning",
        `${rng.int(85, 110)} mm`,
        "No inking of the thumb after 24 hrs",
        "Solid dried within 1 hr, drops within 24 hrs",
        "Not specified in P.O.",
        "Not specified in P.O.",
        "No fading after 80 hrs",
      ],
    };
  },
  // F/QC/19: duplex board; moisture 5.5% – 8.5%, Cobb wire side 30–50, felt side 30-60.
  "qc-duplex-board": (rng) => {
    const gsm = rng.pick([250, 300, 350]);
    return {
      supplier: "Sample Supplier I",
      product: `Duplex Board ${gsm} GSM Grey Back, 635 x 890 mm`,
      qty: `${rng.int(20, 60) * 100} Sheets`,
      lines: ["635 x 890", String(gsm + rng.int(-4, 4)), String(rng.int(16, 18)), fig(rng, 6.2, 7.8, 1), `Wire Side: ${rng.int(36, 46)}, Felt Side: ${rng.int(40, 54)}`, "N.A.", "N.A."],
    };
  },
  // F/QC/20: kraft paper; moisture 5.5% – 8.5%, Cobb 30-50, bulk density 1.3 and over.
  "qc-kraft-paper": (rng) => {
    const [gsm, bf] = rng.pick([[150, 22], [120, 18], [180, 24]] as [number, number][]);
    return {
      supplier: "Sample Supplier M",
      product: `Kraft Paper ${gsm} GSM ${bf} BF, 1100 mm reel`,
      qty: `${rng.int(8, 20) * 250} kg`,
      lines: ["1100", String(gsm + rng.int(-3, 3)), String(bf), fig(rng, 6.0, 7.9, 1), String(rng.int(34, 46)), "N.A.", fig(rng, 1.31, 1.42, 2)],
    };
  },
  // F/QC/21: a flexo ink with its L, A and B values; dE below 2.0.
  "qc-flexo-ink": (rng) => {
    const [shade, l, a, b] = rng.pick([
      ["Process Cyan", 55, -37, -50],
      ["Process Magenta", 48, 74, -3],
      ["Process Yellow", 89, -5, 93],
      ["Process Black", 16, 0, 0],
    ] as [string, number, number, number][]);
    return {
      supplier: "Sample Supplier N",
      product: `UV Flexo Ink ${shade}, 1 kg`,
      qty: `${rng.int(5, 20)} kg`,
      lines: ["As per purchase order", "Matching with master", fig(rng, l - 1, l + 1, 2), fig(rng, a - 1, a + 1, 2), fig(rng, b - 1, b + 1, 2), fig(rng, 0.4, 1.6, 1)],
    };
  },
  // F/QC/21: the lamination adhesive; 15 to 20 sec on the B4 Ford cup, at least 40% solids, gloss above 85%.
  "qc-lamination-adhesive-inspection": (rng) => ({
    supplier: "Sample Supplier O",
    product: "Solvent Based PU Lamination Adhesive, 200 kg drum",
    qty: `${rng.int(2, 6) * 200} kg`,
    lines: ["Nil", fig(rng, 16, 19, 0), fig(rng, 41, 45, 1), fig(rng, 86, 91, 0), "Clear"],
  }),
  // F/QC/22: the side pasting adhesive; 30 to 40 sec with 20% water, at least 50 solids.
  "qc-side-pasting-adhesive": (rng) => ({
    supplier: "Sample Supplier P",
    product: "Side Pasting Adhesive (PVA based), 50 kg carboy",
    qty: `${rng.int(2, 8) * 50} kg`,
    lines: ["Nil", fig(rng, 32, 38, 0), fig(rng, 51, 55, 1)],
  }),
  // F/QC/23: corrugation starch; below 14 moisture, 30 ± 10 sec, 16 to 25 solids.
  "qc-starch-powder": (rng) => ({
    supplier: "Sample Supplier J",
    product: "Corrugation Starch Powder, 50 kg bag",
    qty: `${rng.int(10, 40) * 50} kg`,
    lines: ["Milky White", fig(rng, 10.5, 13.2, 1), rng.pick(["1:3", "1:4"]), fig(rng, 26, 36, 0), fig(rng, 18, 23, 1)],
  }),
  // F/QC/24: sheet pasting powder; below 14 moisture, 16 to 30 solids.
  "qc-sheet-pasting-powder": (rng) => ({
    supplier: "Sample Supplier J",
    product: "Sheet Pasting Powder, 50 kg bag",
    qty: `${rng.int(10, 30) * 50} kg`,
    lines: ["Creamish Brown", fig(rng, 10.5, 13.2, 1), rng.pick(["1:4", "1:5"]), fig(rng, 32, 48, 0), fig(rng, 19, 27, 1)],
  }),
  // F/QC/33: the lamination films the plant's own sheets name (85 mic natural LDPE, 12 mic MetPET); thickness ±1 micron.
  "qc-incoming-lamination-film": (rng) => {
    const [name, mic] = rng.pick([["LDPE Natural Lamination Film", 85], ["Metallised PET Film", 12], ["PET Plain Film", 12]] as [string, number][]);
    return {
      supplier: "Sample Supplier C",
      product: `${name} ${mic} mic x 1020 mm`,
      qty: `${rng.int(10, 40) * 50} kg`,
      lines: [String(1020 + rng.int(0, 2)), fig(rng, mic - 0.6, mic + 0.6, 1), `${rng.int(40, 44)} dynes`, fig(rng, 0.18, 0.26, 2), mic > 50 ? `${rng.int(240, 290)} g` : "N.A.", "No abnormal odour"],
    };
  },
};

function incomingLot(documentId: string, layout: LogSheetLayout, dueDate: string, data: LogSheetData, signers: Signers): LogSheetData | null {
  const make = INCOMING_LOTS[documentId];
  if (!make) return null;
  const rng = makeRng(`incoming-lot|${documentId}|${dueDate}`);
  const lot = make(rng);
  const grn = grnOn(dueDate, Object.keys(INCOMING_LOTS).indexOf(documentId));
  const header: Record<string, string> = {
    ...data.header,
    supplierName: lot.supplier,
    reportNumber: reportNumberOf(grn, dueDate),
    productDescription: lot.product,
    batchNumber: `${grn}/${batchOn(dueDate, rng)}/1`,
    grnQty: lot.qty,
    grnNumber: String(grn),
    dateOfInspection: dueDate,
    inspectedBy: signers.inspector,
    approvedBy: signers.manager,
  };
  const samples = layout.columns.filter((c) => /^sample[123]$/.test(c.key)).map((c) => c.key);
  const rows: LogSheetRow[] = data.rows.map((row, i) => {
    const line = lot.lines[i];
    if (line === undefined) return row;
    if (Array.isArray(line)) return { ...row, ...Object.fromEntries(samples.map((k, si) => [k, line[si] ?? ""])) };
    return { ...row, observation: line };
  });
  return { header, rows };
}

// ---------------------------------------------------------------------------
// 2. F/QC/36, the solvent base lamination film: the day's first laminated job

/** The film each lamination job runs, as the plant's sheets write it (F/QC/35's "25 mic Matt BOPP", "12 mic MetPET", "85 mic LDPE (Nat)"). */
const FILM: Record<string, { words: string; gsm: number }> = {
  PET: { words: "12 mic PET", gsm: 16.8 },
  MetPET: { words: "12 mic MetPET", gsm: 16.8 },
  BOPP: { words: "20 mic BOPP", gsm: 18.2 },
  LDPE: { words: "85 mic LDPE (Nat)", gsm: 78.6 },
};
/** The dry adhesive between two layers, in gsm. */
const ADHESIVE_GSM = 3.5;

function sbLaminationLot(dueDate: string, data: LogSheetData, signers: Signers, lot: LotOutcome | null): LogSheetData {
  const rng = makeRng(`sb-lamination|${dueDate}`);
  const job = jobsFor(dueDate)[0];
  if (!job) return data;
  const one = FILM[job.layer1Type] ?? { words: job.layer1Type, gsm: 17 };
  const two = FILM[job.layer2Type] ?? { words: job.layer2Type, gsm: 17 };
  const composite = one.gsm + two.gsm + ADHESIVE_GSM;
  let observed = fig(rng, composite - 0.8, composite + 0.8, 1);
  let reason = data.header.deviationReason ?? "";
  // A lot taken on deviation for its composite GSM says so in this job's own figures.
  if (lot && !isLotAccepted(lot.status) && /composite gsm/i.test(reason)) {
    observed = (composite - 2.1).toFixed(1);
    reason = reason.replace(/Composite GSM\s+\d+(?:\.\d+)?\s*gsm against\s+\d+(?:\.\d+)?\s*gsm/i, `Composite GSM ${observed} gsm against ${composite.toFixed(1)} gsm`);
  }
  const odourHeld = !!lot && !isLotAccepted(lot.status) && /odour/i.test(reason);
  const header: Record<string, string> = {
    ...data.header,
    fgCode: job.fgCode,
    poNumber: job.poNo,
    dateShift: `${dotted(dueDate)} / ${rng.chance(0.7) ? "1st" : "2nd"}`,
    laminatedRoll: String(rng.int(1, 4)),
    substrate1: one.words,
    substrate2: two.words,
    pass: "1st Pass",
    deviationReason: reason,
    inspectedBy: signers.inspector,
    approvedBy: signers.manager,
  };
  const words = [observed, `${fig(rng, 0.28, 0.42, 2)} kg (indicative)`, odourHeld ? "Solvent odour" : "No abnormal odour"];
  return { header, rows: data.rows.map((row, i) => (words[i] !== undefined ? { ...row, observation: words[i] } : row)) };
}

// ---------------------------------------------------------------------------
// 3. The certificates of analysis

/** The retest date the plant's label certificate gives: six months on, the day before (04/01/2022 → 03/07/2022). */
function retestAfter(coaDate: string): string {
  const y = Number(coaDate.slice(0, 4));
  const m = Number(coaDate.slice(5, 7)) + 6;
  const d = Number(coaDate.slice(8, 10));
  const ym = new Date(Date.UTC(y + Math.floor((m - 1) / 12), (m - 1) % 12, 1));
  const last = new Date(Date.UTC(ym.getUTCFullYear(), ym.getUTCMonth() + 1, 0)).getUTCDate();
  const same = `${ym.getUTCFullYear()}-${String(ym.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  return addDays(same, -1);
}

/**
 * A certificate for today's dispatch of the job its specimen certificate is for: the job's own client,
 * codes, specification and colours (carried), today's production order and date, and the tested figures
 * inside the TOLERANCE the certificate prints.
 */
function certificate(documentId: string, dueDate: string, data: LogSheetData, signers: Signers): LogSheetData | null {
  const rng = makeRng(`coa|${documentId}|${dueDate}`);
  const h = data.header;
  const within = (spec: string, plusMinus: number, decimals = 0) => {
    const n = parseFloat(spec);
    return Number.isFinite(n) ? fig(rng, n - plusMinus, n + plusMinus, decimals) : spec;
  };
  const common = {
    productionOrderNo: productionOrderOn(dueDate, rng),
    coaDate: dueDate,
    shadeMatchGrade: rng.chance(0.75) ? "4" : "5",
    remarksForShade: "Shade found to be a satisfactory match against sample",
    remarksForTextVerification: "Text matter verified to be matching with control samples",
    scuffTest: "2 lbs, 100 rounds Okay",
    finishingQualityGrade: rng.chance(0.8) ? "4" : "5",
    remarksForFinishingQuality: "Finishing Quality Found to Be Satisfactory",
    finalInspection: "Passed",
    overAllQualityRemarks: "Overall quality found to be satisfactory",
    retestOn: retestAfter(dueDate),
  };
  if (documentId === "qc-coa-label") {
    // TOLERANCE: length and width ± 2 mm, face material ± 10 %, adhesive ± 2 GSM, release liner ± 5 %.
    return {
      header: {
        ...h,
        ...common,
        testedLength: within(h.specifiedLength ?? "", 1),
        testedWidth: within(h.specifiedWidth ?? "", 1),
        faceMaterialTested: `${within(h.faceMaterialRequired ?? "", 3)} GSM/Microns`,
        adhesiveTested: `${within(h.adhesiveRequired ?? "", 1)} GSM`,
        releaseLinerTested: `${within(h.releaseLinerRequired ?? "", 2)} GSM`,
        faceMaterialObserved: h.faceMaterialObserved || "Chromo",
        adhesiveObserved: h.adhesiveObserved || "Rubber Based (Hot Melt)",
        releaseLinerObserved: h.releaseLinerObserved || "Glassine Paper",
        textMatterVerification: "Pass",
        coatingDone: h.coatingDone || "Gloss UV",
        achievedGloss: `${fig(rng, 80, 88, 2)}%`,
        dieCuttingType: h.dieCuttingType || "Rectangle with radius corner",
        dieCutting: "Okay",
        rewindingQuality: "Okay",
        emboss: h.emboss || "Not Applicable",
        packingQuality: "Okay",
        foilStamping: h.foilStamping || "Not Applicable",
        slittingQuality: "Okay",
      },
      rows: data.rows,
    };
  }
  if (documentId === "qc-coa-sleeve") {
    // TOLERANCE: cut length and open width ± 2 mm, shrinkage ratio ± 5 %, microns ± 10 %.
    return {
      header: {
        ...h,
        ...common,
        testedCutLength: within(h.specifiedCutLength ?? "", 1),
        testedOpenWidth: within(h.specifiedOpenWidth ?? "", 1),
        thicknessTested: within(h.thicknessRequired ?? "", 2),
        shrinkageRatioTested: within(h.shrinkageRatioRequired ?? "", 2),
        typeTested: h.typeTested || "PVC Blown",
        textMatterVerification: common.shadeMatchGrade,
        barCodeGrade: "4",
        barCodeRemarks: "Bar Code Scanned and Quality Found to be Satisfactory",
        coatingDone: h.coatingDone || "Matt UV",
        achievedGloss: `${rng.int(45, 55)}%`,
        perforationQuality: h.perforationQuality || "Not Applicable",
        rewindingQuality: h.rewindingQuality || "Not Applicable",
        holdingGlueQuality: "Okay",
        packingQuality: "Okay",
        whiteOpacity: h.whiteOpacity || "Not Applicable",
        slittingQuality: "Okay",
      },
      rows: data.rows,
    };
  }
  if (documentId === "qc-coa-corrugated") {
    // A 5 ply shipper for one of the plant's own customers, inside the specification of F/QC/02.
    const [party, job, size] = rng.pick([
      ["Gulab Oil And Food", "Gulab Oil Pouch Shipper — 5 Ply", "455 x 305 x 260 mm"],
      ["VP Bedekar", "VP Bedekar Masala Shipper — 5 Ply", "390 x 290 x 210 mm"],
      ["Sweet Karam", "Sweet Karam Gusset Pouch Shipper — 5 Ply", "500 x 340 x 300 mm"],
    ] as [string, string, string][]);
    const lines: Record<string, Record<string, string>> = {
      "1": { observation: party },
      "2": { observation: job },
      "3": { observation: size },
      "4": { observation: `${fig(rng, 11.6, 12.8, 1)} kg/cm²` },
      "5": { observation: `${rng.int(240, 285)} kg` },
      "6": { observation: `${rng.int(590, 650)} g` },
      "7.1": { specifiedGsm: "150", testedGsm: String(rng.int(147, 153)), bf: "22", gradeOfPaper: "Kraft" },
      "7.2": { specifiedGsm: "120", testedGsm: String(rng.int(118, 123)), bf: "18", gradeOfPaper: "Kraft" },
      "7.3": { specifiedGsm: "120", testedGsm: String(rng.int(117, 122)), bf: "16", gradeOfPaper: "Semi Kraft" },
      "8": { observation: "5 Ply" },
      "9": { observation: "2 Colour Flexo (Black, Red)" },
      "10": { observation: "RSC" },
      "11": { observation: "B + C Flute" },
      "12": { observation: "OK" },
      "13": { observation: `${fig(rng, 6.0, 6.8, 1)} kN/m` },
      "14": { observation: "OK — no rub-off" },
    };
    return {
      header: {
        ...h,
        date: dueDate,
        oid: productionOrderOn(dueDate, rng),
        jobCode: `FGCO${String(1200 + rng.int(0, 80)).padStart(4, "0")}`,
        testingBy: signers.inspector,
        signBy: signers.manager,
      },
      rows: data.rows.map((row) => ({ ...row, ...(lines[String(row.srNo)] ?? {}) })),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------

/** The Nivea tolerance card: every panel approved and signed by the QA Manager. */
function toleranceCard(data: LogSheetData, signers: Signers): LogSheetData {
  return { header: data.header, rows: data.rows.map((row) => ({ ...row, approvedBy: signers.manager, sign: signers.manager })) };
}

/** The documents this module writes Demo Mode's and a test server's sample data for. */
export const QC_PAPER_SAMPLE_DOCUMENTS: readonly string[] = [
  ...Object.keys(INCOMING_LOTS),
  "qc-inspection-sb-lamination",
  "qc-coa-label",
  "qc-coa-sleeve",
  "qc-coa-corrugated",
  "qc-tolerance-card-nivea",
];

/**
 * DEMO MODE'S RECORD OF ONE OF THESE PAPERS, as a real one reads (engine/autoFill.ts only, never a Live
 * record): the simulation's data with the lot, the certificate or the card filled in. Null for any other
 * document, which autoFill fills as before.
 */
export function qcPaperSample(
  documentId: string,
  layout: LogSheetLayout,
  dueDate: string,
  data: LogSheetData,
  lot: LotOutcome | null,
  master: MasterData,
  fallbackSigner: string
): LogSheetData | null {
  if (!QC_PAPER_SAMPLE_DOCUMENTS.includes(documentId)) return null;
  const signers = qcPaperSigners(dueDate, documentId, master, fallbackSigner);
  if (INCOMING_LOTS[documentId]) return incomingLot(documentId, layout, dueDate, data, signers);
  if (documentId === "qc-inspection-sb-lamination") return sbLaminationLot(dueDate, data, signers, lot);
  if (documentId === "qc-tolerance-card-nivea") return toleranceCard(data, signers);
  return certificate(documentId, dueDate, data, signers);
}
