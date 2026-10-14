export const COLORS = {
  // Primary Orange Theme from reference image
  primary: '#FF6433', // Vibrant delivery-style orange
  primaryDark: '#E04F1D',
  primaryLight: '#FF8860',
  primarySoft: '#FFF3EE', // Warm cream/peach background for hero/badges
  primaryBorder: '#FFD7C7',

  // Neutrals & Surfaces
  background: '#F8F9FB', // Warm iOS-style light gray background
  card: '#FFFFFF',
  cardSecondary: '#F4F5F7',
  border: '#EAECF0',
  borderDark: '#D0D5DD',

  // Text
  textDark: '#111827', // Bold charcoal headline text
  textMedium: '#4B5565', // Descriptive text
  textMuted: '#9AA4B2', // Subtitles & placeholders
  textInverse: '#FFFFFF',

  // Status & Badges
  statusActiveExecution: {
    bg: '#E8F8F0',
    text: '#0E9F6E',
    border: '#B7F4D8',
    label: 'In Progress',
  },
  statusInProgress: {
    bg: '#FFF8EB',
    text: '#D97706',
    border: '#FDE68A',
    label: 'In Progress',
  },
  statusScheduled: {
    bg: '#EFF8FF',
    text: '#175CD3',
    border: '#B2DDFF',
    label: 'Scheduled',
  },
  statusCompleted: {
    bg: '#ECFDF3',
    text: '#027A48',
    border: '#A6F4C5',
    label: 'Completed',
  },
  statusCritical: {
    bg: '#FEF3F2',
    text: '#D92D20',
    border: '#FECDCA',
    label: 'Critical Non-Conformance',
  },

  // 5S Pillar Colors
  s1_sort: '#EF4444',
  s2_setInOrder: '#F97316',
  s3_shine: '#EAB308',
  s4_standardize: '#3B82F6',
  s5_sustain: '#10B981',
};

export const SHADOWS = {
  soft: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  card: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  floating: {
    shadowColor: '#FF6433',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  nav: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 10,
  },
};

export const RADIUS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 9999,
};
