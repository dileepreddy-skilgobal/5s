import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, TOUCH_TARGET, TYPE } from '../constants/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Opens the QR scanner; the scan button is hidden when not given. */
  onScanPress?: () => void;
  placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({ value, onChangeText, onScanPress, placeholder = 'Search audits by code or area' }) => (
  <View style={styles.outer}>
    <View style={styles.box}>
      <Ionicons name="search-outline" size={20} color={COLORS.textMuted} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        value={value}
        onChangeText={onChangeText}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
        </Pressable>
      )}
      {onScanPress ? (
        <Pressable onPress={onScanPress} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Scan an area QR code">
          <Ionicons name="scan-outline" size={22} color={COLORS.primary} />
        </Pressable>
      ) : null}
    </View>
  </View>
);

const styles = StyleSheet.create({
  outer: { paddingHorizontal: SPACING.screen, marginBottom: SPACING.lg },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    minHeight: 48,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  input: { flex: 1, minWidth: 0, ...TYPE.body, color: COLORS.textDark, paddingVertical: 10 },
  iconBtn: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
