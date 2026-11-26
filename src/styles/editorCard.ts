/**
 * Editor card styles shared by the admin list editors (Events, Services).
 *
 * LAYOUT (single column at every width, so list order is easy to read):
 * ```tsx
 * <div style={editorCardStyle}>               // + editorCardChangedStyle / editorCardDeletedStyle
 *   <div style={editorCardTopStyle}>          // drag handle · text · optional thumbnail
 *     <span style={editorCardTitleStyle}>…</span>
 *     <span style={editorCardTextStyle}>…</span>   // clamped to 2 lines
 *     <span style={editorCardMetaStyle}><span style={{...chipStyle, ...chipNewStyle}}>New</span> 3 details</span>
 *   </div>
 *   <div style={actionBarStyle(4)}>           // full-width bar of labelled buttons
 *     <button style={actionBarButtonStyle}>Edit</button>
 *     <button style={{...actionBarButtonStyle, ...actionBarDangerStyle}}>Delete</button>
 *   </div>
 * </div>
 * ```
 *
 * GOTCHAS:
 * - All borders are longhand (see CLAUDE.md CSS shorthand gotcha). Spread
 *   `actionBarButtonFirstStyle` on the first button to drop its left divider.
 */
import type { CSSProperties } from 'react';

export const editorCardStyle: CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#e8e3dc',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
  marginBottom: '10px',
  overflow: 'hidden',
};

/** Unpublished edits on this item */
export const editorCardChangedStyle: CSSProperties = {
  background: '#fffaf0',
  borderColor: '#f2d58a',
};

/** Marked for deletion (removed on publish) */
export const editorCardDeletedStyle: CSSProperties = {
  background: '#fff8f8',
  borderColor: 'rgba(244, 67, 54, 0.3)',
};

export const editorCardTopStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  padding: '12px 12px 10px 4px',
};

/** Drag handle column: tall touch target, left of the text */
export const editorCardHandleStyle: CSSProperties = {
  color: '#b5b5b5',
  fontSize: '18px',
  lineHeight: 1,
  width: '28px',
  alignSelf: 'stretch',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

export const editorCardBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  flex: 1,
  minWidth: 0,
};

export const editorCardTitleStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: '16px',
  lineHeight: 1.3,
  color: '#1e221d',
  overflowWrap: 'anywhere',
};

/** Secondary text, clamped to two lines */
export const editorCardTextStyle: CSSProperties = {
  fontSize: '13.5px',
  lineHeight: 1.4,
  color: '#666',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
};

export const editorCardMetaStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '4px 10px',
  fontSize: '12px',
  color: '#888',
};

/** Full-width action bar under the card; pass the number of buttons */
export const actionBarStyle = (count: number): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${count}, 1fr)`,
  borderTopWidth: '1px',
  borderTopStyle: 'solid',
  borderTopColor: '#eee',
});

export const actionBarButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  minHeight: '44px',
  padding: '0 6px',
  background: 'transparent',
  color: '#444',
  fontFamily: 'inherit',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
  borderTopWidth: 0,
  borderRightWidth: 0,
  borderBottomWidth: 0,
  borderLeftWidth: '1px',
  borderLeftStyle: 'solid',
  borderLeftColor: '#eee',
  whiteSpace: 'nowrap',
};

export const actionBarButtonFirstStyle: CSSProperties = { borderLeftWidth: 0 };
export const actionBarPrimaryStyle: CSSProperties = { color: 'var(--theme-color-primary-500)' };
export const actionBarDangerStyle: CSSProperties = { color: '#c62828' };
export const actionBarUndoStyle: CSSProperties = { color: '#2e7d32' };

/** Status chips: New / Draft / Edited / Removing */
export const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: '10.5px',
  fontWeight: 800,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  borderRadius: '999px',
  padding: '1px 8px',
  lineHeight: 1.5,
  whiteSpace: 'nowrap',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'transparent',
};
export const chipNewStyle: CSSProperties = { background: 'var(--theme-color-secondary-500)', color: '#1e221d' };
export const chipDraftStyle: CSSProperties = { background: '#fff', color: '#8a5e00', borderStyle: 'dashed', borderColor: 'var(--theme-color-secondary-500)' };
export const chipEditedStyle: CSSProperties = { background: '#fff3d1', color: '#8a5e00' };
export const chipRemovingStyle: CSSProperties = { background: '#fff0f0', color: '#c62828' };
