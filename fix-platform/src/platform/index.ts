/**
 * Platform module public API.
 *
 * Re-exports the layout component and theme type so consumers
 * import from a single location:
 *
 * ```tsx
 * import { PlatformLayout } from '../platform';
 * ```
 */
export { default as PlatformLayout } from './PlatformLayout';
export type { PlatformTheme } from './PlatformLayout';
