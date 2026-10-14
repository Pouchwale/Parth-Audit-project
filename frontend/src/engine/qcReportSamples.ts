import type { LogSheetData, LogSheetRow, MasterData } from "../types";
import { qcPaperSigners } from "./qcPaperSamples";
import { OBSOLETE_ARTWORK_LINES } from "../data/seed/qcRegisterLayouts";
import { UTILITY_TEST_JOB_NAMES } from "../data/seed/qcReportLayouts";
import { generateId } from "../utils/id";
import { makeRng, type Rng } from "../utils/random";

// DEMO MODE AND SAMPLE DATA THAT LOOK REAL, FOR GROUP B'S REPORTS AND REGISTERS (REQUIREMENTS §111, rule 3 of the
// owner's brief of 13-Oct-2026; the review of 13-Oct-2026, OPS-2 and OPS-3).
//
// What Demo Mode and the sample fill wrote on these before:
//   * every signature box — F/QC/29's Testing By (QA Executive or QA Inspector) and Approved By (QA Manager), F/QC/20's
//     Destroyed By and Checked By, F/QC/16's Updated by - QC In-charge — signed by the document's first responsible
//     person, one name in both boxes of a paper whose two boxes are two people, and a name HR Master Data does not hold;
//   * F/QC/29's utility test with the nine samples of 02-Dec-2022, every day;
//   * F/QC/20 destroying the same 2022 printing aid, every day.
// Here, as on the incoming records and the certificates (engine/qcPaperSamples.ts, whose people this takes):
//   * the tester, the destroyer, the QC In-charge's update: one of QC's lab executives on HR Master Data who had joined
//     by that day, and the approval, the check: the QA Manager (Manager - QA) — two people, as the papers' two boxes are;
//   * the utility test: five to nine of the plant's own Nivea label samples, in an order of that day, each Pass in the
//     freezer, the desiccator and the oven;
//   * the printing aids destroyed: those of one or two of the plant's artworks made obsolete (F/QC/16's own lines), a
//     few of each.
//
// ONLY EVER DEMO MODE OR A TEST SERVER: called from engine/autoFill.ts alone. A Live record is prepared by
// engine/knownParts.ts, which writes none of this (REQUIREMENTS §98).

/** The documents this fills. */
export const QC_REPORT_SAMPLE_DOCUMENTS: readonly string[] = ["qc-analysis-report", "qc-utility-test-report", "qc-printing-aids-destruction", "qc-obsolete-artwork"];

/** `pool`'s items in an order of the day's own, `count` of them. */
function someOf<T>(pool: readonly T[], count: number, rng: Rng): T[] {
  const left = [...pool];
  const out: T[] = [];
  while (out.length < count && left.length > 0) out.push(left.splice(rng.int(0, left.length - 1), 1)[0]);
  return out;
}

/**
 * The day's sample for one of group B's reports and registers, from what autoFill.ts filled (`data`), or null for any
 * other document. Deterministic per (document, date). `fallback` names the signer where HR Master Data names nobody.
 */
export function qcReportSample(documentId: string, dueDate: string, data: LogSheetData, master: MasterData, fallback: string): LogSheetData | null {
  if (!QC_REPORT_SAMPLE_DOCUMENTS.includes(documentId)) return null;
  const { inspector, manager } = qcPaperSigners(dueDate, documentId, master, fallback);
  const rng = makeRng(`qc-report|${documentId}|${dueDate}`);
  const header = { ...data.header };
  switch (documentId) {
    case "qc-analysis-report":
      // Testing By the QA Executive, Approved By the QA Manager: as the 2022 page's Karan and Kapila.
      return { ...data, header: { ...header, testingBy: inspector, approvedBy: manager } };
    case "qc-utility-test-report": {
      // The day's samples, written by the tester (the job names are no longer printed lines, OPS-2).
      const samples = someOf(UTILITY_TEST_JOB_NAMES, rng.int(5, UTILITY_TEST_JOB_NAMES.length), rng);
      const rows: LogSheetRow[] = samples.map((jobName) => ({ id: generateId("row"), jobName, freeze: "Pass", desiccator: "Pass", oven: "Pass" }));
      return { ...data, header: { ...header, testingBy: inspector, approvedBy: manager }, rows };
    }
    case "qc-printing-aids-destruction": {
      // The printing aids of an artwork withdrawn (F/QC/16), destroyed and checked by two people.
      const lines = someOf(OBSOLETE_ARTWORK_LINES, rng.int(1, 2), rng);
      const rows: LogSheetRow[] = lines.map((l) => ({ id: generateId("row"), itemDescription: l.jobName, actualQty: String(rng.int(1, 4)), destroyedBy: inspector, checkedBy: manager }));
      return { ...data, rows };
    }
    case "qc-obsolete-artwork":
      // Updated by the QC In-charge: the QA Manager.
      return { ...data, rows: data.rows.map((r) => ({ ...r, updatedBy: manager })) };
    default:
      return null;
  }
}
