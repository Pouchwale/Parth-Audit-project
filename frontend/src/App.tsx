import React from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { ISO_DATE_RE, MONTH0_RE, YEAR_RE, useRouter } from "./store/router";
import { AssistantProvider } from "./store/AssistantContext";
import { SidebarProvider } from "./store/sidebar";
import { DocumentAssistant } from "./components/common/DocumentAssistant";
import { AssistantBriefingPopup } from "./components/common/AssistantBriefingPopup";
import { StorageFullBanner } from "./components/common/StorageFullBanner";
import { DatabaseSyncBanner } from "./components/common/DatabaseSyncBanner";

import { DashboardPage } from "./pages/DashboardPage";
import { ProcessFlowPage } from "./pages/ProcessFlowPage";
import { DocumentLibraryPage } from "./pages/DocumentLibraryPage";
import { FileBrowserPage } from "./pages/FileBrowserPage";
import { CalendarPage } from "./pages/CalendarPage";
import { DayViewPage } from "./pages/DayViewPage";
import { RecordPage } from "./pages/RecordPage";
import { GapListPage, GapRecordPage } from "./pages/GapPage";
import { CapaHomePage, ComplaintListPage, ComplaintChecklistPage } from "./pages/CapaPage";
import { TrainingListPage, TrainingRecordPage } from "./pages/TrainingPage";
import { ChemicalMasterPage } from "./pages/ChemicalMasterPage";
import { ComplianceDetailPage, ComplianceListPage } from "./pages/CompliancePage";
import { ReportsPage } from "./pages/ReportsPage";
import { MasterDataPage } from "./pages/MasterDataPage";
import { DemoModePage } from "./pages/DemoModePage";
import { SearchPage } from "./pages/SearchPage";
import { AssistantPage } from "./pages/AssistantPage";
import { LicencePage } from "./pages/LicencePage";
import {
  DailyMonitoringListPage,
  FlyCatcherTrendPage,
  LizardTrendPage,
  PestControlOverviewPage,
  RodentTrendPage,
  ServiceReportListPage,
} from "./pages/PestControlPages";
import { HrDocumentPage, HrOverviewPage } from "./pages/HrPages";
import { HrMasterDataPage } from "./pages/HrMasterDataPage";
import { QcOverviewPage } from "./pages/QcPages";
import { ActivityLogPage } from "./pages/ActivityLogPage";
import { PerformancePage } from "./pages/PerformancePage";
import { MitraReaction } from "./components/common/MitraReaction";
import { DocumentRecordsPage } from "./pages/DocumentRecordsPage";

function NotFoundPage() {
  return (
    <div className="empty-state">
      <h2 className="text-xl mb-2">Page not found</h2>
      <p>The screen you're looking for doesn't exist yet.</p>
    </div>
  );
}

