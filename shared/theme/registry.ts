import { seventy7HudsonTheme } from './themes/77-hudson';
import { defaultTheme } from './themes/default';
import type { TenantTheme } from './types';

const themes: Record<string, TenantTheme> = {
  '77-hudson': seventy7HudsonTheme,
  'default': defaultTheme,
};

export function loadTheme(themeId?: string): TenantTheme {
  const id = themeId ?? 'default';
  const theme = themes[id];
  if (!theme) {
    console.warn(`Theme "${id}" not found, falling back to default`);
    return themes['default'];
  }
  return theme;
}

export { themes };
