import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/AppStore";
import { useAuth } from "../../store/AuthContext";
import { useRouter } from "../../store/router";
import { useT } from "../../i18n";
import type { Language } from "../../i18n/strings";
import type { AuthUser } from "../../types/auth";
import { CUE_EVENT, CUE_NAMES, SAY_EVENT, emitCue, emitSay, type CueName, type SayRequest } from "../../engine/engageBus";
import { notificationsFor, type DaysWork, type Notification } from "../../engine/notifications";
import { closedDays, periodFor } from "../../engine/performance";
import { keptTo } from "../../engine/latenessCore";
import { firstNameOf } from "../../engine/assistantPersona";
import { settingsRepository, type AppSettings } from "../../data/repositories/settingsRepository";
import { recordRepository } from "../../data/repositories/recordRepository";
import { documentRepository } from "../../data/repositories/documentRepository";
import { masterRepository } from "../../data/repositories/masterRepository";
import { todayISO } from "../../utils/date";
import { cueDuration, hadUserGesture, playCue, watchFirstGesture } from "../../utils/sounds";
import { isMicBusy, isSaying, nothingDueLine, reminderLine, say, stopLine, stopVoice, updateVoiceSettings, type ReminderFacts } from "../../utils/voice";
import { ownStanding } from "./DailyNudge";
import { motivationFor } from "../../engine/motivation";

// THE ONE PLACE THAT OWNS THE SPEAKER (REQUIREMENTS §81).
//
// Everything that wants a sound or a spoken line asks through
// engine/engageBus.ts ("dcrs:cue", "dcrs:say"); this host, mounted once after
// the app shell, decides: a cue is played when the person has sounds on
// (utils/sounds.ts), a line is said when they have the voice on (utils/voice.ts,
// which also keeps it to the first click, the microphone and once a day).
//
// AND IT REMINDS, ALOUD. "our bot will also remind with voice … so if user
// heard it look like some one is telling them to complete task fast for good
// score". A cheap check once a minute; a reminder only when ALL of these hold:
// the voice is on, the page has been clicked (a browser speaks nothing before),
// this tab is the one in view (a tab in the background keeps quiet, so two open
// tabs do not remind twice as often), it is within the person's working hours,
// at least `remindEveryMin` minutes have passed since the last spoken reminder
// — this tab's or another tab's of this browser, which tell each other — AND
// since this person's session began on this tab, the microphone is not
// listening, Mitra is not already speaking — and the person has something due
// today or late (engine/notifications.ts notificationsFor, asked only then: it
// walks every format's records). Then the three rising notes, and ONE line
// about the most urgent document not reminded in the last two hours: their
// first name, the document, how late or that it is due today, a nudge to finish
// it now for the on-time score (their score, worked out at most once an hour),
// and why the record matters beyond the score (engine/purpose.ts). With it a
// small card at the bottom left — above the reaction toast's place — that
// takes no clicks except its own three buttons, and goes after 12 seconds.
//
// Only the person's own work is reminded by itself. An account that answers for
// the whole plant (the administrator; management, the MR and QA, who have no
// department of their own) and is named on no document is not told every 45
// minutes that the plant's work is theirs (§67); it hears what is due when it
// asks, from the bell, without "you are at minus N today".
//
// What the reminders remember (when the last one was said, what was put off,
// a quiet spell) is ONE PERSON'S: on a shared computer the next person to sign
// in on the same tab starts afresh.
//
// The bell's "What should I do next?" asks for the same line at once
// (remindNow), whatever the interval — and when nothing is due says so.

/** Fired on window by remindNow(): the host says the next thing at once. */
export const REMIND_NOW_EVENT = "dcrs:remind-now";

/** Mitra says the most urgent thing of the person's aloud, now (the bell's button). */
export function remindNow(): void {
  try {
    window.dispatchEvent(new Event(REMIND_NOW_EVENT));
  } catch {
    /* nothing listening */
  }
}

const CHECK_EVERY_MS = 60_000;
const TOAST_MS = 12_000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
/** After a check that found nothing to say, the records are not walked again for this long. */
const QUIET_AFTER_NOTHING_MS = 10 * 60_000;
const SCORE_KEPT_MS = 60 * 60_000;
/** The tabs of this browser tell each other on this channel when a reminder was said: { userId, at, recordId }. */
export const OTHER_TABS_CHANNEL = "dcrs:spoken-reminder";

