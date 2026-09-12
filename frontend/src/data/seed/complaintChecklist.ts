import type { ChecklistSection, ComplaintChecklistData } from "../../types";

// CUSTOMER COMPLAINT HANDLING CHECKLIST — Format number F/MKT/05 (00 /
// 21.07.2026), transcribed verbatim from "Updated Checklist.doc" in the
// uploaded zip (kept in source-documents/). Section titles, activity text
// and the printed Sr. No. sequence (which skips 6) are exactly as on the
// form. This is the CAPA module's "External" document: complaints come from
// customers, as opposed to the Internal inspection-findings report.

export const COMPLAINT_DOC_ID = "capa-customer-complaint";

export const COMPLAINT_FOOTER_NOTE =
  "This checklist ensures systematic investigation, CAPA implementation, effectiveness verification, and timely closure of customer complaints in accordance with the Quality Management System requirements.";

const SECTIONS: { key: ChecklistSection["key"]; title: string; items: [number, string][] }[] = [
  {
    key: "A",
    title: "COMPLAINT RECEIPT & REGISTRATION",
    items: [
      [1, "Complaint details requested from customer (If not received)"],
      [2, "Complaint details received from customer"],
      [3, "Complaint registered in system"],
      [4, "Complaint category defined"],
      [5, "Complaint severity assessed"],
    ],
  },
  {
    key: "B",
    title: "INVESTIGATION",
    items: [
      [7, "Retained samples verified"],
      [8, "Production records verified"],
      [9, "Quality control records verified"],
      [10, "Complaint samples received from customer (If required)"],
      [11, "Initial observations recorded"],
      [12, "Cross-functional investigation meeting conducted"],
      [13, "Investigation team attendance recorded"],
      [14, "Root Cause Analysis completed"],
      [15, "Responsible persons interviewed and statements recorded"],
    ],
  },
  {
    key: "C",
    title: "CORRECTIVE & PREVENTIVE ACTION (CAPA)",
    items: [
      [16, "Corrective Action identified"],
      [17, "Corrective Action implemented"],
      [18, "Preventive Action identified"],
      [19, "Preventive Action implemented"],
      [20, "Employee training conducted (If required)"],
      [21, "Supplier discussion conducted (If required)"],
      [22, "Customer visit conducted (If required)"],
    ],
  },
  {
    key: "D",
    title: "CUSTOMER COMMUNICATION",
    items: [
      [23, "Interim update shared with customer"],
      [24, "Findings shared with Marketing/Coordination Team"],
      [25, "Supporting evidence attached"],
      [26, "CAPA report prepared"],
      [27, "CAPA report reviewed and approved"],
      [28, "Final response shared with customer"],
    ],
  },
  {
    key: "E",
    title: "EFFECTIVENESS & CLOSURE",
    items: [
      [29, "Effectiveness of corrective action verified"],
      [30, "Customer feedback/acceptance obtained"],
      [31, "Complaint closure approved by QA Head"],
      [32, "Complaint closed in system"],
    ],
  },
];

export const COMPLAINT_ACTIVITY_COUNT = SECTIONS.reduce((n, s) => n + s.items.length, 0);

export function newComplaintChecklistData(complaintNo = ""): ComplaintChecklistData {
  return {
    customerName: "",
    complaintNo,
    jobName: "",
    jobCode: "",
    complaintReceivedDate: null,
    poNo: "",
    sections: SECTIONS.map((s) => ({
      key: s.key,
      title: s.title,
      items: s.items.map(([srNo, activity]) => ({ srNo, activity, done: false, date: null, comment: "", notRequired: false })),
    })),
    preparedBy: { name: "", designation: "", date: null },
    approvedBy: { name: "", designation: "", date: null },
  };
}

// A conditional activity on the printed form — "(If required)" / "(If not
// received)". These are the ones the assistant offers "Not required" for
// first; any activity can still be marked not applicable.
export function isConditionalActivity(activity: string): boolean {
  return /\(If /i.test(activity);
}
