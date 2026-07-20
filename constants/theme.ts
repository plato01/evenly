import { Colors } from './colors';
import { FontFamily, FontSize } from './fonts';

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const;

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

export const Theme = {
  light: {
    colors: {
      background: Colors.background,
      surface: Colors.surface,
      card: Colors.card,
      primary: Colors.primary,
      primaryLight: Colors.primaryLight,
      accent: Colors.accent,
      border: Colors.border,
      text: Colors.textPrimary,
      textSecondary: Colors.textSecondary,
      success: Colors.success,
      warning: Colors.warning,
      error: Colors.danger,
      info: Colors.info,
      overlay: Colors.overlay,
    },
    fonts: FontFamily,
    fontSize: FontSize,
    spacing: Spacing,
    borderRadius: BorderRadius,
    shadow: Shadow,
  },
  dark: {
    colors: {
      background: Colors.dark.background,
      surface: Colors.dark.surface,
      card: Colors.dark.card,
      primary: Colors.dark.primary,
      primaryLight: Colors.dark.primaryLight,
      accent: Colors.dark.accent,
      border: Colors.dark.border,
      text: Colors.dark.textPrimary,
      textSecondary: Colors.dark.textSecondary,
      success: Colors.dark.success,
      warning: Colors.dark.warning,
      error: Colors.dark.error,
      info: Colors.dark.info,
      overlay: Colors.dark.overlay,
    },
    fonts: FontFamily,
    fontSize: FontSize,
    spacing: Spacing,
    borderRadius: BorderRadius,
    shadow: Shadow,
  },
} as const;

export type ThemeType = typeof Theme.light;
