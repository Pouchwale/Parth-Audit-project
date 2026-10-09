// NOTIFICATIONS ON THE PHONE. Plain functions with no imports, so the server's tests can check them
// (server/test/phone-notifications.test.ts).
//
// DCRS works out every notification, keeps them, writes their words in English, Hindi or Gujarati and sends the push
// alerts (DCRS's docs/chatbot-integration.md, "Notification contract changes"). The app only shows them, opens what one
// is about, keeps the app's badge to the number still open, and keeps a daily reminder on the phone for when alerts
// cannot reach it.
import type { NotificationItem, NotificationKind, NotificationLanguage, ReplyLanguage } from '@shared/api';

/** Every kind DCRS sends, in the order Settings lists them. */
export const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  'ready',
  'needs_input',
  'due',
  'overdue',
  'verify',
  'sent_back',
  'upcoming',
  'access_changed',
  'boss_summary',
  'escalation',
];

/** What each kind is, in Settings' words. */
export const KIND_WORDS: Record<NotificationKind, { label: string; hint: string }> = {
  ready: { label: 'Ready for your OK', hint: 'A record the assistant prepared that passes its checks: review it, then submit.' },
  needs_input: { label: 'Readings to enter', hint: 'A prepared record waiting for what you saw.' },
  due: { label: 'Due today', hint: 'A record due today that nobody has started.' },
  overdue: { label: 'Overdue', hint: 'A record past its day: once a day.' },
  verify: { label: 'To verify', hint: "Someone else's record waiting for verification." },
  sent_back: { label: 'Sent back', hint: 'A record of yours sent back for changes, with the reason.' },
  upcoming: { label: 'Coming up', hint: 'A heads-up before a weekly, monthly or yearly record is due.' },
  access_changed: { label: 'Access changes', hint: 'When the super admin changes what you may do.' },
  boss_summary: { label: 'Morning and evening summary', hint: 'Each module: prepared, waiting for readings, for verification, overdue.' },
  escalation: { label: 'Escalations', hint: 'People or departments often late, or with records not done.' },
};

/** The kinds a person can get: the summary and the escalations are the super admin's. */
export function kindsFor(role: 'user' | 'super_admin'): NotificationKind[] {
  return NOTIFICATION_KINDS.filter((kind) => role === 'super_admin' || (kind !== 'boss_summary' && kind !== 'escalation'));
}

/**
 * The language DCRS writes this phone's alerts in: the one chosen for Mitra's replies, or for "the language I write
 * in", the phone's own language when it is Gujarati or Hindi, else English.
 */
