/** Default scroll/ticker speeds (in seconds). Higher = slower. */
export const DEFAULT_SPEEDS = {
  SERVICES: 8,
  EVENTS: 30,
  TICKER: 25,
} as const;

/** Default font settings for the services table. */
export const DEFAULT_FONTS = {
  SERVICES_FONT_SIZE: 18,
  NOTES_FONT_SIZE: 18,
  NOTES_FONT_WEIGHT: 700,
  TITLE_FONT_SIZE: 20,
  FONT_SCALE: 100,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Session cookie lifetimes. Lobby screens (VIEWER) should stay signed in. */
export const SESSION_AGES = {
  DAY_MS,
  DEFAULT_MS: 7 * DAY_MS,
  /** Staff sessions are renewed once less than this much time is left */
  REFRESH_THRESHOLD_MS: 4 * DAY_MS,
  VIEWER_MS: 365 * DAY_MS,
} as const;

/** Minimum length for any password set through the app (setup, user create/edit). */
export const MIN_PASSWORD_LENGTH = 8;
