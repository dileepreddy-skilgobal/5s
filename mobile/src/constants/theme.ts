/**
 * Design tokens for the mobile app. They match the SkilGlobal 5S web app (deep-blue brand, white surfaces,
 * cool-grey page) so both products look like one system. Screens use these tokens and the components in
 * src/components/ui; avoid hard-coded colours in screens.
 */
export const COLORS = {
  // Brand
  primary: '#004C8F', // SkilGlobal deep blue (web --c-primary)
  primaryDark: '#003B70',
  primaryLight: '#0072CE', // interactive blue (links, focus)
  primarySoft: '#F0F6FC', // pale blue surface for selected / highlighted items
  primaryBorder: '#C9DDF2',

  // Neutrals & surfaces
  background: '#F5F7FA', // page
  card: '#FFFFFF',
  cardSecondary: '#F3F5F8', // inset areas inside cards
  border: '#DCE3EB',
  borderDark: '#C3CDD8',

  // Text
  textDark: '#1D2733', // headings and primary text
  textMedium: '#596579', // body / secondary text
  textMuted: '#8792A2', // hints, placeholders, captions
  textInverse: '#FFFFFF',

  // Feedback
  success: '#0F7B4F',
  successSoft: '#E8F6EF',
  successBorder: '#B6E2CB',
  warning: '#8F5D12',
  warningSoft: '#FDF4E3',
  warningBorder: '#F1D59D',
  danger: '#C2312A',
  dangerSoft: '#FDEDEC',
  dangerBorder: '#F5C2BF',
  info: '#004C8F',
  infoSoft: '#E8F1FA',
  infoBorder: '#C9DDF2',

  // Status badges (kept for existing callers)
  statusActiveExecution: { bg: '#E8F1FA', text: '#004C8F', border: '#C9DDF2', label: 'In progress' },
  statusInProgress: { bg: '#FDF4E3', text: '#8F5D12', border: '#F1D59D', label: 'In progress' },
  statusScheduled: { bg: '#E8F1FA', text: '#004C8F', border: '#C9DDF2', label: 'Scheduled' },
  statusCompleted: { bg: '#E8F6EF', text: '#0F7B4F', border: '#B6E2CB', label: 'Completed' },
  statusCritical: { bg: '#FDEDEC', text: '#C2312A', border: '#F5C2BF', label: 'Critical' },

  // 5S pillar accents (used sparingly: small dots / chips)
  s1_sort: '#C2312A',
  s2_setInOrder: '#C25E12',
  s3_shine: '#A07A00',
  s4_standardize: '#004C8F',
  s5_sustain: '#0F7B4F',
  s6_safety: '#6B3FA0',
};

/** 4-point spacing scale; screens use 16 horizontal padding and 12–16 between cards. */
export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  screen: 16,
};

/** Type scale. Weights stay at 400–700 (no 800/900) for a calm, readable interface. */
export const TYPE = {
  display: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  subheading: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' as const },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  captionStrong: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const },
};

export const SHADOWS = {
  soft: {
    shadowColor: '#1D2733',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  card: {
    shadowColor: '#1D2733',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  floating: {
    shadowColor: '#004C8F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  nav: {
    shadowColor: '#1D2733',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 8,
  },
};

export const RADIUS = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  pill: 9999,
};

/** Minimum touch target (Apple HIG 44pt / Material 48dp). */
export const TOUCH_TARGET = 44;

/** Space reserved at the bottom of scrolling screens so content clears the bottom navigation bar. */
export const BOTTOM_NAV_CLEARANCE = 96;
