import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

// ============================================================
// Types
// ============================================================

export interface Command {
  id: string;
  label: string;
  icon: ReactNode;
  category: 'navigation' | 'action';
  action: () => void;
  keywords?: string[];
  description?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

// ============================================================
// CommandPalette Component
// ============================================================

export default function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Filter commands based on search query
  const filteredCommands = query.trim() === ''
    ? commands
    : commands.filter(cmd => {
        const q = query.toLowerCase();
        return (
          cmd.label.toLowerCase().includes(q) ||
          cmd.description?.toLowerCase().includes(q) ||
          cmd.keywords?.some(k => k.toLowerCase().includes(q))
        );
      });

  // Reset state when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Focus input after brief delay for portal mounting
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredCommands, selectedIndex, onClose],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  const categoryLabels: Record<string, string> = {
    navigation: 'Navigate to',
    action: 'Quick actions',
  };

  // Group by category for display
  const grouped: Record<string, Command[]> = {};
  for (const cmd of filteredCommands) {
    if (!grouped[cmd.category]) grouped[cmd.category] = [];
    grouped[cmd.category].push(cmd);
  }
  const categoryOrder = ['navigation', 'action'] as const;

  // Flat index tracker for keyboard navigation
  let flatIndex = 0;

  return createPortal(
    <div
      style={backdropStyle}
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
      aria-label="Command palette"
    >
      <div style={paletteStyle}>
        {/* Search input */}
        <div style={inputWrapStyle}>
          <span style={searchIconStyle} aria-hidden="true">🔍</span>
          <input
            ref={inputRef}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={filteredCommands.length > 0}
            aria-controls="cmd-palette-list"
            aria-activedescendant={
              filteredCommands[selectedIndex]
                ? `cmd-item-${filteredCommands[selectedIndex].id}`
                : undefined
            }
            type="text"
            placeholder="Search or jump to..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={inputStyle}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd style={escBadgeStyle}>esc</kbd>
        </div>

        {/* Results list */}
        {filteredCommands.length === 0 ? (
          <div style={emptyStyle}>No results for &ldquo;{query}&rdquo;</div>
        ) : (
          <ul
            ref={listRef}
            id="cmd-palette-list"
            role="listbox"
            aria-label="Search results"
            style={listStyle}
          >
            {categoryOrder.map(cat => {
              const items = grouped[cat];
              if (!items || items.length === 0) return null;
              return (
                <li key={cat} role="presentation">
                  <div style={categoryHeaderStyle}>{categoryLabels[cat]}</div>
                  <ul role="group" style={groupListStyle}>
                    {items.map(cmd => {
                      const itemFlatIndex = flatIndex++;
                      const isSelected = itemFlatIndex === selectedIndex;
                      return (
                        <li
                          key={cmd.id}
                          id={`cmd-item-${cmd.id}`}
                          role="option"
                          aria-selected={isSelected}
                          style={{
                            ...itemStyle,
                            ...(isSelected ? itemSelectedStyle : {}),
                          }}
                          onMouseEnter={() => setSelectedIndex(itemFlatIndex)}
                          onClick={() => {
                            cmd.action();
                            onClose();
                          }}
                        >
                          <span style={itemIconStyle} aria-hidden="true">{cmd.icon}</span>
                          <span style={itemLabelStyle}>{cmd.label}</span>
                          {cmd.description && (
                            <span style={itemDescStyle}>{cmd.description}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer hint */}
        <div style={footerStyle}>
          <span style={footerHintStyle}><kbd style={kbdStyle}>↑↓</kbd> navigate</span>
          <span style={footerHintStyle}><kbd style={kbdStyle}>↵</kbd> select</span>
          <span style={footerHintStyle}><kbd style={kbdStyle}>esc</kbd> close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ============================================================
// useCommandPalette hook — manages open state + global shortcut
// ============================================================

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      if (modKey && e.key === 'k') {
        e.preventDefault();
        setIsOpen(o => !o);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
}

// ============================================================
// usePlatformCommands hook — builds the command registry
// ============================================================

export function usePlatformCommands(onClose: () => void): Command[] {
  const navigate = useNavigate();

  const nav = useCallback(
    (to: string) => () => {
      navigate(to);
      onClose();
    },
    [navigate, onClose],
  );

  return [
    // Navigation items — matches NAV_ITEMS in PlatformLayout
    {
      id: 'nav-dashboard',
      label: 'Dashboard',
      icon: '⊞',
      category: 'navigation',
      action: nav('/platform'),
      keywords: ['home', 'overview'],
    },
    {
      id: 'nav-announcements',
      label: 'Announcements',
      icon: '📢',
      category: 'navigation',
      action: nav('/platform/announcements'),
      keywords: ['news', 'notice', 'bulletin'],
    },
    {
      id: 'nav-maintenance',
      label: 'Maintenance',
      icon: '🔧',
      category: 'navigation',
      action: nav('/platform/maintenance'),
      keywords: ['repair', 'fix', 'request'],
    },
    {
      id: 'nav-amenities',
      label: 'Amenities',
      icon: '🏊',
      category: 'navigation',
      action: nav('/platform/amenities'),
      keywords: ['pool', 'gym', 'facility'],
    },
    {
      id: 'nav-events',
      label: 'Events',
      icon: '📅',
      category: 'navigation',
      action: nav('/platform/events'),
      keywords: ['calendar', 'schedule', 'activity'],
    },
    {
      id: 'nav-bookings',
      label: 'Bookings',
      icon: '📆',
      category: 'navigation',
      action: nav('/platform/bookings'),
      keywords: ['reservation', 'book'],
    },
    {
      id: 'nav-visitors',
      label: 'Visitors',
      icon: '👤',
      category: 'navigation',
      action: nav('/platform/visitors'),
      keywords: ['guest', 'access'],
    },
    {
      id: 'nav-violations',
      label: 'Violations',
      icon: '⚠️',
      category: 'navigation',
      action: nav('/platform/violations'),
      keywords: ['rules', 'complaint'],
    },
    {
      id: 'nav-payments',
      label: 'Payments',
      icon: '💳',
      category: 'navigation',
      action: nav('/platform/payments'),
      keywords: ['billing', 'fee', 'dues', 'invoice'],
    },
    {
      id: 'nav-parcels',
      label: 'Parcels',
      icon: '📦',
      category: 'navigation',
      action: nav('/platform/parcels'),
      keywords: ['package', 'delivery', 'mail'],
    },
    {
      id: 'nav-directory',
      label: 'Directory',
      icon: '📒',
      category: 'navigation',
      action: nav('/platform/directory'),
      keywords: ['residents', 'contacts', 'neighbors'],
    },
    {
      id: 'nav-forum',
      label: 'Forum',
      icon: '💬',
      category: 'navigation',
      action: nav('/platform/forum'),
      keywords: ['discussion', 'community', 'board'],
    },
    {
      id: 'nav-marketplace',
      label: 'Marketplace',
      icon: '🛍️',
      category: 'navigation',
      action: nav('/platform/marketplace'),
      keywords: ['buy', 'sell', 'classifieds'],
    },
    {
      id: 'nav-documents',
      label: 'Documents',
      icon: '📄',
      category: 'navigation',
      action: nav('/platform/documents'),
      keywords: ['files', 'rules', 'forms'],
    },
    {
      id: 'nav-training',
      label: 'Training',
      icon: '🎓',
      category: 'navigation',
      action: nav('/platform/training'),
      keywords: ['learn', 'course', 'guide'],
    },
    {
      id: 'nav-surveys',
      label: 'Surveys',
      icon: '📊',
      category: 'navigation',
      action: nav('/platform/surveys'),
      keywords: ['poll', 'vote', 'feedback'],
    },
    {
      id: 'nav-consent',
      label: 'Consent',
      icon: '✅',
      category: 'navigation',
      action: nav('/platform/consent'),
      keywords: ['agreement', 'permission'],
    },
    {
      id: 'nav-search',
      label: 'Search',
      icon: '🔍',
      category: 'navigation',
      action: nav('/platform/search'),
      keywords: ['find', 'lookup'],
    },

    // Quick actions
    {
      id: 'action-maintenance-new',
      label: 'Submit Maintenance Request',
      icon: '🔧',
      category: 'action',
      action: nav('/platform/maintenance/new'),
      keywords: ['repair', 'submit', 'request', 'new'],
    },
    {
      id: 'action-book-amenity',
      label: 'Book an Amenity',
      icon: '🏊',
      category: 'action',
      action: nav('/platform/amenities'),
      keywords: ['reserve', 'book', 'amenity'],
    },
    {
      id: 'action-forum-new',
      label: 'New Forum Thread',
      icon: '💬',
      category: 'action',
      action: nav('/platform/forum/new'),
      keywords: ['post', 'discussion', 'new thread'],
    },
    {
      id: 'action-register-visitor',
      label: 'Register a Visitor',
      icon: '👤',
      category: 'action',
      action: nav('/platform/visitors/new'),
      keywords: ['guest', 'add visitor', 'invite'],
    },
    {
      id: 'action-marketplace-new',
      label: 'Post to Marketplace',
      icon: '🛍️',
      category: 'action',
      action: nav('/platform/marketplace/new'),
      keywords: ['sell', 'listing', 'classifieds'],
    },
  ];
}

// ============================================================
// Styles
// ============================================================

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.45)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: '12vh',
  zIndex: 'var(--platform-z-modal, 400)' as unknown as number,
  animation: 'cmdFadeIn var(--platform-duration-fast, 100ms) var(--platform-ease-out, ease-out)',
};

const paletteStyle: React.CSSProperties = {
  background: 'var(--platform-bg-surface, #ffffff)',
  borderRadius: 'var(--platform-radius-2xl, 12px)',
  boxShadow: 'var(--platform-shadow-xl, 0 8px 32px rgba(0,0,0,0.12), 0 16px 64px rgba(0,0,0,0.12))',
  width: '100%',
  maxWidth: '520px',
  maxHeight: '60vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--platform-border-default, #ddd)',
};

const inputWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '14px 16px',
  borderBottomWidth: '1px',
  borderBottomStyle: 'solid',
  borderBottomColor: 'var(--platform-border-subtle, #eee)',
};

const searchIconStyle: React.CSSProperties = {
  fontSize: '16px',
  flexShrink: 0,
  opacity: 0.6,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  border: 'none',
  outline: 'none',
  fontSize: 'var(--platform-text-base, 1rem)',
  color: 'var(--platform-text-primary, #333)',
  background: 'transparent',
  fontFamily: 'var(--platform-font-sans)',
};

const escBadgeStyle: React.CSSProperties = {
  fontSize: '11px',
  background: 'var(--platform-bg-subtle, #f9f9f9)',
  color: 'var(--platform-text-muted, #888)',
  padding: '2px 6px',
  borderRadius: '4px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--platform-border-default, #ddd)',
  flexShrink: 0,
  fontFamily: 'var(--platform-font-sans)',
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: '8px 0',
  overflowY: 'auto',
  flex: 1,
};

const groupListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
};

const categoryHeaderStyle: React.CSSProperties = {
  fontSize: 'var(--platform-text-xs, 0.75rem)',
  fontWeight: 'var(--platform-weight-semibold, 600)' as unknown as number,
  color: 'var(--platform-text-muted, #888)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '8px 16px 4px',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '9px 16px',
  cursor: 'pointer',
  borderRadius: '0',
  transition: 'background var(--platform-duration-fast, 100ms)',
};

const itemSelectedStyle: React.CSSProperties = {
  background: 'var(--platform-color-primary-50, #e8f5f5)',
};

const itemIconStyle: React.CSSProperties = {
  fontSize: '16px',
  flexShrink: 0,
  width: '22px',
  textAlign: 'center',
};

const itemLabelStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 'var(--platform-text-sm, 0.875rem)',
  color: 'var(--platform-text-primary, #333)',
  fontWeight: 'var(--platform-weight-medium, 500)' as unknown as number,
};

const itemDescStyle: React.CSSProperties = {
  fontSize: 'var(--platform-text-xs, 0.75rem)',
  color: 'var(--platform-text-muted, #888)',
};

const emptyStyle: React.CSSProperties = {
  padding: '32px 16px',
  textAlign: 'center',
  fontSize: 'var(--platform-text-sm, 0.875rem)',
  color: 'var(--platform-text-muted, #888)',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  padding: '10px 16px',
  borderTopWidth: '1px',
  borderTopStyle: 'solid',
  borderTopColor: 'var(--platform-border-subtle, #eee)',
  background: 'var(--platform-bg-subtle, #f9f9f9)',
};

const footerHintStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '11px',
  color: 'var(--platform-text-muted, #888)',
};

const kbdStyle: React.CSSProperties = {
  fontSize: '10px',
  background: '#fff',
  color: 'var(--platform-text-secondary, #444)',
  padding: '1px 5px',
  borderRadius: '3px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--platform-border-default, #ddd)',
  fontFamily: 'var(--platform-font-mono)',
};
