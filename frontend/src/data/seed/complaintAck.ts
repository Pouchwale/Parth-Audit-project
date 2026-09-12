import type { ComplaintAckData } from "../../types";

// CAPA — Internal: Complaint Acknowledgement Report, format QA-CAF-00
// (22.03.26), laid out as on "Foram P. - FGSL3877.pdf" — supplied as the
// format reference only (its complaint is not loaded as data). The printed
// wording below is the form's own, verbatim; each is only the starting text
// of a new report and can be edited on it.

export const CAF_DOC_ID = "capa-complaint-ack";
export const CAF_FORMAT_REF = "QA-CAF-00 (22.03.26)";
export const CAF_TITLE = "Complaint Acknowledgement Report";
export const CAF_COMPANY_LINE_1 = "GUJARAT PRINT PACK";
export const CAF_COMPANY_LINE_2 = "PUBLICATIONS PVT. LTD.";
export const CAF_SUBJECT = "Acknowledgement of Customer Complaint";
export const CAF_INTRO = "This is to inform that the following complaint has been received from the customer:";
export const CAF_ACKNOWLEDGEMENT =
  "I hereby acknowledge that the above complaint has been explained to me. I have understood the issue and my involvement in the same. I assure that I will follow all standard operating procedures (SOP) strictly and take necessary precautions to avoid recurrence of such issues in the future.";

// Offered as suggestions, never a fixed list: the specimen's own entries —
// earlier reports' entries are added to them on the form.
export const CAF_COMPLAINT_TYPES = ["Process related"];
export const CAF_COMPLAINT_SUB_TYPES = ["Deviation from specification"];

// Photos live inside the record, in the browser's storage, so a report holds
// a few of them, each scaled down first (utils/image.ts).
export const CAF_MAX_PHOTOS = 4;

export function newComplaintAckData(dateISO: string): ComplaintAckData {
  return {
    reportDate: dateISO,
    toName: "",
    toDesignation: "",
    subject: CAF_SUBJECT,
    intro: CAF_INTRO,
    customerName: "",
    fgCode: "",
    complaintReceivedOn: "",
    jobName: "",
    complaintType: "",
    complaintSubType: "",
    scenario: "",
    photos: [],
    rootCause: "",
    correctiveAction: "",
    preventiveAction: "",
    acknowledgement: CAF_ACKNOWLEDGEMENT,
    employeeName: "",
    employeeSignDate: "",
  };
}
