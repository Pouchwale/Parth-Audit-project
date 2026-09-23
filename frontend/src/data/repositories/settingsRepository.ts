import { readJSON, writeJSON } from "../storageAdapter";
import { demoModeAvailable } from "../../engine/features";
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
  // The day the daily notification was last shown, so it comes once a day and
  // not once a reload (REQUIREMENTS §69).
  nudgeShownOn: string | null;
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
// THE DATE THE SYSTEM WENT LIVE is the company's, not a person's (REQUIREMENTS
// §55): the records are shared, so the floor that decides which of them are
// real obligations has to be the same for everyone. It is kept on its own
// company-wide item; the earliest date anyone's copy knows of wins (a person's
// own settings from before carry theirs), so a person signing in for the first
// time can never move it forward and make real overdue work look like noise.
const LIVE_KEY = "live-start";

function companyLiveStart(): string | null {
  const date = readJSON<{ date?: unknown }>(LIVE_KEY, {}).date;
  return typeof date === "string" && date ? date : null;
}

const DEFAULTS: AppSettings = {
  mode: "live",
  language: "en",
  speakReplies: false,
  workdayStart: "09:00",
  workdayEnd: "18:00",
  briefingShown: { date: "", slots: [] },
  briefingFirstShownAt: null,
  nudgeShownOn: null,
  liveStartDate: null,
  agreementReminderSnoozedUntil: null,
};

export const settingsRepository = {
  get(): AppSettings {
    // Spread over DEFAULTS (not returned raw) so a settings object saved
    // before a field like liveStartDate existed still comes back with it
    // present (as its default) rather than undefined.
    const stored = readJSON<Partial<AppSettings>>(KEY, {});
    // A "demo" stored from before Demo Mode was taken out of the product reads
    // as "live" — here, so whatever reads the settings agrees (REQUIREMENTS §65).
    const mode: AppMode = stored.mode === "demo" && demoModeAvailable() ? "demo" : "live";
    return { ...DEFAULTS, ...stored, mode, liveStartDate: companyLiveStart() ?? stored.liveStartDate ?? null };
  },
  update(patch: Partial<AppSettings>): AppSettings {
    const { liveStartDate, ...own } = patch;
    if (liveStartDate !== undefined) writeJSON(LIVE_KEY, { date: liveStartDate });
    writeJSON(KEY, { ...DEFAULTS, ...readJSON<Partial<AppSettings>>(KEY, {}), ...own });
    return this.get();
  },
  // Idempotent: the first call anywhere stamps today as the company's floor
  // (or the earlier date a person's own settings carried from before); every
  // later call just returns that same date.
  ensureLiveStartDate(todayISO: string): string {
    const company = companyLiveStart();
    const own = readJSON<Partial<AppSettings>>(KEY, {}).liveStartDate;
    const earliest = [company, own, todayISO].filter((d): d is string => typeof d === "string" && !!d).sort()[0];
    if (company && company <= earliest) return company;
    writeJSON(LIVE_KEY, { date: earliest });
    return earliest;
  },
  briefingSlotsShownOn(dateISO: string): BriefingSlot[] {
    const s = this.get();
    return s.briefingShown?.date === dateISO ? s.briefingShown.slots : [];
  },
  /** Whether the day's notification has already been shown (REQUIREMENTS §69). */
  nudgeShownOn(dateISO: string): boolean {
    return this.get().nudgeShownOn === dateISO;
  },
  markNudgeShown(dateISO: string): void {
    const s = this.get();
    const { liveStartDate: _floor, ...own } = s;
    writeJSON(KEY, { ...own, nudgeShownOn: dateISO });
  },
  markBriefingShown(dateISO: string, slot: BriefingSlot): void {
    const s = this.get();
    const slots = s.briefingShown?.date === dateISO ? s.briefingShown.slots : [];
    const { liveStartDate: _floor, ...own } = s;
    writeJSON(KEY, {
      ...own,
      briefingShown: { date: dateISO, slots: slots.includes(slot) ? slots : [...slots, slot] },
      briefingFirstShownAt: s.briefingFirstShownAt ?? new Date().toISOString(),
    });
  },
};
