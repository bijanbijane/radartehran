import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeMode, getThemeTokens, ThemeDefinition } from '../../design-system';

export interface ThemeContextValue {
  mode: ThemeMode;
  tokens: ThemeDefinition;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  tokens: getThemeTokens('dark'),
  setMode: () => undefined,
  toggleMode: () => undefined,
});

export const ThemeProvider: React.FC<{
  initialMode?: ThemeMode;
  children: React.ReactNode;
}> = ({ initialMode = 'dark', children }) => {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('light-mode', mode === 'light');
      document.documentElement.classList.toggle('dark', mode === 'dark');
    }
  }, [mode]);

  const toggleMode = () => setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider
      value={{
        mode,
        tokens: getThemeTokens(mode),
        setMode,
        toggleMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export function useAppTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
