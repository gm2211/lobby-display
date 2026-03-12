/**
 * ConsentManagement Page — MANAGER+ only
 *
 * Provides a full consent form management interface:
 * - List existing consent forms with title, status, required roles, completion rate
 * - Create new consent form: title, body (textarea), required roles (multi-select), active toggle
 * - Edit existing consent form
 * - View signature completion: total required, total signed, percentage
 * - Export signatures as CSV (client-side download)
 * - Archive/activate consent forms
 * - Loading / error / empty states
 *
 * API:
 * - GET  /api/platform/consent/manage        — list all consent forms with completion data
 * - POST /api/platform/consent/manage        — create new consent form
 * - PUT  /api/platform/consent/manage/:id    — update/archive/activate consent form
 * - GET  /api/platform/consent/manage/:id/signatures — list signatures for export
 *
 * ROLE: MANAGER+ only (enforced by route guard in PlatformRouter)
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import type { ConsentFormItem, ConsentFormStatus, ConsentSignature } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { FileCheck } from 'lucide-react';
import '../styles/tokens.css';

// --- Constants ---

const ALL_ROLES = ['RESIDENT', 'BOARD_MEMBER', 'MANAGER', 'SECURITY', 'CONCIERGE'] as const;

const STATUS_CONFIG: Record<ConsentFormStatus, { label: string; color: string; bg: string }> = {
  DRAFT:    { label: 'Draft',    color: '#c9921b', bg: '#fff3cd' },
  ACTIVE:   { label: 'Active',   color: '#2d7a47', bg: '#d4edda' },
  ARCHIVED: { label: 'Archived', color: '#888',    bg: '#f0f0f0' },
};

// --- Types for form editor state ---

interface FormEditorState {
  id: string | null;
  title: string;
  body: string;
  requiredRoles: string[];
  status: ConsentFormStatus;
}

const EMPTY_EDITOR: FormEditorState = {
  id: null,
  title: '',
  body: '',
  requiredRoles: [],
  status: 'DRAFT',
};

// --- Helper functions ---

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function exportSignaturesToCsv(formTitle: string, signatures: ConsentSignature[]): void {
  const headers = ['ID', 'User ID', 'User Name', 'Signed At'];
  const rows = signatures.map(sig => [
    sig.id,
    sig.userId,
    sig.userName,
    formatDate(sig.signedAt),
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${formTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_signatures.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// --- Sub-components ---

function StatusBadge({ formId, status }: { formId: string; status: ConsentFormStatus }) {
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
    <span style={style} data-testid={`status-badge-${formId}`}>
      {label}
    </span>
  );
}

interface CompletionRateProps {
  formId: string;
  signed: number;
  totalRequired: number;
  rate: number;
}

function CompletionRate({ formId, signed, totalRequired, rate }: CompletionRateProps) {
  const pct = Math.round(rate);
  const barColor = pct >= 80 ? '#2d7a47' : pct >= 50 ? '#c9921b' : '#b93040';

  const wrapStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '120px',
  };
  const labelStyle: CSSProperties = {
    fontSize: '12px',
    color: 'var(--platform-text-secondary)',
  };
  const barContainerStyle: CSSProperties = {
    height: '6px',
    borderRadius: '3px',
    backgroundColor: 'var(--platform-border)',
    overflow: 'hidden',
    width: '100%',
  };
  const barFillStyle: CSSProperties = {
    height: '100%',
    width: `${Math.min(100, pct)}%`,
    backgroundColor: barColor,
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  };

  return (
    <div style={wrapStyle} data-testid={`completion-rate-${formId}`}>
      <span style={labelStyle}>
        {signed} / {totalRequired} — <strong>{pct}%</strong>
      </span>
      <div style={barContainerStyle}>
        <div style={barFillStyle} />
      </div>
    </div>
  );
}

interface RoleChipsProps {
  roles: string[];
}

function RoleChips({ roles }: RoleChipsProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {roles.map(role => (
        <span
          key={role}
          style={{
            display: 'inline-block',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--platform-accent)',
            backgroundColor: 'rgba(26, 58, 110, 0.08)',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: 'var(--platform-border)',
            borderRadius: '4px',
            paddingTop: '2px',
            paddingBottom: '2px',
            paddingLeft: '7px',
            paddingRight: '7px',
          }}
        >
          {role}
        </span>
      ))}
    </div>
  );
}

// --- Form Editor ---

interface FormEditorProps {
  state: FormEditorState;
  onChange: (state: FormEditorState) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}

function FormEditor({ state, onChange, onSave, onCancel, saving, error }: FormEditorProps) {
  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '28px',
    marginBottom: '28px',
  };

  const titleBarStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
  };

  const fieldGroupStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '20px',
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
    minHeight: '140px',
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: '1.5',
  };

  const toggleRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  };

  const checkboxStyle: CSSProperties = {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
    accentColor: 'var(--platform-accent)',
  };

  const btnRowStyle: CSSProperties = {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  };

  const saveBtnStyle: CSSProperties = {
    backgroundColor: 'var(--platform-accent)',
    color: '#fff',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '6px',
    padding: '9px 24px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: saving ? 'not-allowed' : 'pointer',
    opacity: saving ? 0.7 : 1,
  };

  const cancelBtnStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-text-secondary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '9px 20px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  };

  const errorStyle: CSSProperties = {
    fontSize: '13px',
    color: '#b93040',
    padding: '8px 12px',
    backgroundColor: 'rgba(185, 48, 64, 0.06)',
    borderRadius: '6px',
    marginTop: '8px',
  };

  const toggleRole = (role: string) => {
    const newRoles = state.requiredRoles.includes(role)
      ? state.requiredRoles.filter(r => r !== role)
      : [...state.requiredRoles, role];
    onChange({ ...state, requiredRoles: newRoles });
  };

  return (
    <div style={cardStyle} data-testid="consent-form-editor">
      <div style={titleBarStyle}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--platform-text-primary)' }}>
          {state.id ? 'Edit Consent Form' : 'Create New Consent Form'}
        </h2>
      </div>

      {/* Title */}
      <div style={fieldGroupStyle}>
        <label style={labelStyle} htmlFor="consent-form-title">
          Title *
        </label>
        <input
          id="consent-form-title"
          type="text"
          style={inputStyle}
          value={state.title}
          onChange={e => onChange({ ...state, title: e.target.value })}
          placeholder="e.g. Pet Policy Agreement"
          data-testid="form-title-input"
        />
      </div>

      {/* Body */}
      <div style={fieldGroupStyle}>
        <label style={labelStyle} htmlFor="consent-form-body">
          Body *
        </label>
        <textarea
          id="consent-form-body"
          style={textareaStyle}
          value={state.body}
          onChange={e => onChange({ ...state, body: e.target.value })}
          placeholder="Enter the full consent form text here..."
          data-testid="form-body-input"
        />
      </div>

      {/* Required Roles */}
      <div style={fieldGroupStyle} data-testid="form-roles-section">
        <span style={labelStyle}>Required Roles</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '4px' }}>
          {ALL_ROLES.map(role => (
            <label
              key={role}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', color: 'var(--platform-text-primary)' }}
            >
              <input
                type="checkbox"
                style={checkboxStyle}
                checked={state.requiredRoles.includes(role)}
                onChange={() => toggleRole(role)}
                data-testid={`role-checkbox-${role}`}
              />
              {role}
            </label>
          ))}
        </div>
      </div>

      {/* Active toggle */}
      <div style={fieldGroupStyle}>
        <div style={toggleRowStyle}>
          <input
            id="consent-form-active"
            type="checkbox"
            style={checkboxStyle}
            checked={state.status === 'ACTIVE'}
            onChange={e => onChange({ ...state, status: e.target.checked ? 'ACTIVE' : 'DRAFT' })}
            data-testid="form-active-toggle"
          />
          <label htmlFor="consent-form-active" style={{ fontSize: '14px', color: 'var(--platform-text-primary)', cursor: 'pointer' }}>
            Active (visible to residents)
          </label>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={errorStyle} data-testid="form-editor-error" role="alert">
          {error}
        </div>
      )}

      {/* Buttons */}
      <div style={btnRowStyle}>
        <button
          type="button"
          style={cancelBtnStyle}
          onClick={onCancel}
          data-testid="form-cancel-btn"
        >
          Cancel
        </button>
        <button
          type="button"
          style={saveBtnStyle}
          onClick={onSave}
          disabled={saving}
          data-testid="form-save-btn"
        >
          {saving ? 'Saving...' : state.id ? 'Update Form' : 'Create Form'}
        </button>
      </div>
    </div>
  );
}

