import type { LogColumn, LogSheetLayout } from "../../types";

// SYSTEM / MANAGEMENT — DOCUMENT CONTROL (REQUIREMENTS §76): the Product Safety
// Team Leader's three formats for keeping the plant's documents under control,
// supplied on 25-Sep-2026 and reproduced as log-sheet layouts (types/logSheet.ts).
//
//   sys-document-list    F/SYS/01 (00/01.12.2021)  MASTER LIST OF DOCUMENTS
//     — the company's workbook "F-SYS-01-Master List of Documents. (R-2025)..xlsx",
//       sheet "GPPL - Doc list" (173 documents), and its print, the PDF of the
//       same name (5 pages). The two agree in every cell of all 173 lines.
//   sys-format-list      F/SYS/02 (00/01.12.2021)  MASTER LIST OF FORMATS & RECORDS
//     — the company's workbook "F-SYS-02-Master List of Formats. (R-2025)..xlsx",
//       sheet "GPPL - Formats list": 141 formats, the list as last updated (to
//       01.09.2026). The PDF of the same name is an EARLIER print of it — 135
//       formats on pages 1 to 5; pages 6 to 10 are Excel's overflow of the two
//       note columns beside the list. Where the two differ, see FORMAT_LINES.
//   sys-document-change  F/SYS/03 (Rev No: 01, Date: 01.12.2021)  DOCUMENT CHANGE
//     REQUEST & APPROVAL NOTE — "F-SYS-03-Document change request & approval
//     note.pdf", one page, supplied BLANK.
//
// Not used, because they are not the list: the F/SYS/01 workbook's hidden
// "Reference" sheet (an old list, "Doc.No. - F-DOCS-01 Rev. 02 /01.01.16", of
// PET sheet and thermoforming documents) and its empty "Sheet1"; the F/SYS/02
// workbook's "GPPL - Formats list (2)" (an older copy of the list, which also
// holds un-numbered lines for F-QC-18, 19, 20, 22 and 25 that the current list
// does not) and its "Sheet1" (four jottings, below).
//
// VERBATIM MEANS VERBATIM. Every heading and every cell is the company's own
// wording, spelling, capitalisation and punctuation, down to the double spaces
// some cells hold: "Document discription", "Format  discription", "FORDIGITAL",
// "Dart Impack", "assesment", "Raw Mterial", "PRODUCTSAFETY&QUALITY",
// "CLOTHINGS", "Acknowldgement", "Obsolate", "Laminated FIlms Slittig",
// "_Inspection record for Flexo Ink", "Pre Employment Health declaration." — and
// "FLE/PR0/WP/…", written with a zero, not an O, on all 22 lines. The dates are
// kept exactly as the lists write them ("01.12.21", "15.12.2024", "16.2.2022"),
// which is why every column is text: the lists write their years in two digits
// and in four, and a revision cell can hold words ("Merged in one sheet").
//
// WHAT HAD TO BE REPRESENTED DIFFERENTLY FROM THE PAPER, AND WHY:
//   * The lists' own Sr.No is the number the grid draws down its side, so it is
//     not a column; the company name, the title and the format number that head
//     every page are the document header the app prints on every record.
//   * A MERGED CELL IS HELD IN ITS FIRST CELL, as Excel itself holds it. F/SYS/01
//     Sr.No 121, RD / 14 "Covid-19-Risk-Assessment", prints "Obsolete &
//     Removed" once across Document Control and all six revision columns: it is
//     in Document Control, where the workbook keeps it (D125:J125). F/SYS/02's
//     F-QC-41 "Obsolate on 25.06.25" runs across Method of Recording, Retention
//     Period and Method of Disposition: it is in Method of Recording (H73:J73).
//     "Merged in one sheet" runs down revision "2" of F-PRD- 17. A, B and C: it
//     is on 17. A's line (F93:F95).
//   * Three cells of the F/SYS/02 workbook are filled RED — F-MKT-03's
//     description, the "Merged in one sheet" cell and F-MNT-11's revision 1
//     date. A grid cell has no colour, so the red is not reproduced; it is
//     recorded here.
//   * THE NOTES BESIDE F/SYS/02. The workbook writes six notes in two columns to
//     the right of the form (K and L), outside it: "Humidity also mentioned"
//     (F-QC-40. A), "Hotroom -In time added" (F-PRD-18), "Hotroom -out time
//     added" (F-PRD-20), "Job bag require KG added" (F-PRD-26), "New ink kitchen
//     added" (F-MNT-09), "Area added" (F-MNT-11). They are notes on the list,
//     not columns of the form, so no column is added for them. The print
//     carries the two "Hotroom" notes on its overflow pages 8 and 9, beside
//     print rows 90 and 92, and one the workbook does not have — "Not added in
//     project", on page 10 beside print row 121, F-HR-11. Pages 6 and 7 are
//     blank. Those five pages are not shown beside the form. The workbook's
//     "Sheet1" jots "F-PRD-06 (01/10.07.2026) Gluing", "F-PRD-07 (01/10.07.2026)
//     cutting", "F-PRD-27 (00/10.07.2026) Rewinding" and "F-PRD-28
//     (00/10.07.2026) Slitting" — dated 10.07.2026, where the list itself gives
//     those four 01.09.2026.
//   * F/SYS/02's "Revision No. & Date *" band is drawn as the page and the
//     workbook (D3:J3) draw it: over all seven columns right of the
//     description — the four revisions and Method of Recording, Retention
//     Period and Method of Disposition beneath it. F/SYS/01's spans its six
//     revisions only (E3:J3), as there.
//   * Spaces at either end of a cell are not kept — " Quality & Product Safety
//     Policy ", "Annexure-A ", " Tape Test", " FILM- MATT FINISH", " Lamination
//     Adhesive Viscosity Record", "Purchase Order " and eight more, fourteen
//     cells in all; the four that lead with a space show on the print at most
//     as a slight indent. The one line break typed inside a cell, in
//     FLX/SOP/19's "Procedure for Gowning & Un-Gowning –" / "Employee and
//     Visitors", is a space, because a grid cell is one line.
//   * "Reviewed & approved by :" is printed under each list with the role
//     written in beside it ("PSTL"; "PSTL / M.R."): a box below the grid that
//     starts with it. The lists carry no date of their own, so each record is
//     filed under the day it was supplied (sysDocumentControlRecords.ts).
//
// THE F/SYS/01 LIST'S OWN ODDITIES — the print and the workbook agree on every
// one; kept as they are, for the PSTL to confirm:
//   * Sr.No 1 is "GPPPL/PSMS/M/01", three Ps, where Sr.No 21 to 30 write
//     "GPPL/PSMS/M/02".
//   * Sr.No 1 is still "BRCGS - PACKAGING (ISSUE 06)", last revised 15.12.24,
//     while F/SYS/04 of 21.07.2025 records the migration of the documented
//     system to Issue 7 (due 01.04.2025) as "Completed".
//   * Sr.No 27 and 28 are both "GPPL/PSMS/M/02 - SECTION G" (the Process Hazard
//     Analysis, and the same for Flexible Packaging).
//   * Sr.No 48 (FLE/PR0/WP/18) and 50 (FLE/PR0/WP/20) are both "WORK PROCEDURE
//     FOR DCMF MACHINE"; 50 carries only revision 0, "01.01.22", where its
//     neighbours carry 01.01.19 and 01.01.22.
//   * Sr.No 90 is "QC/ICM/SPECS/05" among "QC/ICM/SPEC/…", and Sr.No 134 "RD/27"
//     among "RD / 01" to "RD / 26". The QC/WP numbers skip 13, 14, 15, 17, 23.
//   * Sr.No 85, QC/WP/38 "Dimension", has no Document Control and no date.
//   * Sr.No 121, RD / 14, is "Obsolete & Removed" with no date.
//   * Sr.No 167, FLX/PRO/MKT/03, has revision 2 "15.07.2026" with revision 1
//     blank. It is the latest date on the list.
//   * Sr.No 170, POUCH/SOP/01, is dated "15.12.2025", where the three POUCH work
//     procedures below it — and the Flexible Packaging hazard analysis, Sr.No
//     28 — are dated 15.12.2024.
//   * The asterisk of "Revision No. & Date *" refers to no note on any page.
//
// F/SYS/02 AGAINST ITSELF AND THE FORMS IT LISTS — the same in the print and
// the workbook: it lists F-SYS-03, F-SYS-04, F-QC-08 and F-MNT-02 at revision 0
// (01.12.21) alone, while their own pages print Rev 01 (F/SYS/03, F/QC/08 and
// F/MNT/02 dated 01.12.2021, F/SYS/04 01.04.2025); it gives F-SYS-10 revision
// 1 of 01.03.23, while F/SYS/10 prints "Rev No: 01 Date: 01.05.2013"; it stops
// at F-SYS-17 and skips F-SYS-09, so F/SYS/04-A and F/SYS/20 are not on it; it
// skips F-DISP-03 and F-PRD-14.C and 14.D; it gives F-PRD- 17. A, B and C no
// revision date at all; F-MNT-10 has revision 2 "15.12.2024" with revision 1
// blank; and it calls F/SYS/01 "Master List of Document", which heads itself
// "MASTER LIST OF DOCUMENTS". The workbook alone gives F-SYS-14 and F-SYS-15 a
// revision 1 of 01.04.2025: the F/SYS/14 and F/SYS/15 pages supplied, filled
// in December 2024, print (00/01.12.2021), and that revision 1 was not supplied.
// Against the forms the other modules already hold, as their own pages print
// them (documentDefinitions.ts records each): F-HR-18 is at revision 0 alone
// where F/HR/18 prints Rev 02 of 15.12.2024; F-HR-09 is dated 01.12.21 where
// F/HR/09 prints Rev. 00 / 07.03.2022; F-QC-21, the flexo ink record, is
// dated 01.12.21 where its page prints 00 / 01.04.2023, and the lamination
// film adhesive record prints the same number, F/QC/21 (01 / 16.02.2022), but
// is not on the list; F-QC-30 is the "Lamination Adhesive Viscosity Record",
// where the Minutes of Meetings print F/QC/30 (01 / 01.12.2022); F-HR-11 is
// "Training Evaluation Record" and F-HR-12 "TRAINING EFFECTIVENESS EVALUATION
// RECORD", where the forms print F/HR/11 as "TRAINING EFFECTIVENESS EVALUATION
// RECORD" and F/HR/12 as "TRAINING FEEDBACK & EVALUATION RECORD"; and the
// forms held as F/QC/18, 19, 20, 22, 23, 24, 25 and 29 are not on it at all.
//
// F/SYS/03 — see its layout below. Its own oddities: the "Format No.:" box of
// its header is printed EMPTY (the number is the master list's and the file's),
// and it prints "Rev No: 01", a revision F/SYS/02 does not list.

