// THE PLANT'S OWN DOCUMENTS AND PEOPLE, FOR THE ACCESS TESTS (backend/tests/accessLevels.test.ts, storageRoutes.test.ts,
// accessRulesRoutes.test.ts): a few real ids and format numbers, and the owner's people. Not a test file itself.
export const DOCS = [
  { id: "qc-viscosity", formatNo: "F-QC-30", name: "Lamination Adhesive Viscosity Record", kind: "log-sheet" }, // Ankur Raval
  { id: "qc-inspection-printed-film", formatNo: "F/QC/34", name: "Inspection Record - Lamination Grade Printed Film", kind: "log-sheet" }, // Ajay Zala
  { id: "qc-inspection-pouching", formatNo: "F/QC/37", name: "Inspection Record - Pouching Process", kind: "log-sheet" }, // Kapila Barad
  { id: "daily-pest-monitoring", formatNo: "F/HR/17", name: "Daily Pest Control Monitoring Record", kind: "daily-pest-monitoring" }, // Kapila Barad
  { id: "hr-competence", formatNo: "F/HR/01", name: "Personal Competence Records (Staff Members Only)", kind: "log-sheet" }, // Vinay Bhojak, Sandeep Parekh
  { id: "prd-alc-production", formatNo: "F-PRD-18", name: "Solvent Base Lamination - ALC & Production Report", kind: "log-sheet" }, // Vishnu Jadhav, Ajay Sinh Vaghela
  { id: "service-agreement", formatNo: "TO BE CONFIRMED", name: "Pest Control Service Agreement", kind: "service-agreement" }, // Chirag Parmar (PUR)
  { id: "chemical-master", formatNo: "TO BE CONFIRMED", name: "Pesticide Application Chart (Chemical Master)", kind: "chemical-master", isReferenceOnly: true },
];
export const DOCS_JSON = JSON.stringify(DOCS);

export const PEOPLE = {
  admin: { email: "admin@gpp.local", role: "admin", departments: [] as string[] },
  kapila: { email: "kapila.barad@gpp.local", role: "staff", departments: ["QC"] },
  vinay: { email: "vinay.bhojak@gpp.local", role: "staff", departments: ["HR"] },
  ankur: { email: "ankur.raval@gpp.local", role: "staff", departments: ["QC"] },
  chirag: { email: "chirag.parmar@gpp.local", role: "staff", departments: ["PUR"] },
  // Two accounts nobody has described (a suite's sign-ups): they keep what they had.
  qcClerk: { email: "dept-qc@example.com", role: "staff", departments: ["QC"] },
  everybody: { email: "dept-all@example.com", role: "staff", departments: [] as string[] },
};

