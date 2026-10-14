import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../constants/theme';
import { useUser } from '../context/UserContext';
import { ENV } from '../config/env';
import { useResponsive } from '../hooks/useResponsive';

interface ProfileScreenProps {
  isOffline: boolean;
  onToggleOffline: () => void;
  pendingSyncCount: number;
  onSyncNow: () => void;
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  isOffline,
  onToggleOffline,
  pendingSyncCount,
  onSyncNow,
  onRefresh,
  isRefreshing,
}) => {
  const { currentUser, tenant, usersList, switchUser, userStats } = useUser();
  const { isTablet } = useResponsive();

  // Field Inspection Preferences
  const [autoSave, setAutoSave] = useState(true);
  const [highResPhotos, setHighResPhotos] = useState(true);
  const [hapticFeedback, setHapticFeedback] = useState(true);
  const [showUserSwitcher, setShowUserSwitcher] = useState(false);

  const handleClearCache = () => {
    Alert.alert(
      'Clean Cache Storage',
      'This will clear non-essential cached temporary files while keeping all pending audits safe.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clean Cache',
          style: 'destructive',
          onPress: () => Alert.alert('Cache Cleaned', 'Temporary files removed. Local storage optimized.'),
        },
      ]
    );
  };

  const initials = `${currentUser.firstName?.[0] || 'U'}${currentUser.lastName?.[0] || ''}`;

  const [localRefreshing, setLocalRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (onRefresh) {
      setLocalRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setLocalRefreshing(false);
      }
    }
  }, [onRefresh]);

  return (
    <View style={styles.container}>
      {/* 1. Header */}
      <View style={styles.header}>
        <View style={styles.headerTitles}>
          <Text style={styles.eyebrow}>AUDITOR CREDENTIALS</Text>
          <Text style={styles.title}>Auditor Profile &amp; Hub</Text>
        </View>
        <TouchableOpacity
          style={styles.switchAccountBtn}
          onPress={() => setShowUserSwitcher(!showUserSwitcher)}
          activeOpacity={0.8}
        >
          <Ionicons name="people-outline" size={16} color={COLORS.primary} />
          <Text style={styles.switchAccountText}>Switch Persona</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing || localRefreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        <View style={isTablet ? styles.tabletLayoutRow : undefined}>
          {/* Left Column (or full on phone) */}
          <View style={isTablet ? styles.tabletCol : undefined}>
            {/* Account Switcher Drawer */}
            {showUserSwitcher && (
              <View style={[styles.switcherCard, SHADOWS.card]}>
                <Text style={styles.switcherTitle}>Active Tenant Personnel ({usersList.length})</Text>
                {usersList.map((u) => {
                  const isSelected = u.id === currentUser.id;
                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={[styles.userItem, isSelected && styles.userItemActive]}
                      onPress={() => {
                        switchUser(u.id);
                        setShowUserSwitcher(false);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.userItemAvatar}>
                        <Text style={styles.userItemInitials}>
                          {u.firstName[0]}
                          {u.lastName?.[0] || ''}
                        </Text>
                      </View>
                      <View style={styles.userItemText}>
                        <Text style={[styles.userItemName, isSelected && styles.userItemNameActive]}>
                          {u.firstName} {u.lastName}
                        </Text>
                        <Text style={styles.userItemRole}>
                          {u.jobTitle} • {u.department}
                        </Text>
                      </View>
                      {isSelected && <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* 2. Hero Auditor Profile Card */}
            <View style={[styles.profileCard, SHADOWS.card]}>
              <View style={styles.avatarWrapper}>
                <View style={styles.avatarLarge}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isOffline ? '#F59E0B' : '#10B981' },
                  ]}
                />
              </View>

              <Text style={styles.userName}>
                {currentUser.firstName} {currentUser.lastName}
              </Text>
              <Text style={styles.userRole}>
                {currentUser.jobTitle} • {currentUser.department}
              </Text>

              {/* Performance Stats Metrics Row */}
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statVal}>{userStats.auditsCompleted}</Text>
                  <Text style={styles.statLabel}>Audits Done</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={[styles.statVal, { color: '#059669' }]}>{userStats.avgScore}%</Text>
                  <Text style={styles.statLabel}>Avg 5S Score</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={[styles.statVal, { color: COLORS.primary }]}>{userStats.capasClosed}</Text>
                  <Text style={styles.statLabel}>CAPAs Closed</Text>
                </View>
              </View>
            </View>

            {/* 4. Enterprise Organization & Facility Hierarchy */}
            <View style={[styles.sectionCard, SHADOWS.card]}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="business-outline" size={16} color={COLORS.textDark} />
                <Text style={styles.sectionTitle}>Plant &amp; Facility Context</Text>
              </View>

              <View style={styles.metaList}>
                <View style={styles.metaRow}>
                  <View style={styles.metaRowLeft}>
                    <Ionicons name="cube-outline" size={15} color={COLORS.primary} />
                    <Text style={styles.metaLabel}>Tenant Entity</Text>
                  </View>
                  <Text style={styles.metaValue} numberOfLines={2}>
                    {tenant.name}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaRowLeft}>
                    <Ionicons name="location-outline" size={15} color={COLORS.primary} />
                    <Text style={styles.metaLabel}>Facility Site</Text>
                  </View>
                  <Text style={styles.metaValue} numberOfLines={2}>
                    {tenant.plantName}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaRowLeft}>
                    <Ionicons name="briefcase-outline" size={15} color={COLORS.primary} />
                    <Text style={styles.metaLabel}>Assigned Unit</Text>
                  </View>
                  <Text style={styles.metaValue} numberOfLines={2}>
                    {currentUser.department}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaRowLeft}>
                    <Ionicons name="document-text-outline" size={15} color={COLORS.primary} />
                    <Text style={styles.metaLabel}>Audit Standard</Text>
                  </View>
                  <Text style={styles.metaValue} numberOfLines={2}>
                    Automotive 5S Standard
                  </Text>
                </View>

                <View style={[styles.metaRow, { borderBottomWidth: 0, paddingBottom: 2 }]}>
                  <View style={styles.metaRowLeft}>
                    <Ionicons name="server-outline" size={15} color={COLORS.primary} />
                    <Text style={styles.metaLabel}>Cloud Network</Text>
                  </View>
                  <View style={styles.gatewayPill}>
                    <View style={[styles.greenPing, { backgroundColor: isOffline ? '#F59E0B' : '#10B981' }]} />
                    <Text style={[styles.gatewayText, { color: isOffline ? '#D97706' : '#059669' }]}>
                      {isOffline ? 'Offline Mode' : 'Connected (5S Cloud)'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Right Column (or below on phone) */}
          <View style={isTablet ? styles.tabletCol : undefined}>
            {/* 3. Offline Engine & Cloud Sync Card */}
            <View style={[styles.sectionCard, SHADOWS.card]}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={[styles.iconCircle, { backgroundColor: isOffline ? '#FFFBEB' : '#ECFDF5' }]}>
                    <Ionicons
                      name={isOffline ? 'cloud-offline' : 'cloud-done'}
                      size={18}
                      color={isOffline ? '#D97706' : '#059669'}
                    />
                  </View>
                  <View>
                    <Text style={styles.sectionTitle}>Cloud Synchronization</Text>
                    <Text style={styles.sectionSubtitle}>
                      {isOffline ? 'Offline Mode (Local Storage)' : 'Online Connected (Live API)'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={!isOffline}
                  onValueChange={onToggleOffline}
                  trackColor={{ false: '#E2E8F0', true: '#FED7AA' }}
                  thumbColor={!isOffline ? COLORS.primary : '#94A3B8'}
                />
              </View>

              <Text style={styles.sectionDescription}>
                {isOffline
                  ? 'Audits and photo annotations are safely encrypted and queued in local device storage. Tapping toggle reconnects to the cloud.'
                  : `Direct bidirectional sync with ${tenant.name} API gateway. All scores and CAPA actions are synchronized in real-time.`}
              </Text>

              {/* Queue Status Box */}
              <View style={[styles.syncStatusCard, pendingSyncCount > 0 ? styles.syncStatusPending : styles.syncStatusOk]}>
                <View style={styles.syncStatusInfo}>
                  <Ionicons
                    name={pendingSyncCount > 0 ? 'time-outline' : 'checkmark-circle-outline'}
                    size={20}
                    color={pendingSyncCount > 0 ? '#D97706' : '#059669'}
                  />
                  <View style={styles.syncTextContainer}>
                    <Text style={styles.syncStatusLabel}>
                      {pendingSyncCount > 0 ? `${pendingSyncCount} Sessions Queued` : 'All Audits Synchronized'}
                    </Text>
                    <Text style={styles.syncStatusSub}>
                      {pendingSyncCount > 0
                        ? 'Pending upload to central 5S server'
                        : 'Device local storage is in full sync'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.syncActionButton,
                    pendingSyncCount === 0 && styles.syncActionButtonDisabled,
                  ]}
                  onPress={onSyncNow}
                  disabled={pendingSyncCount === 0}
                  activeOpacity={0.8}
                >
                  <Ionicons name="sync" size={14} color="#FFFFFF" />
                  <Text style={styles.syncActionText}>Sync Now</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 5. Auditor Field Inspection Preferences */}
            <View style={[styles.sectionCard, SHADOWS.card]}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="options-outline" size={16} color={COLORS.textDark} />
                <Text style={styles.sectionTitle}>Field Inspection Preferences</Text>
              </View>

              <View style={styles.prefRow}>
                <View style={styles.prefInfo}>
                  <Text style={styles.prefTitle}>Auto-Save Answers</Text>
                  <Text style={styles.prefDesc}>Continuously save question responses as you inspect</Text>
                </View>
                <Switch
                  value={autoSave}
                  onValueChange={setAutoSave}
                  trackColor={{ false: '#E2E8F0', true: '#FED7AA' }}
                  thumbColor={autoSave ? COLORS.primary : '#94A3B8'}
                />
              </View>

              <View style={styles.prefRow}>
                <View style={styles.prefInfo}>
                  <Text style={styles.prefTitle}>High-Resolution Defect Photos</Text>
                  <Text style={styles.prefDesc}>Store full-detail photographic evidence for CAPA actions</Text>
                </View>
                <Switch
                  value={highResPhotos}
                  onValueChange={setHighResPhotos}
                  trackColor={{ false: '#E2E8F0', true: '#FED7AA' }}
                  thumbColor={highResPhotos ? COLORS.primary : '#94A3B8'}
                />
              </View>

              <View style={[styles.prefRow, { borderBottomWidth: 0 }]}>
                <View style={styles.prefInfo}>
                  <Text style={styles.prefTitle}>Haptic Checklist Feedback</Text>
                  <Text style={styles.prefDesc}>Vibrate device on scoring and standard verification</Text>
                </View>
                <Switch
                  value={hapticFeedback}
                  onValueChange={setHapticFeedback}
                  trackColor={{ false: '#E2E8F0', true: '#FED7AA' }}
                  thumbColor={hapticFeedback ? COLORS.primary : '#94A3B8'}
                />
              </View>

              <TouchableOpacity style={styles.cacheClearBtn} onPress={handleClearCache} activeOpacity={0.8}>
                <Ionicons name="trash-outline" size={15} color="#DC2626" />
                <Text style={styles.cacheClearText}>Clean Offline Temporary Cache</Text>
              </TouchableOpacity>
            </View>

            {/* 6. Footer System Info */}
            <View style={styles.footerInfo}>
              <Text style={styles.versionText}>
                {ENV.APP_NAME} v{ENV.VERSION} ({ENV.BUILD_ENV})
              </Text>
              <Text style={styles.copyrightText}>Workplace Organisation &amp; Operational Discipline Platform</Text>
              <Text style={styles.signedInText}>
                Authenticated Session: {currentUser.firstName} {currentUser.lastName} ({currentUser.email})
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FB',
    paddingTop: Platform.OS === 'web' ? 14 : 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  headerTitles: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8E95A5',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.textDark,
    marginTop: 2,
    letterSpacing: -0.3,
  },
  switchAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF0EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFE4D6',
  },
  switchAccountText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  switcherCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  switcherTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 4,
  },
  userItemActive: {
    backgroundColor: '#FFF0EB',
  },
  userItemAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  userItemInitials: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  userItemText: {
    flex: 1,
  },
  userItemName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  userItemNameActive: {
    color: COLORS.primary,
  },
  userItemRole: {
    fontSize: 10.5,
    color: COLORS.textMedium,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 130,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EEF2F6',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 10,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#F8FAFC',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  userName: {
    fontSize: 19,
    fontWeight: '900',
    color: COLORS.textDark,
  },
  userRole: {
    fontSize: 12,
    color: COLORS.textMedium,
    textAlign: 'center',
    marginTop: 3,
    paddingHorizontal: 12,
    lineHeight: 17,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statVal: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textDark,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#CBD5E1',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EEF2F6',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: COLORS.textMedium,
    marginTop: 1,
    fontWeight: '500',
  },
  sectionDescription: {
    fontSize: 11,
    color: COLORS.textMedium,
    lineHeight: 16,
    marginBottom: 12,
  },
  syncStatusCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  syncStatusOk: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  syncStatusPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  syncStatusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    paddingRight: 6,
  },
  syncTextContainer: {
    flex: 1,
  },
  syncStatusLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  syncStatusSub: {
    fontSize: 10,
    color: COLORS.textMedium,
    marginTop: 1,
  },
  syncActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 5,
  },
  syncActionButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  syncActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  metaList: {
    gap: 0,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  metaRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 115,
    flexShrink: 0,
    paddingTop: 1,
  },
  metaLabel: {
    fontSize: 12,
    color: COLORS.textMedium,
    fontWeight: '600',
  },
  metaValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textDark,
    textAlign: 'right',
    lineHeight: 17,
  },
  gatewayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  greenPing: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  gatewayText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  prefInfo: {
    flex: 1,
    paddingRight: 10,
  },
  prefTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  prefDesc: {
    fontSize: 10.5,
    color: COLORS.textMedium,
    marginTop: 2,
    lineHeight: 14,
  },
  cacheClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  cacheClearText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  footerInfo: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  versionText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  copyrightText: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  signedInText: {
    fontSize: 9.5,
    color: COLORS.textMuted,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  tabletLayoutRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  tabletCol: {
    flex: 1,
  },
});
