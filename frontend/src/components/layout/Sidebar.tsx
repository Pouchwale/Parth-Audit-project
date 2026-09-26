import React, { useEffect, useMemo, useState } from "react";
import {
  FiGrid,
  FiBookOpen,
  FiCalendar,
  FiDatabase,
  FiBarChart2,
  FiAlertCircle,
  FiAward,
  FiDroplet,
  FiFileText,
  FiPlayCircle,
  FiSearch,
  FiShield,
  FiChevronDown,
  FiChevronsDown,
  FiChevronsUp,
  FiUsers,
  FiClipboard,
  FiTruck,
  FiTrendingUp,
  FiActivity,
  FiHome,
  FiHardDrive,
  FiLayers,
  FiMessageSquare,
  FiPackage,
  FiCheckSquare,
  FiX,
  FiBriefcase,
  FiTarget,
  FiSmartphone,
  FiList,
  FiStar,
  FiMessageCircle,
  FiHeart,
  FiUserPlus,
  FiUserCheck,
  FiLogIn,
  FiPieChart,
  FiShoppingCart,
  FiArchive,
  FiScissors,
  FiTool,
  FiSun,
  FiAlertTriangle,
  FiCompass,
  FiEdit,
  FiLock,
  FiRotateCcw,
  FiArrowLeftCircle,
  FiArrowRightCircle,
  FiCheckCircle,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import { Link, useRouter } from "../../store/router";
import { documentRepository } from "../../data/repositories/documentRepository";
import { readJSON, writeJSON } from "../../data/storageAdapter";
import { useSidebar } from "../../store/sidebar";
import { useT } from "../../i18n";
import { HR_RECORD_PAGES } from "../../data/seed/hrModule";
import { QC_OVERVIEW_DOCUMENT_IDS } from "../../data/seed/qcModule";
import { demoModeAvailable } from "../../engine/features";
import { useAuth } from "../../store/AuthContext";

interface NavItem {
  to: string;
  // Translation key — the label itself lives in src/i18n/strings.ts so the
  // whole navigation changes with the language.
  labelKey: string;
  icon: IconType;
}

// A module's body is a list of links, optionally broken up by small
// sub-headings — the Human Resources module uses these for HR's own records
// and for the groups the department thinks of its pest control file in (Daily
// Report / Service Reports / Trend Analysis / Training & Reference).
// A heading with `group` names a whole shelf of the module — the Human
// Resources module has two, HR Records and the pest control file — and the
// plain headings under it name that shelf's groups.
type NavHeading = { headingKey: string; group?: boolean };
type NavEntry = NavItem | NavHeading;
const isHeading = (e: NavEntry): e is NavHeading => "headingKey" in e;

const NAV_MAIN: NavItem[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: FiGrid },
  // The assistant as a screen of its own (ChatGPT-style, text and voice) —
  // the same assistant as the floating widget, see pages/AssistantPage.tsx.
  { to: "/assistant", labelKey: "nav.assistant", icon: FiMessageSquare },
  { to: "/library", labelKey: "nav.documentLibrary", icon: FiBookOpen },
  // Every record filed by module → document → month, for any date span.
  { to: "/files", labelKey: "nav.files", icon: FiHardDrive },
  { to: "/calendar", labelKey: "nav.recordCalendar", icon: FiCalendar },
  { to: "/search", labelKey: "nav.search", icon: FiSearch },
];

// One collapsible section per module — this is the "close it and open it
// like a navbar" grouping. Keys must match DocumentDefinition.module exactly
// (see data/seed/documentDefinitions.ts) — they are identifiers, not display
// text; the visible name comes from t(`module.${module}`). The /library/{slug}
// links use moduleSlug() so they land on Document Library pre-filtered to that
// module, which is how modules without their own dedicated list page (the
// lamination log sheets, the QC inspection records) still get a real
// destination here.
// Purchase sits directly above Quality Control's inspection records because
// that is the order the material moves in, and the order the company's own
// Master List of Formats & Records (F/SYS/02) puts the two departments in
// (F/SYS, F/MKT, F/PUR, F/STR, F/QC …): a supplier is registered, audited and
// approved on the F/PUR formats BEFORE anything it sends can be booked in and
// inspected on the F/QC ones, and the two monitoring registers are what the
// inspections feed back into. Put anywhere else it would separate the supplier
// from its material; put above HR it would move the modules people already use.
const MODULE_ORDER = [
  // System / Management comes first, where the company's own Master List of
  // Formats & Records puts F/SYS: it is the PSTL's system — the master lists,
  // the management review, the internal audit, HARA, traceability — that every
  // other module is controlled and audited through (REQUIREMENTS §76).
  "System / Management",
  // Marketing second, where the master list puts F/MKT — the customer's word on
  // the product comes before everything done to make it (REQUIREMENTS §77).
  "Marketing",
  "Human Resources",
  "CAPA (Corrective & Preventive Action)",
  "Lamination — Quality Control",
  "Lamination — Production",
  // Maintenance comes after the production formats, which is where the
  // company's own Master List of Formats & Records puts F/MNT (after F/PRD),
  // and outside the Purchase -> Store -> Dispatch run the material moves
  // through (REQUIREMENTS §74).
  "Maintenance",
  "Purchase",
  // Store sits between Purchase and Dispatch because that is where the
  // material is: bought on the F/PUR formats, taken in and kept on the F/STR
  // ones, then inspected, made and sent out. It is also the order the
  // company's own Master List of Formats & Records puts them in — F/SYS,
  // F/MKT, F/PUR, F/STR, F/QC (REQUIREMENTS §71).
  "Store",
  "Dispatch",
  "Quality Control — Inspection Records",
  "Quality — Compliance",
] as const;

