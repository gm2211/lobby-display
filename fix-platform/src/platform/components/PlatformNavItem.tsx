import { Link } from 'react-router-dom';
import type { CSSProperties, ReactNode } from 'react';

interface PlatformNavItemProps {
  label: string;
  to: string;
  icon?: ReactNode;
  active?: boolean;
}

export default function PlatformNavItem({ label, to, icon, active = false }: PlatformNavItemProps) {
  return (
    <li style={styles.item}>
      <Link
        to={to}
        aria-current={active ? 'page' : undefined}
        style={{
          ...styles.link,
          ...(active ? styles.linkActive : {}),
        }}
      >
        {icon && (
          <span style={styles.icon} aria-hidden="true">
            {icon}
          </span>
        )}
        <span style={styles.label}>{label}</span>
      </Link>
    </li>
  );
}

const styles: Record<string, CSSProperties> = {
  item: {
    listStyle: 'none',
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    borderRadius: '8px',
    textDecoration: 'none',
    color: 'var(--platform-color-neutral-700)',
    fontSize: '14px',
    fontWeight: 400,
    transition: 'background 0.15s, color 0.15s',
    cursor: 'pointer',
  },
  linkActive: {
    background: 'var(--platform-color-primary-50)',
    color: 'var(--platform-color-primary-500)',
    fontWeight: 600,
  },
  icon: {
    flexShrink: 0,
    width: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
  },
};