// ---- what the reminders remember: one person's ----------------------------------------

interface ReminderMemory {
  /** Whose memory this is. */
  userId: string;
  /** When this person's session began on this tab: the first reminder waits the interval from then. */
  startedAt: number;
  /** The last spoken reminder — this tab's, or another tab's of this browser for the same person. */
  lastSpokenAt: number;
  /** A check found nothing to say: the records are not walked again before this. */
  quietUntil: number;
  /** Records reminded (or put off with "Later"), and when. */
  remindedAt: Map<string, number>;
}

const freshMemory = (userId: string, now: number): ReminderMemory => ({ userId, startedAt: now, lastSpokenAt: 0, quietUntil: 0, remindedAt: new Map() });

let memory: ReminderMemory = freshMemory("", Date.now());
let scoreKept: { userId: string; at: number; score: number | null } | null = null;

/**
 * The reminders' memory for this person. Someone else signing in on this tab
 * (a shared plant computer: signing out does not reload the page) starts it
 * afresh — nothing reminded or put off for the one before, no quiet spell of
 * theirs, and the interval counted from this sign-in.
 */
export function reminderMemoryFor(userId: string, now = Date.now()): ReminderMemory {
  if (memory.userId !== userId) {
    cancelDelayedSay();
    memory = freshMemory(userId, now);
  }
  otherTabs();
  return memory;
}

// ---- the other tabs of this browser ----------------------------------------------------

let channel: BroadcastChannel | null = null;

/** The channel the tabs tell each other on; null where the browser has none. Opened once, on first use. */
function otherTabs(): BroadcastChannel | null {
  if (channel) return channel;
  try {
    if (typeof BroadcastChannel === "undefined") return null;
    const opened = new BroadcastChannel(OTHER_TABS_CHANNEL);
    // Node (the unit tests) would otherwise wait on an open channel for ever; a browser has no such thing.
    (opened as unknown as { unref?: () => void }).unref?.();
    opened.onmessage = (e: MessageEvent) => {
      try {
        heardFromAnotherTab(e.data);
      } catch {
        /* a word from another tab is never worth an error */
      }
    };
    channel = opened;
  } catch {
    channel = null;
  }
  return channel;
}

/** Another tab said a reminder: this one counts its interval from then, and leaves that record alone for two hours. */
function heardFromAnotherTab(data: unknown): void {
  const d = data as { userId?: unknown; at?: unknown; recordId?: unknown } | null;
  if (!d || typeof d.userId !== "string" || !d.userId || d.userId !== memory.userId) return;
  if (typeof d.at !== "number" || !Number.isFinite(d.at)) return;
  memory.lastSpokenAt = Math.max(memory.lastSpokenAt, d.at);
  if (typeof d.recordId === "string" && d.recordId) memory.remindedAt.set(d.recordId, d.at);
}

function tellOtherTabs(recordId: string): void {
  try {
    otherTabs()?.postMessage({ userId: memory.userId, at: memory.lastSpokenAt, recordId });
  } catch {
    /* the other tabs keep their own interval */
  }
}

function closeOtherTabs(): void {
  try {
    channel?.close();
  } catch {
    /* already closed */
  }
  channel = null;
}

// ---- the line said after the notes ------------------------------------------------------

// The reminder's line is asked for once its three notes have rung out. Kept, so
// that "Later" pressed in that moment — or the next reminder, or the person
// signing out — stops it before it is ever asked for.
let delayedSay: { timer: number; text: string } | null = null;

function sayAfterTheNotes(request: SayRequest): void {
  cancelDelayedSay();
  const timer = window.setTimeout(() => {
    if (delayedSay?.timer === timer) delayedSay = null;
    emitSay(request);
  }, Math.round(cueDuration("reminder") * 1000) + 120);
  delayedSay = { timer, text: request.text };
}

/** Drops the line still waiting for its notes — any, or only this one. */
function cancelDelayedSay(text?: string): void {
  if (!delayedSay || (text !== undefined && delayedSay.text !== text)) return;
  window.clearTimeout(delayedSay.timer);
  delayedSay = null;
}

// ---- when ------------------------------------------------------------------------------