type ModuleName = (typeof MODULE_ORDER)[number];

// A face for each module, so a closed panel of six headers is still scannable
// at a glance rather than six identical rows of text.
const MODULE_ICONS: Record<ModuleName, IconType> = {
  // The system everything else is steered by.
  "System / Management": FiCompass,
  // What the customer says: feedback, and the trend of complaints.
  Marketing: FiTrendingUp,
  "Human Resources": FiUsers,
  "CAPA (Corrective & Preventive Action)": FiAlertCircle,
  "Lamination — Quality Control": FiLayers,
  "Lamination — Production": FiPackage,
  // Buying: the department that places the order and keeps the supplier list.
  Purchase: FiShoppingCart,
  // The machines, and the work that keeps them running.
  Maintenance: FiTool,
  // The room the material is kept in.
  Store: FiArchive,
  Dispatch: FiTruck,
  "Quality Control — Inspection Records": FiCheckSquare,
  "Quality — Compliance": FiShield,
};

const MODULE_LINKS: Record<ModuleName, NavEntry[]> = {
  // System / Management — the PSTL's eighteen F/SYS formats (REQUIREMENTS §76):
  // the collection in the Document Library first, then the six groups the
  // product safety system runs in, each format on its own document page.
  "System / Management": [
    { to: "/library/system-management", labelKey: "nav.sysDocs", icon: FiBookOpen },
    { headingKey: "nav.sysDocumentControl" },
    { to: "/document/sys-document-list", labelKey: "nav.sysDocumentList", icon: FiFileText },
    { to: "/document/sys-format-list", labelKey: "nav.sysFormatList", icon: FiList },
    { to: "/document/sys-document-change", labelKey: "nav.sysDocumentChange", icon: FiEdit },
    { headingKey: "nav.sysManagementReview" },
    { to: "/document/sys-mrm-agenda", labelKey: "nav.sysMrmAgenda", icon: FiCalendar },
    { to: "/document/sys-mrm-record", labelKey: "nav.sysMrmRecord", icon: FiUsers },
    { to: "/document/sys-objectives", labelKey: "nav.sysObjectives", icon: FiTarget },
    { headingKey: "nav.sysInternalAudit" },
    { to: "/document/sys-audit-schedule", labelKey: "nav.sysAuditSchedule", icon: FiCalendar },
    { to: "/document/sys-audit-plan", labelKey: "nav.sysAuditPlan", icon: FiClipboard },
    { to: "/document/sys-audit-risk", labelKey: "nav.sysAuditRisk", icon: FiBarChart2 },
    { to: "/document/sys-audit-findings", labelKey: "nav.sysAuditFindings", icon: FiCheckSquare },
    { to: "/document/sys-audit-nc", labelKey: "nav.sysAuditNc", icon: FiAlertTriangle },
    { headingKey: "nav.sysCorrectiveAction" },
    { to: "/document/sys-nc-car", labelKey: "nav.sysNcCar", icon: FiAlertCircle },
    { headingKey: "nav.sysHaraSecurity" },
    { to: "/document/sys-hara-monthly", labelKey: "nav.sysHaraMonthly", icon: FiShield },
    { to: "/document/sys-hara-annual", labelKey: "nav.sysHaraAnnual", icon: FiCheckCircle },
    { to: "/document/sys-site-security", labelKey: "nav.sysSiteSecurity", icon: FiLock },
    { headingKey: "nav.sysTraceabilityRecall" },
    { to: "/document/sys-backward-trace", labelKey: "nav.sysBackwardTrace", icon: FiArrowLeftCircle },
    { to: "/document/sys-forward-trace", labelKey: "nav.sysForwardTrace", icon: FiArrowRightCircle },
    { to: "/document/sys-mock-recall", labelKey: "nav.sysMockRecall", icon: FiRotateCcw },
  ],
  // Marketing (REQUIREMENTS §77): the customer's feedback and its yearly
  // analysis, and the trend and Pareto of the customer complaints.
  Marketing: [
    { to: "/library/marketing", labelKey: "nav.mktDocs", icon: FiBookOpen },
    { headingKey: "nav.mktCustomerFeedback" },
    { to: "/document/mkt-customer-feedback", labelKey: "nav.mktFeedbackForm", icon: FiMessageSquare },
    { to: "/document/mkt-feedback-analysis", labelKey: "nav.mktFeedbackAnalysis", icon: FiList },
    { headingKey: "nav.mktCustomerComplaints" },
    { to: "/document/mkt-complaint-trend", labelKey: "nav.mktComplaintTrend", icon: FiTrendingUp },
  ],
  // The Human Resources module holds two things (REQUIREMENTS §46): HR's own
  // sixteen F/HR formats — personnel, training, induction and health, hygiene
  // and GMP, the product safety culture survey — which open in the Document
  // Library filtered to the module, and the pest control file, organised the
  // way that paperwork actually falls (see src/pages/PestControlPages.tsx):
  // the daily report, Gurudev Pest Control's three service reports, the trend
  // analyses drawn from them, and the training / reference material.
  "Human Resources": [
    // HR Records — HR's own sixteen formats, laid out like the pest control file
    // below: an overview, then a page per format under its group (REQUIREMENTS §47).
    { headingKey: "nav.hrRecords", group: true },
    { to: "/hr", labelKey: "nav.hrOverview", icon: FiHome },
    // The employee master sheet the formats below fetch a person from (REQUIREMENTS §53).
    { to: "/hr/master-data", labelKey: "nav.hrMasterData", icon: FiDatabase },
    { headingKey: "nav.hrPersonnel" },
    { to: "/hr/competence", labelKey: "nav.hrCompetence", icon: FiBriefcase },
    { to: "/hr/skill-matrix", labelKey: "nav.hrSkillMatrix", icon: FiTarget },
    { to: "/hr/job-responsibility", labelKey: "nav.hrJobResponsibility", icon: FiClipboard },
    { to: "/hr/mobile-authorization", labelKey: "nav.hrMobile", icon: FiSmartphone },
    { headingKey: "nav.hrTraining" },
    { to: "/hr/training-needs", labelKey: "nav.hrTrainingNeeds", icon: FiList },
    { to: "/hr/training-calendar", labelKey: "nav.hrTrainingCalendar", icon: FiCalendar },
    { to: "/hr/training-effectiveness", labelKey: "nav.hrTrainingEffectiveness", icon: FiStar },
    { to: "/hr/training-feedback", labelKey: "nav.hrTrainingFeedback", icon: FiMessageCircle },
    { headingKey: "nav.hrInductionHealth" },
    { to: "/hr/pre-employment-health", labelKey: "nav.hrPreEmployment", icon: FiHeart },
    { to: "/hr/induction-staff", labelKey: "nav.hrInductionStaff", icon: FiUserPlus },
    { to: "/hr/induction-operators", labelKey: "nav.hrInductionOperators", icon: FiUserCheck },
    { to: "/hr/visitor-health", labelKey: "nav.hrVisitor", icon: FiLogIn },
    { headingKey: "nav.hrHygieneGmp" },
    { to: "/hr/gmp-checklist", labelKey: "nav.hrGmp", icon: FiCheckSquare },
    { to: "/hr/hygiene-report", labelKey: "nav.hrHygiene", icon: FiDroplet },
    { headingKey: "nav.hrSafetyCulture" },
    { to: "/hr/psc-survey", labelKey: "nav.hrPscSurvey", icon: FiMessageSquare },
    { to: "/hr/psc-survey-analysis", labelKey: "nav.hrPscAnalysis", icon: FiPieChart },
    // The pest control file.
    { headingKey: "nav.pestControlGroup", group: true },
    { to: "/pest-control", labelKey: "nav.overview", icon: FiHome },
    { headingKey: "nav.dailyReport" },
    { to: "/pest/daily", labelKey: "nav.dailyPestMonitoring", icon: FiClipboard },
    { headingKey: "nav.serviceReports" },
    { to: "/pest/service/rodent", labelKey: "nav.ratMice", icon: FiTruck },
    { to: "/pest/service/general", labelKey: "nav.antsCockroaches", icon: FiTruck },
    { to: "/pest/service/fly", labelKey: "nav.flyControl", icon: FiTruck },
    { headingKey: "nav.trendAnalysis" },
    { to: "/pest/trend/rodent", labelKey: "nav.rodentTrend", icon: FiTrendingUp },
    { to: "/pest/trend/lizard", labelKey: "nav.lizardTrend", icon: FiTrendingUp },
    { to: "/pest/trend/fly-catcher", labelKey: "nav.flyCatcherInfestation", icon: FiActivity },
    { headingKey: "nav.trainingReference" },
    { to: "/training", labelKey: "nav.trainingRecords", icon: FiAward },
    { to: "/chemical-master", labelKey: "nav.chemicalMaster", icon: FiDroplet },
    { to: "/licence", labelKey: "nav.licence", icon: FiShield },
  ],
  "CAPA (Corrective & Preventive Action)": [
    { to: "/gap/internal", labelKey: "nav.capaInternal", icon: FiAlertCircle },
    { to: "/gap/external", labelKey: "nav.capaExternal", icon: FiUsers },
  ],
  "Lamination — Quality Control": [{ to: "/library/lamination-quality-control", labelKey: "nav.laminationQcDocs", icon: FiBookOpen }],
  "Lamination — Production": [{ to: "/library/lamination-production", labelKey: "nav.laminationProductionDocs", icon: FiBookOpen }],
  // Purchase — the department's five F/PUR formats (REQUIREMENTS §68): the
  // collection in the Document Library first, then the two groups its paperwork
  // actually falls into. Supplier Approval is how a supplier gets onto the
  // approved list at all — it registers itself (F/PUR/01), it is audited on a
  // visit (F/PUR/02), and it is written onto the list (F/PUR/03). Performance
  // Monitoring is how it is marked once it is on the list — the material
  // suppliers half-yearly (F/PUR/05), the service providers (F/PUR/06). Each
  // format opens on its own document page, like an HR format does.
  Purchase: [
    { to: "/library/purchase", labelKey: "nav.purchaseDocs", icon: FiBookOpen },
    { headingKey: "nav.purSupplierApproval" },
    { to: "/document/pur-supplier-registration", labelKey: "nav.purSupplierRegistration", icon: FiUserPlus },
    { to: "/document/pur-supplier-audit-report", labelKey: "nav.purSupplierAudit", icon: FiClipboard },
    { to: "/document/pur-approved-suppliers", labelKey: "nav.purApprovedSuppliers", icon: FiList },
    { headingKey: "nav.purSupplierMonitoring" },
    { to: "/document/pur-supplier-performance", labelKey: "nav.purRmPmPerformance", icon: FiTrendingUp },
    { to: "/document/pur-service-provider-performance", labelKey: "nav.purServiceProvider", icon: FiActivity },
  ],
  // Store — the department's two F/STR formats (REQUIREMENTS §71), in the
  // order the material moves through it: the check made on the vehicle and
  // its load as it comes IN, then the register of the sharp tools the store
  // issues out and takes back. The first was supplied as the rubber stamp
  // itself, and the stamp is shown beside the form.
  // Maintenance — the department's eight F/MNT formats (REQUIREMENTS §74). The
  // equipment list comes first because it is the MASTER the other formats
  // fetch a machine from, as HR Master Data leads the HR module (§53).
  Maintenance: [
    { to: "/library/maintenance", labelKey: "nav.maintenanceDocs", icon: FiBookOpen },
    { headingKey: "nav.mntEquipment" },
    { to: "/document/mnt-equipment-list", labelKey: "nav.mntEquipmentList", icon: FiDatabase },
    { to: "/document/mnt-new-equipment", labelKey: "nav.mntNewEquipment", icon: FiPackage },
    { headingKey: "nav.mntPreventive" },
    { to: "/document/mnt-yearly-pm-schedule", labelKey: "nav.mntYearlyPm", icon: FiCalendar },
    { to: "/document/mnt-pm-record", labelKey: "nav.mntPmRecord", icon: FiClipboard },
    { headingKey: "nav.mntHealthBreakdowns" },
    { to: "/document/mnt-daily-health", labelKey: "nav.mntDailyHealth", icon: FiCheckSquare },
    { to: "/document/mnt-breakdown-record", labelKey: "nav.mntBreakdown", icon: FiAlertTriangle },
    { headingKey: "nav.mntGlassLighting" },
    { to: "/document/mnt-glass-breakage", labelKey: "nav.mntGlass", icon: FiShield },
    { to: "/document/mnt-lux-level", labelKey: "nav.mntLux", icon: FiSun },
  ],
  Store: [
    { to: "/library/store", labelKey: "nav.storeDocs", icon: FiBookOpen },
    { headingKey: "nav.strIncomingMaterial" },
    { to: "/document/str-incoming-material-vehicle", labelKey: "nav.strIncomingMaterialVehicle", icon: FiTruck },
    { headingKey: "nav.strSharpToolControl" },
    { to: "/document/str-sharp-metal-objects", labelKey: "nav.strSharpMetalObjects", icon: FiScissors },
  ],
  // Dispatch — what a transporter signs before it carries the plant's product,
  // and the check made on the container before a load leaves (REQUIREMENTS §70).
  Dispatch: [
    { to: "/library/dispatch", labelKey: "nav.dispatchDocs", icon: FiBookOpen },
    { headingKey: "nav.dispTransporterAgreement" },
    { to: "/document/disp-safe-transporter-agreement", labelKey: "nav.dispSafeTransporter", icon: FiTruck },
    { headingKey: "nav.dispInspection" },
    { to: "/document/disp-container-stuffing", labelKey: "nav.dispContainerStuffing", icon: FiClipboard },
  ],
  // QC Records — the department's own overview of its thirty-eight formats in
  // their seven sections (REQUIREMENTS §58), and then the Document Library
  // filtered to the module, which is how the collection was reached before.
  "Quality Control — Inspection Records": [
    { to: "/qc", labelKey: "nav.qcOverview", icon: FiHome },
    { to: "/library/quality-control-inspection-records", labelKey: "nav.inspectionRecordDocs", icon: FiBookOpen },
  ],
  "Quality — Compliance": [{ to: "/soc", labelKey: "nav.statementsOfCompliance", icon: FiShield }],
};

