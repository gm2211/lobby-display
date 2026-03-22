// Default values for scroll/ticker speeds (in seconds, higher = slower)
export const DEFAULTS = {
  SCROLL_SPEED: 30,
  TICKER_SPEED: 25,
  SERVICES_SCROLL_SPEED: 8,
  SERVICES_FONT_SIZE: 18,
  NOTES_FONT_SIZE: 18,
  NOTES_FONT_WEIGHT: 700,
  TITLE_FONT_SIZE: 20,
} as const;

// Theme colors
export const COLORS = {
  // Primary
  TEAL: '#00bcd4',
  TEAL_DARK: '#1a5c5a',
  TEAL_DARKER: '#1a4a48',

  // Backgrounds
  BG_DARK: '#0a1628',
  BG_CARD: '#132038',
  BG_INPUT: '#0a1628',

  // Borders
  BORDER: '#1a3050',
  BORDER_LIGHT: '#2a4060',

  // Advisory ticker
  ADVISORY_BG: '#f5c842',

  // Text
  TEXT_PRIMARY: '#e0e0e0',
  TEXT_SECONDARY: '#888',
  TEXT_MUTED: '#666',

  // Status (also in STATUS_COLORS but repeated for easy access)
  SUCCESS: '#4caf50',
  WARNING: '#ffc107',
  ERROR: '#f44336',
} as const;

// Event card gradient (used in EventCard and EventCardPreview)
export const EVENT_CARD_GRADIENT = {
  withImage: (imageUrl: string) =>
    `linear-gradient(to right, rgba(20,60,58,0.92) 0%, rgba(20,60,58,0.75) 50%, rgba(20,60,58,0.3) 100%), url(${imageUrl})`,
  noImage: 'linear-gradient(135deg, #1a5c5a 0%, #1a4a48 100%)',
} as const;

// Timing constants
export const TIMING = {
  DEBOUNCE_MS: 150,
  ANIMATION_SHAKE_MS: 400,
} as const;

/**
 * Design tokens for consistent spacing throughout the UI.
 *
 * AI AGENT NOTE: Always prefer these tokens over raw pixel values.
 * Use the smallest token that provides adequate visual separation.
 *
 * USAGE:
 * ```tsx
 * <div style={{ gap: SPACING.SM, padding: SPACING.MD }}>
 * ```
 */
export const SPACING = {
  /** 4px - Minimal spacing, icon/text alignment */
  XS: '4px',
  /** 8px - Default gap between elements */
  SM: '8px',
  /** 12px - Input padding, form spacing */
  MD: '12px',
  /** 16px - Section gaps, card padding */
  LG: '16px',
  /** 20px - Major section separation */
  XL: '20px',
  /** 24px - Page padding, large gaps */
  XXL: '24px',
} as const;

/**
 * Typography scale for consistent font sizes.
 *
 * AI AGENT NOTE: BASE (13px) is the default body text size.
 * Use SM/XS for secondary text, LG/XL for headings.
 */
export const FONT_SIZE = {
  /** 10px - Tiny labels, badges */
  XS: '10px',
  /** 11px - Small labels, secondary text */
  SM: '11px',
  /** 12px - Body text, buttons */
  MD: '12px',
  /** 13px - Default body text */
  BASE: '13px',
  /** 14px - Larger body text, form inputs */
  LG: '14px',
  /** 16px - Section headers */
  XL: '16px',
  /** 20px - Card titles, major headings */
  XXL: '20px',
} as const;

/**
 * Border radius scale for rounded corners.
 *
 * AI AGENT NOTE: Use SM for buttons, MD for inputs, LG for cards, XL for modals.
 */
export const BORDER_RADIUS = {
  /** 4px - Small elements (buttons, tags) */
  SM: '4px',
  /** 6px - Inputs, small cards */
  MD: '6px',
  /** 8px - Cards, panels */
  LG: '8px',
  /** 12px - Modals, large cards */
  XL: '12px',
} as const;

/**
 * Common grid templates for admin layouts.
 *
 * AI AGENT NOTE: Use these for consistent column layouts.
 */
export const GRID_TEMPLATES = {
  /** Service list: name | status | notes | actions */
  SERVICES: 'minmax(120px, 1fr) 110px 1fr auto',
} as const;
