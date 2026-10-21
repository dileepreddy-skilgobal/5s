import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, TYPE } from '../constants/theme';

/** SkilGlobal 5S logo mark: white "5S" on a blue square, as in the web app. */
export const BrandMark: React.FC<{ size?: number }> = ({ size = 56 }) => (
  <View
    style={[styles.mark, { width: size, height: size, borderRadius: Math.round(size * 0.22) }]}
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
  >
    <Text style={[styles.markText, { fontSize: Math.round(size * 0.4) }]}>5S</Text>
  </View>
);

interface BootstrapScreenProps {
  /** What the app is doing right now, e.g. "Loading your workspace…". */
  message: string;
  /** Shown as a small note when the device has no connection and saved data is being used. */
  isOffline?: boolean;
}

/** Branded start-up screen shown while the session is checked and the first data load runs. */
export const BootstrapScreen: React.FC<BootstrapScreenProps> = ({ message, isOffline = false }) => (
  <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={message} accessibilityState={{ busy: true }}>
    <View style={styles.content}>
      <BrandMark size={64} />
      <Text style={styles.appName}>SkilGlobal 5S</Text>
      <ActivityIndicator size="large" color={COLORS.primary} style={styles.spinner} />
      <Text style={styles.message}>{message}</Text>
      {isOffline ? (
        <View style={styles.offlineNote}>
          <Ionicons name="cloud-offline-outline" size={16} color={COLORS.warning} />
          <Text style={styles.offlineText}>No connection. Using data saved on this device.</Text>
        </View>
      ) : null}
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxl,
  },
  content: { alignItems: 'center', maxWidth: 360, width: '100%' },
  mark: {
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { color: COLORS.textInverse, fontWeight: '700' },
  appName: { ...TYPE.display, color: COLORS.textDark, marginTop: SPACING.lg },
  spinner: { marginTop: SPACING.xxxl },
  message: { ...TYPE.body, color: COLORS.textMedium, marginTop: SPACING.md, textAlign: 'center' },
  offlineNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    backgroundColor: COLORS.warningSoft,
  },
  offlineText: { ...TYPE.caption, color: COLORS.warning, flexShrink: 1 },
});
