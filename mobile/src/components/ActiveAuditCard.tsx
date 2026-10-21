import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPE } from '../constants/theme';
import { Badge, Tone } from './ui';
import { AuditExecution } from '../types';

interface ActiveAuditCardProps {
  audit: AuditExecution;
  onPress: (audit: AuditExecution) => void;
}

const STATUS_TONE: Record<AuditExecution['status'], Tone> = {
  SCHEDULED: 'info',
  IN_PROGRESS: 'warning',
  PENDING_REVIEW: 'neutral',
  COMPLETED: 'success',
};

/** Server badges arrive in title case ("Awaiting Sign-off"); show them in sentence case. */
const sentenceCase = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : text);

/** Same score bands as the web analytics: >= 90 / >= 75 / >= 60 / below 60. */
const scoreTone = (score: number): Tone => (score >= 90 ? 'success' : score >= 75 ? 'info' : score >= 60 ? 'warning' : 'danger');

/** Timestamp of a timeline step by label; only real dates (not the "Pending" placeholder). */
const stepTime = (audit: AuditExecution, label: string): string | undefined => {
  const ts = audit.timeline?.find((s) => s.label.toLowerCase() === label.toLowerCase())?.timestamp;
  return ts && ts !== 'Pending' ? ts : undefined;
};

/** One line describing the relevant dates for the audit's current status (from real audit data only). */
const dateLine = (audit: AuditExecution): string | null => {
  switch (audit.status) {
    case 'SCHEDULED': {
      const planned = stepTime(audit, 'Planned') || audit.scheduledDate;
      const due = stepTime(audit, 'Due');
      return [planned && `Planned ${planned}`, due && `Due ${due}`].filter(Boolean).join(' · ') || null;
    }
    case 'IN_PROGRESS': {
      const parts = [audit.scheduledDate, audit.startedAt].filter(Boolean).join(', ');
      return parts ? `Started ${parts}` : null;
    }
    case 'PENDING_REVIEW': {
      const submitted = stepTime(audit, 'Submitted');
      return submitted ? `Submitted ${submitted}` : null;
    }
    case 'COMPLETED': {
      const signedOff = stepTime(audit, 'Signed off');
      return signedOff ? `Signed off ${signedOff}` : null;
    }
    default:
      return null;
  }
};

/** Compact audit summary card: code, area, template, status, score and the relevant dates. */
export const ActiveAuditCard: React.FC<ActiveAuditCardProps> = ({ audit, onPress }) => {
  const status = sentenceCase(audit.statusBadge || 'In progress');
  const dates = dateLine(audit);
  const scored = audit.overallScore !== null && audit.overallScore !== undefined;
  const score = scored ? Math.round(audit.overallScore as number) : null;

  return (
    <Pressable
      onPress={() => onPress(audit)}
      accessibilityRole="button"
      accessibilityLabel={`${audit.trackingNumber}, ${audit.locationName}, ${status}${score !== null ? `, score ${score}%` : ''}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.topRow}>
        <Text style={styles.code} numberOfLines={1}>
          {audit.trackingNumber}
        </Text>
        <Badge label={status} tone={STATUS_TONE[audit.status] ?? 'neutral'} />
      </View>

      <Text style={styles.area} numberOfLines={2}>
        {audit.locationName || 'Area not set'}
      </Text>
      {audit.category || audit.templateTitle ? (
        <Text style={styles.meta} numberOfLines={2}>
          {[audit.category, audit.templateTitle].filter(Boolean).join(' · ')}
        </Text>
      ) : null}

      {dates || score !== null ? (
        <View style={styles.bottomRow}>
          {dates ? (
            <View style={styles.dateWrap}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.textMuted} />
              <Text style={styles.dateText} numberOfLines={2}>
                {dates}
              </Text>
            </View>
          ) : (
            <View style={styles.dateWrap} />
          )}
          {score !== null ? <Badge label={`Score ${score}%`} tone={scoreTone(score)} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginHorizontal: SPACING.screen,
    marginBottom: SPACING.md,
    ...SHADOWS.soft,
  },
  pressed: { opacity: 0.85 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  code: { ...TYPE.captionStrong, color: COLORS.textMedium, flexShrink: 1 },
  area: { ...TYPE.subheading, color: COLORS.textDark, marginTop: SPACING.sm },
  meta: { ...TYPE.caption, color: COLORS.textMedium, marginTop: 2 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  dateWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  dateText: { ...TYPE.caption, color: COLORS.textMedium, flexShrink: 1 },
});
