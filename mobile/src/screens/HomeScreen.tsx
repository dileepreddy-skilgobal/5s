import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { SearchBar } from '../components/SearchBar';
import { QuickAction, QuickActions } from '../components/QuickActions';
import { ActiveAuditCard } from '../components/ActiveAuditCard';
import { Button, EmptyState, SectionHeader, StatTile } from '../components/ui';
import { AuditExecution } from '../types';
import { BOTTOM_NAV_CLEARANCE, COLORS, RADIUS, SPACING, TYPE } from '../constants/theme';
import { useUser } from '../context/UserContext';
import { useResponsive } from '../hooks/useResponsive';

interface HomeScreenProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenScanner: () => void;
  /** Continues the user's audit in progress, opens the next scheduled one, or opens the scanner. */
  onStartAudit: () => void;
  /** Opens the red tag form. */
  onRedTag: () => void;
  /** Opens the abnormality report (only for roles that may report). */
  onReport?: () => void;
  /** Switches to the Areas tab. */
  onOpenAreas: () => void;
  activeAudits: AuditExecution[];
  onSelectAudit: (audit: AuditExecution) => void;
  onSeeAllAudits: () => void;
  isOffline: boolean;
  onStatusPress: () => void;
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
  onRedTag,
  onReport,
  onOpenAreas,
  activeAudits,
  onSelectAudit,
  onSeeAllAudits,
  isOffline,
  onStatusPress,
  pendingSyncCount,
  onSyncPress,
  onOpenProfile,
  onRefresh,
  isRefreshing,
}) => {
  const { can } = useUser();
  const { isTablet } = useResponsive();
  const canConduct = can('AUDIT_CONDUCTORS');

  // Summary figures, all derived from the audits loaded for this user (own audits for auditors,
  // audits of owned areas for area owners)
  const inProgressCount = useMemo(() => activeAudits.filter((a) => a.status === 'IN_PROGRESS').length, [activeAudits]);
  const scheduledCount = useMemo(() => activeAudits.filter((a) => a.status === 'SCHEDULED').length, [activeAudits]);
  const awaitingSignOffCount = useMemo(
    () => activeAudits.filter((a) => a.status === 'PENDING_REVIEW' && !a.isOfflineSyncPending).length,
    [activeAudits],
  );
  const findingsCount = useMemo(() => activeAudits.reduce((acc, a) => acc + (a.findingsCount || 0), 0), [activeAudits]);

  // Average final score of signed-off audits (in-progress audits have no final score)
  const scoreSummary = useMemo(() => {
    const scored = activeAudits.filter((a) => a.status === 'COMPLETED' && a.overallScore !== null);
    if (scored.length === 0) return null;
    const total = scored.reduce((acc, a) => acc + (a.overallScore ?? 0), 0);
    return { average: Math.round(total / scored.length), count: scored.length };
  }, [activeAudits]);

  // Audits that still need work: in progress first, then scheduled
  const openAudits = useMemo(() => {
    const rank = (a: AuditExecution) => (a.status === 'IN_PROGRESS' ? 0 : 1);
    return activeAudits.filter((a) => a.status === 'IN_PROGRESS' || a.status === 'SCHEDULED').sort((a, b) => rank(a) - rank(b));
  }, [activeAudits]);

  const isSearching = searchQuery.trim().length > 0;

  // Search covers all loaded audits, not only open ones
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = searchQuery.toLowerCase().trim();
    return activeAudits.filter(
      (a) =>
        a.trackingNumber.toLowerCase().includes(q) ||
        a.locationName.toLowerCase().includes(q) ||
        (a.category && a.category.toLowerCase().includes(q)) ||
        (a.templateTitle && a.templateTitle.toLowerCase().includes(q)) ||
        (a.plantName && a.plantName.toLowerCase().includes(q)),
    );
  }, [activeAudits, searchQuery, isSearching]);

  const listed = isSearching ? searchResults : openAudits;
  const visible = listed.slice(0, isTablet ? 4 : 3);

  // Shortcuts depend on what the role may do
  const quickActions = useMemo<QuickAction[]>(() => {
    const actions: QuickAction[] = [];
    if (canConduct) {
      actions.push({ key: 'start', label: 'Start audit', icon: 'clipboard-outline', onPress: onStartAudit, primary: true });
    }
    actions.push({ key: 'scan', label: 'Scan', icon: 'scan-outline', onPress: onOpenScanner, accessibilityLabel: 'Scan an area QR code' });
    if (onReport) {
      actions.push({ key: 'report', label: 'Report', icon: 'alert-circle-outline', onPress: onReport, accessibilityLabel: 'Report an abnormality' });
    }
    actions.push({ key: 'redtag', label: 'Red tag', icon: 'pricetag-outline', onPress: onRedTag, accessibilityLabel: 'Red tag an item' });
    if (!canConduct) {
      actions.push({ key: 'areas', label: 'My areas', icon: 'location-outline', onPress: onOpenAreas });
    }
    return actions;
  }, [canConduct, onStartAudit, onOpenScanner, onReport, onRedTag, onOpenAreas]);

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
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={!!isRefreshing || localRefreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        <Header
          isOffline={isOffline}
          onStatusPress={onStatusPress}
          pendingSyncCount={pendingSyncCount}
          onSyncPress={onSyncPress}
          onProfilePress={onOpenProfile}
        />

        {isOffline && (
          <View style={styles.offlineBanner} accessibilityLiveRegion="polite">
            <Ionicons name="cloud-offline-outline" size={20} color={COLORS.warning} />
            <View style={styles.offlineTextWrap}>
              <Text style={styles.offlineTitle}>You are offline</Text>
              <Text style={styles.offlineText}>Audits, reports and photos are saved on this device and sent when you are back online.</Text>
            </View>
            {pendingSyncCount > 0 && (
              <Button
                label={`Sync (${pendingSyncCount})`}
                onPress={onSyncPress}
                variant="secondary"
                size="sm"
                accessibilityLabel={`Sync ${pendingSyncCount} waiting ${pendingSyncCount === 1 ? 'item' : 'items'}`}
              />
            )}
          </View>
        )}

        <SearchBar value={searchQuery} onChangeText={onSearchChange} />

        <View style={styles.kpiRow}>
          <StatTile
            value={scoreSummary ? `${scoreSummary.average}%` : '–'}
            label="Average score"
            hint={scoreSummary ? `${scoreSummary.count} signed off` : 'None signed off'}
            icon="ribbon-outline"
            tone="success"
            onPress={onSeeAllAudits}
          />
          <StatTile
            value={String(inProgressCount)}
            label="In progress"
            hint={canConduct ? `${scheduledCount} scheduled` : `${awaitingSignOffCount} to sign off`}
            icon="time-outline"
            tone="info"
            onPress={onSeeAllAudits}
          />
          <StatTile
            value={String(findingsCount)}
            label="Findings"
            hint="From audits"
            icon="alert-circle-outline"
            tone="warning"
            onPress={onSeeAllAudits}
          />
        </View>

        <QuickActions actions={quickActions} />

        <View style={styles.section}>
          <SectionHeader
            title={isSearching ? 'Search results' : 'In progress & upcoming'}
            count={listed.length}
            actionLabel={listed.length > visible.length || !isSearching ? 'See all' : undefined}
            onAction={onSeeAllAudits}
          />
        </View>

        {visible.length > 0 ? (
          <View style={isTablet ? styles.tabletGrid : undefined}>
            {visible.map((item) => (
              <View key={item.id} style={isTablet ? styles.tabletCell : undefined}>
                <ActiveAuditCard audit={item} onPress={onSelectAudit} />
              </View>
            ))}
          </View>
        ) : isSearching ? (
          <EmptyState
            icon="search"
            title="No matching audits"
            message={`Nothing matches "${searchQuery.trim()}". Search by audit code, area name or area code.`}
            actionLabel="Clear search"
            onAction={() => onSearchChange('')}
          />
        ) : (
          <EmptyState
            icon="clipboard-outline"
            title="Nothing in progress or scheduled"
            message={
              canConduct
                ? 'Scan an area QR code to start a new audit.'
                : 'Audits of your areas will appear here when an auditor starts them.'
            }
            actionLabel={canConduct ? 'Scan an area' : undefined}
            onAction={canConduct ? onOpenScanner : undefined}
          />
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: BOTTOM_NAV_CLEARANCE },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.warningSoft,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginHorizontal: SPACING.screen,
    marginBottom: SPACING.lg,
  },
  offlineTextWrap: { flex: 1, minWidth: 0 },
  offlineTitle: { ...TYPE.label, color: COLORS.warning },
  offlineText: { ...TYPE.caption, color: COLORS.textDark, marginTop: 2 },
  kpiRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.screen,
    marginBottom: SPACING.xl,
  },
  section: { paddingHorizontal: SPACING.screen },
  tabletGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  tabletCell: { width: '50%' },
});