// WHICH OF THOSE LINKS OPEN ONE PARTICULAR DOCUMENT (REQUIREMENTS §40).
//
// A person only sees the documents of their own department(s)
// (engine/departmentScope.ts), and a link straight into another department's
// register has no business being in their sidebar: the refusal screen exists
// for an old bookmark or an address somebody sent them, not for a link this
// app drew itself.
//
// The ids are written out here, beside the table of links they belong to,
// rather than worked out at runtime from each destination: every line can be
// checked by eye against the page that serves it (e.g. "/pest/service/rodent"
// against SERVICE_REPORTS in pages/PestControlPages.tsx), and reading a
// document id out of a URL would quietly get the two trend analyses wrong.
//
// A link is shown when ANY of its documents is visible. A destination that
// appears nowhere in this table owns no single document — the Dashboard, the
// Calendar, Reports, Search, Master Data, the assistant, Document Files, Demo
// Mode and the module landing pages — and is always shown, because what those
// screens list is already filtered document by document by the repository.
const LINK_DOCUMENT_IDS: Record<string, readonly string[]> = {
  // HR Records (data/seed/hrModule.ts): a format's page is shown when that format
  // is the viewer's, and the overview when any of the sixteen is.
  "/hr": HR_RECORD_PAGES.map((p) => p.docId),
  // HR Master Data serves every one of them, so it goes with the overview.
  "/hr/master-data": HR_RECORD_PAGES.map((p) => p.docId),
  ...Object.fromEntries(HR_RECORD_PAGES.map((p) => [`/hr/${p.slug}`, [p.docId]])),
  // QC Records (data/seed/qcModule.ts): shown when any one of the formats it
  // lists is the viewer's — Quality Control's or Quality Assurance's.
  "/qc": QC_OVERVIEW_DOCUMENT_IDS,
  "/pest/daily": ["daily-pest-monitoring"],
  "/pest/service/rodent": ["service-report-rodent"],
  "/pest/service/general": ["service-report-general"],
  "/pest/service/fly": ["service-report-fly"],
  // Neither trend analysis is a document of its own: the rodent trend counts
  // checkpoint 7 of the Daily Report and the fly catcher trend reads the Fly
  // Catcher register, so those two documents are what decide them.
  "/pest/trend/rodent": ["daily-pest-monitoring"],
  // The Lizard Catch Report is the same Roda-boxes and the same document;
  // F/HR/17 simply has no column for the lizards, so the figures are the
  // provider's own report, transcribed (REQUIREMENTS §41).
  "/pest/trend/lizard": ["daily-pest-monitoring"],
  "/pest/trend/fly-catcher": ["fly-catcher"],
  "/training": ["training-record"],
  "/chemical-master": ["chemical-master"],
  "/licence": ["gurudev-insecticide-licence"],
  // Internal CAPA is the inspection findings register, Quality Assurance's.
  // The Complaint Acknowledgement Report — capa-complaint-ack, Marketing's
  // own format — is only its neighbour on that page, which withdraws its
  // "new acknowledgement" button by itself when it is out of scope, and the
  // page refuses outright without the findings register (pages/GapPage.tsx),
  // so it is the findings register alone that earns this link.
  "/gap/internal": ["gap-inspection"],
  "/gap/external": ["capa-customer-complaint"],
  // The Statements of Compliance page lists both statements and refuses only
  // when neither is the viewer's, so either one earns the link.
  "/soc": ["soc-labels", "soc-flexible-packaging"],
  // Purchase (REQUIREMENTS §68): one page per F/PUR format, each shown when
  // that format is the viewer's. "/library/purchase" owns no single document
  // and so is not listed — the library filters itself document by document.
  "/document/pur-supplier-registration": ["pur-supplier-registration"],
  "/document/pur-supplier-audit-report": ["pur-supplier-audit-report"],
  "/document/pur-approved-suppliers": ["pur-approved-suppliers"],
  "/document/pur-supplier-performance": ["pur-supplier-performance"],
  "/document/pur-service-provider-performance": ["pur-service-provider-performance"],
  // Store and Dispatch (REQUIREMENTS §71, §70) — missing until §74, so their
  // links showed to anybody who could see the module at all.
  "/document/str-incoming-material-vehicle": ["str-incoming-material-vehicle"],
  "/document/str-sharp-metal-objects": ["str-sharp-metal-objects"],
  "/document/disp-safe-transporter-agreement": ["disp-safe-transporter-agreement"],
  "/document/disp-container-stuffing": ["disp-container-stuffing"],
  // Maintenance (REQUIREMENTS §74): one page per F/MNT format.
  "/document/mnt-equipment-list": ["mnt-equipment-list"],
  "/document/mnt-new-equipment": ["mnt-new-equipment"],
  "/document/mnt-yearly-pm-schedule": ["mnt-yearly-pm-schedule"],
  "/document/mnt-pm-record": ["mnt-pm-record"],
  "/document/mnt-daily-health": ["mnt-daily-health"],
  "/document/mnt-breakdown-record": ["mnt-breakdown-record"],
  "/document/mnt-glass-breakage": ["mnt-glass-breakage"],
  "/document/mnt-lux-level": ["mnt-lux-level"],
  // Marketing (REQUIREMENTS §77): one page per F/MKT format.
  ...Object.fromEntries(["mkt-customer-feedback", "mkt-feedback-analysis", "mkt-complaint-trend"].map((id) => [`/document/${id}`, [id]])),
  // System / Management (REQUIREMENTS §76): one page per F/SYS format.
  ...Object.fromEntries(
    [
      "sys-document-list",
      "sys-format-list",
      "sys-document-change",
      "sys-mrm-agenda",
      "sys-mrm-record",
      "sys-objectives",
      "sys-audit-schedule",
      "sys-audit-plan",
      "sys-audit-risk",
      "sys-audit-findings",
      "sys-audit-nc",
      "sys-nc-car",
      "sys-hara-monthly",
      "sys-hara-annual",
      "sys-site-security",
      "sys-backward-trace",
      "sys-forward-trace",
      "sys-mock-recall",
    ].map((id) => [`/document/${id}`, [id]])
  ),
};