const minutesOf = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Whether `now` falls within the working day (a day that ends after midnight is allowed for). */
export function withinWorkingHours(now: Date, start: string, end: string): boolean {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === null || e === null || s === e) return true;
  const m = now.getHours() * 60 + now.getMinutes();
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/** Which two-hour stretch of the day `now` is in — the spoken reminder's key names it, so one record is said once a stretch. */
export function twoHourWindow(now: Date): number {
  return Math.floor((now.getHours() * 60 + now.getMinutes()) / 120);
}

const reminderKey = (recordId: string, now: Date): string => `remind:${recordId}:${twoHourWindow(now)}`;

/** Whether this tab is the one the person is looking at (a page with no document to ask counts as in view). */
function tabInView(): boolean {
  try {
    return typeof document === "undefined" || document.visibilityState === "visible";
  } catch {
    return true;
  }
}

/**
 * THE ONCE-A-MINUTE CHECK: whether a reminder may be said by itself now (see
 * the header). Cheap — the records are not walked here.
 */
export function reminderMayStart(userId: string, s: Pick<AppSettings, "voiceOn" | "workdayStart" | "workdayEnd" | "remindEveryMin">, now = Date.now()): boolean {
  if (!userId || !s.voiceOn || !hadUserGesture() || !tabInView()) return false;
  if (!withinWorkingHours(new Date(now), s.workdayStart, s.workdayEnd)) return false;
  const every = Math.min(240, Math.max(10, Number(s.remindEveryMin) || 45)) * 60_000;
  const m = reminderMemoryFor(userId, now);
  if (now - m.startedAt < every || now - m.lastSpokenAt < every || now < m.quietUntil) return false;
  return !isMicBusy() && !isSaying();
}

function recentlyReminded(recordId: string, now: Date): boolean {
  const at = memory.remindedAt.get(recordId);
  if (at !== undefined && Date.now() - at < TWO_HOURS_MS) return true;
  try {
    return settingsRepository.doneToday("spokenToday", todayISO(), reminderKey(recordId, now));
  } catch {
    return false;
  }
}

// ---- what is said ----------------------------------------------------------------------

/** Their own score on the scorecard this month, when it can be known without asking the server; kept an hour. */
function ownScore(user: AuthUser): number | null {
  const now = Date.now();
  if (scoreKept && scoreKept.userId === user.id && now - scoreKept.at < SCORE_KEPT_MS) return scoreKept.score;
  let score: number | null = null;
  try {
    if (keptTo(user).length > 0) {
      const today = todayISO();
      const period = periodFor("this-month", today);
      const standing = ownStanding(
        { id: user.id, name: user.name, role: user.role, departments: user.departments },
        null,
        recordRepository.query({ isDemo: false, fromDate: period.from, toDate: period.to }),
        documentRepository.getAll(),
        today,
        { isClosedDay: closedDays(masterRepository.get()), countedFrom: settingsRepository.get().liveStartDate }
      );
      score = standing?.score ?? null;
    }
  } catch {
    score = null;
  }
  scoreKept = { userId: user.id, at: now, score };
  return score;
}

/**
 * The reminder's facts. `ownWork` false — the plant's work, for an account
 * named on none of it — leaves out today's loss-framed score: the plant's day
 * is not called theirs.
 */
export function factsFor(n: Notification, user: AuthUser, score: number | null, today: string, ownWork = true): ReminderFacts {
  const doc = documentRepository.getById(n.documentId);
  // Today's own work for the day's score (engine/motivation.ts, cached) — worked out only when a reminder is said.
  let day: ReminderFacts["day"];
  if (ownWork) {
    try {
      const d = motivationFor(user).day;
      day = { done: d.done, total: d.total };
    } catch {
      day = undefined;
    }
  }
  return {
    day,
    firstName: firstNameOf(user.name),
    documentName: doc?.name ?? n.what,
    daysUntilDue: n.daysUntilDue,
    score,
    module: n.module,
    seed: `${n.recordId}|${today}`,
  };
}

/** An account that answers for the whole plant: the administrator, and one with no department of its own (management, the MR, QA). */
const answersForPlant = (p: Pick<AuthUser, "role" | "departments">): boolean => p.role === "admin" || !p.departments?.length;

export interface ReminderToast {
  id: number;
  /** In the language the screens are written in. */
  text: string;
  /** What is being said, so "Later" can stop it. */
  spoken: string;
  route?: string;
  recordId?: string;
  documentId?: string;
}

