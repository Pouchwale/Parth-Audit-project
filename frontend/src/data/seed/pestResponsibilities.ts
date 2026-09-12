import type { PestResponsibilitiesData } from "../../types";

// RESPONSIBILITIES OF PEST CONTROL — SITE & SERVICE PROVIDER, transcribed
// verbatim from "responsibilities of pest control report .pdf" (three pages on
// the company's letterhead, signed 01.01.2025 by Chirag Parmar for Gujarat
// Print Pack Publications and Rohit Patel for Gurudev Pest Control Services).
// Nothing is invented: the blank "Critical Hazards issues" contact is left
// blank, as on the paper. Every line is editable on the document itself.

export const PR_DOC_ID = "pest-responsibilities";

export const PR_LETTERHEAD = [
  "Mehsana Plant : 308/9 & 232 G.I.D.C., Dediyasan, Phase-II, Mehsana-384 002.",
  "Gujarat, India. Phone : 02762 224214",
  "info@gujprintpack.com  www.gujprintpack.com",
  "CIN : U22210GJ1994PTC022238",
];

const SITE_RESPONSIBILITIES = [
  "Pests pose a major threat to the safety of food products since infestations can occur where there are breeding sites and entry points.",
  "Good hygiene & Sanitation practices should be employed by site to avoid creating an environment conducive to pests.",
  "Buildings should be kept in good repair and condition to prevent pest access and to eliminate potential breeding sites.",
  "Holes, drains and other places where pests are likely to gain access should be kept sealed.",
  "Wire mesh screens, for example on open windows, doors and ventilators, should be provided to reduce the problem of pest entry.",
  "Animals should be excluded from the grounds of factories and processing plants.",
  "Potential food sources should be stored in pest-proof containers and/or stacked above the ground and away from walls.",
  "Areas both inside and outside food premises should be kept clean.",
  "Where appropriate, food materials should be stored in covered, pest-proof containers.",
  "Establishments and surrounding areas should be regularly examined for evidence of infestation & structural deficiencies.",
  "Daily pest activity monitoring shall be carried out by admin staff for pest sighting, pest burrows, availability of pest control devices at its defined location as per Pest control layout.",
  "Safe disposition of pests trapped as per your guidance / SOP.",
  "Replacement of Glue pads/Glue boards in case of any pest trapped.",
  "Implementation of measures in ASAP manner for the area of improvements shared by Pest control service provider.",
];

const EQUIPMENT_STORAGE = [
  "Pest control service provider has to carry the equipments & pesticides with them for each application and they will store the materials at their Godown at their cost and conveyance.",
  "Pesticides shall not be stored inside the processing area.",
  "Service container of Pesticides shall be kept in safe location (security office or other suitable location) under the supervision of security officials or your supervisor.",
  "Dilution preparation shall be done at your premises only.",
];

const EHS_CLAUSES = [
  "Pest control service provider shall undertake to minimize the negative impact of the pest control services on the environment.",
  "Pest control service provider shall make every endeavour to safeguard health and safety of people and animals in the Property against any perils of using pesticides.",
  "Pest control service provider shall make every endeavour to minimize usage of pesticides when carrying out pest control services under this Contract.",
  "Pest control service provider shall provide the Client with a list of pesticides, dose rate and areas of application and method of application, which will be used in the course of carrying out the pest control services.",
  'Pest control service provider shall provide the Client with "material safety data sheets", in respect of all pesticides which will be used.',
  "All pesticides that will be used by Pest control service provider will be human friendly, as per Indian Pesticide Act of 1968 and approved by WHO.",
  "Pest control service provider shall ensure that its workers or employees, who apply pesticides in the Property, are sufficiently trained to carry out the pest control services.",
];

const SERVICE_CLAUSES = [
  "Pest control service provider shall also comply with other statutory code (if any) relating to use and application of pesticides as may from time to time be required by State & Central Government of India.",
  "Subject to this Contract, Pest control service provider shall provide the Client with a work schedule which shall clearly specify the frequency of the treatments to be carried out by Pest control service provider under this Contract.",
  "There shall be minimum 6 monthly meetings between Pest control service provider and client regarding the status, progress & action plan. In case of pest infestation or any issues, frequency of pest control service shall be increased.",
  "Pest control service provider shall carry out the trend analysis for pest catch count & area of improvement.",
  "Monthly summarised service report shall be submitted not later than 7th of every month for all the services being carried out, date of service, targeted pests, pesticide used & quantity, pest sighting & catch count, action plan for next month if necessary.",
];

export const PR_TRAINING_NOTE =
  "Yearly Pest awareness training to be provided to site operational key staff responsible for control & monitoring of pest activities";

/** The document as signed on 01.01.2025 — also the starting text of a new one. */
export function newPestResponsibilitiesData(): PestResponsibilitiesData {
  return {
    siteResponsibilities: [...SITE_RESPONSIBILITIES],
    equipmentStorage: [...EQUIPMENT_STORAGE],
    emergencyCalls: [
      { issue: "Service related issues", name: "Chiragbhai parmar", phone: "9998054414" },
      // Blank on the paper — left blank here too.
      { issue: "Critical Hazards issues", name: "", phone: "" },
    ],
    trainingNote: PR_TRAINING_NOTE,
    ehsClauses: [...EHS_CLAUSES],
    serviceClauses: [...SERVICE_CLAUSES],
    client: {
      organisation: "GUJARAT PRINT PACK PUBLICATIONS LIMITED",
      name: "Chirag parmar",
      designation: "Manager",
      department: "Purchase",
      dated: "2025-01-01",
    },
    provider: {
      organisation: "Gurudev Pest control services",
      name: "Rohit Patel",
      designation: "Owner",
      department: "NA",
      dated: "2025-01-01",
    },
  };
}
