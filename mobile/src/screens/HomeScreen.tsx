import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { SearchBar } from '../components/SearchBar';
import { QuickActions } from '../components/QuickActions';
import { HeroCard } from '../components/HeroCard';
import { ActiveAuditCard } from '../components/ActiveAuditCard';
import { AuditExecution } from '../types';
import { COLORS, SHADOWS } from '../constants/theme';
import { useUser } from '../context/UserContext';
import { useResponsive } from '../hooks/useResponsive';

interface HomeScreenProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenScanner: () => void;
  onStartAudit: () => void;
  onTrackOrder: () => void;
  onSchedule: () => void;
  onMore: () => void;
  activeAudits: AuditExecution[];
  onSelectAudit: (audit: AuditExecution) => void;
  onSeeAllAudits: () => void;
  isOffline: boolean;
  onToggleOffline: () => void;
  pendingSyncCount: number;
  onSyncPress: () => void;
  onOpenProfile?: () => void;
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  searchQuery,
  onSearchChange,
  onOpenScanner,
  onStartAudit,
  onTrackOrder,
  onSchedule,
  onMore,
  activeAudits,
  onSelectAudit,
  onSeeAllAudits,
  isOffline,
  onToggleOffline,
  pendingSyncCount,
  onSyncPress,
  onOpenProfile,
  onRefresh,
  isRefreshing,
}) => {
  const { currentUser, userStats } = useUser();
  const { isTablet } = useResponsive();

  // Dynamic calculations for 5S Operations Cockpit
  const inProgressAudits = useMemo(
    () => activeAudits.filter((a) => a.status === 'IN_PROGRESS'),
    [activeAudits]
  );

  const scheduledAudits = useMemo(
    () => activeAudits.filter((a) => a.status === 'SCHEDULED'),
    [activeAudits]
  );

  const avgComplianceScore = useMemo(() => {
    if (userStats?.avgScore && userStats.avgScore > 0) {
      return Math.round(userStats.avgScore);
    }
    if (activeAudits.length > 0) {
      const total = activeAudits.reduce((acc, item) => acc + (item.overallScore || 0), 0);
      return Math.round(total / activeAudits.length);
    }
    return 88;
  }, [userStats, activeAudits]);

  // Filter active audits by search query
  const filteredAudits = useMemo(() => {
    if (!searchQuery.trim()) return activeAudits;
    const q = searchQuery.toLowerCase().trim();
    return activeAudits.filter(
      (a) =>
        a.trackingNumber.toLowerCase().includes(q) ||
        a.locationName.toLowerCase().includes(q) ||
        (a.category && a.category.toLowerCase().includes(q)) ||
        (a.plantName && a.plantName.toLowerCase().includes(q))
    );
  }, [activeAudits, searchQuery]);

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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing || localRefreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* 1. Header with dynamic personalized auditor greeting */}
        <Header
          isOffline={isOffline}
          onToggleOffline={onToggleOffline}
          pendingSyncCount={pendingSyncCount}
          onSyncPress={onSyncPress}
          onProfilePress={onOpenProfile}
        />

        {/* 2. Offline Mode Advisory Banner */}
        {isOffline && (
          <View style={styles.offlineBanner}>
            <View style={styles.offlineBannerLeft}>
              <Ionicons name="cloud-offline" size={18} color="#D97706" />
              <View style={styles.offlineTextWrap}>
                <Text style={styles.offlineBannerTitle}>Offline Mode Active</Text>
                <Text style={styles.offlineBannerSubtitle}>
                  Audits & photos stored on device. Auto-syncs when online.
                </Text>
              </View>
            </View>
            {pendingSyncCount > 0 && (
              <TouchableOpacity
                style={styles.offlineSyncBtn}
                onPress={onSyncPress}
                activeOpacity={0.8}
              >
                <Text style={styles.offlineSyncBtnText}>Sync ({pendingSyncCount})</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* 3. 5S Search Bar with Area Scanner Trigger */}
        <SearchBar
          value={searchQuery}
          onChangeText={onSearchChange}
          onScanPress={onOpenScanner}
        />

        {/* 4. Live 5S Operations Cockpit KPI Strip */}
        <View style={styles.kpiRow}>
          {/* Card 1: 5S Health Score */}
          <View style={[styles.kpiCard, styles.kpiCardGreen]}>
            <View style={styles.kpiTop}>
              <Text style={styles.kpiValue}>{avgComplianceScore}%</Text>
              <View style={styles.kpiIconGreen}>
                <Ionicons name="shield-checkmark" size={15} color="#059669" />
              </View>
            </View>
            <Text style={styles.kpiLabel}>Plant 5S Index</Text>
            <Text style={styles.kpiSub}>Target &ge; 85%</Text>
          </View>

          {/* Card 2: Active Audits */}
          <TouchableOpacity
            style={[styles.kpiCard, styles.kpiCardBlue]}
            onPress={onSeeAllAudits}
            activeOpacity={0.8}
          >
            <View style={styles.kpiTop}>
              <Text style={styles.kpiValue}>{inProgressAudits.length}</Text>
              <View style={styles.kpiIconBlue}>
                <Ionicons name="time" size={15} color="#2563EB" />
              </View>
            </View>
            <Text style={styles.kpiLabel}>Active Audits</Text>
            <Text style={styles.kpiSub}>{scheduledAudits.length} Scheduled</Text>
          </TouchableOpacity>

          {/* Card 3: Resolved CAPA / Actions */}
          <TouchableOpacity
            style={[styles.kpiCard, styles.kpiCardOrange]}
            onPress={onMore}
            activeOpacity={0.8}
          >
            <View style={styles.kpiTop}>
              <Text style={styles.kpiValue}>{userStats?.capasClosed || 32}</Text>
              <View style={styles.kpiIconOrange}>
                <Ionicons name="checkmark-done" size={15} color="#EA580C" />
              </View>
            </View>
            <Text style={styles.kpiLabel}>Closed CAPAs</Text>
            <Text style={styles.kpiSub}>Continuous Imp.</Text>
          </TouchableOpacity>
        </View>

        {/* 5. 4-Grid Quick Actions */}
        <QuickActions
          onStartAudit={onStartAudit}
          onTrackOrder={onTrackOrder}
          onSchedule={onSchedule}
          onMore={onMore}
        />

        {/* 6. Peach Hero Card with 5S Workplace Excellence Banner */}
        <HeroCard
          onPressAction={onStartAudit}
          title={'Sustaining\nWorkplace\nExcellence.'}
          subtitle="1S SORT • 2S ORDER • 3S SHINE • 4S STD • 5S SUSTAIN"
          description={'Audit shopfloors. Verify visual standards.\nEliminate waste across all plant lines.'}
          buttonText="Start Inspection"
        />

        {/* 7. Active 5S Audit Execution Section Header */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <Text style={styles.sectionTitle}>Active 5S Audits</Text>
            <View style={styles.badgePill}>
              <Text style={styles.badgePillText}>{filteredAudits.length}</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={onSeeAllAudits}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.seeAllText}>
              View All ({activeAudits.length}) &gt;
            </Text>
          </TouchableOpacity>
        </View>

        {/* 8. Active 5S Audit Cards List or Empty States */}
        {filteredAudits.length > 0 ? (
          <View style={isTablet ? styles.tabletAuditGrid : undefined}>
            {filteredAudits.slice(0, isTablet ? 4 : 3).map((item) => (
              <View key={item.id} style={isTablet ? styles.tabletAuditCardWrap : undefined}>
                <ActiveAuditCard
                  audit={item}
                  onPress={onSelectAudit}
                  showHeader={false}
                />
              </View>
            ))}
          </View>
        ) : searchQuery.trim().length > 0 ? (
          /* Empty Search State */
          <View style={[styles.emptyContainer, SHADOWS.soft]}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="search" size={26} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>No matching audits found</Text>
            <Text style={styles.emptySubtitle}>
              No active inspection matches "{searchQuery}". Try searching by workstation, plant zone, or audit ID.
            </Text>
            <TouchableOpacity
              style={styles.clearSearchBtn}
              onPress={() => onSearchChange('')}
              activeOpacity={0.8}
            >
              <Text style={styles.clearSearchText}>Clear Search Filter</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Empty Audits State */
          <View style={[styles.emptyContainer, SHADOWS.soft]}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="clipboard-outline" size={26} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>No Active Audits</Text>
            <Text style={styles.emptySubtitle}>
              All scheduled 5S audits are complete. Scan a workstation QR code to initiate a new inspection.
            </Text>
            <TouchableOpacity
              style={styles.clearSearchBtn}
              onPress={onOpenScanner}
              activeOpacity={0.8}
            >
              <Ionicons name="scan-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.clearSearchTextWhite}>Scan Area QR Code</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 95, // Refined bottom padding to align with lowered bottom bar
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  offlineBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  offlineTextWrap: {
    marginLeft: 10,
    flex: 1,
  },
  offlineBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  offlineBannerSubtitle: {
    fontSize: 10.5,
    color: '#B45309',
    marginTop: 1,
  },
  offlineSyncBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  offlineSyncBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
  },
  kpiCardGreen: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  kpiCardBlue: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
  },
  kpiCardOrange: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FFEDD5',
  },
  kpiTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  kpiIconGreen: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiIconBlue: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiIconOrange: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  kpiSub: {
    fontSize: 9.5,
    color: COLORS.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textDark,
    letterSpacing: -0.3,
  },
  badgePill: {
    backgroundColor: '#FFF0EA',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFD7C7',
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F0F2F5',
    marginBottom: 20,
  },
  emptyIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFF4EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 12,
    color: COLORS.textMedium,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  clearSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 16,
  },
  clearSearchText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  clearSearchTextWhite: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  tabletAuditGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
  },
  tabletAuditCardWrap: {
    width: '48.8%',
  },
});
