import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { NotificationLanguage } from '@shared/api';
import { api, ApiError, currentServer } from './api';
import { deviceLabel, needsRegistering, parseRegistration, reminderSlots, reminderWords, type PushState } from './notification-logic';
import { deleteItem, getItem, setItem } from './storage';

// ALERTS ON THIS PHONE. DCRS sends the push alerts through Expo's push service to the token this phone registers
// (through the Mitra server, as the person). Android needs the installed app (1.1.0 or later) with Firebase set up:
// Expo Go on Android cannot receive them (Expo SDK 53 and later). Whatever fails here fails quietly: the inbox, Tasks
// and the daily reminder on the phone still work, and Settings says why alerts are off.

const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** Whether this copy of the app can receive push alerts at all. */
export const PUSH_POSSIBLE: boolean = Platform.OS !== 'web' && !(IN_EXPO_GO && Platform.OS === 'android');

/** Whether this copy of the app can show notifications of its own (the daily reminder). */
export const LOCAL_POSSIBLE: boolean = Platform.OS !== 'web';

const REGISTRATION_KEY = 'pushRegistration';
const INTRO_KEY = 'pushIntroSeen';
const REMINDER_PREFIX = 'mitra-reminder-';

let channels: Promise<void> | null = null;

/**
 * Once, as the app starts: an alert that arrives while Mitra is open shows as a banner, and Android gets the two
 * channels DCRS sends to, which must exist before the permission is asked (Android 13 and later).
 */
export function configureNotifications(): Promise<void> {
  if (!LOCAL_POSSIBLE) return Promise.resolve();
  channels ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
    });
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync('tasks', {
      name: 'Tasks',
      description: 'Records ready for you, readings to enter, overdue records and records to verify.',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#7E3C40',
      vibrationPattern: [0, 250, 150, 250],
    });
    await Notifications.setNotificationChannelAsync('summary', {
      name: 'Summaries and reminders',
      description: 'What is coming up, the summaries and the daily reminder.',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  })().catch(() => undefined);
  return channels;
}

export type PermissionState = 'granted' | 'undetermined' | 'denied';

/** Whether Mitra may show notifications on this phone, and whether the phone would still ask. */
export async function permission(): Promise<{ state: PermissionState; canAskAgain: boolean }> {
  if (!LOCAL_POSSIBLE) return { state: 'denied', canAskAgain: false };
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return { state: 'granted', canAskAgain: true };
    return { state: current.status === 'undetermined' && current.canAskAgain ? 'undetermined' : 'denied', canAskAgain: current.canAskAgain };
  } catch {
    return { state: 'denied', canAskAgain: false };
  }
}

