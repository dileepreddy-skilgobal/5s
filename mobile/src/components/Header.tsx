import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, TOUCH_TARGET, TYPE } from '../constants/theme';
import { useUser } from '../context/UserContext';
import { useNotifications } from '../context/NotificationsContext';
import { ENV } from '../config/env';

interface HeaderProps {
  userName?: string;
  isOffline?: boolean;
  onStatusPress?: () => void;
  pendingSyncCount?: number;
  onSyncPress?: () => void;
  onProfilePress?: () => void;
}

/** Home header: organization, connection state, notifications, profile and a greeting. */
export const Header: React.FC<HeaderProps> = ({
  userName,
  isOffline = false,
  onStatusPress,
  pendingSyncCount = 0,
  onSyncPress,
  onProfilePress,
}) => {
  const { currentUser, tenant } = useUser();
  const { unreadCount, openInbox } = useNotifications();

  // Time-of-day greeting
  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const firstName = userName || currentUser?.firstName || '';
  const fullName = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') || firstName;
  const initials = `${firstName[0] ?? ''}${currentUser?.lastName?.[0] ?? ''}`.toUpperCase() || '?';
  const organization = tenant?.name || ENV.APP_NAME;
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.organization} numberOfLines={2} accessibilityLabel={`Organization: ${organization}`}>
            {organization}
          </Text>

          <View style={styles.pillRow}>
            {/* Online / offline: tapping refreshes data */}
            <Pressable
              style={({ pressed }) => [styles.pill, isOffline ? styles.pillOffline : styles.pillOnline, pressed && styles.pressed]}
              onPress={onStatusPress}
              hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={isOffline ? 'Offline. Tap to check the connection again' : 'Online. Tap to refresh'}
            >
              <View style={[styles.dot, { backgroundColor: isOffline ? COLORS.warning : COLORS.success }]} />
              <Text style={[styles.pillText, { color: isOffline ? COLORS.warning : COLORS.success }]}>
                {isOffline ? 'Offline' : 'Online'}
              </Text>
            </Pressable>

            {/* Items saved on the device that still have to be sent */}
            {pendingSyncCount > 0 && (
              <Pressable
                style={({ pressed }) => [styles.pill, styles.pillSync, pressed && styles.pressed]}
                onPress={onSyncPress}
                hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`${pendingSyncCount} ${pendingSyncCount === 1 ? 'item' : 'items'} waiting to sync. Tap to sync now`}
              >
                <Ionicons name="cloud-upload-outline" size={14} color={COLORS.primary} />
                <Text style={[styles.pillText, { color: COLORS.primary }]}>{pendingSyncCount} to sync</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Notifications bell with unread badge */}
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          onPress={openInbox}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <Ionicons name={unreadCount > 0 ? 'notifications' : 'notifications-outline'} size={22} color={COLORS.textDark} />
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadLabel}</Text>
            </View>
          )}
        </Pressable>

        {/* Avatar opens the profile */}
        <Pressable
          style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
          onPress={onProfilePress}
          accessibilityRole="button"
          accessibilityLabel={fullName ? `Profile of ${fullName}` : 'Profile'}
        >
          <Text style={styles.avatarInitials}>{initials}</Text>
        </Pressable>
      </View>

      <Text style={styles.greeting} numberOfLines={2} accessibilityRole="header">
        {firstName ? `${greetingText}, ${firstName}` : greetingText}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.screen,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  topBarLeft: { flex: 1, minWidth: 0, gap: 6 },
  organization: { ...TYPE.label, color: COLORS.textMedium },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  pillOnline: { backgroundColor: COLORS.successSoft, borderColor: COLORS.successBorder },
  pillOffline: { backgroundColor: COLORS.warningSoft, borderColor: COLORS.warningBorder },
  pillSync: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primaryBorder },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { ...TYPE.captionStrong },
  pressed: { opacity: 0.75 },
  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  bellBadgeText: { color: COLORS.textInverse, fontSize: 12, lineHeight: 14, fontWeight: '700' },
  avatar: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { ...TYPE.subheading, color: COLORS.textInverse },
  greeting: { ...TYPE.title, color: COLORS.textDark, marginTop: SPACING.lg },
});
