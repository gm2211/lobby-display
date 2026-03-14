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
    // Primary teal palette
    primary50: '#e8f5f5',
    primary100: '#c0e2e2',
    primary200: '#94cccc',
    primary300: '#63b6b5',
    primary400: '#3aa3a1',
    primary500: '#1a5c5a',
    primary600: '#164f4d',
    primary700: '#0f3d3b',
    primary800: '#092b29',
    primary900: '#041918',

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
    headerGradientStart: '#1a5c5a',
    headerGradientEnd: '#0f3d3b',
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
