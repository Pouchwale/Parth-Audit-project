import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ICON_BUTTON_SIZE } from '@/components/ui';
import { Radius, useTheme } from '@/constants/theme';
import { useNotifications } from '@/lib/notifications';

/** The bell in the chat's top bar: opens the inbox, with the number not yet read. Hidden where there are no notifications. */
export function Bell() {
  const theme = useTheme();
  const { unread, offered } = useNotifications();
  if (offered === false) return null;
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push('/inbox')}
      hitSlop={8}
      style={({ pressed }) => [styles.button, { backgroundColor: pressed ? theme.surfaceMuted : 'transparent' }]}>
      <Ionicons name={unread > 0 ? 'notifications' : 'notifications-outline'} size={22} color={theme.text} />
      {unread > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.accent, borderColor: theme.background }]}>
          <Text style={[styles.count, { color: theme.onAccent }]}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: ICON_BUTTON_SIZE, height: ICON_BUTTON_SIZE, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: Radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { fontSize: 10, fontWeight: '700' },
});
