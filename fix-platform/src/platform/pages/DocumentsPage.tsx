/**
 * DocumentsPage — /platform/documents
 *
 * Platform documents library displaying building documents organized by category.
 *
 * Features:
 * - Fetches from GET /api/platform/documents → { items, nextCursor }
 * - Documents organized by category with grouping headers
 * - Title, category, description, file type icon, version info, upload date
 * - Search by title or description (client-side)
 * - Filter by category (client-side)
 * - Download link for latest version
 * - Expandable version history per document
 * - Cursor-based pagination (Load More)
 * - Loading, empty, and error states
 */
import { useState, useEffect, useCallback, type CSSProperties, type ReactElement } from 'react';
import type { Document, DocumentCategory, DocumentVersion, DocumentsListResponse } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { FileText, FileSpreadsheet, Presentation, File, FolderOpen } from 'lucide-react';
import '../styles/tokens.css';

// ---- File type helpers ----

type FileExtension = 'pdf' | 'docx' | 'doc' | 'xlsx' | 'xls' | 'pptx' | 'ppt' | 'txt' | 'other';

function getFileExtension(fileName: string): FileExtension {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const knownExts: FileExtension[] = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt'];
  return (knownExts.includes(ext as FileExtension) ? ext : 'other') as FileExtension;
}

