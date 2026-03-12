import { useEffect } from 'react';
import { useTheme } from './ThemeContext';

export function ThemeCSSInjector() {
  const theme = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const { colors } = theme;

    // Primary palette
    root.style.setProperty('--platform-color-primary-50', colors.primary50);
    root.style.setProperty('--platform-color-primary-100', colors.primary100);
    root.style.setProperty('--platform-color-primary-200', colors.primary200);
    root.style.setProperty('--platform-color-primary-300', colors.primary300);
    root.style.setProperty('--platform-color-primary-400', colors.primary400);
    root.style.setProperty('--platform-color-primary-500', colors.primary500);
    root.style.setProperty('--platform-color-primary-600', colors.primary600);
    root.style.setProperty('--platform-color-primary-700', colors.primary700);
    root.style.setProperty('--platform-color-primary-800', colors.primary800);
    root.style.setProperty('--platform-color-primary-900', colors.primary900);

    // Secondary palette
    root.style.setProperty('--platform-color-secondary-50', colors.secondary50);
    root.style.setProperty('--platform-color-secondary-100', colors.secondary100);
    root.style.setProperty('--platform-color-secondary-200', colors.secondary200);
    root.style.setProperty('--platform-color-secondary-300', colors.secondary300);
    root.style.setProperty('--platform-color-secondary-400', colors.secondary400);
    root.style.setProperty('--platform-color-secondary-500', colors.secondary500);
    root.style.setProperty('--platform-color-secondary-600', colors.secondary600);
    root.style.setProperty('--platform-color-secondary-700', colors.secondary700);
    root.style.setProperty('--platform-color-secondary-800', colors.secondary800);
    root.style.setProperty('--platform-color-secondary-900', colors.secondary900);

    // Neutral palette
    root.style.setProperty('--platform-color-neutral-50', colors.neutral50);
    root.style.setProperty('--platform-color-neutral-100', colors.neutral100);
    root.style.setProperty('--platform-color-neutral-200', colors.neutral200);
    root.style.setProperty('--platform-color-neutral-300', colors.neutral300);
    root.style.setProperty('--platform-color-neutral-400', colors.neutral400);
    root.style.setProperty('--platform-color-neutral-500', colors.neutral500);
    root.style.setProperty('--platform-color-neutral-600', colors.neutral600);
    root.style.setProperty('--platform-color-neutral-700', colors.neutral700);
    root.style.setProperty('--platform-color-neutral-800', colors.neutral800);
    root.style.setProperty('--platform-color-neutral-900', colors.neutral900);

    // Status colors
    root.style.setProperty('--platform-color-success', colors.success);
    root.style.setProperty('--platform-color-warning', colors.warning);
    root.style.setProperty('--platform-color-error', colors.error);
    root.style.setProperty('--platform-color-info', colors.info);

    // Backgrounds & surfaces
    root.style.setProperty('--platform-color-page-bg', colors.pageBg);
    root.style.setProperty('--platform-color-surface', colors.surface);
    root.style.setProperty('--platform-color-surface-hover', colors.surfaceHover);

    // Semantic surface aliases (used by components)
    root.style.setProperty('--platform-bg-page', colors.pageBg);
    root.style.setProperty('--platform-bg-surface', colors.surface);
    root.style.setProperty('--platform-bg-subtle', colors.surfaceHover);
    root.style.setProperty('--platform-bg-muted', colors.neutral50);

    // Accent aliases (used by components)
    root.style.setProperty('--platform-accent', colors.primary500);
    root.style.setProperty('--platform-accent-hover', colors.primary600);
    root.style.setProperty('--platform-accent-primary', colors.primary500);
    root.style.setProperty('--platform-accent-secondary', colors.secondary500);

    // Header gradient (used by platform layout headers)
    root.style.setProperty('--platform-header-gradient-start', colors.headerGradientStart);
    root.style.setProperty('--platform-header-gradient-end', colors.headerGradientEnd);

    // Update document title
    document.title = theme.htmlTitle;
  }, [theme]);

  return null;
}
