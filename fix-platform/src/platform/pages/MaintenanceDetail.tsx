/**
 * MaintenanceDetail Page — /platform/maintenance/:id
 *
 * Shows full detail of a single maintenance request including:
 * - Title, status badge, priority badge
 * - Category, description, unit number, location
 * - Created date, last updated date
 * - Comments section (fetched separately from GET /api/platform/maintenance/:id/comments)
 * - Add comment form (POST /api/platform/maintenance/:id/comments)
 * - Back link to /platform/maintenance
 * - Loading spinner, error state with retry, not-found state
 *
 * RELATED FILES:
 * - server/routes/platform/maintenance.ts  - API endpoints
 * - src/platform/types.ts                  - shared types
 * - tests/component/platform/MaintenanceDetail.test.tsx
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { MaintenanceRequest, MaintenanceComment, MaintenanceStatus, MaintenancePriority } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { Wrench, AlertTriangle } from 'lucide-react';
import '../styles/tokens.css';

// --- Config ---

const STATUS_CONFIG: Record<MaintenanceStatus, { label: string; color: string; bg: string }> = {
  OPEN:        { label: 'Open',        color: '#1a5f8a', bg: '#d0e8f5' },
  IN_PROGRESS: { label: 'In Progress', color: '#c9921b', bg: '#fff3cd' },
  COMPLETED:   { label: 'Completed',   color: '#2d7a47', bg: '#d4edda' },
  CANCELLED:   { label: 'Cancelled',   color: '#888',    bg: '#f0f0f0' },
};

const PRIORITY_CONFIG: Record<MaintenancePriority, { label: string; color: string; bg: string }> = {
  LOW:    { label: 'Low',    color: '#888',    bg: '#f0f0f0' },
  MEDIUM: { label: 'Medium', color: '#c9921b', bg: '#fff3cd' },
  HIGH:   { label: 'High',   color: '#c9631b', bg: '#ffeede' },
  URGENT: { label: 'Urgent', color: '#b93040', bg: '#f8d7da' },
};

// --- Helper functions ---

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// --- Sub-components ---

function StatusBadge({ status }: { status: MaintenanceStatus }) {
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

function PriorityBadge({ priority }: { priority: MaintenancePriority }) {
  const cfg = PRIORITY_CONFIG[priority] ?? { label: priority, color: '#888', bg: 'rgba(136,136,136,0.12)' };
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
    <span style={style} data-testid={`priority-badge-${priority}`}>
      {cfg.label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{
        fontSize: '11px',
        fontWeight: 600,
        color: '#888',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: '15px',
        color: '#333',
        fontWeight: 500,
      }}>
        {value}
      </span>
    </div>
  );
}

// --- Main component ---

export default function MaintenanceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [request, setRequest] = useState<MaintenanceRequest | null>(null);
  const [comments, setComments] = useState<MaintenanceComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [commentBody, setCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const [requestData, commentsData] = await Promise.all([
        api.get<MaintenanceRequest>(`/api/platform/maintenance/${id}`),
        api.get<MaintenanceComment[]>(`/api/platform/maintenance/${id}/comments`),
      ]);
      setRequest(requestData);
      setComments(commentsData);
    } catch (err) {
      if (
        (err instanceof Error && err.message.includes('404')) ||
        (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404)
      ) {
        setNotFound(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load maintenance request');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddComment = async () => {
    if (!id || !commentBody.trim()) return;
    setSubmittingComment(true);
    setCommentError(null);

    try {
      const newComment = await api.post<MaintenanceComment>(
        `/api/platform/maintenance/${id}/comments`,
        { body: commentBody.trim() }
      );
      setComments(prev => [...prev, newComment]);
      setCommentBody('');
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setSubmittingComment(false);
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
    borderColor: '#e0e0e0',
    borderRadius: '6px',
    color: '#888',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const cardStyle: CSSProperties = {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e0e0e0',
    borderRadius: '10px',
    overflow: 'hidden',
    marginBottom: '20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  };

  const cardHeaderStyle: CSSProperties = {
    padding: '20px 24px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#f9f9f9',
  };

  const cardBodyStyle: CSSProperties = {
    padding: '24px',
  };

  const sectionTitleStyle: CSSProperties = {
    fontSize: '13px',
    fontWeight: 700,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    margin: 0,
  };

  const h1Style: CSSProperties = {
    fontSize: '22px',
    fontWeight: 700,
    color: '#333',
    margin: '0 0 12px',
  };

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '20px',
    marginBottom: '24px',
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

  const textareaStyle: CSSProperties = {
    width: '100%',
    minHeight: '80px',
    backgroundColor: '#fff',
    color: '#333',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#ddd',
    borderRadius: '6px',
    padding: '10px 12px',
    fontSize: '14px',
    fontFamily: 'inherit',
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const submitBtnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '10px',
    padding: '8px 18px',
    backgroundColor: 'var(--platform-accent, #1a7a78)',
    color: '#fff',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const disabledBtnStyle: CSSProperties = {
    ...submitBtnStyle,
    opacity: 0.5,
    cursor: 'not-allowed',
  };

  // --- Render states ---

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
        <LoadingSpinner size="lg" label="Loading maintenance request..." />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={pageStyle}>
        <button style={backBtnStyle} onClick={() => navigate('/platform/maintenance')}>
          <span>←</span>
          <span>Back to maintenance</span>
        </button>
        <EmptyState
          icon={<Wrench size={22} />}
          message="Maintenance request not found"
          description="This request may have been removed or does not exist."
          action={{ label: 'Back to maintenance', onClick: () => navigate('/platform/maintenance') }}
        />
      </div>
    );
  }

  if (error || !request) {
    return (
      <div style={pageStyle}>
        <button style={backBtnStyle} onClick={() => navigate('/platform/maintenance')}>
          <span>←</span>
          <span>Back to maintenance</span>
        </button>
        <div style={errorStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          <span>{error ?? 'Failed to load maintenance request.'}</span>
        </div>
        <button
          style={{
            padding: '8px 18px',
            backgroundColor: 'transparent',
            color: '#888',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: '#e0e0e0',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          onClick={load}
          aria-label="Retry loading"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Back link */}
      <button
        style={backBtnStyle}
        onClick={() => navigate('/platform/maintenance')}
      >
        <span>←</span>
        <span>Back to maintenance</span>
      </button>

      {/* Header card */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <p style={{ ...sectionTitleStyle, marginBottom: '10px' }}>Maintenance Request</p>
          <h1 style={h1Style}>{request.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <StatusBadge status={request.status} />
            <PriorityBadge priority={request.priority} />
          </div>
        </div>

        <div style={cardBodyStyle}>
          {/* Info grid */}
          <div style={gridStyle}>
            <InfoRow label="Category" value={request.category} />
            <InfoRow
              label="Unit"
              value={
                <span style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700 }}>
                  {request.unitNumber}
                </span>
              }
            />
            {request.location && (
              <InfoRow label="Location" value={request.location} />
            )}
            <InfoRow label="Created" value={formatDate(request.createdAt)} />
            <InfoRow label="Last Updated" value={formatDate(request.updatedAt)} />
          </div>

          {/* Description */}
          <div>
            <p style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '8px',
              marginTop: 0,
            }}>
              Description
            </p>
            <p style={{
              fontSize: '15px',
              color: '#333',
              lineHeight: 1.6,
              margin: 0,
            }}>
              {request.description}
            </p>
          </div>
        </div>
      </div>

      {/* Comments section */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <p style={sectionTitleStyle}>
            Comments ({comments.length})
          </p>
        </div>
        <div style={cardBodyStyle}>
          {comments.length === 0 ? (
            <p style={{
              fontSize: '14px',
              color: '#888',
              fontStyle: 'italic',
              margin: '0 0 20px',
            }}>
              No comments yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              {comments.map(comment => (
                <div
                  key={comment.id}
                  data-testid={`comment-${comment.id}`}
                  style={{
                    padding: '14px 16px',
                    backgroundColor: '#fafafa',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: '#eee',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '8px',
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#333',
                    }}>
                      {comment.authorName}
                    </span>
                    <span style={{
                      fontSize: '12px',
                      color: '#888',
                      whiteSpace: 'nowrap',
                    }}>
                      {formatDate(comment.createdAt)}
                    </span>
                  </div>
                  <p style={{
                    fontSize: '14px',
                    color: '#444',
                    margin: 0,
                    lineHeight: 1.6,
                  }}>
                    {comment.body}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Add comment form */}
          <div>
            <p style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '8px',
              marginTop: 0,
            }}>
              Add a Comment
            </p>
            {commentError && (
              <div style={{ ...errorStyle, marginBottom: '12px' }} role="alert">
                <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
                <span>{commentError}</span>
              </div>
            )}
            <textarea
              style={textareaStyle}
              value={commentBody}
              onChange={e => setCommentBody(e.target.value)}
              placeholder="Write a comment..."
              aria-label="Comment text"
            />
            <div>
              <button
                style={commentBody.trim() ? submitBtnStyle : disabledBtnStyle}
                onClick={handleAddComment}
                disabled={!commentBody.trim() || submittingComment}
                aria-label="Add comment"
              >
                {submittingComment ? 'Submitting...' : 'Add Comment'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
