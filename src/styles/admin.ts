import type { CSSProperties } from 'react';

/** Input style matching the admin light theme */
export const inputStyle: CSSProperties = {
  background: '#fff',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#ddd',
  borderRadius: '6px',
  padding: '8px 12px',
  color: '#333',
  fontSize: '14px',
};

/** Use on <select> elements so they match <input> height (selects need slightly more padding) */
export const selectStyle: CSSProperties = {
  background: '#fff',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#ddd',
  borderRadius: '6px',
  padding: '9px 12px',
  color: '#333',
  fontSize: '14px',
};

/** Style for inputs with changed values */
export const inputChangedStyle: CSSProperties = {
  borderColor: 'var(--theme-color-secondary-500)',
  boxShadow: '0 0 6px color-mix(in srgb, var(--theme-color-secondary-500) 30%, transparent)',
};

/** Section container style */
export const sectionStyle: CSSProperties = {
  background: '#fff',
  borderRadius: '10px',
  borderTopWidth: '1px',
  borderRightWidth: '1px',
  borderBottomWidth: '1px',
  borderLeftWidth: '1px',
  borderTopStyle: 'solid',
  borderRightStyle: 'solid',
  borderBottomStyle: 'solid',
  borderLeftStyle: 'solid',
  borderTopColor: '#e0e0e0',
  borderRightColor: '#e0e0e0',
  borderBottomColor: '#e0e0e0',
  borderLeftColor: '#e0e0e0',
  padding: '20px',
  marginBottom: '20px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
};

/** Section with changes indicator */
export const sectionChangedStyle: CSSProperties = {
  borderLeftWidth: '3px',
  borderLeftStyle: 'solid',
  borderLeftColor: 'var(--theme-color-secondary-500)',
};

/** Form group container */
export const formGroupStyle: CSSProperties = {
  background: '#f9f9f9',
  borderRadius: '8px',
  padding: '12px',
  marginBottom: '16px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#eee',
};

/** Form label style */
export const formLabelStyle: CSSProperties = {
  fontSize: '11px',
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '8px',
  display: 'block',
};

/** List header style */
export const listHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '12px',
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '8px',
  paddingBottom: '6px',
  borderBottomWidth: '1px',
  borderBottomStyle: 'solid',
  borderBottomColor: '#eee',
};

/** List card style */
export const listCardStyle: CSSProperties = {
  background: '#fafafa',
  borderRadius: '8px',
  padding: '12px 14px',
  marginBottom: '8px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#eee',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

/** Style for items marked for deletion */
export const markedForDeletionStyle: CSSProperties = {
  background: 'rgba(244, 67, 54, 0.07)',
};

/** Style for items with changes */
export const itemChangedStyle: CSSProperties = {
  background: 'rgba(230, 160, 0, 0.07)',
  boxShadow: 'inset 0 0 20px rgba(230, 160, 0, 0.08)',
};

/** Draft indicator style */
export const draftIndicatorStyle: CSSProperties = {
  color: 'var(--theme-color-secondary-600)',
  fontSize: '8px',
  flexShrink: 0,
  marginRight: '4px',
};