// --- Consent form card ---

interface ConsentFormCardProps {
  form: ConsentFormItem;
  onEdit: (form: ConsentFormItem) => void;
  onArchive: (form: ConsentFormItem) => void;
  onActivate: (form: ConsentFormItem) => void;
  onExport: (form: ConsentFormItem) => void;
  actionLoading: string | null;
}

function ConsentFormCard({ form, onEdit, onArchive, onActivate, onExport, actionLoading }: ConsentFormCardProps) {
  const signed = form._count?.signatures ?? 0;
  const totalRequired = form.totalRequired ?? 0;
  const completionRate = form.completionRate ?? 0;

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '20px 24px',
    marginBottom: '12px',
  };

  const headerRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '12px',
  };

  const titleStyle: CSSProperties = {
    margin: '0 0 8px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--platform-text-primary)',
  };

  const metaRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '14px',
  };

  const actionRowStyle: CSSProperties = {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    alignItems: 'center',
  };

  const actionBtnStyle = (variant: 'default' | 'danger' | 'success' | 'ghost'): CSSProperties => {
    const variants: Record<string, CSSProperties> = {
      default: {
        backgroundColor: 'transparent',
        color: 'var(--platform-accent)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'var(--platform-accent)',
      },
      danger: {
        backgroundColor: 'transparent',
        color: '#b93040',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: '#b93040',
      },
      success: {
        backgroundColor: 'transparent',
        color: '#2d7a47',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: '#2d7a47',
      },
      ghost: {
        backgroundColor: 'transparent',
        color: 'var(--platform-text-secondary)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'var(--platform-border)',
      },
    };
    return {
      ...variants[variant],
      borderRadius: '5px',
      padding: '5px 12px',
      fontSize: '12px',
      fontWeight: 500,
      cursor: actionLoading ? 'not-allowed' : 'pointer',
      opacity: actionLoading ? 0.7 : 1,
    };
  };

  return (
    <article style={cardStyle} aria-label={form.title}>
      <div style={headerRowStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={titleStyle}>{form.title}</h3>
          <div style={metaRowStyle}>
            <StatusBadge formId={form.id} status={form.status} />
            {form.requiredRoles.length > 0 && (
              <RoleChips roles={form.requiredRoles} />
            )}
            <span style={{ fontSize: '12px', color: 'var(--platform-text-muted)' }}>
              Updated {formatDate(form.updatedAt)}
            </span>
          </div>
        </div>

        <div style={{ flexShrink: 0, minWidth: '160px' }}>
          <CompletionRate
            formId={form.id}
            signed={signed}
            totalRequired={totalRequired}
            rate={completionRate}
          />
        </div>
      </div>

      {/* Actions */}
      <div style={actionRowStyle}>
        <button
          type="button"
          style={actionBtnStyle('default')}
          onClick={() => onEdit(form)}
          data-testid={`edit-form-${form.id}`}
        >
          Edit
        </button>

        <button
          type="button"
          style={actionBtnStyle('ghost')}
          onClick={() => onExport(form)}
          data-testid={`export-csv-${form.id}`}
        >
          Export CSV
        </button>

        {form.status === 'ACTIVE' && (
          <button
            type="button"
            style={actionBtnStyle('danger')}
            onClick={() => onArchive(form)}
            disabled={!!actionLoading}
            data-testid={`archive-btn-${form.id}`}
          >
            {actionLoading === `archive-${form.id}` ? 'Archiving...' : 'Archive'}
          </button>
        )}

        {(form.status === 'ARCHIVED' || form.status === 'DRAFT') && (
          <button
            type="button"
            style={actionBtnStyle('success')}
            onClick={() => onActivate(form)}
            disabled={!!actionLoading}
            data-testid={`activate-btn-${form.id}`}
          >
            {actionLoading === `activate-${form.id}` ? 'Activating...' : 'Activate'}
          </button>
        )}
      </div>
    </article>
  );
}

