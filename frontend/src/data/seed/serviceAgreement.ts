import type { ServiceAgreementData, ServiceAgreementParty } from "../../types";
import { TBC } from "../../types";
import { SERVICE_LICENCE } from "./serviceLicence";
import { PR_LETTERHEAD } from "./pestResponsibilities";

// PEST CONTROL SERVICE AGREEMENT — the contract between the plant and its pest
// control service provider, renewed every two years (the department's request,
// 12-Sep-2026: "in service provider there should be pop up for every two year
// for service provider agreement … keep upload option or the system will
// automatically generate the same format or user can upload it").
//
// THE FORMAT is the service provider's own letterhead, transcribed from
// "Letter head.pdf" as supplied — name, address, telephone, email and website
// exactly as printed. The printed letterhead also carries the GPC logo; it is
// shown here as the same lettering, and the artwork is TO BE CONFIRMED.
//
// WHAT THE SYSTEM FILLS IN, and where each line comes from: the parties (the
// company's own letterhead and the provider's), the provider's insecticide
// licence number (data/seed/serviceLicence.ts), the services and their
// frequencies (SCOPE_OF_SERVICES below — the service provider's own wording,
// including its own "TO BE CONFIRMED" frequencies), and the obligations signed
// by both parties (the Responsibilities of Pest Control document, cross
// referenced rather than restated). NOTHING ELSE IS INVENTED: the commercial
// terms nobody has told the system are left as TO BE CONFIRMED for the two
// parties to complete. Every line is editable, by hand or by asking the
// assistant, and the signed copy can be uploaded instead.

export const SA_DOC_ID = "service-agreement";
export const SA_TITLE = "PEST CONTROL SERVICE AGREEMENT";
/** The agreement runs two years — what the reminder counts down to. */
export const SA_TERM_YEARS = 2;
/** How long before it runs out the reminder starts asking. */
export const SA_REMIND_BEFORE_DAYS = 60;
/** Scans / photographs / PDFs of the signed copy held on one agreement. */
export const SA_MAX_SCANS = 8;

/** The provider's letterhead, exactly as printed on "Letter head.pdf". */
export const SA_PROVIDER_LETTERHEAD = {
  logo: "GPC",
  name: "GURUDEV PEST CONTROL",
  addressLines: ["F/54, Golden Square Complex, Nr. Goodluck Party plot, Radhanapur Road,", "Mahesana-384002"],
  phones: "Mo. 98244 09997, 98989 68969",
  email: "info@gurudevpestcontrol.com",
  website: "www.Gurudevpestcontrol.com",
};

const PROVIDER: ServiceAgreementParty = {
  organisation: SA_PROVIDER_LETTERHEAD.name,
  addressLines: [...SA_PROVIDER_LETTERHEAD.addressLines],
  contactName: "Rohit Patel",
  designation: "Owner",
  phone: "98244 09997",
  email: SA_PROVIDER_LETTERHEAD.email,
};

const CLIENT: ServiceAgreementParty = {
  organisation: "GUJARAT PRINT PACK PUBLICATIONS PVT. LTD.",
  addressLines: [PR_LETTERHEAD[0], PR_LETTERHEAD[1]],
  contactName: "Chirag Parmar",
  designation: "Manager, Purchase",
  phone: "9998054414",
  email: "info@gujprintpack.com",
};

// THE SCOPE OF SERVICES CLAUSE — the five services the provider contracts to
// carry out and the frequency of each, in the provider's own wording from its
// Standard Operating Procedure for Pest Control Services, including the
// frequencies that procedure itself leaves TO BE CONFIRMED. These lines used to
// be derived from a transcription of that SOP held as a document in this system;
// the SOP was withdrawn on 13-Sep-2026 (it is the provider's procedure, not one
// of the company's controlled formats — REQUIREMENTS §42), so the clause now
// lives here, in the agreement it belongs to, word for word as before.
const SCOPE_OF_SERVICES: string[] = [
  "General Pest Control (Cockroaches, Ants & Crawling Insects) — frequency: TO BE CONFIRMED (service report specimens observed at fortnightly cadence)",
  "Rodent Control Service (Rat, Mice & Bandicoots) — frequency: TO BE CONFIRMED (service report specimens observed at fortnightly cadence)",
  "Fly Control Service (House Fly, Drain Fly, Fruit Fly) — frequency: TO BE CONFIRMED (service report specimens observed at fortnightly cadence)",
  "Mosquito Control Services (Mosquitoes) — frequency: TO BE CONFIRMED — no standalone service report specimen supplied; Chemical Chart groups Mosquito Control with Fly Control Service.",
  "Lizard Control Services (House Lizard) — frequency: Quarterly (explicitly stated in source: \"recommended is quarterly however it may depend upon the local situation and may vary from place to place\").",
];

