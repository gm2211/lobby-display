import { describe, it, expect } from 'vitest';
import { loadTheme, DEFAULT_THEME_ID } from '../../shared/theme/registry';

describe('theme registry defaults', () => {
  it('defaults to the 77 Hudson (teal) theme so a fresh DB matches prod', () => {
    expect(DEFAULT_THEME_ID).toBe('77-hudson');
    expect(loadTheme().id).toBe('77-hudson');
    expect(loadTheme('').id).toBe('77-hudson'); // BuildingConfig.themePreset defaults to ""
    expect(loadTheme().colors.primary500).toBe('#1a5c5a');
  });

  it('still honors an explicit preset', () => {
    expect(loadTheme('default').id).toBe('default');
  });

  it('falls back to the default theme for unknown ids', () => {
    expect(loadTheme('nope').id).toBe('77-hudson');
  });
});
