import React, { createContext, useCallback, useContext } from 'react';
import { useAppDispatch } from '../../store';
import { setThemeMode, ThemeMode } from '../../store/slices/uiSlice';
import { storage } from '../../services/storage';
import { StorageKeys } from '../../constants/storageKeys';

interface ThemeTransitionContextValue {
  switchTheme: (mode: ThemeMode) => void;
}

const ThemeTransitionContext = createContext<ThemeTransitionContextValue>({
  switchTheme: () => {},
});

export const useThemeTransition = () => useContext(ThemeTransitionContext);

export const ThemeTransitionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dispatch = useAppDispatch();

  const switchTheme = useCallback((mode: ThemeMode) => {
    dispatch(setThemeMode(mode));
    storage.set(StorageKeys.THEME_MODE, mode);
  }, [dispatch]);

  return (
    <ThemeTransitionContext.Provider value={{ switchTheme }}>
      {children}
    </ThemeTransitionContext.Provider>
  );
};