const SERVICE_SCHEDULE = [
  "The work schedule, and the frequency of each treatment under it, is the one in the service provider's Standard Operating Procedure for Pest Control Services, a copy of which is held on site by the Purchase department.",
  "A service report is filed for every visit (Rat / Mice, Ants & Cockroaches, Fly Control), signed by the technician and the site contact.",
  "A monthly summarised service report is submitted not later than the 7th of every month, covering the services carried out, the date of service, the targeted pests, the pesticide used and its quantity, pest sighting and catch count, and the action plan for the next month if necessary.",
  "There are at minimum 6-monthly meetings between the service provider and the client on status, progress and action plan. In case of pest infestation or any issue, the frequency of service is increased.",
  "Trend analysis of pest catch count and areas of improvement is carried out by the service provider.",
];

const OBLIGATIONS = [
  "The responsibilities of each party are those set out in the signed document “Responsibilities of Pest Control — Site & Service Provider”, which is held with this agreement and forms part of it.",
  `The service provider holds insecticide licence ${SERVICE_LICENCE.form} No. ${SERVICE_LICENCE.licenseNo} (registration ${SERVICE_LICENCE.registrationNo}), issued by the ${SERVICE_LICENCE.issuer}, a copy of which is on file. The licence is kept current for the whole of this term.`,
  "Pesticides are carried and stored by the service provider at its own godown, cost and conveyance, and are not stored inside the processing area. Dilution is prepared at the client's premises only.",
  "Only pesticides permitted under the Insecticides Act and Rules are used, with material safety data sheets, dose rates, areas of application and method of application supplied to the client.",
  "Yearly pest awareness training is provided to the site's operational key staff responsible for control and monitoring of pest activities.",
];

const COMMERCIAL_TERMS = [
  `Service charges for the term: ${TBC}`,
  `Payment terms: ${TBC}`,
  `Taxes (GST) and the provider's GSTIN: ${TBC}`,
  `What is included and what is charged as an additional visit: ${TBC}`,
];

const GENERAL_TERMS = [
  "This agreement runs for the two years stated above and is renewed by both parties before it ends. The system asks for the renewal sixty days before that date.",
  "Either party may end this agreement by notice in writing; the notice period is TO BE CONFIRMED.",
  "The service provider indemnifies the client against any claim arising from its own negligence in the course of the services; the extent is TO BE CONFIRMED.",
  "Any dispute is subject to the jurisdiction of the courts at Mehsana, Gujarat.",
];

/** A fresh agreement for a term — what "generate it for me" produces. */
export function newServiceAgreementData(effectiveFrom: string, effectiveTo: string, origin: ServiceAgreementData["origin"] = "generated"): ServiceAgreementData {
  return {
    agreementNo: TBC,
    effectiveFrom,
    effectiveTo,
    client: { ...CLIENT, addressLines: [...CLIENT.addressLines] },
    provider: { ...PROVIDER, addressLines: [...PROVIDER.addressLines] },
    providerLicenceNo: SERVICE_LICENCE.licenseNo,
    scopeOfServices: SCOPE_OF_SERVICES,
    serviceSchedule: [...SERVICE_SCHEDULE],
    obligations: [...OBLIGATIONS],
    commercialTerms: [...COMMERCIAL_TERMS],
    generalTerms: [...GENERAL_TERMS],
    clientSignatory: { organisation: CLIENT.organisation, name: "", designation: "", department: "Purchase", dated: "" },
    providerSignatory: { organisation: PROVIDER.organisation, name: "", designation: "", department: "NA", dated: "" },
    scans: [],
    origin,
  };
}
