import { useEffect } from 'react';
import type { BuildingConfig } from '../types';
import { generatePalette } from '../../shared/theme/colorUtils';
import { useTheme } from './ThemeContext';

/**
 * Overrides CSS custom properties when BuildingConfig has runtime color/font overrides.
 * Render this inside any page that has access to config.
 * Works alongside ThemeCSSInjector — this runs after and overwrites specific vars.
 */
export function RuntimeThemeOverride({ config }: { config: BuildingConfig | null }) {
  const theme = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const primary = config?.colorPrimary;
    const secondary = config?.colorSecondary;
    const fontFamily = config?.fontFamily;

    if (primary) {
      const p = generatePalette(primary);
      for (const [shade, hex] of Object.entries(p)) {
        root.style.setProperty(`--theme-color-primary-${shade}`, hex);
      }
      root.style.setProperty('--theme-header-gradient-start', p['500']);
      root.style.setProperty('--theme-header-gradient-end', p['700']);
      root.style.setProperty('--theme-accent', p['500']);
      root.style.setProperty('--theme-accent-hover', p['600']);
      root.style.setProperty('--theme-accent-primary', p['500']);
    }

    if (secondary) {
      const s = generatePalette(secondary);
      for (const [shade, hex] of Object.entries(s)) {
        root.style.setProperty(`--theme-color-secondary-${shade}`, hex);
      }
      root.style.setProperty('--theme-accent-secondary', s['500']);
    }

    if (fontFamily) {
      root.style.setProperty('--theme-font-family', fontFamily);
    }

    // Cleanup: restore theme defaults when config changes or unmounts
    return () => {
      const { colors } = theme;
      const shades = ['50','100','200','300','400','500','600','700','800','900'];

      if (primary) {
        const pKeys = ['primary50','primary100','primary200','primary300','primary400','primary500','primary600','primary700','primary800','primary900'] as const;
        shades.forEach((s, i) => root.style.setProperty(`--theme-color-primary-${s}`, colors[pKeys[i]]));
        root.style.setProperty('--theme-header-gradient-start', colors.headerGradientStart);
        root.style.setProperty('--theme-header-gradient-end', colors.headerGradientEnd);
        root.style.setProperty('--theme-accent', colors.primary500);
        root.style.setProperty('--theme-accent-hover', colors.primary600);
        root.style.setProperty('--theme-accent-primary', colors.primary500);
      }
      if (secondary) {
        const sKeys = ['secondary50','secondary100','secondary200','secondary300','secondary400','secondary500','secondary600','secondary700','secondary800','secondary900'] as const;
        shades.forEach((s, i) => root.style.setProperty(`--theme-color-secondary-${s}`, colors[sKeys[i]]));
        root.style.setProperty('--theme-accent-secondary', colors.secondary500);
      }
      if (fontFamily) {
        root.style.setProperty('--theme-font-family', theme.fontFamily);
      }
    };
  }, [config?.colorPrimary, config?.colorSecondary, config?.fontFamily, theme]);

  return null;
}
