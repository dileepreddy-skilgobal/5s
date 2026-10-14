import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../constants/theme';
import { useResponsive } from '../hooks/useResponsive';

export type TabType = 'home' | 'audits' | 'locations' | 'profile';

interface BottomNavBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onCenterActionPress: () => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onTabChange,
  onCenterActionPress,
}) => {
  const { isTablet } = useResponsive();

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.container,
          SHADOWS.nav,
          isTablet && styles.tabletContainer,
        ]}
      >
        {/* Tab 1: Home */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => onTabChange('home')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeTab === 'home' ? 'home' : 'home-outline'}
            size={22}
            color={activeTab === 'home' ? COLORS.textDark : COLORS.textMuted}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'home' ? styles.tabLabelActive : styles.tabLabelInactive,
            ]}
          >
            Home
          </Text>
          {activeTab === 'home' && <View style={styles.activeIndicator} />}
        </TouchableOpacity>

        {/* Tab 2: Audits */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => onTabChange('audits')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeTab === 'audits' ? 'clipboard' : 'clipboard-outline'}
            size={22}
            color={activeTab === 'audits' ? COLORS.textDark : COLORS.textMuted}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'audits' ? styles.tabLabelActive : styles.tabLabelInactive,
            ]}
          >
            Audits
          </Text>
          {activeTab === 'audits' && <View style={styles.activeIndicator} />}
        </TouchableOpacity>

        {/* Center Floating Elevated Action Button: Scan QR / Execute */}
        <View style={styles.centerButtonWrapper}>
          <TouchableOpacity
            style={[styles.centerButton, styles.centerButtonShadow]}
            onPress={onCenterActionPress}
            activeOpacity={0.88}
            accessibilityLabel="Scan Area QR Code"
          >
            <Ionicons name="scan-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.centerButtonLabel}>Scan</Text>
        </View>

        {/* Tab 4: Locations / Shopfloor */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => onTabChange('locations')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeTab === 'locations' ? 'location' : 'location-outline'}
            size={22}
            color={activeTab === 'locations' ? COLORS.textDark : COLORS.textMuted}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'locations' ? styles.tabLabelActive : styles.tabLabelInactive,
            ]}
          >
            Locations
          </Text>
          {activeTab === 'locations' && <View style={styles.activeIndicator} />}
        </TouchableOpacity>

        {/* Tab 5: Profile */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => onTabChange('profile')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeTab === 'profile' ? 'person' : 'person-outline'}
            size={22}
            color={activeTab === 'profile' ? COLORS.textDark : COLORS.textMuted}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'profile' ? styles.tabLabelActive : styles.tabLabelInactive,
            ]}
          >
            Profile
          </Text>
          {activeTab === 'profile' && <View style={styles.activeIndicator} />}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 12 : 4,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: '#F0F2F5',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 8,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    position: 'relative',
    paddingVertical: 2,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  tabLabelActive: {
    color: COLORS.textDark,
    fontWeight: '700',
  },
  tabLabelInactive: {
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -2,
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  centerButtonWrapper: {
    alignItems: 'center',
    top: -5,
  },
  centerButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  centerButtonShadow: {
    shadowColor: '#FF6433',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
  },
  centerButtonLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 2,
  },
  tabletContainer: {
    maxWidth: 620,
    width: '90%',
    alignSelf: 'center',
    borderRadius: 24,
    marginBottom: 12,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
});
