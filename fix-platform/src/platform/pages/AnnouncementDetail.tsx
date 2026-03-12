/**
 * AnnouncementDetail page - /platform/announcements/:id
 *
 * Shows a single announcement with full body rendered as markdown.
 * Auto-marks as read on view.
 * Has a back button to return to the list.
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { parseMarkdown } from '../../utils/markdown';
import type { Announcement, Priority } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { AlertTriangle } from 'lucide-react';

const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: '#2e7d32',
  NORMAL: '#1a5c5a',
  HIGH: '#b07800',
  URGENT: '#c62828',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AnnouncementDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const markRead = useCallback(async (announcementId: number) => {
    try {
      await api.post(`/api/platform/announcements/${announcementId}/read`);
    } catch {
      // Non-critical - ignore errors on mark-read
    }
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<Announcement>(`/api/platform/announcements/${id}`);
      setAnnouncement(data);
      // Auto-mark as read if not already read
      if (!data.isRead) {
        await markRead(data.id);
        setAnnouncement((prev) => prev ? { ...prev, isRead: true } : prev);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load announcement');
    } finally {
      setLoading(false);
    }
  }, [id, markRead]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingSpinner label="Loading announcement..." />;

  if (error || !announcement) {
    return (
      <EmptyState
        icon={<AlertTriangle size={22} />}
        message="Announcement not found"
        description={error ?? 'This announcement may have been removed.'}
        action={{ label: 'Back to announcements', onClick: () => navigate('/platform/announcements') }}
      />
    );
  }

  const priorityColor = PRIORITY_COLORS[announcement.priority] ?? 'var(--platform-priority-normal)';
  const renderedBody = parseMarkdown(announcement.body || '');

  return (
    <div style={{ maxWidth: '760px' }}>
      {/* Back button */}
      <button
        onClick={() => navigate('/platform/announcements')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '24px',
          padding: '6px 12px',
          background: 'transparent',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: '#e0e0e0',
          borderRadius: '6px',
          color: 'var(--platform-text-secondary)',
          fontSize: '13px',
          cursor: 'pointer',
        }}
      >
        <span>←</span>
        <span>Back to announcements</span>
      </button>

      {/* Article card */}
      <article
        style={{
          backgroundColor: '#fff',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: announcement.pinned ? '#1a5c5a' : '#e0e0e0',
          borderRadius: '10px',
          padding: '32px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        }}
      >
        {/* Meta row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '16px',
            flexWrap: 'wrap',
          }}
        >
          {announcement.pinned && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#1a5c5a',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              📌 Pinned
            </span>
          )}

          {announcement.category && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: '4px',
                backgroundColor: '#f5f0eb',
                color: '#888',
              }}
            >
              {announcement.category}
            </span>
          )}

          {announcement.priority !== 'NORMAL' && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: priorityColor,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              {announcement.priority === 'URGENT'
                ? '🔴'
                : announcement.priority === 'HIGH'
                ? '🟠'
                : '🟢'}{' '}
              {PRIORITY_LABELS[announcement.priority]}
            </span>
          )}
        </div>

        {/* Title */}
        <h1
          style={{
            margin: '0 0 8px',
            fontSize: '26px',
            fontWeight: 700,
            color: 'var(--platform-text-primary)',
            lineHeight: 1.3,
          }}
        >
          {announcement.title}
        </h1>

        {/* Date */}
        <p
          style={{
            margin: '0 0 28px',
            fontSize: '13px',
            color: '#888',
          }}
        >
          {formatDate(announcement.createdAt)}
        </p>

        {/* Divider */}
        <div
          style={{
            height: '1px',
            backgroundColor: '#e0e0e0',
            marginBottom: '28px',
          }}
        />

        {/* Body - rendered markdown */}
        {announcement.body ? (
          <div
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: renderedBody }}
            style={{
              color: '#333',
              fontSize: '15px',
              lineHeight: 1.7,
            }}
          />
        ) : (
          <p style={{ color: '#888', fontStyle: 'italic' }}>
            No content available.
          </p>
        )}
      </article>
    </div>
  );
}