/** A supplied page, shown unaltered beside the form (REQUIREMENTS §71). */
const page = (file: string, caption: string) => ({ src: `/source/${file}`, caption });

/** The band both lists print over their revision columns, asterisk and all. */
const REVISIONS = "Revision No. & Date *";

/** The revision columns — "0" to "5" on F/SYS/01, "0" to "3" on F/SYS/02. */
export const DOCUMENT_LIST_REVISION_KEYS = ["rev0", "rev1", "rev2", "rev3", "rev4", "rev5"];
export const FORMAT_LIST_REVISION_KEYS = ["rev0", "rev1", "rev2", "rev3"];

// A master list is kept up to date, never started afresh: every cell of a new
// list is the last list's, to be changed where a document has changed.
const listColumn = (key: string, label: string, width: number, group?: string): LogColumn => ({
  key,
  label,
  type: "text",
  width,
  ...(group ? { group } : {}),
  autoFill: { carryForward: true },
});

const revisionColumn = (key: string, revision: number): LogColumn => listColumn(key, String(revision), 92, REVISIONS);

// ===========================================================================
// F/SYS/01 — MASTER LIST OF DOCUMENTS
// ===========================================================================

/**
 * F/SYS/01's 173 documents, cell for cell from the workbook and checked against
 * the print, which agrees throughout. Each line: Document Number, Document
 * discription, Document Control, then revisions 0, 1, 2 … as far as the line
 * has them — a revision left blank before a later one is written "" (Sr.No 167).
 */
