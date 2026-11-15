import { datedByFrequency, removeOffScheduleShells } from "./calendarMigration";
import { ensureNearTermRecordsGenerated } from "./reminders";

/**
 * A FREQUENCY SET, PUT TO WORK AT ONCE (REQUIREMENTS §216; the owner, 15-Nov-2026: "everytime user set frequency of any
 * document then according to that it will appear and remind user through notification and email both"). Called by
 * every place a frequency is set - the Frequency page, Master Data, Mitra - right after Master Data's override is
 * written: the old schedule's blank sheets for days the new one does not name go (§130), the new schedule's sheets
 * for this month and the days ahead are made now rather than at tomorrow's start, and open sheets are dated by the
 * new frequency (§208). The calendar and the bell show them at once; the sheets reach the server with the next save,
 * and the server's reminder run (every 5 minutes, backend/notificationJobs.ts) tells the people who answer for them on
 * the bell, the phone and by email (the same ledger) - the server also works the new schedule's sheets out itself
 * when Master Data changes, so nobody is missed even before anything is saved. Returns how many sheets were made.
 */
export function applyFrequencyChange(): number {
  removeOffScheduleShells();
  const made = ensureNearTermRecordsGenerated(false);
  datedByFrequency();
  return made;
}
