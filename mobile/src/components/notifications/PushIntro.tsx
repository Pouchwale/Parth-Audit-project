import { StyleSheet, Text, View } from 'react-native';
import { Button, Dialog } from '@/components/ui';
import { Spacing, useTheme } from '@/constants/theme';

/**
 * Says why Mitra would like to send notifications, once, before the phone asks its own question. "Not now" leaves it;
 * Settings, Notifications can turn alerts on later.
 */
export function PushIntro({ pushPossible, onAnswer }: { pushPossible: boolean; onAnswer(yes: boolean): void }) {
  const theme = useTheme();
  return (
    <Dialog title="Get alerts for your records?" onClose={() => onAnswer(false)}>
      <Text style={[styles.text, { color: theme.text }]}>
        {pushPossible
          ? 'Mitra can tell you when a record is ready for your OK, needs your readings, or waits for your verification, even when the app is closed. It also reminds you at 8:50 and 17:30 on working days while alerts cannot reach this phone.'
          : 'Mitra can remind you at 8:50 and 17:30 on working days to look at your tasks. Alerts from DCRS need the Mitra app itself; in Expo Go on Android, the inbox shows them.'}
      </Text>
      <Text style={[styles.hint, { color: theme.textSecondary }]}>Next, the phone asks whether Mitra may send notifications. You can change it later in Settings.</Text>
      <View style={styles.buttons}>
        <Button title="Not now" kind="secondary" onPress={() => onAnswer(false)} style={styles.button} />
        <Button title="Continue" onPress={() => onAnswer(true)} style={styles.button} />
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 21 },
  hint: { fontSize: 13, lineHeight: 18 },
  buttons: { flexDirection: 'row', gap: Spacing.sm },
  button: { flex: 1 },
});
