import { useState, type ReactNode, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import PlatformNavItem from './components/PlatformNavItem';
import CommandPalette, { useCommandPalette, usePlatformCommands } from './components/CommandPalette';
import './styles/tokens.css';
import {
  LayoutDashboard,
  Megaphone,
  Wrench,
  Dumbbell,
  Calendar,
  CalendarDays,
  UserCheck,
  AlertTriangle,
  CreditCard,
  Package,
  BookUser,
  MessageCircle,
  ShoppingBag,
  FileText,
  GraduationCap,
  ClipboardList,
  CheckSquare,
  Search,
  Menu,
  ChevronRight,
  ChevronDown,
  Palette,
} from 'lucide-react';

export type PlatformTheme = 'light' | 'dark' | 'system';

interface PlatformLayoutProps {
  children: ReactNode;
  /** Override color scheme. Defaults to 'system' (OS preference). */
  theme?: PlatformTheme;
}

interface NavSection {
  label: string;
  /** If set, only show this section when user has one of these roles */
  requiredRoles?: string[];
  items: Array<{ label: string; to: string; icon: ReactNode }>;
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'HOME',
    items: [
      { label: 'Dashboard', to: '/platform', icon: <LayoutDashboard size={18} /> },
    ],
  },
  {
    label: 'COMMUNITY',
    items: [
      { label: 'Announcements', to: '/platform/announcements', icon: <Megaphone size={18} /> },
      { label: 'Events',        to: '/platform/events',        icon: <Calendar size={18} /> },
      { label: 'Forum',         to: '/platform/forum',         icon: <MessageCircle size={18} /> },
      { label: 'Marketplace',   to: '/platform/marketplace',   icon: <ShoppingBag size={18} /> },
    ],
  },
  {
    label: 'SERVICES',
    items: [
      { label: 'Amenities',   to: '/platform/amenities',    icon: <Dumbbell size={18} /> },
      { label: 'Bookings',    to: '/platform/bookings',     icon: <CalendarDays size={18} /> },
      { label: 'Maintenance', to: '/platform/maintenance',  icon: <Wrench size={18} /> },
      { label: 'Parcels',     to: '/platform/parcels',      icon: <Package size={18} /> },
      { label: 'Visitors',    to: '/platform/visitors',     icon: <UserCheck size={18} /> },
    ],
  },
  {
    label: 'MANAGEMENT',
    requiredRoles: ['ADMIN', 'EDITOR'],
    items: [
      { label: 'Violations', to: '/platform/violations',      icon: <AlertTriangle size={18} /> },
      { label: 'Payments',   to: '/platform/payments',        icon: <CreditCard size={18} /> },
      { label: 'Documents',  to: '/platform/documents',       icon: <FileText size={18} /> },
      { label: 'Surveys',    to: '/platform/surveys',         icon: <ClipboardList size={18} /> },
      { label: 'Training',   to: '/platform/training',        icon: <GraduationCap size={18} /> },
      { label: 'Consent',    to: '/platform/consent',         icon: <CheckSquare size={18} /> },
      { label: 'Branding',   to: '/platform/admin/branding',  icon: <Palette size={18} /> },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { label: 'Directory', to: '/platform/directory', icon: <BookUser size={18} /> },
      { label: 'Search',    to: '/platform/search',    icon: <Search size={18} /> },
    ],
  },
];

// Detect Mac for keyboard hint display
const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');

