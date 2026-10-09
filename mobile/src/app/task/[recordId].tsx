import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RecordView, ReviewAction } from '@shared/api';
import { EntryField, type FieldState } from '@/components/review/EntryField';
import { Button, Card, Chip, Dialog, Notice, SegmentedControl } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing, useColorSchemeSetting, useTheme } from '@/constants/theme';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useNotifications } from '@/lib/notifications';
import { entryOf, patchFor, submitState, withValues, type EntryGroup, type EntryItem } from '@/lib/record-entry';
import { dateWords } from '@/lib/tasks-logic';

/** Every value, or only those still empty, on a long sheet. */
const SHOW: readonly { value: 'all' | 'empty'; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'empty', label: 'Only what is empty' },
];

/** How long after the last value is saved the record is read again, for DCRS's own checks. */
const RECHECK_MS = 1200;

const ACTION_WORDS: Record<ReviewAction, { title: string; button: string; done: string }> = {
  submit: { title: 'Submit this record?', button: 'Submit', done: 'Submitted. It now waits for verification.' },
  verify: { title: 'Verify this record?', button: 'Verify', done: 'Verified.' },
  send_back: { title: 'Send this record back?', button: 'Send back', done: 'Sent back, with your reason.' },
  resume: { title: 'Change this record again?', button: 'Resume', done: 'It can be changed again. Submit it when it is right.' },
};

/**
 * THE REVIEW SCREEN, which is also where the readings are entered. The record as DCRS has it now, with what the
 * assistant prepared and why; every value a person can write as an input with big buttons for the usual answers, each
 * saved in DCRS at once; a "Reviewed and correct" tick; and Submit (once DCRS's checks pass), Verify or Send back,
 * each asked once more before it is done. DCRS's levels decide what may be done, and its refusals are shown in its words.
 */
