// Real historical records taken directly from the uploaded source documents.
// These are LIVE data (isDemo: false) — not synthetic — and are seeded once
// on first run so the prototype demonstrates real traceability alongside the
// Demo Mode generator. Nothing here is invented; blank source fields stay
// blank / null.
import type { GapInspectionData, PestResponsibilitiesData, RecordInstance, TrainingRecordData } from "../../types";
import { newPestResponsibilitiesData } from "./pestResponsibilities";
import { generateId } from "../../utils/id";
import { SEED_HR_RECORDS } from "./hrRecords";

const now = new Date().toISOString();

export const SEED_GAP_RECORD: RecordInstance<GapInspectionData> = {
  id: "gap-2023-12-13",
  documentId: "gap-inspection",
  periodKey: "2023-12-13",
  dueDate: "2023-12-13",
  status: "Submitted",
  isDemo: false,
  data: {
    inspectionDate: "2023-12-13",
    premisesName: "Gujarat Print Pack Publications Pvt. Ltd.",
    premisesAddress: "Dediyasan GIDC, Mehsana",
    contactPerson: "Ms. Kapila Barad",
    findings: [
      {
        id: generateId("finding"),
        sNo: 1,
        findingOfInspection: "Opening in Utility area",
        commentsOnFindings: "Allowing birds as well as other flying insects to gain entry to factory",
        correctiveActionContractor: "NA",
        correctiveActionClient: "Close the gaps with Net or Screen",
        targetDate: "2023-12-31",
        actualDateOfAction: null,
        verifiedByServiceProvider: "",
        status: "Overdue",
        source: "External",
      },
      {
        id: generateId("finding"),
        sNo: 2,
        findingOfInspection:
          "Rodent box numbering was missing at few locations inside the plant but Rodent box was already placed",
        commentsOnFindings: "Pest may enter if location misplaced",
        correctiveActionContractor: "NA",
        correctiveActionClient: "Numbering to be done on walls for RBS number as per Pest control Layout",
        targetDate: "2023-12-31",
        actualDateOfAction: null,
        verifiedByServiceProvider: "",
        status: "Overdue",
        source: "External",
      },
      {
        id: generateId("finding"),
        sNo: 3,
        findingOfInspection: "Materials stored haphazardly.",
        commentsOnFindings:
          "Materials are stored haphazardly in store room, it provides breeding and hiding place for pests.",
        correctiveActionContractor: "NA",
        correctiveActionClient: "Materials should be stored properly and away from wall.",
        targetDate: "2023-12-31",
        actualDateOfAction: null,
        verifiedByServiceProvider: "",
        status: "Overdue",
        source: "External",
      },
      {
        id: generateId("finding"),
        sNo: 4,
        findingOfInspection: "Fly Killer Machine - PC-4",
        commentsOnFindings: "At the time of inspection the fly killer machine was turned off.",
        correctiveActionContractor: "NA",
        correctiveActionClient:
          "The fly killing machine should always be kept on for efficient use of the same and proper killing of flying insects.",
        targetDate: "2023-12-31",
        actualDateOfAction: null,
        verifiedByServiceProvider: "",
        status: "Overdue",
        source: "External",
      },
      {
        id: generateId("finding"),
        sNo: 5,
        findingOfInspection: "No PVC strip curtain at RM inward shutter",
        commentsOnFindings: "Pest may enter if protection not provided",
        correctiveActionContractor: "NA",
        correctiveActionClient: "PVC strip curtain to be provided",
        targetDate: "2023-12-31",
        actualDateOfAction: null,
        verifiedByServiceProvider: "",
        status: "Overdue",
        source: "External",
      },
    ],
    generalComments: [
      "Make sure that plastic waste is regularly removed from the site by licensed disposal company",
      "When storing goods - raw material and finished product, a distance of 1 to 2 feet should be allowed between the pallets and the wall",
    ],
  },
  createdAt: now,
  updatedAt: now,
  submittedBy: "Gurudev Pest Control",
  submittedAt: "2023-12-13T00:00:00.000Z",
};

export const SEED_TRAINING_RECORD: RecordInstance<TrainingRecordData> = {
  id: "training-2025-12-02",
  documentId: "training-record",
  periodKey: "2025-12-02",
  dueDate: "2025-12-02",
  status: "Verified",
  isDemo: false,
  data: {
    trainingDate: "2025-12-02",
    trainingType: "Technician Training & Certification",
    trainerProvider: "Gurudev Pest Control Services",
    topics: [
      "Safety, Health Environment, Zero tolerance Policy, MSDS, SOP.",
      "Cockroach - Facts, Source of Breeding, Damages and Diseases.",
      "Rodent - Facts, Signs of Infestation, Damages and Diseases.",
      "Flies and Mosquitoes - Facts, Source of Breeding, Damages and Diseases.",
      "Importance of Housekeeping / Sanitation",
    ],
    attendees: [
      { id: generateId("att"), employeeName: "Yogesh Rathod", department: "Pest Control Service Provider (Technician)" },
    ],
    certificateRef: "Training Certificate of Technician, dated 02/12/2025",
    remarks: "Technician certified to carry out pest control operations. Issued by Rohit Patel, for Gurudev Pest Control.",
  },
  createdAt: now,
  updatedAt: now,
  submittedBy: "Gurudev Pest Control",
  submittedAt: "2025-12-02T00:00:00.000Z",
  verifiedBy: "Rohit Patel (Gurudev Pest Control)",
  verifiedAt: "2025-12-02T00:00:00.000Z",
};