function getFileIcon(ext: FileExtension): ReactElement {
  switch (ext) {
    case 'pdf':   return <FileText size={28} color="#e53935" />;
    case 'docx':
    case 'doc':   return <FileText size={28} color="#1a73e8" />;
    case 'xlsx':
    case 'xls':   return <FileSpreadsheet size={28} color="#2e7d32" />;
    case 'pptx':
    case 'ppt':   return <Presentation size={28} color="#e65100" />;
    case 'txt':   return <File size={28} color="#888" />;
    default:      return <FolderOpen size={28} color="#888" />;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getLatestVersion(versions: DocumentVersion[]): DocumentVersion | null {
  if (!versions.length) return null;
  return versions.reduce((latest, v) =>
    v.versionNumber > latest.versionNumber ? v : latest,
    versions[0]
  );
}

// ---- File Icon component ----

function FileIcon({ fileName }: { fileName: string }) {
  const ext = getFileExtension(fileName);
  const icon = getFileIcon(ext);
  return (
    <span
      data-testid={`file-icon-${ext}`}
      style={{ lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center' }}
      aria-label={`${ext.toUpperCase()} file`}
    >
      {icon}
    </span>
  );
}

// ---- Version History panel ----

interface VersionHistoryProps {
  versions: DocumentVersion[];
}

function VersionHistory({ versions }: VersionHistoryProps) {
  const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  return (
    <div
      style={{
        marginTop: '12px',
        paddingTop: '12px',
        borderTopWidth: 1,
        borderTopStyle: 'solid',
        borderTopColor: 'var(--platform-border)',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--platform-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '8px',
        }}
      >
        All Versions
      </div>
      {sorted.map(v => {
        const ext = getFileExtension(v.fileName);
        return (
          <div
            key={v.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 10px',
              borderRadius: '6px',
              marginBottom: '4px',
              backgroundColor: '#f5f0eb',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--platform-accent)',
                minWidth: '28px',
              }}
            >
              v{v.versionNumber}
            </span>
            <span
              style={{
                flex: 1,
                fontSize: '13px',
                color: 'var(--platform-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {v.fileName}
            </span>
            <span
              style={{
                fontSize: '12px',
                color: 'var(--platform-text-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              {formatDate(v.uploadedAt)}
            </span>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--platform-text-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              {formatFileSize(v.fileSize)}
            </span>
            <a
              href={v.fileUrl}
              download={v.fileName}
              style={{
                fontSize: '12px',
                color: 'var(--platform-accent)',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
              aria-label={`Download ${v.fileName} (v${v.versionNumber})`}
            >
              Download
            </a>
            <span data-testid={`file-icon-${ext}`} style={{ display: 'none' }} aria-hidden />
          </div>
        );
      })}
    </div>
  );
}

// ---- Document Card ----

interface DocumentCardProps {
  doc: Document;
}

function DocumentCard({ doc }: DocumentCardProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const latestVersion = getLatestVersion(doc.versions);
  const hasMultipleVersions = doc.versions.length > 1;
  const ext = latestVersion ? getFileExtension(latestVersion.fileName) : 'other';

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '16px',
    marginBottom: '12px',
    transition: 'background 0.15s',
  };

  return (
    <div style={cardStyle} data-testid={`document-card-${doc.id}`}>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
        {/* File icon */}
        {latestVersion && (
          <FileIcon fileName={latestVersion.fileName} />
        )}

        {/* Document info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--platform-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {doc.title}
            </h3>
            {latestVersion && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--platform-accent)',
                  backgroundColor: 'rgba(26, 92, 90, 0.08)',
                  padding: '2px 7px',
                  borderRadius: '999px',
                  whiteSpace: 'nowrap',
                }}
              >
                v{latestVersion.versionNumber}
              </span>
            )}
            <span
              style={{
                fontSize: '11px',
                color: '#888',
                backgroundColor: '#f5f0eb',
                padding: '2px 7px',
                borderRadius: '999px',
                whiteSpace: 'nowrap',
              }}
            >
              {doc.category.name}
            </span>
          </div>

          {doc.description && (
            <p
              style={{
                margin: '0 0 8px',
                fontSize: '13px',
                color: 'var(--platform-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              {doc.description}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              fontSize: '12px',
              color: 'var(--platform-text-muted)',
            }}
          >
            <span>Uploaded {formatDate(doc.createdAt)}</span>
            {latestVersion && (
              <>
                <span>{ext.toUpperCase()}</span>
                <span>{formatFileSize(latestVersion.fileSize)}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
          {hasMultipleVersions && (
            <button
              onClick={() => setHistoryOpen(o => !o)}
              aria-label="Version history"
              aria-expanded={historyOpen}
              style={{
                backgroundColor: 'transparent',
                color: 'var(--platform-text-secondary)',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: 'var(--platform-border)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {historyOpen ? 'Hide history' : 'Version history'}
            </button>
          )}
          {latestVersion && (
            <a
              href={latestVersion.fileUrl}
              download={latestVersion.fileName}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: 'var(--platform-accent)',
                color: '#fff',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 600,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
              aria-label={`Download ${doc.title}`}
            >
              Download
            </a>
          )}
        </div>
      </div>

      {/* Expandable version history */}
      {historyOpen && doc.versions.length > 0 && (
        <VersionHistory versions={doc.versions} />
      )}
    </div>
  );
}

// ---- Category Group ----

interface CategoryGroupProps {
  category: DocumentCategory;
  documents: Document[];
}

function CategoryGroup({ category, documents }: CategoryGroupProps) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '14px',
          paddingBottom: '8px',
          borderBottomWidth: 1,
          borderBottomStyle: 'solid',
          borderBottomColor: 'var(--platform-border)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--platform-text-primary)',
          }}
        >
          {category.name}
        </h2>
        <span
          style={{
            fontSize: '12px',
            color: 'var(--platform-text-muted)',
            backgroundColor: '#f5f0eb',
            padding: '2px 8px',
            borderRadius: '999px',
          }}
        >
          {documents.length} {documents.length === 1 ? 'document' : 'documents'}
        </span>
      </div>
      {documents.map(doc => (
        <DocumentCard key={doc.id} doc={doc} />
      ))}
    </div>
  );
}

// ---- Main component ----

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  // Search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | ''>('');

  const fetchDocuments = useCallback(async (cursor?: string, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);

      const qs = params.toString();
      const url = `/api/platform/documents${qs ? `?${qs}` : ''}`;
      const data = await api.get<DocumentsListResponse>(url);

      setDocuments(prev => append ? [...prev, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleLoadMore = () => {
    if (nextCursor) fetchDocuments(nextCursor, true);
  };

  // ---- Client-side filtering ----

  const filtered = documents.filter(doc => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesTitle = doc.title.toLowerCase().includes(q);
      const matchesDescription = doc.description?.toLowerCase().includes(q) ?? false;
      if (!matchesTitle && !matchesDescription) return false;
    }
    // Category filter - use category.id to support both categoryId and nested category object
    if (categoryFilter !== '' && doc.category.id !== categoryFilter) return false;
    return true;
  });

  // ---- Derive categories for the filter dropdown ----
  const allCategories = Array.from(
    new Map(documents.map(d => [d.category.id, d.category])).values()
  );

  // ---- Group filtered docs by category ----
  const grouped = new Map<number, { category: DocumentCategory; docs: Document[] }>();
  for (const doc of filtered) {
    if (!grouped.has(doc.categoryId)) {
      grouped.set(doc.categoryId, { category: doc.category, docs: [] });
    }
    grouped.get(doc.categoryId)!.docs.push(doc);
  }
  const groupedEntries = Array.from(grouped.values());

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

  const loadMoreStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    padding: '16px 0',
  };

  const loadMoreBtnStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-accent)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-accent)',
    borderRadius: '6px',
    padding: '8px 24px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  };

  // ---- Render ----

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h1 style={titleStyle}>Documents</h1>
        <p style={subtitleStyle}>Building documents, policies, and records</p>
      </div>

      {/* Controls: search + category filter */}
      <div style={controlsStyle}>
        <div style={filterGroupStyle}>
          <label style={labelStyle} htmlFor="doc-search">Search</label>
          <input
            id="doc-search"
            type="text"
            placeholder="Search documents..."
            style={inputStyle}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search documents"
          />
        </div>

        <div style={filterGroupStyle}>
          <label style={labelStyle} htmlFor="category-filter">Category</label>
          <select
            id="category-filter"
            style={selectStyle}
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value === '' ? '' : Number(e.target.value))}
            aria-label="Filter by category"
          >
            <option value="">All Categories</option>
            {allCategories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={errorStyle} role="alert">
          <span>Failed to load documents: {error}</span>
          <button
            style={retryBtnStyle}
            onClick={() => fetchDocuments()}
            aria-label="Retry"
          >
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <LoadingSpinner size={40} label="Loading documents..." />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText size={22} />}
          message="No documents found"
          description={
            searchQuery || categoryFilter !== ''
              ? 'Try adjusting your search or filter.'
              : 'No documents have been uploaded yet.'
          }
        />
      ) : (
        <>
          {groupedEntries.map(({ category, docs }) => (
            <CategoryGroup key={category.id} category={category} documents={docs} />
          ))}

          {/* Load More */}
          {nextCursor && (
            <div style={loadMoreStyle}>
              <button
                style={loadMoreBtnStyle}
                onClick={handleLoadMore}
                disabled={loadingMore}
                aria-label="Load more documents"
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
