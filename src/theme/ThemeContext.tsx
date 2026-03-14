/**
 * ThemeContext — Compile-time Theming
 *
 * Provides the active TenantTheme to the component tree.
 * Uses the compile-time theme from VITE_THEME env var (or the default fallback).
 *
 * RELATED FILES:
 * - src/theme/ThemeCSSInjector.tsx - injects CSS custom properties
 * - shared/theme/types.ts         - TenantTheme interface
 * - shared/theme/registry.ts      - loadTheme()
 */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { loadTheme } from '../../shared/theme/registry';
import type { TenantTheme } from '../../shared/theme/types';

const themeId = import.meta.env.VITE_THEME as string | undefined;
const compiledTheme = loadTheme(themeId);

const ThemeContext = createContext<TenantTheme | null>(null);

export function ThemeProvider({ children, theme }: { children: ReactNode; theme?: TenantTheme }) {
  const [activeTheme] = useState<TenantTheme>(theme ?? compiledTheme);

  return (
    <ThemeContext.Provider value={activeTheme}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): TenantTheme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
