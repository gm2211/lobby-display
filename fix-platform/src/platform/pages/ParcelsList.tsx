/**
 * ParcelsList Page — /platform/parcels
 *
 * Displays parcels with:
 * - Pending tab (RECEIVED / NOTIFIED) and History tab (PICKED_UP)
 * - Status badges: RECEIVED (blue), NOTIFIED (yellow), PICKED_UP (green)
 * - Filter by status and unit number
 * - Cursor-based pagination (Load More)
 * - Role-aware: residents see their own; CONCIERGE+ sees all with unit filter
 *
 * API: GET /api/platform/parcels → { items: Parcel[], nextCursor?: string }
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import type { Parcel, ParcelStatus, ParcelsListResponse } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { Package } from 'lucide-react';
import '../styles/tokens.css';

// ---- Status badge config ----

type StatusConfig = { label: string; color: string; bg: string };

const STATUS_CONFIG: Record<ParcelStatus, StatusConfig> = {
  RECEIVED:  { label: 'Received',  color: 'var(--platform-status-received)',  bg: 'var(--platform-status-received-bg)' },
  NOTIFIED:  { label: 'Notified',  color: 'var(--platform-status-notified)',  bg: 'var(--platform-status-notified-bg)' },
  PICKED_UP: { label: 'Picked Up', color: 'var(--platform-status-picked-up)', bg: 'var(--platform-status-picked-up-bg)' },
};

const PENDING_STATUSES: ParcelStatus[] = ['RECEIVED', 'NOTIFIED'];
const HISTORY_STATUSES: ParcelStatus[] = ['PICKED_UP'];

type TabKey = 'pending' | 'history';

// ---- Sub-components ----

function StatusBadge({ status }: { status: ParcelStatus }) {
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
  return (
    <span style={style} data-testid={`status-badge-${status}`}>
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

// ---- Main component ----

interface ParcelsListProps {
  /** Pre-set unit filter (for VIEWER/resident role) */
  unitNumberFilter?: string;
}

