import { createContext, useContext, type ReactNode } from 'react';
import { loadTheme } from '../../shared/theme/registry';
import type { TenantTheme } from '../../shared/theme/types';

const themeId = import.meta.env.VITE_THEME as string | undefined;
const defaultTheme = loadTheme(themeId);

const ThemeContext = createContext<TenantTheme | null>(null);

export function ThemeProvider({ children, theme }: { children: ReactNode; theme?: TenantTheme }) {
  return (
    <ThemeContext.Provider value={theme ?? defaultTheme}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): TenantTheme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
