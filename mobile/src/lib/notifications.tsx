import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { NotificationLanguage } from '@shared/api';
import { PushIntro } from '@/components/notifications/PushIntro';
import { api, ApiError } from './api';
import { useAuth } from './auth';
import { linkOf, notificationIdOf, pushLanguage, reminderSettingOf, remindersOn, type AppLink, type PushState, type ReminderSetting } from './notification-logic';
import { askPermission, configureNotifications, introSeen, LOCAL_POSSIBLE, markIntroSeen, onTokenChange, permission, PUSH_POSSIBLE, register, scheduleReminders, setBadge } from './push';
import { useSettings } from './settings';
import { getItem, setItem } from './storage';

// What the app knows of the person's notifications: how many are unread (the bell) and still open (the badge), whether
// alerts reach this phone, and the daily reminder. DCRS keeps the notifications themselves; this asks for the counts
// when the app opens, comes back to the front, or an alert arrives, and every few minutes while it is open.

const REFRESH_MS = 3 * 60_000;
const REMINDERS_KEY = 'reminders';
const WEEKLY_OFF_KEY = 'weeklyOff';

interface NotificationsValue {
  unread: number;
  open: number;
  /** Goes up by one for each alert that arrives while Mitra is open: an open inbox or Tasks reads its list again. */
  arrived: number;
  /** null while not known; false when the server keeps no notifications (or DCRS has none yet). */
  offered: boolean | null;
  push: PushState;
  language: NotificationLanguage;
  reminders: ReminderSetting;
  /** Whether the daily reminder is on now (the setting, and for "auto", whether alerts reach the phone). */
  remindersActive: boolean;
  setReminders(setting: ReminderSetting): void;
  refresh(): Promise<void>;
  /** Marks some read, then refreshes the counts. */
  markRead(ids: number[] | 'all'): Promise<void>;
  /** Shows the explanation, then the phone's own question. */
  turnOn(): void;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

function deviceLocale(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale ?? null;
  } catch {
    return null;
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { status, user, call } = useAuth();
  const { settings } = useSettings();
  const language = pushLanguage(settings.replyLanguage, deviceLocale());
  const signedIn = status === 'signedIn' && user !== null;
  const [counts, setCounts] = useState({ unread: 0, open: 0 });
  const [offered, setOffered] = useState<boolean | null>(null);
  const [push, setPush] = useState<PushState>({ status: 'checking' });
  const [reminders, setRemindersState] = useState<ReminderSetting>('auto');
  const [weeklyOff, setWeeklyOff] = useState<string | null>(null);
  const [intro, setIntro] = useState(false);
  const [arrived, setArrived] = useState(0);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (!signedIn || busy.current) return;
    busy.current = true;
    const list = await call((token) => api.notifications(token, { state: 'open', limit: 1, lang: language })).catch((error: unknown) => {
      if (error instanceof ApiError && (error.code === 'not_offered' || /doesn't offer that yet/i.test(error.message))) setOffered(false);
      return null;
    });
    busy.current = false;
    if (!list) return;
    setCounts({ unread: list.unread, open: list.open });
    setOffered(true);
    void setBadge(list.open);
  }, [signedIn, call, language]);

  const markRead = useCallback(
    async (ids: number[] | 'all') => {
      if (ids !== 'all' && ids.length === 0) return;
      try {
        const answer = await call((token) => api.markRead(token, ids === 'all' ? { all: true } : { ids }));
        setCounts((current) => ({ ...current, unread: answer.unread }));
      } catch {
        // The inbox shows its own error; the counts catch up at the next refresh.
      }
      void refresh();
    },
    [call, refresh],
  );

  const registerNow = useCallback(async () => {
    if (!signedIn || !user) return;
    try {
      setPush(await register(call, user.id, language));
    } catch {
      // A sign-in that ended: the person is signed out by call().
    }
  }, [signedIn, user, call, language]);

  // Signed in: the channels and the banner first, then the counts, the registration, and the explanation before the
  // phone's own question when it has never been asked. The language is part of the registration: a new one is sent.
  useEffect(() => {
    if (!signedIn) {
      setCounts({ unread: 0, open: 0 });
      setOffered(null);
      setPush({ status: 'checking' });
      return;
    }
    let cancelled = false;
    void (async () => {
      await configureNotifications();
      void refresh();
      await registerNow();
      if (cancelled || !LOCAL_POSSIBLE) return;
      const allowed = await permission();
      if (!cancelled && allowed.state === 'undetermined' && !(await introSeen())) setIntro(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, refresh, registerNow]);

  // A new token from the phone, the app back in front, an alert while it is open, and every few minutes.
  useEffect(() => {
    if (!signedIn) return;
    const stopToken = onTokenChange(() => void registerNow());
    const state = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void refresh();
        void registerNow();
      }
    });
    // An alert while Mitra is open shows as a banner (configureNotifications); the counts, and the inbox and Tasks
    // when one is open, are read again.
    const received = LOCAL_POSSIBLE
      ? Notifications.addNotificationReceivedListener(() => {
          setArrived((n) => n + 1);
          void refresh();
        })
      : null;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, REFRESH_MS);
    return () => {
      stopToken();
      state.remove();
      received?.remove();
      clearInterval(timer);
    };
  }, [signedIn, refresh, registerNow]);

