/**
 * Shared button style definitions for the admin interface.
 *
 * USAGE GUIDE FOR AI AGENTS:
 * - Use smallBtn as the base style for all small buttons
 * - Spread additional variants on top: { ...smallBtn, ...smallBtnDanger }
 * - All buttons use gradient backgrounds for visual consistency
 * - The marginLeft in smallBtn is intentional for button groups - override if needed
 *
 * PATTERN:
 * ```tsx
 * <button style={{ ...smallBtn, ...smallBtnDanger }}>Delete</button>
 * ```
 *
 * COLOR MEANINGS:
 * - Default (smallBtn): Neutral action
 * - Danger: Destructive actions (delete, remove)
 * - Success: Positive actions (save, confirm, undo)
 * - Primary: Main actions (edit, submit)
 * - Info: Informational actions (preview, view)
 */
import type { CSSProperties } from 'react';

/**
 * Base small button style - use as foundation for all small buttons.
 * Includes marginLeft for button groups; override with marginLeft: 0 if first in row.
 */
export const smallBtn: CSSProperties = {
  borderRadius: '4px',
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: '12px',
  marginLeft: '6px',
  background: '#f0f0f0',
  color: '#444',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#ccc',
};

/** Red variant for destructive actions (delete, remove, cancel) */
export const smallBtnDanger: CSSProperties = {
  background: '#fff0f0',
  color: '#c62828',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#ffcdd2',
};

/** Green variant for positive actions (save, confirm, undo deletion) */
export const smallBtnSuccess: CSSProperties = {
  background: '#f0fff4',
  color: '#2e7d32',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#c8e6c9',
};

/** Blue/teal variant for primary actions (edit, submit) */
export const smallBtnPrimary: CSSProperties = {
  background: '#1a5c5a',
  color: '#fff',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#1a5c5a',
};

/** Teal variant for informational actions (preview, view details) */
export const smallBtnInfo: CSSProperties = {
  background: '#e8f5f5',
  color: '#1a5c5a',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#b2dfdb',
};

/**
 * Header button style - larger buttons for page-level actions.
 * Used for Publish, Discard, Preview, History buttons.
 * Designed for placement on the teal gradient header (white/translucent text).
 */
export const headerBtn: CSSProperties = {
  background: 'rgba(255,255,255,0.15)',
  color: '#fff',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'rgba(255,255,255,0.35)',
  borderRadius: '6px',
  padding: '8px 16px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '13px',
  minWidth: '80px',
};

/** Secondary header button - less prominent than primary header button */
export const headerBtnSecondary: CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.85)',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'rgba(255,255,255,0.25)',
};

/**
 * Standard action button - medium size for form actions.
 * Used for Add, Save, Cancel buttons within forms.
 */
export const btn: CSSProperties = {
  background: '#00838f',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '8px 16px',
  cursor: 'pointer',
  fontWeight: 600,
};
