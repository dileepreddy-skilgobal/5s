import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOWS, SPACING, TOUCH_TARGET, TYPE } from '../../constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { bg: string; text: string; border: string }> = {
  neutral: { bg: COLORS.cardSecondary, text: COLORS.textMedium, border: COLORS.border },
  info: { bg: COLORS.infoSoft, text: COLORS.info, border: COLORS.infoBorder },
  success: { bg: COLORS.successSoft, text: COLORS.success, border: COLORS.successBorder },
  warning: { bg: COLORS.warningSoft, text: COLORS.warning, border: COLORS.warningBorder },
  danger: { bg: COLORS.dangerSoft, text: COLORS.danger, border: COLORS.dangerBorder },
};

/** Title block at the top of a tab screen: title, optional one-line description and a right-hand action. */
export const ScreenHeader: React.FC<{ title: string; subtitle?: string; action?: React.ReactNode }> = ({ title, subtitle, action }) => (
  <View style={styles.screenHeader}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.screenTitle} accessibilityRole="header" numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
    </View>
    {action}
  </View>
);

/** White surface with a hairline border. Pass onPress to make the whole card tappable. */
export const Card: React.FC<{
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  padded?: boolean;
}> = ({ children, onPress, style, accessibilityLabel, padded = true }) => {
  const base = [styles.card, padded && styles.cardPadded, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [...base, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
};

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export const Button: React.FC<{
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'lg' | 'sm';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}> = ({ label, onPress, variant = 'primary', size = 'md', icon, loading, disabled, fullWidth, style, accessibilityLabel }) => {
  const v = BUTTON_VARIANTS[variant];
  const inactive = disabled || loading;
  const height = size === 'lg' ? 52 : size === 'sm' ? 36 : TOUCH_TARGET;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      hitSlop={size === 'sm' ? 4 : 0}
      style={({ pressed }) => [
        styles.button,
        { height, backgroundColor: v.bg, borderColor: v.border, paddingHorizontal: size === 'sm' ? 12 : 16 },
        fullWidth && { alignSelf: 'stretch' },
        inactive && styles.buttonDisabled,
        pressed && !inactive && { backgroundColor: v.pressed },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.text} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={v.text} /> : null}
          <Text style={[styles.buttonText, { color: v.text, fontSize: size === 'sm' ? 13 : 15 }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
};

const BUTTON_VARIANTS: Record<ButtonVariant, { bg: string; text: string; border: string; pressed: string }> = {
  primary: { bg: COLORS.primary, text: COLORS.textInverse, border: COLORS.primary, pressed: COLORS.primaryDark },
  secondary: { bg: COLORS.card, text: COLORS.primary, border: COLORS.borderDark, pressed: COLORS.primarySoft },
  ghost: { bg: 'transparent', text: COLORS.primary, border: 'transparent', pressed: COLORS.primarySoft },
  danger: { bg: COLORS.danger, text: COLORS.textInverse, border: COLORS.danger, pressed: '#A3271F' },
};

/** Selectable option pill (filters, single choice). */
export const Chip: React.FC<{ label: string; selected?: boolean; onPress: () => void; count?: number; tone?: Tone }> = ({
  label,
  selected,
  onPress,
  count,
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: !!selected }}
    hitSlop={{ top: 4, bottom: 4 }}
    style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && !selected && styles.pressed]}
  >
    <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
      {label}
      {count !== undefined ? ` (${count})` : ''}
    </Text>
  </Pressable>
);

/** Small status label. */
export const Badge: React.FC<{ label: string; tone?: Tone; icon?: IconName }> = ({ label, tone = 'neutral', icon }) => {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }]}>
      {icon ? <Ionicons name={icon} size={12} color={t.text} /> : null}
      <Text style={[styles.badgeText, { color: t.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

/** Section title inside a screen, with an optional count and a text action ("See all"). */
export const SectionHeader: React.FC<{ title: string; count?: number; actionLabel?: string; onAction?: () => void }> = ({
  title,
  count,
  actionLabel,
  onAction,
}) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {title}
      {count !== undefined ? <Text style={styles.sectionCount}>{`  ${count}`}</Text> : null}
    </Text>
    {actionLabel && onAction ? (
      <Pressable onPress={onAction} accessibilityRole="button" hitSlop={10}>
        <Text style={styles.sectionAction}>{actionLabel}</Text>
      </Pressable>
    ) : null}
  </View>
);

/** Label + control + hint / error for forms. */
export const FormField: React.FC<{ label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }> = ({
  label,
  required,
  hint,
  error,
  children,
}) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>
      {label}
      {required ? <Text style={{ color: COLORS.danger }}> *</Text> : null}
    </Text>
    {children}
    {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
  </View>
);

/** Text input with the app's field styling. */
export const TextField = React.forwardRef<TextInput, TextInputProps & { invalid?: boolean }>(({ style, invalid, multiline, ...props }, ref) => (
  <TextInput
    ref={ref}
    placeholderTextColor={COLORS.textMuted}
    multiline={multiline}
    style={[styles.input, multiline && styles.inputMultiline, invalid && { borderColor: COLORS.danger }, style]}
    {...props}
  />
));
TextField.displayName = 'TextField';

/** Friendly empty / error state with an optional action. */
export const EmptyState: React.FC<{ icon?: IconName; title: string; message?: string; actionLabel?: string; onAction?: () => void }> = ({
  icon = 'file-tray-outline',
  title,
  message,
  actionLabel,
  onAction,
}) => (
  <View style={styles.empty}>
    <View style={styles.emptyIcon}>
      <Ionicons name={icon} size={24} color={COLORS.primary} />
    </View>
    <Text style={styles.emptyTitle}>{title}</Text>
    {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
    {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" size="sm" style={{ marginTop: SPACING.md }} /> : null}
  </View>
);

/** Number tile for summaries (score, counts). Tappable when onPress is given. */
export const StatTile: React.FC<{ value: string; label: string; hint?: string; icon?: IconName; tone?: Tone; onPress?: () => void }> = ({
  value,
  label,
  hint,
  icon,
  tone = 'info',
  onPress,
}) => {
  const t = TONES[tone];
  const body = (
    <>
      <View style={styles.statTop}>
        <Text style={styles.statValue} numberOfLines={1}>
          {value}
        </Text>
        {icon ? (
          <View style={[styles.statIcon, { backgroundColor: t.bg }]}>
            <Ionicons name={icon} size={16} color={t.text} />
          </View>
        ) : null}
      </View>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
      {hint ? (
        <Text style={styles.statHint} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </>
  );
  if (!onPress) return <View style={styles.stat}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={({ pressed }) => [styles.stat, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
};

/** Label / value row used in detail cards. */
export const InfoRow: React.FC<{ label: string; value: React.ReactNode; icon?: IconName; last?: boolean }> = ({ label, value, icon, last }) => (
  <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
    <View style={styles.infoLabelWrap}>
      {icon ? <Ionicons name={icon} size={16} color={COLORS.textMuted} /> : null}
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
    {typeof value === 'string' ? (
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    ) : (
      value
    )}
  </View>
);

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.screen,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  screenTitle: { ...TYPE.display, color: COLORS.textDark },
  screenSubtitle: { ...TYPE.caption, color: COLORS.textMedium, marginTop: 2 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.soft,
  },
  cardPadded: { padding: SPACING.lg },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontWeight: '600' },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { ...TYPE.label, fontWeight: '500', color: COLORS.textMedium },
  chipTextSelected: { color: COLORS.textInverse, fontWeight: '600' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  badgeText: { ...TYPE.captionStrong },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
  },
  sectionTitle: { ...TYPE.heading, color: COLORS.textDark },
  sectionCount: { ...TYPE.label, color: COLORS.textMuted },
  sectionAction: { ...TYPE.label, color: COLORS.primaryLight },
  field: { marginBottom: SPACING.lg },
  fieldLabel: { ...TYPE.label, color: COLORS.textDark, marginBottom: 6 },
  fieldHint: { ...TYPE.caption, color: COLORS.textMuted, marginTop: 4 },
  fieldError: { ...TYPE.caption, color: COLORS.danger, marginTop: 4 },
  input: {
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...TYPE.body,
    color: COLORS.textDark,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  empty: { alignItems: 'center', paddingVertical: SPACING.xxxl, paddingHorizontal: SPACING.xl },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  emptyTitle: { ...TYPE.subheading, color: COLORS.textDark, textAlign: 'center' },
  emptyMessage: { ...TYPE.caption, color: COLORS.textMedium, textAlign: 'center', marginTop: 4, maxWidth: 300 },
  stat: {
    flex: 1,
    minWidth: 0,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOWS.soft,
  },
  statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.xs },
  statValue: { ...TYPE.title, color: COLORS.textDark, flexShrink: 1 },
  statIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statLabel: { ...TYPE.label, color: COLORS.textDark, marginTop: SPACING.xs },
  statHint: { ...TYPE.caption, color: COLORS.textMuted, marginTop: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md, paddingVertical: SPACING.md },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexShrink: 0 },
  infoLabel: { ...TYPE.body, color: COLORS.textMedium },
  infoValue: { ...TYPE.bodyStrong, color: COLORS.textDark, flexShrink: 1, textAlign: 'right' },
});
