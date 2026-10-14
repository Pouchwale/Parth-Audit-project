import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RecordPart } from '@shared/api';
import { Radius, Spacing, useTheme } from '@/constants/theme';

/**
 * A record Mitra changed (DCRS's REQUIREMENTS §113): the document and day, and the lines touched in DCRS's words. A
 * tap opens the Review screen at the first line added. Plain and quick: no animation.
 */
export function RecordCard({ part }: { part: RecordPart }) {
  const theme = useTheme();
  const open = () =>
    router.push({ pathname: '/task/[recordId]', params: { recordId: part.recordId, ...(part.lineId === null || part.lineId === undefined ? {} : { line: String(part.lineId) }) } });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${part.title}: ${part.lines.join('; ')}`}
      onPress={open}
      style={({ pressed }) => [styles.card, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.8 : 1 }]}>
      <View style={styles.head}>
        <Ionicons name="document-text-outline" size={18} color={theme.accent} />
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {part.title}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </View>
      {part.lines.map((line, index) => (
        <Text key={`${index}:${line}`} style={[styles.line, { color: theme.textSecondary, borderColor: theme.border }]} numberOfLines={2}>
          {line}
        </Text>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.xs, marginVertical: Spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  line: { fontSize: 14, lineHeight: 19, borderLeftWidth: 2, paddingLeft: Spacing.sm },
});