export function pushLanguage(reply: ReplyLanguage, locale?: string | null): NotificationLanguage {
  if (reply === 'en' || reply === 'gu' || reply === 'hi') return reply;
  const language = (locale ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return language === 'gu' ? 'gu' : language === 'hi' ? 'hi' : 'en';
}

/** What this phone last told DCRS (through the Mitra server) about its alerts. */
export interface Registration {
  token: string;
  language: NotificationLanguage;
  /** The Mitra server it was told through, and who was signed in: another of either is another registration. */
  server: string;
  userId: string;
  /** When, in milliseconds. */
  at: number;
}

/** How often a registration that has not changed is sent again, so DCRS knows the phone is still in use. */
export const REGISTER_AGAIN_MS = 24 * 60 * 60 * 1000;

/** Whether to send the phone's token again: a new token, language, server or person, or a day since the last time. */
export function needsRegistering(saved: Registration | null, now: Omit<Registration, 'at'>, nowMs: number): boolean {
  if (!saved) return true;
  if (saved.token !== now.token || saved.language !== now.language || saved.server !== now.server || saved.userId !== now.userId) return true;
  return nowMs - saved.at >= REGISTER_AGAIN_MS || nowMs < saved.at;
}

/** A saved registration read back, or null when it is missing or not one. */
export function parseRegistration(saved: string | null): Registration | null {
  if (!saved) return null;
  try {
    const value = JSON.parse(saved) as Partial<Registration>;
    const languages: readonly string[] = ['en', 'hi', 'gu'];
    if (typeof value.token !== 'string' || typeof value.server !== 'string' || typeof value.userId !== 'string' || typeof value.at !== 'number') return null;
    if (typeof value.language !== 'string' || !languages.includes(value.language)) return null;
    return value as Registration;
  } catch {
    return null;
  }
}

/** A screen of the app a notification opens. */
export type AppLink = { screen: 'task'; recordId: string } | { screen: 'tasks' } | { screen: 'inbox' };

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** The screen a link names: mitra://task/<recordId>, mitra://tasks, mitra://inbox, or the same as a path. */
function linkFromUrl(url: string): AppLink | null {
  const path = url
    .trim()
    .replace(/^mitra:\/\/\/?/i, '/')
    .replace(/[?#].*$/, '');
  const task = /^\/task\/([^/]+)\/?$/.exec(path);
  if (task?.[1]) {
    try {
      const recordId = decodeURIComponent(task[1]).trim();
      return recordId ? { screen: 'task', recordId } : null;
    } catch {
      return null;
    }
  }
  if (/^\/tasks\/?$/.test(path)) return { screen: 'tasks' };
  if (/^\/inbox\/?$/.test(path)) return { screen: 'inbox' };
  return null;
}

/** Kinds about the day as a whole, or a document not yet started: they open Tasks. */
const OPENS_TASKS = new Set<string>(['due', 'upcoming', 'boss_summary', 'escalation']);

/**
 * Where a tapped alert opens, from what it carries: its link (mitra://task/<recordId> or mitra://inbox), else its
 * record, else Tasks for a kind about the day, else the inbox. An alert that names nothing the app knows opens the inbox.
 */
export function linkOf(data: unknown): AppLink {
  if (!isObject(data)) return { screen: 'inbox' };
  const said = typeof data.url === 'string' ? linkFromUrl(data.url) : null;
  if (said) return said;
  if (typeof data.recordId === 'string' && data.recordId.trim()) return { screen: 'task', recordId: data.recordId.trim() };
  if (typeof data.kind === 'string' && OPENS_TASKS.has(data.kind)) return { screen: 'tasks' };
  return { screen: 'inbox' };
}

/** Where an inbox line opens, or null when it asks nothing more than to be read (a change of access, say). */
export function itemLink(item: Pick<NotificationItem, 'kind' | 'data'>): AppLink | null {
  const link = linkOf({ ...item.data, kind: item.kind });
  return link.screen === 'inbox' ? null : link;
}

/** The notification's id in an alert's data, when DCRS sends one, so opening it marks it read. */
export function notificationIdOf(data: unknown): number | null {
  if (!isObject(data)) return null;
  const id = data.notificationId ?? data.id;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The day (YYYY-MM-DD) a moment falls on, `offsetMinutes` east of UTC (330 at the plant). */
export function dayOf(iso: string, offsetMinutes: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  return new Date(at + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

function dayBefore(day: string): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  return new Date(at - 86_400_000).toISOString().slice(0, 10);
}

/** "Today", "Yesterday", or the day in words: "Tuesday 6 Oct". */
export function dayTitle(day: string, today: string): string {
  if (day === today) return 'Today';
  if (day === dayBefore(today)) return 'Yesterday';
  const at = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return day;
  const year = day.slice(0, 4) === today.slice(0, 4) ? '' : ` ${day.slice(0, 4)}`;
  return `${WEEKDAYS[at.getUTCDay()]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}${year}`;
}

export interface InboxSection {
  day: string;
  title: string;
  data: NotificationItem[];
}

/** The inbox by day, newest first, in the order DCRS gave them within a day. */
export function inboxSections(items: readonly NotificationItem[], nowIso: string, offsetMinutes: number): InboxSection[] {
  const today = dayOf(nowIso, offsetMinutes);
  const sections: InboxSection[] = [];
  for (const item of items) {
    const day = dayOf(item.createdAt, offsetMinutes);
    const last = sections.at(-1);
    if (last && last.day === day) last.data.push(item);
    else sections.push({ day, title: dayTitle(day, today), data: [item] });
  }
  return sections;
}

/** Whether this phone gets push alerts, and if not, why. */
export type PushState =
  | { status: 'checking' }
  | { status: 'on' }
  | { status: 'off'; reason: 'web' | 'expo-go' | 'not-asked' | 'denied' | 'no-token' | 'server' | 'not-offered' };

/** The state of push alerts on this phone, in plain words for Settings. */
export function pushStateWords(state: PushState): string {
  if (state.status === 'checking') return 'Checking…';
  if (state.status === 'on') return "On. Alerts reach this phone even when Mitra is closed, during the plant's working hours.";
  switch (state.reason) {
    case 'web':
      return 'Alerts come to the Mitra app on a phone, not to a browser. The inbox works here.';
    case 'expo-go':
      return 'Off in Expo Go: Expo Go on Android cannot receive alerts. Install the Mitra app (version 1.1.0) to get them. The inbox, Tasks and the daily reminder work here.';
    case 'not-asked':
      return 'Off. Tap “Turn on alerts” to get them.';
    case 'denied':
      return "Off: notifications are not allowed for Mitra in the phone's settings. Allow them there to get alerts.";
    case 'no-token':
      return 'Off: alerts are not set up for this app yet. The inbox, Tasks and the daily reminder still work.';
    case 'server':
      return 'Off for now: this phone could not be registered for alerts. Mitra tries again the next time it opens.';
    case 'not-offered':
      return 'Off: DCRS on this server does not send alerts yet. The daily reminder still works.';
  }
}

/** The daily reminder: on, off, or (the default) on only while push alerts cannot reach this phone. */
export type ReminderSetting = 'auto' | 'on' | 'off';

export function remindersOn(setting: ReminderSetting, pushOn: boolean): boolean {
  return setting === 'on' || (setting === 'auto' && !pushOn);
}

/** The reminder's times on each working day: as the staff's hours start, and before they end. */
export const REMINDER_TIMES: readonly { hour: number; minute: number }[] = [
  { hour: 8, minute: 50 },
  { hour: 17, minute: 30 },
];

/** The plant's weekly off when DCRS has not said otherwise. */
export const DEFAULT_WEEKLY_OFF = 'Thursday';

/**
 * When the reminder rings: each time, on every day of the week but the weekly off, as weekly triggers (weekday 1 is
 * Sunday, as the phone counts). Holidays are not known on the phone, so a reminder on one is only a nudge to look.
 */
export function reminderSlots(weeklyOff?: string | null): { weekday: number; hour: number; minute: number }[] {
  const off = WEEKDAYS.findIndex((day) => day.toLowerCase() === (weeklyOff ?? DEFAULT_WEEKLY_OFF).trim().toLowerCase());
  const skip = off < 0 ? WEEKDAYS.indexOf(DEFAULT_WEEKLY_OFF) : off;
  const slots: { weekday: number; hour: number; minute: number }[] = [];
  for (let day = 0; day < 7; day++) {
    if (day === skip) continue;
    for (const time of REMINDER_TIMES) slots.push({ weekday: day + 1, ...time });
  }
  return slots;
}

/** The reminder's words, in the alerts' language. */
export function reminderWords(language: NotificationLanguage, hour: number): { title: string; body: string } {
  const morning = hour < 12;
  switch (language) {
    case 'gu':
      return {
        title: 'મિત્ર: તમારાં કામ',
        body: morning ? 'આજે તમારા માટે શું તૈયાર છે અને શું બાકી છે, Tasks માં જુઓ.' : 'દિવસ પૂરો થાય તે પહેલાં Tasks માં બાકી રેકોર્ડ જોઈ લો.',
      };
    case 'hi':
      return {
        title: 'मित्र: आपके काम',
        body: morning ? 'आज आपके लिए क्या तैयार है और क्या बाकी है, Tasks में देखें।' : 'दिन खत्म होने से पहले Tasks में बाकी रिकॉर्ड देख लें।',
      };
    default:
      return {
        title: 'Mitra: your tasks',
        body: morning ? 'See what is ready for your OK and what needs your readings today, in Tasks.' : 'Before the day ends, check the records still open in Tasks.',
      };
  }
}
