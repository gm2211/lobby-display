/**
 * EmptyState — "No data" placeholder with optional action button.
 *
 * PURPOSE:
 * Renders a centered empty-state message with an icon, description text,
 * and an optional call-to-action button. Used when a list or panel has no items.
 *
 * USAGE:
 * ```tsx
 * <EmptyState message="No services found" />
 *
 * <EmptyState
 *   icon={<AlertTriangle size={22} />}
 *   message="No events yet"
 *   description="Add your first event to get started."
 *   action={{ label: 'Add Event', onClick: () => setOpen(true) }}
 * />
 * ```
 *
 * GOTCHAS:
 * - Uses all-longhand CSS properties (no shorthand mixing)
 */
import type { CSSProperties, ReactNode } from 'react';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  /** Primary message headline */
  message: string;
  /** Optional secondary description text */
  description?: string;
  /** Icon node shown in the circle. Default: empty box symbol */
  icon?: ReactNode;
  /** Optional action button */
  action?: EmptyStateAction;
}

export function EmptyState({
  message,
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div style={styles.container} role="status" aria-label={message}>
      <div style={styles.iconCircle}>
        <span style={styles.iconText} aria-hidden="true">
          {icon ?? <span style={{ fontSize: '22px', lineHeight: 1 }}>{'\u25A1'}</span>}
        </span>
      </div>
      <p style={styles.message}>{message}</p>
      {description && <p style={styles.description}>{description}</p>}
      {action && (
        <button
          style={styles.actionBtn}
          onClick={action.onClick}
          type="button"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
    textAlign: 'center',
    color: '#888',
  },
  iconCircle: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: '#f9f9f9',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#e0e0e0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  iconText: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#888',
  },
  message: {
    fontSize: '15px',
    fontWeight: 500,
    color: '#444',
    margin: '0 0 6px',
  },
  description: {
    fontSize: '13px',
    color: '#888',
    margin: '0 0 20px',
    maxWidth: '320px',
  },
  actionBtn: {
    background: '#1a5c5a',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#164f4d',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
    padding: '7px 18px',
    cursor: 'pointer',
  },
};
