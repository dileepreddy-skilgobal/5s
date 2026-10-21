import React, { useMemo, useState } from 'react';
import { DimensionValue, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING, TOUCH_TARGET, TYPE } from '../constants/theme';
import { LocationMaster } from '../types';
import { TextField } from './ui';

/**
 * Building blocks shared by the bottom-sheet forms (report, red tag, scanner, notifications):
 * a sheet with drag handle, header and fixed footer; a searchable area picker; inline messages.
 */

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Round 44pt icon-only button (close, remove…). Always pass an accessibility label. */
export const IconButton: React.FC<{
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
  size?: number;
  disabled?: boolean;
  tone?: 'neutral' | 'plain';
}> = ({ icon, onPress, accessibilityLabel, color = COLORS.textDark, size = 22, disabled, tone = 'neutral' }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled: !!disabled }}
    hitSlop={4}
    style={({ pressed }) => [
      styles.iconButton,
      tone === 'neutral' && styles.iconButtonNeutral,
      pressed && { opacity: 0.7 },
      disabled && { opacity: 0.4 },
    ]}
  >
    <Ionicons name={icon} size={size} color={color} />
  </Pressable>
);

/**
 * Bottom sheet in a transparent modal: drag handle, title + close button, scrolling body and an optional
 * footer that stays above the keyboard and the home indicator.
 */
export const Sheet: React.FC<{
  visible: boolean;
  /** Close button, Android back button. */
  onRequestClose: () => void;
  title: string;
  subtitle?: string;
  /** Extra header controls shown before the close button. */
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** false when the body manages its own scrolling (e.g. a FlatList). */
  scroll?: boolean;
  /** Content rendered inside the modal on top of the sheet (nested modals such as the photo annotator). */
  overlay?: React.ReactNode;
  closeLabel?: string;
  minHeight?: DimensionValue;
}> = ({ visible, onRequestClose, title, subtitle, headerAction, footer, children, scroll = true, overlay, closeLabel = 'Close', minHeight }) => {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, SPACING.lg);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onRequestClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <View style={[styles.sheet, { marginTop: insets.top + SPACING.lg }, minHeight !== undefined && { minHeight }]}>
          <View style={styles.handle} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {headerAction}
            <IconButton icon="close" onPress={onRequestClose} accessibilityLabel={closeLabel} />
          </View>

          {scroll ? (
            <ScrollView
              style={styles.body}
              contentContainerStyle={[styles.bodyContent, !footer && { paddingBottom: bottomPad }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.body, styles.bodyFill, !footer && { paddingBottom: insets.bottom }]}>{children}</View>
          )}

          {footer ? <View style={[styles.footer, { paddingBottom: bottomPad }]}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
      {overlay}
    </Modal>
  );
};

/** Bordered inline message (validation error, warning, info) inside forms. */
export const InlineMessage: React.FC<{ tone: 'danger' | 'warning' | 'info' | 'success'; title?: string; message: string; icon?: IconName; children?: React.ReactNode }> = ({
  tone,
  title,
  message,
  icon,
  children,
}) => {
  const palette = {
    danger: { bg: COLORS.dangerSoft, border: COLORS.dangerBorder, text: COLORS.danger, icon: 'alert-circle-outline' as IconName },
    warning: { bg: COLORS.warningSoft, border: COLORS.warningBorder, text: COLORS.warning, icon: 'warning-outline' as IconName },
    info: { bg: COLORS.infoSoft, border: COLORS.infoBorder, text: COLORS.info, icon: 'information-circle-outline' as IconName },
    success: { bg: COLORS.successSoft, border: COLORS.successBorder, text: COLORS.success, icon: 'checkmark-circle-outline' as IconName },
  }[tone];
  return (
    <View
      style={[styles.message, { backgroundColor: palette.bg, borderColor: palette.border }]}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      accessibilityLiveRegion={tone === 'danger' ? 'polite' : 'none'}
    >
      <Ionicons name={icon ?? palette.icon} size={18} color={palette.text} />
      <View style={{ flex: 1 }}>
        {title ? <Text style={[styles.messageTitle, { color: palette.text }]}>{title}</Text> : null}
        <Text style={[styles.messageText, { color: title ? COLORS.textDark : palette.text }]}>{message}</Text>
        {children}
      </View>
    </View>
  );
};

/** Lists longer than this get a search field in the area picker. */
const AREA_SEARCH_THRESHOLD = 6;

const areaMeta = (loc: LocationMaster) => [loc.code, loc.department].filter(Boolean).join(' · ');

/**
 * Area selector: shows the chosen area; "Change" opens a searchable list (bounded height, scrolls) of all areas.
 */
