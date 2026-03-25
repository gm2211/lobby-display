/**
 * Server-side theme CSS injection.
 *
 * Generates a <style> block with CSS custom properties matching exactly
 * what ThemeCSSInjector sets client-side, so the browser has correct
 * theme colors on first paint (no flash-of-wrong-color).
 *
 * Uses an in-memory cache with 60s TTL. Call invalidateThemeCache()
 * after config saves or snapshot publishes.
 */
import prisma from './db.js';
import { loadTheme } from '../shared/theme/registry.js';
import { generatePalette } from '../shared/theme/colorUtils.js';
import type { TenantTheme, ThemeColors } from '../shared/theme/types.js';

interface CacheEntry {
  styleBlock: string;
  dashboardTitle: string;
  expiresAt: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 60_000;

export function invalidateThemeCache(): void {
  cache = null;
}

function applyConfigOverrides(
  base: TenantTheme,
  colorPrimary?: string | null,
  colorSecondary?: string | null,
  fontFamily?: string | null,
): { colors: ThemeColors; fontFamily: string } {
  const colors = { ...base.colors };

  if (colorPrimary) {
    const p = generatePalette(colorPrimary);
    const keys: (keyof ThemeColors)[] = [
      'primary50','primary100','primary200','primary300','primary400',
      'primary500','primary600','primary700','primary800','primary900',
    ];
    const shades = ['50','100','200','300','400','500','600','700','800','900'];
    keys.forEach((k, i) => { colors[k] = p[shades[i]]; });
    colors.headerGradientStart = p['500'];
    colors.headerGradientEnd = p['700'];
  }

  if (colorSecondary) {
    const s = generatePalette(colorSecondary);
    const keys: (keyof ThemeColors)[] = [
      'secondary50','secondary100','secondary200','secondary300','secondary400',
      'secondary500','secondary600','secondary700','secondary800','secondary900',
    ];
    const shades = ['50','100','200','300','400','500','600','700','800','900'];
    keys.forEach((k, i) => { colors[k] = s[shades[i]]; });
  }

  return {
    colors,
    fontFamily: fontFamily || base.fontFamily,
  };
}

function buildStyleBlock(colors: ThemeColors, fontFamily: string): string {
  const vars = [
    // Primary palette
    `--theme-color-primary-50: ${colors.primary50}`,
    `--theme-color-primary-100: ${colors.primary100}`,
    `--theme-color-primary-200: ${colors.primary200}`,
    `--theme-color-primary-300: ${colors.primary300}`,
    `--theme-color-primary-400: ${colors.primary400}`,
    `--theme-color-primary-500: ${colors.primary500}`,
    `--theme-color-primary-600: ${colors.primary600}`,
    `--theme-color-primary-700: ${colors.primary700}`,
    `--theme-color-primary-800: ${colors.primary800}`,
    `--theme-color-primary-900: ${colors.primary900}`,
    // Secondary palette
    `--theme-color-secondary-50: ${colors.secondary50}`,
    `--theme-color-secondary-100: ${colors.secondary100}`,
    `--theme-color-secondary-200: ${colors.secondary200}`,
    `--theme-color-secondary-300: ${colors.secondary300}`,
    `--theme-color-secondary-400: ${colors.secondary400}`,
    `--theme-color-secondary-500: ${colors.secondary500}`,
    `--theme-color-secondary-600: ${colors.secondary600}`,
    `--theme-color-secondary-700: ${colors.secondary700}`,
    `--theme-color-secondary-800: ${colors.secondary800}`,
    `--theme-color-secondary-900: ${colors.secondary900}`,
    // Neutral palette
    `--theme-color-neutral-50: ${colors.neutral50}`,
    `--theme-color-neutral-100: ${colors.neutral100}`,
    `--theme-color-neutral-200: ${colors.neutral200}`,
    `--theme-color-neutral-300: ${colors.neutral300}`,
    `--theme-color-neutral-400: ${colors.neutral400}`,
    `--theme-color-neutral-500: ${colors.neutral500}`,
    `--theme-color-neutral-600: ${colors.neutral600}`,
    `--theme-color-neutral-700: ${colors.neutral700}`,
    `--theme-color-neutral-800: ${colors.neutral800}`,
    `--theme-color-neutral-900: ${colors.neutral900}`,
    // Status colors
    `--theme-color-success: ${colors.success}`,
    `--theme-color-warning: ${colors.warning}`,
    `--theme-color-error: ${colors.error}`,
    `--theme-color-info: ${colors.info}`,
    // Backgrounds & surfaces
    `--theme-color-page-bg: ${colors.pageBg}`,
    `--theme-color-surface: ${colors.surface}`,
    `--theme-color-surface-hover: ${colors.surfaceHover}`,
    // Semantic surface aliases
    `--theme-bg-page: ${colors.pageBg}`,
    `--theme-bg-surface: ${colors.surface}`,
    `--theme-bg-subtle: ${colors.surfaceHover}`,
    `--theme-bg-muted: ${colors.neutral50}`,
    // Accent aliases
    `--theme-accent: ${colors.primary500}`,
    `--theme-accent-hover: ${colors.primary600}`,
    `--theme-accent-primary: ${colors.primary500}`,
    `--theme-accent-secondary: ${colors.secondary500}`,
    // Header gradient
    `--theme-header-gradient-start: ${colors.headerGradientStart}`,
    `--theme-header-gradient-end: ${colors.headerGradientEnd}`,
    // Font family
    `--theme-font-family: ${fontFamily}`,
  ];

  return `<style id="server-theme">:root { ${vars.join('; ')} }</style>`;
}

async function generateThemeData(): Promise<CacheEntry> {
  const config = await prisma.buildingConfig.findFirst();
  const themePreset = config?.themePreset || 'default';
  const baseTheme = loadTheme(themePreset);

  const { colors, fontFamily } = applyConfigOverrides(
    baseTheme,
    config?.colorPrimary,
    config?.colorSecondary,
    config?.fontFamily,
  );

  const styleBlock = buildStyleBlock(colors, fontFamily);
  const dashboardTitle = config?.dashboardTitle || 'Building Updates';

  return {
    styleBlock,
    dashboardTitle,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

export async function getThemeStyleBlock(): Promise<string> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.styleBlock;
  }
  cache = await generateThemeData();
  return cache.styleBlock;
}

export async function getDashboardTitle(): Promise<string> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.dashboardTitle;
  }
  cache = await generateThemeData();
  return cache.dashboardTitle;
}
