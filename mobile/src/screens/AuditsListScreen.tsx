import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, Pressable, TextInput, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PILLARS } from '../constants/pillars';
import { BOTTOM_NAV_CLEARANCE, COLORS, RADIUS, SPACING, TOUCH_TARGET, TYPE } from '../constants/theme';
import { AuditExecution, AuditStatus } from '../types';
import { useResponsive } from '../hooks/useResponsive';
import { useUser } from '../context/UserContext';
import { Badge, Button, Card, Chip, EmptyState, ScreenHeader, Tone } from '../components/ui';

interface AuditsListScreenProps {
  audits: AuditExecution[];
  onSelectAudit: (audit: AuditExecution) => void;
  onNewAudit: () => void;
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

type FilterKey = 'ALL' | AuditStatus;

const FILTERS: { key: FilterKey; label: string; empty: string }[] = [
  { key: 'ALL', label: 'All', empty: 'No audits yet' },
  { key: 'IN_PROGRESS', label: 'In progress', empty: 'No audits in progress' },
  { key: 'SCHEDULED', label: 'Scheduled', empty: 'No scheduled audits' },
  { key: 'PENDING_REVIEW', label: 'Awaiting sign-off', empty: 'Nothing awaiting sign-off' },
  { key: 'COMPLETED', label: 'Completed', empty: 'No completed audits' },
];

/** Score bands shared with the web analytics: 90+ / 75+ / 60+ / below 60. */
const scoreTone =(score: number): Tone => (score >= 90 ? 'success' : score >= 75 ? 'info' : score >= 60 ? 'warning' : 'danger');
const scoreColor = (score: number) => {
  const tone = scoreTone(score);
  return tone === 'success' ? COLORS.success : tone === 'info' ? COLORS.info : tone === 'warning' ? COLORS.warning : COLORS.danger;
};

const STATUS_TONE: Record<AuditStatus, Tone> = {
  SCHEDULED: 'neutral',
  IN_PROGRESS: 'info',
  PENDING_REVIEW: 'warning',
  COMPLETED: 'success',
};

/** Badge text from the mapped status label, in sentence case ("In Progress" → "In progress"). */
const statusLabel = (a: AuditExecution) => {
  const raw = (a.statusBadge || a.status).replace(/_/g, ' ');
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
};

/** Submission times are ISO strings; other dates are already formatted for display. */
const displayDate = (value?: string) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB');
  }
  return value;
};

/** The date that matters for the audit's status: due / started / submitted. */
const dateInfo = (a: AuditExecution): { label: string; value: string } => {
  if (a.status === 'SCHEDULED') {
    const due = a.timeline.find((t) => t.label === 'Due')?.timestamp;
    return due ? { label: 'Due', value: due } : { label: 'Planned', value: a.scheduledDate };
  }
  if (a.status === 'IN_PROGRESS') {
    return { label: 'Started', value: [a.scheduledDate, a.startedAt].filter(Boolean).join(', ') };
  }
  return { label: 'Submitted', value: displayDate(a.completedAt) };
};

