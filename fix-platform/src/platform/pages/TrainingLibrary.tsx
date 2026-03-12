/**
 * TrainingLibrary — /platform/training
 *
 * Training resources library page showing building training modules and videos.
 *
 * Features:
 * - Fetches from GET /api/platform/training → TrainingResource[]
 * - Lists training modules with title, description, content type, due date
 * - Search by title (client-side)
 * - Filter by content type (VIDEO, DOCUMENT, LINK)
 * - Progress indicator per module (shows completion count)
 * - Click to view module detail → /platform/training/:id
 * - Loading, empty, and error states
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { TrainingResource, ContentType } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { GraduationCap } from 'lucide-react';
import '../styles/tokens.css';

// ---- Content type helpers ----

const CONTENT_TYPE_CONFIG: Record<ContentType, { label: string; icon: string; color: string; bg: string }> = {
  VIDEO:    { label: 'Video',    icon: 'V', color: '#1a3a6e', bg: 'rgba(26,58,110,0.1)' },
  DOCUMENT: { label: 'Document', icon: 'D', color: '#2d7a47', bg: 'rgba(45,122,71,0.1)' },
  LINK:     { label: 'Link',     icon: 'L', color: '#c9921b', bg: 'rgba(201,146,27,0.1)' },
};

const FILTER_OPTIONS: Array<{ value: ContentType | ''; label: string }> = [
  { value: '',         label: 'All Types' },
  { value: 'VIDEO',    label: 'Video' },
  { value: 'DOCUMENT', label: 'Document' },
  { value: 'LINK',     label: 'Link' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---- Content Type Badge ----

function ContentTypeBadge({ resourceId, contentType }: { resourceId: string; contentType: ContentType }) {
  const config = CONTENT_TYPE_CONFIG[contentType];
  return (
    <span
      data-testid={`content-type-${resourceId}`}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 700,
        color: config.color,
        backgroundColor: config.bg,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: config.color,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {config.label}
    </span>
  );
}

// ---- Progress Indicator ----

function ProgressIndicator({ resourceId, completions }: { resourceId: string; completions: number }) {
  const isNotStarted = completions === 0;

  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    fontWeight: 600,
    color: isNotStarted ? 'var(--platform-text-muted)' : '#2d7a47',
    backgroundColor: isNotStarted ? 'rgba(0,0,0,0.04)' : 'rgba(45,122,71,0.08)',
    padding: '3px 8px',
    borderRadius: '999px',
    whiteSpace: 'nowrap',
  };

  return (
    <span data-testid={`progress-${resourceId}`} style={style}>
      {isNotStarted ? 'Not Started' : `${completions} Completed`}
    </span>
  );
}

// ---- Training Module Card ----

interface TrainingCardProps {
  resource: TrainingResource;
}

function TrainingCard({ resource }: TrainingCardProps) {
  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '16px 20px',
    marginBottom: '12px',
    transition: 'border-color 0.15s',
  };

  return (
    <div style={cardStyle} data-testid={`training-card-${resource.id}`}>
      {/* Top row: title + type badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          marginBottom: '8px',
          flexWrap: 'wrap',
        }}
      >
        {/* Title link */}
        <Link
          to={`/platform/training/${resource.id}`}
          aria-label={resource.title}
          style={{
            flex: 1,
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--platform-text-primary)',
            textDecoration: 'none',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {resource.title}
        </Link>

        {/* Badges row */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
          <ContentTypeBadge resourceId={resource.id} contentType={resource.contentType} />

          {resource.requiredForRoles.length > 0 && (
            <span
              data-testid={`required-badge-${resource.id}`}
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#b93040',
                backgroundColor: 'rgba(185,48,64,0.08)',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: 'rgba(185,48,64,0.3)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}
            >
              Required
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p
        style={{
          margin: '0 0 10px',
          fontSize: '13px',
          color: 'var(--platform-text-secondary)',
          lineHeight: 1.5,
        }}
      >
        {resource.description}
      </p>

      {/* Footer: progress + due date */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <ProgressIndicator
          resourceId={resource.id}
          completions={resource._count.completions}
        />

        {resource.dueDate && (
          <span
            style={{
              fontSize: '12px',
              color: 'var(--platform-text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            Due {formatDate(resource.dueDate)}
          </span>
        )}

        {resource.requiredForRoles.length > 0 && (
          <span
            style={{
              fontSize: '12px',
              color: 'var(--platform-text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            Required for: {resource.requiredForRoles.join(', ')}
          </span>
        )}
      </div>
    </div>
  );
}

// ---- Main component ----

export default function TrainingLibrary() {
  const [resources, setResources] = useState<TrainingResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ContentType | ''>('');

  const fetchResources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<TrainingResource[]>('/api/platform/training?active=true');
      setResources(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load training resources');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  // ---- Client-side filtering ----

  const filtered = resources.filter(r => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!r.title.toLowerCase().includes(q)) return false;
    }
    if (typeFilter && r.contentType !== typeFilter) return false;
    return true;
  });

  // ---- Styles ----

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '960px',
    margin: '0 auto',
  };

  const headerStyle: CSSProperties = {
    marginBottom: '20px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: 0,
  };

  const subtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    marginTop: '4px',
    marginBottom: 0,
  };

  const controlsStyle: CSSProperties = {
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

  const inputStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '7px 12px',
    fontSize: '14px',
    outline: 'none',
    minWidth: '220px',
  };

  const selectStyle: CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    minWidth: '160px',
  };

  const errorStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    backgroundColor: 'rgba(185, 48, 64, 0.08)',
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
    borderRadius: '6px',
    padding: '4px 12px',
    fontSize: '13px',
    cursor: 'pointer',
    marginLeft: 'auto',
    flexShrink: 0,
  };

  const countStyle: CSSProperties = {
    fontSize: '13px',
    color: 'var(--platform-text-muted)',
    marginBottom: '16px',
  };

  // ---- Render ----

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h1 style={titleStyle}>Training Library</h1>
        <p style={subtitleStyle}>Building training modules, safety videos, and compliance materials</p>
      </div>

      {/* Controls: search + type filter */}
      <div style={controlsStyle}>
        <div style={filterGroupStyle}>
          <label style={labelStyle} htmlFor="training-search">Search</label>
          <input
            id="training-search"
            type="text"
            placeholder="Search training modules..."
            style={inputStyle}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search training modules"
          />
        </div>

        <div style={filterGroupStyle}>
          <label style={labelStyle} htmlFor="type-filter">Filter by Type</label>
          <select
            id="type-filter"
            style={selectStyle}
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as ContentType | '')}
            aria-label="Filter by type"
          >
            {FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={errorStyle} role="alert">
          <span>Failed to load training resources: {error}</span>
          <button
            style={retryBtnStyle}
            onClick={() => fetchResources()}
            aria-label="Retry"
          >
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <LoadingSpinner size="lg" label="Loading training resources..." />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={22} />}
          message="No training modules found"
          description={
            searchQuery || typeFilter
              ? 'Try adjusting your search or filter.'
              : 'No training materials have been added yet.'
          }
        />
      ) : (
        <>
          {/* Count */}
          <div style={countStyle}>
            {filtered.length} {filtered.length === 1 ? 'module' : 'modules'}
            {(searchQuery || typeFilter) && ' (filtered)'}
          </div>

          {/* Module list */}
          {filtered.map(resource => (
            <TrainingCard key={resource.id} resource={resource} />
          ))}
        </>
      )}
    </div>
  );
}
