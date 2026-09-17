import { ensureSeeded as ensureDocsSeeded } from "./repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "./repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "./repositories/hrMasterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "./repositories/recordRepository";
import { RETIRED_DOCUMENT_IDS } from "./seed/documentDefinitions";
import { ensureRecordsGeneratedForMonth } from "../engine/recordGenerator";
import { prepareDueRecords } from "../engine/assistantPrepare";
import { alignRecordsToWorkingCalendar } from "../engine/calendarMigration";
import { alignServiceReportDrafts } from "../engine/serviceReportDrafts";
import { alignTubeLightDates } from "../engine/tubeLightMigration";
import { todayISO } from "../utils/date";

// Called once on app start. Seeds / re-syncs master, document and historical
// data (see each repository's ensureSeeded for the merge rules), makes sure
// the current month's recurring records exist, and then has the assistant
// fill in everything that is due today or earlier — so by the time the
// Dashboard renders, the user's records are already prepared and waiting
// for a review rather than sitting empty.
export function bootstrap(): void {
  ensureDocsSeeded();
  ensureMasterSeeded();
  // The HR Master Data sheet (REQUIREMENTS §53) — seeded once, then HR's own.
  ensureHrMasterSeeded();
  ensureRecordsSeeded();
  // Records of a document that has been withdrawn (e.g. the retired Lizard
  // Control service-report variant) would be unreachable — no page lists
  // them and no definition is left to render them — so drop them, Live and
  // Demo alike. Idempotent: nothing to remove on every later boot.
  for (const id of RETIRED_DOCUMENT_IDS) recordRepository.removeWhere({ documentId: id });
  // Records an earlier build (or an earlier version of the calendar) left on
  // a closed day are moved / re-marked / dropped exactly as the generator
  // would place them today — before this month's generation and the
  // assistant's preparation run, so both see the corrected set.
  alignRecordsToWorkingCalendar();
  // Service-report drafts written before the one-quantity-per-material rule
  // are brought into line with it — drafts only, and logged in their history.
  alignServiceReportDrafts();
  // Fly catcher drafts whose tube-light dates an earlier version COMPUTED on a
  // December cycle are corrected to the two dates the department stated, so a
  // stale record cannot keep seeding the next one through carry-forward —
  // drafts only, and logged in their history (REQUIREMENTS §44).
  alignTubeLightDates();

  const today = new Date(todayISO());
  ensureRecordsGeneratedForMonth(today.getFullYear(), today.getMonth(), { isDemo: false });
  prepareDueRecords();
}
