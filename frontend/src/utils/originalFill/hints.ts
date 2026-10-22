import type { FillHints } from "./types";

// PER-DOCUMENT HELP FOR THE FILLER, ONLY WHERE THE GENERIC MATCHER CANNOT TELL (REQUIREMENTS §119). Each with its reason.
// Kept few: every other document is placed by its words alone (utils/originalFill/xlsxFill.ts, docxFill.ts).
export const FILL_HINTS: Record<string, FillHints> = {
  // F/HR/07: the paper prints no heading over the position's responsibilities - one to a row of its first table, under the
  // Position row (rows 2 to 11); and the owner's Word file holds five filled position sheets of the one form, the first being
  // the paper and the other four his examples (REQUIREMENTS §98), left out from the third table on.
  "hr-job-responsibility": {
    gridRows: { 0: { table: 0, from: 1, to: 10, cols: { 1: 0 } } },
    cutFromTable: 2,
  },
  // F/HR/21: the paper works the overall result out in N20, under its Achieved column after the last attribute, and prints
  // no label for it; DCRS's "Overall achieved" goes there.
  "hr-psc-survey-analysis": { cellOf: { "Overall achieved": "N20" } },
  // F/SYS/12: DCRS heads its meeting date with the record's title; the paper's place for it is its "Review date: -".
  "sys-hara-monthly": { labelAs: { "MONTHLY REVIEW & HARA VERIFICATION MEETING RECORD –": "Review date" } },
  // F/DISP/01: the agreement's period is written inside its own sentence ("valid for the period of 01.04.2025 to 31.03.2026"),
  // the owner's dates being his example: DCRS's contract dates take their place.
  "disp-safe-transporter-agreement": { exampleOf: { "01.04.2025": "Contract valid from", "31.03.2026": "Contract valid to" } },
  // F/SYS/13: the product's details have one box on the paper, "Information of the product (Information that we are looking
  // for)", and the customer's answer one, "Response from Customer": each value a line in its box, as a person writes there.
  "sys-mock-recall": {
    areaOf: {
      "Information of the product": ["FG code", "Production order number", "Sales order number", "Job name", "Dispatch Date", "Invoice number", "Dispatched Quantity", "Mock Recall scenario considered"],
      "Response from Customer": ["Telephonic conversation"],
    },
  },
  // F/SYS/11: DCRS joins the note printed above the root cause's box to its label; the paper's box is headed by the label alone.
  "sys-nc-car": {
    labelAs: { "Note : The following Root Cause Analysis shall be done by the Auditee for the Detected Non-Conformance only. ROOT CAUSE(S) (Carryout a Root Cause Analysis in terms of WHY attributing to as follows,": "ROOT CAUSE(S) (Carryout a Root Cause Analysis in terms of WHY attributing to as follows," },
  },
  // F/SYS/10: DCRS keeps one "correction & corrective action" box; the paper prints CORRECTION ACTION and CORRECTIVE ACTION
  // side by side - the value goes under CORRECTIVE ACTION.
  "sys-audit-nc": {
    labelAs: { "CORRECTION & CORRECTIVE ACTION (Action Taken to Prevent Recurrence) (Mention in detail the actions taken to prevent the recurrence of this detected problem based on the Root Cause Analysis carried out above. Please mention here only those actions which have been taken and found effective after implementing": "CORRECTIVE ACTION" },
  },
  // F/PUR/01: DCRS joins each heading to the note printed under it ("... OFFERED (Please attach a separate sheet if
  // required)"); the paper's place for the answer is under its heading.
  "pur-supplier-registration": {
    labelAs: {
      "RANGE OF PRODUCTS / SERVICES OFFERED (Please attach a separate sheet if required)": "RANGE OF PRODUCTS / SERVICES OFFERED",
      "LIST OF MAJOR CUSTOMERS (Attach separate sheet if required)": "LIST OF MAJOR CUSTOMERS",
      "DETAILS OF QUALITY CONTROL DEPARTMENT (PROVIDE DETAILS OF TESTING FACILITY, TEST METHODS) (Please attach a separate sheet if required)":
        "DETAILS OF QUALITY CONTROL DEPARTMENT (PROVIDE DETAILS OF TESTING FACILITY, TEST METHODS)",
      "If new supplier/new product, type of Assessment Status: (Please attach status report)": "If new supplier/new product, type of Assessment Status",
      // the second box of "NO. OF EMPLOYEES : Technical [ ] Non-Technical [ ]": by its own word on that line
      "NO. OF EMPLOYEES : Non-Technical": "Non-Technical",
    },
  },
  // F/DISP/02: the owner's Word form is in Gujarati (its header in English) while the page shows the same boxes in English:
  // each box and heading by the paper's own Gujarati words, box for box in the paper's order. The checklist's lines keep the
  // paper's Gujarati wording (DCRS's English is not an edit of it).
  "disp-container-stuffing": {
    labelAs: {
      Date: "તારીખ",
      "Customer's name": "ગ્રાહકનું નામ",
      "Invoice No.": "ઇન્વોઇસ નં.",
      "Internal PO number": "આંતરિક પીઓ નંબર",
      "Driver's name": "ડ્રાઈવરનું નામ",
      "Customer PO number": "ગ્રાહક પીઓ નંબર",
      "Transporter's name": "ટ્રાન્સપોર્ટરનું નામ",
      "Vehicle No.": "વાહન નં.",
      "Sr. No.": "ક્રમ નં.",
      Checklist: "ચેકલિસ્ટ",
      "Compliance (strike NA out)": "પાલન",
      "If there are any other observations": "જો કોઈ અન્ય અવલોકનો હોય",
      "(Dispatch In charge) Product release authorisation — Name": "(ડિસ્પેચ ઇન્ચાર્જ) પ્રોડક્ટ રિલીઝ ઓથોરાઇઝેશન — નામ",
      "(Dispatch In charge) Product release authorisation — Designation": "(ડિસ્પેચ ઇન્ચાર્જ) પ્રોડક્ટ રિલીઝ ઓથોરાઇઝેશન — હોદ્દો",
      "(Dispatch In charge) Product release authorisation — Sign": "(ડિસ્પેચ ઇન્ચાર્જ) પ્રોડક્ટ રિલીઝ ઓથોરાઇઝેશન — સાઇન",
      "Checked and approved by (QC) — Name": "(QC) દ્વારા ચેક અને મંજૂર — નામ",
      "Checked and approved by (QC) — Designation": "(QC) દ્વારા ચેક અને મંજૂર — હોદ્દો",
      "Checked and approved by (QC) — Sign": "(QC) દ્વારા ચેક અને મંજૂર — સાઇન",
    },
  },
};

export const hintsOf = (documentId: string): FillHints | undefined => FILL_HINTS[documentId];
