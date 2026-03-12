import type { TenantTheme } from '../types';

export const renzoDefaultTheme: TenantTheme = {
  id: 'renzo-default',
  buildingName: 'Renzo',
  portalTitle: 'Renzo Resident Portal',
  dashboardTitle: 'Building Updates',
  htmlTitle: 'Renzo',

  logoUrl: '/assets/themes/renzo-default/logo.png',
  logoAlt: 'Renzo',
  faviconUrl: '/favicon.ico',

  welcomeMessage: 'Welcome to your building portal',
  assistantGreeting: 'How can I help you today?',
  assistantIntro: 'I\'m your building assistant. I can help with amenities, bookings, building rules, and more.',
  loginBrandText: 'Renzo',
  sidebarBrandText: 'Renzo',

  colors: {
    // Primary slate blue palette
    primary50: '#eef2f7',
    primary100: '#d4dff0',
    primary200: '#a9bfe1',
    primary300: '#7e9fd2',
    primary400: '#5c7fbf',
    primary500: '#3b5998',
    primary600: '#2f4a80',
    primary700: '#243b68',
    primary800: '#182c50',
    primary900: '#0c1d38',

    // Secondary cool gray/blue accent
    secondary50: '#f0f4f8',
    secondary100: '#d9e2ec',
    secondary200: '#bcccdc',
    secondary300: '#9fb3c8',
    secondary400: '#829ab1',
    secondary500: '#627d98',
    secondary600: '#486581',
    secondary700: '#334e68',
    secondary800: '#243b53',
    secondary900: '#102a43',

    // Neutrals (standard gray scale)
    neutral50: '#f8f9fa',
    neutral100: '#f1f3f5',
    neutral200: '#e9ecef',
    neutral300: '#dee2e6',
    neutral400: '#ced4da',
    neutral500: '#adb5bd',
    neutral600: '#6c757d',
    neutral700: '#495057',
    neutral800: '#343a40',
    neutral900: '#212529',

    // Status colors
    success: '#2e7d32',
    warning: '#b07800',
    error: '#c62828',
    info: '#0277bd',

    // Backgrounds & surfaces
    pageBg: '#f8f9fa',
    surface: '#ffffff',
    surfaceHover: '#f1f3f5',
    headerGradientStart: '#3b5998',
    headerGradientEnd: '#243b68',
  },

  fontFamily: "'Inter', 'Nunito', sans-serif",

  seedData: {
    emailDomain: 'example.com',
    residentEmailDomain: 'resident.example.com',
    buildingAddress: {
      street: '123 Main Street',
      city: 'New York',
      state: 'NY',
      zip: '10001',
      country: 'USA',
    },
  },
};