// --- Main Component ---

export default function ConsentManagement() {
  const [forms, setForms] = useState<ConsentFormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorState, setEditorState] = useState<FormEditorState>(EMPTY_EDITOR);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Per-form action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ConsentFormItem[]>('/api/platform/consent/manage');
      setForms(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load consent forms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Open create form ---
  const handleOpenCreate = () => {
    setEditorState(EMPTY_EDITOR);
    setEditorError(null);
    setEditorOpen(true);
  };

  // --- Open edit form ---
  const handleEdit = (form: ConsentFormItem) => {
    setEditorState({
      id: form.id,
      title: form.title,
      body: form.body,
      requiredRoles: form.requiredRoles,
      status: form.status,
    });
    setEditorError(null);
    setEditorOpen(true);
  };

  // --- Cancel edit ---
  const handleCancel = () => {
    setEditorOpen(false);
    setEditorState(EMPTY_EDITOR);
    setEditorError(null);
  };

  // --- Save (create or update) ---
  const handleSave = async () => {
    if (!editorState.title.trim()) {
      setEditorError('Title is required');
      return;
    }
    if (!editorState.body.trim()) {
      setEditorError('Body is required');
      return;
    }

    setSaving(true);
    setEditorError(null);

    try {
      const payload = {
        title: editorState.title.trim(),
        body: editorState.body.trim(),
        requiredRoles: editorState.requiredRoles,
        status: editorState.status,
      };

      if (editorState.id) {
        await api.put(`/api/platform/consent/manage/${editorState.id}`, payload);
      } else {
        await api.post('/api/platform/consent/manage', payload);
      }

      setEditorOpen(false);
      setEditorState(EMPTY_EDITOR);
      await fetchData();
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Failed to save consent form');
    } finally {
      setSaving(false);
    }
  };

  // --- Archive ---
  const handleArchive = async (form: ConsentFormItem) => {
    setActionLoading(`archive-${form.id}`);
    try {
      await api.put(`/api/platform/consent/manage/${form.id}`, { status: 'ARCHIVED' });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive consent form');
    } finally {
      setActionLoading(null);
    }
  };

  // --- Activate ---
  const handleActivate = async (form: ConsentFormItem) => {
    setActionLoading(`activate-${form.id}`);
    try {
      await api.put(`/api/platform/consent/manage/${form.id}`, { status: 'ACTIVE' });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate consent form');
    } finally {
      setActionLoading(null);
    }
  };

  // --- Export CSV ---
  const handleExport = async (form: ConsentFormItem) => {
    try {
      const signatures = await api.get<ConsentSignature[]>(
        `/api/platform/consent/manage/${form.id}/signatures`
      );
      exportSignaturesToCsv(form.title, signatures);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export signatures');
    }
  };

  // --- Styles ---

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '1100px',
    margin: '0 auto',
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '28px',
    flexWrap: 'wrap',
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

  const createBtnStyle: CSSProperties = {
    backgroundColor: 'var(--platform-accent)',
    color: '#fff',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '6px',
    padding: '9px 20px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  const errorAlertStyle: CSSProperties = {
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
    marginBottom: '20px',
  };

  const retryBtnStyle: CSSProperties = {
    backgroundColor: 'transparent',
    color: '#b93040',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#b93040',
    borderRadius: '5px',
    padding: '4px 12px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    marginLeft: 'auto',
    flexShrink: 0,
  };

  // --- Render states ---

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Consent Management</h1>
          <p style={subtitleStyle}>
            Manage consent forms, track signatures, and export reports
          </p>
        </div>
        {!editorOpen && (
          <button
            type="button"
            style={createBtnStyle}
            onClick={handleOpenCreate}
            data-testid="create-form-btn"
          >
            + Create New Form
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div style={errorAlertStyle} role="alert">
          <span>{error}</span>
          <button
            type="button"
            style={retryBtnStyle}
            onClick={fetchData}
            aria-label="Retry"
          >
            Retry
          </button>
        </div>
      )}

      {/* Form editor (create/edit) */}
      {editorOpen && (
        <FormEditor
          state={editorState}
          onChange={setEditorState}
          onSave={handleSave}
          onCancel={handleCancel}
          saving={saving}
          error={editorError}
        />
      )}

      {/* Consent forms list */}
      {forms.length === 0 ? (
        <EmptyState
          message="No consent forms"
          description="Create your first consent form using the button above."
          icon={<FileCheck size={22} />}
          action={{ label: 'Create New Form', onClick: handleOpenCreate }}
        />
      ) : (
        <div>
          {forms.map(form => (
            <ConsentFormCard
              key={form.id}
              form={form}
              onEdit={handleEdit}
              onArchive={handleArchive}
              onActivate={handleActivate}
              onExport={handleExport}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}
    </div>
  );
}
