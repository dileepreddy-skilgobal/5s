import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../constants/theme';
import { LocationMaster } from '../types';
import { useResponsive } from '../hooks/useResponsive';

interface LocationsScreenProps {
  locations: LocationMaster[];
  onSelectLocation: (loc: LocationMaster) => void;
  onOpenQRScanner: () => void;
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

const PAGE_SIZE = 6;

export const LocationsScreen: React.FC<LocationsScreenProps> = ({
  locations,
  onSelectLocation,
  onOpenQRScanner,
  onRefresh,
  isRefreshing = false,
}) => {
  const { isTablet, isLargeTablet } = useResponsive();
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [localRefreshing, setLocalRefreshing] = useState(false);

  // Extract friendly category names with counts
  const categoriesWithCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: locations.length };
    const deptList: { key: string; label: string; count: number }[] = [];

    // Tally departments
    locations.forEach((loc) => {
      const deptName = loc.department ? loc.department.split('•')[0].trim() : 'General';
      counts[deptName] = (counts[deptName] || 0) + 1;
    });

    deptList.push({
      key: 'ALL',
      label: `All (${locations.length})`,
      count: locations.length,
    });

    Object.keys(counts).forEach((d) => {
      if (d !== 'ALL') {
        // Shorten long department names for concise chips
        let shortLabel = d;
        if (d.toLowerCase().includes('cnc') || d.toLowerCase().includes('machin')) {
          shortLabel = 'Machining';
        } else if (d.toLowerCase().includes('asm') || d.toLowerCase().includes('assembl')) {
          shortLabel = 'Assembly';
        } else if (d.toLowerCase().includes('wh') || d.toLowerCase().includes('logist') || d.toLowerCase().includes('raw')) {
          shortLabel = 'Logistics';
        } else if (d.toLowerCase().includes('tool')) {
          shortLabel = 'Tooling';
        } else if (d.toLowerCase().includes('chem') || d.toLowerCase().includes('ehs')) {
          shortLabel = 'Chemical & EHS';
        }

        deptList.push({
          key: d,
          label: `${shortLabel} (${counts[d]})`,
          count: counts[d],
        });
      }
    });

