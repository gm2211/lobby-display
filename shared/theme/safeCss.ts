/**
 * Validators for theme values that end up inside CSS.
 *
 * BuildingConfig.fontFamily / colorPrimary / colorSecondary are written by editors and
 * injected into a server-rendered <style> block (server/themeCSS.ts). Anything that can
 * close that block (`</style>`) or start a new declaration (`;`, `}`) must never get
 * through, so these are strict allow-lists rather than escapers.
 */

/** Letters, digits, spaces, commas, quotes, hyphens, underscores. e.g. `'Open Sans', sans-serif` */
const FONT_FAMILY_RE = /^[A-Za-z0-9 ,'"_-]{1,200}$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function isSafeFontFamily(value: unknown): value is string {
  return typeof value === 'string' && FONT_FAMILY_RE.test(value);
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}
