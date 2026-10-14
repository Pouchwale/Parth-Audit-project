import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NotificationLanguage, RecordChangeResult } from '@shared/api';
import { Button, Dialog, Notice } from '@/components/ui';
import { Radius, Spacing, useColorSchemeSetting, useTheme } from '@/constants/theme';
import { previewLines, type LineBox } from '@/lib/record-entry';
import { reviewWords } from '@/lib/review-words';

/** What the sheet is for: adding a line (its boxes to fill), deleting a line, or clearing a box. */
export type LineChange =
  | { kind: 'add'; noun: string; boxes: LineBox[]; maxAddAtOnce: number; patch(values: Record<string, string>): Record<string, unknown> }
  | { kind: 'delete'; noun: string; patch: Record<string, unknown> }
  | { kind: 'clear'; patch: Record<string, unknown> };

/**
 * THE CONFIRMATION SHEET of a change to a record's lines (DCRS's REQUIREMENTS §113). It asks DCRS for a dry run of the
 * patch first (nothing written) and shows what DCRS would delete, clear or add in DCRS's own words; a signed-off record
 * asks why it is corrected (DCRS reopens it with that reason). Only then, on the person's tap, the same patch is sent
 * for real. Plain and quick: no animation, one dialog.
 */
export function LineSheet({
  change,
  language,
  dryRun,
  commit,
  onDone,
  onCancel,
}: {
  change: LineChange;
  language: NotificationLanguage | undefined;
  /** Asks DCRS what the patch would do: the words for this sheet. */
  dryRun(patch: Record<string, unknown>, reason: string | undefined): Promise<RecordChangeResult>;
  /** Makes the change in DCRS. */
  commit(patch: Record<string, unknown>, reason: string | undefined): Promise<RecordChangeResult>;
  onDone(result: RecordChangeResult): void;
  onCancel(): void;
}) {
  const theme = useTheme();
  const scheme = useColorSchemeSetting();
  const words = reviewWords(language);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<RecordChangeResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = change.kind === 'add' ? change.patch(values) : change.patch;
  const filled = change.kind !== 'add' || Object.values(values).some((value) => value.trim() !== '');
  const needsReason = preview?.willReopen === true;

  // A deletion or a clear is dry-run as soon as the sheet opens; an add once the person asks, with what they typed.
  useEffect(() => {
    if (change.kind === 'add') return;
    let gone = false;
    setChecking(true);
    dryRun(change.patch, undefined)
      .then((answer) => {
        if (!gone) setPreview(answer);
      })
      .catch((e: unknown) => {
        if (!gone) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!gone) setChecking(false);
      });
    return () => {
      gone = true;
    };
    // The patch of a delete or a clear never changes while the sheet is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [change.kind]);

  async function check() {
    setChecking(true);
    setError(null);
    try {
      setPreview(await dryRun(patch, reason.trim() || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setChecking(false);
  }

  async function go() {
    setBusy(true);
    setError(null);
    try {
      onDone(await commit(patch, needsReason ? reason.trim() : undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const title = change.kind === 'add' ? words.addTitle(change.noun) : change.kind === 'delete' ? words.deleteTitle : words.clearTitle;
  const button = change.kind === 'add' ? words.add : change.kind === 'delete' ? words.delete : words.clear;
  const lines = preview ? previewLines(preview) : null;
  const ready = !!preview && !checking && (!needsReason || reason.trim() !== '');

  return (
    <Dialog title={title} onClose={onCancel}>
      {change.kind === 'add' ? (
        <View style={styles.boxes}>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            {words.leaveBlank}
            {change.maxAddAtOnce > 1 ? ` ${words.atMost(change.maxAddAtOnce)}` : ''}
          </Text>
          {change.boxes.map((box) => (
            <View key={box.key} style={styles.box}>
              <Text style={[styles.label, { color: theme.text }]}>
                {box.label}
                {box.unit ? ` (${box.unit})` : ''}
              </Text>
              <TextInput
                value={values[box.key] ?? ''}
                onChangeText={(text) => {
                  setValues((current) => ({ ...current, [box.key]: text }));
                  // What DCRS would do is worded for the values as they stand: asked again before the add.
                  setPreview(null);
                }}
                placeholder={box.type === 'time' ? 'HH:MM' : box.type === 'date' ? 'YYYY-MM-DD' : box.options.length > 0 ? box.options.join(' / ') : ''}
                placeholderTextColor={theme.textSecondary}
                keyboardType={box.type === 'number' ? 'decimal-pad' : 'default'}
                keyboardAppearance={scheme}
                accessibilityLabel={box.label}
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              />
            </View>
          ))}
        </View>
      ) : null}

      {checking ? (
        <View style={styles.row}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.hint, { color: theme.textSecondary }]}>{words.checking}</Text>
        </View>
      ) : null}

      {lines ? (
        <View style={styles.preview}>
          {lines.removed.length > 0 ? <Said label={words.willDelete} lines={lines.removed} tone="danger" /> : null}
          {lines.cleared.length > 0 ? <Said label={words.willClear} lines={lines.cleared} tone="danger" /> : null}
          {lines.added.length > 0 ? <Said label={words.willAdd} lines={lines.added} tone="normal" /> : null}
          {lines.removed.length + lines.cleared.length + lines.added.length === 0 && lines.set.length > 0 ? <Said label="" lines={lines.set} tone="normal" /> : null}
          {lines.removed.length + lines.cleared.length + lines.added.length + lines.set.length === 0 ? <Notice>{words.nothingWouldChange}</Notice> : null}
          {(preview?.problems ?? []).map((problem) => (
            <Text key={problem} style={[styles.hint, { color: theme.warning }]}>
              {problem}
            </Text>
          ))}
        </View>
      ) : null}

      {needsReason && preview ? (
        <View style={styles.box}>
          <Notice>{words.reopens(preview.status)}</Notice>
          <Text style={[styles.label, { color: theme.text }]}>{words.reasonLabel}</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={words.reasonHint}
            placeholderTextColor={theme.textSecondary}
            keyboardAppearance={scheme}
            multiline
            accessibilityLabel={words.reasonLabel}
            style={[styles.input, styles.reason, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />
        </View>
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <View style={styles.row}>
        <Button title={words.cancel} kind="secondary" onPress={onCancel} style={styles.flex} />
        {change.kind === 'add' && !preview ? (
          <Button title={words.add} disabled={!filled || checking} busy={checking} onPress={() => void check()} style={styles.flex} />
        ) : (
          <Button title={button} kind={change.kind === 'add' ? 'primary' : 'danger'} disabled={!ready} busy={busy} onPress={() => void go()} style={styles.flex} />
        )}
      </View>
    </Dialog>
  );
}

/** What DCRS says it will do, line by line, in its own words. */
function Said({ label, lines, tone }: { label: string; lines: string[]; tone: 'danger' | 'normal' }) {
  const theme = useTheme();
  return (
    <View style={styles.said}>
      {label ? <Text style={[styles.label, { color: tone === 'danger' ? theme.danger : theme.text }]}>{label}</Text> : null}
      {lines.map((line, index) => (
        <Text key={`${index}:${line}`} style={[styles.line, { color: theme.text, borderColor: theme.border }]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  boxes: { gap: Spacing.md },
  box: { gap: Spacing.xs },
  label: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  hint: { fontSize: 13, lineHeight: 18 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: 16 },
  reason: { minHeight: 72, textAlignVertical: 'top', paddingVertical: Spacing.sm },
  preview: { gap: Spacing.sm },
  said: { gap: Spacing.xs },
  line: { fontSize: 15, lineHeight: 20, borderLeftWidth: 3, paddingLeft: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  flex: { flex: 1 },
});