const DOCUMENT_LINES: string[][] = [
  ["GPPPL/PSMS/M/01", "BRCGS - PACKAGING (ISSUE 06)", "Hard copy/ SAP", "01.12.21", "15.12.24"],
  ["Annexure-A", "Quality & Product Safety Policy", "Hard copy/ SAP", "01.12.21"],
  ["Annexure-B", "Wood Policy", "Hard copy/ SAP", "01.12.21"],
  ["Annexure-C", "Glass & Brittle Plastic Policy", "Hard copy/ SAP", "01.12.21"],
  ["Annexure-D", "Metal & Sharp Policy", "Hard copy/ SAP", "01.12.21"],
  ["Annexure-E", "Hygiene Policy.", "Hard copy/ SAP", "01.12.21"],
  ["Annexure-F", "Laundry Policy", "Hard copy/ SAP", "01.12.21", "15.12.24"],
  ["PSMS / SOP/ 01", "Procedure for Hazard analysis", "SAP", "01.12.21"],
  ["PSMS / SOP/ 02", "Procedure for HACCP verification", "SAP", "01.12.21"],
  ["PSMS / SOP/ 03", "Procedure for Food safety incident management", "SAP", "01.12.21"],
  ["PSMS / SOP/ 04", "Procedure for Product withdrawal & recall", "SAP", "01.12.21"],
  ["PSMS / SOP/ 05", "Procedure for Product Safety Emergency & its Response", "SAP", "01.12.21"],
  ["PSMS / SOP/ 06", "Food defense Plan", "SAP", "01.12.21"],
  ["IMS / PRO / 01", "Procedure for Document & Data Control", "SAP", "01.01.19", "01.12.21"],
  ["IMS / PRO / 02", "Procedure for Control of Records", "SAP", "01.01.19", "01.12.21"],
  ["IMS / PRO / 03", "Procedure for Internal audit", "SAP", "01.01.19", "01.12.21"],
  ["IMS / PRO / 04", "Procedure for Control of Non-Conforming Products", "SAP", "01.01.19", "01.12.21"],
  ["IMS / PRO / 05", "Procedure for Corrective actions", "SAP", "01.01.19", "01.12.21"],
  ["IMS / PRO / 06", "Procedure for Preventive actions", "SAP", "01.01.19", "01.12.21"],
  ["IMS / PRO / 07", "Procedure for GDP", "SAP", "09.09.23"],
  ["GPPL/PSMS/M/02 - SECTION A", "HARA Manual - HARA TEAM", "Hard copy", "01.12.21", "01.10.22"],
  ["GPPL/PSMS/M/02 - SECTION B", "HARA Manual - HARA Team members selection criteria", "Hard copy", "01.12.21"],
  ["GPPL/PSMS/M/02 - SECTION C", "HARA Manual - HARA - Team leader appointment letter", "Hard copy", "01.12.21"],
  ["GPPL/PSMS/M/02 - SECTION D", "HARA Manual - HARA - Scope", "Hard copy", "01.12.21", "15.12.24"],
  ["GPPL/PSMS/M/02 - SECTION E", "HARA Manual - Product Descriptions & Intended Use", "Hard copy", "01.12.21", "15.12.24"],
  ["GPPL/PSMS/M/02 - SECTION F", "HARA Manual - Process flow diagram & on-site verification of Process flow diagram", "Hard copy", "01.12.21", "04.03.22", "01.10.22", "26.02.23", "15.12.24", "04.03.2025"],
  ["GPPL/PSMS/M/02 - SECTION G", "HARA Manual - Process Hazard Analysis", "Hard copy", "01.12.21", "26.02.23"],
  ["GPPL/PSMS/M/02 - SECTION G", "HARA Manual - Process Hazard Analysis (Flexible Packaging)", "Hard copy", "15.12.2024", "04.03.2025"],
  ["GPPL/PSMS/M/02 - SECTION H", "HARA Manual - RM, PM & Consumables Hazard Analysis", "Hard copy", "01.12.21", "01.01.22", "15.12.24"],
  ["GPPL/PSMS/M/02 - SECTION I", "HARA Manual -HARA - Plan (CCP)", "Hard copy", "01.01.19", "01.01.22", "15.12.24"],
  ["FLE/PR0/WP/01", "WORK PROCEDURE FOR PAPER SLITTING MACHINE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/02", "WORK PROCEDURE FOR BRISON INSPECTION MACHINE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/03", "WORK PROCEDURE FOR BRISON LABEL SLITTING MACHINE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/04", "WORK PROCEDURE FOR MANUAL Q.C. INSPECTION", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/05", "WORK PROCEDURE FOR PAPER CORE CUTTING MACHINE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/06", "WORK PROCEDURE FOR SLITTING MACHINE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/07", "WORK PROCEDURE FOR BATCH PRINTING MACHINE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/08", "WORK PROCEDURE FOR INK ANILOX ROLL KIT", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/09", "WORK PROCEDURE FOR ANILOX CLEANING MACHINE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/10", "WORK PROCEDURE FOR SHRINK SLEEVE CUTTING MACHINE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/11", "WORK PROCEDURE FOR SHRINK SLEEVE GLUING MACHINE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/12", "WORK PROCEDURE FOR GALLUS MACHINE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/13", "WORK PROCEDURE FOR PLATE MOUNTING MACHINE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/14", "WORK PROCEDURE FOR LOMBARDI MACHINE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/15", "WORK PROCEDURE FOR PRINTING MACHINE CLEANING", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/16", "WORK PROCEDURE FOR LIFT", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/17", "WORK PROCEDURE FOR CRANE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/18", "WORK PROCEDURE FOR DCMF MACHINE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/19", "WORK PROCEDURE FOR PUNCHING  MACHINE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/20", "WORK PROCEDURE FOR DCMF MACHINE", "Hard copy/ SAP", "01.01.22"],
  ["FLE/PR0/WP/21", "WORK PROCEDURE FOR KONICA MACHINE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["FLE/PR0/WP/22", "WORK PROCEDURE FORDIGITAL DIE CUTTER MACHINE", "Hard copy/ SAP", "01.02.2026"],
  ["QC/WP/01", "WORK PROCEDURE FOR GSM", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/02", "WORK PROCEDURE FOR BURSTING STRENGTH", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/03", "WORK PROCEDURE FOR BURST FACTOR", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/04", "WORK PROCEDURE FOR THICKNESS METER", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/05", "WORK PROCEDURE FOR  MOISTURE  MEASUREMENT", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/06", "WORK PROCEDURE FOR VISCOSITY MEASUREMENT", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/07", "WORK PROCEDURE FOR SHRINKAGE RATIO MEASUREMENT (PVC/PET FILM)", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/08", "WORK PROCEDURE FOR INK ROLL-UP KIT", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/09", "WORK PROCEDURE FOR RUB PROOFNESS TEST/SCUFFING TEST", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/10", "WORK PROCEDURE FOR DESICCATOR", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/11", "WORK PROCEDURE FOR SEAL STRENGTH TEST", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/12", "WORK PROCEDURE FOR PEEL STRENGTH TEST", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/16", "WORK PROCEDURE FOR COMPRESSIVE STRENGTH TESTER", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/18", "WORK PROCEDURE FOR COBB VALUE", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/19", "WORK PROCEDURE FOR PUNCTURE RESISTANCE TEST", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/20", "WORK PROCEDURE FOR EDGE CRUSH TEST (ECT)", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/21", "WORK PROCEDURE FOR GLOSS METER", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/22", "WORK PROCEDURE FOR SPECTROPHOTOMETER", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/24", "WORK PROCEDURE FOR LIGHT FASTNESS", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/25", "WORK PROCEDURE FOR GSM CUTTING PLATE CALIBRATION", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/26", "WORK PROCEDURE FOR WEIGHING BALANCE CALIBRATION", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/27", "WORK PROCEDURE FOR ADHESIVE GSM for Label", "Hard copy/ SAP", "01.01.19", "01.01.22"],
  ["QC/WP/28", "WORK PROCEDURE FOR ADHESIVE GSM for Laminates", "Hard copy/ SAP", "15.12.2024"],
  ["QC/WP/29", "Tape Test", "Hard copy/ SAP", "15.12.2024"],
  ["QC/WP/30", "Odour test", "Hard copy/ SAP", "15.12.2024"],
  ["QC/WP/31", "Dynes test", "Hard copy/ SAP", "15.12.2024"],
  ["QC/WP/32", "Bond strength test", "Hard copy/ SAP", "15.12.2024"],
  ["QC/WP/33", "COF", "Hard copy/ SAP", "15.12.2024"],
  ["QC/WP/34", "Dart Impack", "Hard copy/ SAP", "15.12.2024"],
  ["QC/WP/35", "Drop test", "Hard copy/ SAP", "15.12.2024"],
  ["QC/WP/36", "Leak test", "Hard copy/ SAP", "15.12.2024"],
  ["QC/WP/37", "Adhesive mixing", "Hard copy/ SAP", "15.12.2024"],
  ["QC/WP/38", "Dimension"],
  ["QC/ICM/SPEC/01", "SPECIFICATION: BOPP FILM", "SAP", "01.01.19", "16.02.22"],
  ["QC/ICM/SPEC/02", "SPECIFICATION: PAPER CORE", "SAP", "01.01.19", "16.02.22"],
  ["QC/ICM/SPEC/03", "SPECIFICATION: CORRUGATED BOX", "SAP", "01.01.19", "16.02.22"],
  ["QC/ICM/SPEC/04", "SPECIFICATION: FILMIC LABEL STOCK", "SAP", "01.01.19", "16.02.22"],
  ["QC/ICM/SPECS/05", "SPECIFICATION: LABEL STOCK", "SAP", "01.01.19", "16.02.22"],
  ["QC/ICM/SPEC/06", "SPECIFICATION: LAMINATION ADHESIVE", "SAP", "01.01.19", "16.02.22"],
  ["QC/ICM/SPEC/07", "SPECIFICATION: PVC + PET FILM", "SAP", "01.01.19", "16.02.22"],
  ["QC/ICM/SPEC/08", "SPECIFICATION: SOLVENT INK", "SAP", "01.01.19", "16.02.22"],
  ["QC/ICM/SPEC/09", "SPECIFICATION: UV INK", "SAP", "01.01.19", "16.02.22"],
  ["QC/ICM/SPEC/10", "SPECIFICATION: UV VARNISH", "SAP", "01.01.19", "16.02.22"],
  ["QC/ICM/SPEC/11", "SPECIFICATION: PET", "SAP", "15.12.2024"],
  ["QC/ICM/SPEC/12", "METPET", "SAP", "15.12.2024"],
  ["QC/ICM/SPEC/13", "BOPP FILM-TRANSPARENT", "SAP", "15.12.2024"],
  ["QC/ICM/SPEC/14", "FILM- MATT FINISH", "SAP", "15.12.2024"],
  ["QC/ICM/SPEC/15", "White METPET", "SAP", "15.12.2024"],
  ["QC/ICM/SPEC/16", "HS BOPP FILM- METALIZED", "SAP", "15.12.2024"],
  ["QC/ICM/SPEC/17", "POLY", "SAP", "15.12.2024"],
  ["QC/ICM/SPEC/18", "HS BOPP FILM", "SAP", "15.12.2024"],
  ["QC/ICM/SPEC/19", "BOPA", "SAP", "15.12.2024"],
  ["QC/ICM/SPEC/20", "FOIL", "SAP", "15.12.2024"],
  ["QC/ICM/SPEC/21", "CHROMO PAPER", "SAP", "15.12.2024"],
  ["QC/ICM/SPEC/22", "GLASSINE PAPER", "SAP", "15.12.2024"],
  ["RD / 01", "Chemical & Micro Control Programme", "Hard copy", "01.12.21", "15.12.24"],
  ["RD / 02", "Approved Internal Auditors List", "Hard copy", "01.12.21", "01.05.22", "01.10.23"],
  ["RD / 03", "Environment monitoring Risk assessment", "Hard copy", "01.12.21"],
  ["RD / 04", "Cleaning schedules", "Hard copy", "01.12.21", "01.01.24", "15.12.24"],
  ["RD / 05", "PRODUCT SAFETY PROTECTIVE CLOTHINGS", "Hard copy", "01.12.21", "15.12.24"],
  ["RD / 06", "Cleaning chemical mixing ratio", "Hard copy", "01.12.21"],
  ["RD / 07", "Plant Layout", "Hard copy", "01.12.21", "25.04.2022", "31.07.23", "01.01.24", "15.12.24", "01.09.25"],
  ["RD / 08", "Allergen matrix", "Hard copy", "01.12.21"],
  ["RD / 09", "List of Non - Production Chemicals", "Hard copy", "01.12.21"],
  ["RD / 10", "Organization chart", "Hard copy", "01.12.21", "01.08.22", "01.11.25"],
  ["RD / 11", "Allergen policy", "Hard copy", "01.12.21"],
  ["RD / 12", "VACCP", "Hard copy", "01.12.21"],
  ["RD / 13", "TACCP", "Hard copy", "01.12.21"],
  ["RD / 14", "Covid-19-Risk-Assessment", "Obsolete & Removed"],
  ["RD / 15", "PRODUCTSAFETY&QUALITY CULTURE POLICY", "Hard copy", "01.12.21"],
  ["RD / 16", "PRODUCTSAFETY&QUALITY CULTURE PLAN", "Hard copy", "01.12.21", "02.03.23"],
  ["RD / 17", "Master list of Shelf life & Storage Condition - Raw Materials", "Hard copy", "01.12.21", "15.12.24", "28.02.25"],
  ["RD / 18", "Allergens Risk Management", "Hard copy", "01.07.22"],
  ["RD / 19", "Whistle Blower Policy", "Hard copy", "01.09.22"],
  ["RD / 20", "Laundry Risk assessment", "Hard copy", "01.09.22", "01.12.24"],
  ["RD / 21", "Supplier risk assessment Criteria", "Hard copy", "01.10.22"],
  ["RD / 22", "GMP inspection risk assessment", "Hard copy", "01.04.23"],
  ["RD / 23", "SHARP METAL (STAPLERS PINS & BOARD PINS) RISK MANAGEMENT", "Hard copy", "01.04.23"],
  ["RD / 24", "Incoming Material Inspection Plan", "Hard copy", "01.12.21", "15.12.24"],
  ["RD / 25", "In-process Inspection Plan", "Hard copy", "01.12.21", "15.12.24"],
  ["RD / 26", "Finish Product Inspection Plan", "Hard copy", "01.12.21", "15.12.24"],
  ["RD/27", "Pest Control risk assesment", "Hard copy", "01.04.2025"],
  ["FLX/SOP/01", "Procedure for Disposition of Trademark materials", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/02", "Procedure for Usage & control of sharp", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/03", "Procedure for Finish Product Packing", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/04", "Procedure for Personal hygiene", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/05", "Procedure for Waste disposal", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/06", "Procedure for Control of Glass & Brittle Plastic", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/07", "Procedure for Access Control", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/08", "Procedure for Staff facilities", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/09", "Procedure for Housekeeping & Cleaning", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/10", "Procedure for Pest control", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/11", "Procedure for Transportation of Finish products", "Hard copy/ SAP", "01.12.21", "16.02.22"],
  ["FLX/SOP/12", "Procedure for Chemical & Biological control", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/13", "Procedure for Incoming material vehicle inspection", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/14", "Procedure for Area Line clearance", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/15", "Procedure for Identification & Traceability", "Hard copy/ SAP", "01.12.21", "16.02.22"],
  ["FLX/SOP/16", "COVID19 – EMERGENCY RESPONSE PLAN", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/17", "Procedure for Docket Management", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/18", "Procedure for Handling of Internally Rejected Raw Mterial", "Hard copy/ SAP", "01.12.21"],
  ["FLX/SOP/19", "Procedure for Gowning & Un-Gowning – Employee and Visitors", "Hard copy/ SAP", "01.07.22"],
  ["FLX/SOP/20", "Procedure for Emergency response for Fire Safety", "SAP", "01.12.21"],
  ["FLX/SOP/21", "Procedure for Ink Management System", "SAP", "01.12.21"],
  ["FLX/PRO/DISP/01", "Procedure for Dispatch", "SAP", "01.12.21"],
  ["FLX/PRO/HR/01", "Procedure for HR", "SAP", "01.12.21"],
  ["FLX/PRO/MNT/01", "Procedure for Maintenance", "SAP", "01.12.21"],
  ["FLX/PRO/PRD/01", "Procedure for Flexo Department", "SAP", "01.12.21"],
  ["FLX/PRO/PRD/02", "Procedure for Machine & parts cleaning", "SAP", "01.12.21"],
  ["FLX/PRO/PUR/01", "Procedure for Purchase", "SAP", "01.12.21"],
  ["FLX/PRO/QC/01", "Procedure for QC (Inspection & testing)", "SAP", "01.12.21"],
  ["FLX/PRO/QC/02", "Procedure for Calibration", "SAP", "01.12.21"],
  ["FLX/PRO/QC/03", "Procedure for Art work management", "SAP", "01.12.21"],
  ["FLX/PRO/MKT/01", "Procedure for Sales & Marketing", "SAP", "01.12.21"],
  ["FLX/PRO/MKT/02", "Customer Satisfaction", "SAP", "01.12.21"],
  ["FLX/PRO/MKT/03", "Procedure for Customer Complaints", "SAP", "01.12.21", "", "15.07.2026"],
  ["FLX/PRO/NPD/01", "Procedure for New Product Development", "SAP", "01.12.21"],
  ["FLX/PRO/STR/01", "Procedure for Store", "SAP", "01.12.21", "01.01.2025"],
  ["POUCH/SOP/01", "Procedure for Flexible Packaging", "SAP", "15.12.2025"],
  ["POUCH/WP/01", "Work Procedure for SB Lamination machine", "SAP", "15.12.2024"],
  ["POUCH/WP/02", "Work Procedure for  Slitting machine", "SAP", "15.12.2024"],
  ["POUCH/WP/03", "Work Procedure for Pouching process", "SAP", "15.12.2024"],
];

export const DOCUMENT_LIST_ROWS: Record<string, string>[] = DOCUMENT_LINES.map(([documentNumber, description, documentControl = "", ...revisions]) => ({
  documentNumber,
  description,
  documentControl,
  ...Object.fromEntries(DOCUMENT_LIST_REVISION_KEYS.map((key, i) => [key, revisions[i] ?? ""])),
}));

const DOCUMENT_LIST: LogSheetLayout = {
  documentId: "sys-document-list",
  headerFields: [],
  columns: [
    listColumn("documentNumber", "Document Number", 210),
    listColumn("description", "Document discription", 360),
    listColumn("documentControl", "Document Control", 140),
    ...DOCUMENT_LIST_REVISION_KEYS.map(revisionColumn),
  ],
  // A list that grows: a document is added as a new line, and a new list is
  // drafted from the whole of the last one.
  rowMode: { kind: "free", minRows: 1, typicalRows: 500 },
  footerFields: [{ key: "reviewedBy", label: "Reviewed & approved by :", type: "text", autoFill: { default: "PSTL" } }],
  specimenRows: DOCUMENT_LIST_ROWS,
  originalPages: [1, 2, 3, 4, 5].map((n) =>
    page(`fsys01-document-list-p${n}.jpg`, `F/SYS/01 (00/01.12.2021) — Master List of Documents (R-2025), page ${n} of 5, as supplied`)
  ),
  specimenSource:
    'F-SYS-01-Master List of Documents. (R-2025)..xlsx, sheet "GPPL - Doc list" — F/SYS/01 (00/01.12.2021), 173 documents, the plant\'s own entries; the PDF print supplied with it agrees cell for cell',
};

// ===========================================================================
// F/SYS/02 — MASTER LIST OF FORMATS & RECORDS
// ===========================================================================

type FormatLine = [
  formatNumber: string,
  description: string,
  rev0: string,
  rev1: string,
  rev2: string,
  rev3: string,
  methodOfRecording: string,
  retentionPeriod: string,
  methodOfDisposition: string,
];

/**
 * F/SYS/02 AS THE COMPANY'S WORKBOOK HOLDS IT — sheet "GPPL - Formats list",
 * the list "Maintain as updated": 141 formats, cell for cell. Each line: Format
 * Number, Format  discription, revisions 0 to 3, Method of Recording, Retention
 * Period, Method of Disposition.
 *
 * WHERE THE SUPPLIED PRINT (the PDF, 135 formats) DIFFERS. The workbook is the
 * later of the two and is what is on file; the print is shown beside the form.
 * "WB" is the workbook's Sr.No, "print" the print's:
 *   F-SYS-14 (WB 13, print 13) and F-SYS-15 (WB 14, print 14) — revision 1
 *     "01.04.2025"; the print has none.
 *   F-MKT-03 (WB 19, print 19) — "Customer complaint Form (CAPA report)", filled
 *     red; the print: "Customer complaint Form".
 *   F-MKT-05 (WB 21) "Customer complaint handling checklist", revision 0
 *     "21.07.26", and F-MKT-06 (WB 22) "Complaint Acknowldgement form",
 *     revision 0 "01.07.2026" — not on the print, and neither has a Method of
 *     Recording, Retention Period or Method of Disposition. From here the
 *     workbook's numbers run two ahead of the print's.
 *   F-QC-15 - A to G (WB 46 to 52, print 44 to 50) — revision 0 "16.02.22";
 *     the print: "01.12.21". The workbook agrees with the forms' own pages:
 *     F/QC/15-A and C to G print "(00 / 16.02.2022)" (15-B was not supplied).
 *   F-QC-39 (WB 65, print 63) — Method of Recording "SAP"; the print leaves it
 *     blank. Both leave its Retention Period and Method of Disposition blank.
 *   F-QC-40. A (WB 66, print 64) — a third revision, "01.07.2026", and "Hard
 *     copy", "3 Years", "Shredding"; the print has none of the four.
 *   F-QC-40. B and C (WB 67 and 68, print 65 and 66) — "Hard copy", "3 Years",
 *     "Shredding"; the print leaves all three blank.
 *   F-QC-41 (WB 69, print 67) — "Obsolate on 25.06.25", merged across Method of
 *     Recording to Method of Disposition; the print: "Obsolate-24.06.25", in the
 *     Retention Period column alone, and a day earlier.
 *   F-QA-01 (WB 70, print 68) — "SAP/ Hard copy"; the print: "Hard copy".
 *   F-PRD-06 and F-PRD-07 (WB 76 and 77, print 74 and 75) — revision 1
 *     "01.09.2026"; the print has none.
 *   F-PRD-09 (WB 79, print 77) — "Prepress Specification", "01.10.22", "SAP/
 *     Hard copy"; the print: "Packing Label.", "01.12.21", "Hard copy".
 *   F-PRD-13 (WB 83, print 81) — "Packing Label", "01.12.21", "SAP/ Hard copy";
 *     the print: "Prepress Specification", "01.10.22", "Hard copy". Between the
 *     two, F-PRD-09's and F-PRD-13's descriptions and dates are swapped.
 *   F-PRD-14.A, 14.B and 14.E (WB 84 to 86, print 82 to 84) — "SAP/ Hard
 *     copy"; the print: "Hard copy".
 *   F-PRD-15 and F-PRD-16 (WB 87 and 88, print 85 and 86) — "SAP"; the print:
 *     "Hard copy".
 *   F-PRD- 17. A (WB 89, print 87) — "Merged in one sheet" in revision 2,
 *     merged down 17. A to C and filled red; the print leaves those cells blank.
 *   F-PRD-26 (WB 100, print 98) — revision 1 "23.07.2025"; the print has none.
 *   F-PRD-27 to F-PRD-30 (WB 101 to 104) — "Rewinding with LC- SS" and
 *     "Slitting  with LC- SS" (01.09.2026), "Shrink Sleeve  Post press process
 *     checklist" (10.07.2026), "Gluing adhesive mixing ratio" (17.08.2026) — not
 *     on the print, and without a Method of Recording, Retention Period or
 *     Method of Disposition. From here the workbook runs six ahead.
 *   F-MNT-09 (WB 114, print 108) — revision 1 "15.12.2024", revision 2
 *     "01.09.2025"; the print: revision 1 blank, revision 2 "15.12.2024". The
 *     workbook agrees with F/MNT/09's own page, "(02 / 01.09.2025)".
 *   F-MNT-11 (WB 116, print 110) — revision 1 "15.12.2024", filled red; the
 *     print has none. F/MNT/11's own page is "01/15.12.2024".
 *   F-HR-15 and F-HR-16 (WB 131 and 132, print 125 and 126) — revision 1
 *     "15.12.24"; the print: "15.01.25".
 *   F-HR-20 (WB 136, print 130) — "Product Safety Culture Survey"; the print:
 *     "HARA pri".
 * Every other cell of the 135 printed lines is the same in both.
 */
const FORMAT_LINES: FormatLine[] = [
  ["F-SYS-01", "Master List of Document", "01.12.21", "", "", "", "Hard copy", "3 Years", "Maintain as updated"],
  ["F-SYS-02", "Master List of Formats & Records", "01.12.21", "", "", "", "Hard copy", "3 Years", "Maintain as updated"],
  ["F-SYS-03", "Document change request & approval note", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-SYS-04", "Management review meeting agenda &  record", "01.12.21", "", "", "", "SAP", "3 Years", "Shredding"],
  ["F-SYS-05", "Internal Audit schedule", "01.12.21", "01.03.23", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-SYS-06", "Internal audit plan", "01.12.21", "01.03.23", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-SYS-07", "Internal Audit Risk assessment", "01.12.21", "01.03.23", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-SYS-08", "Internal Audit Findings & observation Report", "01.12.21", "01.03.23", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-SYS-10", "Internal audit NC report", "01.12.21", "01.03.23", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-SYS-11", "Non Conformance & Corrective Action Report", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-SYS-12", "Monthly HARA Verification", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-SYS-13", "Mock Product Withdrawal record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-SYS-14", "Backward Traceability Record", "01.12.21", "01.04.2025", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-SYS-15", "Forward Traceability Record", "01.12.21", "01.04.2025", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-SYS-16", "Quality & Product Safety objectives", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-SYS-17", "Site security risk assessment record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MKT-01", "Customer Feedback Form", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MKT-02", "Customer Feedback analysis", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MKT-03", "Customer complaint Form (CAPA report)", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MKT-04", "Complaint trend analysis", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MKT-05", "Customer complaint handling checklist", "21.07.26", "", "", "", "", "", ""],
  ["F-MKT-06", "Complaint Acknowldgement form", "01.07.2026", "", "", "", "", "", ""],
  ["F-PUR-01", "Supplier registration form", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PUR-02", "Supplier audit & visit report", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PUR-03", "List of Approved Suppliers", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PUR-04", "Purchase Order", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PUR-05", "RM & PM Supplier performance monitoring", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PUR-06", "Service provider performance monitoring", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-STR-01", "Incoming Material & Vehicle inspection Record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-STR-02", "Sharp metal objects issuance & replacement record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-01", "Inspection record for BOPP Film", "01.12.21", "16.2.2022", "", "", "SAP", "3 Years", "Shredding"],
  ["F-QC-02", "Inspection record for CORRUGATED BOX", "01.12.21", "16.2.2022", "", "", "SAP", "3 Years", "Shredding"],
  ["F-QC-03", "Inspection record for Label stock", "01.12.21", "16.2.2022", "", "", "SAP", "3 Years", "Shredding"],
  ["F-QC-04", "Inspection record for Paper core", "01.12.21", "16.2.2022", "", "", "SAP", "3 Years", "Shredding"],
  ["F-QC-05", "Inspection record for PVC+PET Film", "01.12.21", "16.2.2022", "", "", "SAP", "3 Years", "Shredding"],
  ["F-QC-06", "Certificate of analysis (COA)-Label", "01.12.21", "", "", "", "SAP", "3 Years", "Shredding"],
  ["F-QC-07", "Certificate of analysis (COA)-Sleeve", "01.12.21", "", "", "", "SAP", "3 Years", "Shredding"],
  ["F-QC-08", "MASTER LIST OF CALIBRATION INSTRUMENTS", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-09", "Statement of Compliance (SOC) - Label", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-10", "Statement of Compliance (SOC) - Sleeve", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-11", "GSM cutting plate internal calibration record", "01.12.21", "01.01.22", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-12", "Weighing balance internal calibration record", "01.12.21", "01.01.22", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-13", "IPQC - PRINTING", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-14", "TEST RELIABILITY RECORD", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-15", "Area Line Clearance format", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-15 - A", "Area Line Clearance - PRINTING", "16.02.22", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-15 - B", "Area Line Clearance - PUNCHING", "16.02.22", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-15 - C", "Area Line Clearance - QC MACHINE INSPECTION", "16.02.22", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-15 - D", "Area Line Clearance - QC MANUAL INSPECTION", "16.02.22", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-15 - E", "Area Line Clearance - SLITTING", "16.02.22", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-15 - F", "Area Line Clearance - SHRINK SLEEVE GLUING", "16.02.22", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-15 - G", "Area Line Clearance - SHRINK SLEEVE CUTTING", "16.02.22", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-16", "OBSOLETE ARTWORK & SHADE CARD RECORD", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-17", "Scale / Ruler internal calibration record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-21", "_Inspection record for Flexo Ink", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-30", "Lamination Adhesive Viscosity Record", "15.12.2024", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-31", "COA Pouch", "15.12.2024", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-32", "Adhesive mixing ratio", "15.12.2024", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-33", "INSPECTION RECORD – INCOMING LAMINATION GRADE FILM", "15.12.2024", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-34", "INSPECTION RECORD – LAMINATION GRADE PRINTED FILM", "15.12.2024", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-35", "SLITTING - LAMINATION GRADE FILM", "15.12.2024", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-36", "SOLVENT BASE LAMINATION FILM", "15.12.2024", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-37", "INSPECTION RECORD –  POUCHING PROCESS", "15.12.2024", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-38", "Statement of Compliance (SOC) - Flexible packaging materials (Laminated Pouch & Rolls)", "24.02.2025", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-39", "FGPO Specification", "15.12.2024", "", "", "", "SAP", "", ""],
  ["F-QC-40. A", "Temperature Monitoring record - Printing machine, Ink kitchen, Ware house", "01.12.21", "28.02.25", "01.07.2026", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-40. B", "Temperature Monitoring record - Sleeve Division", "28.02.25", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-40. C", "Temperature Monitoring record - Hotroom", "28.02.25", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-QC-41", "Curing time monitoring record", "28.02.25", "", "", "", "Obsolate on 25.06.25", "", ""],
  ["F-QA-01", "Traceability Report", "01.11.22", "", "", "", "SAP/ Hard copy", "3 Years", "Shredding"],
  ["F-PRD-01", "Flexo Printing Production Register", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-02", "Punching Production Register", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-03", "On-line QC Inspection Register", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-04", "Off-line QC Inspection Register", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-05", "Slitting Production Register", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-06", "Shrink sleeve Gluing Register", "01.12.21", "01.09.2026", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-07", "Shrink Sleeve cutting Production Register", "01.12.21", "01.09.2026", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-08", "Dispatch Card", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-09", "Prepress Specification", "01.10.22", "", "", "", "SAP/ Hard copy", "3 Years", "Shredding"],
  ["F-PRD-10", "Sharp metal object Daily Issue & Return monitoring record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-11", "Surgical Machine Blade Change Record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-12", "Razor Blade Change Record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-13", "Packing Label", "01.12.21", "", "", "", "SAP/ Hard copy", "3 Years", "Shredding"],
  ["F-PRD-14.A", "Job Card - LABEL", "01.10.22", "", "", "", "SAP/ Hard copy", "3 Years", "Shredding"],
  ["F-PRD-14.B", "Job Card - SLEEVE", "01.10.22", "", "", "", "SAP/ Hard copy", "3 Years", "Shredding"],
  ["F-PRD-14.E", "Job Card - POUCH", "01.10.24", "", "", "", "SAP/ Hard copy", "3 Years", "Shredding"],
  ["F-PRD-15", "QC- wastage tracking record", "10.05.2023", "", "", "", "SAP", "3 Years", "Shredding"],
  ["F-PRD-16", "Production issues Analysis", "10.05.2023", "", "", "", "SAP", "3 Years", "Shredding"],
  ["F-PRD- 17. A", "Ink Formulation record- Label", "", "", "Merged in one sheet", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD- 17. B", "Ink Formulation record- Sleeve", "", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD- 17. C", "Ink Formulation record- Pouch", "", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-18", "SOLVENT BASE LAMINATION - ALC & PRODUCTION REPORT", "15.12.2024", "25.06.25", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-19", "SOLVENT BASE LAMINATION - PROCESS PARAMETER RECORD", "15.12.2024", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-20", "SLITTING - ALC & PRODUCTION REPORT", "15.12.2024", "25.06.25", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-21", "Area Line clearance record - POUCHING", "15.12.2024", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-22", "Blade Change Record - All Pouching machine", "15.12.2024", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-23", "Manual cutter Daily Issue & Return monitoring record", "15.12.2024", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-24", "Razor Blade Change Record - Laminated FIlms Slittig machine", "15.12.2024", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-25", "POUCHING - PROCESS PARAMETER RECORD", "15.12.2024", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-26", "DOCTORING - ALC & PRODUCTION REPORT", "15.12.2024", "23.07.2025", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-PRD-27", "Rewinding with LC- SS", "01.09.2026", "", "", "", "", "", ""],
  ["F-PRD-28", "Slitting  with LC- SS", "01.09.2026", "", "", "", "", "", ""],
  ["F-PRD-29", "Shrink Sleeve  Post press process checklist", "10.07.2026", "", "", "", "", "", ""],
  ["F-PRD-30", "Gluing adhesive mixing ratio", "17.08.2026", "", "", "", "", "", ""],
  ["QA-PRO-FL-CCT-01", "Camera Challenge Test", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MNT-01", "List of Equipments", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MNT-02", "Preventive maintenance plan & record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MNT-03", "Yearly PM Schedule", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MNT-04", "Daily Equipment Health Status & Cleaning Record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MNT-05", "Breakdown intimation Slip", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MNT-06", "Equipment breakdown record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MNT-07", "Temporary engineering record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MNT-08", "New Equipment Installation & commissioning record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MNT-09", "List of Glass articles & weekly Glass Breakage monitoring record", "01.12.21", "15.12.2024", "01.09.2025", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MNT-10", "Weekly Wooden article condition monitoring record", "01.12.21", "", "15.12.2024", "", "Hard copy", "3 Years", "Shredding"],
  ["F-MNT-11", "Lux measurement record", "01.12.21", "15.12.2024", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-01", "Personal competence record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-02", "Personnel competence criteria", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-03", "Operator skill matrix", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-04", "Pre Employment Health declaration.", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-05", "Induction Training  programme-Staff", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-06", "Induction Training  programme -Operators", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-07", "Job responsibility & authorities", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-08", "Employee wise Training need identification Record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-09", "Training Calendar", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-10", "Training Imparted Record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-11", "Training Evaluation Record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-12", "TRAINING EFFECTIVENESS EVALUATION RECORD", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-13", "Authorization for Mobile Inside Plant", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-14", "Visitor health declaration record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-15", "Daily cleaning record", "01.12.21", "15.12.24", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-16", "Monthly Cleaning record", "01.12.21", "15.12.24", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-17", "Daily pest Control monitoring Record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-18", "Fly Catcher Inspection & Cleaning Record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-19", "Monthly GMP Inspection record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-20", "Product Safety Culture Survey", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-21", "Product Safety Culture Survey analysis record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-HR-22", "Daily Employee Sanitation & Hygiene record", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-DISP-01", "Safe transportation agreement", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-DISP-02", "Container stuffing & Vehicle Inspection Report", "01.12.21", "", "", "", "Hard copy", "3 Years", "Shredding"],
  ["F-DISP-04", "Vehicle cleaning Protocol & Record", "16.02.22", "", "", "", "Hard copy", "3 Years", "Shredding"],
];

export const FORMAT_LIST_ROWS: Record<string, string>[] = FORMAT_LINES.map(
  ([formatNumber, description, rev0, rev1, rev2, rev3, methodOfRecording, retentionPeriod, methodOfDisposition]) => ({
    formatNumber,
    description,
    rev0,
    rev1,
    rev2,
    rev3,
    methodOfRecording,
    retentionPeriod,
    methodOfDisposition,
  })
);

const FORMAT_LIST: LogSheetLayout = {
  documentId: "sys-format-list",
  headerFields: [],
  columns: [
    listColumn("formatNumber", "Format Number", 140),
    // Headed as the workbook heads it, with its two spaces.
    listColumn("description", "Format  discription", 400),
    ...FORMAT_LIST_REVISION_KEYS.map(revisionColumn),
    listColumn("methodOfRecording", "Method of Recording", 150, REVISIONS),
    listColumn("retentionPeriod", "Retention Period", 110, REVISIONS),
    listColumn("methodOfDisposition", "Method of Disposition", 160, REVISIONS),
  ],
  rowMode: { kind: "free", minRows: 1, typicalRows: 500 },
  footerFields: [{ key: "reviewedBy", label: "Reviewed & approved by :", type: "text", autoFill: { default: "PSTL / M.R." } }],
  specimenRows: FORMAT_LIST_ROWS,
  originalPages: [1, 2, 3, 4, 5].map((n) =>
    page(
      `fsys02-format-list-p${n}.jpg`,
      `F/SYS/02 (00/01.12.2021) — Master List of Formats & Records: the EARLIER PRINT supplied with the workbook (135 formats), page ${n} of the list's 5`
    )
  ),
  specimenSource:
    'F-SYS-02-Master List of Formats. (R-2025)..xlsx, sheet "GPPL - Formats list" — F/SYS/02 (00/01.12.2021), the company\'s workbook as last updated: 141 formats, the plant\'s own entries. The PDF supplied with it is an earlier print (135 formats), shown beside the form',
};

// ===========================================================================
// F/SYS/03 — DOCUMENT CHANGE REQUEST & APPROVAL NOTE (Rev No: 01, 01.12.2021)
//
// THE FORM IS ALL BOXES, so it declares no columns and the record view draws no
// grid. The dotted rule across the page divides it in two, and the division is
// kept: the requester's half above the rule is the boxes above the grid, the
// PSTL's half below it the boxes below. Beyond that, as boxes:
//   * "This is a request for" prints three tick boxes. A request is one of the
//     three, so it is one choice offering the three printed words.
//   * The "Current document no." row and the "Document Title" table are printed
//     as label | blank pairs; each pair is a box. The small italic note under
//     "Current document no." belongs to that box and is in its label.
//   * The "Change requested by" row prints Name, Designation and Sign as cells
//     of one row, so each box carries the row's heading in front of its label.
//   * "Change request verified by (Sign.) ________ (PSTL)" is one box whose
//     label holds both printed parts.
//   * "Change / Introduction / Removal request approved   Yes / No" prints the
//     two words to strike or ring; here it is a yes/no box.
//   * The header band — "Format No.:" (empty on the paper), "Rev No: 01",
//     "Date: 01.12.2021", "Page No. : 1 Of 1" — is the document header the app
//     prints, not a box.
// Who asks for a change differs from request to request, so the assistant
// fills in nothing about the requester, the document or the change; it dates
// the request and signs the verification for the PSTL, whose box that is. The
// PSTL's comments, the approval and its date are the PSTL's decision, never
// pre-filled.
// ===========================================================================

const CHANGE_REQUESTED_BY = "Change requested by";

const DOCUMENT_CHANGE: LogSheetLayout = {
  documentId: "sys-document-change",
  instructions: ["DOCUMENT CHANGE / INTRODUCTION / REMOVAL REQUEST NOTE"],
  headerFields: [
    {
      key: "requestType",
      label: "This is a request for",
      type: "select",
      options: ["Existing Document Change", "New Document Introduction", "Existing Document Removal"],
    },
    { key: "dateOfChangeRequest", label: "Date of Change request:", type: "date", required: true, autoFill: { dueDate: true } },
    { key: "currentDocumentNo", label: "Current document no. (Not Applicable for New Document Introduction)", type: "text" },
    { key: "currentRevisionNo", label: "Current Revision no.", type: "text" },
    { key: "currentDate", label: "Current Date", type: "date" },
    { key: "documentTitle", label: "Document Title", type: "text" },
    { key: "documentNo", label: "Document no.", type: "text" },
    { key: "revisionNo", label: "Revision no.", type: "text" },
    { key: "effectiveDate", label: "Effective date", type: "date" },
    { key: "descriptionOfChange", label: "Description of change", type: "paragraph" },
    { key: "reasonForChange", label: "Reason for the Change / Introduction / Removal of Document", type: "paragraph" },
    { key: "requestedByName", label: `${CHANGE_REQUESTED_BY} — Name`, type: "text" },
    // "Designation" holds the letters "sign", which would have the box offer
    // the employees' names; a designation is not a person, so it offers none.
    { key: "requestedByDesignation", label: `${CHANGE_REQUESTED_BY} — Designation`, type: "text", list: "" },
    { key: "requestedBySign", label: `${CHANGE_REQUESTED_BY} — Sign`, type: "text" },
  ],
  columns: [],
  rowMode: { kind: "single" },
  footerFields: [
    { key: "verifiedBy", label: "Change request verified by (Sign.) (PSTL)", type: "text", autoFill: { sign: true } },
    { key: "pstlComments", label: "Product safety team leader’s comments if any", type: "paragraph" },
    { key: "requestApproved", label: "Change / Introduction / Removal request approved", type: "yesno" },
    { key: "dateOfApproval", label: "Date of approval & implementation:", type: "date" },
  ],
  // THE FORM WAS SUPPLIED BLANK, so this is a plainly made-up SAMPLE request,
  // never a record of one: a change to F/SYS/12's reference list. Its numbers
  // and dates are real — F/SYS/12 is at Rev 00 of 01.12.2021, and its
  // attribute 19 cites "F/SA/03", a number F/SYS/02 does not hold (the customer
  // complaint form is F-MKT-03 there) — but no such request was made. Nothing
  // is invented about who asked or when it takes effect, and the PSTL's half
  // is left for the PSTL.
  specimenHeader: {
    requestType: "Existing Document Change",
    currentDocumentNo: "F/SYS/12",
    currentRevisionNo: "00",
    currentDate: "2021-12-01",
    documentTitle: "Monthly HARA Verification",
    documentNo: "F/SYS/12",
    revisionNo: "01",
    descriptionOfChange:
      'Sample — Reference documents / records of attribute 19, "Any customer complaints received?": F/MKT/03 (Customer complaint Form) in place of F/SA/03.',
    reasonForChange: "Sample — F/SA/03 is not on the Master List of Formats & Records (F/SYS/02); the customer complaint form is F-MKT-03 there.",
  },
  originalPages: [page("fsys03-document-change-request-p1.jpg", "F/SYS/03 (Rev No: 01, Date: 01.12.2021) — Document Change Request & Approval Note, the blank format as supplied")],
  specimenSource:
    'F-SYS-03-Document change request & approval note.pdf — F/SYS/03 (Rev No: 01, Date: 01.12.2021), the blank format, supplied 25-Sep-2026. Nothing about a real request came with it, so the specimen is a plainly made-up "Sample" request — a change to F/SYS/12\'s reference list.',
};

export const SYS_DOCUMENT_CONTROL_LAYOUTS: Record<string, LogSheetLayout> = {
  [DOCUMENT_LIST.documentId]: DOCUMENT_LIST,
  [FORMAT_LIST.documentId]: FORMAT_LIST,
  [DOCUMENT_CHANGE.documentId]: DOCUMENT_CHANGE,
};
