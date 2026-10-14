import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../constants/theme';
import { AuditExecution } from '../types';
import { useResponsive } from '../hooks/useResponsive';

interface AuditsListScreenProps {
  audits: AuditExecution[];
  onSelectAudit: (audit: AuditExecution) => void;
  onNewAudit: () => void;
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

const PAGE_SIZE = 5;

export const AuditsListScreen: React.FC<AuditsListScreenProps> = ({
  audits,
  onSelectAudit,
  onNewAudit,
  onRefresh,
  isRefreshing = false,
}) => {
  const { isTablet } = useResponsive();
  const [filter, setFilter] = useState<'ALL' | 'IN_PROGRESS' | 'SCHEDULED' | 'COMPLETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [localRefreshing, setLocalRefreshing] = useState(false);

  // Dynamic status counts for filter badges
  const counts = useMemo(() => {
    return {
      ALL: audits.length,
      IN_PROGRESS: audits.filter((a) => a.status === 'IN_PROGRESS').length,
      SCHEDULED: audits.filter((a) => a.status === 'SCHEDULED').length,
      COMPLETED: audits.filter((a) => a.status === 'COMPLETED').length,
    };
  }, [audits]);

  // Filtered and searched audits
  const filteredAudits = useMemo(() => {
    return audits.filter((a) => {
      const matchesFilter = filter === 'ALL' || a.status === filter;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        a.trackingNumber.toLowerCase().includes(q) ||
        a.locationName.toLowerCase().includes(q) ||
        a.templateTitle.toLowerCase().includes(q) ||
        a.auditorName.toLowerCase().includes(q) ||
        (a.plantName && a.plantName.toLowerCase().includes(q));

      return matchesFilter && matchesSearch;
    });
  }, [audits, filter, searchQuery]);

  // Paginated slice
  const paginatedAudits = useMemo(() => {
    return filteredAudits.slice(0, visibleCount);
  }, [filteredAudits, visibleCount]);

  const hasMore = visibleCount < filteredAudits.length;

  const handleLoadMore = () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((prev) => prev + PAGE_SIZE);
      setIsLoadingMore(false);
    }, 250);
  };

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

  const getScoreColor = (score: number) => {
    if (score >= 90) return '#059669';
    if (score >= 75) return '#D97706';
    return '#DC2626';
  };

  return (
    <View style={styles.container}>
      {/* 1. Header with Eyebrow and Create Audit Trigger */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>PLANT QUALITY REGISTRY</Text>
          <Text style={styles.title}>5S Inspection Audits</Text>
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={onNewAudit} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.newBtnText}>New Audit</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Real-time Search Input Row */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={COLORS.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search #AUD code, location bay, or auditor..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={(txt) => {
              setSearchQuery(txt);
              setVisibleCount(PAGE_SIZE);
            }}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setVisibleCount(PAGE_SIZE);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={17} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 3. Filter Segment Tabs with Real-time Counts */}
      <View style={styles.filterRow}>
        {(
          [
            { key: 'ALL', label: 'All' },
            { key: 'IN_PROGRESS', label: 'In Progress' },
            { key: 'SCHEDULED', label: 'Scheduled' },
            { key: 'COMPLETED', label: 'Completed' },
          ] as const
        ).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filterChip, filter === tab.key && styles.filterChipActive]}
            onPress={() => {
              setFilter(tab.key);
              setVisibleCount(PAGE_SIZE);
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, filter === tab.key && styles.filterChipTextActive]}>
              {tab.label} ({counts[tab.key]})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 4. Pagination / Record Count Indicator */}
      <View style={styles.recordCountRow}>
        <Text style={styles.recordCountText}>
          Showing {paginatedAudits.length} of {filteredAudits.length} audits
          {filteredAudits.length !== audits.length && ` (filtered from ${audits.length})`}
        </Text>
      </View>

      {/* 5. Scrollable Audit List with Pull-to-Refresh & Pagination */}
      <ScrollView
        contentContainerStyle={styles.listContent}
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
        {paginatedAudits.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="clipboard-outline" size={32} color={COLORS.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No Audits Found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? `No audits matching "${searchQuery}". Try a different keyword.`
                : `There are currently no ${filter.toLowerCase().replace('_', ' ')} audits in this facility.`}
            </Text>
            {(searchQuery.length > 0 || filter !== 'ALL') && (
              <TouchableOpacity
                style={styles.emptyResetBtn}
                onPress={() => {
                  setSearchQuery('');
                  setFilter('ALL');
                }}
              >
                <Text style={styles.emptyResetBtnText}>Reset All Filters</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={isTablet ? styles.tabletGrid : undefined}>
            {paginatedAudits.map((item) => {
              const isCompleted = item.status === 'COMPLETED';
              const isScheduled = item.status === 'SCHEDULED';
              const scoreCol = getScoreColor(item.overallScore || 0);

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.card, isTablet && styles.tabletCard, SHADOWS.card]}
                  onPress={() => onSelectAudit(item)}
                  activeOpacity={0.88}
                >
                  {/* Card Header */}
                  <View style={styles.cardTop}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={[styles.iconBox, { backgroundColor: isCompleted ? '#ECFDF5' : isScheduled ? '#EFF6FF' : '#FFF7ED' }]}>
                        <Ionicons
                          name={isCompleted ? 'checkmark-circle' : isScheduled ? 'calendar' : 'time'}
                          size={20}
                          color={isCompleted ? '#059669' : isScheduled ? '#2563EB' : COLORS.primary}
                        />
                      </View>
                      <View style={styles.titleWrap}>
                        <View style={styles.trackingRow}>
                          <Text style={styles.trackingNo}>{item.trackingNumber}</Text>
                          <Text style={styles.categoryBadge}>{item.category || '5S Standard'}</Text>
                        </View>
                        <Text style={styles.locName} numberOfLines={1}>
                          {item.locationName}
                        </Text>
                        <Text style={styles.templateTitle} numberOfLines={1}>
                          {item.templateTitle}
                        </Text>
                      </View>
                    </View>

                    {/* Status Badge */}
                    <View
                      style={[
                        styles.statusBadge,
                        isCompleted
                          ? styles.badgeCompleted
                          : isScheduled
                          ? styles.badgeScheduled
                          : styles.badgeInProgress,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isCompleted
                            ? styles.badgeTextCompleted
                            : isScheduled
                            ? styles.badgeTextScheduled
                            : styles.badgeTextInProgress,
                        ]}
                      >
                        {item.statusBadge || (item.status === 'IN_PROGRESS' ? 'In Progress' : item.status)}
                      </Text>
                    </View>
                  </View>

                  {/* 5S Pillar Mini Progress Bars */}
                  {item.pillarScores && (
                    <View style={styles.pillarStrip}>
                      {(['S1', 'S2', 'S3', 'S4', 'S5'] as const).map((p) => {
                        const val = item.pillarScores[p] || 80;
                        return (
                          <View key={p} style={styles.pillarItem}>
                            <Text style={styles.pillarKey}>{p}</Text>
                            <View style={styles.pillarBarTrack}>
                              <View
                                style={[
                                  styles.pillarBarFill,
                                  {
                                    width: `${val}%`,
                                    backgroundColor: val >= 85 ? '#10B981' : val >= 70 ? '#F59E0B' : '#EF4444',
                                  },
                                ]}
                              />
                            </View>
                            <Text style={styles.pillarVal}>{val}%</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  <View style={styles.cardDivider} />

                  {/* Card Meta Footer */}
                  <View style={styles.cardBottom}>
                    <View style={styles.metaCol}>
                      <Text style={styles.metaLabel}>Auditor</Text>
                      <Text style={styles.metaVal} numberOfLines={1}>
                        {item.auditorName.split('(')[0].trim()}
                      </Text>
                    </View>

                    <View style={styles.metaCol}>
                      <Text style={styles.metaLabel}>5S Score</Text>
                      <Text style={[styles.metaScore, { color: scoreCol }]}>
                        {item.overallScore}%
                      </Text>
                    </View>

                    <View style={styles.metaCol}>
                      <Text style={styles.metaLabel}>
                        {isCompleted ? 'Completed' : isScheduled ? 'Due Date' : 'Started'}
                      </Text>
                      <Text style={styles.metaVal} numberOfLines={1}>
                        {item.completedAt || item.scheduledDate || item.startedAt || 'Today'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* 6. Pagination Controls (Load More Action) */}
        {hasMore && (
          <TouchableOpacity
            style={styles.loadMoreBtn}
            onPress={handleLoadMore}
            disabled={isLoadingMore}
            activeOpacity={0.8}
          >
            {isLoadingMore ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <>
                <Text style={styles.loadMoreBtnText}>
                  Load More Audits ({filteredAudits.length - visibleCount} remaining)
                </Text>
                <Ionicons name="chevron-down" size={16} color={COLORS.primary} />
              </>
            )}
          </TouchableOpacity>
        )}

        {!hasMore && filteredAudits.length > PAGE_SIZE && (
          <View style={styles.endOfListRow}>
            <Ionicons name="checkmark-done" size={16} color="#94A3B8" />
            <Text style={styles.endOfListText}>All {filteredAudits.length} audits loaded</Text>
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
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 6,
    ...SHADOWS.card,
  },
  newBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  searchRow: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textDark,
    padding: 0,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMedium,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  recordCountRow: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  recordCountText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
  },
  tabletGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  tabletCard: {
    width: '48.8%',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  trackingNo: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  categoryBadge: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  locName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 2,
  },
  templateTitle: {
    fontSize: 11,
    color: COLORS.textMedium,
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeInProgress: {
    backgroundColor: '#FFF7ED',
  },
  badgeScheduled: {
    backgroundColor: '#EFF6FF',
  },
  badgeCompleted: {
    backgroundColor: '#ECFDF5',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextInProgress: {
    color: '#EA580C',
  },
  badgeTextScheduled: {
    color: '#2563EB',
  },
  badgeTextCompleted: {
    color: '#059669',
  },
  pillarStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    gap: 8,
  },
  pillarItem: {
    flex: 1,
    alignItems: 'center',
  },
  pillarKey: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 3,
  },
  pillarBarTrack: {
    width: '100%',
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 3,
  },
  pillarBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  pillarVal: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaCol: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  metaVal: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  metaScore: {
    fontSize: 13,
    fontWeight: '900',
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
    marginTop: 6,
  },
  loadMoreBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  endOfListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  endOfListText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: COLORS.textMedium,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyResetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFF2EB',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  emptyResetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
