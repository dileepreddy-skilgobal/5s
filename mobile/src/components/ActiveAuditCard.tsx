import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../constants/theme';
import { AuditExecution } from '../types';

interface ActiveAuditCardProps {
  audit: AuditExecution;
  onPress: (audit: AuditExecution) => void;
  onSeeAllPress?: () => void;
  titleHeader?: string;
  showHeader?: boolean;
}

export const ActiveAuditCard: React.FC<ActiveAuditCardProps> = ({
  audit,
  onPress,
  onSeeAllPress,
  titleHeader = 'Active Audit Execution',
  showHeader = false,
}) => {
  // Dynamic timeline fallback if empty
  const steps =
    audit.timeline && audit.timeline.length > 0
      ? audit.timeline
      : [
          { label: 'Area Verified', timestamp: '09:15 AM', isCompleted: true, isActive: false },
          {
            label: 'Inspection',
            timestamp: audit.status === 'COMPLETED' ? 'Done' : 'Active',
            isCompleted: true,
            isActive: audit.status !== 'COMPLETED',
          },
          {
            label: 'CAPA Review',
            timestamp: audit.status === 'COMPLETED' ? 'Reviewed' : 'Pending',
            isCompleted: audit.status === 'COMPLETED',
            isActive: false,
          },
          {
            label: 'Signed Off',
            timestamp: audit.status === 'COMPLETED' ? 'Signed' : 'Target',
            isCompleted: audit.status === 'COMPLETED',
            isActive: audit.status === 'COMPLETED',
          },
        ];

  return (
    <View style={styles.container}>
      {/* Optional Section Header */}
      {showHeader && (
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{titleHeader}</Text>
          {onSeeAllPress && (
            <TouchableOpacity onPress={onSeeAllPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.seeAllText}>View All Audits &gt;</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Main 5S Audit Card */}
      <TouchableOpacity
        style={[styles.card, SHADOWS.card]}
        onPress={() => onPress(audit)}
        activeOpacity={0.9}
      >
        {/* Top Info Row */}
        <View style={styles.topRow}>
          <View style={styles.leftInfo}>
            {/* 5S Audit Checklist Squircle Icon */}
            <View style={styles.boxIconWrapper}>
              <Ionicons name="clipboard" size={22} color={COLORS.primary} />
            </View>

            <View style={styles.textDetails}>
              <Text style={styles.trackingNumber}>{audit.trackingNumber}</Text>
              <Text style={styles.locationTitle} numberOfLines={1}>
                {audit.locationName}
              </Text>
              <Text style={styles.categorySub} numberOfLines={1}>
                {audit.category || '5S Routine Layered Audit'}
              </Text>
            </View>
          </View>

          {/* Right Status & Score Badges */}
          <View style={styles.rightBadges}>
            {audit.overallScore !== undefined && (
              <View style={styles.scorePill}>
                <Text style={styles.scorePillText}>{audit.overallScore}%</Text>
              </View>
            )}
            <View
              style={[
                styles.statusPill,
                audit.status === 'COMPLETED'
                  ? styles.pillCompleted
                  : audit.status === 'SCHEDULED'
                  ? styles.pillScheduled
                  : styles.pillInProgress,
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  audit.status === 'COMPLETED'
                    ? styles.pillTextCompleted
                    : audit.status === 'SCHEDULED'
                    ? styles.pillTextScheduled
                    : styles.pillTextInProgress,
                ]}
              >
                {audit.statusBadge || 'In Progress'}
              </Text>
            </View>
          </View>
        </View>

        {/* 4-Step Stepped Progress Tracker dynamically mapped from audit timeline */}
        <View style={styles.stepperContainer}>
          {/* Connecting Line Segment */}
          <View style={styles.lineContainer}>
            {steps.slice(0, -1).map((s, idx) => {
              const isSegmentActive =
                s.isCompleted && (steps[idx + 1]?.isCompleted || steps[idx + 1]?.isActive);
              return (
                <View
                  key={idx}
                  style={[
                    styles.lineSegment,
                    isSegmentActive ? styles.lineActive : styles.lineInactive,
                  ]}
                />
              );
            })}
          </View>

          {/* Dynamic Nodes Row */}
          <View style={styles.nodesRow}>
            {steps.map((step, idx) => {
              const isDone = step.isCompleted;
              const isActive = step.isActive;
              return (
                <View key={idx} style={styles.nodeColumn}>
                  <View
                    style={[
                      styles.nodeCircle,
                      isDone || isActive ? styles.nodeCircleActive : styles.nodeCircleInactive,
                      isDone && !isActive && styles.nodeCircleDone,
                    ]}
                  >
                    {isDone ? (
                      <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                    ) : isActive ? (
                      <View style={styles.innerDot} />
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.nodeTitle,
                      isDone || isActive ? styles.nodeTitleActive : styles.nodeTitleInactive,
                    ]}
                    numberOfLines={1}
                  >
                    {step.label}
                  </Text>
                  <Text style={styles.nodeTimestamp} numberOfLines={1}>
                    {step.timestamp}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#F0F2F5',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  leftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  boxIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFF4EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textDetails: {
    justifyContent: 'center',
    flex: 1,
  },
  trackingNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: 2,
  },
  locationTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMedium,
  },
  categorySub: {
    fontSize: 11,
    fontWeight: '400',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  rightBadges: {
    alignItems: 'flex-end',
    gap: 6,
  },
  scorePill: {
    backgroundColor: '#FFF4EE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFD7C2',
  },
  scorePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillInProgress: {
    backgroundColor: '#E8F8F0',
  },
  pillScheduled: {
    backgroundColor: '#EFF8FF',
  },
  pillCompleted: {
    backgroundColor: '#ECFDF3',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pillTextInProgress: {
    color: '#0E9F6E',
  },
  pillTextScheduled: {
    color: '#175CD3',
  },
  pillTextCompleted: {
    color: '#027A48',
  },
  stepperContainer: {
    position: 'relative',
    marginTop: 6,
    paddingTop: 4,
  },
  lineContainer: {
    position: 'absolute',
    top: 13,
    left: '12%',
    right: '12%',
    height: 2,
    flexDirection: 'row',
    zIndex: 1,
  },
  lineSegment: {
    flex: 1,
    height: 2,
  },
  lineActive: {
    backgroundColor: COLORS.primary,
  },
  lineInactive: {
    backgroundColor: '#E4E7EC',
  },
  nodesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  nodeColumn: {
    alignItems: 'center',
    width: '24%',
  },
  nodeCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 2,
  },
  nodeCircleActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  nodeCircleDone: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  nodeCircleInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
  },
  innerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  nodeTitle: {
    fontSize: 11,
    textAlign: 'center',
  },
  nodeTitleActive: {
    fontWeight: '700',
    color: COLORS.textDark,
  },
  nodeTitleInactive: {
    fontWeight: '500',
    color: '#98A2B3',
  },
  nodeTimestamp: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
});
