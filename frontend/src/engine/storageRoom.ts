import type { RecordInstance } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { findPreLaunchNoise } from "./backlogCleanup";

// WHAT IS TAKING THE ROOM (REQUIREMENTS §79). When the browser's working copy
// is nearly as large as the browser allows, the warning used to say only
// "ask your administrator". Most of the time the room is taken by something a
// person can clear in one click and lose nothing by: the demo year Demo Mode
// generates (made-up, about 4 MB), or blank sheets the calendar made for dates
// before the system went live. This adds the working copy up by kind, so the
// banner can say which it is and offer the right button — and only when the
// records people wrote are what is taking the room does it fall back to the
// administrator's archive.
//
// Sizes are the records' JSON, as localStorage holds them: one JSON.stringify
// per record, a few dozen milliseconds for a full browser — done once, when the
// banner opens, off the paint (components/common/StorageFullBanner.tsx).

export interface RoomShare {
  records: number;
  chars: number;
}

export interface StorageBreakdown {
  /** Demo Mode's made-up records (isDemo). */
  demo: RoomShare;
  /** Blank shells from before the system went live that nobody wrote on (engine/backlogCleanup.ts). */
  leftovers: RoomShare;
  /** Everything else: the plant's own records. */
  written: RoomShare;
  /** All records together. */
  all: RoomShare;
}

const size = (r: RecordInstance): number => JSON.stringify(r).length + 1; // and the comma after it in the stored list

export function storageBreakdown(): StorageBreakdown {
  const leftoverIds = new Set(findPreLaunchNoise().map((r) => r.id));
  const out: StorageBreakdown = { demo: { records: 0, chars: 0 }, leftovers: { records: 0, chars: 0 }, written: { records: 0, chars: 0 }, all: { records: 0, chars: 0 } };
  for (const r of recordRepository.queryUnscoped({})) {
    const chars = size(r);
    const share = r.isDemo ? out.demo : leftoverIds.has(r.id) ? out.leftovers : out.written;
    share.records += 1;
    share.chars += chars;
    out.all.records += 1;
    out.all.chars += chars;
  }
  return out;
}

/** A size the way people say it: "4.9 MB", "340 KB" — a character counted as a byte, as the browser's own "5 MB" is counted. */
export function roomLabel(chars: number): string {
  if (chars >= 1_000_000) return `${(Math.round(chars / 100_000) / 10).toFixed(1)} MB`;
  if (chars >= 1_000) return `${Math.round(chars / 1_000)} KB`;
  return `${chars} bytes`;
}