// Route parameters come from the address bar, so anything can be in them.
// A year or month that isn't one is treated as not given (the page shows the
// current one) instead of reaching the page as NaN — "undefined NaN"
// headings, NaN options in the year list, a calendar stuck on NaN.
function yearParam(s: string | undefined): number | undefined {
  return s !== undefined && YEAR_RE.test(s) ? Number(s) : undefined;
}
function month0Param(s: string | undefined): number | undefined {
  return s !== undefined && MONTH0_RE.test(s) ? Number(s) : undefined;
}
function isRealISODate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function RouteSwitch() {
  const { segments } = useRouter();
  const [root, ...rest] = segments;

  switch (root) {
    case undefined:
    case "dashboard":
      return <DashboardPage />;
    case "process-flow":
      return <ProcessFlowPage />;
    case "library":
      return <DocumentLibraryPage moduleSlug={rest[0]} />;
    case "files":
      // Document Files: the records for exactly one date span, filed by
      // module → document → month. Keyed so a new span remounts cleanly.
      return <FileBrowserPage key={rest.join("/")} scope={rest[0]} from={rest[1]} to={rest[2]} />;
    case "calendar":
      // key forces a full remount on a genuine route change (e.g. the
      // assistant sending you to a specific month while already on this
      // page) so the very first render already reflects the new month —
      // CalendarPage's y/m state has no prop-resync effect of its own, so
      // without this a deep link to a new month while already mounted here
      // would silently keep showing the old one.
      return <CalendarPage key={rest.join("/")} year={yearParam(rest[0])} month={month0Param(rest[1])} />;
    case "day":
      // Not a real date (#/day/abc, #/day/2026-02-31): nothing to show, and
      // the Day View can't even print a heading for it.
      if (rest[0] !== undefined && !isRealISODate(rest[0])) return <NotFoundPage />;
      return <DayViewPage date={rest[0]} />;
    case "record":
      return <RecordPage recordId={rest[0]} />;
    case "gap":
      // /gap → Internal-or-External chooser; /gap/internal, /gap/external →
      // the two lists; /gap/complaint/{id} → a complaint checklist;
      // /gap/{id} → an internal findings report (kept for existing links).
      // Record pages are keyed by id: they read their record once, so moving
      // from one record straight to another (a reminder, Back / Forward) has
      // to remount them — otherwise the page kept showing the first record
      // and its next edit was saved into the second.
      if (!rest[0]) return <CapaHomePage />;
      if (rest[0] === "internal") return <GapListPage />;
      if (rest[0] === "external") return <ComplaintListPage />;
      if (rest[0] === "complaint") return rest[1] ? <ComplaintChecklistPage key={rest[1]} recordId={rest[1]} /> : <ComplaintListPage />;
      return <GapRecordPage key={rest[0]} recordId={rest[0]} />;
    case "training":
      return rest[0] ? <TrainingRecordPage key={rest[0]} recordId={rest[0]} /> : <TrainingListPage />;
    case "pest-control":
      return <PestControlOverviewPage />;
    case "pest":
      // The Pest Control module's own pages — Daily Report / Service Reports /
      // Trend Analysis. Keyed like Calendar/Reports so a deep link to another
      // month/year/service remounts cleanly.
      if (rest[0] === "daily") {
        return <DailyMonitoringListPage key={rest.join("/")} year={yearParam(rest[1])} month={month0Param(rest[2])} />;
      }
      if (rest[0] === "service") return <ServiceReportListPage key={rest.join("/")} slug={rest[1] ?? ""} year={yearParam(rest[2])} />;
      if (rest[0] === "trend" && rest[1] === "rodent") return <RodentTrendPage key={rest.join("/")} year={yearParam(rest[2])} />;
      if (rest[0] === "trend" && rest[1] === "lizard") return <LizardTrendPage key={rest.join("/")} year={yearParam(rest[2])} />;
      if (rest[0] === "trend" && rest[1] === "fly-catcher") return <FlyCatcherTrendPage key={rest.join("/")} year={yearParam(rest[2])} />;
      return <NotFoundPage />;
    case "hr":
      // HR Records — the Human Resources module's own sixteen formats: the
      // overview of their five groups, and one page per format (REQUIREMENTS §47) —
      // and HR Master Data, the employee sheet those formats fetch from (§53).
      if (rest[0] === "master-data") return <HrMasterDataPage />;
      return rest[0] ? <HrDocumentPage key={rest[0]} slug={rest[0]} /> : <HrOverviewPage />;
    case "performance":
      // The scorecard: who did their documents on time, by person, department and module (REQUIREMENTS §64).
      return <PerformancePage />;
    case "activity":
      // Everything anybody has done on the portal (REQUIREMENTS §62).
      return <ActivityLogPage />;
    case "qc":
      // QC Records — Quality Control's overview of its thirty-eight formats in
      // their seven sections, and of its three log sheets kept with the
      // lamination line's paperwork (REQUIREMENTS §58). Each row opens the
      // format's own page, which is where "Open Document" lands too.
      return <QcOverviewPage />;
    case "document":
      // Any other log sheet's own page — where "Open Document" lands.
      return rest[0] ? <DocumentRecordsPage key={rest[0]} docId={rest[0]} /> : <NotFoundPage />;
    case "chemical-master":
      return <ChemicalMasterPage />;
    case "licence":
      return <LicencePage />;
    case "soc":
      return rest[0] ? <ComplianceDetailPage documentId={rest[0]} /> : <ComplianceListPage />;
    case "reports":
      // Same reasoning as Calendar's key above: forces a clean remount on a
      // genuine route change instead of relying solely on ReportsPage's own
      // props-resync effect, which otherwise paints the previous month for
      // one frame before catching up (effects run after paint).
      return <ReportsPage key={rest.join("/")} initialYear={yearParam(rest[0])} initialMonth={month0Param(rest[1])} initialTab={rest[2]} />;
    case "master-data":
      return <MasterDataPage />;
    case "demo":
      return <DemoModePage />;
    case "search":
      return <SearchPage />;
    case "assistant":
      return <AssistantPage />;
    default:
      return <NotFoundPage />;
  }
}

// One screen failing to render must not take the whole app with it: without
// this, any exception while drawing a page left a blank white window, sidebar
// and all. Keyed by the address (below), so going anywhere else starts over.
class ScreenErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error("A screen failed to render:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="empty-state" role="alert">
        <h2 className="text-xl mb-2">This screen couldn't be shown</h2>
        <p>
          Something went wrong while drawing it. Records already saved are not affected. <a href="#/dashboard">Back to the Dashboard</a>
        </p>
      </div>
    );
  }
}

function Screen() {
  const { path } = useRouter();
  return (
    <ScreenErrorBoundary key={path}>
      <RouteSwitch />
    </ScreenErrorBoundary>
  );
}

export function App() {
  return (
    <AssistantProvider>
      <SidebarProvider>
        <div className="app-shell">
          <Sidebar />
          <div className="app-main">
            <Topbar />
            <div className="app-content">
              <StorageFullBanner />
              <DatabaseSyncBanner />
              <Screen />
            </div>
          </div>
        </div>
      </SidebarProvider>
      <DocumentAssistant />
      {/* Mitra's reaction to work done on time or late — one toast, bottom left (REQUIREMENTS §64). */}
      <MitraReaction />
      <AssistantBriefingPopup />
    </AssistantProvider>
  );
}
