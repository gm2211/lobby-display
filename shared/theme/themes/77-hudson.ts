import type { TenantTheme } from '../types';

export const seventy7HudsonTheme: TenantTheme = {
  id: '77-hudson',
  buildingName: '77 Hudson',
  portalTitle: '77 Hudson Resident Portal',
  dashboardTitle: 'Building Updates',
  htmlTitle: '77 Hudson',

  logoUrl: '/assets/themes/77-hudson/logo.png',
  logoAlt: '77 Hudson',
  faviconUrl: '/favicon.ico',

  welcomeMessage: 'Welcome to 77 Hudson. Here\'s your building at a glance.',
  loginBrandText: '77 Hudson',
  sidebarBrandText: '77 Hudson',

  colors: {
    // Primary charcoal-green palette, matching prod (generatePalette('#222721'))
    primary50: '#f2f3f1',
    primary100: '#c6cec4',
    primary200: '#9aa898',
    primary300: '#70806d',
    primary400: '#495447',
    primary500: '#222721',
    primary600: '#1e221d',
    primary700: '#191d18',
    primary800: '#151814',
    primary900: '#101310',

    // Secondary orange/amber palette
    secondary50: '#fff8e1',
    secondary100: '#ffedb3',
    secondary200: '#ffe082',
    secondary300: '#ffd54f',
    secondary400: '#ffca28',
    secondary500: '#e6a000',
    secondary600: '#b07800',
    secondary700: '#8a5e00',
    secondary800: '#634400',
    secondary900: '#3d2a00',

    // Neutrals (warm cream/stone)
    neutral50: '#fafafa',
    neutral100: '#f9f9f9',
    neutral200: '#f5f0eb',
    neutral300: '#e0e0e0',
    neutral400: '#ddd',
    neutral500: '#ccc',
    neutral600: '#888',
    neutral700: '#444',
    neutral800: '#333',
    neutral900: '#111',

    // Status colors
    success: '#2e7d32',
    warning: '#b07800',
    error: '#c62828',
    info: '#00838f',

    // Backgrounds & surfaces
    pageBg: '#f5f0eb',
    surface: '#ffffff',
    surfaceHover: '#f9f9f9',
    headerGradientStart: '#222721',
    headerGradientEnd: '#191d18',
  },

  fontFamily: "'Nunito', sans-serif",

  seedData: {
    emailDomain: '77hudson.com',
    residentEmailDomain: 'resident.77hudson.com',
    buildingAddress: {
      street: '77 Hudson Street',
      city: 'Jersey City',
      state: 'NJ',
      zip: '07302',
      country: 'USA',
    },
  },
};
