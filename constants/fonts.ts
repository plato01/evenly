export type FontFamilyId = 'inter' | 'raleway' | 'worksans';

export interface FontFamilyMap {
  regular: string;
  medium: string;
  semiBold: string;
  bold: string;
  extraBold: string;
  light: string;
}

export const FONT_FAMILIES: Record<FontFamilyId, { label: string; family: FontFamilyMap }> = {
  inter: {
    label: 'Inter',
    family: {
      regular:   'Inter-Regular',
      medium:    'Inter-Medium',
      semiBold:  'Inter-SemiBold',
      bold:      'Inter-Bold',
      extraBold: 'Inter-ExtraBold',
      light:     'Inter-Light',
    },
  },
  raleway: {
    label: 'Raleway',
    family: {
      regular:   'Raleway-Regular',
      medium:    'Raleway-Medium',
      semiBold:  'Raleway-SemiBold',
      bold:      'Raleway-Bold',
      extraBold: 'Raleway-ExtraBold',
      light:     'Raleway-Light',
    },
  },
  worksans: {
    label: 'Work Sans',
    family: {
      regular:   'WorkSans-Regular',
      medium:    'WorkSans-Medium',
      semiBold:  'WorkSans-SemiBold',
      bold:      'WorkSans-Bold',
      extraBold: 'WorkSans-ExtraBold',
      light:     'WorkSans-Light',
    },
  },
};

// Default — used as fallback and for static references
export const FontFamily = FONT_FAMILIES.inter.family;

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  '5xl': 40,
} as const;

export const LineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
} as const;

// Inter font assets
export const InterFontAssets = {
  'Inter-Regular':   require('../assets/fonts/Inter_18pt-Regular.ttf'),
  'Inter-Medium':    require('../assets/fonts/Inter_18pt-Medium.ttf'),
  'Inter-SemiBold':  require('../assets/fonts/Inter_18pt-SemiBold.ttf'),
  'Inter-Bold':      require('../assets/fonts/Inter_18pt-Bold.ttf'),
  'Inter-ExtraBold': require('../assets/fonts/Inter_18pt-ExtraBold.ttf'),
  'Inter-Light':     require('../assets/fonts/Inter_18pt-Light.ttf'),
  'Inter-Thin':      require('../assets/fonts/Inter_18pt-Thin.ttf'),
  'Inter-Black':     require('../assets/fonts/Inter_18pt-Black.ttf'),
  'Inter-Italic':    require('../assets/fonts/Inter_18pt-Italic.ttf'),
} as const;

// Raleway font assets
export const RalewayFontAssets = {
  'Raleway-Regular':   require('../assets/fonts 1/Raleway-Regular.ttf'),
  'Raleway-Medium':    require('../assets/fonts 1/Raleway-Medium.ttf'),
  'Raleway-SemiBold':  require('../assets/fonts 1/Raleway-SemiBold.ttf'),
  'Raleway-Bold':      require('../assets/fonts 1/Raleway-Bold.ttf'),
  'Raleway-ExtraBold': require('../assets/fonts 1/Raleway-ExtraBold.ttf'),
  'Raleway-Light':     require('../assets/fonts 1/Raleway-Light.ttf'),
  'Raleway-Thin':      require('../assets/fonts 1/Raleway-Thin.ttf'),
  'Raleway-Black':     require('../assets/fonts 1/Raleway-Black.ttf'),
  'Raleway-Italic':    require('../assets/fonts 1/Raleway-Italic.ttf'),
} as const;

// Work Sans font assets
export const WorkSansFontAssets = {
  'WorkSans-Regular':   require('../assets/fonts 2/WorkSans-Regular.ttf'),
  'WorkSans-Medium':    require('../assets/fonts 2/WorkSans-Medium.ttf'),
  'WorkSans-SemiBold':  require('../assets/fonts 2/WorkSans-SemiBold.ttf'),
  'WorkSans-Bold':      require('../assets/fonts 2/WorkSans-Bold.ttf'),
  'WorkSans-ExtraBold': require('../assets/fonts 2/WorkSans-ExtraBold.ttf'),
  'WorkSans-Light':     require('../assets/fonts 2/WorkSans-Light.ttf'),
  'WorkSans-Thin':      require('../assets/fonts 2/WorkSans-Thin.ttf'),
  'WorkSans-Black':     require('../assets/fonts 2/WorkSans-Black.ttf'),
  'WorkSans-Italic':    require('../assets/fonts 2/WorkSans-Italic.ttf'),
} as const;

// Combined — load all fonts at startup
export const FontAssets = {
  ...InterFontAssets,
  ...RalewayFontAssets,
  ...WorkSansFontAssets,
} as const;