// One module's entries with the other departments' links taken out, and then
// any heading left standing over nothing (REQUIREMENTS §40): a "Service
// Reports" heading above a gap reads like a page that failed to load rather
// than like paperwork that isn't yours. A heading's links follow it, so a
// heading is worth keeping exactly when a link comes before the next heading of
// its own rank or above — a shelf's name (`group`) looks past its groups' own
// headings, a group's heading does not.
function visibleEntries(entries: NavEntry[], visibleDocumentIds: Set<string>): NavEntry[] {
  const kept = entries.filter((entry) => {
    if (isHeading(entry)) return true;
    const ids = LINK_DOCUMENT_IDS[entry.to];
    return !ids || ids.some((id) => visibleDocumentIds.has(id));
  });
  const rank = (h: NavHeading) => (h.group ? 0 : 1);
  return kept.filter((entry, i) => {
    if (!isHeading(entry)) return true;
    for (const next of kept.slice(i + 1)) {
      if (!isHeading(next)) return true;
      if (rank(next) <= rank(entry)) return false;
    }
    return false;
  });
}

const NAV_SYSTEM: NavItem[] = [
  { to: "/reports", labelKey: "nav.reports", icon: FiBarChart2 },
  { to: "/master-data", labelKey: "nav.masterData", icon: FiDatabase },
  // Everything anybody has done on the portal (REQUIREMENTS §62).
  { to: "/activity", labelKey: "nav.activityLog", icon: FiActivity },
  // Who did their documents on time — by person, department and module (REQUIREMENTS §64).
  { to: "/performance", labelKey: "nav.performance", icon: FiAward },
  // What the records show when read together — drift, repeats, overdue CAPA,
  // expired calibration, breakdowns, lux falls (REQUIREMENTS §75). Shown to
  // every account: the page reads only what the account may see.
  { to: "/insights", labelKey: "nav.insights", icon: FiTrendingUp },
];
// Demo Mode is not part of the product: its link is listed only on a server
// started with it, which is how the Playwright suites get their year of
// synthetic records (engine/features.ts, REQUIREMENTS §65).
const NAV_SYSTEM_WITH_DEMO: NavItem[] = [...NAV_SYSTEM, { to: "/demo", labelKey: "nav.demoMode", icon: FiPlayCircle }];

