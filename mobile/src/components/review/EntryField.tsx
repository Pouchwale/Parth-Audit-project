import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Radius, Spacing, useColorSchemeSetting, useTheme } from '@/constants/theme';
import { rangeNote, type EntryItem } from '@/lib/record-entry';

export interface FieldState {
  saving?: boolean;
  saved?: boolean;
  error?: string | null;
}

/** How long typing must pause before a value is saved (it is saved at once when the box is left). */
const TYPING_PAUSE_MS = 1500;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "Now" and "Today" as DCRS stores them: 09:30 and 2026-10-08, on the phone's clock. */
function nowValue(type: EntryItem['type']): string {
  const at = new Date();
  return type === 'time' ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/**
 * One value of the record: its label and line, big buttons for the usual answers (Yes and No, its choices, 0 1 2, OK
 * and Not OK), and a box to type anything else. A button saves at once; typing saves when the box is left or typing
 * pauses. Read-only when the record cannot be changed now.
 */
export function EntryField({ item, value, state, editable, onSave }: { item: EntryItem; value: string; state: FieldState | undefined; editable: boolean; onSave(value: string): void }) {
  const theme = useTheme();
  const scheme = useColorSchemeSetting();
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The value last sent, so pressing Enter and then leaving the box saves it once, not twice, while the first save is
  // still on its way. Sent again only after DCRS refused it.
  const sent = useRef<string | null>(null);

  // What DCRS now holds replaces the box's words, unless the person is typing in it.
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function commit(next: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const answer = next.trim();
    if (answer === value.trim() || (answer === sent.current && !state?.error)) return;
    sent.current = answer;
    onSave(answer);
  }

  function type(next: string) {
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), TYPING_PAUSE_MS);
  }

  function pick(answer: string) {
    setText(answer);
    commit(answer);
  }

  const buttons = item.type === 'choice' ? item.options : item.quick;
  const typed = item.type !== 'yesno' && item.type !== 'choice';
  // A time or a date can be the moment it is entered.
  const now = item.type === 'time' ? 'Now' : item.type === 'date' ? 'Today' : null;
  const note = rangeNote(item, text);
  const empty = value.trim() === '';

  return (
    <View style={[styles.field, { borderColor: empty && item.required ? theme.warning : theme.border, backgroundColor: theme.surface }]}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: theme.text }]}>
          {item.label}
          {item.unit ? ` (${item.unit})` : ''}
          {item.required ? <Text style={{ color: theme.danger }}> *</Text> : null}
        </Text>
        {state?.saving ? (
          <ActivityIndicator size="small" color={theme.textSecondary} />
        ) : state?.saved && !state.error ? (
          <Ionicons name="checkmark-circle" size={20} color={theme.success} accessibilityLabel="Saved" />
        ) : null}
      </View>
      {item.where ? <Text style={[styles.where, { color: theme.textSecondary }]}>{item.where}</Text> : null}

      {!editable ? (
        <Text style={[styles.value, { color: empty ? theme.textSecondary : theme.text }]}>{empty ? 'Not entered' : value}</Text>
      ) : (
        <>
          {buttons.length > 0 || now ? (
            <View style={styles.buttons}>
              {buttons.map((answer) => {
                const selected = value === answer;
                return (
                  <Pressable
                    key={answer}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${item.label}: ${answer}`}
                    onPress={() => pick(answer)}
                    style={({ pressed }) => [
                      styles.answer,
                      {
                        backgroundColor: selected ? theme.accent : theme.surfaceMuted,
                        borderColor: selected ? theme.accent : theme.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}>
                    <Text style={[styles.answerText, { color: selected ? theme.onAccent : theme.text }]}>{answer}</Text>
                  </Pressable>
                );
              })}
              {now ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label}: ${now}`}
                  onPress={() => pick(nowValue(item.type))}
                  style={({ pressed }) => [styles.answer, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, opacity: pressed ? 0.8 : 1 }]}>
                  <Text style={[styles.answerText, { color: theme.text }]}>{now}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {typed ? (
            <TextInput
              value={text}
              onChangeText={type}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                commit(text);
              }}
              onSubmitEditing={() => commit(text)}
              placeholder={item.type === 'time' ? 'HH:MM' : item.type === 'date' ? 'YYYY-MM-DD' : item.type === 'number' ? 'Number' : 'Type here'}
              placeholderTextColor={theme.textSecondary}
              keyboardType={item.type === 'number' ? 'decimal-pad' : 'default'}
              keyboardAppearance={scheme}
              returnKeyType="done"
              accessibilityLabel={item.where ? `${item.label}, ${item.where}` : item.label}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            />
          ) : null}
        </>
      )}
      {note ? <Text style={[styles.note, { color: theme.warning }]}>{note}</Text> : null}
      {state?.error ? <Text style={[styles.note, { color: theme.danger }]}>{state.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label: { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  where: { fontSize: 13, marginTop: -Spacing.xs },
  value: { fontSize: 16 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  answer: { minWidth: 64, minHeight: 48, paddingHorizontal: Spacing.lg, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  answerText: { fontSize: 17, fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: 16 },
  note: { fontSize: 13, lineHeight: 18 },
});
