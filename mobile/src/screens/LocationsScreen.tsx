import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BOTTOM_NAV_CLEARANCE, COLORS, RADIUS, SPACING, TOUCH_TARGET, TYPE } from '../constants/theme';
import { LocationMaster } from '../types';
import { useResponsive } from '../hooks/useResponsive';
import { useUser } from '../context/UserContext';
import { Badge, Button, Card, Chip, EmptyState, ScreenHeader } from '../components/ui';
import { areaScoreTone } from '../components/SheetLayout';

interface LocationsScreenProps {
  locations: LocationMaster[];
  onSelectLocation: (loc: LocationMaster) => void;
  onOpenQRScanner: () => void;
  /** Report an abnormality at this area (shown when provided). */
  onReportAbnormality?: (loc: LocationMaster) => void;
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

const PAGE_SIZE = 20;
const ALL = '__all__';
/** Filter key for areas without a department. */
const NO_DEPARTMENT = '__none__';

const departmentKey = (loc: LocationMaster) => loc.department.trim() || NO_DEPARTMENT;

export const LocationsScreen: React.FC<LocationsScreenProps> = ({
  locations,
  onSelectLocation,
  onOpenQRScanner,
  onReportAbnormality,
  onRefresh,
  isRefreshing = false,
}) => {
  const { isTablet, isLargeTablet } = useResponsive();
  const { can } = useUser();
  // Same rule as App's area handler: conductors open an audit, other roles report / red tag
  const canConduct = can('AUDIT_CONDUCTORS');
  const [selectedDept, setSelectedDept] = useState(ALL);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [localRefreshing, setLocalRefreshing] = useState(false);

  // Department filter chips with counts (real department names, alphabetical)
  const departments = useMemo(() => {
    const counts = new Map<string, number>();
    locations.forEach((loc) => {
      const key = departmentKey(loc);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, label: key === NO_DEPARTMENT ? 'No department' : key, count }))
      .sort((a, b) => (a.key === NO_DEPARTMENT ? 1 : b.key === NO_DEPARTMENT ? -1 : a.label.localeCompare(b.label)));
  }, [locations]);