  // The reminder setting and the plant's weekly off, as last known on this phone.
  useEffect(() => {
    void getItem(REMINDERS_KEY)
      .then((saved) => {
        if (saved === 'on' || saved === 'off' || saved === 'auto') setRemindersState(saved);
      })
      .catch(() => undefined);
    void getItem(WEEKLY_OFF_KEY)
      .then((saved) => saved && setWeeklyOff(saved))
      .catch(() => undefined);
  }, []);

  // Read once a sign-in: the weekly off as DCRS says it, and the reminder choice the person made (kept in DCRS, so it
  // follows them to another phone; until they choose, the phone keeps its own).
  useEffect(() => {
    if (!signedIn) return;
    call((token) => api.tasks(token))
      .then((tasks) => {
        const day = tasks.weeklyOff?.day;
        if (typeof day === 'string' && day) {
          setWeeklyOff(day);
          void setItem(WEEKLY_OFF_KEY, day).catch(() => undefined);
        }
      })
      .catch(() => undefined);
    call((token) => api.notificationPreferences(token))
      .then((prefs) => {
        const chosen = reminderSettingOf(prefs.reminders);
        if (chosen) {
          setRemindersState(chosen);
          void setItem(REMINDERS_KEY, chosen).catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, [signedIn, call]);

  const pushOn = push.status === 'on';
  const remindersActive = signedIn && LOCAL_POSSIBLE && remindersOn(reminders, pushOn);
  useEffect(() => {
    if (!signedIn || push.status === 'checking') return;
    void (async () => {
      const allowed = remindersActive && (await permission()).state === 'granted';
      await scheduleReminders(allowed, language, weeklyOff).catch(() => undefined);
    })();
  }, [signedIn, push.status, remindersActive, language, weeklyOff]);

  const setReminders = useCallback(
    (setting: ReminderSetting) => {
      setRemindersState(setting);
      void setItem(REMINDERS_KEY, setting).catch(() => undefined);
      // The person's choice, kept in DCRS too (no kind changes: DCRS keeps the kinds left out as they are).
      if (signedIn && setting !== 'auto') {
        void call((token) => api.saveNotificationPreferences(token, { kinds: {}, reminders: setting === 'on' })).catch(() => undefined);
      }
    },
    [signedIn, call],
  );

  const turnOn = useCallback(() => setIntro(true), []);

  async function answerIntro(yes: boolean) {
    setIntro(false);
    await markIntroSeen();
    if (!yes) return;
    await askPermission();
    await registerNow();
  }

  const value = useMemo<NotificationsValue>(
    () => ({
      unread: counts.unread,
      open: counts.open,
      arrived,
      offered,
      push,
      language,
      reminders,
      remindersActive,
      setReminders,
      refresh,
      markRead,
      turnOn,
    }),
    [counts, arrived, offered, push, language, reminders, remindersActive, setReminders, refresh, markRead, turnOn],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {intro && signedIn ? <PushIntro pushPossible={PUSH_POSSIBLE} onAnswer={(yes) => void answerIntro(yes)} /> : null}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsValue {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error('useNotifications must be used inside <NotificationsProvider>');
  return value;
}

/** Opens a screen of the app. */
export function openLink(link: AppLink): void {
  if (link.screen === 'task') router.push({ pathname: '/task/[recordId]', params: { recordId: link.recordId } });
  else router.push(link.screen === 'tasks' ? '/tasks' : '/inbox');
}

// Alerts already opened, so the one that opened the app is not opened again when the screens are drawn again.
const opened = new Set<string>();

/**
 * Opens what a tapped alert is about (lib/notification-logic.ts linkOf): its record, Tasks or the inbox. Also the alert
 * that opened a closed app, once the screens are ready and the person is signed in; an alert tapped while signed out
 * opens after signing in.
 */
export function NotificationRouter() {
  const ready = !!useRootNavigationState()?.key;
  const { markRead } = useNotifications();

  useEffect(() => {
    if (!ready || !LOCAL_POSSIBLE) return;
    const open = (response: Notifications.NotificationResponse) => {
      const request = response.notification.request;
      if (opened.has(request.identifier)) return;
      opened.add(request.identifier);
      const data: unknown = request.content.data;
      openLink(linkOf(data));
      const id = notificationIdOf(data);
      if (id) void markRead([id]);
    };
    try {
      const last = Notifications.getLastNotificationResponse();
      if (last) open(last);
    } catch {
      // Not offered on this platform.
    }
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [ready, markRead]);

  return null;
}
