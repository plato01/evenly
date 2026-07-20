import { useColorScheme } from 'react-native';
import { Theme, ThemeType } from '../constants/theme';

export const useAppTheme = (): ThemeType => {
  const scheme = useColorScheme();
  return scheme === 'dark' ? Theme.dark : Theme.light;
};