export const AuditsListScreen: React.FC<AuditsListScreenProps> = ({
  audits,
  onSelectAudit,
  onNewAudit,
  onRefresh,
  isRefreshing = false,
}) => {
  const { isTablet } = useResponsive();
  const { can } = useUser();
  const canConduct = can('AUDIT_CONDUCTORS');
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [localRefreshing, setLocalRefreshing] = useState(false);

  // Status counts for the filter chips
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { ALL: audits.length, SCHEDULED: 0, IN_PROGRESS: 0, PENDING_REVIEW: 0, COMPLETED: 0 };
    audits.forEach((a) => {
      c[a.status] += 1;
    });
    return c;
  }, [audits]);

  // "Awaiting sign-off" only appears when such audits exist (or it is the active filter)
  const visibleFilters = FILTERS.filter((f) => f.key !== 'PENDING_REVIEW' || counts.PENDING_REVIEW > 0 || filter === 'PENDING_REVIEW');

  // Filtered and searched audits
  const filteredAudits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return audits.filter((a) => {
      const matchesFilter = filter === 'ALL' || a.status === filter;
      const matchesSearch =
        !q ||
        a.trackingNumber.toLowerCase().includes(q) ||
        a.locationName.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.templateTitle.toLowerCase().includes(q) ||
        a.auditorName.toLowerCase().includes(q) ||
        (a.plantName && a.plantName.toLowerCase().includes(q));
      return matchesFilter && matchesSearch;
    });
  }, [audits, filter, searchQuery]);

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

  const resetFilters = () => {
    setSearchQuery('');
    setFilter('ALL');
  };

  const renderEmpty = () => {
    if (searchQuery.trim()) {
      return (
        <EmptyState
          icon="search-outline"
          title="No matching audits"
          message={`Nothing matches “${searchQuery.trim()}”. Check the code or area name.`}
          actionLabel="Clear search"
          onAction={resetFilters}
        />
      );
    }
    if (filter !== 'ALL') {
      const f = FILTERS.find((x) => x.key === filter);
      return <EmptyState icon="clipboard-outline" title={f?.empty ?? 'No audits'} actionLabel="Show all audits" onAction={() => setFilter('ALL')} />;
    }
    return canConduct ? (
      <EmptyState
        icon="clipboard-outline"
        title="No audits yet"
        message="Scheduled audits and audits you start will appear here."
        actionLabel="Start an audit"
        onAction={onNewAudit}
      />
    ) : (
      <EmptyState icon="clipboard-outline" title="No audits yet" message="Audits of your areas will appear here." />
    );
  };

  const renderItem = ({ item }: { item: AuditExecution }) => {
    const scored = item.overallScore !== null;
    const pillars = PILLARS.filter((pl) => item.pillarScores[pl.key] !== undefined);
    const date = dateInfo(item);
    const auditor = item.auditorName.split('(')[0].trim();
    const tone: Tone = item.statusBadge === 'Disputed' ? 'danger' : STATUS_TONE[item.status];
    const label = statusLabel(item);

    return (
      <Card
        onPress={() => onSelectAudit(item)}
        style={[styles.card, isTablet && styles.tabletCard]}
        accessibilityLabel={`${item.trackingNumber}, ${item.locationName}, ${label}${scored ? `, score ${Math.round(item.overallScore ?? 0)} percent` : ''}`}
      >
        <View style={styles.cardTop}>
          <Text style={styles.code} numberOfLines={1}>
            {item.trackingNumber}
          </Text>
          <Badge
            label={label}
            tone={tone}
            icon={item.isOfflineSyncPending ? 'cloud-upload-outline' : undefined}
          />
        </View>

        <Text style={styles.areaName} numberOfLines={2}>
          {item.locationName || 'Area not set'}
        </Text>
        <Text style={styles.subLine} numberOfLines={2}>
          {[item.category, item.templateTitle].filter(Boolean).join(' • ')}
        </Text>

        {/* Pillar scores: only for audits the server (or this device) has scored */}
        {scored && pillars.length > 0 && (
          <View style={styles.pillarStrip}>
            {pillars.map((pl) => {
              const val = item.pillarScores[pl.key] as number;
              return (
                <View key={pl.key} style={styles.pillarItem} accessibilityLabel={`${pl.label} ${val} percent`}>
                  <Text style={styles.pillarKey}>{pl.short}</Text>
                  <View style={styles.pillarBarTrack}>
                    <View style={[styles.pillarBarFill, { width: `${Math.max(0, Math.min(100, val))}%`, backgroundColor: scoreColor(val) }]} />
                  </View>
                  <Text style={styles.pillarVal}>{val}%</Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.cardDivider} />

        <View style={styles.cardBottom}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Auditor</Text>
            <Text style={styles.metaVal} numberOfLines={2}>
              {auditor || 'Not assigned'}
            </Text>
          </View>
          {scored && (
            <View style={styles.metaColNarrow}>
              <Text style={styles.metaLabel}>Score</Text>
              <Text style={[styles.metaScore, { color: scoreColor(item.overallScore ?? 0) }]}>{Math.round(item.overallScore ?? 0)}%</Text>
            </View>
          )}
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>{date.label}</Text>
            <Text style={styles.metaVal} numberOfLines={1}>
              {date.value || '—'}
            </Text>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Audits"
        action={canConduct ? <Button label="New audit" icon="add" size="md" onPress={onNewAudit} accessibilityLabel="Start a new audit" /> : undefined}
      />

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search code, area, template or auditor"
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            accessibilityLabel="Search audits"
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

      {/* Status filters: one row that scrolls sideways (the next chip peeks at the edge) */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {visibleFilters.map((f) => (
            <Chip key={f.key} label={f.label} count={counts[f.key]} selected={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </ScrollView>
      </View>

      <FlatList
        key={isTablet ? 'grid' : 'list'}
        data={filteredAudits}
        keyExtractor={(a) => a.id}
        renderItem={renderItem}
        numColumns={isTablet ? 2 : 1}
        columnWrapperStyle={isTablet ? styles.tabletRow : undefined}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={isRefreshing || localRefreshing}
              onRefresh={handleRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          ) : undefined
        }
      />
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
    marginBottom: SPACING.md,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: TOUCH_TARGET,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  searchInput: {
    flex: 1,
    ...TYPE.body,
    color: COLORS.textDark,
    paddingVertical: 10,
  },
  clearBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    paddingHorizontal: SPACING.screen,
    gap: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  listContent: {
    paddingHorizontal: SPACING.screen,
    paddingBottom: BOTTOM_NAV_CLEARANCE,
    flexGrow: 1,
  },
  tabletRow: {
    gap: SPACING.md,
  },
  card: {
    marginBottom: SPACING.md,
  },
  tabletCard: {
    flex: 1,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  code: {
    ...TYPE.label,
    color: COLORS.textMedium,
    flexShrink: 1,
  },
  areaName: {
    ...TYPE.heading,
    color: COLORS.textDark,
    marginTop: SPACING.sm,
  },
  subLine: {
    ...TYPE.caption,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  pillarStrip: {
    flexDirection: 'row',
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  pillarItem: {
    flex: 1,
    alignItems: 'center',
  },
  pillarKey: {
    ...TYPE.captionStrong,
    color: COLORS.textMedium,
    marginBottom: 4,
  },
  pillarBarTrack: {
    width: '100%',
    height: 4,
    backgroundColor: COLORS.cardSecondary,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  pillarBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  pillarVal: {
    ...TYPE.caption,
    color: COLORS.textMedium,
  },
  cardDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },
  cardBottom: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  metaCol: {
    flex: 1,
    minWidth: 0,
  },
  metaColNarrow: {
    minWidth: 56,
  },
  metaLabel: {
    ...TYPE.caption,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  metaVal: {
    ...TYPE.label,
    color: COLORS.textDark,
  },
  metaScore: {
    ...TYPE.subheading,
    fontWeight: '700',
  },
});
