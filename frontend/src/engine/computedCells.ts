import { withAuditRisk } from "./auditRisk";
import { withMarketingCalc } from "./marketingCalc";
import { withCalibration } from "./calibration";
import { withMaintenanceCalc } from "./maintenanceCalc";
import { withPurchaseRatings } from "./purchaseRatings";

// EVERY WORKED-OUT CELL, IN ONE PASS (REQUIREMENTS §74, building on §61 and
// §68). Four families of form print a cell that is arithmetic on the cells
// beside it: the calibration records' deviations (engine/calibration.ts), the
// purchase registers' weighted ratings (engine/purchaseRatings.ts), the
// breakdown register's total minutes (engine/maintenanceCalc.ts) and the
// internal audit risk assessment's sum and audit frequency (engine/auditRisk.ts,
// §76). Each used to
// be applied wherever somebody remembered it — the ratings only as a sheet was
// drawn, the deviations only as it was typed into — so a record filled by the
// assistant, by sample data or by the demo year stored whatever the specimen
// happened to hold, and search, insights and the KPIs read stale figures.
//
// This is the one call for all of them, and it is made wherever a log sheet's
// data is shown or stored: as the sheet is drawn and saved
// (components/records/LogSheetRecordView.tsx), as it is typed into or changed
// by Mitra (pages/RecordPage.tsx), and as the assistant fills it
// (engine/autoFill.ts, which covers preparing, sample fill, guided fill and the
// demo year). Each pass returns the very same object when it changed nothing,
// and passes any other document's data straight through, so calling it on
// every render costs nothing for the forms without such a cell.
export function withComputedCells<T>(documentId: string | undefined, data: T): T {
  // F/MKT/02's satisfaction index and F/MKT/04's Pareto (REQUIREMENTS §77) join the pass the same way.
  return withMarketingCalc(documentId, withAuditRisk(documentId, withMaintenanceCalc(documentId, withCalibration(documentId, withPurchaseRatings(documentId, data)))));
}