    return deptList;
  }, [locations]);

  // Filter locations by selected category and search query
  const filtered = useMemo(() => {
    return locations.filter((l) => {
      const matchesDept =
        selectedDept === 'ALL' ||
        (l.department && l.department.toLowerCase().includes(selectedDept.toLowerCase())) ||
        (l.plant && l.plant.toLowerCase().includes(selectedDept.toLowerCase()));

      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        l.name.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q) ||
        (l.plant && l.plant.toLowerCase().includes(q)) ||
        (l.workstation && l.workstation.toLowerCase().includes(q));

    return matchesDept && matchesSearch;
    });
  }, [locations, selectedDept, searchQuery]);

  const paginatedLocations = useMemo(() => {
    return filtered.slice(0, visibleCount);
  }, [filtered, visibleCount]);

  const hasMore = visibleCount < filtered.length;

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

  return (
    <View style={styles.container}>
      {/* 1. Header with Eyebrow and Scan QR Action */}
      <View style={styles.header}>
        <View style={styles.headerTitles}>
          <Text style={styles.eyebrow}>WORKPLACE HIERARCHY</Text>
          <Text style={styles.title}>Plant Locations & Bays</Text>
        </View>
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={onOpenQRScanner}
          activeOpacity={0.85}
          accessibilityLabel="Scan Location QR"
        >
          <Ionicons name="scan-outline" size={17} color="#FFFFFF" />
          <Text style={styles.scanBtnText}>Scan QR</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Search Input Row */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={COLORS.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search bay, machine cell, or area code..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 3. Horizontal Filter Tabs (Zero Clipping Guaranteed) */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.deptScrollContent}
        >
          {categoriesWithCounts.map((cat) => {
            const isSelected = selectedDept.toLowerCase() === cat.key.toLowerCase();
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.deptChip, isSelected && styles.deptChipActive]}
                onPress={() => {
                  setSelectedDept(cat.key);
                  setVisibleCount(PAGE_SIZE);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.deptText, isSelected && styles.deptTextActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Record Count Header */}
      <View style={styles.recordCountRow}>
        <Text style={styles.recordCountText}>
          Showing {paginatedLocations.length} of {filtered.length} locations
          {filtered.length !== locations.length && ` (filtered from ${locations.length})`}
        </Text>
      </View>

      {/* 4. Scrollable Locations Cards List with Pull-to-Refresh & Pagination */}
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
        {paginatedLocations.length > 0 ? (
          <View style={isTablet ? styles.tabletGrid : undefined}>
            {paginatedLocations.map((loc) => {
              const score = loc.current5SScore || 85;
              const isOptimal = score >= 80;

              return (
                <TouchableOpacity
                  key={loc.id}
                  style={[
                    styles.card,
                    isLargeTablet
                      ? styles.largeTabletCard
                      : isTablet
                      ? styles.tabletCard
                      : undefined,
                    SHADOWS.card,
                  ]}
                  onPress={() => onSelectLocation(loc)}
                  activeOpacity={0.92}
                >
                {/* Location Top: Icon, Code, Title & Score Badge */}
                <View style={styles.cardTop}>
                  <View style={styles.locIconWrapper}>
                    <Ionicons
                      name={
                        loc.code.includes('REDTAG')
                          ? 'warning-outline'
                          : loc.code.includes('MACH')
                          ? 'hardware-chip-outline'
                          : loc.code.includes('ASM')
                          ? 'construct-outline'
                          : 'business-outline'
                      }
                      size={22}
                      color={COLORS.primary}
                    />
                  </View>
                  <View style={styles.locInfo}>
                    <Text style={styles.locCode}>{loc.code}</Text>
                    <Text style={styles.locName} numberOfLines={2}>
                      {loc.name}
                    </Text>
                    <Text style={styles.locPlant} numberOfLines={1}>
                      {loc.plant} • {loc.department}
                    </Text>
                  </View>
                  <View style={[styles.scoreBadge, isOptimal ? styles.scoreBadgeGreen : styles.scoreBadgeOrange]}>
                    <Text style={[styles.scoreVal, isOptimal ? styles.scoreValGreen : styles.scoreValOrange]}>
                      {score}%
                    </Text>
                    <Text style={styles.scoreSub}>5S Score</Text>
                  </View>
                </View>

                {/* Designated Bay Inventory Manifest */}
                <View style={styles.inventorySection}>
                  <View style={styles.invHeaderRow}>
                    <Ionicons name="layers-outline" size={13} color={COLORS.textDark} />
                    <Text style={styles.invTitle}>Designated Bay Inventory Manifest:</Text>
                  </View>

                  <View style={styles.invItemsList}>
                    {loc.expectedItems && loc.expectedItems.length > 0 ? (
                      loc.expectedItems.map((item, idx) => {
                        const isMatch = item.currentQty >= item.standardQty;
                        return (
                          <View key={idx} style={styles.invRow}>
                            <View style={styles.invRowLeft}>
                              <Ionicons
                                name={isMatch ? 'checkmark-circle' : 'alert-circle'}
                                size={14}
                                color={isMatch ? '#059669' : '#D97706'}
                              />
                              <Text style={styles.invName} numberOfLines={1}>
                                {item.name}
                              </Text>
                            </View>
                            <View style={[styles.invQtyBadge, isMatch ? styles.invQtyOk : styles.invQtyWarn]}>
                              <Text style={[styles.invQtyText, isMatch ? styles.invQtyTextOk : styles.invQtyTextWarn]}>
                                {item.currentQty}/{item.standardQty}
                              </Text>
                            </View>
                          </View>
                        );
                      })
                    ) : (
                      <View style={styles.invRow}>
                        <View style={styles.invRowLeft}>
                          <Ionicons name="checkmark-circle" size={14} color="#059669" />
                          <Text style={styles.invName}>Standard Shadow Board Tools &amp; Gauges</Text>
                        </View>
                        <View style={[styles.invQtyBadge, styles.invQtyOk]}>
                          <Text style={[styles.invQtyText, styles.invQtyTextOk]}>Verified</Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>

                {/* Card Footer: Champion & Action CTA */}
                <View style={styles.cardFooter}>
                  <View style={styles.championInfo}>
                    <Ionicons name="person-circle-outline" size={17} color={COLORS.textMedium} />
                    <Text style={styles.championText} numberOfLines={1}>
                      Champion: {loc.champion}
                    </Text>
                  </View>
                  <View style={styles.auditActionTag}>
                    <Text style={styles.auditActionText}>Audit Bay</Text>
                    <Ionicons name="arrow-forward" size={12} color={COLORS.primary} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="search-outline" size={32} color={COLORS.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No Matching Workstations</Text>
            <Text style={styles.emptySubtitle}>
              Try clearing your search query or select "All ({locations.length})".
            </Text>
            <TouchableOpacity
              style={styles.emptyResetBtn}
              onPress={() => {
                setSelectedDept('ALL');
                setSearchQuery('');
                setVisibleCount(PAGE_SIZE);
              }}
            >
              <Text style={styles.emptyResetText}>Reset Filters</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Pagination: Load More Action */}
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
                  Load More Locations ({filtered.length - visibleCount} remaining)
                </Text>
                <Ionicons name="chevron-down" size={16} color={COLORS.primary} />
              </>
            )}
          </TouchableOpacity>
        )}

        {!hasMore && filtered.length > PAGE_SIZE && (
          <View style={styles.endOfListRow}>
            <Ionicons name="checkmark-done" size={16} color="#94A3B8" />
            <Text style={styles.endOfListText}>All {filtered.length} locations displayed</Text>
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
    paddingRight: 10,
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
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 22,
    gap: 6,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.26,
    shadowRadius: 8,
    elevation: 4,
  },
  scanBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.2,
  },
  searchRow: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    height: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textDark,
    height: '100%',
    fontWeight: '500',
  },
  filterSection: {
    marginBottom: 10,
  },
  deptScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deptChip: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  deptChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  deptText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  deptTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 140, // Generous padding to prevent bottom floating nav overlap
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EEF2F6',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFF0EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  locInfo: {
    flex: 1,
    paddingRight: 6,
  },
  locCode: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.6,
  },
  locName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textDark,
    marginTop: 2,
    lineHeight: 21,
  },
  locPlant: {
    fontSize: 11,
    color: COLORS.textMedium,
    marginTop: 3,
    fontWeight: '500',
  },
  scoreBadge: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 56,
  },
  scoreBadgeGreen: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  scoreBadgeOrange: {
    backgroundColor: '#FFF9F5',
    borderColor: '#FFE4D6',
  },
  scoreVal: {
    fontSize: 15,
    fontWeight: '900',
  },
  scoreValGreen: {
    color: '#059669',
  },
  scoreValOrange: {
    color: COLORS.primary,
  },
  scoreSub: {
    fontSize: 8,
    color: COLORS.textMuted,
    fontWeight: '800',
    marginTop: 1,
    textTransform: 'uppercase',
  },
  inventorySection: {
    backgroundColor: '#F8F9FA',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#EEF2F6',
  },
  invHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  invTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  invItemsList: {
    gap: 6,
  },
  invRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  invRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    paddingRight: 6,
  },
  invName: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  invQtyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  invQtyOk: {
    backgroundColor: '#ECFDF5',
  },
  invQtyWarn: {
    backgroundColor: '#FFFBEB',
  },
  invQtyText: {
    fontSize: 10,
    fontWeight: '800',
  },
  invQtyTextOk: {
    color: '#059669',
  },
  invQtyTextWarn: {
    color: '#D97706',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  championInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    paddingRight: 10,
  },
  championText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  auditActionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF0EB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  auditActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  emptySubtitle: {
    fontSize: 12,
    color: COLORS.textMedium,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  emptyResetBtn: {
    marginTop: 16,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  emptyResetText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  recordCountRow: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  recordCountText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
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
    marginTop: 8,
    marginBottom: 10,
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
  tabletGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
  },
  tabletCard: {
    width: '48.8%',
  },
  largeTabletCard: {
    width: '31.8%',
  },
});