export type ShowReminder = (toast: Omit<ReminderToast, "id">) => void;

/**
 * THE SPOKEN REMINDER — `manual` from the bell: at once, whatever the
 * interval, and "nothing is due" when nothing is. `work` is the day's work
 * when the caller already has it (notificationsFor is asked otherwise).
 */
export function speakReminder(person: AuthUser, manual: boolean, spoken: Language, shown: Language, show: ShowReminder, work?: DaysWork): void {
  const m = reminderMemoryFor(person.id);
  const now = new Date();
  const today = todayISO();
  // A line still waiting for its notes gives way to this one.
  cancelDelayedSay();
  let days: DaysWork | null = work ?? null;
  if (!days) {
    try {
      days = notificationsFor(person, false);
    } catch {
      days = null;
    }
  }
  // The plant's work, for an account named on none of it: not said by itself as if it were theirs.
  const plantsNotTheirs = !!days && !days.theirOwn && answersForPlant(person);
  if (!manual && plantsNotTheirs) {
    m.quietUntil = Date.now() + QUIET_AFTER_NOTHING_MS;
    return;
  }
  const due = (days?.notifications ?? []).filter((n) => n.daysUntilDue <= 0);
  const pick = due.find((n) => !recentlyReminded(n.recordId, now)) ?? (manual ? due[0] : undefined);
  if (!pick) {
    if (!manual) {
      m.quietUntil = Date.now() + QUIET_AFTER_NOTHING_MS;
      return;
    }
    const first = firstNameOf(person.name);
    const seed = `${today}|nothing`;
    const text = nothingDueLine(first, spoken, seed);
    emitCue("chime");
    emitSay({ text, lang: spoken, en: nothingDueLine(first, "en", seed), priority: "high" });
    show({ text: nothingDueLine(first, shown, seed), spoken: text });
    return;
  }
  m.lastSpokenAt = Date.now();
  m.remindedAt.set(pick.recordId, m.lastSpokenAt);
  tellOtherTabs(pick.recordId);
  const facts = factsFor(pick, person, ownScore(person), today, !plantsNotTheirs);
  const text = reminderLine(facts, spoken);
  const key = reminderKey(pick.recordId, now);
  // Asked for from the bell, it is said at once and carries no key; the automatic one does not come back to it for two hours.
  if (manual) {
    try {
      settingsRepository.markDoneToday("spokenToday", today, key);
    } catch {
      /* the session's own memory still holds it */
    }
  }
  emitCue("reminder");
  const request: SayRequest = { text, lang: spoken, en: reminderLine(facts, "en"), priority: manual ? "high" : "normal", ...(manual ? {} : { key }) };
  // After the three notes, not over them.
  sayAfterTheNotes(request);
  show({ text: reminderLine(facts, shown), spoken: text, route: pick.route, recordId: pick.recordId, documentId: pick.documentId });
}

/**
 * "Later" on the card: not this record again for two hours, and its line
 * stopped — whether it is being said, waiting its turn, or still to be asked
 * for once the notes have rung out.
 */
export function putOffReminder(toast: Pick<ReminderToast, "recordId" | "spoken">): void {
  const id = toast.recordId;
  if (id) {
    memory.remindedAt.set(id, Date.now());
    try {
      settingsRepository.markDoneToday("spokenToday", todayISO(), reminderKey(id, new Date()));
    } catch {
      /* the session's own memory still holds it */
    }
  }
  cancelDelayedSay(toast.spoken);
  stopLine(toast.spoken);
}

/** For the unit tests: nobody's memory, nothing waiting, no channel open — as a new page would have. */
export function resetRemindersForTests(): void {
  cancelDelayedSay();
  closeOtherTabs();
  memory = freshMemory("", Date.now());
  scoreKept = null;
}

let toastSeq = 0;