  // Filter locations by selected department and search query
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return locations.filter((l) => {
      const matchesDept = selectedDept === ALL || departmentKey(l) === selectedDept;
      const matchesSearch =
        !q ||
        l.name.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q) ||
        l.department.toLowerCase().includes(q) ||
        (l.plant && l.plant.toLowerCase().includes(q)) ||
        (l.workstation && l.workstation.toLowerCase().includes(q));
      return matchesDept && matchesSearch;
    });
  }, [locations, selectedDept, searchQuery]);

  const paginatedLocations = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;
  const isFiltered = selectedDept !== ALL || searchQuery.trim().length > 0;

  const resetFilters = () => {
    setSelectedDept(ALL);
    setSearchQuery('');
    setVisibleCount(PAGE_SIZE);
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

  const refreshing = isRefreshing || localRefreshing;

  const renderCard = (loc: LocationMaster) => {
    const score = loc.current5SScore;
    // Building / floor are optional location fields; only shown when set
    const meta = [loc.department, loc.plant, loc.workstation].filter((v) => v && v.trim()).join(' · ');
    const showRedTag = !canConduct && !onReportAbnormality;

    return (
      <Card key={loc.id} style={[styles.card, isLargeTablet ? styles.largeTabletCard : isTablet ? styles.tabletCard : undefined]}>
        {/* Area details: tapping does the same as the main action (kept separate from the buttons for screen readers) */}
        <Pressable
          onPress={() => onSelectLocation(loc)}
          accessibilityRole="button"
          accessibilityLabel={`${loc.name}, ${loc.code}${score !== null ? `, latest score ${score}%` : ', not audited yet'}, owner ${loc.champion}`}
          accessibilityHint={canConduct ? 'Opens an audit for this area' : 'Shows what you can do at this area'}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <View style={styles.cardTop}>
            <View style={styles.cardTitleWrap}>
              <Text style={styles.locName} numberOfLines={2}>
                {loc.name}
              </Text>
              <Text style={styles.locCode}>
                {loc.code}
              </Text>
            </View>
            {score !== null ? <Badge label={`${score}%`} tone={areaScoreTone(loc.status)} /> : null}
          </View>

          {meta ? <Text style={styles.metaText}>{meta}</Text> : null}

          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color={COLORS.textMuted} />
            <Text style={styles.detailText}>{loc.lastAuditDate ? `Last audited ${loc.lastAuditDate}` : 'Not audited yet'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={16} color={COLORS.textMuted} />
            <Text style={styles.detailText}>
              Owner: <Text style={styles.detailStrong}>{loc.champion}</Text>
            </Text>
          </View>
        </Pressable>

        {(onReportAbnormality || canConduct || showRedTag) && (
          <View style={styles.actions}>
            {onReportAbnormality && (
              <Button
                label="Report"
                icon="alert-circle-outline"
                variant="secondary"
                onPress={() => onReportAbnormality(loc)}
                style={styles.actionButton}
                accessibilityLabel={`Report an abnormality at ${loc.name}`}
              />
            )}
            {canConduct && (
              <Button
                label="Audit"
                icon="clipboard-outline"
                onPress={() => onSelectLocation(loc)}
                style={styles.actionButton}
                accessibilityLabel={`Audit ${loc.name}`}
              />
            )}
            {showRedTag && (
              <Button
                label="Red tag"
                icon="pricetag-outline"
                variant="secondary"
                onPress={() => onSelectLocation(loc)}
                style={styles.actionButton}
                accessibilityLabel={`Red tag an item at ${loc.name}`}
              />
            )}
          </View>
        )}
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Areas"
        subtitle={locations.length > 0 ? `${locations.length} area${locations.length === 1 ? '' : 's'} in your organization` : undefined}
        action={<Button label="Scan QR" icon="scan-outline" onPress={onOpenQRScanner} accessibilityLabel="Scan an area QR code" />}
      />

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by area name or code"
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={(v) => {
              setSearchQuery(v);
              setVisibleCount(PAGE_SIZE);
            }}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search areas"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery('')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              style={styles.clearBtn}
            >
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Department filter: scrolls sideways, the next chip peeks in */}
      {departments.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={styles.chipScroll}>
          <Chip
            label="All"
            count={locations.length}
            selected={selectedDept === ALL}
            onPress={() => {
              setSelectedDept(ALL);
              setVisibleCount(PAGE_SIZE);
            }}
          />
          {departments.map((d) => (
            <Chip
              key={d.key}
              label={d.label}
              count={d.count}
              selected={selectedDept === d.key}
              onPress={() => {
                setSelectedDept(d.key);
                setVisibleCount(PAGE_SIZE);
              }}
            />
          ))}
        </ScrollView>
      )}

      {/* Areas list with pull-to-refresh and paging */}
      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />
          ) : undefined
        }
      >
        {isFiltered && filtered.length > 0 && (
          <Text style={styles.countText}>
            {filtered.length} of {locations.length} areas
          </Text>
        )}

        {locations.length === 0 ? (
          refreshing ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={styles.loading} />
          ) : (
            <EmptyState
              icon="location-outline"
              title="No areas yet"
              message="Areas set up for your organization appear here. Pull down to refresh."
              actionLabel={onRefresh ? 'Refresh' : undefined}
              onAction={onRefresh ? handleRefresh : undefined}
            />
          )
        ) : paginatedLocations.length > 0 ? (
          <View style={isTablet ? styles.tabletGrid : undefined}>{paginatedLocations.map(renderCard)}</View>
        ) : (
          <EmptyState
            icon="search-outline"
            title="No areas match"
            message="Try a different name or code, or clear the filters."
            actionLabel="Clear search and filters"
            onAction={resetFilters}
          />
        )}

        {/* Paging */}
        {hasMore && (
          <Button
            label={`Show more (${filtered.length - visibleCount} more)`}
            icon="chevron-down"
            variant="secondary"
            onPress={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            fullWidth
            style={styles.loadMore}
          />
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  searchRow: {
    paddingHorizontal: SPACING.screen,
    marginBottom: SPACING.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    minHeight: TOUCH_TARGET,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  searchInput: {
    flex: 1,
    ...TYPE.body,
    color: COLORS.textDark,
    paddingVertical: SPACING.sm,
  },
  clearBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipScroll: {
    flexGrow: 0,
    marginBottom: SPACING.xs,
  },
  chipRow: {
    paddingHorizontal: SPACING.screen,
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: SPACING.screen,
    paddingTop: SPACING.sm,
    paddingBottom: BOTTOM_NAV_CLEARANCE,
  },
  countText: {
    ...TYPE.caption,
    color: COLORS.textMedium,
    marginBottom: SPACING.sm,
  },
  loading: {
    marginTop: SPACING.xxxl,
  },
  card: {
    marginBottom: SPACING.md,
  },
  pressed: {
    opacity: 0.7,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  cardTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  locName: {
    ...TYPE.heading,
    color: COLORS.textDark,
  },
  locCode: {
    ...TYPE.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  metaText: {
    ...TYPE.caption,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textMedium,
    marginTop: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  detailText: {
    ...TYPE.caption,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textMedium,
    flex: 1,
  },
  detailStrong: {
    fontWeight: '600',
    color: COLORS.textDark,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  actionButton: {
    flex: 1,
  },
  loadMore: {
    marginTop: SPACING.xs,
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
