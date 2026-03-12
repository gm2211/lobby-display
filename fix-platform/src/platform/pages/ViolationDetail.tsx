/**
 * ViolationDetail Page — /platform/violations/:id
 *
 * Displays full detail of a single violation including:
 * - Violation info: unit, category, description, severity/status badges, fine, dates
 * - Status timeline: visual workflow from REPORTED → RESOLVED/DISMISSED
 * - Appeal button: shown for CONFIRMED violations (only reporter can appeal server-side)
 * - Comments: public (non-internal) comments
 * - Back link to /platform/violations
 *
 * RELATED FILES:
 * - server/routes/platform/violations.ts  - API endpoints
 * - src/platform/types.ts                 - shared types
 * - tests/component/platform/ViolationDetail.test.tsx
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { AlertTriangle } from 'lucide-react';
import '../styles/tokens.css';

// --- Types ---

type ActualViolationStatus = 'REPORTED' | 'UNDER_REVIEW' | 'CONFIRMED' | 'APPEALED' | 'RESOLVED' | 'DISMISSED';
type ActualViolationSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

interface ViolationComment {
  id: string;
  violationId: string;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

interface ViolationDetailData {
  id: string;
  reportedBy: string;
  unitNumber: string;
  category: string;
  description: string;
  evidence: unknown | null;
  status: ActualViolationStatus;
  severity: ActualViolationSeverity;
  fineAmount: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  comments: ViolationComment[];
}

// --- Config ---

const STATUS_CONFIG: Record<ActualViolationStatus, { label: string; color: string; bg: string }> = {
  REPORTED:     { label: 'Reported',     color: '#b07800', bg: '#fff8e1' },
  UNDER_REVIEW: { label: 'Under Review', color: '#1a5c5a', bg: '#e8f5f5' },
  CONFIRMED:    { label: 'Confirmed',    color: '#c62828', bg: '#fff0f0' },
  APPEALED:     { label: 'Appealed',     color: '#7a1f2b', bg: '#fce4e4' },
  RESOLVED:     { label: 'Resolved',     color: '#2e7d32', bg: '#f0fff4' },
  DISMISSED:    { label: 'Dismissed',    color: '#888',    bg: '#f5f5f5' },
};

const SEVERITY_CONFIG: Record<ActualViolationSeverity, { label: string; color: string; bg: string }> = {
  LOW:    { label: 'Low',    color: '#2e7d32', bg: '#f0fff4' },
  MEDIUM: { label: 'Medium', color: '#b07800', bg: '#fff8e1' },
  HIGH:   { label: 'High',   color: '#c62828', bg: '#fff0f0' },
};

// The main status progression (linear flow)
const STATUS_TIMELINE_STEPS: ActualViolationStatus[] = [
  'REPORTED',
  'UNDER_REVIEW',
  'CONFIRMED',
  'RESOLVED',
];

// Special terminal states not in the linear flow
const TERMINAL_STATUSES = new Set<ActualViolationStatus>(['DISMISSED', 'APPEALED']);

// --- Helper functions ---

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(amount: string | number | null): string {
  if (amount === null || amount === undefined) return '—';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '—';
  return `$${num.toFixed(2)}`;
}

// --- Sub-components ---

function StatusBadge({ status }: { status: ActualViolationStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#888', bg: 'rgba(136,136,136,0.12)' };
  const style: CSSProperties = {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 600,
    color: cfg.color,
    backgroundColor: cfg.bg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cfg.color,
    whiteSpace: 'nowrap',
  };
  return (
    <span style={style} data-testid={`status-badge-${status}`}>
      {cfg.label}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: ActualViolationSeverity }) {
  const cfg = SEVERITY_CONFIG[severity] ?? { label: severity, color: '#888', bg: 'rgba(136,136,136,0.12)' };
  const style: CSSProperties = {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    color: cfg.color,
    backgroundColor: cfg.bg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cfg.color,
    whiteSpace: 'nowrap',
  };
  return (
    <span style={style} data-testid={`severity-badge-${severity}`}>
      {cfg.label}
    </span>
  );
}

function StatusTimeline({ currentStatus }: { currentStatus: ActualViolationStatus }) {
  const isTerminal = TERMINAL_STATUSES.has(currentStatus);

  // Determine which step index we're at in the linear flow
  const currentIdx = STATUS_TIMELINE_STEPS.indexOf(currentStatus);

  return (
    <div data-testid="status-timeline" style={{ margin: '0' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        flexWrap: 'wrap',
      }}>
        {STATUS_TIMELINE_STEPS.map((step, idx) => {
          const cfg = STATUS_CONFIG[step];
          const isPast = currentIdx > idx;
          const isCurrent = currentIdx === idx && !isTerminal;
          const isFuture = currentIdx < idx && !isTerminal;

          let dotColor = '#ccc'; // future gray
          let lineColor = '#ccc';
          let textColor = 'var(--platform-text-secondary)';
          let fontWeight: number | string = 400;

          if (isPast || (isTerminal && step === 'CONFIRMED' && currentStatus === 'APPEALED')) {
            dotColor = '#2e7d32';
            lineColor = '#2e7d32';
            textColor = '#2e7d32';
            fontWeight = 500;
          } else if (isCurrent) {
            dotColor = cfg.color;
            lineColor = '#ccc';
            textColor = cfg.color;
            fontWeight = 700;
          } else if (isFuture) {
            dotColor = '#ccc';
          }

          return (
            <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
              {/* Step */}
              <div
                data-testid={`timeline-step-${step}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {/* Dot */}
                <div style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  backgroundColor: (isPast || isCurrent) && !isFuture ? dotColor : 'transparent',
                  borderWidth: 2,
                  borderStyle: 'solid',
                  borderColor: dotColor,
                  flexShrink: 0,
                }} />
                {/* Label */}
                <span style={{
                  fontSize: '11px',
                  color: textColor,
                  fontWeight,
                  whiteSpace: 'nowrap',
                }}>
                  {cfg.label}
                </span>
              </div>

              {/* Connector line (not after last step) */}
              {idx < STATUS_TIMELINE_STEPS.length - 1 && (
                <div style={{
                  width: '40px',
                  height: 2,
                  backgroundColor: isPast ? lineColor : '#ccc',
                  marginBottom: '16px',
                  flexShrink: 0,
                }} />
              )}
            </div>
          );
        })}

        {/* Show special terminal status as a branch */}
        {isTerminal && (
          <div style={{ marginLeft: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              height: 2,
              width: '20px',
              backgroundColor: STATUS_CONFIG[currentStatus].color,
            }} />
            <div
              data-testid={`timeline-step-${currentStatus}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <div style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                backgroundColor: STATUS_CONFIG[currentStatus].color,
                borderWidth: 2,
                borderStyle: 'solid',
                borderColor: STATUS_CONFIG[currentStatus].color,
              }} />
              <span style={{
                fontSize: '11px',
                color: STATUS_CONFIG[currentStatus].color,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}>
                {STATUS_CONFIG[currentStatus].label}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    }}>
      <span style={{
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--platform-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: '15px',
        color: 'var(--platform-text-primary)',
        fontWeight: 500,
      }}>
        {value}
      </span>
    </div>
  );
}

