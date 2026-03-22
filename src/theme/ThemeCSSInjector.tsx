import { useEffect } from 'react';
import { useTheme } from './ThemeContext';

export function ThemeCSSInjector() {
  const theme = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const { colors } = theme;

    // Primary palette
    root.style.setProperty('--theme-color-primary-50', colors.primary50);
    root.style.setProperty('--theme-color-primary-100', colors.primary100);
    root.style.setProperty('--theme-color-primary-200', colors.primary200);
    root.style.setProperty('--theme-color-primary-300', colors.primary300);
    root.style.setProperty('--theme-color-primary-400', colors.primary400);
    root.style.setProperty('--theme-color-primary-500', colors.primary500);
    root.style.setProperty('--theme-color-primary-600', colors.primary600);
    root.style.setProperty('--theme-color-primary-700', colors.primary700);
    root.style.setProperty('--theme-color-primary-800', colors.primary800);
    root.style.setProperty('--theme-color-primary-900', colors.primary900);

    // Secondary palette
    root.style.setProperty('--theme-color-secondary-50', colors.secondary50);
    root.style.setProperty('--theme-color-secondary-100', colors.secondary100);
    root.style.setProperty('--theme-color-secondary-200', colors.secondary200);
    root.style.setProperty('--theme-color-secondary-300', colors.secondary300);
    root.style.setProperty('--theme-color-secondary-400', colors.secondary400);
    root.style.setProperty('--theme-color-secondary-500', colors.secondary500);
    root.style.setProperty('--theme-color-secondary-600', colors.secondary600);
    root.style.setProperty('--theme-color-secondary-700', colors.secondary700);
    root.style.setProperty('--theme-color-secondary-800', colors.secondary800);
    root.style.setProperty('--theme-color-secondary-900', colors.secondary900);

    // Neutral palette
    root.style.setProperty('--theme-color-neutral-50', colors.neutral50);
    root.style.setProperty('--theme-color-neutral-100', colors.neutral100);
    root.style.setProperty('--theme-color-neutral-200', colors.neutral200);
    root.style.setProperty('--theme-color-neutral-300', colors.neutral300);
    root.style.setProperty('--theme-color-neutral-400', colors.neutral400);
    root.style.setProperty('--theme-color-neutral-500', colors.neutral500);
    root.style.setProperty('--theme-color-neutral-600', colors.neutral600);
    root.style.setProperty('--theme-color-neutral-700', colors.neutral700);
    root.style.setProperty('--theme-color-neutral-800', colors.neutral800);
    root.style.setProperty('--theme-color-neutral-900', colors.neutral900);

    // Status colors
    root.style.setProperty('--theme-color-success', colors.success);
    root.style.setProperty('--theme-color-warning', colors.warning);
    root.style.setProperty('--theme-color-error', colors.error);
    root.style.setProperty('--theme-color-info', colors.info);

    // Backgrounds & surfaces
    root.style.setProperty('--theme-color-page-bg', colors.pageBg);
    root.style.setProperty('--theme-color-surface', colors.surface);
    root.style.setProperty('--theme-color-surface-hover', colors.surfaceHover);

    // Semantic surface aliases (used by components)
    root.style.setProperty('--theme-bg-page', colors.pageBg);
    root.style.setProperty('--theme-bg-surface', colors.surface);
    root.style.setProperty('--theme-bg-subtle', colors.surfaceHover);
    root.style.setProperty('--theme-bg-muted', colors.neutral50);

    // Accent aliases (used by components)
    root.style.setProperty('--theme-accent', colors.primary500);
    root.style.setProperty('--theme-accent-hover', colors.primary600);
    root.style.setProperty('--theme-accent-primary', colors.primary500);
    root.style.setProperty('--theme-accent-secondary', colors.secondary500);

    // Header gradient
    root.style.setProperty('--theme-header-gradient-start', colors.headerGradientStart);
    root.style.setProperty('--theme-header-gradient-end', colors.headerGradientEnd);

    // Font family
    root.style.setProperty('--theme-font-family', theme.fontFamily);

    // Update document title
    document.title = theme.htmlTitle;
  }, [theme]);

  return null;
}