export const AreaPicker: React.FC<{
  locations: LocationMaster[];
  selectedId: string;
  onSelect: (id: string) => void;
  invalid?: boolean;
}> = ({ locations, selectedId, onSelect, invalid }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = locations.find((l) => l.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter(
      (l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q) || l.department.toLowerCase().includes(q),
    );
  }, [locations, query]);

  if (locations.length === 0) {
    return <InlineMessage tone="warning" message="No areas are available. Connect to the internet and refresh to load your areas." />;
  }

  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={selected ? `Area: ${selected.name}. ${open ? 'Hide area list' : 'Change area'}` : 'Choose an area'}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.areaSelected, invalid && { borderColor: COLORS.danger }, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="location-outline" size={20} color={COLORS.primary} />
        <View style={{ flex: 1 }}>
          {selected ? (
            <>
              <Text style={styles.areaName} numberOfLines={2}>
                {selected.name}
              </Text>
              {areaMeta(selected) ? <Text style={styles.areaMeta}>{areaMeta(selected)}</Text> : null}
            </>
          ) : (
            <Text style={[styles.areaName, { color: COLORS.textMuted }]}>Choose an area</Text>
          )}
        </View>
        <Text style={styles.areaChange}>{open ? 'Done' : 'Change'}</Text>
      </Pressable>

      {open && (
        <View style={styles.areaList}>
          {locations.length > AREA_SEARCH_THRESHOLD && (
            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="Search by area name or code"
              returnKeyType="search"
              autoCorrect={false}
              style={styles.areaSearch}
              accessibilityLabel="Search areas"
            />
          )}
          <ScrollView style={styles.areaScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {filtered.length === 0 ? (
              <Text style={styles.areaEmpty}>No area matches “{query.trim()}”.</Text>
            ) : (
              filtered.map((loc) => {
                const active = loc.id === selectedId;
                return (
                  <Pressable
                    key={loc.id}
                    onPress={() => {
                      onSelect(loc.id);
                      setOpen(false);
                      setQuery('');
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={loc.name}
                    style={({ pressed }) => [styles.areaOption, active && styles.areaOptionActive, pressed && { opacity: 0.8 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.areaOptionName, active && { color: COLORS.primary }]} numberOfLines={2}>
                        {loc.name}
                      </Text>
                      {areaMeta(loc) ? <Text style={styles.areaMeta}>{areaMeta(loc)}</Text> : null}
                    </View>
                    {active ? <Ionicons name="checkmark" size={20} color={COLORS.primary} /> : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

/** Horizontal group of wrapping option chips with a visible label for screen readers. */
export const ChipGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => <View style={styles.chipGroup}>{children}</View>;

const styles = StyleSheet.create({
  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonNeutral: { backgroundColor: COLORS.cardSecondary },
  backdrop: { flex: 1, backgroundColor: 'rgba(29, 39, 51, 0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    flexShrink: 1,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.borderDark,
    marginTop: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.screen,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { ...TYPE.title, color: COLORS.textDark },
  subtitle: { ...TYPE.caption, color: COLORS.textMedium, marginTop: 2 },
  body: { flexShrink: 1 },
  bodyFill: { flexGrow: 1 },
  bodyContent: { paddingHorizontal: SPACING.screen, paddingTop: SPACING.lg, paddingBottom: SPACING.lg },
  footer: {
    paddingHorizontal: SPACING.screen,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  message: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.lg,
  },
  messageTitle: { ...TYPE.label },
  messageText: { ...TYPE.caption, fontSize: 13, lineHeight: 18 },
  areaSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 56,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    backgroundColor: COLORS.card,
  },
  areaName: { ...TYPE.bodyStrong, color: COLORS.textDark },
  areaMeta: { ...TYPE.caption, color: COLORS.textMuted, marginTop: 2 },
  areaChange: { ...TYPE.label, color: COLORS.primaryLight },
  areaList: {
    marginTop: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardSecondary,
    padding: SPACING.sm,
  },
  areaSearch: { marginBottom: SPACING.sm },
  areaScroll: { maxHeight: 264 },
  areaEmpty: { ...TYPE.caption, color: COLORS.textMedium, padding: SPACING.md, textAlign: 'center' },
  areaOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: TOUCH_TARGET + 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.card,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  areaOptionActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  areaOptionName: { ...TYPE.body, color: COLORS.textDark },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
});

/** Badge tone for an area's latest audit score band (same bands as LocationMaster.status). */
export const areaScoreTone = (status: LocationMaster['status']): 'success' | 'warning' | 'danger' | 'neutral' =>
  status === 'OPTIMAL' ? 'success' : status === 'ATTENTION' ? 'warning' : status === 'CRITICAL' ? 'danger' : 'neutral';
