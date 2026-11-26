/**
 * Admin page tabs. iPhone: a bar pinned to the bottom (4 tabs, Appearance lives
 * under Settings). iPad and desktop: a row along the top inside the sticky header
 * (5 tabs). Layout rules are in src/pages/Admin.css.
 */
import type { ReactNode } from 'react';

export type AdminTab = 'services' | 'events' | 'advisories' | 'appearance' | 'settings';

function TabIcon({ children }: { children: ReactNode }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const ICONS: Record<AdminTab, ReactNode> = {
  services: <TabIcon><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></TabIcon>,
  events: <TabIcon><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></TabIcon>,
  advisories: <TabIcon><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></TabIcon>,
  appearance: <TabIcon><path d="M18 3l3 3-9 9-3-3z" /><path d="M9 12c-3 0-4 2-4 4s-1 3-2 3c2 2 8 2 9-3" /></TabIcon>,
  settings: <TabIcon><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" /></TabIcon>,
};

const LABELS: Record<AdminTab, string> = {
  services: 'Services',
  events: 'Events',
  advisories: 'Advisories',
  appearance: 'Appearance',
  settings: 'Settings',
};

export interface TabBadge {
  /** Number of listed changes (0 = none known) */
  count: number;
  /** Section flagged changed even if nothing is listed */
  changed: boolean;
}

interface Props {
  tabs: AdminTab[];
  active: AdminTab;
  badges: Partial<Record<AdminTab, TabBadge>>;
  onSelect: (tab: AdminTab) => void;
  variant: 'bottom' | 'top';
}

export function AdminTabs({ tabs, active, badges, onSelect, variant }: Props) {
  return (
    <nav className={variant === 'bottom' ? 'admin-tabbar' : 'admin-toptabs'} aria-label="Editor sections">
      {tabs.map(tab => {
        const badge = badges[tab];
        const on = tab === active;
        return (
          <button
            key={tab}
            type="button"
            className={on ? 'is-active' : undefined}
            aria-current={on ? 'page' : undefined}
            onClick={() => onSelect(tab)}
          >
            {variant === 'bottom' && ICONS[tab]}
            <span>{LABELS[tab]}</span>
            {badge && badge.count > 0 && <span className="admin-tab-count" aria-label={`${badge.count} unpublished`}>{badge.count}</span>}
            {badge && badge.count === 0 && badge.changed && <span className="admin-tab-dot" aria-label="unpublished changes" />}
          </button>
        );
      })}
    </nav>
  );
}
