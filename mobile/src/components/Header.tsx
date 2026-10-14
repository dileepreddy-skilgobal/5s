import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { useUser } from '../context/UserContext';
import { ENV } from '../config/env';

interface HeaderProps {
  userName?: string;
  isOffline?: boolean;
  onToggleOffline?: () => void;
  pendingSyncCount?: number;
  onSyncPress?: () => void;
  onProfilePress?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  userName,
  isOffline = false,
  onToggleOffline,
  pendingSyncCount = 0,
  onSyncPress,
  onProfilePress,
}) => {
  const { currentUser, tenant } = useUser();

  // Dynamic time-of-day greeting
  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const activeName = userName || currentUser?.firstName || 'Auditor';
  const initials = `${activeName[0]}${currentUser?.lastName?.[0] || ''}`;

  return (
    <View style={styles.container}>
      {/* 1. Top Bar: Plant Identifier & Online Status on Left, Profile Avatar on Right */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.eyebrow} numberOfLines={1}>
            {tenant?.plantName || tenant?.name || ENV.APP_NAME}
          </Text>

          {/* Online / Offline status badge */}
          <TouchableOpacity
            style={[styles.statusBadge, isOffline ? styles.statusOffline : styles.statusOnline]}
            onPress={onToggleOffline}
            activeOpacity={0.7}
          >
            <View style={[styles.statusDot, { backgroundColor: isOffline ? '#EF4444' : '#10B981' }]} />
            <Text style={[styles.statusText, { color: isOffline ? '#DC2626' : '#059669' }]}>
              {isOffline ? 'Offline' : 'Online'}
            </Text>
          </TouchableOpacity>

          {/* Sync indicator if pending queue */}
          {pendingSyncCount > 0 && (
            <TouchableOpacity style={styles.syncBtn} onPress={onSyncPress} activeOpacity={0.8}>
              <Ionicons name="cloud-upload" size={13} color="#FF6433" />
              <Text style={styles.syncCount}>{pendingSyncCount}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Auditor Profile Avatar - Tappable to open Profile */}
        <TouchableOpacity
          style={styles.avatarWrapper}
          onPress={onProfilePress}
          activeOpacity={0.75}
          accessibilityLabel={`Auditor profile for ${activeName}`}
          accessibilityRole="button"
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarInitials}>{initials.toUpperCase()}</Text>
          </View>
          {/* Notification / Status indicator badge */}
          <View
            style={[
              styles.avatarNotificationDot,
              { backgroundColor: isOffline ? '#EF4444' : COLORS.primary },
            ]}
          />
        </TouchableOpacity>
      </View>

      {/* 2. Main Greeting Section - Full Width for Clean Single-Line Rendering */}
      <View style={styles.greetingSection}>
        <Text style={styles.greeting} numberOfLines={1} adjustsFontSizeToFit>
          {greetingText}, {activeName}!
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusOnline: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusOffline: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  syncCount: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 3,
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  avatarNotificationDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  greetingSection: {
    marginTop: 2,
  },
  greeting: {
    fontSize: 23,
    fontWeight: '800',
    color: COLORS.textDark,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
});
