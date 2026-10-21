import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, TOUCH_TARGET, TYPE } from '../constants/theme';
import { AccessNotice, clearAccessNotice, getAccessNotice, onAccessNotice } from '../services/http';

/**
 * Organization-level notice from the server: read-only organization (402: trial ended / subscription
 * lapsed) or two-factor enrolment required (403). Shown above every tab until dismissed.
 */
export const AccessNoticeBanner: React.FC = () => {
  const [notice, setNotice] = useState<AccessNotice | null>(getAccessNotice());

  useEffect(() => onAccessNotice(setNotice), []);

  if (!notice) return null;

  const readOnly = notice.kind === 'READ_ONLY';
  const tone = readOnly
    ? { bg: COLORS.warningSoft, border: COLORS.warningBorder, text: COLORS.warning }
    : { bg: COLORS.infoSoft, border: COLORS.infoBorder, text: COLORS.info };
  return (
    <View style={[styles.banner, { backgroundColor: tone.bg, borderColor: tone.border }]} accessibilityLiveRegion="polite">
      <Ionicons name={readOnly ? 'lock-closed-outline' : 'shield-outline'} size={18} color={tone.text} style={styles.icon} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: tone.text }]}>
          {readOnly ? 'Your organization is read-only' : 'Two-factor authentication required'}
        </Text>
        <Text style={styles.text}>
          {notice.message}
          {readOnly ? ' You can still view data. New audits, reports and red tags stay on this device and cannot be sent yet.' : ''}
        </Text>
      </View>
      <Pressable
        onPress={clearAccessNotice}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notice"
      >
        <Ionicons name="close" size={20} color={COLORS.textMedium} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginHorizontal: SPACING.screen,
    marginTop: SPACING.sm,
    paddingLeft: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  icon: { marginTop: SPACING.sm },
  body: { flex: 1, paddingVertical: SPACING.sm },
  title: { ...TYPE.label },
  text: { ...TYPE.caption, color: COLORS.textDark, marginTop: 2 },
  close: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
