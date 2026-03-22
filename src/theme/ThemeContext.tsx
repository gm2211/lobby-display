/**
 * ThemeContext — Compile-time Theming with Runtime Overrides
 *
 * Provides the active TenantTheme to the component tree.
 * Uses the compile-time theme from VITE_THEME env var (or the default fallback),
 * with optional runtime overrides from BuildingConfig (colorPrimary, colorSecondary, fontFamily).
 *
 * RELATED FILES:
 * - src/theme/ThemeCSSInjector.tsx - injects CSS custom properties
 * - shared/theme/types.ts         - TenantTheme interface
 * - shared/theme/registry.ts      - loadTheme()
 * - shared/theme/colorUtils.ts    - generatePalette()
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { loadTheme } from '../../shared/theme/registry';
import type { TenantTheme, ThemeColors } from '../../shared/theme/types';
import { generatePalette } from '../../shared/theme/colorUtils';

const themeId = import.meta.env.VITE_THEME as string | undefined;
const compiledTheme = loadTheme(themeId);

const ThemeContext = createContext<TenantTheme | null>(null);

export interface ThemeOverrides {
  colorPrimary?: string;
  colorSecondary?: string;
  fontFamily?: string;
}

function applyOverrides(base: TenantTheme, overrides: ThemeOverrides): TenantTheme {
  const colors = { ...base.colors };

  if (overrides.colorPrimary) {
    const p = generatePalette(overrides.colorPrimary);
    const keys: (keyof ThemeColors)[] = ['primary50','primary100','primary200','primary300','primary400','primary500','primary600','primary700','primary800','primary900'];
    const shades = ['50','100','200','300','400','500','600','700','800','900'];
    keys.forEach((k, i) => { colors[k] = p[shades[i]]; });
    colors.headerGradientStart = p['500'];
    colors.headerGradientEnd = p['700'];
  }

  if (overrides.colorSecondary) {
    const s = generatePalette(overrides.colorSecondary);
    const keys: (keyof ThemeColors)[] = ['secondary50','secondary100','secondary200','secondary300','secondary400','secondary500','secondary600','secondary700','secondary800','secondary900'];
    const shades = ['50','100','200','300','400','500','600','700','800','900'];
    keys.forEach((k, i) => { colors[k] = s[shades[i]]; });
  }

  return {
    ...base,
    colors,
    fontFamily: overrides.fontFamily || base.fontFamily,
  };
}

export function ThemeProvider({ children, theme, overrides }: { children: ReactNode; theme?: TenantTheme; overrides?: ThemeOverrides }) {
  const baseTheme = theme ?? compiledTheme;

  const activeTheme = useMemo(
    () => overrides ? applyOverrides(baseTheme, overrides) : baseTheme,
    [baseTheme, overrides?.colorPrimary, overrides?.colorSecondary, overrides?.fontFamily]
  );

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
