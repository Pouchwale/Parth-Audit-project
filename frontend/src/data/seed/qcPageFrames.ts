import type { PageFrame } from "../../types";
import { INCOMING_ADDRESS } from "./qcIncomingLayouts";

// THE FRAMED PAGE OF THE QC PAPERS (REQUIREMENTS §117, QC visual parity, 20-Oct-2026). The owner: "I need same format in
// my audit software in QC module. Nothing more or less than that." These papers (Word files the owner printed to PDF) are
// drawn the same way: a page frame, the company's logo and the title in a heavy-bordered band, the Format number and the
// Page number in a bordered line and the address at the foot of the page. The documents are named here, so the header
// block every other module prints is untouched (the regression guard of tests/qc_visual holds it to that).
//
// Where the title starts in its cell is the paper's own: the incoming inspection records start it at the left of the
// cell; the minutes, the analysis reports and the destruction record centre it.

const left: PageFrame = { titleAlign: "left" };
const centre: PageFrame = { titleAlign: "center" };
// The analysis reports, the minutes and the destruction record print the same address at the foot of the page, which their layouts do not hold.
const reportCentre: PageFrame = { titleAlign: "center", address: INCOMING_ADDRESS };
// F/QC/20's destruction record sets its title in black, 18 pt.
const plainTitle: PageFrame = { titleAlign: "center", title: { size: 18, color: "#000" }, address: INCOMING_ADDRESS };

export const QC_PAGE_FRAMES: Record<string, PageFrame> = {
  "qc-bopp-film": left,
  "qc-corrugated-box": left,
  "qc-label-stock": left,
  "qc-paper-core": left,
  "qc-pvc-pet-film": left,
  "qc-offset-ink": left,
  "qc-duplex-board": left,
  "qc-incoming-lamination-film": left,
  "qc-inspection-sb-lamination": left,
  "qc-kraft-paper": centre,
  "qc-lamination-adhesive-inspection": centre,
  "qc-side-pasting-adhesive": centre,
  "qc-starch-powder": centre,
  "qc-sheet-pasting-powder": centre,
  "qc-analysis-report": reportCentre,
  "qc-utility-test-report": reportCentre,
  "qc-minutes-of-meetings": reportCentre,
  "qc-printing-aids-destruction": plainTitle,
};

/** The framed page a document is printed on, or undefined (every other document's page is as it was). */
export const pageFrameFor = (documentId: string): PageFrame | undefined => QC_PAGE_FRAMES[documentId];
