/**
 * ViolationsList Page
 *
 * Displays platform violations with filtering, status badges, severity indicators,
 * and cursor-based pagination.
 *
 * ROLE-BASED DISPLAY:
 * - VIEWER: may only see their unit's violations (filter by unitNumber passed externally)
 * - MANAGER+: sees all violations with unit/resident filter controls
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Violation, ViolationStatus, ViolationSeverity, ViolationsListResponse } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import '../styles/tokens.css';

// --- Status badge config ---
const STATUS_CONFIG: Record<ViolationStatus, { label: string; color: string; bg: string }> = {
  REPORTED:     { label: 'Reported',     color: 'var(--platform-status-open)',         bg: 'var(--platform-status-open-bg)' },
  UNDER_REVIEW: { label: 'Under Review', color: 'var(--platform-status-acknowledged)', bg: 'var(--platform-status-acknowledged-bg)' },
  CONFIRMED:    { label: 'Confirmed',    color: 'var(--platform-status-limited)',      bg: 'var(--platform-status-limited-bg)' },
  APPEALED:     { label: 'Appealed',     color: 'var(--platform-status-appealed)',     bg: 'var(--platform-status-appealed-bg)' },
  RESOLVED:     { label: 'Resolved',     color: 'var(--platform-status-resolved)',     bg: 'var(--platform-status-resolved-bg)' },
  DISMISSED:    { label: 'Dismissed',    color: 'var(--platform-status-dismissed)',    bg: 'var(--platform-status-dismissed-bg)' },
};

const SEVERITY_CONFIG: Record<ViolationSeverity, { label: string; color: string }> = {
  LOW:    { label: 'Low',    color: 'var(--platform-severity-low)' },
  MEDIUM: { label: 'Medium', color: 'var(--platform-severity-medium)' },
  HIGH:   { label: 'High',   color: 'var(--platform-severity-high)' },
};

const ALL_STATUSES: ViolationStatus[] = ['REPORTED', 'UNDER_REVIEW', 'CONFIRMED', 'APPEALED', 'RESOLVED', 'DISMISSED'];

// Common categories for filter dropdown
const KNOWN_CATEGORIES = [
  'Noise',
  'Parking',
  'Pet',
  'Cleanliness',
  'Lease',
  'Safety',
  'Property Damage',
  'Unauthorized Occupant',
  'Other',
];

// --- Sub-components ---

function StatusBadge({ status }: { status: ViolationStatus }) {
  const { label, color, bg } = STATUS_CONFIG[status];
  const style: CSSProperties = {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 600,
    color,
    backgroundColor: bg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color,
    whiteSpace: 'nowrap',
  };
  return <span style={style} data-testid={`status-badge-${status}`}>{label}</span>;
}

function SeverityIndicator({ severity }: { severity: ViolationSeverity }) {
  const { label, color } = SEVERITY_CONFIG[severity];
  const dotStyle: CSSProperties = {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: color,
    marginRight: 6,
    verticalAlign: 'middle',
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '13px', color: 'var(--platform-text-secondary)' }}
          data-testid={`severity-${severity}`}>
      <span style={dotStyle} />
      {label}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function descriptionExcerpt(text: string, maxLen = 80): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

// --- Main page ---

interface ViolationsListProps {
  /** Optional unit number filter (for VIEWER role, pre-filtered) */
  unitNumberFilter?: string;
}

