/**
 * VisitorRegistration Page — /platform/visitors
 *
 * Resident visitor pre-registration interface:
 * - Register expected visitors form (name, date/time, purpose, notes, optional email/phone)
 * - My visitors list (upcoming + past) with status badges
 * - Access code display for each visitor
 * - Cancel visit action (EXPECTED only)
 * - Loading / error / empty states
 *
 * API:
 * - GET  /api/visitors       — list own visitors
 * - POST /api/visitors       — pre-register a visitor
 * - PUT  /api/visitors/:id   — cancel visitor (status: CANCELLED)
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import type { Visitor, VisitorStatus } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { AlertTriangle, Users } from 'lucide-react';
import '../styles/tokens.css';

// --- Status config ---

const STATUS_CONFIG: Record<VisitorStatus, { label: string; color: string; bg: string }> = {
  EXPECTED:    { label: 'Expected',    color: '#c9921b', bg: '#fff3cd' },
  CHECKED_IN:  { label: 'Checked In',  color: '#2d7a47', bg: '#d4edda' },
  CHECKED_OUT: { label: 'Checked Out', color: '#1a5f8a', bg: '#d0e8f5' },
  CANCELLED:   { label: 'Cancelled',   color: '#888',    bg: '#f0f0f0' },
};

// --- Helpers ---

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isUpcoming(visitor: Visitor): boolean {
  return (
    visitor.status === 'EXPECTED' ||
    visitor.status === 'CHECKED_IN' ||
    new Date(visitor.expectedDate) >= new Date()
  );
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

interface VisitorCardProps {
  visitor: Visitor;
  onCancel: (id: string) => void;
  cancelLoading: boolean;
}

function VisitorCard({ visitor, onCancel, cancelLoading }: VisitorCardProps) {
  const canCancel = visitor.status === 'EXPECTED';

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '16px 20px',
    marginBottom: '12px',
  };

  const headerRowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '10px',
  };

  const guestNameStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
  };

  const metaStyle: CSSProperties = {
    fontSize: '13px',
    color: 'var(--platform-text-secondary)',
    marginBottom: '4px',
  };

  const accessCodeBoxStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '10px',
    padding: '6px 14px',
    backgroundColor: 'var(--platform-bg)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
  };

  const accessCodeLabelStyle: CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--platform-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  };

  const accessCodeValueStyle: CSSProperties = {
    fontSize: '15px',
    fontWeight: 700,
    fontFamily: 'monospace',
    color: 'var(--platform-accent)',
    letterSpacing: '0.1em',
  };

  const cancelBtnStyle: CSSProperties = {
    backgroundColor: 'transparent',
    color: '#c62828',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#c62828',
    borderRadius: '5px',
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    opacity: cancelLoading ? 0.6 : 1,
    flexShrink: 0,
  };

  return (
    <div style={cardStyle} data-testid={`visitor-card-${visitor.id}`}>
      <div style={headerRowStyle}>
        <div>
          <div style={guestNameStyle}>{visitor.guestName}</div>
          <div style={metaStyle}>
            {formatDateTime(visitor.expectedDate)}
          </div>
          {visitor.purpose && (
            <div style={metaStyle}>{visitor.purpose}</div>
          )}
          {(visitor.guestEmail || visitor.guestPhone) && (
            <div style={metaStyle}>
              {visitor.guestEmail && <span>{visitor.guestEmail}</span>}
              {visitor.guestEmail && visitor.guestPhone && <span> &middot; </span>}
              {visitor.guestPhone && <span>{visitor.guestPhone}</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <StatusBadge status={visitor.status} />
          {canCancel && (
            <button
              style={cancelBtnStyle}
              onClick={() => onCancel(visitor.id)}
              disabled={cancelLoading}
              data-testid={`cancel-visit-${visitor.id}`}
              type="button"
            >
              {cancelLoading ? 'Cancelling...' : 'Cancel Visit'}
            </button>
          )}
        </div>
      </div>

      {/* Access code */}
      <div style={accessCodeBoxStyle} data-testid={`access-code-${visitor.id}`}>
        <span style={accessCodeLabelStyle}>Access Code:</span>
        <span style={accessCodeValueStyle}>{visitor.accessCode}</span>
      </div>
    </div>
  );
}

