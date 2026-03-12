/**
 * PaymentManagement Page — MANAGER+ only
 *
 * Provides a full payment management interface:
 * - Summary dashboard: total charges, total paid, overdue, outstanding balance
 * - Create charge form: select resident, amount, description, due date
 * - Payments table: sortable list with resident, amount, status, due date, paid date
 * - Actions: Mark as Paid, Issue Refund per payment
 * - Filters: by status (all/pending/paid/overdue/refunded)
 * - Loading / error / empty states
 *
 * API:
 * - GET /api/platform/payments/summary  — summary totals
 * - GET /api/platform/payments          — list all payments
 * - POST /api/platform/payments         — create charge
 * - PUT /api/platform/payments/:id      — update (mark paid, refund)
 * - GET /api/platform/users             — list users for create form
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import type { Payment, PaymentStatus, PaymentSummary, PlatformUserItem } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { AlertTriangle, CreditCard } from 'lucide-react';
import '../styles/tokens.css';

// --- Status config ---

type FilterStatus = 'all' | PaymentStatus;

const STATUS_CONFIG: Record<PaymentStatus, { label: string; color: string; bg: string }> = {
  PENDING:  { label: 'Pending',  color: '#c9921b', bg: '#fff3cd' },
  PAID:     { label: 'Paid',     color: '#2d7a47', bg: '#d4edda' },
  FAILED:   { label: 'Overdue',  color: '#b93040', bg: '#f8d7da' },
  REFUNDED: { label: 'Refunded', color: '#1a5f8a', bg: '#d0e8f5' },
};

const FILTER_LABELS: Record<FilterStatus, string> = {
  all:      'All',
  PENDING:  'Pending',
  PAID:     'Paid',
  FAILED:   'Overdue',
  REFUNDED: 'Refunded',
};

type SortField = 'amount' | 'dueDate' | 'paidAt' | 'status' | 'createdAt';
type SortDir = 'asc' | 'desc';

// --- Helper functions ---

function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(num);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// --- Sub-components ---

function StatusBadge({ status }: { status: PaymentStatus }) {
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

interface SummaryCardProps {
  testId: string;
  label: string;
  value: number;
  accent?: string;
}

function SummaryCard({ testId, label, value, accent = 'var(--platform-accent)' }: SummaryCardProps) {
  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '20px 24px',
    flex: '1 1 180px',
    minWidth: '160px',
  };
  const labelStyle: CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--platform-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '8px',
  };
  const valueStyle: CSSProperties = {
    fontSize: '24px',
    fontWeight: 700,
    color: accent,
  };

  return (
    <div style={cardStyle} data-testid={testId}>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{formatCurrency(value)}</div>
    </div>
  );
}

// --- Main component ---

export default function PaymentManagement() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [users, setUsers] = useState<PlatformUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter / sort state
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Create charge form state
  const [formUserId, setFormUserId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Per-row action loading
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, paymentsData, usersData] = await Promise.all([
        api.get<PaymentSummary>('/api/platform/payments/summary'),
        api.get<Payment[]>('/api/platform/payments'),
        api.get<PlatformUserItem[]>('/api/platform/users'),
      ]);
      setSummary(summaryData);
      setPayments(paymentsData);
      setUsers(usersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payment data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Filtered + sorted payments ---
  const filteredPayments = payments
    .filter(p => statusFilter === 'all' || p.status === statusFilter)
    .sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      if (sortField === 'amount') {
        aVal = parseFloat(a.amount);
        bVal = parseFloat(b.amount);
      } else if (sortField === 'dueDate') {
        aVal = a.dueDate ?? '';
        bVal = b.dueDate ?? '';
      } else if (sortField === 'paidAt') {
        aVal = a.paidAt ?? '';
        bVal = b.paidAt ?? '';
      } else if (sortField === 'status') {
        aVal = a.status;
        bVal = b.status;
      } else {
        aVal = a.createdAt;
        bVal = b.createdAt;
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  // --- Handle sort column click ---
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // --- Create charge ---
  const handleCreateCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formUserId) {
      setFormError('Please select a resident');
      return;
    }
    if (!formAmount || isNaN(parseFloat(formAmount)) || parseFloat(formAmount) <= 0) {
      setFormError('Please enter a valid amount');
      return;
    }
    if (!formDescription.trim()) {
      setFormError('Please enter a description');
      return;
    }

    setFormLoading(true);
    try {
      await api.post('/api/platform/payments', {
        userId: parseInt(formUserId),
        amount: parseFloat(formAmount),
        description: formDescription.trim(),
        dueDate: formDueDate || undefined,
      });
      // Reset form
      setFormUserId('');
      setFormAmount('');
      setFormDescription('');
      setFormDueDate('');
      // Refresh data
      await fetchData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create charge');
    } finally {
      setFormLoading(false);
    }
  };

  // --- Mark as paid ---
  const handleMarkPaid = async (payment: Payment) => {
    setActionLoading(prev => ({ ...prev, [payment.id]: 'marking' }));
    try {
      await api.put(`/api/platform/payments/${payment.id}`, { status: 'PAID' });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update payment');
    } finally {
      setActionLoading(prev => {
        const next = { ...prev };
        delete next[payment.id];
        return next;
      });
    }
  };

  // --- Issue refund ---
  const handleRefund = async (payment: Payment) => {
    setActionLoading(prev => ({ ...prev, [payment.id]: 'refunding' }));
    try {
      await api.put(`/api/platform/payments/${payment.id}`, { status: 'REFUNDED' });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to issue refund');
    } finally {
      setActionLoading(prev => {
        const next = { ...prev };
        delete next[payment.id];
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

  const headerStyle: CSSProperties = {
    marginBottom: '28px',
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

  const sectionTitleStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    marginBottom: '16px',
  };

  const summaryRowStyle: CSSProperties = {
    display: 'flex',
    gap: '16px',
    marginBottom: '32px',
    flexWrap: 'wrap',
  };

  const formCardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '24px',
    marginBottom: '28px',
  };

  const formRowStyle: CSSProperties = {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '16px',
  };

  const fieldGroupStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: '1 1 200px',
    minWidth: '160px',
  };

  const labelStyle: CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--platform-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  const inputStyle: CSSProperties = {
    backgroundColor: 'var(--platform-bg)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  const selectStyle: CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  };

  const submitBtnStyle: CSSProperties = {
    backgroundColor: 'var(--platform-accent)',
    color: '#fff',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '6px',
    padding: '9px 24px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    alignSelf: 'flex-end',
    opacity: formLoading ? 0.7 : 1,
  };

  const filterBarStyle: CSSProperties = {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px',
    flexWrap: 'wrap',
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

  const thSortableStyle: CSSProperties = {
    ...thStyle,
    cursor: 'pointer',
    userSelect: 'none',
  };

  const tdStyle: CSSProperties = {
    padding: '12px 16px',
    color: 'var(--platform-text-primary)',
    verticalAlign: 'middle',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border)',
  };

  const actionBtnStyle = (variant: 'primary' | 'danger'): CSSProperties => ({
    backgroundColor: 'transparent',
    color: variant === 'primary' ? 'var(--platform-accent)' : '#b93040',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: variant === 'primary' ? 'var(--platform-accent)' : '#b93040',
    borderRadius: '5px',
    padding: '5px 10px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    marginRight: '6px',
  });

  const errorAlertStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    backgroundColor: 'rgba(185, 48, 64, 0.08)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(185, 48, 64, 0.3)',
    borderRadius: '8px',
    color: '#b93040',
    fontSize: '14px',
    marginBottom: '20px',
  };

  const formErrorStyle: CSSProperties = {
    fontSize: '13px',
    color: '#b93040',
    padding: '8px 12px',
    backgroundColor: 'rgba(185, 48, 64, 0.06)',
    borderRadius: '6px',
    marginTop: '4px',
  };

  // --- Sort indicator ---
  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return ' ↕';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  // --- Filter button style ---
  const filterBtnStyle = (filter: FilterStatus): CSSProperties => {
    const active = statusFilter === filter;
    return {
      backgroundColor: active ? 'var(--platform-accent)' : 'var(--platform-surface)',
      color: active ? '#fff' : 'var(--platform-text-secondary)',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: active ? 'var(--platform-accent)' : 'var(--platform-border)',
      borderRadius: '6px',
      padding: '6px 14px',
      fontSize: '13px',
      fontWeight: 500,
      cursor: 'pointer',
    };
  };

  // --- Render ---

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
      <div style={headerStyle}>
        <h1 style={titleStyle}>Payment Management</h1>
        <p style={subtitleStyle}>Manage charges, track payments, and issue refunds</p>
      </div>

      {/* Global error */}
      {error && (
        <div style={errorAlertStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Summary dashboard */}
      {summary && (
        <div style={summaryRowStyle}>
          <SummaryCard
            testId="summary-total"
            label="Total Charges"
            value={summary.total}
            accent="var(--platform-text-primary)"
          />
          <SummaryCard
            testId="summary-paid"
            label="Total Paid"
            value={summary.paid}
            accent="#2d7a47"
          />
          <SummaryCard
            testId="summary-pending"
            label="Total Overdue/Pending"
            value={summary.pending + summary.failed}
            accent="#c9921b"
          />
          <SummaryCard
            testId="summary-outstanding"
            label="Outstanding Balance"
            value={summary.total - summary.paid}
            accent="#b93040"
          />
        </div>
      )}

      {/* Create Charge Form */}
      <div style={formCardStyle}>
        <h2 style={sectionTitleStyle}>Create Charge</h2>
        <form onSubmit={handleCreateCharge} data-testid="create-charge-form" noValidate>
          <div style={formRowStyle}>
            {/* Resident select */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="charge-user">
                Resident / Unit
              </label>
              <select
                id="charge-user"
                style={selectStyle}
                value={formUserId}
                onChange={e => setFormUserId(e.target.value)}
                aria-label="Select resident"
              >
                <option value="">Select resident...</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.displayName ?? 'Unknown'} — Unit {u.unitNumber ?? '?'}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="charge-amount-input">
                Amount (USD)
              </label>
              <input
                id="charge-amount-input"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                style={inputStyle}
                value={formAmount}
                onChange={e => setFormAmount(e.target.value)}
                aria-label="Amount"
                data-testid="charge-amount"
              />
            </div>

            {/* Description */}
            <div style={{ ...fieldGroupStyle, flex: '2 1 280px' }}>
              <label style={labelStyle} htmlFor="charge-description-input">
                Description
              </label>
              <input
                id="charge-description-input"
                type="text"
                placeholder="e.g. Monthly rent, maintenance fee..."
                style={inputStyle}
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                aria-label="Description"
                data-testid="charge-description"
              />
            </div>

            {/* Due date */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="charge-due-date-input">
                Due Date
              </label>
              <input
                id="charge-due-date-input"
                type="date"
                style={inputStyle}
                value={formDueDate}
                onChange={e => setFormDueDate(e.target.value)}
                aria-label="Due date"
                data-testid="charge-due-date"
              />
            </div>

            {/* Submit */}
            <div style={{ ...fieldGroupStyle, justifyContent: 'flex-end', flex: '0 0 auto', minWidth: 'unset' }}>
              <button
                type="submit"
                style={submitBtnStyle}
                disabled={formLoading}
                data-testid="charge-submit"
              >
                {formLoading ? 'Creating...' : 'Create Charge'}
              </button>
            </div>
          </div>

          {/* Form error */}
          {formError && (
            <div style={formErrorStyle} data-testid="form-error">
              {formError}
            </div>
          )}
        </form>
      </div>

      {/* Filters */}
      <div style={filterBarStyle} role="group" aria-label="Filter by status">
        {(['all', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'] as FilterStatus[]).map(filter => (
          <button
            key={filter}
            style={filterBtnStyle(filter)}
            onClick={() => setStatusFilter(filter)}
            data-testid={filter === 'all' ? 'filter-all' : `filter-${filter}`}
            type="button"
            aria-pressed={statusFilter === filter}
          >
            {FILTER_LABELS[filter]}
          </button>
        ))}
      </div>

      {/* Payments table */}
      {filteredPayments.length === 0 ? (
        <EmptyState
          message="No payments found"
          description="No payments match the current filter. Try selecting a different status."
          icon={<CreditCard size={22} />}
        />
      ) : (
        <div style={tableContainerStyle}>
          <table style={tableStyle} aria-label="Payments list">
            <thead>
              <tr>
                <th style={thStyle}>Resident / Unit</th>
                <th
                  style={thSortableStyle}
                  onClick={() => handleSort('amount')}
                  data-sortable="true"
                >
                  Amount{sortIndicator('amount')}
                </th>
                <th
                  style={thSortableStyle}
                  onClick={() => handleSort('status')}
                  data-sortable="true"
                >
                  Status{sortIndicator('status')}
                </th>
                <th
                  style={thSortableStyle}
                  onClick={() => handleSort('dueDate')}
                  data-sortable="true"
                >
                  Due Date{sortIndicator('dueDate')}
                </th>
                <th
                  style={thSortableStyle}
                  onClick={() => handleSort('paidAt')}
                  data-sortable="true"
                >
                  Paid Date{sortIndicator('paidAt')}
                </th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map(payment => {
                const isActioning = !!actionLoading[payment.id];
                return (
                  <tr
                    key={payment.id}
                    data-testid={`payment-row-${payment.id}`}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                        'var(--platform-surface-hover)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '';
                    }}
                  >
                    {/* Resident */}
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600 }}>
                        {payment.user?.displayName ?? `User #${payment.userId}`}
                      </span>
                      {payment.user?.unitNumber && (
                        <span
                          style={{
                            marginLeft: '8px',
                            fontSize: '12px',
                            color: 'var(--platform-text-secondary)',
                            fontFamily: 'monospace',
                          }}
                        >
                          Unit {payment.user.unitNumber}
                        </span>
                      )}
                      <div style={{ fontSize: '12px', color: 'var(--platform-text-secondary)', marginTop: '2px' }}>
                        {payment.description}
                      </div>
                    </td>

                    {/* Amount */}
                    <td style={{ ...tdStyle, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(payment.amount)}
                    </td>

                    {/* Status */}
                    <td style={tdStyle}>
                      <StatusBadge status={payment.status} />
                    </td>

                    {/* Due date */}
                    <td style={{ ...tdStyle, color: 'var(--platform-text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatDate(payment.dueDate)}
                    </td>

                    {/* Paid date */}
                    <td style={{ ...tdStyle, color: 'var(--platform-text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatDate(payment.paidAt)}
                    </td>

                    {/* Actions */}
                    <td style={tdStyle}>
                      {payment.status === 'PENDING' || payment.status === 'FAILED' ? (
                        <button
                          style={actionBtnStyle('primary')}
                          onClick={() => handleMarkPaid(payment)}
                          disabled={isActioning}
                          data-testid={`mark-paid-${payment.id}`}
                          type="button"
                        >
                          {actionLoading[payment.id] === 'marking' ? 'Marking...' : 'Mark as Paid'}
                        </button>
                      ) : null}

                      {payment.status === 'PAID' ? (
                        <button
                          style={actionBtnStyle('danger')}
                          onClick={() => handleRefund(payment)}
                          disabled={isActioning}
                          data-testid={`refund-${payment.id}`}
                          type="button"
                        >
                          {actionLoading[payment.id] === 'refunding' ? 'Refunding...' : 'Issue Refund'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
