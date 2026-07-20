import { useAppSelector } from '../store';
import { FONT_FAMILIES, FontFamilyMap } from '../constants/fonts';

/**
 * Returns the active FontFamily map based on the user's font preference.
 * Use this instead of importing FontFamily directly for dynamic font switching.
 */
export const useFont = (): FontFamilyMap => {
  const fontFamilyId = useAppSelector((s) => s.ui.fontFamily);
  return FONT_FAMILIES[fontFamilyId].family;
};
