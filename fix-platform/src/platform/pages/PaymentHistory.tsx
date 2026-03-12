/**
 * PaymentHistory Page
 *
 * Displays a user's payment history with:
 * - Outstanding balance summary card
 * - Payment history table: date, description, amount, status, paid date
 * - Status filter: all/pending/paid/failed(overdue)/refunded
 * - Date range filter: from/to date pickers
 * - Loading/error/empty states
 *
 * ROLE-BASED ACCESS:
 * - All roles: see their own payments (API filters by session user)
 * - EDITOR+: sees all payments
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import type { Payment, PaymentStatus } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { AlertTriangle, CreditCard } from 'lucide-react';
import '../styles/tokens.css';

// --- Status badge config ---
const STATUS_CONFIG: Record<PaymentStatus, { label: string; color: string; bg: string }> = {
  PENDING:  { label: 'Pending',  color: '#c9921b', bg: '#fff3cd' },
  PAID:     { label: 'Paid',     color: '#2d7a47', bg: '#d4edda' },
  FAILED:   { label: 'Overdue',  color: '#b93040', bg: '#f8d7da' },
  REFUNDED: { label: 'Refunded', color: '#1a5f8a', bg: '#d0e8f5' },
};

const ALL_STATUSES: PaymentStatus[] = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];

// --- Helpers ---

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatAmount(amount: string, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(Number(amount));
}

function isInDateRange(dateStr: string, from: string, to: string): boolean {
  const date = new Date(dateStr);
  if (from) {
    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    if (date < fromDate) return false;
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    if (date > toDate) return false;
  }
  return true;
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
    <span style={style} data-testid={`payment-status-${status}`}>
      {label}
    </span>
  );
}

// --- Main page ---

export default function PaymentHistory() {
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Filters (client-side)
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await api.get<Payment[]>('/api/platform/payments');
      setAllPayments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleRetry = () => setRetryKey(k => k + 1);

  // Client-side filtering
  const filteredPayments = allPayments.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (fromDate || toDate) {
      if (!isInDateRange(p.createdAt, fromDate, toDate)) return false;
    }
    return true;
  });

  // Outstanding balance: sum of PENDING payments
  const outstandingBalance = allPayments
    .filter(p => p.status === 'PENDING')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const outstandingCurrency = allPayments[0]?.currency ?? 'USD';

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

  // Summary card styles
  const summaryCardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '20px 24px',
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px',
  };

  const summaryLabelStyle: CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--platform-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '6px',
  };

  const summaryAmountStyle: CSSProperties = {
    fontSize: '28px',
    fontWeight: 700,
    color: outstandingBalance > 0 ? '#b93040' : 'var(--platform-text-primary)',
  };

  const summaryNoteStyle: CSSProperties = {
    fontSize: '13px',
    color: 'var(--platform-text-secondary)',
    marginTop: '4px',
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
    minWidth: '150px',
    cursor: 'text',
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
  };

  const errorStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    backgroundColor: 'rgba(185, 48, 64, 0.1)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(185, 48, 64, 0.3)',
    borderRadius: '8px',
    color: '#b93040',
    fontSize: '14px',
    marginBottom: '16px',
  };

  const retryBtnStyle: CSSProperties = {
    backgroundColor: 'transparent',
    color: '#b93040',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#b93040',
    borderRadius: '4px',
    padding: '4px 12px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Payment History</h1>
        <p style={subtitleStyle}>View your payment history and outstanding balance</p>
      </div>

      {/* Outstanding Balance Summary Card */}
      {!loading && !error && (
        <div style={summaryCardStyle} data-testid="outstanding-balance-card">
          <div>
            <div style={summaryLabelStyle}>Outstanding Balance</div>
            <div style={summaryAmountStyle} data-testid="outstanding-amount">
              {formatAmount(String(outstandingBalance), outstandingCurrency)}
            </div>
            <div style={summaryNoteStyle}>
              {outstandingBalance > 0
                ? `${allPayments.filter(p => p.status === 'PENDING').length} pending payment(s)`
                : 'No outstanding payments'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {/* Quick stats */}
            {(['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as PaymentStatus[]).map(s => {
              const count = allPayments.filter(p => p.status === s).length;
              const { label, color } = STATUS_CONFIG[s];
              return (
                <div key={s} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color }}>{count}</div>
                  <div style={{ fontSize: '12px', color: 'var(--platform-text-secondary)' }}>{label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={filtersStyle} role="search" aria-label="Filter payments">
        <div style={filterGroupStyle}>
          <label style={labelStyle} htmlFor="status-filter">Status</label>
          <select
            id="status-filter"
            style={selectStyle}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as PaymentStatus | '')}
            aria-label="Status"
          >
            <option value="">All Statuses</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>
        </div>

        <div style={filterGroupStyle}>
          <label style={labelStyle} htmlFor="from-date">From date</label>
          <input
            id="from-date"
            type="date"
            style={inputStyle}
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            aria-label="From date"
          />
        </div>

        <div style={filterGroupStyle}>
          <label style={labelStyle} htmlFor="to-date">To date</label>
          <input
            id="to-date"
            type="date"
            style={inputStyle}
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            aria-label="To date"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={errorStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button style={retryBtnStyle} onClick={handleRetry} type="button" aria-label="Retry">
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <LoadingSpinner size="lg" />
        </div>
      ) : !error && filteredPayments.length === 0 ? (
        <EmptyState
          message="No payments found"
          description={
            statusFilter || fromDate || toDate
              ? 'No payments match the current filters. Try adjusting your search criteria.'
              : 'Your payment history will appear here once payments are recorded.'
          }
          icon={<CreditCard size={22} />}
        />
      ) : !error ? (
        <div style={tableContainerStyle}>
          <table style={tableStyle} aria-label="Payment history">
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Description</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Paid Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map(payment => (
                <tr
                  key={payment.id}
                  style={rowStyle}
                  data-testid={`payment-row-${payment.id}`}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                      'var(--platform-surface-hover)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '';
                  }}
                >
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--platform-text-secondary)' }}>
                    {formatDate(payment.createdAt)}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{payment.description}</div>
                    {payment.items.length > 0 && (
                      <div style={{ fontSize: '12px', color: 'var(--platform-text-secondary)', marginTop: '2px' }}>
                        {payment.items.length} item{payment.items.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {formatAmount(payment.amount, payment.currency)}
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge status={payment.status} />
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--platform-text-secondary)' }}>
                    {formatDate(payment.paidAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
