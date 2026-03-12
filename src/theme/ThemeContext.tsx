/**
 * ThemeContext — Runtime Theming
 *
 * Provides the active TenantTheme to the component tree.
 *
 * STRATEGY:
 * 1. Immediately supply the compile-time default theme (from VITE_THEME env var
 *    or the 'renzo-default' fallback) so the UI is never unstyled.
 * 2. On mount, fetch /api/platform/branding (public endpoint).
 * 3. Merge the API response *over* the compile-time theme (API wins for any
 *    key it provides; compile-time stays as fallback for missing keys).
 * 4. The merged theme replaces the context value, triggering a single re-render.
 *    ThemeCSSInjector will pick up the new colors and inject updated CSS vars.
 *
 * RELATED FILES:
 * - src/theme/ThemeCSSInjector.tsx     - injects CSS custom properties
 * - shared/theme/types.ts              - TenantTheme interface
 * - shared/theme/registry.ts           - loadTheme()
 * - server/routes/platform/branding.ts - API that this context fetches
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadTheme } from '../../shared/theme/registry';
import type { TenantTheme, ThemeColors } from '../../shared/theme/types';

const themeId = import.meta.env.VITE_THEME as string | undefined;
const compiledTheme = loadTheme(themeId);

/** Shape returned by GET /api/platform/branding */
interface BrandingApiResponse {
  buildingName?: string;
  portalTitle?: string;
  sidebarBrandText?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  welcomeMessage?: string;
}

/* ------------------------------------------------------------------
 * Color utilities: hex <-> HSL conversion and palette generation
 * ------------------------------------------------------------------ */

/** Parse a hex color string (3 or 6 digit) into { r, g, b } in 0-255. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/** Convert RGB (0-255) to HSL (h: 0-360, s: 0-1, l: 0-1). */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

/** Convert HSL (h: 0-360, s: 0-1, l: 0-1) back to a hex string. */
function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hn = h / 360;
    r = hue2rgb(p, q, hn + 1 / 3);
    g = hue2rgb(p, q, hn);
    b = hue2rgb(p, q, hn - 1 / 3);
  }
  const toHex = (n: number) => {
    const val = Math.round(n * 255);
    return val.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Generate a 10-shade palette (50, 100, ..., 900) from a single base hex color.
 *
 * The base color becomes the 500 shade. Lighter shades increase lightness toward
 * ~95%, darker shades decrease toward ~10%, preserving hue and saturation.
 */
function generatePalette(baseHex: string): Record<string, string> {
  const { r, g, b } = hexToRgb(baseHex);
  const { h, s } = rgbToHsl(r, g, b);

  // Lightness values for each shade — 50 is very light, 900 is very dark
  const shadeLightness: Record<string, number> = {
    '50':  0.95,
    '100': 0.88,
    '200': 0.78,
    '300': 0.65,
    '400': 0.53,
    '500': 0.40,  // will be overridden below for accuracy
    '600': 0.33,
    '700': 0.25,
    '800': 0.18,
    '900': 0.10,
  };

  // Use the actual lightness from the base color for 500
  const { l: baseLightness } = rgbToHsl(r, g, b);
  shadeLightness['500'] = baseLightness;

  const palette: Record<string, string> = {};
  for (const [shade, lightness] of Object.entries(shadeLightness)) {
    // For lighter shades, reduce saturation slightly to avoid neon appearance
    const adjSat = Number(shade) < 300 ? s * 0.6 : s;
    palette[shade] = hslToHex(h, adjSat, lightness);
  }

  return palette;
}

/**
 * Merge branding API response over the compile-time theme.
 * Only the fields that the API explicitly provides are overridden.
 *
 * When primaryColor or accentColor are provided, the full shade palette
 * (50-900) is regenerated from the base color so that all CSS variables
 * update end-to-end.
 */
function mergeApiBranding(base: TenantTheme, api: BrandingApiResponse): TenantTheme {
  // Build the color overrides
  let colorOverrides: Partial<ThemeColors> = {};

  if (api.primaryColor) {
    const palette = generatePalette(api.primaryColor);
    colorOverrides = {
      ...colorOverrides,
      primary50:  palette['50'],
      primary100: palette['100'],
      primary200: palette['200'],
      primary300: palette['300'],
      primary400: palette['400'],
      primary500: palette['500'],
      primary600: palette['600'],
      primary700: palette['700'],
      primary800: palette['800'],
      primary900: palette['900'],
      headerGradientStart: palette['500'],
      headerGradientEnd:   palette['800'],
    };
  }

  if (api.accentColor) {
    const palette = generatePalette(api.accentColor);
    colorOverrides = {
      ...colorOverrides,
      secondary50:  palette['50'],
      secondary100: palette['100'],
      secondary200: palette['200'],
      secondary300: palette['300'],
      secondary400: palette['400'],
      secondary500: palette['500'],
      secondary600: palette['600'],
      secondary700: palette['700'],
      secondary800: palette['800'],
      secondary900: palette['900'],
    };
  }

  return {
    ...base,
    buildingName:     api.buildingName     ?? base.buildingName,
    portalTitle:      api.portalTitle      ?? base.portalTitle,
    htmlTitle:        api.buildingName     ?? base.htmlTitle,
    sidebarBrandText: api.sidebarBrandText ?? base.sidebarBrandText,
    loginBrandText:   api.buildingName     ?? base.loginBrandText,
    logoUrl:          api.logoUrl          ?? base.logoUrl,
    welcomeMessage:   api.welcomeMessage   ?? base.welcomeMessage,
    colors: {
      ...base.colors,
      ...colorOverrides,
    },
  };
}

const ThemeContext = createContext<TenantTheme | null>(null);

export function ThemeProvider({ children, theme }: { children: ReactNode; theme?: TenantTheme }) {
  // Start with the compile-time theme immediately (no flash of unstyled content)
  const [activeTheme, setActiveTheme] = useState<TenantTheme>(theme ?? compiledTheme);

  useEffect(() => {
    // If a theme was explicitly passed in, skip the API fetch
    if (theme) return;

    let cancelled = false;
    fetch('/api/platform/branding', { credentials: 'same-origin' })
      .then(r => {
        if (!r.ok) throw new Error(`Branding API ${r.status}`);
        return r.json() as Promise<BrandingApiResponse>;
      })
      .then(api => {
        if (!cancelled) {
          setActiveTheme(mergeApiBranding(compiledTheme, api));
        }
      })
      .catch(err => {
        // Non-fatal: stay with compile-time theme
        console.warn('[ThemeContext] Failed to load runtime branding, using compile-time defaults:', err);
      });

    return () => { cancelled = true; };
  }, [theme]);

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