export default function ParcelsList({ unitNumberFilter }: ParcelsListProps = {}) {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  // Tab: pending (RECEIVED/NOTIFIED) or history (PICKED_UP)
  const [activeTab, setActiveTab] = useState<TabKey>('pending');

  // Filters
  const [statusFilter, setStatusFilter] = useState<ParcelStatus | ''>('');
  const [unitFilter, setUnitFilter] = useState(unitNumberFilter ?? '');

  const fetchParcels = useCallback(async (cursor?: string, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);

      const qs = params.toString();
      const url = `/api/platform/parcels${qs ? `?${qs}` : ''}`;
      const data = await api.get<ParcelsListResponse>(url);

      setParcels(prev => append ? [...prev, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load parcels');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchParcels();
  }, [fetchParcels]);

  const handleLoadMore = () => {
    if (nextCursor) fetchParcels(nextCursor, true);
  };

  // ---- Derive display list ----
  const tabStatuses = activeTab === 'pending' ? PENDING_STATUSES : HISTORY_STATUSES;

  const displayed = parcels.filter(p => {
    // Must be in the active tab's statuses
    if (!tabStatuses.includes(p.status)) return false;
    // Status filter (only applies within the tab)
    if (statusFilter && p.status !== statusFilter) return false;
    // Unit filter
    if (unitFilter && !p.unitNumber.toLowerCase().includes(unitFilter.toLowerCase())) return false;
    return true;
  });

  // Pending / history counts for tab labels
  const pendingCount = parcels.filter(p => PENDING_STATUSES.includes(p.status)).length;
  const historyCount = parcels.filter(p => HISTORY_STATUSES.includes(p.status)).length;

  // ---- Styles ----
  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '1100px',
    margin: '0 auto',
  };

  const headerStyle: CSSProperties = {
    marginBottom: '20px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    marginBottom: '4px',
    margin: 0,
  };

  const subtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    marginTop: '4px',
    marginBottom: 0,
  };

  const tabsStyle: CSSProperties = {
    display: 'flex',
    gap: '4px',
    marginBottom: '20px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border)',
    paddingBottom: '0',
  };

  const getTabStyle = (tab: TabKey): CSSProperties => ({
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: activeTab === tab ? 600 : 400,
    color: activeTab === tab ? 'var(--platform-accent)' : 'var(--platform-text-secondary)',
    background: 'transparent',
    borderWidth: 0,
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: activeTab === tab ? 'var(--platform-accent)' : 'transparent',
    cursor: 'pointer',
    marginBottom: '-1px',
    transition: 'color 0.15s, border-color 0.15s',
  });

  const filtersStyle: CSSProperties = {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
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
        <h1 style={titleStyle}>Parcels</h1>
        <p style={subtitleStyle}>Track incoming packages and deliveries</p>
      </div>

      {/* Tabs */}
      <div style={tabsStyle} role="tablist" aria-label="Parcel views">
        <button
          role="tab"
          aria-selected={activeTab === 'pending'}
          style={getTabStyle('pending')}
          onClick={() => {
            setActiveTab('pending');
            setStatusFilter('');
          }}
        >
          Pending
          {pendingCount > 0 && (
            <span
              style={{
                marginLeft: '8px',
                backgroundColor: 'var(--platform-accent)',
                color: '#fff',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
                padding: '1px 7px',
              }}
            >
              {pendingCount}
            </span>
          )}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'history'}
          style={getTabStyle('history')}
          onClick={() => {
            setActiveTab('history');
            setStatusFilter('');
          }}
        >
          History
          {historyCount > 0 && (
            <span
              style={{
                marginLeft: '8px',
                backgroundColor: 'var(--platform-text-muted)',
                color: 'var(--platform-text-primary)',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
                padding: '1px 7px',
              }}
            >
              {historyCount}
            </span>
          )}
        </button>
      </div>

      {/* Filters */}
      <div style={filtersStyle} role="search" aria-label="Filter parcels">
        <div style={filterGroupStyle}>
          <label style={labelStyle} htmlFor="status-filter">Status</label>
          <select
            id="status-filter"
            style={selectStyle}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as ParcelStatus | '')}
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            {tabStatuses.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>
        </div>

        {/* Unit filter (hidden if unitNumberFilter is pre-set from parent) */}
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
              aria-label="Filter by unit"
            />
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div style={errorStyle} role="alert">
          <span>Failed to load parcels: {error}</span>
          <button
            style={retryBtnStyle}
            onClick={() => fetchParcels()}
            aria-label="Retry"
          >
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <LoadingSpinner size="lg" label="Loading parcels..." />
        </div>
      ) : displayed.length === 0 ? (
        <EmptyState
          icon={<Package size={22} />}
          message="No parcels found"
          description={
            unitFilter || statusFilter
              ? 'Try adjusting your filters.'
              : activeTab === 'pending'
              ? 'There are no pending parcels at this time.'
              : 'No parcels have been picked up yet.'
          }
        />
      ) : (
        <div style={tableContainerStyle}>
          <table style={tableStyle} aria-label="Parcels list">
            <thead>
              <tr>
                <th style={thStyle}>Tracking #</th>
                <th style={thStyle}>Carrier</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Unit / Recipient</th>
                <th style={thStyle}>Received</th>
                <th style={thStyle}>Description</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(parcel => (
                <tr
                  key={parcel.id}
                  style={rowStyle}
                  data-testid={`parcel-row-${parcel.id}`}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                      'var(--platform-surface-hover)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '';
                  }}
                >
                  {/* Tracking Number */}
                  <td style={tdStyle}>
                    <span
                      style={{
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        color: 'var(--platform-accent)',
                      }}
                    >
                      {parcel.trackingNumber}
                    </span>
                  </td>

                  {/* Carrier */}
                  <td style={{ ...tdStyle, color: 'var(--platform-text-secondary)' }}>
                    {parcel.carrier}
                  </td>

                  {/* Status badge */}
                  <td style={tdStyle}>
                    <StatusBadge status={parcel.status} />
                  </td>

                  {/* Unit / Recipient */}
                  <td style={tdStyle}>
                    <div>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                        {parcel.unitNumber}
                      </span>
                      {parcel.recipientName && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--platform-text-secondary)',
                            marginTop: '2px',
                          }}
                        >
                          {parcel.recipientName}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Received date */}
                  <td
                    style={{
                      ...tdStyle,
                      whiteSpace: 'nowrap',
                      color: 'var(--platform-text-secondary)',
                    }}
                  >
                    {formatDate(parcel.receivedAt)}
                  </td>

                  {/* Description */}
                  <td
                    style={{
                      ...tdStyle,
                      color: 'var(--platform-text-secondary)',
                      maxWidth: '260px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={parcel.description ?? undefined}
                  >
                    {parcel.description ?? <span style={{ fontStyle: 'italic' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Load More */}
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
