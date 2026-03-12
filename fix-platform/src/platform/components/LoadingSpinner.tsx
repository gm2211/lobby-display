/**
 * LoadingSpinner — Animated circular loading indicator.
 *
 * PURPOSE:
 * Shows an animated spinner for async loading states.
 * Configurable size (sm, md, lg) for use in buttons, panels, or full pages.
 *
 * USAGE:
 * ```tsx
 * <LoadingSpinner />              // default: md
 * <LoadingSpinner size="sm" />    // small, for inline use
 * <LoadingSpinner size="lg" label="Loading data..." />
 * ```
 *
 * GOTCHAS:
 * - Uses CSS keyframes via a <style> tag injected once per mount
 * - Uses all-longhand CSS properties (no shorthand mixing)
 */
import type { CSSProperties } from 'react';

type SpinnerSize = 'sm' | 'md' | 'lg';

interface LoadingSpinnerProps {
  /** Size preset. Default: 'md' */
  size?: SpinnerSize;
  /** Optional accessible label. Defaults to 'Loading…' */
  label?: string;
  /** Override display color. Default: '#1a5c5a' */
  color?: string;
}

const SIZE_MAP: Record<SpinnerSize, number> = {
  sm: 16,
  md: 32,
  lg: 56,
};

const BORDER_MAP: Record<SpinnerSize, number> = {
  sm: 2,
  md: 3,
  lg: 5,
};

const KEYFRAMES = `
@keyframes __spinner-rotate {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
`;

let _injected = false;

function injectKeyframes() {
  if (_injected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
  _injected = true;
}

export function LoadingSpinner({
  size = 'md',
  label = 'Loading...',
  color = '#1a5c5a',
}: LoadingSpinnerProps) {
  injectKeyframes();

  const px = SIZE_MAP[size];
  const border = BORDER_MAP[size];

  const spinnerStyle: CSSProperties = {
    width: px,
    height: px,
    borderRadius: '50%',
    borderTopWidth: border,
    borderRightWidth: border,
    borderBottomWidth: border,
    borderLeftWidth: border,
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: color,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    animation: '__spinner-rotate 0.7s linear infinite',
    flexShrink: 0,
  };

  return (
    <span
      style={styles.wrapper}
      role="status"
      aria-label={label}
    >
      <span style={spinnerStyle} aria-hidden="true" />
      {label && <span style={styles.srOnly}>{label}</span>}
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    whiteSpace: 'nowrap',
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'transparent',
  },
};