export default function ReviewScreen() {
  const { recordId } = useLocalSearchParams<{ recordId: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { call } = useAuth();
  const { refresh: refreshCounts, language } = useNotifications();
  const [record, setRecord] = useState<RecordView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<Record<string, FieldState>>({});
  const [reviewed, setReviewed] = useState(false);
  const [onlyEmpty, setOnlyEmpty] = useState<'all' | 'empty'>('all');
  const [sheet, setSheet] = useState<ReviewAction | null>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const recheck = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const fresh = await call((token) => api.record(token, recordId, language));
      setRecord(fresh);
      setSaved({});
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [call, recordId, language]);

  useEffect(() => {
    void load();
    return () => {
      if (recheck.current) clearTimeout(recheck.current);
    };
  }, [load]);

  async function save(item: EntryItem, value: string) {
    setFields((current) => ({ ...current, [item.id]: { saving: true } }));
    // A value changed after the tick is not reviewed yet.
    setReviewed(false);
    try {
      const answer = await call((token) => api.changeRecord(token, recordId, { patch: patchFor(item.target, value), note: 'Entered on the phone' }, language));
      const problems = (answer.problems ?? []).filter((problem): problem is string => typeof problem === 'string' && problem.trim() !== '');
      if (problems.length === 0) setSaved((current) => ({ ...current, [item.id]: value }));
      setFields((current) => ({ ...current, [item.id]: problems.length > 0 ? { error: problems.join(' ') } : { saved: true } }));
      setRecord((current) => (current ? { ...current, status: answer.status, editable: answer.editable, actions: answer.actions } : current));
    } catch (e) {
      setFields((current) => ({ ...current, [item.id]: { error: errorMessage(e) } }));
    }
    if (recheck.current) clearTimeout(recheck.current);
    recheck.current = setTimeout(() => void load(), RECHECK_MS);
  }

  async function act(action: ReviewAction, reason: string) {
    setActing(true);
    setActionError(null);
    try {
      await call((token) =>
        api.actOnRecord(token, recordId, { action, ...(action === 'send_back' ? { reason } : {}), ...(action === 'resume' ? {} : { reviewed: true }) }, language),
      );
      setSheet(null);
      setDone(ACTION_WORDS[action].done);
      setReviewed(false);
      await load();
      void refreshCounts();
    } catch (e) {
      setActionError(errorMessage(e));
    }
    setActing(false);
  }

  const title = record ? `${record.document.formatNo && !/^to be /i.test(record.document.formatNo) ? `${record.document.formatNo} ` : ''}${record.document.name}` : 'Record';
  const header = <Stack.Screen options={{ title: record ? record.document.formatNo || 'Record' : 'Record' }} />;

  if (!record) {
    return (
      <View style={styles.center}>
        {header}
        {error ? (
          <View style={styles.errorBox}>
            <Notice tone="danger">{error}</Notice>
            <Button title="Try again" onPress={() => void load()} />
          </View>
        ) : (
          <ActivityIndicator color={theme.accent} />
        )}
      </View>
    );
  }

  const entry = withValues(entryOf(record), saved);
  const editable = record.editable && entry.supported && record.canSubmit !== false;
  const groups: EntryGroup[] = editable
    ? onlyEmpty === 'empty'
      ? entry.groups.map((group) => ({ ...group, items: group.items.filter((item) => item.value.trim() === '') })).filter((group) => group.items.length > 0)
      : entry.groups
    : [];
  const submit = submitState(record, entry, reviewed);
  const canVerify = record.canVerify !== false;
  const verifies = canVerify && record.actions.includes('verify');
  const sendsBack = canVerify && record.actions.includes('send_back');
  const resumes = record.actions.includes('resume');
  const askMitra = () =>
    router.navigate({ pathname: '/', params: { ask: `About ${title} of ${dateWords(record.date)} (record ${record.recordId}): ` } });

  const top = (
    <View style={styles.top}>
      <Card>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>{dateWords(record.date)}</Text>
          <Chip label={record.status} tone={record.status === 'Verified' ? 'success' : record.status === 'Rejected' ? 'danger' : 'neutral'} />
        </View>
        {record.sentBackBecause ? (
          <Notice>
            Sent back{record.sentBackBy ? ` by ${record.sentBackBy}` : ''}: {record.sentBackBecause}
          </Notice>
        ) : null}
      </Card>
      {record.prepared ? (
        <Card>
          <View style={styles.metaRow}>
            <Ionicons name="sparkles-outline" size={18} color={theme.accent} />
            <Text style={[styles.label, { color: theme.text }]}>Prepared by the assistant</Text>
          </View>
          {record.prepared.notes.map((note) => (
            <Text key={note} style={[styles.meta, { color: theme.textSecondary }]}>
              • {note}
            </Text>
          ))}
          <Text style={[styles.meta, { color: theme.textSecondary }]}>The readings are yours: enter what you saw, then check every value.</Text>
        </Card>
      ) : null}
      {done ? <Notice>{done}</Notice> : null}
      {editable ? (
        <>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {entry.empty === 0 ? 'Every box has a value. Check them, then tick below.' : `${entry.empty} of ${entry.count} boxes are still empty. Each answer is saved as you go.`}
          </Text>
          {entry.count > 8 ? (
            <SegmentedControl
              label="Show"
              options={SHOW}
              value={onlyEmpty}
              onChange={(show) => setOnlyEmpty(show)}
            />
          ) : null}
        </>
      ) : !entry.supported && record.editable ? (
        <Notice>This form is filled on its own page in DCRS, or ask Mitra to fill it. Its values are below.</Notice>
      ) : null}
    </View>
  );

  const bottom = (
    <View style={styles.bottom}>
      {!editable ? <Values record={record} /> : null}
      {submit.shown || verifies || sendsBack ? (
        <Pressable
          accessibilityRole="checkbox"
          aria-checked={reviewed}
          onPress={() => setReviewed(!reviewed)}
          style={[styles.tick, { borderColor: reviewed ? theme.success : theme.border, backgroundColor: theme.surface }]}>
          <Ionicons name={reviewed ? 'checkbox' : 'square-outline'} size={26} color={reviewed ? theme.success : theme.textSecondary} />
          <Text style={[styles.label, { color: theme.text }]}>Reviewed and correct</Text>
        </Pressable>
      ) : null}
      {submit.shown ? (
        <>
          {submit.why ? <Text style={[styles.meta, { color: theme.textSecondary }]}>{submit.why}</Text> : null}
          <Button title="Submit" disabled={!submit.enabled} onPress={() => setSheet('submit')} />
        </>
      ) : null}
      {verifies || sendsBack ? (
        <View style={styles.row}>
          {sendsBack ? <Button title="Send back" kind="danger" disabled={!reviewed} onPress={() => setSheet('send_back')} style={styles.flex} /> : null}
          {verifies ? <Button title="Verify" disabled={!reviewed} onPress={() => setSheet('verify')} style={styles.flex} /> : null}
        </View>
      ) : null}
      {resumes ? <Button title="Change it again (resume)" kind="secondary" onPress={() => setSheet('resume')} /> : null}
      <Button title="Ask Mitra to change something" kind="secondary" onPress={askMitra} />
    </View>
  );

  return (
    <>
      {header}
      <FlatList
        data={groups}
        keyExtractor={(group) => group.title}
        contentContainerStyle={[styles.list, { paddingBottom: Spacing.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={6}
        windowSize={5}
        ListHeaderComponent={top}
        ListFooterComponent={bottom}
        renderItem={({ item: group }) => (
          <View style={styles.group}>
            <Text style={[styles.groupTitle, { color: theme.textSecondary }]}>{group.title}</Text>
            {group.items.map((item) => (
              <EntryField key={item.id} item={item} value={item.value} state={fields[item.id]} editable={editable} onSave={(value) => void save(item, value)} />
            ))}
          </View>
        )}
      />
      {sheet ? (
        <ConfirmSheet
          action={sheet}
          what={`${title}, ${dateWords(record.date)}`}
          busy={acting}
          error={actionError}
          onCancel={() => {
            setSheet(null);
            setActionError(null);
          }}
          onConfirm={(reason) => void act(sheet, reason)}
        />
      ) : null}
    </>
  );
}

/** The record's values in DCRS's words, when it cannot be changed here. */
function Values({ record }: { record: RecordView }) {
  const theme = useTheme();
  if (record.inWords.length === 0) return <Text style={[styles.meta, { color: theme.textSecondary }]}>No values are entered on it yet.</Text>;
  return (
    <Card>
      {record.inWords.map((line, index) => (
        <Text key={`${index}`} style={[styles.meta, { color: theme.text }]}>
          {line.where ? <Text style={{ color: theme.textSecondary }}>{line.where} · </Text> : null}
          {line.label}: {line.value}
        </Text>
      ))}
    </Card>
  );
}

/** Asked once more before anything is done; a send back says why. */
function ConfirmSheet({
  action,
  what,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  action: ReviewAction;
  what: string;
  busy: boolean;
  error: string | null;
  onCancel(): void;
  onConfirm(reason: string): void;
}) {
  const theme = useTheme();
  const scheme = useColorSchemeSetting();
  const [reason, setReason] = useState('');
  const words = ACTION_WORDS[action];
  const needsReason = action === 'send_back';
  const said =
    action === 'resume'
      ? `${what} goes back to In Progress, so it can be changed and submitted again.`
      : `${what}. You ticked that every value is reviewed and correct. DCRS checks it again, and its history says it was done from the phone after review.`;
  return (
    <Dialog title={words.title} onClose={onCancel}>
      <Text style={[styles.meta, { color: theme.text }]}>{said}</Text>
      {needsReason ? (
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Why it goes back (the person who submitted it sees this)"
          placeholderTextColor={theme.textSecondary}
          keyboardAppearance={scheme}
          multiline
          accessibilityLabel="Why it goes back"
          style={[styles.reason, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
        />
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={styles.row}>
        <Button title="Cancel" kind="secondary" onPress={onCancel} style={styles.flex} />
        <Button
          title={words.button}
          kind={action === 'send_back' ? 'danger' : 'primary'}
          busy={busy}
          disabled={needsReason && reason.trim() === ''}
          onPress={() => onConfirm(reason.trim())}
          style={styles.flex}
        />
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  errorBox: { width: '100%', maxWidth: 480, gap: Spacing.md },
  list: { padding: Spacing.lg, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  top: { gap: Spacing.md, marginBottom: Spacing.md },
  title: { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  meta: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 16, fontWeight: '600' },
  group: { gap: Spacing.sm, marginBottom: Spacing.lg },
  groupTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  bottom: { gap: Spacing.md, marginTop: Spacing.sm },
  tick: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, minHeight: 56 },
  row: { flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
  reason: { minHeight: 80, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 16, textAlignVertical: 'top' },
});
