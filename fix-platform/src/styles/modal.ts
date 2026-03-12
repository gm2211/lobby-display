/**
 * Modal overlay and container styles.
 *
 * USAGE:
 * ```tsx
 * {isOpen && (
 *   <div style={modalOverlay} onClick={onClose}>
 *     <div style={modal} onClick={e => e.stopPropagation()}>
 *       {content}
 *     </div>
 *   </div>
 * )}
 * ```
 *
 * GOTCHAS:
 * - The overlay uses position:fixed with inset:0 - ensure parent doesn't have
 *   transform/filter that creates a new stacking context
 * - zIndex is 1000 - increase if modal appears behind other fixed elements
 * - Click propagation: overlay onClick closes, modal stopPropagation prevents it
 */
import type { CSSProperties } from 'react';

/**
 * Full-screen overlay that darkens the background.
 * Centers its child content using flexbox.
 */
export const modalOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

/**
 * Modal container - light themed, rounded, takes most of viewport.
 * Override width/height for smaller modals.
 */
export const modal: CSSProperties = {
  width: '90vw',
  height: '85vh',
  background: '#fff',
  borderRadius: '12px',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
};

/**
 * Smaller modal variant for confirmations and simple dialogs.
 * Example: history modal, preview modal
 */
export const modalSmall: CSSProperties = {
  ...modal,
  width: '700px',
  maxWidth: '90vw',
  height: 'auto',
  maxHeight: '85vh',
  overflow: 'auto',
};
