export const Colors = {
  // Brand
  primary: '#F43F5E',        // coral (bold + energetic)
  primaryDark: '#E11D48',
  primaryLight: '#FFF1F2',

  // Semantic
  success: '#16A34A',        // money = green
  warning: '#F59E0B',
  danger: '#DC2626',
  info: '#0284C7',

  // Accent
  accent: '#6366F1',         // subtle indigo

  // Balance
  owe: '#DC2626',            // you owe (red)
  owed: '#16A34A',           // you are owed (green)
  settled: '#94A3B8',        // settled (grey)

  // Neutral
  white: '#FFFFFF',
  black: '#000000',
  background: '#F6F8FA',     // soft neutral (not white)
  surface: '#FFFFFF',
  card: '#FFFFFF',
  border: '#E2E8F0',
  divider: '#E5E7EB',

  // Text
  textPrimary: '#0F172A',    // deep slate
  textSecondary: '#64748B',
  textMuted: '#64748B',
  textDisabled: '#94A3B8',
  textInverse: '#FFFFFF',

  // Overlay
  overlay: 'rgba(0,0,0,0.3)',

  // Dark mode — premium palette
  dark: {
    background:    '#0B0D12',        // deeper, richer black
    surface:       '#181B23',
    card:          '#1E2130',
    border:        '#2E3240',
    divider:       '#252830',
    textPrimary:   '#E6E8EB',        // slightly soft white
    textSecondary: '#9AA0A6',
    textMuted:     '#9AA0A6',
    textDisabled:  '#5F6368',
    textInverse:   '#0B0D12',
    primary:       '#6C5CE7',        // premium deep purple
    primaryLight:  '#8B7CF5',
    accent:        '#C084FC',        // subtle purple luxury feel
    success:       '#4ADE80',
    warning:       '#FBBF24',
    error:         '#F87171',
    info:          '#60A5FA',
    overlay:       'rgba(0,0,0,0.6)',
  },

  // Midnight Soft — gen x soft club, dark variant: violet base, glowing pastels
  // (palette source: user's curated swatches — #2E2A4F #4A3F7A #8F7BE8 #F2A6D8 #66E0FF)
  midnight: {
    background:    '#211D3A',
    surface:       '#2E2A4F',
    card:          '#393262',
    border:        '#4A3F7A',
    divider:       '#3A3560',
    textPrimary:   '#FDFBFF',
    textSecondary: '#B8A6E8',
    textMuted:     '#9E99C9',
    textDisabled:  '#5E5A8F',
    textInverse:   '#211D3A',
    primary:       '#8F7BE8',        // lilac
    primaryDark:   '#5E5A8F',
    primaryLight:  '#B8A6E8',
    accent:        '#66E0FF',        // cyan pop
    success:       '#7FE3D4',
    warning:       '#DAFF47',        // acid lime
    danger:        '#F2A6D8',        // pastel pink reads "attention" here
    error:         '#F2A6D8',
    info:          '#66E0FF',
    owe:           '#F2A6D8',
    owed:          '#7FE3D4',        // mint
    settled:       '#9E99C9',
    overlay:       'rgba(20,16,40,0.65)',
  },

  // Dream Haze — gen x soft club, signature light look: pastel lavender haze
  // (palette source: user's curated swatches — #E6D9FF #C7CEFF #BFE8FF #FFD9EC #FDFBFF)
  dreamhaze: {
    background:    '#FDFBFF',
    surface:       '#FFFFFF',
    card:          '#F3F0FF',
    border:        '#E6D9FF',
    divider:       '#EDE7FB',
    textPrimary:   '#2E2A4F',
    textSecondary: '#5E5A8F',
    textMuted:     '#7C78B0',
    textDisabled:  '#A9A5CE',
    textInverse:   '#FDFBFF',
    primary:       '#8E8AD8',        // lilac chrome
    primaryDark:   '#5E5A8F',
    primaryLight:  '#C7CEFF',
    accent:        '#66E0FF',
    success:       '#1FA588',        // darkened mint for light-bg contrast
    warning:       '#C9922E',
    danger:        '#D95E9F',        // darkened pastel pink
    error:         '#D95E9F',
    info:          '#4A9DBF',
    owe:           '#D95E9F',
    owed:          '#1FA588',
    settled:       '#A6B8C7',
    overlay:       'rgba(46,42,79,0.35)',
  },

  // Aqua Rave — gen x soft club, mint light variant with one acid pop
  // (palette source: user's curated swatches — #B0F2E6 #7FE3D4 #C9F5B5 #DAFF47 #EFFBF7)
  aquarave: {
    background:    '#EFFBF7',
    surface:       '#FFFFFF',
    card:          '#DFF7EE',
    border:        '#B0F2E6',
    divider:       '#D7F3EA',
    textPrimary:   '#123A32',
    textSecondary: '#2E6B5E',
    textMuted:     '#5B8A7F',
    textDisabled:  '#93BBB1',
    textInverse:   '#EFFBF7',
    primary:       '#17A08B',        // mint darkened for contrast on white
    primaryDark:   '#0E7A69',
    primaryLight:  '#7FE3D4',
    accent:        '#DAFF47',        // the acid pop
    success:       '#1FA588',
    warning:       '#C9922E',
    danger:        '#D9646C',        // derived — palette has no red
    error:         '#D9646C',
    info:          '#3E9FB0',
    owe:           '#D9646C',
    owed:          '#1FA588',
    settled:       '#8FB5AB',
    overlay:       'rgba(18,58,50,0.35)',
  },

  // Category colors
  category: {
    food: '#FF6B6B',
    transport: '#4ECDC4',
    utilities: '#45B7D1',
    entertainment: '#96CEB4',
    rent: '#FECA57',
    groceries: '#FF9FF3',
    medical: '#54A0FF',
    shopping: '#5F27CD',
    travel: '#00D2D3',
    other: '#C8D6E5',
  },

  // Group type colors
  groupType: {
    home: '#FF6B6B',
    trip: '#4ECDC4',
    couple: '#FF9FF3',
    other: '#C8D6E5',
  },
} as const;

export type ColorKey = keyof typeof Colors;
