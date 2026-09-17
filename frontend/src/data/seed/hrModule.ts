import type { HR_SECTIONS } from "./documentDefinitions";

// THE HR RECORDS' OWN PAGES (REQUIREMENTS §47).
//
// The pest control file inside the Human Resources module has always had pages
// of its own — an overview and one page per report. HR's own sixteen formats
// get the same: an overview of the five groups at /hr, and one page per format
// at /hr/{slug} holding its records on file, the latest one shown in full, and
// New. The sidebar lists them under their groups the way it lists the pest
// control file's reports, and "Open Document" in the Document Library lands on
// the format's page instead of the Record Calendar.

export type HrSection = (typeof HR_SECTIONS)[number];

export interface HrRecordPage {
  docId: string;
  /** The page is /hr/{slug}. */
  slug: string;
  section: HrSection;
  /** The sidebar label (i18n/strings.ts). */
  navKey: string;
  /** The header field that tells one record of this format from another, and its heading in the records table. */
  labelKey?: string;
  labelTitle?: string;
}

// In the order of the groups, and within a group in the order of the library.
export const HR_RECORD_PAGES: HrRecordPage[] = [
  { docId: "hr-competence", slug: "competence", section: "Personnel & Competence", navKey: "nav.hrCompetence", labelKey: "reviewedOn", labelTitle: "Reviewed as on" },
  { docId: "hr-skill-matrix", slug: "skill-matrix", section: "Personnel & Competence", navKey: "nav.hrSkillMatrix", labelKey: "statusAsOn", labelTitle: "Status as on" },
  { docId: "hr-job-responsibility", slug: "job-responsibility", section: "Personnel & Competence", navKey: "nav.hrJobResponsibility", labelKey: "position", labelTitle: "Position" },
  { docId: "hr-mobile-authorization", slug: "mobile-authorization", section: "Personnel & Competence", navKey: "nav.hrMobile" },
  { docId: "hr-training-needs", slug: "training-needs", section: "Training", navKey: "nav.hrTrainingNeeds", labelKey: "period", labelTitle: "Period" },
  { docId: "hr-training-calendar", slug: "training-calendar", section: "Training", navKey: "nav.hrTrainingCalendar", labelKey: "period", labelTitle: "Period" },
  { docId: "hr-training-effectiveness", slug: "training-effectiveness", section: "Training", navKey: "nav.hrTrainingEffectiveness", labelKey: "traineeName", labelTitle: "Trainee" },
  { docId: "hr-training-feedback", slug: "training-feedback", section: "Training", navKey: "nav.hrTrainingFeedback", labelKey: "topic", labelTitle: "Topic" },
  { docId: "hr-pre-employment-health", slug: "pre-employment-health", section: "Induction & Health", navKey: "nav.hrPreEmployment", labelKey: "name", labelTitle: "Applicant" },
  { docId: "hr-induction-staff", slug: "induction-staff", section: "Induction & Health", navKey: "nav.hrInductionStaff", labelKey: "name", labelTitle: "Employee" },
  { docId: "hr-induction-operators", slug: "induction-operators", section: "Induction & Health", navKey: "nav.hrInductionOperators" },
  { docId: "hr-visitor-health", slug: "visitor-health", section: "Induction & Health", navKey: "nav.hrVisitor", labelKey: "name", labelTitle: "Visitor" },
  { docId: "hr-gmp-checklist", slug: "gmp-checklist", section: "Hygiene & GMP", navKey: "nav.hrGmp", labelKey: "inspectionDate", labelTitle: "Inspection date" },
  { docId: "hr-hygiene-report", slug: "hygiene-report", section: "Hygiene & GMP", navKey: "nav.hrHygiene", labelKey: "monthYear", labelTitle: "Month & Year" },
  { docId: "hr-psc-survey", slug: "psc-survey", section: "Product Safety Culture", navKey: "nav.hrPscSurvey", labelKey: "employeeName", labelTitle: "Employee" },
  { docId: "hr-psc-survey-analysis", slug: "psc-survey-analysis", section: "Product Safety Culture", navKey: "nav.hrPscAnalysis", labelKey: "surveyPeriod", labelTitle: "Survey" },
];

export const HR_PAGE_SLUGS: ReadonlySet<string> = new Set(HR_RECORD_PAGES.map((p) => p.slug));

/** /hr/master-data — HR Master Data, the employee master sheet the formats fetch from (REQUIREMENTS §53). Not a format, so not in HR_RECORD_PAGES. */
export const HR_MASTER_SLUG = "master-data";

export const hrPageForDocument = (docId: string): HrRecordPage | undefined => HR_RECORD_PAGES.find((p) => p.docId === docId);

export const hrPageForSlug = (slug: string): HrRecordPage | undefined => HR_RECORD_PAGES.find((p) => p.slug === slug);