// --- Main component ---

export default function VisitorRegistration() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formPurpose, setFormPurpose] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Per-visitor cancel loading
  const [cancelLoading, setCancelLoading] = useState<Record<string, boolean>>({});

  const fetchVisitors = useCallback(async (initialLoad = false) => {
    if (initialLoad) setLoading(true);
    setError(null);
    try {
      const data = await api.get<Visitor[]>('/api/platform/visitors');
      setVisitors(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load visitors');
    } finally {
      if (initialLoad) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVisitors(true);
  }, [fetchVisitors]);

  // --- Register visitor ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim()) {
      setFormError('Guest name is required');
      return;
    }
    if (!formDate) {
      setFormError('Expected date is required');
      return;
    }

    setFormLoading(true);
    try {
      await api.post('/api/platform/visitors', {
        guestName: formName.trim(),
        guestEmail: formEmail.trim() || undefined,
        guestPhone: formPhone.trim() || undefined,
        expectedDate: new Date(formDate).toISOString(),
        purpose: formPurpose.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });
      // Reset form
      setFormName('');
      setFormEmail('');
      setFormPhone('');
      setFormDate('');
      setFormPurpose('');
      setFormNotes('');
      // Refresh list
      await fetchVisitors();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to register visitor');
    } finally {
      setFormLoading(false);
    }
  };

  // --- Cancel visitor ---
  const handleCancel = async (id: string) => {
    setCancelLoading(prev => ({ ...prev, [id]: true }));
    try {
      await api.put(`/api/platform/visitors/${id}`, { status: 'CANCELLED' });
      await fetchVisitors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel visitor');
    } finally {
      setCancelLoading(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  // --- Split into upcoming / past ---
  const upcomingVisitors = visitors.filter(isUpcoming);
  const pastVisitors = visitors.filter(v => !isUpcoming(v));

  // --- Styles ---

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '900px',
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

  const formCardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '24px',
    marginBottom: '32px',
  };

  const sectionTitleStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    marginBottom: '16px',
  };

  const formGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '14px',
    marginBottom: '14px',
  };

  const fieldGroupStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
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

  const textareaStyle: CSSProperties = {
    ...inputStyle,
    resize: 'vertical',
    minHeight: '72px',
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
    cursor: formLoading ? 'not-allowed' : 'pointer',
    opacity: formLoading ? 0.7 : 1,
    marginTop: '4px',
  };

  const formErrorStyle: CSSProperties = {
    fontSize: '13px',
    color: '#c62828',
    padding: '8px 12px',
    backgroundColor: '#fff0f0',
    borderRadius: '6px',
    marginTop: '4px',
  };

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

  const listSectionStyle: CSSProperties = {
    marginBottom: '28px',
  };

  const sectionHeaderStyle: CSSProperties = {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--platform-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '12px',
    paddingBottom: '6px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border)',
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
      {/* Page header */}
      <div style={headerStyle}>
        <h1 style={titleStyle}>Visitor Pre-Registration</h1>
        <p style={subtitleStyle}>Register expected visitors and share their access codes</p>
      </div>

      {/* Global error */}
      {error && (
        <div style={errorAlertStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Registration form */}
      <div style={formCardStyle}>
        <h2 style={sectionTitleStyle}>Register a Visitor</h2>
        <form onSubmit={handleSubmit} data-testid="visitor-form" noValidate>
          <div style={formGridStyle}>
            {/* Guest name (required) */}
            <div style={{ ...fieldGroupStyle, gridColumn: 'span 2' }}>
              <label style={labelStyle} htmlFor="guest-name">
                Guest Name <span style={{ color: '#c62828' }}>*</span>
              </label>
              <input
                id="guest-name"
                type="text"
                placeholder="Full name of your visitor"
                style={inputStyle}
                value={formName}
                onChange={e => setFormName(e.target.value)}
                data-testid="guest-name-input"
                aria-label="Guest name"
              />
            </div>

            {/* Expected date (required) */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="expected-date">
                Expected Date &amp; Time <span style={{ color: '#c62828' }}>*</span>
              </label>
              <input
                id="expected-date"
                type="datetime-local"
                style={inputStyle}
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                data-testid="expected-date-input"
                aria-label="Expected date and time"
              />
            </div>

            {/* Purpose */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="purpose">
                Purpose / Reason
              </label>
              <input
                id="purpose"
                type="text"
                placeholder="e.g. Social visit, delivery..."
                style={inputStyle}
                value={formPurpose}
                onChange={e => setFormPurpose(e.target.value)}
                data-testid="purpose-input"
                aria-label="Purpose of visit"
              />
            </div>

            {/* Guest email */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="guest-email">
                Guest Email (optional)
              </label>
              <input
                id="guest-email"
                type="email"
                placeholder="guest@example.com"
                style={inputStyle}
                value={formEmail}
                onChange={e => setFormEmail(e.target.value)}
                data-testid="guest-email-input"
                aria-label="Guest email"
              />
            </div>

            {/* Guest phone */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="guest-phone">
                Guest Phone (optional)
              </label>
              <input
                id="guest-phone"
                type="tel"
                placeholder="+1 (555) 000-0000"
                style={inputStyle}
                value={formPhone}
                onChange={e => setFormPhone(e.target.value)}
                data-testid="guest-phone-input"
                aria-label="Guest phone"
              />
            </div>

            {/* Notes */}
            <div style={{ ...fieldGroupStyle, gridColumn: 'span 2' }}>
              <label style={labelStyle} htmlFor="notes">
                Notes (optional)
              </label>
              <textarea
                id="notes"
                placeholder="Any additional notes for building staff..."
                style={textareaStyle}
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                data-testid="notes-input"
                aria-label="Notes"
              />
            </div>
          </div>

          {/* Form error */}
          {formError && (
            <div style={formErrorStyle} data-testid="form-error">
              {formError}
            </div>
          )}

          <button
            type="submit"
            style={submitBtnStyle}
            disabled={formLoading}
            data-testid="visitor-submit"
          >
            {formLoading ? 'Registering...' : 'Register Visitor'}
          </button>
        </form>
      </div>

      {/* Visitors list */}
      <div data-testid="visitors-list">
        {visitors.length === 0 ? (
          <EmptyState
            message="No visitors registered"
            description="Use the form above to pre-register an expected visitor."
            icon={<Users size={22} />}
          />
        ) : (
          <>
            {/* Upcoming section */}
            <div style={listSectionStyle} data-testid="upcoming-section">
              <div style={sectionHeaderStyle}>
                Upcoming ({upcomingVisitors.length})
              </div>
              {upcomingVisitors.length === 0 ? (
                <p style={{ fontSize: '14px', color: 'var(--platform-text-secondary)', padding: '12px 0' }}>
                  No upcoming visitors.
                </p>
              ) : (
                upcomingVisitors.map(visitor => (
                  <VisitorCard
                    key={visitor.id}
                    visitor={visitor}
                    onCancel={handleCancel}
                    cancelLoading={!!cancelLoading[visitor.id]}
                  />
                ))
              )}
            </div>

            {/* Past section */}
            <div style={listSectionStyle} data-testid="past-section">
              <div style={sectionHeaderStyle}>
                Past Visits ({pastVisitors.length})
              </div>
              {pastVisitors.length === 0 ? (
                <p style={{ fontSize: '14px', color: 'var(--platform-text-secondary)', padding: '12px 0' }}>
                  No past visitors.
                </p>
              ) : (
                pastVisitors.map(visitor => (
                  <VisitorCard
                    key={visitor.id}
                    visitor={visitor}
                    onCancel={handleCancel}
                    cancelLoading={!!cancelLoading[visitor.id]}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
