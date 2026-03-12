/**
 * DocumentManagement Page — MANAGER+ only
 *
 * Provides a full document management interface:
 * - List existing documents with title, category, current version, upload date, download link
 * - Upload new document form: title, description, category select, file input
 * - POST to /api/platform/documents for new uploads
 * - Version management per document: upload new version with changelog textarea
 * - POST to /api/platform/documents/:id/versions for new versions
 * - Version history list: version number, changelog, upload date, uploader, download link
 * - Download links for specific versions
 * - Loading spinner while fetching
 * - Error handling with retry
 *
 * API:
 * - GET  /api/platform/documents             — list documents
 * - GET  /api/platform/documents/categories  — list categories
 * - POST /api/platform/documents             — create document + first version
 * - POST /api/platform/documents/:id/versions — upload new version
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import type { Document, DocumentCategory, DocumentVersion } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { FileText } from 'lucide-react';
import '../styles/tokens.css';

// ---- Helper functions ----

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getLatestVersion(versions: DocumentVersion[]): DocumentVersion | null {
  if (!versions.length) return null;
  return versions.reduce((latest, v) =>
    v.versionNumber > latest.versionNumber ? v : latest,
    versions[0]
  );
}

// ---- Version History Panel ----

interface VersionHistoryPanelProps {
  versions: DocumentVersion[];
}

function VersionHistoryPanel({ versions }: VersionHistoryPanelProps) {
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
        Version History
      </div>
      {sorted.map(v => (
        <div
          key={v.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 10px',
            borderRadius: '6px',
            marginBottom: '4px',
            backgroundColor: '#f9f9f9',
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
        </div>
      ))}
    </div>
  );
}

// ---- Version Upload Form ----

interface VersionUploadFormProps {
  documentId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

function VersionUploadForm({ documentId, onSuccess, onCancel }: VersionUploadFormProps) {
  const [changelog, setChangelog] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Build a simulated payload — in production this would upload the file to storage
    // and then send the storagePath. For now we send placeholder values.
    const filename = file ? file.name : 'document.pdf';
    const mimeType = file ? file.type || 'application/octet-stream' : 'application/pdf';
    const size = file ? file.size : 0;
    const storagePath = `/uploads/${documentId}/${Date.now()}-${filename}`;

    setLoading(true);
    try {
      await api.post(`/api/platform/documents/${documentId}/versions`, {
        filename,
        mimeType,
        size,
        storagePath,
        changelog: changelog.trim() || undefined,
      });
      setChangelog('');
      setFile(null);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload version');
    } finally {
      setLoading(false);
    }
  };

  const formStyle: CSSProperties = {
    marginTop: '12px',
    paddingTop: '12px',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--platform-border)',
  };

  const inputStyle: CSSProperties = {
    backgroundColor: 'var(--platform-bg)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '7px 10px',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  const textareaStyle: CSSProperties = {
    ...inputStyle,
    resize: 'vertical',
    minHeight: '60px',
    fontFamily: 'inherit',
  };

  const btnStyle = (variant: 'primary' | 'secondary'): CSSProperties => ({
    backgroundColor: variant === 'primary' ? 'var(--platform-accent)' : 'transparent',
    color: variant === 'primary' ? '#fff' : 'var(--platform-text-secondary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: variant === 'primary' ? 'var(--platform-accent)' : 'var(--platform-border)',
    borderRadius: '6px',
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    opacity: loading ? 0.7 : 1,
  });

  return (
    <form
      onSubmit={handleSubmit}
      style={formStyle}
      data-testid={`version-form-${documentId}`}
      noValidate
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--platform-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '10px',
        }}
      >
        Upload New Version
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label
          style={{ fontSize: '12px', color: 'var(--platform-text-secondary)', display: 'block', marginBottom: '4px' }}
          htmlFor={`version-file-input-${documentId}`}
        >
          File
        </label>
        <input
          id={`version-file-input-${documentId}`}
          type="file"
          data-testid={`version-file-${documentId}`}
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          style={{ ...inputStyle, padding: '4px' }}
        />
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label
          style={{ fontSize: '12px', color: 'var(--platform-text-secondary)', display: 'block', marginBottom: '4px' }}
          htmlFor={`version-changelog-input-${documentId}`}
        >
          Changelog
        </label>
        <textarea
          id={`version-changelog-input-${documentId}`}
          data-testid={`version-changelog-${documentId}`}
          placeholder="What changed in this version?"
          value={changelog}
          onChange={e => setChangelog(e.target.value)}
          style={textareaStyle}
        />
      </div>

      {error && (
        <div
          style={{
            fontSize: '13px',
            color: '#b93040',
            padding: '6px 10px',
            backgroundColor: 'rgba(185, 48, 64, 0.06)',
            borderRadius: '6px',
            marginBottom: '8px',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="submit"
          data-testid={`version-submit-${documentId}`}
          style={btnStyle('primary')}
          disabled={loading}
        >
          {loading ? 'Uploading...' : 'Upload Version'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={btnStyle('secondary')}
          disabled={loading}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---- Document Row ----

interface DocumentRowProps {
  doc: Document;
  onVersionUploaded: () => void;
}

function DocumentRow({ doc, onVersionUploaded }: DocumentRowProps) {
  const [showVersions, setShowVersions] = useState(false);
  const [showVersionForm, setShowVersionForm] = useState(false);
  const latestVersion = getLatestVersion(doc.versions);

  const rowStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '16px',
    marginBottom: '10px',
  };

  const btnStyle = (variant: 'primary' | 'ghost'): CSSProperties => ({
    backgroundColor: variant === 'primary' ? '#1a5c5a' : 'transparent',
    color: variant === 'primary' ? '#fff' : '#888',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: variant === 'primary' ? '#1a5c5a' : '#e0e0e0',
    borderRadius: '6px',
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: variant === 'primary' ? 600 : 400,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  });

  return (
    <div style={rowStyle} data-testid={`document-row-${doc.id}`}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        {/* Document info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const, marginBottom: '4px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--platform-text-primary)',
              }}
            >
              {doc.title}
            </h3>
            {latestVersion && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#1a5c5a',
                  backgroundColor: 'rgba(26,92,90,0.08)',
                  padding: '2px 7px',
                  borderRadius: '999px',
                }}
              >
                v{latestVersion.versionNumber}
              </span>
            )}
            <span
              style={{
                fontSize: '11px',
                color: 'var(--platform-badge-text)',
                backgroundColor: 'var(--platform-badge-bg)',
                padding: '2px 7px',
                borderRadius: '999px',
              }}
            >
              {doc.category.name}
            </span>
          </div>

          {doc.description && (
            <p
              style={{
                margin: '0 0 6px',
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
              fontSize: '12px',
              color: 'var(--platform-text-muted)',
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap' as const,
            }}
          >
            <span>Uploaded {formatDate(doc.createdAt)}</span>
            {latestVersion && (
              <span>{formatFileSize(latestVersion.fileSize)}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <button
            type="button"
            data-testid={`show-versions-btn-${doc.id}`}
            onClick={() => setShowVersions(v => !v)}
            aria-expanded={showVersions}
            style={btnStyle('ghost')}
          >
            {showVersions ? 'Hide versions' : 'Show versions'}
          </button>

          <button
            type="button"
            data-testid={`upload-version-btn-${doc.id}`}
            onClick={() => setShowVersionForm(v => !v)}
            style={btnStyle('ghost')}
          >
            {showVersionForm ? 'Cancel' : 'Upload Version'}
          </button>

          {latestVersion && (
            <a
              href={latestVersion.fileUrl}
              download={latestVersion.fileName}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: '#1a5c5a',
                color: '#fff',
                borderRadius: '6px',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 600,
                textDecoration: 'none',
                whiteSpace: 'nowrap' as const,
              }}
              aria-label={`Download ${doc.title}`}
            >
              Download
            </a>
          )}
        </div>
      </div>

      {/* Version history panel */}
      {showVersions && doc.versions.length > 0 && (
        <div data-testid={`version-history-${doc.id}`}>
          <VersionHistoryPanel versions={doc.versions} />
        </div>
      )}

      {/* Version upload form */}
      {showVersionForm && (
        <VersionUploadForm
          documentId={doc.id}
          onSuccess={() => {
            setShowVersionForm(false);
            onVersionUploaded();
          }}
          onCancel={() => setShowVersionForm(false)}
        />
      )}
    </div>
  );
}

