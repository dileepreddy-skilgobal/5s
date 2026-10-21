import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPE } from '../constants/theme';

export interface QuickAction {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  /** Spoken description when the short label is not enough. */
  accessibilityLabel?: string;
  /** The main action for this role (filled blue tile). */
  primary?: boolean;
}

/** Row of large shortcut tiles on the home screen (up to four per row; more wrap). */
export const QuickActions: React.FC<{ actions: QuickAction[] }> = ({ actions }) => {
  if (actions.length === 0) return null;
  return (
    <View style={styles.container}>
      {actions.map((a) => (
        <Pressable
          key={a.key}
          onPress={a.onPress}
          accessibilityRole="button"
          accessibilityLabel={a.accessibilityLabel ?? a.label}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        >
          <View style={[styles.iconBox, a.primary ? styles.iconBoxPrimary : styles.iconBoxDefault]}>
            <Ionicons name={a.icon} size={24} color={a.primary ? COLORS.textInverse : COLORS.primary} />
          </View>
          <Text style={[styles.label, a.primary && styles.labelPrimary]} numberOfLines={2}>
            {a.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.screen - SPACING.xs,
    marginBottom: SPACING.sm,
  },
  item: {
    width: '25%',
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  pressed: { opacity: 0.75 },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  iconBoxPrimary: { backgroundColor: COLORS.primary, ...SHADOWS.floating },
  iconBoxDefault: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.soft },
  label: { ...TYPE.captionStrong, fontSize: 13, lineHeight: 17, color: COLORS.textDark, textAlign: 'center' },
  labelPrimary: { color: COLORS.primary },
});
