/**
 * DirectoryPage — /platform/directory
 *
 * Building directory for residents and staff.
 *
 * FEATURES:
 * - Searchable card layout (search by name or unit)
 * - Floor filter (derived from unit numbers)
 * - Alphabetical sort by name
 * - Privacy: only shows public (visible=true) contact info
 * - Board member badge for board members
 * - Role display
 *
 * API: GET /api/platform/directory → DirectoryEntry[]
 *
 * RELATED FILES:
 * - src/platform/types.ts            - DirectoryEntry type
 * - src/platform/PlatformRouter.tsx  - route registration
 */
import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import type { DirectoryEntry } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { BookUser } from 'lucide-react';
import '../styles/tokens.css';

// ---- Helpers ----

/** Extract floor number from unit number (leading digits). e.g. "12C" → "12", "3A" → "3" */
function getFloor(unitNumber: string | null | undefined): string | null {
  if (!unitNumber) return null;
  const match = unitNumber.match(/^(\d+)/);
  return match ? match[1] : null;
}

function formatRole(role: string): string {
  return role
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ---- Sub-components ----

interface DirectoryCardProps {
  entry: DirectoryEntry;
}

function DirectoryCard({ entry }: DirectoryCardProps) {
  const [hovered, setHovered] = useState(false);
  const unitNumber = entry.user?.unitNumber;
  const floor = getFloor(unitNumber);

  const cardStyle: CSSProperties = {
    backgroundColor: hovered ? 'var(--platform-surface-hover)' : 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: entry.boardMember ? 'var(--platform-pinned)' : 'var(--platform-border)',
    borderRadius: '10px',
    padding: '16px 20px',
    cursor: 'default',
    transition: 'background 0.15s, border-color 0.15s',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: 0,
  };

  const nameStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: 0,
    lineHeight: 1.3,
  };

  const badgeRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  };

  const roleBadgeStyle: CSSProperties = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: 'var(--platform-badge-bg)',
    color: 'var(--platform-badge-text)',
    letterSpacing: '0.03em',
  };

  const boardMemberBadgeStyle: CSSProperties = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 700,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    color: 'var(--platform-pinned)',
    letterSpacing: '0.03em',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-pinned)',
  };

  const detailsStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '4px',
  };

  const detailRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: 'var(--platform-text-secondary)',
  };

  const iconStyle: CSSProperties = {
    fontSize: '12px',
    flexShrink: 0,
    width: '16px',
    textAlign: 'center',
  };

  const contactLinkStyle: CSSProperties = {
    color: 'var(--platform-accent)',
    textDecoration: 'none',
    fontSize: '13px',
  };

  return (
    <div
      style={cardStyle}
      data-testid={`directory-entry-${entry.id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Name */}
      <h3 style={nameStyle} data-testid="entry-name">{entry.displayName}</h3>

      {/* Badges: role + board member */}
      <div style={badgeRowStyle}>
        <span style={roleBadgeStyle}>{formatRole(entry.user?.role ?? 'RESIDENT')}</span>
        {entry.boardMember && (
          <span style={boardMemberBadgeStyle}>Board Member</span>
        )}
        {entry.title && (
          <span style={{ ...roleBadgeStyle, backgroundColor: 'rgba(56, 189, 248, 0.1)', color: 'var(--platform-accent)' }}>
            {entry.title}
          </span>
        )}
      </div>

      {/* Details */}
      <div style={detailsStyle}>
        {unitNumber && (
          <div style={detailRowStyle}>
            <span style={iconStyle}>🏢</span>
            <span>
              Unit <strong style={{ color: 'var(--platform-text-primary)' }}>{unitNumber}</strong>
              {floor && <span style={{ color: 'var(--platform-text-muted)', marginLeft: '4px' }}>· Floor {floor}</span>}
            </span>
          </div>
        )}

        {entry.phone && (
          <div style={detailRowStyle}>
            <span style={iconStyle}>📞</span>
            <a href={`tel:${entry.phone}`} style={contactLinkStyle}>{entry.phone}</a>
          </div>
        )}

        {entry.email && (
          <div style={detailRowStyle}>
            <span style={iconStyle}>✉</span>
            <a href={`mailto:${entry.email}`} style={contactLinkStyle}>{entry.email}</a>
          </div>
        )}

        {entry.department && (
          <div style={detailRowStyle}>
            <span style={iconStyle}>🏬</span>
            <span>{entry.department}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Main component ----

export default function DirectoryPage() {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [floorFilter, setFloorFilter] = useState('');

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<DirectoryEntry[]>('/api/platform/directory');
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Derive unique floors from entries
  const availableFloors = useMemo(() => {
    const floors = new Set<string>();
    entries.forEach(entry => {
      const floor = getFloor(entry.user?.unitNumber);
      if (floor) floors.add(floor);
    });
    return Array.from(floors).sort((a, b) => Number(a) - Number(b));
  }, [entries]);

  // Apply search + floor filter, then sort alphabetically
  const filteredEntries = useMemo(() => {
    let result = entries.filter(entry => {
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const nameMatch = entry.displayName.toLowerCase().includes(q);
        const unitMatch = entry.user?.unitNumber?.toLowerCase().includes(q) ?? false;
        if (!nameMatch && !unitMatch) return false;
      }

      if (floorFilter) {
        const floor = getFloor(entry.user?.unitNumber);
        if (floor !== floorFilter) return false;
      }

      return true;
    });

    // Alphabetical sort by displayName
    result = [...result].sort((a, b) => a.displayName.localeCompare(b.displayName));

    return result;
  }, [entries, searchQuery, floorFilter]);

  // ---- Styles ----

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '1100px',
    margin: '0 auto',
  };

  const headerStyle: CSSProperties = {
    marginBottom: '24px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: 0,
  };

  const subtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    marginTop: '4px',
    marginBottom: 0,
  };

  const controlsStyle: CSSProperties = {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  };

  const filterGroupStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  };

  const labelStyle: CSSProperties = {
    fontSize: '12px',
    color: 'var(--platform-text-secondary)',
    fontWeight: 500,
  };

  const inputStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '7px 12px',
    fontSize: '14px',
    outline: 'none',
    minWidth: '220px',
  };

  const selectStyle: CSSProperties = {
    ...inputStyle,
    minWidth: '140px',
    cursor: 'pointer',
  };

  const countStyle: CSSProperties = {
    fontSize: '13px',
    color: 'var(--platform-text-muted)',
    marginLeft: 'auto',
    alignSelf: 'center',
  };

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
  };

  const errorStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#ef4444',
    fontSize: '14px',
    marginBottom: '16px',
  };

  const retryBtnStyle: CSSProperties = {
    backgroundColor: 'transparent',
    color: '#ef4444',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#ef4444',
    borderRadius: '6px',
    padding: '4px 12px',
    fontSize: '13px',
    cursor: 'pointer',
    marginLeft: 'auto',
    flexShrink: 0,
  };

  // ---- Render ----

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h1 style={titleStyle}>Directory</h1>
        <p style={subtitleStyle}>Building residents and staff contact directory</p>
      </div>

      {/* Error */}
      {error && (
        <div style={errorStyle} role="alert">
          <span>Failed to load directory: {error}</span>
          <button
            style={retryBtnStyle}
            onClick={fetchEntries}
            aria-label="Retry"
          >
            Retry
          </button>
        </div>
      )}

      {/* Controls */}
      {!loading && !error && (
        <div style={controlsStyle}>
          {/* Search */}
          <div style={filterGroupStyle}>
            <label style={labelStyle} htmlFor="directory-search">Search</label>
            <input
              id="directory-search"
              type="text"
              placeholder="Search by name or unit..."
              style={inputStyle}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Search directory"
            />
          </div>

          {/* Floor filter */}
          <div style={filterGroupStyle}>
            <label style={labelStyle} htmlFor="floor-filter">Floor</label>
            <select
              id="floor-filter"
              style={selectStyle}
              value={floorFilter}
              onChange={e => setFloorFilter(e.target.value)}
              aria-label="Filter by floor"
            >
              <option value="">All Floors</option>
              {availableFloors.map(floor => (
                <option key={floor} value={floor}>Floor {floor}</option>
              ))}
            </select>
          </div>

          {/* Count */}
          <span style={countStyle}>
            {filteredEntries.length} {filteredEntries.length === 1 ? 'resident' : 'residents'}
          </span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <LoadingSpinner size="lg" label="Loading directory..." />
        </div>
      ) : filteredEntries.length === 0 ? (
        <EmptyState
          icon={<BookUser size={22} />}
          message="No residents found"
          description={
            searchQuery || floorFilter
              ? 'Try adjusting your search or filter.'
              : 'No directory entries available.'
          }
        />
      ) : (
        <div style={gridStyle} aria-label="Directory listing">
          {filteredEntries.map(entry => (
            <DirectoryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
