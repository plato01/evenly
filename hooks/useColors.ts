import { useColorScheme } from 'react-native';
import { useAppSelector } from '../store';
import { Colors } from '../constants/colors';

/**
 * Returns the full flat color set for the current theme.
 * Components should call this instead of importing Colors directly
 * so they react to light/dark/system changes.
 */
export const useColors = () => {
  const themeMode    = useAppSelector((s) => s.ui.themeMode);
  const deviceScheme = useColorScheme();

  // Midnight layers over dark (dark-family); Dream Haze layers over the light base
  if (themeMode === 'midnight')  return { ...Colors, ...Colors.dark, ...Colors.midnight } as unknown as typeof Colors;
  if (themeMode === 'dreamhaze') return { ...Colors, ...Colors.dreamhaze } as unknown as typeof Colors;
  if (themeMode === 'aquarave')  return { ...Colors, ...Colors.aquarave } as unknown as typeof Colors;

  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && deviceScheme === 'dark');

  if (!isDark) return Colors;

  return { ...Colors, ...Colors.dark } as unknown as typeof Colors;
};

export type AppColors = ReturnType<typeof useColors>;
