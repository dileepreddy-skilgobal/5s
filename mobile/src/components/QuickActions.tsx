import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../constants/theme';

interface QuickActionsProps {
  onStartAudit: () => void;
  onTrackOrder: () => void;
  onSchedule: () => void;
  onMore: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  onStartAudit,
  onTrackOrder,
  onSchedule,
  onMore,
}) => {
  return (
    <View style={styles.container}>
      {/* 1. Execute Audit (Primary Orange Squircle) */}
      <TouchableOpacity
        style={styles.actionItem}
        onPress={onStartAudit}
        activeOpacity={0.85}
      >
        <View style={[styles.iconBoxPrimary, SHADOWS.floating]}>
          <Ionicons name="clipboard" size={24} color="#FFFFFF" />
        </View>
        <Text style={styles.actionLabelBold}>Start Audit</Text>
      </TouchableOpacity>

      {/* 2. My Audits */}
      <TouchableOpacity
        style={styles.actionItem}
        onPress={onTrackOrder}
        activeOpacity={0.8}
      >
        <View style={styles.iconBoxSecondary}>
          <Ionicons name="layers-outline" size={24} color={COLORS.textDark} />
        </View>
        <Text style={styles.actionLabel}>My Audits</Text>
      </TouchableOpacity>

      {/* 3. Audit Schedule */}
      <TouchableOpacity
        style={styles.actionItem}
        onPress={onSchedule}
        activeOpacity={0.8}
      >
        <View style={styles.iconBoxSecondary}>
          <Ionicons name="calendar-outline" size={24} color={COLORS.textDark} />
        </View>
        <Text style={styles.actionLabel}>Schedule</Text>
      </TouchableOpacity>

      {/* 4. Red Tag & Abnormality */}
      <TouchableOpacity
        style={styles.actionItem}
        onPress={onMore}
        activeOpacity={0.8}
      >
        <View style={styles.iconBoxSecondary}>
          <Ionicons name="pricetag-outline" size={24} color={COLORS.textDark} />
        </View>
        <Text style={styles.actionLabel}>Red Tag</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  actionItem: {
    alignItems: 'center',
    width: '23%',
  },
  iconBoxPrimary: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconBoxSecondary: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#F1F3F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionLabelBold: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textDark,
    textAlign: 'center',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMedium,
    textAlign: 'center',
  },
});
