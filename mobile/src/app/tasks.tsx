import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TaskItem, Tasks } from '@shared/api';
import { Card, Notice } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing, useTheme } from '@/constants/theme';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useNotifications } from '@/lib/notifications';
import { moduleSummary, modulesOf, taskKey, taskLine, taskSections, taskTitle, type ModuleSummary, type SectionKey } from '@/lib/tasks-logic';

/**
 * The person's day, as DCRS works it out for what they answer for and may verify: ready for their OK, needing their
 * input, overdue, waiting for verification, and coming up. The super admin sees every module, with a filter and each
 * module's counts. A line opens its record on the Review screen; one not started yet is started first.
 */
export default function TasksScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { call, user } = useAuth();
  const { arrived, language } = useNotifications();
  const boss = user?.role === 'super_admin';
  const [tasks, setTasks] = useState<Tasks | null>(null);
  const [module, setModule] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks(await call((token) => api.tasks(token, language)));
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
  // An alert that arrives while Tasks is open: read again.
  useEffect(() => {
    if (arrived > 0) void load();
  }, [arrived, load]);

  async function pullToRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function open(item: TaskItem) {
    if (item.recordId) {
      router.push({ pathname: '/task/[recordId]', params: { recordId: item.recordId } });
      return;
    }
    // Not started yet: DCRS starts it (prepared as its morning job prepares one), then it opens.
    setStarting(taskKey(item));
    try {
      const started = await call((token) => api.startRecord(token, { documentId: item.documentId, date: item.dueDate }, language));
      router.push({ pathname: '/task/[recordId]', params: { recordId: started.record.recordId } });
    } catch (e) {
      setError(errorMessage(e));
    }
    setStarting(null);
  }

  const header = <Stack.Screen options={{ title: 'Tasks' }} />;
  if (!tasks && !error) {
    return (
      <View style={styles.center}>
        {header}
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const sections = tasks ? taskSections(tasks, module) : [];
  const modules = tasks && boss ? modulesOf(tasks) : [];
  const today = tasks?.date ?? '';

  return (
    <>
      {header}
      <SectionList
        sections={sections.map((section) => ({ ...section, data: section.items }))}
        keyExtractor={(item) => taskKey(item)}
        contentContainerStyle={[styles.list, { paddingBottom: Spacing.lg + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} />}
        initialNumToRender={12}
        windowSize={5}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.header}>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            {tasks?.day?.label ? <Text style={[styles.dayLabel, { color: theme.textSecondary }]}>{tasks.day.label}</Text> : null}
            {boss && tasks ? <BossSummary rows={moduleSummary(tasks)} /> : null}
            {modules.length > 1 ? <ModuleFilter modules={modules} value={module} onChange={setModule} /> : null}
          </View>
        }
        ListEmptyComponent={
          error ? null : (
            <Text style={[styles.empty, { color: theme.textSecondary }]}>
              {module ? `Nothing in ${module} today.` : 'Nothing waits for you today. New records arrive here, and in the inbox, as DCRS prepares them.'}
            </Text>
          )
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: section.key === 'overdue' ? theme.danger : theme.text }]}>
              {section.title} · {section.data.length}
            </Text>
            <Text style={[styles.hint, { color: theme.textSecondary }]}>{section.hint}</Text>
          </View>
        )}
        renderItem={({ item, section }) => (
          <TaskRow item={item} kind={section.key} today={today} busy={starting === taskKey(item)} onPress={() => void open(item)} />
        )}
      />
    </>
  );
}

function TaskRow({ item, kind, today, busy, onPress }: { item: TaskItem; kind: SectionKey; today: string; busy: boolean; onPress(): void }) {
  const theme = useTheme();
  // A sheet coming up that nobody has started opens on its day.
  const opens = !!item.recordId || kind !== 'upcoming';
  const action = item.recordId ? null : opens ? 'Start' : null;
  return (
    <Pressable
      accessibilityRole={opens ? 'button' : 'text'}
      disabled={!opens || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
      <View style={styles.flex}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {taskTitle(item)}
        </Text>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>{taskLine(item, today)}</Text>
        {item.problems && item.problems.length > 0 ? (
          <Text style={[styles.hint, { color: theme.warning }]} numberOfLines={2}>
            {item.problems[0]}
          </Text>
        ) : null}
      </View>
      {busy ? (
        <ActivityIndicator color={theme.accent} />
      ) : action ? (
        <Text style={[styles.action, { color: theme.accent }]}>{action}</Text>
      ) : opens ? (
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      ) : null}
    </Pressable>
  );
}

/** The super admin's view of the plant today: each module's counts. */
function BossSummary({ rows }: { rows: ModuleSummary[] }) {
  const theme = useTheme();
  if (rows.length === 0) return null;
  const cell = (n: number, tone?: string) => <Text style={[styles.cell, { color: n > 0 ? (tone ?? theme.text) : theme.textSecondary }]}>{n}</Text>;
  return (
    <Card>
      <Text style={[styles.title, { color: theme.text }]}>Every module today</Text>
      <View style={styles.tableRow}>
        <Text style={[styles.moduleCell, styles.headCell, { color: theme.textSecondary }]}>Module</Text>
        {['Ready', 'Input', 'Late', 'Verify', 'Soon'].map((label) => (
          <Text key={label} style={[styles.cell, styles.headCell, { color: theme.textSecondary }]}>
            {label}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row.module} style={styles.tableRow}>
          <Text style={[styles.moduleCell, { color: theme.text }]} numberOfLines={1}>
            {row.module}
          </Text>
          {cell(row.ready)}
          {cell(row.input)}
          {cell(row.overdue, theme.danger)}
          {cell(row.verify)}
          {cell(row.upcoming)}
        </View>
      ))}
    </Card>
  );
}

function ModuleFilter({ modules, value, onChange }: { modules: string[]; value: string | null; onChange(module: string | null): void }) {
  const theme = useTheme();
  const chip = (label: string, module: string | null) => {
    const selected = value === module;
    return (
      <Pressable
        key={label}
        accessibilityRole="radio"
        aria-checked={selected}
        onPress={() => onChange(module)}
        style={[styles.chip, { backgroundColor: selected ? theme.accentSoft : theme.surfaceMuted }]}>
        <Text style={[styles.chipText, { color: selected ? theme.accent : theme.textSecondary }]}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel="Module" contentContainerStyle={styles.chips}>
      {chip('All modules', null)}
      {modules.map((module) => chip(module, module))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: Spacing.lg, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  header: { gap: Spacing.md },
  dayLabel: { fontSize: 14 },
  empty: { fontSize: 15, lineHeight: 21, marginTop: Spacing.lg },
  sectionHeader: { marginTop: Spacing.xl, marginBottom: Spacing.sm, gap: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.sm, minHeight: 64 },
  flex: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18 },
  action: { fontSize: 15, fontWeight: '700' },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minHeight: 28 },
  moduleCell: { flex: 1, fontSize: 14 },
  headCell: { fontSize: 12, fontWeight: '700' },
  cell: { width: 44, textAlign: 'center', fontSize: 14 },
  chips: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  chip: { paddingHorizontal: Spacing.md, minHeight: 36, borderRadius: Radius.pill, justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '600' },
});