// USERS & ACCESS is the administrator's (REQUIREMENTS §66): everybody else is
// not shown it, and the server refuses them the accounts whatever they reach for.
const USERS_ITEM: NavItem = { to: "/users", labelKey: "nav.users", icon: FiUsers };

const SIDEBAR_STATE_KEY = "sidebar-open-modules";

function loadOpenState(): Record<string, boolean> {
  return readJSON<Record<string, boolean>>(SIDEBAR_STATE_KEY, {});
}

// One place decides whether a link is the page you're on, so the module header
// can light up for exactly the same reason its child link does.
const isActivePath = (path: string, to: string): boolean => path === to || path.startsWith(to + "/");

function NavGroup({ items, path }: { items: NavEntry[]; path: string }) {
  const t = useT();
  // The most specific link that holds the page is the one lit: on
  // /hr/competence that is the competence link, not the HR overview (/hr) too.
  const activeTo = items
    .filter((item): item is NavItem => !isHeading(item) && isActivePath(path, item.to))
    .sort((a, b) => b.to.length - a.to.length)[0]?.to;
  return (
    <>
      {items.map((item, i) => {
        if (isHeading(item)) {
          return (
            <div key={`heading-${i}`} className={item.group ? "nav-sub-label nav-group-label" : "nav-sub-label"}>
              {t(item.headingKey)}
            </div>
          );
        }
        const Icon = item.icon;
        const active = item.to === activeTo;
        return (
          <Link key={item.to} to={item.to} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <span className="nav-icon">
              <Icon size={16} />
            </span>
            <span className="nav-label">{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </>
  );
}

export function Sidebar() {
  const { path } = useRouter();
  const t = useT();
  const { user } = useAuth();
  // Demo Mode only where the server has it (§65); Users & Access only for the
  // administrator, whose own it is (§66).
  const systemItems = useMemo(() => {
    const items = demoModeAvailable() ? NAV_SYSTEM_WITH_DEMO : NAV_SYSTEM;
    return user?.role === "admin" ? [...items, USERS_ITEM] : items;
  }, [user?.role]);
  const { visible, narrow, close } = useSidebar();
  const [openState, setOpenState] = useState<Record<string, boolean>>(loadOpenState);
  // WHICH MODULES AND LINKS THIS PERSON MAY OPEN (REQUIREMENTS §40).
  //
  // documentRepository.getAll() is already answered for the logged-in user's
  // own departments, so the modules it still has documents in are exactly the
  // modules worth offering — and a module all of whose links turned out to
  // belong to another department goes as well, because an empty panel only
  // invites a click that ends in a refusal.
  const visibleDocuments = documentRepository.getAll();
  const visibleModuleNames = new Set(visibleDocuments.map((d) => d.module));
  const visibleDocumentIds = new Set(visibleDocuments.map((d) => d.id));
  const modules = MODULE_ORDER.filter((m) => visibleModuleNames.has(m))
    .map((module) => ({ module, entries: visibleEntries(MODULE_LINKS[module], visibleDocumentIds) }))
    .filter(({ entries }) => entries.some((entry) => !isHeading(entry)));
  // Undefined (never explicitly toggled) defaults to open — discoverable
  // without a click. Once a module has been explicitly opened or closed,
  // that choice is authoritative and persists across navigation: an earlier
  // version of this re-opened a just-collapsed module the instant you
  // navigated to any other page within it (e.g. clicking from CAPA to
  // Training), which made "closing" a module feel like it didn't stick.
  const isOpen = (module: string) => openState[module] ?? true;
  const allOpen = modules.every(({ module }) => isOpen(module));

  const persist = (next: Record<string, boolean>) => {
    writeJSON(SIDEBAR_STATE_KEY, next);
    setOpenState(next);
  };

  const toggle = (module: string) => persist({ ...openState, [module]: !isOpen(module) });
  // One control for "show me everything" / "get it out of the way", instead of
  // six clicks. Explicit either way, so it obeys the same stickiness rule.
  // Only the modules on screen are toggled, and whatever another
  // department's modules were left at is kept rather than wiped, so the same
  // browser still remembers them for whoever can see them (REQUIREMENTS §40).
  const toggleAll = () => persist({ ...openState, ...Object.fromEntries(modules.map(({ module }) => [module, !allOpen])) });

  // As an overlay drawer the panel sits on top of the page, so going somewhere
  // has to put it away again — including when the assistant navigates for you.
  useEffect(() => {
    if (narrow) close();
  }, [path, narrow, close]);

  // Escape closes the drawer, the way every other overlay in the app does.
  useEffect(() => {
    if (!narrow || !visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [narrow, visible, close]);

  return (
    <>
      {narrow && visible && <div className="sidebar-backdrop no-print" onClick={close} aria-hidden="true" />}
      <aside
        id="app-sidebar"
        className={`app-sidebar no-print ${visible ? "is-open" : "is-closed"} ${narrow ? "is-drawer" : ""}`}
        aria-hidden={visible ? undefined : true}
        aria-label={t("nav.menu")}
      >
        <div className="app-sidebar-brand">
          {/* THE COMPANY'S MARK, and under the title the company's name alone
              (REQUIREMENTS §65). The 96px file drawn at 40px stays crisp on a
              2× screen and is a 5 KB decode; alt is empty because the name is
              written beside it; the address is relative, like assets/styles.css
              in index.html, so it holds from whatever base the app is opened. */}
          <img
            className="brand-logo notranslate"
            translate="no"
            src="brand/logo-96.png"
            width={40}
            height={40}
            alt=""
            decoding="async"
            draggable={false}
          />
          <div className="brand-text">
            <div className="title">{t("dash.title")}</div>
            <div className="subtitle notranslate" translate="no">
              {t("nav.brandSubtitle")}
            </div>
          </div>
          <button
            type="button"
            className="sidebar-close"
            data-action="close-sidebar"
            onClick={close}
            title={t("nav.closeMenu")}
            aria-label={t("nav.closeMenu")}
            aria-controls="app-sidebar"
            aria-expanded={visible}
          >
            <FiX size={16} />
          </button>
        </div>

        <nav className="app-nav">
          <div className="nav-section-label">{t("nav.workspace")}</div>
          <NavGroup items={NAV_MAIN} path={path} />

          {/* The heading and its expand/collapse belong to the modules
              underneath, so a department with no module of its own is not
              given a section header and a control over nothing
              (REQUIREMENTS §40). */}
          {modules.length > 0 && (
            <div className="nav-section-label with-action">
              <span>{t("nav.modules")}</span>
              <button
                type="button"
                className="nav-section-action"
                data-action="toggle-all-modules"
                onClick={toggleAll}
                title={allOpen ? t("nav.collapseAll") : t("nav.expandAll")}
                aria-label={allOpen ? t("nav.collapseAll") : t("nav.expandAll")}
              >
                {allOpen ? <FiChevronsUp size={13} /> : <FiChevronsDown size={13} />}
              </button>
            </div>
          )}

          {modules.map(({ module, entries }) => {
            const open = isOpen(module);
            const ModuleIcon = MODULE_ICONS[module];
            // Marked whether the module is open or shut, so a collapsed module
            // still tells you the page you're on lives inside it.
            const holdsCurrentPage = entries.some((entry) => !isHeading(entry) && isActivePath(path, entry.to));
            return (
              <div key={module} className={`nav-module ${open ? "open" : "closed"} ${holdsCurrentPage ? "current" : ""}`}>
                <button
                  type="button"
                  className="nav-module-header"
                  onClick={() => toggle(module)}
                  aria-expanded={open}
                  title={t(`module.${module}`)}
                >
                  <span className="nav-icon">
                    <ModuleIcon size={15} />
                  </span>
                  <span className="nav-module-name">{t(`module.${module}`)}</span>
                  {holdsCurrentPage && !open && <span className="nav-module-dot" title={t("nav.currentSection")} />}
                  <FiChevronDown size={13} className="nav-module-chevron" />
                </button>
                {open && (
                  <div className="nav-module-body">
                    <NavGroup items={entries} path={path} />
                  </div>
                )}
              </div>
            );
          })}

          <div className="nav-section-label">{t("nav.system")}</div>
          <NavGroup items={systemItems} path={path} />
        </nav>

        <div className="app-sidebar-foot">{t("nav.foot")}</div>
      </aside>
    </>
  );
}
