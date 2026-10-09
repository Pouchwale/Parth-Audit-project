import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { NotificationKind, NotificationPreferences } from '@shared/api';
import { Button, Card, Notice, Toggle } from '@/components/ui';
import { Spacing, useTheme } from '@/constants/theme';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { KIND_WORDS, kindsFor, pushStateWords } from '@/lib/notification-logic';
import { useNotifications } from '@/lib/notifications';
import { LOCAL_POSSIBLE } from '@/lib/push';

/**
 * Settings, Notifications: whether alerts reach this phone (and why not), a test alert, the daily reminder, and which
 * kinds are pushed (a kind switched off still reaches the inbox). The choice of kinds is kept in DCRS, for every phone
 * of the person's.
 */
export function NotificationSettings() {
  const theme = useTheme();
  const { call, user } = useAuth();
  const { push, offered, remindersActive, setReminders, turnOn } = useNotifications();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<{ tone: 'warning' | 'danger'; words: string } | null>(null);

  useEffect(() => {
    if (offered === false) return;
    call((token) => api.notificationPreferences(token))
      .then((loaded) => {
        setPrefs(loaded);
        setPrefsError(null);
      })
      .catch((e: unknown) => setPrefsError(errorMessage(e)));
  }, [call, offered]);

  async function setKind(kind: NotificationKind, on: boolean) {
    if (!prefs) return;
    const before = prefs;
    const next = { ...prefs, kinds: { ...prefs.kinds, [kind]: on } };
    setPrefs(next);
    try {
      setPrefs(await call((token) => api.saveNotificationPreferences(token, next)));
      setPrefsError(null);
    } catch (e) {
      setPrefs(before);
      setPrefsError(errorMessage(e));
    }
  }

  async function sendTest() {
    setTesting(true);
    setTested(null);
    try {
      const { sent } = await call((token) => api.testNotification(token));
      setTested(
        sent > 0
          ? { tone: 'warning', words: `Sent to ${sent === 1 ? 'your phone' : `${sent} of your phones`}. It should arrive within a minute.` }
          : { tone: 'danger', words: 'No phone of yours is registered for alerts yet.' },
      );
    } catch (e) {
      setTested({ tone: 'danger', words: errorMessage(e) });
    }
    setTesting(false);
  }

  if (!user) return null;
  return (
    <Card>
      <Text style={[styles.label, { color: theme.text }]}>Alerts on this phone</Text>
      <Text style={[styles.hint, { color: theme.textSecondary }]}>{pushStateWords(push)}</Text>
      {push.status === 'off' && push.reason === 'not-asked' ? <Button title="Turn on alerts" onPress={turnOn} /> : null}
      {push.status === 'off' && push.reason === 'denied' ? <Button title="Open the phone's settings" kind="secondary" onPress={() => void Linking.openSettings()} /> : null}
      {push.status === 'on' ? <Button title="Send me a test notification" kind="secondary" busy={testing} onPress={() => void sendTest()} /> : null}
      {tested ? <Notice tone={tested.tone}>{tested.words}</Notice> : null}

      {LOCAL_POSSIBLE ? (
        <>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.switchRow}>
            <View style={styles.column}>
              <Text style={[styles.label, { color: theme.text }]}>Daily reminder</Text>
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                At 8:50 and 17:30 on working days, from the phone itself. On by itself while alerts cannot reach this phone.
              </Text>
            </View>
            <Toggle label="Daily reminder" value={remindersActive} onValueChange={(on) => setReminders(on ? 'on' : 'off')} />
          </View>
        </>
      ) : null}

      {offered === false ? null : (
        <>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Text style={[styles.label, { color: theme.text }]}>Send me alerts for</Text>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>A kind switched off still shows in the inbox.</Text>
          {prefsError ? <Notice tone="danger">{prefsError}</Notice> : null}
          {prefs
            ? kindsFor(user.role).map((kind) => (
                <View key={kind} style={styles.switchRow}>
                  <View style={styles.column}>
                    <Text style={[styles.kind, { color: theme.text }]}>{KIND_WORDS[kind].label}</Text>
                    <Text style={[styles.hint, { color: theme.textSecondary }]}>{KIND_WORDS[kind].hint}</Text>
                  </View>
                  <Toggle label={KIND_WORDS[kind].label} value={prefs.kinds[kind] !== false} onValueChange={(on) => void setKind(kind, on)} />
                </View>
              ))
            : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 16, fontWeight: '500' },
  kind: { fontSize: 15 },
  hint: { fontSize: 13, lineHeight: 18 },
  column: { flex: 1, gap: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 44 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.xs },
});
