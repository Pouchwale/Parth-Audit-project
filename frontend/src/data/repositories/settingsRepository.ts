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
  // SOUND AND VOICE (REQUIREMENTS §81). Short sounds on the bell, the day's
  // notification, a submit and a celebration; Mitra's spoken reminders and the
  // spoken briefing — each can be switched off (Master Data → Working Hours,
  // and the top bar's sound button).
  soundsOn: boolean;
  voiceOn: boolean;
  /** Which voice Mitra speaks with, where there is a choice. */
  voiceKind: "female" | "male";
  /** Minutes between spoken reminders during working hours while something is due or overdue. */
  remindEveryMin: number;
  /** What was already said aloud today (a reminder per record, the briefing), so nothing is said twice. Not handed on. */
  spokenToday: { date: string; keys: string[] };
  /** Which celebrations were already shown today (all done, a streak day, an achievement). Not handed on. */
  celebratedToday: { date: string; keys: string[] };
  /**
   * THE GUIDED TOUR (REQUIREMENTS §85, components/tour): per person, under the
   * account's own id — `off`: "Don't show this again"; `startedOn`: the day it last
   * started by itself (once a day, on the first Dashboard visit). Keyed by the id
   * because a plant computer hands one person's settings on to the next person who
   * signs in there for the first time (data/serverSync.ts): the next person must
   * still get their tour. Read and written only through tourFor / markTourStarted /
   * setTourOff, which keep the signed-in person's entry alone.
   */
  tour: Record<string, TourFlags>;
}

/** One person's guided-tour flags (AppSettings.tour). */
export interface TourFlags {
  off?: boolean;
  startedOn?: string;
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
  soundsOn: true,
  voiceOn: true,
  voiceKind: "female",
  remindEveryMin: 45,
  spokenToday: { date: "", keys: [] },
  celebratedToday: { date: "", keys: [] },
  tour: {},
};

/** A person's tour flags as stored — anything malformed reads as nothing set. */
function tourFlagsOf(tour: unknown, personId: string): { off: boolean; startedOn: string | null } {
  const own = tour && typeof tour === "object" && !Array.isArray(tour) ? (tour as Record<string, unknown>)[personId] : undefined;
  const flags = own && typeof own === "object" ? (own as TourFlags) : {};
  return { off: flags.off === true, startedOn: typeof flags.startedOn === "string" && flags.startedOn ? flags.startedOn : null };
}

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
  /** Whether `key` (a record's reminder, "briefing", "all-done" …) was already said or celebrated today (REQUIREMENTS §81). */
  doneToday(list: "spokenToday" | "celebratedToday", dateISO: string, key: string): boolean {
    const l = this.get()[list];
    return l?.date === dateISO && l.keys.includes(key);
  },
  /** Marks `key` said or celebrated today; the list starts again each day and keeps at most 200 keys. */
  markDoneToday(list: "spokenToday" | "celebratedToday", dateISO: string, key: string): void {
    const s = this.get();
    const l = s[list];
    const keys = l?.date === dateISO ? l.keys : [];
    if (keys.includes(key)) return;
    const { liveStartDate: _floor, ...own } = s;
    writeJSON(KEY, { ...own, [list]: { date: dateISO, keys: [...keys, key].slice(-200) } });
  },
  /** The signed-in person's guided-tour flags (REQUIREMENTS §85). */
  tourFor(personId: string): { off: boolean; startedOn: string | null } {
    return tourFlagsOf(this.get().tour, personId);
  },
  /** The tour started by itself today for this person — it does not again until tomorrow. */
  markTourStarted(personId: string, dateISO: string): void {
    this.writeTour(personId, { startedOn: dateISO });
  },
  /** "Don't show this again", ticked (true) or taken back (false). "Take the tour" still runs it either way. */
  setTourOff(personId: string, off: boolean): void {
    this.writeTour(personId, { off });
  },
  /** Only the person's own entry is kept: one handed on from somebody else's settings is dropped on the first write. */
  writeTour(personId: string, patch: TourFlags): void {
    if (!personId) return;
    const s = this.get();
    const now = tourFlagsOf(s.tour, personId);
    const next: TourFlags = { ...(now.off ? { off: true } : {}), ...(now.startedOn ? { startedOn: now.startedOn } : {}), ...patch };
    if (next.off === false) delete next.off;
    const { liveStartDate: _floor, ...own } = s;
    writeJSON(KEY, { ...own, tour: { [personId]: next } });
  },
};
