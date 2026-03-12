/**
 * ForumThreadDetail — /platform/forum/:threadId
 *
 * Shows a single forum thread with full post body, replies, and reply form.
 *
 * Features:
 * - Fetches thread from GET /api/platform/forum/threads/:threadId
 * - Displays title, author, created date, body content
 * - Pinned / locked badges
 * - Lists replies in chronological order (author, date, body)
 * - Reply form at bottom: textarea (required), submit button
 * - POSTs reply to /api/platform/forum/threads/:threadId/replies
 * - MANAGER role sees moderation actions: pin/unpin, lock/unlock, delete
 * - Loading spinner while fetching
 * - Error state if thread not found
 * - Back link to /platform/forum
 * - Reply count displayed
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { ForumReply, ForumThreadWithReplies, PlatformRole } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { AlertTriangle, MessageCircle } from 'lucide-react';
import '../styles/tokens.css';

// ---- Constants ----

const MANAGER_ROLES: PlatformRole[] = ['MANAGER'];

// ---- Helpers ----

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isManagerRole(role: PlatformRole | null): boolean {
  return role !== null && MANAGER_ROLES.includes(role);
}

// ---- ProfileResponse ----

interface ProfileResponse {
  platformRole: PlatformRole | null;
}

// ---- ReplyCard ----

interface ReplyCardProps {
  reply: ForumReply;
}

function ReplyCard({ reply }: ReplyCardProps) {
  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '10px',
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
    flexWrap: 'wrap',
  };

  const authorStyle: CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--platform-text-primary)',
  };

  const dateStyle: CSSProperties = {
    fontSize: '12px',
    color: 'var(--platform-text-muted)',
  };

  const bodyStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-primary)',
    lineHeight: 1.6,
    margin: 0,
  };

  return (
    <div style={cardStyle} data-testid={`reply-card-${reply.id}`}>
      <div style={headerStyle}>
        <span style={authorStyle}>{reply.authorName}</span>
        <span style={dateStyle}>{formatDate(reply.createdAt)}</span>
      </div>
      <p style={bodyStyle}>{reply.body}</p>
    </div>
  );
}

// ---- ModerationActions ----

interface ModerationActionsProps {
  thread: ForumThreadWithReplies;
  threadId: string;
  onPin: () => void;
  onLock: () => void;
  onDelete: () => void;
}

function ModerationActions({ thread, onPin, onLock, onDelete }: ModerationActionsProps) {
  const containerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '12px',
    paddingTop: '12px',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--platform-border)',
  };

  const btnBase: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '5px 12px',
    fontSize: '13px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
  };

  const pinBtnStyle: CSSProperties = {
    ...btnBase,
    borderColor: 'var(--platform-color-secondary-500, #c9921b)',
    color: 'var(--platform-color-secondary-500, #c9921b)',
  };

  const lockBtnStyle: CSSProperties = {
    ...btnBase,
    borderColor: 'var(--platform-text-secondary, #64748b)',
    color: 'var(--platform-text-secondary, #64748b)',
  };

  const deleteBtnStyle: CSSProperties = {
    ...btnBase,
    borderColor: '#b93040',
    color: '#b93040',
  };

  return (
    <div style={containerStyle}>
      <button
        style={pinBtnStyle}
        onClick={onPin}
        aria-label={thread.pinned ? 'Unpin thread' : 'Pin thread'}
      >
        {thread.pinned ? 'Unpin thread' : 'Pin thread'}
      </button>
      <button
        style={lockBtnStyle}
        onClick={onLock}
        aria-label={thread.locked ? 'Unlock thread' : 'Lock thread'}
      >
        {thread.locked ? 'Unlock thread' : 'Lock thread'}
      </button>
      <button
        style={deleteBtnStyle}
        onClick={onDelete}
        aria-label="Delete thread"
      >
        Delete thread
      </button>
    </div>
  );
}

// ---- ReplyForm ----

interface ReplyFormProps {
  threadId: string;
  onReplyPosted: (reply: ForumReply) => void;
}

function ReplyForm({ threadId, onReplyPosted }: ReplyFormProps) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) {
      setError('Reply cannot be empty');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const reply = await api.post<ForumReply>(
        `/api/platform/forum/threads/${threadId}/replies`,
        { body: body.trim() }
      );
      setBody('');
      onReplyPosted(reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setSubmitting(false);
    }
  };

  const formStyle: CSSProperties = {
    marginTop: '24px',
    paddingTop: '24px',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--platform-border)',
  };

  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--platform-text-primary)',
    marginBottom: '8px',
  };

  const textareaStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '100px',
    padding: '10px 12px',
    fontSize: '14px',
    color: 'var(--platform-text-primary)',
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: error ? '#ef4444' : 'var(--platform-border)',
    borderRadius: '6px',
    outline: 'none',
    resize: 'vertical',
  };

  const errorStyle: CSSProperties = {
    fontSize: '12px',
    color: '#ef4444',
    marginTop: '4px',
  };

  const submitBtnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '10px',
    padding: '8px 18px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: submitting ? 'var(--platform-accent-muted, #6c8eb3)' : 'var(--platform-accent)',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '6px',
    cursor: submitting ? 'not-allowed' : 'pointer',
  };

  return (
    <form style={formStyle} onSubmit={handleSubmit}>
      <label style={labelStyle} htmlFor="reply-body">
        Your Reply
      </label>
      <textarea
        id="reply-body"
        style={textareaStyle}
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Write your reply..."
        disabled={submitting}
        aria-label="Your Reply"
      />
      {error && <p style={errorStyle}>{error}</p>}
      <button
        type="submit"
        style={submitBtnStyle}
        disabled={submitting}
        aria-label="Post reply"
      >
        {submitting ? 'Posting...' : 'Post reply'}
      </button>
    </form>
  );
}

// ---- Main component ----

export default function ForumThreadDetail() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();

  const [thread, setThread] = useState<ForumThreadWithReplies | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformRole, setPlatformRole] = useState<PlatformRole | null>(null);

  const load = useCallback(async () => {
    if (!threadId) return;
    setLoading(true);
    setError(null);
    try {
      const [profileData, threadData] = await Promise.all([
        api.get<ProfileResponse>('/api/platform/profile'),
        api.get<ForumThreadWithReplies>(`/api/platform/forum/threads/${threadId}`),
      ]);
      setPlatformRole(profileData.platformRole ?? null);
      setThread(threadData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thread');
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Moderation handlers ----

  const handlePin = async () => {
    if (!thread || !threadId) return;
    try {
      const updated = await api.put<ForumThreadWithReplies>(
        `/api/platform/forum/threads/${threadId}`,
        { pinned: !thread.pinned }
      );
      setThread(prev => prev ? { ...prev, pinned: updated.pinned } : prev);
    } catch {
      // Ignore errors for now
    }
  };

  const handleLock = async () => {
    if (!thread || !threadId) return;
    try {
      const updated = await api.put<ForumThreadWithReplies>(
        `/api/platform/forum/threads/${threadId}`,
        { locked: !thread.locked }
      );
      setThread(prev => prev ? { ...prev, locked: updated.locked } : prev);
    } catch {
      // Ignore errors for now
    }
  };

  const handleDelete = async () => {
    if (!threadId) return;
    const confirmed = window.confirm('Are you sure you want to delete this thread? This cannot be undone.');
    if (!confirmed) return;
    try {
      await api.delete(`/api/platform/forum/threads/${threadId}`);
      navigate('/platform/forum');
    } catch {
      // Ignore errors for now
    }
  };

  const handleReplyPosted = (reply: ForumReply) => {
    setThread(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        replies: [...prev.replies, reply],
        _count: prev._count ? { replies: prev._count.replies + 1 } : undefined,
      };
    });
  };

  // ---- Render: loading ----

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
        <LoadingSpinner label="Loading thread..." />
      </div>
    );
  }

  // ---- Render: error ----

  if (error || !thread) {
    return (
      <EmptyState
        icon={<AlertTriangle size={22} />}
        message="Thread not found"
        description={error ?? 'This thread may have been removed.'}
        action={{ label: 'Back to forum', onClick: () => navigate('/platform/forum') }}
      />
    );
  }

  // ---- Styles ----

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '800px',
    margin: '0 auto',
  };

  const backLinkStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '20px',
    padding: '6px 12px',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: 'var(--platform-radius-md, 6px)',
    color: 'var(--platform-text-secondary)',
    fontSize: '13px',
    textDecoration: 'none',
    cursor: 'pointer',
  };

  const threadCardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: thread.pinned ? 'var(--platform-color-secondary-500, #c9921b)' : 'var(--platform-border)',
    borderRadius: '10px',
    padding: '24px',
    marginBottom: '24px',
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    marginBottom: '8px',
    flexWrap: 'wrap',
  };

  const titleStyle: CSSProperties = {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: 0,
    flex: 1,
    minWidth: 0,
  };

  const badgeBaseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '11px',
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: '999px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    alignSelf: 'center',
  };

  const pinnedBadgeStyle: CSSProperties = {
    ...badgeBaseStyle,
    backgroundColor: 'rgba(201, 146, 27, 0.12)',
    color: 'var(--platform-color-secondary-500, #c9921b)',
  };

  const lockedBadgeStyle: CSSProperties = {
    ...badgeBaseStyle,
    backgroundColor: 'rgba(185, 48, 64, 0.10)',
    color: '#b93040',
  };

  const metaStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    fontSize: '12px',
    color: 'var(--platform-text-muted)',
    flexWrap: 'wrap',
    marginBottom: '16px',
  };

  const dividerStyle: CSSProperties = {
    height: '1px',
    backgroundColor: 'var(--platform-border)',
    marginBottom: '16px',
  };

  const bodyStyle: CSSProperties = {
    fontSize: '15px',
    color: 'var(--platform-text-primary)',
    lineHeight: 1.7,
    margin: 0,
    whiteSpace: 'pre-wrap',
  };

  const repliesHeaderStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    marginBottom: '14px',
  };

  const replyCount = thread._count?.replies ?? thread.replies.length;

  // ---- Render ----

  return (
    <div style={pageStyle}>
      {/* Back link */}
      <Link to="/platform/forum" style={backLinkStyle} aria-label="Back to forum">
        ← Back to forum
      </Link>

      {/* Thread card */}
      <article style={threadCardStyle}>
        {/* Header row */}
        <div style={headerStyle}>
          <h1 style={titleStyle}>{thread.title}</h1>
          {thread.pinned && (
            <span style={pinnedBadgeStyle}>Pinned</span>
          )}
          {thread.locked && (
            <span style={lockedBadgeStyle}>Locked</span>
          )}
        </div>

        {/* Meta row */}
        <div style={metaStyle}>
          <span>by {thread.authorName}</span>
          <span>{formatDate(thread.createdAt)}</span>
          <span>
            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
          </span>
        </div>

        {/* Divider */}
        <div style={dividerStyle} />

        {/* Body */}
        <p style={bodyStyle}>{thread.body}</p>

        {/* Moderation actions */}
        {isManagerRole(platformRole) && (
          <ModerationActions
            thread={thread}
            threadId={String(thread.id)}
            onPin={handlePin}
            onLock={handleLock}
            onDelete={handleDelete}
          />
        )}
      </article>

      {/* Replies section */}
      <section>
        <h2 style={repliesHeaderStyle}>Replies</h2>

        {thread.replies.length === 0 ? (
          <EmptyState
            icon={<MessageCircle size={22} />}
            message="No replies yet"
            description="Be the first to reply to this thread!"
          />
        ) : (
          thread.replies.map(reply => (
            <ReplyCard key={reply.id} reply={reply} />
          ))
        )}
      </section>

      {/* Reply form (hidden when locked) */}
      {!thread.locked && threadId && (
        <ReplyForm threadId={threadId} onReplyPosted={handleReplyPosted} />
      )}
    </div>
  );
}
