/**
 * AnnouncementForm page — MANAGER+ only
 *
 * Handles both create and edit modes for announcements:
 * - Create: /platform/announcements/new  — POST to /api/platform/announcements
 * - Edit:   /platform/announcements/:id/edit — GET to populate, PUT to save
 *
 * FIELDS:
 * - title (required) - text input
 * - body (required) - textarea
 * - category (required) - select: General, Safety, Maintenance, Community, Emergency
 * - priority (required) - select: LOW, NORMAL, HIGH, URGENT
 * - pinned (optional) - checkbox
 * - active (default true) - checkbox
 *
 * SUCCESS:
 * - Navigates to /platform/announcements/:id after save
 *
 * CANCEL:
 * - Navigates to /platform/announcements
 *
 * RELATED FILES:
 * - server/routes/platform/announcements.ts - POST / and PUT /:id endpoints
 * - src/platform/types.ts - Announcement and Priority types
 * - tests/component/platform/AnnouncementForm.test.tsx - tests
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import type { Announcement, Priority } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { AlertTriangle } from 'lucide-react';
import '../styles/tokens.css';

// --- Constants ---

const CATEGORIES = ['General', 'Safety', 'Maintenance', 'Community', 'Emergency'];

const PRIORITIES: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

// --- Types ---

interface FormData {
  title: string;
  body: string;
  category: string;
  priority: Priority | '';
  pinned: boolean;
  active: boolean;
}

interface FormErrors {
  title?: string;
  body?: string;
  category?: string;
  priority?: string;
}

// --- Main component ---

export default function AnnouncementForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const isEditMode = Boolean(id);

  const [formData, setFormData] = useState<FormData>({
    title: '',
    body: '',
    category: '',
    priority: '',
    pinned: false,
    active: true,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditMode);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // --- Fetch existing announcement (edit mode) ---

  const fetchAnnouncement = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setFetchError(null);
      const data = await api.get<Announcement>(`/api/platform/announcements/${id}`);
      setFormData({
        title: data.title,
        body: data.body,
        category: data.category,
        priority: data.priority,
        pinned: data.pinned,
        active: data.active,
      });
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load announcement');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isEditMode) {
      fetchAnnouncement();
    }
  }, [isEditMode, fetchAnnouncement]);

  // --- Validation ---

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!formData.title.trim()) {
      errs.title = 'Title is required';
    }
    if (!formData.body.trim()) {
      errs.body = 'Body is required';
    }
    if (!formData.category) {
      errs.category = 'Category is required';
    }
    if (!formData.priority) {
      errs.priority = 'Priority is required';
    }
    return errs;
  }

  // --- Handlers ---

  function handleTextChange(field: 'title' | 'body', value: string) {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }

  function handleSelectChange(field: 'category' | 'priority', value: string) {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }

  function handleCheckboxChange(field: 'pinned' | 'active', checked: boolean) {
    setFormData(prev => ({ ...prev, [field]: checked }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const body = {
        title: formData.title.trim(),
        body: formData.body.trim(),
        category: formData.category,
        priority: formData.priority as Priority,
        pinned: formData.pinned,
        active: formData.active,
      };

      if (isEditMode && id) {
        await api.put(`/api/platform/announcements/${id}`, body);
        navigate(`/platform/announcements/${id}`);
      } else {
        const created = await api.post<Announcement>('/api/platform/announcements', body);
        navigate(`/platform/announcements/${created.id}`);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save announcement');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    navigate('/platform/announcements');
  }

  // --- Loading state (edit mode) ---

  if (loading) {
    return (
      <div style={styles.centerWrapper}>
        <LoadingSpinner size="lg" label="Loading announcement..." />
      </div>
    );
  }

  // --- Error state (fetch failed in edit mode) ---

  if (fetchError) {
    return (
      <div style={styles.page}>
        <div style={styles.errorAlert} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          <span>{fetchError}</span>
        </div>
        <button style={styles.cancelBtn} onClick={handleCancel} type="button">
          Back to announcements
        </button>
      </div>
    );
  }

  // --- Render form ---

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>
          {isEditMode ? 'Edit Announcement' : 'New Announcement'}
        </h1>
        <p style={styles.subtitle}>
          {isEditMode
            ? 'Update the announcement details below'
            : 'Fill in the details to post a new announcement'}
        </p>
      </div>

      {/* Card */}
      <div style={styles.card}>
        {/* Submit error banner */}
        {submitError && (
          <div style={styles.errorAlert} role="alert">
            <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
            <span>{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Title */}
          <div style={styles.fieldGroup}>
            <label htmlFor="announcement-title" style={styles.label}>
              Title <span style={styles.required}>*</span>
            </label>
            <input
              id="announcement-title"
              type="text"
              placeholder="e.g. Building maintenance scheduled"
              style={errors.title ? { ...styles.input, borderColor: '#b93040' } : styles.input}
              value={formData.title}
              onChange={e => handleTextChange('title', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.title}
            />
            {errors.title && (
              <span style={styles.fieldError} role="alert" data-testid="error-title">
                {errors.title}
              </span>
            )}
          </div>

          {/* Body */}
          <div style={styles.fieldGroup}>
            <label htmlFor="announcement-body" style={styles.label}>
              Body <span style={styles.required}>*</span>
            </label>
            <textarea
              id="announcement-body"
              placeholder="Write the announcement content here..."
              style={errors.body
                ? { ...styles.textarea, borderColor: '#b93040' }
                : styles.textarea}
              value={formData.body}
              onChange={e => handleTextChange('body', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.body}
            />
            {errors.body && (
              <span style={styles.fieldError} role="alert" data-testid="error-body">
                {errors.body}
              </span>
            )}
          </div>

          {/* Category + Priority row */}
          <div style={styles.row}>
            {/* Category */}
            <div style={styles.fieldGroupFlex}>
              <label htmlFor="announcement-category" style={styles.label}>
                Category <span style={styles.required}>*</span>
              </label>
              <select
                id="announcement-category"
                style={errors.category
                  ? { ...styles.select, borderColor: '#b93040' }
                  : styles.select}
                value={formData.category}
                onChange={e => handleSelectChange('category', e.target.value)}
                aria-required="true"
                aria-invalid={!!errors.category}
              >
                <option value="">Select a category</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {errors.category && (
                <span style={styles.fieldError} role="alert" data-testid="error-category">
                  {errors.category}
                </span>
              )}
            </div>

            {/* Priority */}
            <div style={styles.fieldGroupFlex}>
              <label htmlFor="announcement-priority" style={styles.label}>
                Priority <span style={styles.required}>*</span>
              </label>
              <select
                id="announcement-priority"
                style={errors.priority
                  ? { ...styles.select, borderColor: '#b93040' }
                  : styles.select}
                value={formData.priority}
                onChange={e => handleSelectChange('priority', e.target.value)}
                aria-required="true"
                aria-invalid={!!errors.priority}
              >
                <option value="">Select a priority</option>
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
              {errors.priority && (
                <span style={styles.fieldError} role="alert" data-testid="error-priority">
                  {errors.priority}
                </span>
              )}
            </div>
          </div>

          {/* Checkboxes row */}
          <div style={styles.checkboxRow}>
            {/* Pinned */}
            <label style={styles.checkboxLabel}>
              <input
                id="announcement-pinned"
                type="checkbox"
                style={styles.checkbox}
                checked={formData.pinned}
                onChange={e => handleCheckboxChange('pinned', e.target.checked)}
                aria-label="Pinned"
              />
              <span>Pinned</span>
            </label>

            {/* Active */}
            <label style={styles.checkboxLabel}>
              <input
                id="announcement-active"
                type="checkbox"
                style={styles.checkbox}
                checked={formData.active}
                onChange={e => handleCheckboxChange('active', e.target.checked)}
                aria-label="Active"
              />
              <span>Active</span>
            </label>
          </div>

          {/* Actions */}
          <div style={styles.actions}>
            <button
              type="button"
              style={styles.cancelBtn}
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                ...styles.submitBtn,
                opacity: submitting ? 0.7 : 1,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
              disabled={submitting}
            >
              {submitting
                ? (isEditMode ? 'Saving...' : 'Creating...')
                : (isEditMode ? 'Save Changes' : 'Create Announcement')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Styles ---

const styles: Record<string, CSSProperties> = {
  page: {
    padding: '24px',
    maxWidth: '760px',
    margin: '0 auto',
  },
  centerWrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '80px',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '28px',
  },
  errorAlert: {
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
  },
  fieldGroup: {
    marginBottom: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  fieldGroupFlex: {
    flex: '1 1 200px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--platform-text-primary)',
  },
  required: {
    color: '#b93040',
  },
  input: {
    width: '100%',
    backgroundColor: 'var(--platform-bg)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '9px 12px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    backgroundColor: 'var(--platform-bg)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '9px 12px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    minHeight: '140px',
    resize: 'vertical',
  },
  select: {
    width: '100%',
    backgroundColor: 'var(--platform-bg)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '9px 12px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },
  fieldError: {
    fontSize: '12px',
    color: '#b93040',
  },
  row: {
    display: 'flex',
    gap: '16px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  checkboxRow: {
    display: 'flex',
    gap: '24px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--platform-text-primary)',
    cursor: 'pointer',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    paddingTop: '20px',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--platform-border)',
  },
  cancelBtn: {
    backgroundColor: 'transparent',
    color: 'var(--platform-text-secondary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '9px 20px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  submitBtn: {
    backgroundColor: 'var(--platform-accent)',
    color: '#ffffff',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '6px',
    padding: '9px 24px',
    fontSize: '14px',
    fontWeight: 600,
  },
};
