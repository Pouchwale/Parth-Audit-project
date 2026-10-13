import { PO_SERIES } from "../data/seed/plantPattern";
import { makeRng } from "../utils/random";
import { qcSignerFor } from "./plantSimulation";

// THE JOB CHANGES A LINE CLEARANCE REGISTER RECORDS — DEMO MODE AND SAMPLE DATA ONLY
// (REQUIREMENTS §98, §111). F/QC/15-A to F/QC/15-G are registers of job changeovers on a
// machine: when the previous job finished, its PO and customer, the clearance, and when
// the new job started, signed by the operator and the IPQC executive. Their sample lines
// used to be the blank template's own three example lines — 2022 dates and "11.00 AM"
// with nothing else written — which no real register looks like. A sample day here is a
// few changeovers on the area's machine, one after another, each new job the next
// line's previous job, written the way the paper is: dates as the record's day, clock-face
// times ("2.40 PM"), the plant's label and sleeve customers, PO numbers from the plant's
// own PO series, the operator one of the area's own people on F/HR/03 (the skill
// matrix) and the IPQC executive QC's own on shift. Never used for a Live record: the
// morning prepare writes no line of a register (engine/knownParts.ts).

/** The area's operators, as F/HR/03 (the skill matrix) lists them for that process, still employed. */
const OPERATORS: Record<string, string[]> = {
  "qc-line-clearance-printing": ["Pankaj Thakor", "Karan Bariya", "Suresh Prajapati", "Dhruv Shrimali"],
  "qc-line-clearance-punching": ["Chandrakant Parmar", "Manhar Thakor"],
  "qc-line-clearance-qc-machine": ["Satish Solanki", "Prakash Thakor", "Laxman Rabari"],
  "qc-line-clearance-qc-manual": ["Gita Nayi", "Sanjay Thakor", "Anilji Thakor"],
  "qc-line-clearance-slitting": ["Baldev Nayak"],
  "qc-line-clearance-sleeve-gluing": ["Rohit Raval", "Baldev Nayak"],
  "qc-line-clearance-sleeve-cutting": ["Mahendra Raval"],
};

/** The seven English line clearance registers this fills. */
export const LINE_CLEARANCE_REGISTERS: ReadonlySet<string> = new Set(Object.keys(OPERATORS));

/** The plant's label and sleeve customers, as the QC registers on file name them (F/QC/16, F/QC/29, F/QC/30). */
const CUSTOMERS = [
  "Nivea India Pvt Ltd",
  "Dabur India Ltd. Kolkata",
  "Aculife Healthcare Pvt. Ltd./ Nirma",
  "Shreeji Agchem Pvt. Ltd",
  "Neilmed Pharmaceuticals Inc",
  "M/s. UPL Ltd Vapi",
  "Gangwal Healthcare Pvt. Ltd.",
  "Purity Polytubes Private Limited",
];

/** Minutes after midnight written the paper's way: "9.05 AM", "2.40 PM", "12.15 PM". */
export function clockFace(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}.${String(m % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

const isoClock = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

function daysFrom(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86400000);
}

/**
 * The day's changeovers on one area's machine: two to four, each one line of the
 * register, every value a string as the columns hold it. Deterministic per
 * (register, date), like every other sample value.
 */
export function lineClearanceChangeovers(documentId: string, dueDate: string): Record<string, string>[] {
  const operators = OPERATORS[documentId] ?? ["Pankaj Thakor"];
  const rng = makeRng(`line-clearance|${documentId}|${dueDate}`);
  const count = rng.int(2, 4);
  // The plant's PO series climbs with the calendar (engine/plantSimulation.ts jobsFor); a label job's PO is from the same series.
  const firstPo = PO_SERIES.base + daysFrom(PO_SERIES.onDate, dueDate) * PO_SERIES.perDay - rng.int(20, 60);
  const customers = [...CUSTOMERS];
  for (let i = customers.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [customers[i], customers[j]] = [customers[j], customers[i]];
  }
  const jobs = Array.from({ length: count + 1 }, (_, i) => ({ po: String(firstPo + i * rng.int(1, 4)), customer: customers[i % customers.length] }));
  const operator = rng.pick(operators);
  const lines: Record<string, string>[] = [];
  // The first job of the day is finished mid-morning; each new job runs one to three hours.
  let clock = 9 * 60 + rng.int(20, 110);
  for (let i = 0; i < count; i++) {
    const previous = jobs[i];
    const next = jobs[i + 1];
    const finished = clock;
    const started = finished + rng.int(15, 35);
    const verifier = qcSignerFor(isoClock(finished));
    lines.push({
      completionDate: dueDate,
      completionTime: clockFace(finished),
      previousJobPoNo: previous.po,
      previousPoCustomerName: previous.customer,
      lineClearance: "Done",
      verifiedByIpqcClearance: verifier,
      startingDate: dueDate,
      startingTime: clockFace(started),
      newJobPoNo: next.po,
      newPoCustomerName: next.customer,
      operatorSign: operator,
      verifiedByIpqcNewJob: qcSignerFor(isoClock(started)),
    });
    clock = started + rng.int(60, 180);
    // A day's register stops before midnight: the next job's change is on tomorrow's sheet.
    if (clock > 22 * 60) break;
  }
  return lines;
}