export default function ViolationsList({ unitNumberFilter }: ViolationsListProps = {}) {
  const navigate = useNavigate();
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  // Filters
  const [statusFilter, setStatusFilter] = useState<ViolationStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState(unitNumberFilter ?? '');

  const fetchViolations = useCallback(async (cursor?: string, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const params = new URLSearchParams();
      if (statusFilter)   params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (unitFilter)     params.set('unitNumber', unitFilter);
      if (cursor)         params.set('cursor', cursor);

      const qs = params.toString();
      const url = `/api/platform/violations${qs ? `?${qs}` : ''}`;
      const data = await api.get<ViolationsListResponse>(url);

      setViolations(prev => append ? [...prev, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load violations');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [statusFilter, categoryFilter, unitFilter]);

  // Re-fetch when filters change
  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  const handleLoadMore = () => {
    if (nextCursor) fetchViolations(nextCursor, true);
  };

  // --- Styles ---
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
    marginBottom: '4px',
  };

  const subtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
  };

  const filtersStyle: CSSProperties = {
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

  const selectStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '7px 12px',
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
    minWidth: '140px',
  };

  const inputStyle: CSSProperties = {
    ...selectStyle,
    minWidth: '120px',
  };

  const tableContainerStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    overflow: 'hidden',
  };

  const tableStyle: CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  };

  const thStyle: CSSProperties = {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--platform-text-secondary)',
    backgroundColor: 'var(--platform-bg)',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const tdStyle: CSSProperties = {
    padding: '13px 16px',
    color: 'var(--platform-text-primary)',
    verticalAlign: 'middle',
  };

  const rowStyle: CSSProperties = {
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border)',
    cursor: 'pointer',
    transition: 'background 0.15s',
  };

  const loadMoreStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    padding: '16px',
  };

  const loadMoreBtnStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-accent)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-accent)',
    borderRadius: '6px',
    padding: '8px 24px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  };

  const errorStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#fff0f0',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#fbc2c4',
    borderRadius: '8px',
    color: '#c62828',
    fontSize: '14px',
    marginBottom: '16px',
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Violations</h1>
        <p style={subtitleStyle}>View and track platform violations for your unit</p>
      </div>

      {/* Filters */}
      <div style={filtersStyle} role="search" aria-label="Filter violations">
        <div style={filterGroupStyle}>
          <label style={labelStyle} htmlFor="status-filter">Status</label>
          <select
            id="status-filter"
            style={selectStyle}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as ViolationStatus | '')}
          >
            <option value="">All Statuses</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>
        </div>

        <div style={filterGroupStyle}>
          <label style={labelStyle} htmlFor="category-filter">Category</label>
          <select
            id="category-filter"
            style={selectStyle}
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {KNOWN_CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Unit filter (for managers / admins) */}
        {!unitNumberFilter && (
          <div style={filterGroupStyle}>
            <label style={labelStyle} htmlFor="unit-filter">Unit</label>
            <input
              id="unit-filter"
              type="text"
              placeholder="e.g. 4B"
              style={inputStyle}
              value={unitFilter}
              onChange={e => setUnitFilter(e.target.value)}
              aria-label="Filter by unit number"
            />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={errorStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <LoadingSpinner size="lg" />
        </div>
      ) : violations.length === 0 ? (
        <EmptyState
          message="No violations found"
          description="No violations match the current filters. Try adjusting your search criteria."
          icon={<CheckCircle size={22} />}
        />
      ) : (
        <div style={tableContainerStyle}>
          <table style={tableStyle} aria-label="Violations list">
            <thead>
              <tr>
                <th style={thStyle}>Unit</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Severity</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Description</th>
              </tr>
            </thead>
            <tbody>
              {violations.map(v => (
                <tr
                  key={v.id}
                  style={rowStyle}
                  data-testid={`violation-row-${v.id}`}
                  onClick={() => {
                    navigate(`/platform/violations/${v.id}`);
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'var(--platform-surface-hover)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '';
                  }}
                >
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{v.unitNumber}</span>
                  </td>
                  <td style={tdStyle}>{v.category}</td>
                  <td style={tdStyle}>
                    <StatusBadge status={v.status} />
                  </td>
                  <td style={tdStyle}>
                    <SeverityIndicator severity={v.severity} />
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--platform-text-secondary)' }}>
                    {formatDate(v.issuedAt)}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--platform-text-secondary)', maxWidth: '280px' }}>
                    {descriptionExcerpt(v.description)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Load more */}
          {nextCursor && (
            <div style={loadMoreStyle}>
              <button
                style={loadMoreBtnStyle}
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