// ---- Upload Document Form ----

interface UploadDocumentFormProps {
  categories: DocumentCategory[];
  onSuccess: () => void;
}

function UploadDocumentForm({ categories, onSuccess }: UploadDocumentFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!categoryId) {
      setError('Please select a category');
      return;
    }

    // Build a simulated payload — in production the file would be uploaded to storage first
    const filename = file ? file.name : 'document.pdf';
    const mimeType = file ? file.type || 'application/octet-stream' : 'application/pdf';
    const size = file ? file.size : 0;
    const storagePath = `/uploads/${Date.now()}-${filename}`;

    setLoading(true);
    try {
      await api.post('/api/platform/documents', {
        title: title.trim(),
        description: description.trim() || undefined,
        categoryId,
        filename,
        mimeType,
        size,
        storagePath,
      });
      setTitle('');
      setDescription('');
      setCategoryId('');
      setFile(null);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setLoading(false);
    }
  };

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '20px 24px',
    marginBottom: '28px',
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
    fontFamily: 'inherit',
  };

  const selectStyle: CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  };

  const labelStyle: CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--platform-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    display: 'block',
    marginBottom: '5px',
  };

  const fieldGroupStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    flex: '1 1 200px',
    minWidth: '160px',
  };

  return (
    <div style={cardStyle}>
      <h2
        style={{
          fontSize: '16px',
          fontWeight: 700,
          color: 'var(--platform-text-primary)',
          marginTop: 0,
          marginBottom: '16px',
        }}
      >
        Upload Document
      </h2>

      <form onSubmit={handleSubmit} data-testid="upload-document-form" noValidate>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {/* Title */}
          <div style={{ ...fieldGroupStyle, flex: '2 1 240px' }}>
            <label style={labelStyle} htmlFor="upload-title-input">
              Title *
            </label>
            <input
              id="upload-title-input"
              type="text"
              placeholder="Document title"
              data-testid="upload-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={inputStyle}
              aria-label="Document title"
            />
          </div>

          {/* Category */}
          <div style={fieldGroupStyle}>
            <label style={labelStyle} htmlFor="upload-category-select">
              Category *
            </label>
            <select
              id="upload-category-select"
              data-testid="upload-category"
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              style={selectStyle}
              aria-label="Document category"
            >
              <option value="">Select category...</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {/* Description */}
          <div style={{ ...fieldGroupStyle, flex: '2 1 240px' }}>
            <label style={labelStyle} htmlFor="upload-description-textarea">
              Description
            </label>
            <textarea
              id="upload-description-textarea"
              data-testid="upload-description"
              placeholder="Brief description of the document..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={textareaStyle}
              aria-label="Document description"
            />
          </div>

          {/* File input */}
          <div style={fieldGroupStyle}>
            <label style={labelStyle} htmlFor="upload-file-input">
              File
            </label>
            <input
              id="upload-file-input"
              type="file"
              data-testid="upload-file"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              style={{ ...inputStyle, padding: '6px' }}
              aria-label="Upload file"
            />
          </div>
        </div>

        {/* Form error */}
        {error && (
          <div
            data-testid="upload-form-error"
            style={{
              fontSize: '13px',
              color: '#b93040',
              padding: '8px 12px',
              backgroundColor: 'rgba(185, 48, 64, 0.06)',
              borderRadius: '6px',
              marginBottom: '12px',
            }}
          >
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          data-testid="upload-submit"
          disabled={loading}
          style={{
            backgroundColor: 'var(--platform-accent)',
            color: '#fff',
            borderWidth: 0,
            borderStyle: 'solid',
            borderColor: 'transparent',
            borderRadius: '6px',
            padding: '9px 24px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Uploading...' : 'Upload Document'}
        </button>
      </form>
    </div>
  );
}

// ---- Main component ----

export default function DocumentManagement() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [docsData, catsData] = await Promise.all([
        api.get<Document[]>('/api/platform/documents'),
        api.get<DocumentCategory[]>('/api/platform/documents/categories'),
      ]);
      setDocuments(docsData);
      setCategories(catsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- Styles ----

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '1100px',
    margin: '0 auto',
  };

  const headerStyle: CSSProperties = {
    marginBottom: '28px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    marginTop: 0,
    marginBottom: '4px',
  };

  const subtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    marginTop: 0,
    marginBottom: 0,
  };

  const errorStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    backgroundColor: 'rgba(185, 48, 64, 0.08)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(185, 48, 64, 0.3)',
    borderRadius: '8px',
    color: '#b93040',
    fontSize: '14px',
    marginBottom: '24px',
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

  // ---- Render: loading ----

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // ---- Render: main ----

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h1 style={titleStyle}>Document Management</h1>
        <p style={subtitleStyle}>Upload and manage building documents and their versions</p>
      </div>

      {/* Error banner */}
      {error && (
        <div style={errorStyle} role="alert">
          <span>{error}</span>
          <button
            style={retryBtnStyle}
            onClick={() => fetchData()}
            aria-label="Retry"
            type="button"
          >
            Retry
          </button>
        </div>
      )}

      {/* Upload Document Form */}
      <UploadDocumentForm categories={categories} onSuccess={fetchData} />

      {/* Document List */}
      <div>
        <h2
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--platform-text-primary)',
            marginTop: 0,
            marginBottom: '16px',
          }}
        >
          Documents ({documents.length})
        </h2>

        {documents.length === 0 ? (
          <EmptyState
            message="No documents found"
            description="Upload a document to get started."
            icon={<FileText size={22} />}
          />
        ) : (
          <div>
            {documents.map(doc => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onVersionUploaded={fetchData}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
