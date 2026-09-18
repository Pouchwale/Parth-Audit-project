import type { DocumentDefinition } from "../../types";
import { QC_SECTIONS, SEED_DOCUMENTS } from "./documentDefinitions";

// THE QUALITY CONTROL MODULE'S OWN PAGE (REQUIREMENTS §58).
//
// Quality Control's paperwork is the largest collection in the app — the
// thirty-eight formats the department supplied (§57), in its own seven
// sections, and belonging to two departments: Quality Control keeps most of
// them and Quality Assurance the in-process records, the certificates of
// analysis and the camera challenge test. Until now they were only reachable
// through the Document Library filtered to the module, which lists them the
// way it lists every other module's documents.
//
// /qc is the department's own overview, laid out the way HR Records is
// (data/seed/hrModule.ts): one card per section, and in it every format as
// the department asks for it — its FORMAT NUMBER and then its name — with
// what is on file, what is next due, and a click straight onto the format's
// own page.
//
// Five more of Quality Control's formats are kept elsewhere, and are listed
// at the end under the module that keeps them, so that nothing of the
// department's is missing from this page:
//
//   Lamination — Quality Control   F-QC-30 viscosity, F-QC-32 adhesive mixing
//                                  and F-QC-40.C hot room temperature, kept
//                                  with the lamination line's own paperwork
//   Quality — Compliance           the two Statements of Compliance, F/QC-09
//                                  for pressure labels and F/QC-38 for
//                                  flexible packaging, which are issued (and
//                                  read) on their own page

export type QcSection = (typeof QC_SECTIONS)[number];

export const QC_MODULE = "Quality Control — Inspection Records";
export const QC_LAMINATION_MODULE = "Lamination — Quality Control";
export const QC_COMPLIANCE_MODULE = "Quality — Compliance";

/** The heading the last card takes when a format is shelved in the module without one of the seven sections. */
export const QC_OTHER_GROUP_TITLE = "Other Quality Control Records";

/** QC's own log sheets that the Lamination module keeps (§51). */
export const QC_LAMINATION_DOCUMENT_IDS: readonly string[] = ["qc-viscosity", "qc-adhesive-mixing", "qc-temperature"];

/** QC's two Statements of Compliance, F/QC-09 and F/QC-38 (§28), read on their own page. */
export const QC_COMPLIANCE_DOCUMENT_IDS: readonly string[] = ["soc-labels", "soc-flexible-packaging"];

export interface QcGroup {
  /** The card's heading — a section of the module, or the Lamination module by name. */
  readonly title: string;
  /** Set for the module's own seven sections; absent for the lamination group. */
  readonly section?: QcSection;
  /** In the order the Document Library lists them, which is the department's own. */
  readonly documentIds: readonly string[];
}

const isQcModule = (d: DocumentDefinition): boolean => d.module === QC_MODULE;

const groups: QcGroup[] = QC_SECTIONS.map((section) => ({
  title: section,
  section,
  documentIds: SEED_DOCUMENTS.filter((d) => isQcModule(d) && d.section === section).map((d) => d.id),
})).filter((g) => g.documentIds.length > 0);

// A format shelved in the module without one of the seven sections would
// otherwise vanish from this page; it is shown rather than dropped.
const unsectioned = SEED_DOCUMENTS.filter((d) => isQcModule(d) && !QC_SECTIONS.some((s) => s === d.section)).map((d) => d.id);
if (unsectioned.length > 0) groups.push({ title: QC_OTHER_GROUP_TITLE, documentIds: unsectioned });

for (const [title, ids] of [
  [QC_LAMINATION_MODULE, QC_LAMINATION_DOCUMENT_IDS],
  [QC_COMPLIANCE_MODULE, QC_COMPLIANCE_DOCUMENT_IDS],
] as const) {
  groups.push({ title, documentIds: SEED_DOCUMENTS.filter((d) => ids.includes(d.id)).map((d) => d.id) });
}

export const QC_GROUPS: readonly QcGroup[] = groups;

/** Every document the QC overview lists — what earns its sidebar link a place (components/layout/Sidebar.tsx). */
export const QC_OVERVIEW_DOCUMENT_IDS: readonly string[] = QC_GROUPS.flatMap((g) => g.documentIds);
