/**
 * AnnouncementsList page - /platform/announcements
 *
 * Displays platform announcements with:
 * - Pinned items at top
 * - Category badge, date, priority indicator, body excerpt
 * - Unread indicator dot
 * - Filter by category and read/unread status
 * - Click navigates to detail view
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import type { Announcement, Priority } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import '../styles/tokens.css';
import { AlertTriangle, Inbox } from 'lucide-react';

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
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getExcerpt(body: string, maxLength = 140): string {
  const plain = body.replace(/[#*_~`>]/g, '').trim();
  if (plain.length <= maxLength) return plain;
  return plain.slice(0, maxLength).trimEnd() + '…';
}

interface FilterState {
  category: string;
  readStatus: 'all' | 'read' | 'unread';
  search: string;
}

export default function AnnouncementsList() {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    category: '',
    readStatus: 'all',
    search: '',
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<Announcement[]>('/api/platform/announcements');
      setAnnouncements(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Derive unique categories for filter dropdown
  const categories = Array.from(
    new Set(announcements.map((a) => a.category).filter(Boolean))
  ).sort();

  // Apply filters
  const filtered = announcements.filter((a) => {
    if (filters.category && a.category !== filters.category) return false;
    if (filters.readStatus === 'read' && !a.isRead) return false;
    if (filters.readStatus === 'unread' && a.isRead) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (
        !a.title.toLowerCase().includes(q) &&
        !a.body.toLowerCase().includes(q) &&
        !a.category.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const unreadCount = announcements.filter((a) => !a.isRead).length;

  if (loading) return <LoadingSpinner label="Loading announcements..." />;

  if (error) {
    return (
      <EmptyState
        icon={<AlertTriangle size={22} />}
        message="Failed to load announcements"
        description={error}
        action={{ label: 'Retry', onClick: load }}
      />
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 700,
              color: 'var(--platform-text-primary)',
            }}
          >
            Announcements
          </h1>
          {unreadCount > 0 && (
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '13px',
                color: 'var(--platform-text-secondary)',
              }}
            >
              {unreadCount} unread
            </p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {/* Search */}
        <input
          type="text"
          placeholder="Search announcements..."
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          aria-label="Search announcements"
          style={{
            flex: '1 1 200px',
            minWidth: '160px',
            padding: '8px 12px',
            backgroundColor: 'var(--platform-surface)',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: 'var(--platform-border)',
            borderRadius: '6px',
            color: 'var(--platform-text-primary)',
            fontSize: '14px',
            outline: 'none',
          }}
        />

        {/* Category filter */}
        {categories.length > 0 && (
          <select
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
            aria-label="Filter by category"
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--platform-surface)',
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: 'var(--platform-border)',
              borderRadius: '6px',
              color: 'var(--platform-text-primary)',
              fontSize: '14px',
              cursor: 'pointer',
              outline: 'none',
              minWidth: '140px',
            }}
          >
            <option value="">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        )}

        {/* Read status filter */}
        <select
          value={filters.readStatus}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              readStatus: e.target.value as FilterState['readStatus'],
            }))
          }
          aria-label="Filter by read status"
          style={{
            padding: '8px 12px',
            backgroundColor: 'var(--platform-surface)',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: 'var(--platform-border)',
            borderRadius: '6px',
            color: 'var(--platform-text-primary)',
            fontSize: '14px',
            cursor: 'pointer',
            outline: 'none',
            minWidth: '120px',
          }}
        >
          <option value="all">All</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Inbox size={22} />}
          message="No announcements found"
          description={
            filters.search || filters.category || filters.readStatus !== 'all'
              ? 'Try adjusting your filters.'
              : 'There are no announcements yet.'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              onClick={() => navigate(`/platform/announcements/${announcement.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface AnnouncementCardProps {
  announcement: Announcement;
  onClick: () => void;
}

function AnnouncementCard({ announcement, onClick }: AnnouncementCardProps) {
  const [hovered, setHovered] = useState(false);
  const priorityColor = PRIORITY_COLORS[announcement.priority] ?? 'var(--platform-priority-normal)';

  return (
    <div
      role="article"
      aria-label={announcement.title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: hovered ? 'var(--platform-surface-hover)' : 'var(--platform-surface)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: announcement.pinned ? 'var(--platform-accent)' : 'var(--platform-border)',
        borderRadius: '10px',
        padding: '16px 20px',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
        display: 'flex',
        gap: '16px',
        alignItems: 'flex-start',
      }}
    >
      {/* Unread dot / read indicator */}
      <div
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: announcement.isRead ? 'transparent' : 'var(--platform-accent)',
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: announcement.isRead ? 'var(--platform-border)' : 'var(--platform-accent)',
          flexShrink: 0,
          marginTop: '6px',
        }}
        aria-label={announcement.isRead ? 'Read' : 'Unread'}
        title={announcement.isRead ? 'Read' : 'Unread'}
      />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top row: pinned badge, category, priority, date */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '6px',
            flexWrap: 'wrap',
          }}
        >
          {announcement.pinned && (
            <span
              style={{
                fontSize: '11px',
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
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: 'var(--platform-bg-muted)',
                color: 'var(--platform-text-muted)',
                letterSpacing: '0.03em',
              }}
            >
              {announcement.category}
            </span>
          )}

          {announcement.priority !== 'NORMAL' && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: priorityColor,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
              title={`Priority: ${PRIORITY_LABELS[announcement.priority]}`}
            >
              {announcement.priority === 'URGENT' ? '🔴' : announcement.priority === 'HIGH' ? '🟠' : '🟢'}{' '}
              {PRIORITY_LABELS[announcement.priority]}
            </span>
          )}

          <span
            style={{
              fontSize: '12px',
              color: '#888',
              marginLeft: 'auto',
            }}
          >
            {formatDate(announcement.createdAt)}
          </span>
        </div>

        {/* Title */}
        <h3
          style={{
            margin: '0 0 6px',
            fontSize: '15px',
            fontWeight: announcement.isRead ? 500 : 700,
            color: announcement.isRead
              ? 'var(--platform-text-secondary)'
              : 'var(--platform-text-primary)',
            lineHeight: 1.4,
          }}
        >
          {announcement.title}
        </h3>

        {/* Excerpt */}
        {announcement.body && (
          <p
            style={{
              margin: 0,
              fontSize: '13px',
              color: 'var(--platform-text-muted)',
              lineHeight: 1.5,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {getExcerpt(announcement.body)}
          </p>
        )}
      </div>
    </div>
  );
}
