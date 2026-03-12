/**
 * MaintenanceList Page — /platform/maintenance
 *
 * Displays resident maintenance requests with:
 * - Status badges with color coding: OPEN (blue), IN_PROGRESS (yellow), COMPLETED (green), CANCELLED (gray)
 * - Priority indicator: LOW, MEDIUM, HIGH, URGENT
 * - Filter by status, category, priority
 * - Cursor-based pagination
 * - Click navigates to detail view (/platform/maintenance/:id)
 *
 * ROLE-BASED DISPLAY:
 * - VIEWER (resident): sees their own requests
 * - MANAGER+: sees all requests with unit filter
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MaintenanceRequest, MaintenanceStatus, MaintenancePriority, MaintenanceListResponse } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { Wrench, AlertTriangle } from 'lucide-react';
import '../styles/tokens.css';

// --- Status badge config ---
const STATUS_CONFIG: Record<MaintenanceStatus, { label: string; color: string; bg: string }> = {
  OPEN:        { label: 'Open',        color: 'var(--platform-status-open)',        bg: 'var(--platform-status-open-bg)' },
  ASSIGNED:    { label: 'Assigned',    color: 'var(--platform-status-acknowledged)', bg: 'var(--platform-status-acknowledged-bg)' },
  IN_PROGRESS: { label: 'In Progress', color: 'var(--platform-status-in-progress)', bg: 'var(--platform-status-in-progress-bg)' },
  RESOLVED:    { label: 'Resolved',    color: 'var(--platform-status-completed)',   bg: 'var(--platform-status-completed-bg)' },
  CLOSED:      { label: 'Closed',      color: 'var(--platform-status-cancelled)',   bg: 'var(--platform-status-cancelled-bg)' },
};

const PRIORITY_CONFIG: Record<MaintenancePriority, { label: string; color: string }> = {
  LOW:    { label: 'Low',    color: 'var(--platform-priority-low)' },
  MEDIUM: { label: 'Medium', color: 'var(--platform-priority-medium)' },
  HIGH:   { label: 'High',   color: 'var(--platform-priority-high)' },
  URGENT: { label: 'Urgent', color: 'var(--platform-priority-urgent)' },
};

const ALL_STATUSES: MaintenanceStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const ALL_PRIORITIES: MaintenancePriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const KNOWN_CATEGORIES = [
  'Plumbing',
  'Electrical',
  'HVAC',
  'Appliance',
  'Structural',
  'Pest Control',
  'Cleaning',
  'Security',
  'Elevator',
  'Common Area',
  'Other',
];

// --- Sub-components ---

function StatusBadge({ status }: { status: MaintenanceStatus }) {
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

function PriorityIndicator({ priority }: { priority: MaintenancePriority }) {
  const { label, color } = PRIORITY_CONFIG[priority];
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
    <span
      style={{ display: 'inline-flex', alignItems: 'center', fontSize: '13px', color: 'var(--platform-text-secondary)' }}
      data-testid={`priority-${priority}`}
    >
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

export default function MaintenanceList() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  // Filters
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<MaintenancePriority | ''>('');

  const fetchRequests = useCallback(async (cursor?: string, append = false) => {
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
      if (priorityFilter) params.set('priority', priorityFilter);
      if (cursor)         params.set('cursor', cursor);

      const qs = params.toString();
      const url = `/api/platform/maintenance${qs ? `?${qs}` : ''}`;
      const data = await api.get<MaintenanceListResponse>(url);

      setRequests(prev => append ? [...prev, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load maintenance requests');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [statusFilter, categoryFilter, priorityFilter]);

  // Re-fetch when filters change
  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleLoadMore = () => {
    if (nextCursor) fetchRequests(nextCursor, true);
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
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#ef4444',
    fontSize: '14px',
    marginBottom: '16px',
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Maintenance Requests</h1>
        <p style={subtitleStyle}>View and track maintenance requests for your unit</p>
      </div>

      {/* Filters */}
      <div style={filtersStyle} role="search" aria-label="Filter maintenance requests">
        <div style={filterGroupStyle}>
          <label style={labelStyle} htmlFor="status-filter">Status</label>
          <select
            id="status-filter"
            style={selectStyle}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as MaintenanceStatus | '')}
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

        <div style={filterGroupStyle}>
          <label style={labelStyle} htmlFor="priority-filter">Priority</label>
          <select
            id="priority-filter"
            style={selectStyle}
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value as MaintenancePriority | '')}
          >
            <option value="">All Priorities</option>
            {ALL_PRIORITIES.map(p => (
              <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
            ))}
          </select>
        </div>
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
      ) : requests.length === 0 ? (
        <EmptyState
          message="No maintenance requests found"
          description="No requests match the current filters. Try adjusting your search criteria."
          icon={<Wrench size={22} />}
        />
      ) : (
        <div style={tableContainerStyle}>
          <table style={tableStyle} aria-label="Maintenance requests list">
            <thead>
              <tr>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Priority</th>
                <th style={thStyle}>Unit</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Description</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(req => (
                <tr
                  key={req.id}
                  style={rowStyle}
                  data-testid={`maintenance-row-${req.id}`}
                  onClick={() => {
                    navigate(`/platform/maintenance/${req.id}`);
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'var(--platform-surface-hover)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '';
                  }}
                >
                  <td style={{ ...tdStyle, fontWeight: 500, maxWidth: '200px' }}>
                    {req.title}
                  </td>
                  <td style={tdStyle}>{req.category}</td>
                  <td style={tdStyle}>
                    <StatusBadge status={req.status} />
                  </td>
                  <td style={tdStyle}>
                    <PriorityIndicator priority={req.priority} />
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600 }}>
                    {req.unitNumber}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--platform-text-secondary)' }}>
                    {formatDate(req.createdAt)}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--platform-text-secondary)', maxWidth: '240px' }}>
                    {descriptionExcerpt(req.description)}
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
