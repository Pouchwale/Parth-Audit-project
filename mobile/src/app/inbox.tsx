import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NotificationItem } from '@shared/api';
import { Button, Chip, Notice } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing, useTheme } from '@/constants/theme';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { inboxSections, itemLink } from '@/lib/notification-logic';
import { openLink, useNotifications } from '@/lib/notifications';

/** How many the inbox reads at a time: a screen and a half, then more as the person scrolls. */
const PAGE = 30;

/**
 * The inbox: DCRS's notifications for the person, newest first, by day, in the language chosen in Settings. A tap
 * marks one read and opens its record or Tasks.
 */
export default function InboxScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { call } = useAuth();
  const { language, unread, markRead, refresh: refreshCounts } = useNotifications();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await call((token) => api.notifications(token, { state: 'all', limit: PAGE, lang: language }));
      setItems(list.items);
      setMore(list.items.length === PAGE);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [call, language]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function pullToRefresh() {
    setRefreshing(true);
    await Promise.all([load(), refreshCounts()]);
    setRefreshing(false);
  }

  async function loadMore() {
    const last = items?.at(-1);
    if (!more || loadingMore || !last) return;
    setLoadingMore(true);
    try {
      const list = await call((token) => api.notifications(token, { state: 'all', limit: PAGE, before: last.id, lang: language }));
      setItems((current) => [...(current ?? []), ...list.items.filter((item) => !current?.some((have) => have.id === item.id))]);
      setMore(list.items.length === PAGE);
    } catch (e) {
      setError(errorMessage(e));
    }
    setLoadingMore(false);
  }

  function open(item: NotificationItem) {
    if (!item.readAt) {
      const at = new Date().toISOString();
      setItems((current) => current?.map((one) => (one.id === item.id ? { ...one, readAt: at } : one)) ?? null);
      void markRead([item.id]);
    }
    const link = itemLink(item);
    if (link) openLink(link);
  }

  async function readAll() {
    const at = new Date().toISOString();
    setItems((current) => current?.map((one) => (one.readAt ? one : { ...one, readAt: at })) ?? null);
    await markRead('all');
  }

  const header = (
    <Stack.Screen
      options={{
        title: 'Inbox',
        headerRight: () => (unread > 0 ? <HeaderLink label="Mark all read" onPress={() => void readAll()} /> : <HeaderLink label="Tasks" onPress={() => router.push('/tasks')} />),
      }}
    />
  );

  if (!items && !error) {
    return (
      <View style={styles.center}>
        {header}
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const now = new Date();
  const sections = inboxSections(items ?? [], now.toISOString(), -now.getTimezoneOffset());

  return (
    <>
      {header}
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, { paddingBottom: Spacing.lg + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} />}
        initialNumToRender={12}
        windowSize={5}
        stickySectionHeadersEnabled={false}
        onEndReachedThreshold={0.5}
        onEndReached={() => void loadMore()}
        ListHeaderComponent={
          <View style={styles.header}>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <Button title="Open Tasks" kind="secondary" onPress={() => router.push('/tasks')} />
          </View>
        }
        ListEmptyComponent={
          error ? null : (
            <Text style={[styles.empty, { color: theme.textSecondary }]}>
              Nothing yet. DCRS tells you here when a record is ready for you, needs your readings, or waits for your verification.
            </Text>
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.accent} /> : null}
        renderSectionHeader={({ section }) => <Text style={[styles.day, { color: theme.textSecondary }]}>{section.title}</Text>}
        renderItem={({ item }) => <InboxRow item={item} onPress={() => open(item)} />}
      />
    </>
  );
}

function HeaderLink({ label, onPress }: { label: string; onPress(): void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={styles.headerLink}>
      <Text style={[styles.headerLinkText, { color: theme.accent }]}>{label}</Text>
    </Pressable>
  );
}

const ICONS = {
  ready: 'checkmark-done-outline',
  needs_input: 'create-outline',
  due: 'today-outline',
  upcoming: 'calendar-outline',
  overdue: 'alert-circle-outline',
  verify: 'shield-checkmark-outline',
  sent_back: 'return-down-back-outline',
  boss_summary: 'stats-chart-outline',
  escalation: 'flag-outline',
  access_changed: 'key-outline',
} as const;

function InboxRow({ item, onPress }: { item: NotificationItem; onPress(): void }) {
  const theme = useTheme();
  const unread = !item.readAt;
  const done = !!item.resolvedAt;
  const time = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const icon = ICONS[item.kind] ?? 'notifications-outline';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${item.title}. ${item.body}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: unread ? theme.surface : theme.background, borderColor: theme.border, opacity: pressed ? 0.85 : done ? 0.7 : 1 },
      ]}>
      <Ionicons name={icon} size={22} color={item.priority === 'high' && !done ? theme.accent : theme.textSecondary} />
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.text, fontWeight: unread ? '700' : '500' }]} numberOfLines={2}>
            {item.title}
          </Text>
          {unread ? <View style={[styles.dot, { backgroundColor: theme.accent }]} /> : null}
        </View>
        <Text style={[styles.body, { color: theme.textSecondary }]}>{item.body}</Text>
        <View style={styles.meta}>
          <Text style={[styles.time, { color: theme.textSecondary }]}>{time}</Text>
          {done ? <Chip label="Done" tone="success" /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: Spacing.lg, gap: Spacing.sm, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  header: { gap: Spacing.md, marginBottom: Spacing.sm },
  empty: { fontSize: 15, lineHeight: 21, marginTop: Spacing.lg },
  day: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: Spacing.lg, marginBottom: Spacing.xs },
  row: { flexDirection: 'row', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.sm },
  flex: { flex: 1, gap: Spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { flex: 1, fontSize: 16 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  body: { fontSize: 14, lineHeight: 20 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  time: { fontSize: 12 },
  headerLink: { paddingHorizontal: Spacing.sm, minHeight: 40, justifyContent: 'center' },
  headerLinkText: { fontSize: 15, fontWeight: '600' },
});