function SidebarSection({
  section,
  location,
  collapsed,
  onToggle,
}: {
  section: NavSection;
  location: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={sectionStyles.wrapper}>
      {/* Section header -- clickable to collapse/expand */}
      <button
        onClick={onToggle}
        aria-expanded={!collapsed}
        style={sectionStyles.header}
      >
        <span style={sectionStyles.headerLabel}>{section.label}</span>
        <span style={sectionStyles.chevron} aria-hidden="true">
          {collapsed
            ? <ChevronRight size={12} />
            : <ChevronDown size={12} />}
        </span>
      </button>

      {/* Nav items -- hidden when collapsed */}
      {!collapsed && (
        <ul style={sectionStyles.list}>
          {section.items.map(item => (
            <PlatformNavItem
              key={item.to}
              label={item.label}
              to={item.to}
              icon={item.icon}
              active={
                item.to === '/platform'
                  ? location === '/platform' || location === '/platform/'
                  : location.startsWith(item.to)
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const sectionStyles: Record<string, CSSProperties> = {
  wrapper: {
    marginBottom: '4px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '8px 16px 4px',
    background: 'none',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left' as const,
    color: 'var(--platform-color-neutral-500)',
    letterSpacing: '0.06em',
  },
  headerLabel: {
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    color: 'var(--platform-color-neutral-500)',
    letterSpacing: '0.08em',
  },
  chevron: {
    color: 'var(--platform-color-neutral-400)',
    display: 'flex',
    alignItems: 'center',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: '0 8px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
  },
};

export default function PlatformLayout({ children, theme = 'system' }: PlatformLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const location = useLocation();
  const tenantTheme = useTheme();
  const themeAttr = theme === 'system' ? undefined : theme;

  // CommandPalette integration
  const { isOpen: paletteOpen, open: openPalette, close: closePalette } = useCommandPalette();
  const commands = usePlatformCommands(closePalette);

  function toggleSection(label: string) {
    setCollapsedSections(prev => ({ ...prev, [label]: !prev[label] }));
  }

  // Get the user's initial for avatar display
  const userInitial = user?.username ? user.username.charAt(0).toUpperCase() : '?';

  // Filter sections based on role -- MANAGEMENT only for ADMIN/EDITOR
  const visibleSections = NAV_SECTIONS.filter(section => {
    if (!section.requiredRoles) return true;
    if (!user) return false;
    return section.requiredRoles.includes(user.role);
  });

  return (
    <div style={styles.shell} data-platform-theme={themeAttr}>
      {/* Top Bar */}
      <header style={styles.topBar}>
        <div style={styles.topBarLeft}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Toggle sidebar"
            style={styles.menuBtn}
          >
            <Menu size={20} color="rgba(255,255,255,0.85)" />
          </button>
          <img src={tenantTheme.logoUrl} alt={tenantTheme.logoAlt} style={styles.topLogo} />
          <span style={styles.topTitle}>{tenantTheme.portalTitle}</span>
        </div>

        <div style={styles.topBarRight}>
          {/* Cmd+K hint button */}
          <button
            onClick={openPalette}
            aria-label="Open command palette"
            style={styles.cmdKBtn}
            title={`${isMac ? '\u2318' : 'Ctrl'}+K -- Search or jump to...`}
          >
            <span style={styles.cmdKBtnText}>Search</span>
            <kbd style={styles.cmdKBadge}>{isMac ? '\u2318K' : 'Ctrl+K'}</kbd>
          </button>

          {/* User avatar */}
          {user && (
            <Link
              to="/platform/account"
              aria-label={`Account: ${user.username}`}
              style={styles.avatarLink}
              title={user.username}
            >
              <div style={styles.avatar}>
                {userInitial}
              </div>
            </Link>
          )}
        </div>
      </header>

      <div style={styles.body}>
        {/* Sidebar */}
        <nav
          role="navigation"
          aria-label="Platform navigation"
          style={{
            ...styles.sidebar,
            ...(sidebarOpen ? {} : styles.sidebarCollapsed),
          }}
        >
          {/* Sidebar branding */}
          <div style={styles.sidebarBrand}>
            <span style={styles.brandText}>{tenantTheme.sidebarBrandText}</span>
          </div>

          {/* Grouped nav sections */}
          <div style={styles.navSections}>
            {visibleSections.map(section => (
              <SidebarSection
                key={section.label}
                section={section}
                location={location.pathname}
                collapsed={!!collapsedSections[section.label]}
                onToggle={() => toggleSection(section.label)}
              />
            ))}
          </div>

          {/* Sidebar footer: Cmd+K hint */}
          <div style={styles.sidebarFooter}>
            <button
              onClick={openPalette}
              style={styles.sidebarCmdBtn}
              aria-label="Open command palette"
              title={`${isMac ? '\u2318' : 'Ctrl'}+K`}
            >
              <span style={styles.sidebarCmdIcon}><Search size={14} /></span>
              <span style={styles.sidebarCmdLabel}>Search & navigate</span>
              <kbd style={styles.sidebarCmdKbd}>{isMac ? '\u2318K' : '\u2303K'}</kbd>
            </button>
          </div>
        </nav>

        {/* Main content */}
        <main style={styles.content}>
          {children}
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={paletteOpen}
        onClose={closePalette}
        commands={commands}
      />

      {/* Responsive CSS + fade animation */}
      <style>{`
        @media (max-width: 768px) {
          .platform-sidebar {
            position: fixed !important;
            z-index: 200;
            top: 56px;
            left: 0;
            height: calc(100vh - 56px);
            transform: translateX(0);
            transition: transform 0.2s ease;
          }
          .platform-sidebar-collapsed {
            transform: translateX(-100%) !important;
          }
        }
        @keyframes cmdFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const SIDEBAR_WIDTH = 220;
const TOPBAR_HEIGHT = 56;

const styles: Record<string, CSSProperties> = {
  shell: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    background: 'var(--platform-bg-page)',
    fontFamily: 'var(--platform-font-sans)',
  },
  topBar: {
    height: `${TOPBAR_HEIGHT}px`,
    background: 'linear-gradient(135deg, var(--platform-header-gradient-start) 0%, var(--platform-header-gradient-end) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    position: 'sticky' as const,
    top: 0,
    zIndex: 100,
    flexShrink: 0,
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  menuBtn: {
    background: 'none',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: 'pointer',
    padding: '6px 8px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
  },
  topLogo: {
    height: '28px',
    width: 'auto',
  },
  topTitle: {
    fontSize: '15px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: '0.3px',
  },
  cmdKBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(255,255,255,0.10)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.20)',
    color: 'rgba(255,255,255,0.80)',
    cursor: 'pointer',
    padding: '5px 10px 5px 12px',
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: 'var(--platform-font-sans)',
  },
  cmdKBtnText: {
    fontWeight: 400,
  },
  cmdKBadge: {
    fontSize: '11px',
    background: 'rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.75)',
    padding: '1px 6px',
    borderRadius: '4px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.25)',
    fontFamily: 'inherit',
    fontWeight: 500,
  },
  avatarLink: {
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
  },
  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.2)',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--platform-text-inverse)',
    cursor: 'pointer',
  },
  body: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
  },
  sidebar: {
    width: `${SIDEBAR_WIDTH}px`,
    minWidth: `${SIDEBAR_WIDTH}px`,
    background: 'var(--platform-bg-surface)',
    borderRightWidth: '1px',
    borderRightStyle: 'solid',
    borderRightColor: 'var(--platform-color-neutral-200)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
    transition: 'width 0.2s ease, min-width 0.2s ease',
    flexShrink: 0,
  },
  sidebarCollapsed: {
    width: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
  sidebarBrand: {
    padding: '16px 16px 12px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border-subtle)',
    marginBottom: '8px',
  },
  brandText: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--platform-color-neutral-900)',
    letterSpacing: '0.3px',
    whiteSpace: 'nowrap' as const,
  },
  navSections: {
    padding: '0 0 16px',
    flex: 1,
  },
  sidebarFooter: {
    padding: '8px',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--platform-color-neutral-300)',
  },
  sidebarCmdBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 12px',
    background: 'none',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--platform-color-neutral-300)',
    borderRadius: '8px',
    cursor: 'pointer',
    color: 'var(--platform-color-neutral-600)',
    fontSize: '13px',
    fontFamily: 'var(--platform-font-sans)',
  },
  sidebarCmdIcon: {
    fontSize: '14px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
  },
  sidebarCmdLabel: {
    flex: 1,
    textAlign: 'left' as const,
    color: 'var(--platform-color-neutral-600)',
    fontWeight: 400,
  },
  sidebarCmdKbd: {
    fontSize: '10px',
    background: 'var(--platform-bg-subtle)',
    color: 'var(--platform-color-neutral-600)',
    padding: '1px 5px',
    borderRadius: '3px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--platform-border-default)',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  content: {
    flex: 1,
    overflow: 'auto',
    background: 'var(--platform-bg-page)',
    minWidth: 0,
  },
};
