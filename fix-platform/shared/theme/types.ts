export interface TenantTheme {
  id: string;
  buildingName: string;
  portalTitle: string;
  dashboardTitle: string;
  htmlTitle: string;

  logoUrl: string;
  logoAlt: string;
  faviconUrl: string;

  welcomeMessage: string;
  assistantGreeting: string;
  assistantIntro: string;
  loginBrandText: string;
  sidebarBrandText: string;

  colors: ThemeColors;
  fontFamily: string;

  seedData: {
    emailDomain: string;
    residentEmailDomain: string;
    buildingAddress: {
      street: string;
      city: string;
      state: string;
      zip: string;
      country: string;
    };
  };
}

export interface ThemeColors {
  // Primary palette (maps to --platform-color-primary-*)
  primary50: string;
  primary100: string;
  primary200: string;
  primary300: string;
  primary400: string;
  primary500: string;
  primary600: string;
  primary700: string;
  primary800: string;
  primary900: string;

  // Secondary palette (maps to --platform-color-secondary-*)
  secondary50: string;
  secondary100: string;
  secondary200: string;
  secondary300: string;
  secondary400: string;
  secondary500: string;
  secondary600: string;
  secondary700: string;
  secondary800: string;
  secondary900: string;

  // Neutrals
  neutral50: string;
  neutral100: string;
  neutral200: string;
  neutral300: string;
  neutral400: string;
  neutral500: string;
  neutral600: string;
  neutral700: string;
  neutral800: string;
  neutral900: string;

  // Status colors
  success: string;
  warning: string;
  error: string;
  info: string;

  // Backgrounds & surfaces
  pageBg: string;
  surface: string;
  surfaceHover: string;
  headerGradientStart: string;
  headerGradientEnd: string;
}