// "Training - Yrl (1).doc" — the annual Pest Control Awareness Training
// Programme held on 24-Dec-2025 at the plant, conducted by Gurudev Pest
// Control (signed Rohit Patel). Topics and attendee list verbatim.
export const SEED_AWARENESS_TRAINING_RECORD: RecordInstance<TrainingRecordData> = {
  id: "training-2025-12-24",
  documentId: "training-record",
  periodKey: "training-record:2025-12-24",
  dueDate: "2025-12-24",
  status: "Verified",
  isDemo: false,
  data: {
    trainingDate: "2025-12-24",
    trainingType: "Pest Control Awareness Training Program (annual)",
    trainerProvider: "Gurudev Pest Control",
    topics: [
      "Types of Pest Control Services",
      "Different Types of Pest/Insects.",
      "How to handle Pest Problems through Preventive and curative method",
      "Lifecycle of Pests and duration Period of their different stages",
      "Pest Inspection",
      "Chemical & Non-chemical Method to Control Pests",
      "Do and Don'ts to control Pests inside and outside factory Premises.",
      "Different Proofing Measures for Pest Management.",
    ],
    attendees: [
      { id: "att-2025-12-24-1", employeeName: "Mr. Akash Patel", department: "Gujarat Printpack Publication Pvt. Ltd." },
      { id: "att-2025-12-24-2", employeeName: "Mr. Ajay Vaghela", department: "Gujarat Printpack Publication Pvt. Ltd." },
      { id: "att-2025-12-24-3", employeeName: "Ms. Kapila Barad", department: "Gujarat Printpack Publication Pvt. Ltd." },
      { id: "att-2025-12-24-4", employeeName: "Mr. Meet Patel", department: "Gujarat Printpack Publication Pvt. Ltd." },
      { id: "att-2025-12-24-5", employeeName: "Mr. Harsh Parmar", department: "Gujarat Printpack Publication Pvt. Ltd." },
      { id: "att-2025-12-24-6", employeeName: "Mr. Chirag Parmar", department: "Gujarat Printpack Publication Pvt. Ltd." },
      { id: "att-2025-12-24-7", employeeName: "Mr. Mukesh Patel", department: "Gujarat Printpack Publication Pvt. Ltd." },
    ],
    certificateRef: "Training - Yrl (1).doc — Subject: Pest control awareness Training Program, dated 24.12.2025",
    remarks: "Conducted at 308/9, GIDC, Dediyasan, Mehsana by Gurudev Pest Control; signed Rohit Patel.",
  },
  createdAt: now,
  updatedAt: now,
  submittedBy: "Gurudev Pest Control",
  submittedAt: "2025-12-24T00:00:00.000Z",
  verifiedBy: "Rohit Patel (Gurudev Pest Control)",
  verifiedAt: "2025-12-24T00:00:00.000Z",
};

// The Responsibilities of Pest Control document as both parties signed it on
// 01.01.2025 ("responsibilities of pest control report .pdf"); its wording is
// in data/seed/pestResponsibilities.ts. It is on file as a signed document, so
// it is seeded verified — correcting it goes through Edit, like any record.
export const SEED_PEST_RESPONSIBILITIES_RECORD: RecordInstance<PestResponsibilitiesData> = {
  id: "pest-responsibilities-2025-01-01",
  documentId: "pest-responsibilities",
  periodKey: "2025-01-01",
  dueDate: "2025-01-01",
  status: "Verified",
  isDemo: false,
  data: newPestResponsibilitiesData(),
  createdAt: now,
  updatedAt: now,
  submittedBy: "Chirag Parmar (Manager, Purchase)",
  submittedAt: "2025-01-01T00:00:00.000Z",
  verifiedBy: "Rohit Patel (Gurudev Pest Control Services)",
  verifiedAt: "2025-01-01T00:00:00.000Z",
};

export const SEED_HISTORICAL_RECORDS: RecordInstance[] = [
  SEED_GAP_RECORD as RecordInstance,
  SEED_TRAINING_RECORD as RecordInstance,
  SEED_AWARENESS_TRAINING_RECORD as RecordInstance,
  SEED_PEST_RESPONSIBILITIES_RECORD as RecordInstance,
  // The filled Human Resources registers supplied on 14-Sep-2026 (hrRecords.ts).
  ...SEED_HR_RECORDS,
];
