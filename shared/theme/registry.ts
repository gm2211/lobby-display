import { seventy7HudsonTheme } from './themes/77-hudson';
import { defaultTheme } from './themes/default';
import type { TenantTheme } from './types';

const themes: Record<string, TenantTheme> = {
  '77-hudson': seventy7HudsonTheme,
  'default': defaultTheme,
};

/**
 * Theme used when nothing is configured (fresh database, empty
 * BuildingConfig.themePreset). Matches production 77 Hudson so a new
 * environment (e.g. staging after a DB reset) looks like prod.
 */
export const DEFAULT_THEME_ID = '77-hudson';

export function loadTheme(themeId?: string): TenantTheme {
  const id = themeId || DEFAULT_THEME_ID;
  const theme = themes[id];
  if (!theme) {
    console.warn(`Theme "${id}" not found, falling back to ${DEFAULT_THEME_ID}`);
    return themes[DEFAULT_THEME_ID];
  }
  return theme;
}

export { themes };
