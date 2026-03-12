import { seventy7HudsonTheme } from './themes/77-hudson';
import { renzoDefaultTheme } from './themes/renzo-default';
import type { TenantTheme } from './types';

const themes: Record<string, TenantTheme> = {
  '77-hudson': seventy7HudsonTheme,
  'renzo-default': renzoDefaultTheme,
};

export function loadTheme(themeId?: string): TenantTheme {
  const id = themeId ?? 'renzo-default';
  const theme = themes[id];
  if (!theme) {
    console.warn(`Theme "${id}" not found, falling back to renzo-default`);
    return themes['renzo-default'];
  }
  return theme;
}

export { themes };
