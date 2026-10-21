import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPE } from '../constants/theme';
import { useResponsive } from '../hooks/useResponsive';

export type TabType = 'home' | 'audits' | 'locations' | 'profile';

interface BottomNavBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onCenterActionPress: () => void;
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: Array<{ key: TabType; label: string; icon: IconName; activeIcon: IconName }> = [
  { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { key: 'audits', label: 'Audits', icon: 'clipboard-outline', activeIcon: 'clipboard' },
  { key: 'locations', label: 'Areas', icon: 'location-outline', activeIcon: 'location' },
  { key: 'profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

/** Height of the bar itself (the app shell keeps the device's bottom safe area below it). */
export const BOTTOM_NAV_HEIGHT = 64;

const TabButton: React.FC<{ tab: (typeof TABS)[number]; active: boolean; onPress: () => void }> = ({ tab, active, onPress }) => (
  <Pressable
    style={({ pressed }) => [styles.tabItem, pressed && styles.pressed]}
    onPress={onPress}
    accessibilityRole="tab"
    accessibilityLabel={tab.label}
    accessibilityState={{ selected: active }}
  >
    <View style={[styles.iconPill, active && styles.iconPillActive]}>
      <Ionicons name={active ? tab.activeIcon : tab.icon} size={22} color={active ? COLORS.primary : COLORS.textMuted} />
    </View>
    <Text style={[styles.tabLabel, active ? styles.tabLabelActive : styles.tabLabelInactive]} numberOfLines={1}>
      {tab.label}
    </Text>
  </Pressable>
);

/** Bottom tab bar with a central scan button. Sits at the bottom of the app shell, above the safe area. */
export const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeTab, onTabChange, onCenterActionPress }) => {
  const { isTablet } = useResponsive();
  const [first, second, third, fourth] = TABS;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={[styles.container, isTablet && styles.tabletContainer]} accessibilityRole="tablist">
        <TabButton tab={first} active={activeTab === first.key} onPress={() => onTabChange(first.key)} />
        <TabButton tab={second} active={activeTab === second.key} onPress={() => onTabChange(second.key)} />

        {/* Central scan button */}
        <Pressable
          style={({ pressed }) => [styles.tabItem, pressed && styles.pressed]}
          onPress={onCenterActionPress}
          accessibilityRole="button"
          accessibilityLabel="Scan an area QR code"
        >
          <View style={styles.centerButton}>
            <Ionicons name="scan-outline" size={22} color={COLORS.textInverse} />
          </View>
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>Scan</Text>
        </Pressable>

        <TabButton tab={third} active={activeTab === third.key} onPress={() => onTabChange(third.key)} />
        <TabButton tab={fourth} active={activeTab === fourth.key} onPress={() => onTabChange(fourth.key)} />
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
  },
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: BOTTOM_NAV_HEIGHT,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.xs,
    ...SHADOWS.nav,
  },
  tabletContainer: {
    maxWidth: 620,
    width: '90%',
    alignSelf: 'center',
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pressed: { opacity: 0.7 },
  iconPill: {
    width: 48,
    height: 30,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: { backgroundColor: COLORS.primarySoft },
  centerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.floating,
  },
  tabLabel: { ...TYPE.caption },
  tabLabelActive: { color: COLORS.primary, fontWeight: '600' },
  tabLabelInactive: { color: COLORS.textMedium },
});
