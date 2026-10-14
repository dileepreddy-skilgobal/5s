import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../constants/theme';
import { BootstrapState } from '../types';
import { useResponsive } from '../hooks/useResponsive';

interface BootstrapScreenProps {
  state: BootstrapState;
  onBypass?: () => void;
}

export const BootstrapScreen: React.FC<BootstrapScreenProps> = ({ state, onBypass }) => {
  const { isTablet, isLandscape, contentMaxWidth } = useResponsive();

  const isStepComplete = (targetStepProgress: number) => state.progress >= targetStepProgress;

  return (
    <View style={styles.container}>
      <View style={[styles.contentCard, { maxWidth: isTablet ? 640 : 440 }, SHADOWS.card]}>
        {/* Top Industrial Badge */}
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Ionicons name="shield-checkmark" size={isTablet ? 36 : 28} color="#FFFFFF" />
          </View>
          <View style={styles.brandTextWrap}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow}>ENTERPRISE 5S SUITE</Text>
              <View style={styles.versionPill}>
                <Text style={styles.versionText}>v1.0 • Plant Alpha</Text>
              </View>
            </View>
            <Text style={[styles.brandTitle, isTablet && { fontSize: 24 }]}>
              SkilGlobal 5S
            </Text>
            <Text style={styles.brandSubtitle}>
              Continuous Improvement & Shopfloor Standard System
            </Text>
          </View>
        </View>

        {/* Progress Bar & Percentage */}
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={styles.stepTitle}>{state.title}</Text>
            <Text style={styles.progressPercentage}>{state.progress}%</Text>
          </View>

          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${Math.max(state.progress, 5)}%` }]} />
          </View>

          <Text style={styles.stepDescription}>{state.description}</Text>
        </View>

        {/* Diagnostic Checklist */}
        <View style={styles.checklistSection}>
          <View style={styles.checkItem}>
            <Ionicons
              name={isStepComplete(15) ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={isStepComplete(15) ? '#10B981' : '#94A3B8'}
            />
            <Text style={[styles.checkText, isStepComplete(15) && styles.checkTextActive]}>
              Local Cache &amp; Storage Engine Hydrated
            </Text>
          </View>

          <View style={styles.checkItem}>
            <Ionicons
              name={isStepComplete(40) ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={isStepComplete(40) ? '#10B981' : '#94A3B8'}
            />
            <Text style={[styles.checkText, isStepComplete(40) && styles.checkTextActive]}>
              Tenant &amp; Plant Alpha Profile Verified
            </Text>
          </View>

          <View style={styles.checkItem}>
            <Ionicons
              name={isStepComplete(65) ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={isStepComplete(65) ? '#10B981' : '#94A3B8'}
            />
            <Text style={[styles.checkText, isStepComplete(65) && styles.checkTextActive]}>
              {state.isOfflineMode
                ? 'Offline-First Engine Engaged'
                : 'Cloud Services & API Gateway Linked'}
            </Text>
          </View>

          <View style={styles.checkItem}>
            <Ionicons
              name={isStepComplete(88) ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={isStepComplete(88) ? '#10B981' : '#94A3B8'}
            />
            <Text style={[styles.checkText, isStepComplete(88) && styles.checkTextActive]}>
              1S–5S Master Standards &amp; Defect Rules Ready
            </Text>
          </View>
        </View>

        {/* Device & Environment Diagnostics Pill */}
        <View style={styles.diagRow}>
          <View style={styles.diagPill}>
            <Ionicons
              name={isTablet ? 'tablet-landscape' : 'phone-portrait'}
              size={13}
              color="#475569"
            />
            <Text style={styles.diagText}>
              {isTablet ? 'Tablet Console' : 'Mobile Phone'} ({isLandscape ? 'Landscape' : 'Portrait'})
            </Text>
          </View>

          <View style={[styles.diagPill, state.isOfflineMode ? styles.diagOffline : styles.diagOnline]}>
            <View
              style={[
                styles.diagDot,
                { backgroundColor: state.isOfflineMode ? '#D97706' : '#10B981' },
              ]}
            />
            <Text
              style={[
                styles.diagText,
                { color: state.isOfflineMode ? '#B45309' : '#047857', fontWeight: '700' },
              ]}
            >
              {state.isOfflineMode ? 'Offline Mode' : 'Online Sync'}
            </Text>
          </View>
        </View>

        {/* Fast Bypass / Quick Enter Action */}
        {onBypass && (
          <TouchableOpacity
            style={styles.bypassBtn}
            onPress={onBypass}
            activeOpacity={0.8}
          >
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 8 }} />
            <Text style={styles.bypassBtnText}>Launching 5S Workspace...</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  contentCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  brandTextWrap: {
    flex: 1,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.8,
  },
  versionPill: {
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  versionText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#9A3412',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textDark,
  },
  brandSubtitle: {
    fontSize: 11.5,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  progressContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textDark,
    flex: 1,
  },
  progressPercentage: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.primary,
    marginLeft: 8,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  stepDescription: {
    fontSize: 11,
    color: COLORS.textMedium,
  },
  checklistSection: {
    gap: 10,
    marginBottom: 16,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  checkTextActive: {
    color: COLORS.textDark,
    fontWeight: '600',
  },
  diagRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  diagPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingVertical: 7,
    borderRadius: 10,
  },
  diagOnline: {
    backgroundColor: '#ECFDF5',
  },
  diagOffline: {
    backgroundColor: '#FFFBEB',
  },
  diagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  diagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  bypassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFF2EB',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  bypassBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
