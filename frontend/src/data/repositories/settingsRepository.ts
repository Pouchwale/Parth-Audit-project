import { readJSON, writeJSON } from "../storageAdapter";
import type { Language } from "../../i18n/strings";

export type AppMode = "live" | "demo";

export type BriefingSlot = "first" | "morning" | "evening";

export interface AppSettings {
  mode: AppMode;
  // Working hours (24h "HH:MM"). The assistant's briefing pops up by itself
  // during the first hour of the day (morning slot) and — only if something
  // is still unsubmitted — during the last hour (evening slot). Editable in
  // Master Data → Settings.
  workdayStart: string;
  workdayEnd: string;
  // Which automatic briefings have already been shown today, so a reload
  // never repeats one. "first" = the very first time this browser opened the
  // app (shown regardless of the clock).
  briefingShown: { date: string; slots: BriefingSlot[] };
  briefingFirstShownAt: string | null;
  // The earliest date the recurring-record generator (engine/recordGenerator.ts)
  // is allowed to create a real, Live "Due" shell for — set once, the first
  // time the app ever boots on this browser, and never changed after. Without
  // this floor, simply browsing the Calendar/Reports/Day View back to a month
  // before the system went live would silently manufacture a backlog of
  // obligations for dates the digital system didn't exist yet (see
  // engine/backlogCleanup.ts for cleaning up any that already got created).
  liveStartDate: string | null;
  // Interface language (Dashboard → Language, and the top bar). Controlled
  // document text is never translated — see src/i18n/strings.ts.
  language: Language;
  // Read the assistant's replies aloud after a voice question (the user can
  // turn it on for typed messages too). Voice input itself is always
  // press-to-talk, never left listening.
  speakReplies: boolean;
  // "Remind me later" on the two-yearly service provider agreement: the date
  // the reminder starts asking again (engine/serviceAgreement.ts). It is only
  // ever a snooze — a week — never a way to switch the reminder off.
  agreementReminderSnoozedUntil: string | null;
}

const KEY = "settings";

const DEFAULTS: AppSettings = {
  mode: "live",
  language: "en",
  speakReplies: false,
  workdayStart: "09:00",
  workdayEnd: "18:00",
  briefingShown: { date: "", slots: [] },
  briefingFirstShownAt: null,
  liveStartDate: null,
  agreementReminderSnoozedUntil: null,
};

export const settingsRepository = {
  get(): AppSettings {
    // Spread over DEFAULTS (not returned raw) so a settings object saved
    // before a field like liveStartDate existed still comes back with it
    // present (as its default) rather than undefined.
    return { ...DEFAULTS, ...readJSON<Partial<AppSettings>>(KEY, {}) };
  },
  update(patch: Partial<AppSettings>): AppSettings {
    const next = { ...this.get(), ...patch };
    writeJSON(KEY, next);
    return next;
  },
  // Idempotent: the first call on a given browser stamps today as the
  // floor and persists it; every later call just returns that same date.
  ensureLiveStartDate(todayISO: string): string {
    const s = this.get();
    if (s.liveStartDate) return s.liveStartDate;
    writeJSON(KEY, { ...s, liveStartDate: todayISO });
    return todayISO;
  },
  briefingSlotsShownOn(dateISO: string): BriefingSlot[] {
    const s = this.get();
    return s.briefingShown?.date === dateISO ? s.briefingShown.slots : [];
  },
  markBriefingShown(dateISO: string, slot: BriefingSlot): void {
    const s = this.get();
    const slots = s.briefingShown?.date === dateISO ? s.briefingShown.slots : [];
    writeJSON(KEY, {
      ...s,
      briefingShown: { date: dateISO, slots: slots.includes(slot) ? slots : [...slots, slot] },
      briefingFirstShownAt: s.briefingFirstShownAt ?? new Date().toISOString(),
    });
  },
};
