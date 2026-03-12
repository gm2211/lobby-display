/**
 * ShiftSchedule Page (spec §4.16)
 *
 * Displays shift schedule for security/concierge staff with filtering,
 * status management, and key log tracking.
 *
 * ROLE-BASED ACCESS:
 * - SECURITY/CONCIERGE: View shifts, start/complete own shifts, manage keys
 * - MANAGER: Full CRUD on shifts, can cancel any shift
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import type { Shift, ShiftStatus, ShiftType, KeyLog } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import '../styles/tokens.css';

const STATUS_CONFIG: Record<ShiftStatus, { label: string; color: string; bg: string }> = {
  SCHEDULED:   { label: 'Scheduled',   color: '#2563eb', bg: '#eff6ff' },
  IN_PROGRESS: { label: 'In Progress', color: '#16a34a', bg: '#f0fdf4' },
  COMPLETED:   { label: 'Completed',   color: '#6b7280', bg: '#f3f4f6' },
  CANCELLED:   { label: 'Cancelled',   color: '#dc2626', bg: '#fef2f2' },
};

const TYPE_CONFIG: Record<ShiftType, { label: string; color: string }> = {
  SECURITY:  { label: 'Security',  color: '#7c3aed' },
  CONCIERGE: { label: 'Concierge', color: '#0891b2' },
};

function StatusBadge({ status }: { status: ShiftStatus }) {
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

function TypeBadge({ shiftType }: { shiftType: ShiftType }) {
  const { label, color } = TYPE_CONFIG[shiftType];
  return (
    <span style={{ color, fontWeight: 600, fontSize: '13px' }} data-testid={`type-badge-${shiftType}`}>
      {label}
    </span>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

export default function ShiftSchedule() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [keyLogs, setKeyLogs] = useState<KeyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ShiftStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<ShiftType | ''>('');
  const [dateFilter, setDateFilter] = useState('');
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchShifts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('shiftType', typeFilter);
      if (dateFilter) params.set('date', dateFilter);

      const qs = params.toString();
      const data = await api.get(`/api/platform/shifts${qs ? `?${qs}` : ''}`);
      setShifts(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shifts');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, dateFilter]);

  const fetchKeyLogs = useCallback(async () => {
    try {
      const data = await api.get('/api/platform/shifts/keys');
      setKeyLogs(data);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => { fetchShifts(); }, [fetchShifts]);
  useEffect(() => { if (showKeyPanel) fetchKeyLogs(); }, [showKeyPanel, fetchKeyLogs]);

  async function handleAction(shiftId: string, action: 'start' | 'complete' | 'cancel') {
    try {
      setActionLoading(shiftId);
      await api.post(`/api/platform/shifts/${shiftId}/${action}`, {});
      await fetchShifts();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} shift`);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Shift Schedule</h1>
        <button
          style={styles.keyButton}
          onClick={() => setShowKeyPanel(!showKeyPanel)}
          data-testid="toggle-keys"
        >
          {showKeyPanel ? 'Hide Keys' : 'Key Log'}
        </button>
      </div>

      {error && <div style={styles.error} data-testid="error-message">{error}</div>}

      {/* Filters */}
      <div style={styles.filters}>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          style={styles.filterInput}
          data-testid="date-filter"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ShiftStatus | '')}
          style={styles.filterSelect}
          data-testid="status-filter"
        >
          <option value="">All Statuses</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ShiftType | '')}
          style={styles.filterSelect}
          data-testid="type-filter"
        >
          <option value="">All Types</option>
          <option value="SECURITY">Security</option>
          <option value="CONCIERGE">Concierge</option>
        </select>
      </div>

      {/* Shift list */}
      {shifts.length === 0 ? (
        <EmptyState message="No shifts found for the selected filters." />
      ) : (
        <div style={styles.list} data-testid="shift-list">
          {shifts.map((shift) => (
            <div key={shift.id} style={styles.card} data-testid={`shift-${shift.id}`}>
              <div style={styles.cardHeader}>
                <TypeBadge shiftType={shift.shiftType} />
                <StatusBadge status={shift.status} />
              </div>
              <div style={styles.cardBody}>
                <div style={styles.timeRow}>
                  <span style={styles.timeLabel}>Start:</span> {formatTime(shift.startTime)}
                </div>
                <div style={styles.timeRow}>
                  <span style={styles.timeLabel}>End:</span> {formatTime(shift.endTime)}
                </div>
                <div style={styles.timeRow}>
                  <span style={styles.timeLabel}>Duration:</span> {formatDuration(shift.startTime, shift.endTime)}
                </div>
                {shift.assignee && (
                  <div style={styles.timeRow}>
                    <span style={styles.timeLabel}>Assignee:</span> Unit {shift.assignee.unitNumber ?? 'N/A'} ({shift.assignee.role})
                  </div>
                )}
                {shift.notes && (
                  <div style={styles.notes}>{shift.notes}</div>
                )}
              </div>
              <div style={styles.cardActions}>
                {shift.status === 'SCHEDULED' && (
                  <button
                    style={styles.actionBtn}
                    onClick={() => handleAction(shift.id, 'start')}
                    disabled={actionLoading === shift.id}
                    data-testid={`start-${shift.id}`}
                  >
                    Start Shift
                  </button>
                )}
                {shift.status === 'IN_PROGRESS' && (
                  <button
                    style={styles.actionBtn}
                    onClick={() => handleAction(shift.id, 'complete')}
                    disabled={actionLoading === shift.id}
                    data-testid={`complete-${shift.id}`}
                  >
                    Complete Shift
                  </button>
                )}
                {(shift.status === 'SCHEDULED' || shift.status === 'IN_PROGRESS') && (
                  <button
                    style={{ ...styles.actionBtn, ...styles.cancelBtn }}
                    onClick={() => handleAction(shift.id, 'cancel')}
                    disabled={actionLoading === shift.id}
                    data-testid={`cancel-${shift.id}`}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Key Log Panel */}
      {showKeyPanel && (
        <div style={styles.keyPanel} data-testid="key-panel">
          <h2 style={styles.keyPanelTitle}>Key Log</h2>
          {keyLogs.length === 0 ? (
            <EmptyState message="No key logs recorded." />
          ) : (
            keyLogs.map((log) => (
              <div key={log.id} style={styles.keyRow} data-testid={`key-${log.id}`}>
                <span style={{ fontWeight: 600 }}>{log.keyName}</span>
                <span style={{
                  color: log.action === 'CHECK_OUT' ? '#dc2626' : '#16a34a',
                  fontWeight: 500,
                }}>
                  {log.action === 'CHECK_OUT' ? 'Checked Out' : 'Returned'}
                </span>
                <span style={{ color: '#6b7280', fontSize: '13px' }}>
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: { padding: '24px 32px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  title: { fontSize: '24px', fontWeight: 600, color: '#1a1a2e' },
  keyButton: {
    padding: '8px 16px', borderRadius: '8px', borderWidth: 1, borderStyle: 'solid',
    borderColor: '#7c3aed', backgroundColor: '#f5f3ff', color: '#7c3aed',
    fontWeight: 600, cursor: 'pointer', fontSize: '14px',
  },
  error: {
    padding: '12px 16px', borderRadius: '8px', backgroundColor: '#fef2f2',
    color: '#dc2626', marginBottom: '16px', fontSize: '14px',
  },
  filters: { display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' as const },
  filterInput: {
    padding: '8px 12px', borderRadius: '8px', borderWidth: 1, borderStyle: 'solid',
    borderColor: '#d1d5db', fontSize: '14px',
  },
  filterSelect: {
    padding: '8px 12px', borderRadius: '8px', borderWidth: 1, borderStyle: 'solid',
    borderColor: '#d1d5db', fontSize: '14px', backgroundColor: '#fff',
  },
  list: { display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  card: {
    borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: '12px',
    padding: '16px', backgroundColor: '#fff',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  cardBody: { marginBottom: '12px' },
  timeRow: { fontSize: '14px', color: '#374151', marginBottom: '4px' },
  timeLabel: { fontWeight: 600, marginRight: '6px', color: '#6b7280' },
  notes: { marginTop: '8px', fontSize: '13px', color: '#6b7280', fontStyle: 'italic' },
  cardActions: { display: 'flex', gap: '8px' },
  actionBtn: {
    padding: '6px 14px', borderRadius: '8px', borderWidth: 1, borderStyle: 'solid',
    borderColor: '#2563eb', backgroundColor: '#eff6ff', color: '#2563eb',
    fontWeight: 500, cursor: 'pointer', fontSize: '13px',
  },
  cancelBtn: {
    borderColor: '#dc2626', backgroundColor: '#fef2f2', color: '#dc2626',
  },
  keyPanel: {
    marginTop: '24px', padding: '16px', borderWidth: 1, borderStyle: 'solid',
    borderColor: '#e5e7eb', borderRadius: '12px', backgroundColor: '#fafafa',
  },
  keyPanelTitle: { fontSize: '18px', fontWeight: 600, marginBottom: '12px', color: '#1a1a2e' },
  keyRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: '#e5e7eb',
  },
};