/** The phone's own question, asked only after the app has said why (components/notifications/PushIntro.tsx). */
export async function askPermission(): Promise<boolean> {
  if (!LOCAL_POSSIBLE) return false;
  await configureNotifications();
  try {
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Whether the explanation before the phone's question has been shown on this phone. */
export async function introSeen(): Promise<boolean> {
  return (await getItem(INTRO_KEY).catch(() => null)) === '1';
}

export async function markIntroSeen(): Promise<void> {
  await setItem(INTRO_KEY, '1').catch(() => undefined);
}

/** Expo's push token for this app on this phone, or null when there is none (no Firebase yet, Expo Go, no network). */
async function expoPushToken(): Promise<string | null> {
  if (!PUSH_POSSIBLE) return null;
  const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? Constants.easConfig?.projectId;
  try {
    return (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  } catch {
    return null;
  }
}

type Call = <T>(request: (token: string) => Promise<T>) => Promise<T>;

/** A server that does not keep notifications: the Mitra server's connector, or DCRS without the routes yet. */
function notOffered(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'not_offered' || /doesn't offer that yet/i.test(error.message));
}

/**
 * Registers this phone's token with DCRS (through the Mitra server, as the signed-in person), in the language its
 * alerts are to be written in, when the token, the language, the server or the person changed, or a day has passed.
 * Answers whether alerts now reach the phone, and if not, why. A sign-in that has ended is the caller's to handle.
 */
export async function register(call: Call, userId: string, language: NotificationLanguage): Promise<PushState> {
  if (Platform.OS === 'web') return { status: 'off', reason: 'web' };
  if (!PUSH_POSSIBLE) return { status: 'off', reason: 'expo-go' };
  const allowed = await permission();
  if (allowed.state !== 'granted') return { status: 'off', reason: allowed.state === 'undetermined' ? 'not-asked' : 'denied' };
  const token = await expoPushToken();
  if (!token) return { status: 'off', reason: 'no-token' };
  const server = currentServer();
  if (!server) return { status: 'off', reason: 'server' };
  const now = { token, language, server, userId };
  const saved = parseRegistration(await getItem(REGISTRATION_KEY).catch(() => null));
  if (!needsRegistering(saved, now, Date.now())) return { status: 'on' };
  const deviceName = deviceLabel(Device.deviceName);
  try {
    await call((session) =>
      api.registerDevice(session, {
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        language,
        ...(Constants.expoConfig?.version ? { appVersion: Constants.expoConfig.version } : {}),
        ...(deviceName ? { deviceName } : {}),
      }),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw error;
    return { status: 'off', reason: notOffered(error) ? 'not-offered' : 'server' };
  }
  await setItem(REGISTRATION_KEY, JSON.stringify({ ...now, at: Date.now() })).catch(() => undefined);
  return { status: 'on' };
}

/** A new token from the phone (it can change): registered again at once. */
export function onTokenChange(listener: () => void): () => void {
  if (!PUSH_POSSIBLE) return () => undefined;
  try {
    const subscription = Notifications.addPushTokenListener(() => listener());
    return () => subscription.remove();
  } catch {
    return () => undefined;
  }
}

/**
 * At sign-out: DCRS stops sending this phone the person's alerts, and the phone forgets its reminders and badge. (A
 * sign-in that simply ends at the close of DCRS's day keeps the phone registered, so alerts still come the next day.)
 */
export async function unregister(sessionToken: string | null): Promise<void> {
  const saved = parseRegistration(await getItem(REGISTRATION_KEY).catch(() => null));
  await deleteItem(REGISTRATION_KEY).catch(() => undefined);
  if (saved && sessionToken) await api.removeDevice(sessionToken, saved.token).catch(() => undefined);
  await scheduleReminders(false, 'en').catch(() => undefined);
  await setBadge(0);
}

/**
 * The daily reminder (08:50 and 17:30 on every day but the weekly off), scheduled on the phone itself so it rings with
 * no server and no network. Only what changed is cancelled or scheduled.
 */
export async function scheduleReminders(on: boolean, language: NotificationLanguage, weeklyOff?: string | null): Promise<void> {
  if (!LOCAL_POSSIBLE) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = scheduled.filter((item) => item.identifier.startsWith(REMINDER_PREFIX));
  const wanted = on
    ? reminderSlots(weeklyOff).map((slot) => ({ id: `${REMINDER_PREFIX}${language}-${slot.weekday}-${slot.hour}-${slot.minute}`, slot }))
    : [];
  const wantedIds = new Set(wanted.map((item) => item.id));
  for (const item of ours) {
    if (!wantedIds.has(item.identifier)) await Notifications.cancelScheduledNotificationAsync(item.identifier);
  }
  const have = new Set(ours.map((item) => item.identifier));
  for (const { id, slot } of wanted) {
    if (have.has(id)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { ...reminderWords(language, slot.hour), data: { url: 'mitra://tasks' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: slot.weekday, hour: slot.hour, minute: slot.minute, channelId: 'summary' },
    });
  }
}

/** The number on the app's icon: what still asks something of the person. */
export async function setBadge(count: number): Promise<void> {
  if (!LOCAL_POSSIBLE) return;
  await Notifications.setBadgeCountAsync(Math.max(0, count)).catch(() => false);
}
