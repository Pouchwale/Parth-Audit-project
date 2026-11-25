import { ensureSeeded as ensureDocsSeeded } from "./repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "./repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "./repositories/hrMasterRepository";
import { ensureSeeded as ensurePurchaseMasterSeeded } from "./repositories/purchaseMasterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "./repositories/recordRepository";
import { RETIRED_DOCUMENT_IDS } from "./seed/documentDefinitions";
import { ensureRecordsGeneratedForMonth } from "../engine/recordGenerator";
import { ensureRulerSlots } from "../engine/rulerSlots";
import { deleteRecordWithTrail } from "../engine/recordCrud";
import { RULER_MADE_AHEAD } from "../engine/reminders";
import { prepareUnattended } from "../engine/assistantPrepare";
import { alignRecordsToWorkingCalendar, datedByFrequency, removeOffScheduleShells } from "../engine/calendarMigration";
import { alignServiceReportDrafts } from "../engine/serviceReportDrafts";
import { alignTubeLightDates } from "../engine/tubeLightMigration";
import { pinSchedulesWrittenOnRev00 } from "../engine/pmSchedule";
import { pinLuxRoundsWrittenOnRev01 } from "./luxRevisionMigration";
import { alignCompanyName } from "./companyNameMigration";
import { alignSeededLineNumbers } from "./lineNumbersMigration";
import { alignPapersOnFile } from "./paperOnFileMigration";
import { alignSeededPlaceholders } from "./seededPlaceholderMigration";
import { alignCertificateDates, weekDatesOnSheets } from "./certificateDatesMigration";
import { serialNumbersOnSheets } from "./serialNumbersMigration";
import { flyMonthYearsFollowDates, flyVisitsBackOnMondays } from "./flyVisitsMigration";
import { serviceReportsOnSaturdays, serviceVisitsOnSaturdays } from "./serviceSaturdaysMigration";
import { auditedYesOnOpenSheets } from "./purchaseAuditMigration";
import { alignRulerBoxes, alignRulerBoxesRound2 } from "./rulerBoxesMigration";
import { standardWeightsOnOpenSheets } from "./standardWeightsMigration";
import { scaleWeeksOnOpenSheets } from "./scaleWeeksMigration";
import { gmpYesOnOpenSheets } from "./gmpYesMigration";
import { qcSignsClearedOnOpenSheets } from "./qcSignsMigration";
import { qc35SheetsInPaperWords } from "./qc35WordsMigration";
import { hrTniTopicsMarkedX } from "./hrTniXMigration";
import { cleaningBoxesTicked } from "./cleaningTicksMigration";
import { ensureSurveyRound } from "../engine/pscSurveyRound";
import { sharpDailyFrequencyLifted, sharpDaySheetsFolded, sharpTypedLinesRestored } from "./sharpMonthMigration";
import { hrCriteriaBullets, hrDirectorDetails, hrDirectorNumbers, hrFeedbackSheetsOnFile, hrImpartedSheetsOnFile } from "./hrSuppliedOnFile";
import { demoModeRuledOut } from "../engine/features";
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
  // Purchase Master Data, the List of Approved Suppliers with their ratings (REQUIREMENTS §186) — seeded once, then Purchase's own.
  ensurePurchaseMasterSeeded();
  ensureRecordsSeeded();
  // Records of a document that has been withdrawn (e.g. the retired Lizard
  // Control service-report variant) would be unreachable — no page lists
  // them and no definition is left to render them — so drop them, Live and
  // Demo alike. Idempotent: nothing to remove on every later boot.
  for (const id of RETIRED_DOCUMENT_IDS) recordRepository.removeWhere({ documentId: id });
  // DEMO RECORDS LEFT FROM BEFORE DEMO MODE WAS TAKEN OUT (REQUIREMENTS §65). No
  // screen lists them any more, and a year of them — five lamination log sheets
  // of 24 rows a day — is most of the records array a slow computer parses,
  // scans and sends for ever. So, once the server has SAID this installation
  // has no Demo Mode (not merely said nothing), they go: the same one call the
  // Demo Mode page's "Clear All Demo Data" makes. It matches isDemo === true
  // and nothing else, so a Live record is never touched; the working copy was
  // loaded from the database a moment ago (main.tsx), so the removal is sent
  // against that copy and the merge keeps a line removed here and untouched
  // elsewhere removed (data/serverSync.ts); a department's account removes only
  // its own departments' lines (backend/index.ts). A browser holding an old
  // copy from before the database may send them back once — and clears them
  // again right here on its own start. Nothing to remove, nothing written.
  if (demoModeRuledOut()) recordRepository.clearDemoData();
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
  // F/MNT/03 schedules written on Rev 00 stay on Rev 00, their typed Actuals
  // with them, now that Rev 01 reads each Actual from F/MNT/02 (REQUIREMENTS
  // §82) — before the month's generation and preparation, so both see them so.
  pinSchedulesWrittenOnRev00();
  // F/MNT/11's rounds written on Rev 01 keep that page; the owner's page of 15.10.2025 is the format (REQUIREMENTS §316).
  pinLuxRoundsWrittenOnRev01();
  // The company's name as the owner gave it on 02-Oct-2026, in what this
  // installation had already stored: a header typed over with an old spelling,
  // a format's stored layout, a corrected statement, the master data and every
  // record — each changed record with a line in its history. After the clean-ups
  // above, so none of theirs folds into its line; before the month's generation
  // and preparation, so nothing carries an old spelling forward.
  alignCompanyName();
  // Two seeded records wrote each line's own number in its words beside the sheet's
  // Sr. No.: their lines take the words without it (REQUIREMENTS §102).
  alignSeededLineNumbers();
  // Two seeded papers as their papers write them: F/QC/16's own Sr. No., F/QC/30's participants a line each (§111).
  alignPapersOnFile();
  // The F/QC/11 page on file stored DCRS's "TO BE CONFIRMED" in its Serial No, which printed and was carried onto
  // every new sheet: it takes the paper's blank box (REQUIREMENTS §111 part 6). Before the month's preparation, so
  // nothing carries it forward.
  alignSeededPlaceholders();
  // A changed schedule's sheets (the owner, 28-Oct-2026: F/QC/11 every Tuesday, F/QC/12 every Sunday, F/HR/18 the 1st and
  // 3rd Monday): the old schedule's untouched sheets from today on go, before the month's generation makes the new ones.
  // The three service reports on their 1st and 3rd Saturday: an earlier frequency set on them taken off (REQUIREMENTS §221).
  serviceReportsOnSaturdays();
  serviceVisitsOnSaturdays();
  // F/PRD/10, 22, 23 and 24 a sheet a month (REQUIREMENTS §259): their untouched day sheets folded into the month's.
  sharpDailyFrequencyLifted();
  sharpDaySheetsFolded();
  // ...and the razor blade lines typed on the plant's day sheets, put back where the fill wrote over them (§263).
  sharpTypedLinesRestored();
  removeOffScheduleShells();
  // ...and an open sheet dated by its frequency, not the day New was pressed (REQUIREMENTS §208).
  datedByFrequency();
  // The calibration certificate's dates (§129) in the sheets still open, each with a line in its history.
  alignCertificateDates();
  // F/QC/11's Calibration Date and Due Date, the week's own (REQUIREMENTS §223).
  weekDatesOnSheets();
  // F/QC/11's and F/QC/12's Serial No, the record's running number (REQUIREMENTS §233).
  serialNumbersOnSheets();
  // F/HR/18: November 2026's two visits back on their Mondays, and each visit headed with its own month (REQUIREMENTS §238).
  flyVisitsBackOnMondays();
  flyMonthYearsFollowDates();
  // F/PUR/02's sheets still open: every audit point AUDITED Yes, the NC table from the points rated NC (REQUIREMENTS §229).
  auditedYesOnOpenSheets();
  // F/QC/17's new starting boxes (30-10-26) in the sheets created before, still open, each with a line in its history.
  alignRulerBoxes();
  // ...and round 2 (30-10-26): Range, Least count, Kristeel and the report number from the certificate's years.
  alignRulerBoxesRound2();
  // F/QC/12's fixed weights on every line of the sheets still open (§146), each with a line in its history.
  standardWeightsOnOpenSheets();
  // ...and a line for each week of its month, four or five (REQUIREMENTS §235).
  scaleWeeksOnOpenSheets();
  // F/HR/19's every point at Yes on the untouched sheets already made (§170), each with a line in its history.
  gmpYesOnOpenSheets();
  // F/QC/11, 12, 17: the names DCRS wrote on the sheets still open come off; the sign boxes are the person's (REQUIREMENTS §288).
  qcSignsClearedOnOpenSheets();
  // F/QC/35's and F/QC/37's open sheets in the paper's words (REQUIREMENTS §313, §319).
  qc35SheetsInPaperWords();
  // F/HR/08's topics marked X as on the paper: Yes becomes X, No a blank (REQUIREMENTS §330).
  hrTniTopicsMarkedX();
  // F/HR/15's and F/HR/16's area boxes a tick: a "done" word on the open sheets reads as the tick (REQUIREMENTS §378).
  cleaningBoxesTicked();

  const today = new Date(todayISO());
  // F/QC/17's twenty records of this year for each scale, its records of the time before filed (REQUIREMENTS §220).
  ensureRulerSlots(todayISO(), (r) => deleteRecordWithTrail(r, "System", RULER_MADE_AHEAD));
  ensureRecordsGeneratedForMonth(today.getFullYear(), today.getMonth(), { isDemo: false });
  // F/HR/20: the year's round of 200 on file, the plant's 2026 round made now (REQUIREMENTS §356).
  ensureSurveyRound(todayISO());
  // Only F/QC/12 and F/HR/20's round fill by themselves; every other record is filled when a person opens it (§289, §356).
  prepareUnattended();
  // ...and the day sheets whose lines the month's sheet now holds, folded away (REQUIREMENTS §259).
  sharpDaySheetsFolded();
  // What the owner supplied on 21-Nov-2026: the 38 filled F/HR/12 sheets, and the three directors' GP3 Nos. (REQUIREMENTS §273).
  hrFeedbackSheetsOnFile();
  hrImpartedSheetsOnFile();
  hrDirectorNumbers();
  hrDirectorDetails();
  // F/HR/02's bullets, as its paper prints them (REQUIREMENTS §275).
  hrCriteriaBullets();
}
