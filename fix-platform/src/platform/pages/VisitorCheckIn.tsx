/**
 * VisitorCheckIn Page — SECURITY/CONCIERGE guard desk
 *
 * Guard-desk interface for managing visitor check-in and check-out:
 * - Search bar (by access code or name, debounced)
 * - Today's expected visitors list (name, host, unit, time, status)
 * - Check-in / check-out action buttons
 * - Visitor log history table
 * - Loading / error / empty states
 *
 * API:
 * - GET /api/platform/visitors/expected?date=YYYY-MM-DD — expected visitors for guard desk (EDITOR+)
 * - POST /api/platform/visitors/:id/checkin            — check in visitor (EDITOR+)
 * - POST /api/platform/visitors/:id/checkout           — check out visitor (EDITOR+)
 */
import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import type { Visitor, VisitorStatus, VisitorLog } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { AlertTriangle, UserCheck } from 'lucide-react';
import '../styles/tokens.css';

// --- Status config ---

const STATUS_CONFIG: Record<VisitorStatus, { label: string; color: string; bg: string }> = {
  EXPECTED:    { label: 'Expected',    color: '#c9921b', bg: '#fff3cd' },
  CHECKED_IN:  { label: 'Checked In',  color: '#2d7a47', bg: '#d4edda' },
  CHECKED_OUT: { label: 'Checked Out', color: '#1a5f8a', bg: '#d0e8f5' },
  CANCELLED:   { label: 'Cancelled',   color: '#888',    bg: '#f0f0f0' },
};

// --- Helpers ---

function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// --- Sub-components ---

