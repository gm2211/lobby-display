/**
 * ForumPage — /platform/forum
 *
 * Community forum for residents with category browsing and thread list.
 *
 * Features:
 * - Fetches categories from GET /api/platform/forum/categories
 * - Fetches threads from GET /api/platform/forum/threads?categoryId=X
 * - Category sidebar with name, description, thread count
 * - Thread list with title, author, reply count, dates
 * - Click thread title → /platform/forum/:threadId
 * - "New Thread" button → /platform/forum/new
 * - Category filtering
 * - Client-side search by thread title
 * - Loading, empty, error states
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ForumCategory, ForumThread } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { MessageCircle, MessagesSquare } from 'lucide-react';
import '../styles/tokens.css';

// ---- Helpers ----

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---- ThreadCard ----

interface ThreadCardProps {
  thread: ForumThread;
}

function ThreadCard({ thread }: ThreadCardProps) {
  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '16px',
    marginBottom: '10px',
  };

  const headerRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    marginBottom: '8px',
    flexWrap: 'wrap',
  };

  const titleLinkStyle: CSSProperties = {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--platform-text-primary)',
    textDecoration: 'none',
    flex: 1,
    minWidth: 0,
  };

  const badgeBaseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '999px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
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
  };

  return (
    <div style={cardStyle} data-testid={`thread-card-${thread.id}`}>
      <div style={headerRowStyle}>
        <Link
          to={`/platform/forum/${thread.id}`}
          style={titleLinkStyle}
          aria-label={thread.title}
        >
          {thread.title}
        </Link>
        {thread.pinned && (
          <span style={pinnedBadgeStyle}>Pinned</span>
        )}
        {thread.locked && (
          <span style={lockedBadgeStyle}>Locked</span>
        )}
      </div>
      <div style={metaStyle}>
        <span>by {thread.authorName}</span>
        <span>{formatDate(thread.createdAt)}</span>
        {thread._count !== undefined && (
          <span>{thread._count.replies} {thread._count.replies === 1 ? 'reply' : 'replies'}</span>
        )}
        {thread.lastReplyAt && (
          <span>Last reply {formatDate(thread.lastReplyAt)}</span>
        )}
      </div>
    </div>
  );
}

// ---- CategoryItem ----

interface CategoryItemProps {
  category: ForumCategory;
  active: boolean;
  onClick: () => void;
}

function CategoryItem({ category, active, onClick }: CategoryItemProps) {
  const itemStyle: CSSProperties = {
    padding: '12px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    backgroundColor: active ? 'var(--platform-accent)' : 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: active ? 'var(--platform-accent)' : 'transparent',
    marginBottom: '4px',
    transition: 'background 0.15s',
  };

  const nameStyle: CSSProperties = {
    fontSize: '14px',
    fontWeight: 600,
    color: active ? '#fff' : 'var(--platform-text-primary)',
    display: 'block',
    marginBottom: '2px',
  };

  const descStyle: CSSProperties = {
    fontSize: '12px',
    color: active ? 'rgba(255,255,255,0.75)' : 'var(--platform-text-muted)',
    display: 'block',
    marginBottom: '4px',
  };

  const countStyle: CSSProperties = {
    fontSize: '11px',
    color: active ? 'rgba(255,255,255,0.65)' : 'var(--platform-text-muted)',
    display: 'block',
  };

  return (
    <button
      style={itemStyle}
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Filter by ${category.name}`}
    >
      <span style={nameStyle}>{category.name}</span>
      {category.description && (
        <span style={descStyle}>{category.description}</span>
      )}
      {category._count !== undefined && (
        <span style={countStyle}>{category._count.threads} threads</span>
      )}
    </button>
  );
}

// ---- Main component ----

export default function ForumPage() {
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async (categoryId: number | null = null) => {
    setLoading(true);
    setError(null);
    try {
      const [cats, thrds] = await Promise.all([
        api.get<ForumCategory[]>('/api/platform/forum/categories'),
        api.get<ForumThread[]>(
          `/api/platform/forum/threads${categoryId ? `?categoryId=${categoryId}` : ''}`
        ),
      ]);
      setCategories(cats);
      setThreads(thrds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load forum');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(null);
  }, [loadData]);

  const handleCategoryClick = async (categoryId: number | null) => {
    setSelectedCategoryId(categoryId);
    setSearchQuery('');
    if (categoryId === null) {
      // Reset — re-fetch all threads
      setLoading(true);
      setError(null);
      try {
        const thrds = await api.get<ForumThread[]>('/api/platform/forum/threads');
        setThreads(thrds);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load threads');
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      setError(null);
      try {
        const thrds = await api.get<ForumThread[]>(
          `/api/platform/forum/threads?categoryId=${categoryId}`
        );
        setThreads(thrds);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load threads');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleRetry = () => {
    loadData(selectedCategoryId);
  };

  // Client-side search
  const filteredThreads = threads.filter(t => {
    if (!searchQuery) return true;
    return t.title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // ---- Styles ----

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  };

  const headerStyle: CSSProperties = {
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
    margin: 0,
  };

  const newThreadBtnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'var(--platform-accent)',
    color: '#fff',
    borderRadius: '6px',
    padding: '8px 18px',
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  };

  const layoutStyle: CSSProperties = {
    display: 'flex',
    gap: '24px',
    alignItems: 'flex-start',
  };

  const sidebarStyle: CSSProperties = {
    width: '240px',
    flexShrink: 0,
  };

  const sidebarHeaderStyle: CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--platform-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '10px',
    paddingBottom: '8px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border)',
  };

  const allCategoriesStyle: CSSProperties = {
    padding: '10px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    backgroundColor: selectedCategoryId === null ? 'var(--platform-accent)' : 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: selectedCategoryId === null ? 'var(--platform-accent)' : 'transparent',
    marginBottom: '4px',
    fontSize: '14px',
    fontWeight: 600,
    color: selectedCategoryId === null ? '#fff' : 'var(--platform-text-primary)',
    width: '100%',
    textAlign: 'left',
  };

  const mainStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
  };

  const searchStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
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
    marginBottom: '16px',
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

  const retryBtnStyle: CSSProperties = {
    backgroundColor: 'transparent',
    color: '#ef4444',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#ef4444',
    borderRadius: '6px',
    padding: '4px 12px',
    fontSize: '13px',
    cursor: 'pointer',
    marginLeft: 'auto',
    flexShrink: 0,
  };

  // ---- Render ----

  if (loading && categories.length === 0 && threads.length === 0 && !error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
        <LoadingSpinner label="Loading forum..." />
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h1 style={titleStyle}>Forum</h1>
        <Link to="/platform/forum/new" style={newThreadBtnStyle} aria-label="New Thread">
          + New Thread
        </Link>
      </div>

      {/* Error banner */}
      {error && (
        <div style={errorStyle} role="alert">
          <span>Failed to load forum: {error}</span>
          <button
            style={retryBtnStyle}
            onClick={handleRetry}
            aria-label="Retry"
          >
            Retry
          </button>
        </div>
      )}

      {/* Layout */}
      <div style={layoutStyle}>
        {/* Sidebar */}
        <div style={sidebarStyle}>
          <div style={sidebarHeaderStyle}>Categories</div>

          {categories.length === 0 && !loading ? (
            <EmptyState
              icon={<MessageCircle size={22} />}
              message="No categories found"
              description="No forum categories have been created yet."
            />
          ) : (
            <>
              <button
                style={allCategoriesStyle}
                onClick={() => handleCategoryClick(null)}
                aria-pressed={selectedCategoryId === null}
              >
                All Categories
              </button>
              {categories.map(cat => (
                <CategoryItem
                  key={cat.id}
                  category={cat}
                  active={selectedCategoryId === cat.id}
                  onClick={() => handleCategoryClick(cat.id)}
                />
              ))}
            </>
          )}
        </div>

        {/* Main thread list */}
        <div style={mainStyle}>
          {/* Search */}
          <input
            type="text"
            placeholder="Search threads..."
            style={searchStyle}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search threads"
          />

          {/* Loading (threads only) */}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <LoadingSpinner label="Loading threads..." />
            </div>
          )}

          {/* Thread list */}
          {!loading && filteredThreads.length === 0 && !error ? (
            <EmptyState
              icon={<MessagesSquare size={22} />}
              message="No threads found"
              description={
                searchQuery
                  ? 'Try a different search term.'
                  : 'Be the first to start a discussion!'
              }
            />
          ) : !loading ? (
            filteredThreads.map(thread => (
              <ThreadCard key={thread.id} thread={thread} />
            ))
          ) : null}
        </div>
      </div>
    </div>
  );
}