export function SoundVoiceHost() {
  const { user } = useAuth();
  const { lang, uiLang } = useAppStore();
  const { navigate } = useRouter();
  const t = useT();
  const [toast, setToast] = useState<ReminderToast | null>(null);
  const toastTimer = useRef(0);

  // The latest of what the listeners and the timer read, without re-subscribing them.
  const live = useRef<{ user: AuthUser | null; lang: Language; uiLang: Language }>({ user, lang, uiLang });
  live.current = { user, lang, uiLang };

  const showToast = useCallback((next: Omit<ReminderToast, "id">) => {
    toastSeq += 1;
    setToast({ ...next, id: toastSeq });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // Whoever is signed in on this tab: the reminders' memory is theirs from their sign-in.
  const userId = user?.id ?? "";
  useEffect(() => {
    if (userId) reminderMemoryFor(userId);
  }, [userId]);

  // The first click or key: before it a browser plays and says nothing. And
  // signed out (the host goes with the app), nothing more is said to the next
  // person — not even a line still waiting for its notes.
  useEffect(() => {
    watchFirstGesture();
    return () => {
      cancelDelayedSay();
      closeOtherTabs();
      stopVoice();
    };
  }, []);

  // Sounds and spoken lines asked for from anywhere.
  useEffect(() => {
    const onCue = (e: Event) => {
      try {
        const cue = (e as CustomEvent<{ cue?: unknown }>).detail?.cue;
        if (typeof cue !== "string" || !(CUE_NAMES as readonly string[]).includes(cue)) return;
        if (settingsRepository.get().soundsOn) playCue(cue as CueName);
      } catch {
        /* a sound is never worth an error */
      }
    };
    const onSay = (e: Event) => {
      try {
        const req = (e as CustomEvent<SayRequest>).detail;
        if (!req || typeof req.text !== "string") return;
        if (settingsRepository.get().voiceOn) say(req);
      } catch {
        /* nor is a line */
      }
    };
    window.addEventListener(CUE_EVENT, onCue);
    window.addEventListener(SAY_EVENT, onSay);
    return () => {
      window.removeEventListener(CUE_EVENT, onCue);
      window.removeEventListener(SAY_EVENT, onSay);
    };
  }, []);

  const remind = useCallback(
    (manual: boolean) => {
      const { user: person, lang: spoken, uiLang: shown } = live.current;
      if (!person) return;
      speakReminder(person, manual, spoken, shown, showToast);
    },
    [showToast]
  );

  // The cheap once-a-minute check.
  useEffect(() => {
    const tick = () => {
      try {
        const person = live.current.user;
        if (!person || !reminderMayStart(person.id, settingsRepository.get())) return;
        remind(false);
      } catch {
        /* a reminder is never worth an error */
      }
    };
    const id = window.setInterval(tick, CHECK_EVERY_MS);
    const onNow = () => {
      try {
        remind(true);
      } catch {
        /* nor is one asked for */
      }
    };
    window.addEventListener(REMIND_NOW_EVENT, onNow);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(REMIND_NOW_EVENT, onNow);
    };
  }, [remind]);

  if (!toast) return null;

  const close = () => {
    window.clearTimeout(toastTimer.current);
    setToast(null);
  };

  return (
    <div
      key={toast.id}
      className="mitra-voice-reminder no-print"
      data-section="mitra-voice-reminder"
      data-record-id={toast.recordId ?? ""}
      data-document-id={toast.documentId ?? ""}
      role="status"
      aria-live="polite"
    >
      <div className="mitra-voice-reminder-body">
        <span className="mitra-voice-reminder-icon" aria-hidden="true">
          🔊
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="mitra-voice-reminder-title">{t("voice.toast.title")}</div>
          <div className="mitra-voice-reminder-text" data-field="voice-reminder-text">
            {toast.text}
          </div>
        </div>
      </div>
      <div className="mitra-voice-reminder-actions">
        {toast.route && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-action="voice-reminder-go"
            onClick={() => {
              const route = toast.route;
              close();
              if (route) navigate(route);
            }}
          >
            {t("voice.toast.go")}
          </button>
        )}
        {toast.recordId && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            data-action="voice-reminder-later"
            title={t("voice.toast.laterTitle")}
            onClick={() => {
              putOffReminder(toast);
              close();
            }}
          >
            {t("voice.toast.later")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-action="voice-reminder-mute"
          aria-label={t("voice.toast.mute")}
          title={t("voice.toast.mute")}
          onClick={() => {
            cancelDelayedSay(toast.spoken);
            updateVoiceSettings({ voiceOn: false });
            close();
          }}
        >
          <span aria-hidden="true">🔇</span>
        </button>
      </div>
    </div>
  );
}