function StatusBadge({ status }: { status: VisitorStatus }) {
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

// --- Main component ---

export default function VisitorCheckIn() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});

  const fetchVisitors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = getTodayDate();
      const data = await api.get<Visitor[]>(`/api/platform/visitors/expected?date=${today}`);
      setVisitors(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load visitors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVisitors();
  }, [fetchVisitors]);

  // --- Filtered visitors ---
  const filteredVisitors = useMemo(() => {
    if (!search.trim()) return visitors ?? [];
    const q = search.trim().toLowerCase();
    return (visitors ?? []).filter(v =>
      v.guestName.toLowerCase().includes(q) ||
      v.accessCode.toLowerCase().includes(q)
    );
  }, [visitors, search]);

  // --- All logs across all visitors (for history table) ---
  const allLogs = useMemo(() => {
    const logs: Array<{ log: VisitorLog; visitor: Visitor }> = [];
    for (const v of (visitors ?? [])) {
      for (const log of v.logs ?? []) {
        logs.push({ log, visitor: v });
      }
    }
    return logs.sort((a, b) =>
      new Date(b.log.timestamp).getTime() - new Date(a.log.timestamp).getTime()
    );
  }, [visitors]);

  // --- Actions ---
  const handleCheckIn = async (visitor: Visitor) => {
    setActionLoading(prev => ({ ...prev, [visitor.id]: 'checkin' }));
    try {
      await api.post(`/api/platform/visitors/${visitor.id}/checkin`);
      await fetchVisitors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check in visitor');
    } finally {
      setActionLoading(prev => {
        const next = { ...prev };
        delete next[visitor.id];
        return next;
      });
    }
  };

  const handleCheckOut = async (visitor: Visitor) => {
    setActionLoading(prev => ({ ...prev, [visitor.id]: 'checkout' }));
    try {
      await api.post(`/api/platform/visitors/${visitor.id}/checkout`);
      await fetchVisitors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check out visitor');
    } finally {
      setActionLoading(prev => {
        const next = { ...prev };
        delete next[visitor.id];
        return next;
      });
    }
  };

  // --- Styles ---
  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  };

  const headerRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '12px',
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

  const searchBarStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
  };

  const inputStyle: CSSProperties = {
    backgroundColor: 'var(--platform-bg)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '9px 14px',
    fontSize: '14px',
    outline: 'none',
    flex: '1 1 300px',
    maxWidth: '480px',
    boxSizing: 'border-box',
  };

  const refreshBtnStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-text-secondary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  };

  const tableContainerStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    overflow: 'hidden',
    marginBottom: '32px',
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
    whiteSpace: 'nowrap',
  };

  const tdStyle: CSSProperties = {
    padding: '12px 16px',
    color: 'var(--platform-text-primary)',
    verticalAlign: 'middle',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border)',
  };

  const actionBtnStyle = (variant: 'primary' | 'success' | 'secondary'): CSSProperties => ({
    backgroundColor: 'transparent',
    color:
      variant === 'primary' ? 'var(--platform-accent)' :
      variant === 'success' ? '#2d7a47' :
      'var(--platform-text-secondary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor:
      variant === 'primary' ? 'var(--platform-accent)' :
      variant === 'success' ? '#2d7a47' :
      'var(--platform-border)',
    borderRadius: '5px',
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    marginRight: '6px',
    whiteSpace: 'nowrap',
  });

  const errorAlertStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    backgroundColor: '#fff0f0',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#fbc2c4',
    borderRadius: '8px',
    color: '#c62828',
    fontSize: '14px',
    marginBottom: '20px',
  };

  const sectionTitleStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    marginBottom: '16px',
  };

  const accessCodeStyle: CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '13px',
    color: 'var(--platform-text-secondary)',
    backgroundColor: 'var(--platform-bg)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '4px',
    padding: '2px 6px',
    letterSpacing: '0.08em',
  };

  // --- Loading state ---
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerRowStyle}>
        <div>
          <h1 style={titleStyle}>Guard Desk — Visitor Check-In</h1>
          <p style={subtitleStyle}>
            Today's expected visitors and check-in/check-out management
          </p>
        </div>
        <button
          type="button"
          style={refreshBtnStyle}
          onClick={fetchVisitors}
          data-testid="refresh-btn"
        >
          Refresh
        </button>
      </div>

      {/* Global error */}
      {error && (
        <div style={errorAlertStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Search bar */}
      <div style={searchBarStyle}>
        <input
          type="text"
          placeholder="Search by name or access code..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={inputStyle}
          data-testid="visitor-search"
          aria-label="Search visitors by name or access code"
        />
        {search && (
          <span style={{ fontSize: '13px', color: 'var(--platform-text-secondary)' }}>
            {filteredVisitors.length} of {visitors.length} shown
          </span>
        )}
      </div>

      {/* Today's Expected Visitors */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={sectionTitleStyle}>
          Today's Expected Visitors
          {visitors.length > 0 && (
            <span
              style={{
                marginLeft: '10px',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--platform-text-secondary)',
              }}
            >
              ({visitors.length} total)
            </span>
          )}
        </h2>

        {filteredVisitors.length === 0 ? (
          <EmptyState
            message={search ? 'No visitors match your search' : 'No expected visitors today'}
            description={
              search
                ? 'Try searching by a different name or access code.'
                : 'No visitors are pre-registered for today.'
            }
            icon={<UserCheck size={22} />}
          />
        ) : (
          <div style={tableContainerStyle}>
            <table
              style={tableStyle}
              aria-label="Today's expected visitors"
              data-testid="visitors-table"
            >
              <thead>
                <tr>
                  <th style={thStyle}>Guest Name</th>
                  <th style={thStyle}>Access Code</th>
                  <th style={thStyle}>Host / Unit</th>
                  <th style={thStyle}>Expected Time</th>
                  <th style={thStyle}>Purpose</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredVisitors.map(visitor => {
                  const isActioning = !!actionLoading[visitor.id];
                  return (
                    <tr
                      key={visitor.id}
                      data-testid={`visitor-row-${visitor.id}`}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                          'var(--platform-surface-hover)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '';
                      }}
                    >
                      {/* Guest Name */}
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        {visitor.guestName}
                        {visitor.guestEmail && (
                          <div style={{ fontSize: '12px', color: 'var(--platform-text-secondary)', marginTop: '2px', fontWeight: 400 }}>
                            {visitor.guestEmail}
                          </div>
                        )}
                      </td>

                      {/* Access Code */}
                      <td style={tdStyle}>
                        <span style={accessCodeStyle}>{visitor.accessCode}</span>
                      </td>

                      {/* Host / Unit */}
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 500 }}>
                          {visitor.host?.displayName ?? 'Unknown Host'}
                        </span>
                        {visitor.host?.unitNumber && (
                          <span
                            style={{
                              marginLeft: '8px',
                              fontSize: '12px',
                              color: 'var(--platform-text-secondary)',
                              fontFamily: 'monospace',
                            }}
                          >
                            Unit {visitor.host.unitNumber}
                          </span>
                        )}
                      </td>

                      {/* Expected Time */}
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--platform-text-secondary)' }}>
                        {formatTime(visitor.expectedDate)}
                      </td>

                      {/* Purpose */}
                      <td style={{ ...tdStyle, color: 'var(--platform-text-secondary)', fontSize: '13px' }}>
                        {visitor.purpose ?? '—'}
                      </td>

                      {/* Status */}
                      <td style={tdStyle}>
                        <StatusBadge status={visitor.status} />
                      </td>

                      {/* Actions */}
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        {visitor.status === 'EXPECTED' && (
                          <button
                            type="button"
                            style={actionBtnStyle('primary')}
                            onClick={() => handleCheckIn(visitor)}
                            disabled={isActioning}
                            data-testid={`checkin-btn-${visitor.id}`}
                          >
                            {actionLoading[visitor.id] === 'checkin' ? 'Checking in...' : 'Check In'}
                          </button>
                        )}

                        {visitor.status === 'CHECKED_IN' && (
                          <button
                            type="button"
                            style={actionBtnStyle('success')}
                            onClick={() => handleCheckOut(visitor)}
                            disabled={isActioning}
                            data-testid={`checkout-btn-${visitor.id}`}
                          >
                            {actionLoading[visitor.id] === 'checkout' ? 'Checking out...' : 'Check Out'}
                          </button>
                        )}

                        {(visitor.status === 'CHECKED_OUT' || visitor.status === 'CANCELLED') && (
                          <span style={{ fontSize: '12px', color: 'var(--platform-text-secondary)' }}>
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Visitor Log History */}
      <div data-testid="visitor-log-section">
        <h2 style={sectionTitleStyle}>Visitor Log History</h2>

        {allLogs.length === 0 ? (
          <div
            data-testid="visitor-log-table"
            style={{
              backgroundColor: 'var(--platform-surface)',
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: 'var(--platform-border)',
              borderRadius: '10px',
              padding: '32px 24px',
              textAlign: 'center',
              color: 'var(--platform-text-secondary)',
              fontSize: '14px',
            }}
          >
            No activity logs for today.
          </div>
        ) : (
          <div style={tableContainerStyle}>
            <table
              style={tableStyle}
              aria-label="Visitor activity log"
              data-testid="visitor-log-table"
            >
              <thead>
                <tr>
                  <th style={thStyle}>Time</th>
                  <th style={thStyle}>Guest</th>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>Host / Unit</th>
                  <th style={thStyle}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {allLogs.map(({ log, visitor }) => (
                  <tr
                    key={log.id}
                    data-testid={`log-row-${log.id}`}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                        'var(--platform-surface-hover)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '';
                    }}
                  >
                    {/* Time */}
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--platform-text-secondary)', fontSize: '13px' }}>
                      {formatDateTime(log.timestamp)}
                    </td>

                    {/* Guest */}
                    <td style={{ ...tdStyle, fontWeight: 500 }}>
                      {visitor.guestName}
                      <span style={{ marginLeft: '8px' }}>
                        <span style={accessCodeStyle}>{visitor.accessCode}</span>
                      </span>
                    </td>

                    {/* Action */}
                    <td style={tdStyle}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 600,
                          backgroundColor: log.action === 'CHECK_IN' ? '#d4edda' : '#d0e8f5',
                          color: log.action === 'CHECK_IN' ? '#2d7a47' : '#1a5f8a',
                          borderWidth: 1,
                          borderStyle: 'solid',
                          borderColor: log.action === 'CHECK_IN' ? '#2d7a47' : '#1a5f8a',
                        }}
                      >
                        {log.action === 'CHECK_IN' ? 'Check In' : 'Check Out'}
                      </span>
                    </td>

                    {/* Host / Unit */}
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 500 }}>
                        {visitor.host?.displayName ?? 'Unknown Host'}
                      </span>
                      {visitor.host?.unitNumber && (
                        <span
                          style={{
                            marginLeft: '8px',
                            fontSize: '12px',
                            color: 'var(--platform-text-secondary)',
                            fontFamily: 'monospace',
                          }}
                        >
                          Unit {visitor.host.unitNumber}
                        </span>
                      )}
                    </td>

                    {/* Notes */}
                    <td style={{ ...tdStyle, color: 'var(--platform-text-secondary)', fontSize: '13px' }}>
                      {log.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
