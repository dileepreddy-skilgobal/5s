import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { BOTTOM_NAV_CLEARANCE, COLORS, RADIUS, SPACING, TYPE } from '../constants/theme';
import { useUser } from '../context/UserContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useResponsive } from '../hooks/useResponsive';
import { Badge, Button, Card, InfoRow, ScreenHeader, StatTile } from '../components/ui';
import { InlineMessage } from '../components/SheetLayout';

interface ProfileScreenProps {
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

const APP_VERSION = Constants.expoConfig?.version;

/**
 * Asks for confirmation. React Native's Alert has no buttons in the web preview, so the browser dialog is used there.
 */
const confirmAction = (title: string, message: string, confirmLabel: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
};

type SyncMessage = { tone: 'success' | 'warning' | 'danger'; text: string };

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onRefresh, isRefreshing }) => {
  const { currentUser, tenant, userStats, signOut, can } = useUser();
  const { isOnline, syncItems, isSyncing, syncNow, retrySyncItem, discardSyncItem, lastSyncedAt, templates } = useWorkspace();
  const { isTablet } = useResponsive();
  const isOffline = !isOnline;
  const pendingItems = syncItems.filter((i) => i.state === 'PENDING');
  const failedItems = syncItems.filter((i) => i.state === 'FAILED');
  const pendingSyncCount = pendingItems.length;
  const [syncMessage, setSyncMessage] = useState<SyncMessage | null>(null);

  const handleSyncNow = async () => {
    setSyncMessage(null);
    const result = await syncNow();
    if (!result) {
      setSyncMessage({ tone: 'warning', text: 'No network connection. Items will sync automatically when the device is back online.' });
    } else if (result.errors.length > 0) {
      setSyncMessage({ tone: 'danger', text: `Some items were rejected:\n${result.errors.join('\n')}` });
    } else {
      setSyncMessage({ tone: 'success', text: result.synced > 0 ? `${result.synced} item${result.synced === 1 ? '' : 's'} sent.` : 'Nothing to send.' });
    }
  };

  const handleSignOut = () => {
    const warning =
      pendingSyncCount > 0
        ? `You have ${pendingSyncCount} item${pendingSyncCount === 1 ? '' : 's'} waiting to sync. They stay on this device and sync after you sign in again.`
        : 'You will need to sign in again to continue.';
    confirmAction('Sign out?', warning, 'Sign out', () => signOut());
  };

  const initials = `${currentUser.firstName?.[0] || 'U'}${currentUser.lastName?.[0] || ''}`.toUpperCase();
  const fullName = `${currentUser.firstName} ${currentUser.lastName}`.trim();
  const jobLine = [currentUser.jobTitle, currentUser.department].filter((v) => v && v.trim()).join(' • ');

  // Personal audit figures only mean something for people who conduct audits (or have done so)
  const showStats = can('AUDIT_CONDUCTORS') || userStats.auditsCompleted > 0;

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

  const syncDisabledReason = isOffline
    ? 'You are offline. Items are sent automatically when the connection returns.'
    : pendingSyncCount === 0
      ? 'Nothing is waiting to be sent.'
      : null;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Profile" action={<Button label="Sign out" icon="log-out-outline" variant="secondary" onPress={handleSignOut} />} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={!!isRefreshing || localRefreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        <View style={isTablet ? styles.tabletLayoutRow : undefined}>
          {/* Left column (or full width on phones) */}
          <View style={isTablet ? styles.tabletCol : undefined}>
            {/* Identity */}
            <Card style={styles.section}>
              <View style={styles.identityRow}>
                <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View style={styles.identityText}>
                  <Text style={styles.userName} numberOfLines={2}>
                    {fullName}
                  </Text>
                  {jobLine ? <Text style={styles.userJob}>{jobLine}</Text> : null}
                  <View style={styles.roleBadge}>
                    <Badge label={currentUser.roleName} tone="info" icon="shield-checkmark-outline" />
                  </View>
                </View>
              </View>
              <Text style={styles.email} numberOfLines={1}>
                {currentUser.email}
              </Text>
            </Card>

            {/* Personal audit figures, from the user's own audits */}
            {showStats && (
              <View style={[styles.section, styles.statsRow]}>
                <StatTile value={String(userStats.auditsCompleted)} label="Audits completed" />
                <StatTile
                  value={userStats.auditsCompleted > 0 ? `${Math.round(userStats.avgScore)}%` : '—'}
                  label="Average score"
                />
                <StatTile value={String(userStats.findingsLogged)} label="Findings recorded" />
              </View>
            )}

            {/* Organization */}
            <Card style={styles.section}>
              <Text style={styles.cardTitle} accessibilityRole="header">
                Organization
              </Text>
              <InfoRow label="Organization" value={tenant.name} />
              {currentUser.department ? <InfoRow label="Department" value={currentUser.department} /> : null}
              <InfoRow label="Role" value={currentUser.roleName} />
              <InfoRow label="Audit templates available" value={String(templates.length)} last />
            </Card>
          </View>

          {/* Right column (or below on phones) */}
          <View style={isTablet ? styles.tabletCol : undefined}>
            {/* Sync */}
            <Card style={styles.section}>
              <View style={styles.syncHeader}>
                <Text style={styles.cardTitle} accessibilityRole="header">
                  Sync
                </Text>
                <Badge
                  label={isOffline ? 'Offline' : 'Online'}
                  tone={isOffline ? 'warning' : 'success'}
                  icon={isOffline ? 'cloud-offline-outline' : 'cloud-done-outline'}
                />
              </View>

              <InfoRow
                label="Waiting to send"
                value={pendingSyncCount === 0 ? 'Nothing' : `${pendingSyncCount} item${pendingSyncCount === 1 ? '' : 's'}`}
              />
              {failedItems.length > 0 && <InfoRow label="Rejected" value={`${failedItems.length} item${failedItems.length === 1 ? '' : 's'}`} />}
              <InfoRow label="Last refresh" value={lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Not yet'} last />

              <Text style={styles.syncNote}>
                {isOffline
                  ? 'Audits, red tags and reports are saved on this device and sent automatically when the connection returns.'
                  : 'Audits, red tags and reports are sent as soon as you save them.'}
              </Text>

              <Button
                label={isSyncing ? 'Sending…' : 'Sync now'}
                icon="sync"
                onPress={handleSyncNow}
                loading={isSyncing}
                disabled={!!syncDisabledReason || isSyncing}
                fullWidth
                style={styles.syncButton}
              />
              {syncDisabledReason ? <Text style={styles.syncHint}>{syncDisabledReason}</Text> : null}
              {syncMessage ? (
                <View style={styles.syncMessage}>
                  <InlineMessage tone={syncMessage.tone} message={syncMessage.text} />
                </View>
              ) : null}

              {/* Work waiting to be sent (audits, red tags, abnormality reports with their media) */}
              {pendingItems.length > 0 && (
                <View style={styles.queue}>
                  {pendingItems.map((item) => (
                    <View key={item.id} style={styles.queueRow}>
                      <Ionicons
                        name={item.type === 'OBSERVATION_CREATE' ? 'alert-circle-outline' : item.type === 'RED_TAG_CREATE' ? 'pricetag-outline' : 'clipboard-outline'}
                        size={18}
                        color={COLORS.warning}
                      />
                      <View style={styles.queueText}>
                        <Text style={styles.queueLabel} numberOfLines={2}>
                          {item.label}
                        </Text>
                        <Text style={styles.queueSub} numberOfLines={2}>
                          {item.attempts > 0 && item.lastError
                            ? `Waiting to retry: ${item.lastError}`
                            : `Saved ${new Date(item.createdAt).toLocaleString()}`}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Items rejected by the server need a decision: retry or discard */}
              {failedItems.map((item) => (
                <View key={item.id} style={styles.failedItem}>
                  <View style={styles.queueRowInner}>
                    <Ionicons name="alert-circle-outline" size={18} color={COLORS.danger} />
                    <View style={styles.queueText}>
                      <Text style={styles.queueLabel}>{item.label}</Text>
                      <Text style={styles.queueSub}>{item.lastError || 'Rejected by the server'}</Text>
                    </View>
                  </View>
                  <View style={styles.failedActions}>
                    <Button
                      label="Retry"
                      icon="refresh"
                      variant="secondary"
                      size="sm"
                      onPress={() => retrySyncItem(item.id)}
                      style={styles.flex}
                      accessibilityLabel={`Retry ${item.label}`}
                    />
                    <Button
                      label="Discard"
                      icon="trash-outline"
                      variant="danger"
                      size="sm"
                      onPress={() =>
                        confirmAction('Discard item?', 'This submission will be removed from the device and cannot be recovered.', 'Discard', () =>
                          discardSyncItem(item.id),
                        )
                      }
                      style={styles.flex}
                      accessibilityLabel={`Discard ${item.label}`}
                    />
                  </View>
                </View>
              ))}
            </Card>

            {APP_VERSION ? <Text style={styles.versionText}>App version {APP_VERSION}</Text> : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: SPACING.screen,
    paddingTop: SPACING.xs,
    paddingBottom: BOTTOM_NAV_CLEARANCE,
  },
  flex: {
    flex: 1,
  },
  section: {
    marginBottom: SPACING.md,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...TYPE.title,
    color: COLORS.textInverse,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    ...TYPE.title,
    color: COLORS.textDark,
  },
  userJob: {
    ...TYPE.caption,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  roleBadge: {
    marginTop: SPACING.sm,
  },
  email: {
    ...TYPE.caption,
    color: COLORS.textMuted,
    marginTop: SPACING.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  cardTitle: {
    ...TYPE.heading,
    color: COLORS.textDark,
    marginBottom: SPACING.xs,
  },
  syncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  syncNote: {
    ...TYPE.caption,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textMedium,
    marginTop: SPACING.md,
  },
  syncButton: {
    marginTop: SPACING.lg,
  },
  syncHint: {
    ...TYPE.caption,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  syncMessage: {
    marginTop: SPACING.md,
  },
  queue: {
    marginTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  queueRowInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  queueText: {
    flex: 1,
  },
  queueLabel: {
    ...TYPE.label,
    color: COLORS.textDark,
  },
  queueSub: {
    ...TYPE.caption,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  failedItem: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    backgroundColor: COLORS.dangerSoft,
  },
  failedActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  versionText: {
    ...TYPE.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  tabletLayoutRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
    alignItems: 'flex-start',
  },
  tabletCol: {
    flex: 1,
  },
});