// --- Main component ---

export default function ViolationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [violation, setViolation] = useState<ViolationDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [appealing, setAppealing] = useState(false);
  const [appealSubmitted, setAppealSubmitted] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await api.get<ViolationDetailData>(`/api/platform/violations/${id}`);
      setViolation(data);
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) {
        setNotFound(true);
      } else if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
        setNotFound(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load violation');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAppeal = async () => {
    if (!id) return;
    setAppealing(true);
    setAppealError(null);
    try {
      const updated = await api.post<ViolationDetailData>(`/api/platform/violations/${id}/appeal`);
      setViolation(updated);
      setAppealSubmitted(true);
    } catch (err) {
      setAppealError(err instanceof Error ? err.message : 'Failed to submit appeal');
    } finally {
      setAppealing(false);
    }
  };

  // --- Styles ---

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '800px',
    margin: '0 auto',
  };

  const backBtnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '24px',
    padding: '6px 12px',
    background: 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    color: 'var(--platform-text-secondary)',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '12px',
    overflow: 'hidden',
    marginBottom: '20px',
  };

  const cardHeaderStyle: CSSProperties = {
    padding: '20px 24px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border)',
    backgroundColor: 'var(--platform-bg)',
  };

  const cardBodyStyle: CSSProperties = {
    padding: '24px',
  };

  const sectionTitleStyle: CSSProperties = {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--platform-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '0',
  };

  const h1Style: CSSProperties = {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: '0 0 8px',
  };

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '20px',
    marginBottom: '24px',
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

  const appealBtnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 20px',
    backgroundColor: '#fce4e4',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#7a1f2b',
    borderRadius: '8px',
    color: '#7a1f2b',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
  };

  const fineBoxStyle: CSSProperties = {
    backgroundColor: '#fff0f0',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#fbc2c4',
    borderRadius: '10px',
    padding: '16px 20px',
    marginBottom: '20px',
  };

  // --- Render states ---

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
        <LoadingSpinner size="lg" label="Loading violation..." />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={pageStyle}>
        <button style={backBtnStyle} onClick={() => navigate('/platform/violations')}>
          <span>←</span>
          <span>Back to violations</span>
        </button>
        <div style={{
          ...cardStyle,
          padding: '48px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{ fontSize: '48px' }}><AlertTriangle size={48} color="#e0a000" /></div>
          <h1 style={{ ...h1Style, fontSize: '20px' }}>Violation not found</h1>
          <p style={{ color: 'var(--platform-text-secondary)', fontSize: '14px' }}>
            This violation may have been removed or does not exist.
          </p>
        </div>
      </div>
    );
  }

  if (error || !violation) {
    return (
      <div style={pageStyle}>
        <button style={backBtnStyle} onClick={() => navigate('/platform/violations')}>
          <span>←</span>
          <span>Back to violations</span>
        </button>
        <div style={errorStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          <span>{error ?? 'Failed to load violation.'}</span>
        </div>
      </div>
    );
  }

  const publicComments = violation.comments.filter(c => !c.isInternal);
  const showAppealButton = violation.status === 'CONFIRMED' && !appealSubmitted;

  return (
    <div style={pageStyle}>
      {/* Back link */}
      <button
        style={backBtnStyle}
        onClick={() => navigate('/platform/violations')}
      >
        <span>←</span>
        <span>Back to violations</span>
      </button>

      {/* Header card */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <p style={{ ...sectionTitleStyle, marginBottom: '6px' }}>Violation Report</p>
              <h1 style={h1Style}>
                Unit {violation.unitNumber} — {violation.category}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <StatusBadge status={violation.status} />
                <SeverityBadge severity={violation.severity} />
              </div>
            </div>
          </div>
        </div>

        <div style={cardBodyStyle}>
          {/* Info grid */}
          <div style={gridStyle}>
            <InfoRow label="Unit" value={
              <span style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700 }}>
                {violation.unitNumber}
              </span>
            } />
            <InfoRow label="Category" value={violation.category} />
            <InfoRow label="Issued Date" value={formatDate(violation.createdAt)} />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '24px' }}>
            <p style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--platform-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '8px',
            }}>
              Description
            </p>
            <p style={{
              fontSize: '15px',
              color: 'var(--platform-text-primary)',
              lineHeight: 1.6,
              margin: 0,
            }}>
              {violation.description}
            </p>
          </div>
        </div>
      </div>

      {/* Fine info (shown prominently when present) */}
      {violation.fineAmount !== null && (
        <div style={fineBoxStyle}>
          <p style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#c62828',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '8px',
            marginTop: 0,
          }}>
            Fine Issued
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '28px', fontWeight: 700, color: '#c62828' }}>
              {formatCurrency(violation.fineAmount)}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--platform-text-secondary)' }}>
              fine amount
            </span>
          </div>
        </div>
      )}

      {/* Status timeline */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <p style={sectionTitleStyle}>Status Timeline</p>
        </div>
        <div style={{ padding: '24px' }}>
          <StatusTimeline currentStatus={violation.status} />
        </div>
      </div>

      {/* Appeal section */}
      {(showAppealButton || appealSubmitted) && (
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <p style={sectionTitleStyle}>Appeal This Violation</p>
          </div>
          <div style={{ padding: '24px' }}>
            {appealSubmitted ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                backgroundColor: '#e8f5f5',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: '#1a5c5a',
                borderRadius: '8px',
                color: '#1a5c5a',
                fontSize: '14px',
              }}>
                <span>✓</span>
                <span>Appeal Submitted — your appeal is under review.</span>
              </div>
            ) : (
              <div>
                <p style={{
                  fontSize: '14px',
                  color: 'var(--platform-text-secondary)',
                  marginBottom: '16px',
                  marginTop: 0,
                }}>
                  If you believe this violation was issued in error, you may submit an appeal.
                  Appeals can only be submitted by the original reporter for confirmed violations.
                </p>
                {appealError && (
                  <div style={{ ...errorStyle, marginBottom: '12px' }} role="alert">
                    <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
                    <span>{appealError}</span>
                  </div>
                )}
                <button
                  style={appealBtnStyle}
                  onClick={handleAppeal}
                  disabled={appealing}
                  aria-label="Appeal this violation"
                >
                  {appealing ? 'Submitting...' : 'Appeal Violation'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Comments section */}
      {publicComments.length > 0 && (
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <p style={sectionTitleStyle}>Comments ({publicComments.length})</p>
          </div>
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {publicComments.map(comment => (
                <div key={comment.id} style={{
                  padding: '14px 16px',
                  backgroundColor: 'var(--platform-bg)',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: 'var(--platform-border)',
                  borderRadius: '8px',
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                  }}>
                    <span style={{
                      fontSize: '12px',
                      color: 'var(--platform-text-secondary)',
                    }}>
                      {formatDate(comment.createdAt)}
                    </span>
                  </div>
                  <p style={{
                    fontSize: '14px',
                    color: 'var(--platform-text-primary)',
                    margin: 0,
                    lineHeight: 1.6,
                  }}>
                    {comment.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
