// THE PEST CONTROL SERVICE REPORT AS THE CONTRACTOR'S PAPER DRAWS IT (the owner, 17-Oct-2026, with the contractor's
// "Service Report- March 2026.pdf" and the "Service Report-April 2026.xls" it prints from: one Excel sheet, Calibri,
// six columns, the same grid for the three services). One place for the sheet's measures, read by the page
// (components/records/ServiceReportRecordView.tsx, which prints it) and by the Excel download (the table carries
// them as data-xl-* attributes, utils/documentExport.ts reads them).

/** The contractor's column widths, in Excel characters: Sl.No, Area, Material, Qty, Method, Remarks. */
export const SERVICE_PAPER_COLUMNS = [9.29, 32.86, 18.29, 12.86, 15, 15.86];

/** CSS pixels a screen draws for one Excel character at the paper's print scale (the PDF's columns, 569 px across). */
export const SERVICE_PAPER_PX_PER_CHAR = 5.528;

/**
 * The paper's title and the pests its Service Name cell names, one line under the service (the contractor's own
 * words: "Rodent Control Service (Rat,Mice,Bandicoots)", "(Red & Black Ants, Cockroaches)", "(House Fly)").
 */
export const SERVICE_PAPER_TITLE = "Pest control Service Report";
export const SERVICE_PAPER_PESTS: Record<string, string> = {
  "Rodent Control Service": "(Rat,Mice,Bandicoots)",
  "General Pest Control Services": "(Red & Black Ants, Cockroaches)",
  "Fly Control Services": "(House Fly)",
};

/** The labels printed in the sheet, as the paper writes them. */
export const SERVICE_PAPER_LABELS = {
  provider: "GURUDEV PEST CONTROL",
  serviceName: "Service Name",
  date: "Date",
  unit: "Unit:",
  headings: ["Sl.No", "Area of Pesticide Applied", "Material Name", "Qty used Nos/Grams", "Method of Application", "Remarks"],
  technician: "GPC Technician Sign",
  customer: "Customer's representative sign",
} as const;

/**
 * Areas the contractor's March-2026 sheet gives a row two lines tall although the name is one line (the row height
 * was set by hand in the workbook). The rest of the paper's rows follow their words.
 */
export const SERVICE_PAPER_TALL_AREAS: Record<string, string[]> = {
  // The two one-line names the workbook gave a tall row, and the four names that run to two lines on the paper (each row 22 pt).
  "Rodent Control Service": [
    "Anilox cleaning area - Ground floor",
    "First floor - Shrink Sleeve production",
    "Store - Label stock & PVC / PET Films - Ground floor",
    "RM Inward & FG Dispatch room - Ground floor",
    "First floor - Offline punching & QC Inspection",
    "Change room & Locker room - Ground Floor",
  ],
};

/** Names the workbook breaks one word earlier than the browser would (Excel measures its text a little wider): their cell keeps a wider right margin. */
export const SERVICE_PAPER_NARROW_AREAS: Record<string, string[]> = {
  "Rodent Control Service": ["Store - Label stock & PVC / PET Films - Ground floor"],
};

/** The paper's date as it writes it: 07.03.2026. */
export function servicePaperDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}
