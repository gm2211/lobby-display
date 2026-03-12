/**
 * CreateForumThread — /platform/forum/new
 *
 * Page for creating a new forum thread. MANAGER+ role required.
 *
 * FIELDS:
 * - category (required) - select, fetched from GET /api/platform/forum/categories
 * - title (required) - text input
 * - body (required) - textarea with preview toggle
 *
 * SUBMIT:
 * - POSTs to /api/platform/forum/threads
 * - Navigates to /platform/forum/:id on success
 * - Shows loading spinner while submitting
 * - Shows error banner on API failure
 *
 * CANCEL:
 * - Returns to /platform/forum
 *
 * RELATED FILES:
 * - server/routes/platform/forum.ts - POST /threads endpoint
 * - src/platform/types.ts - ForumCategory, ForumThread types
 * - tests/component/platform/CreateForumThread.test.tsx - tests
 */
import { useState, useEffect, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ForumCategory, ForumThread } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { AlertTriangle } from 'lucide-react';
import '../styles/tokens.css';

// --- Types ---

interface FormData {
  categoryId: string;
  title: string;
  body: string;
}

interface FormErrors {
  categoryId?: string;
  title?: string;
  body?: string;
}

// --- Main component ---

export default function CreateForumThread() {
  const navigate = useNavigate();

  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    categoryId: '',
    title: '',
    body: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  // --- Fetch categories on mount ---

  useEffect(() => {
    setCategoriesLoading(true);
    setCategoriesError(null);
    api
      .get<ForumCategory[]>('/api/platform/forum/categories')
      .then(data => setCategories(data))
      .catch(err => {
        setCategoriesError(err instanceof Error ? err.message : 'Failed to load categories');
      })
      .finally(() => setCategoriesLoading(false));
  }, []);

  // --- Validation ---

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!formData.title.trim()) {
      errs.title = 'Title is required';
    }
    if (!formData.body.trim()) {
      errs.body = 'Body is required';
    }
    if (!formData.categoryId) {
      errs.categoryId = 'Category is required';
    }
    return errs;
  }

  // --- Handlers ---

  function handleChange(field: keyof FormData, value: string) {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
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
      const payload = {
        title: formData.title.trim(),
        body: formData.body.trim(),
        categoryId: parseInt(formData.categoryId, 10),
      };

      const created = await api.post<ForumThread>('/api/platform/forum/threads', payload);
      navigate(`/platform/forum/${created.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create thread');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    navigate('/platform/forum');
  }

  function togglePreview() {
    setPreviewMode(prev => !prev);
  }

  // --- Loading state (categories fetching) ---

  if (categoriesLoading) {
    return (
      <div style={styles.centerWrapper}>
        <LoadingSpinner size="lg" label="Loading categories..." />
      </div>
    );
  }

  // --- Render ---

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>New Thread</h1>
        <p style={styles.subtitle}>Start a new discussion in the community forum</p>
      </div>

      {/* Categories error or submit error */}
      {(categoriesError || submitError) && (
        <div style={styles.errorAlert} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          <span>{categoriesError || submitError}</span>
        </div>
      )}

      {/* Card */}
      <div style={styles.card}>
        <form onSubmit={handleSubmit} noValidate>
          {/* Category select */}
          <div style={styles.fieldGroup}>
            <label htmlFor="thread-category" style={styles.label}>
              Category <span style={styles.required}>*</span>
            </label>
            <select
              id="thread-category"
              style={errors.categoryId ? { ...styles.select, borderColor: '#b93040' } : styles.select}
              value={formData.categoryId}
              onChange={e => handleChange('categoryId', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.categoryId}
            >
              <option value="">Select a category</option>
              {categories.map(cat => (
                <option key={cat.id} value={String(cat.id)}>
                  {cat.name}
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <span style={styles.fieldError} role="alert" data-testid="error-category">
                {errors.categoryId}
              </span>
            )}
          </div>

          {/* Title input */}
          <div style={styles.fieldGroup}>
            <label htmlFor="thread-title" style={styles.label}>
              Title <span style={styles.required}>*</span>
            </label>
            <input
              id="thread-title"
              type="text"
              placeholder="Give your thread a descriptive title"
              style={errors.title ? { ...styles.input, borderColor: '#b93040' } : styles.input}
              value={formData.title}
              onChange={e => handleChange('title', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.title}
            />
            {errors.title && (
              <span style={styles.fieldError} role="alert" data-testid="error-title">
                {errors.title}
              </span>
            )}
          </div>

          {/* Body field with preview toggle */}
          <div style={styles.fieldGroup}>
            <div style={styles.bodyHeader}>
              <label htmlFor="thread-body" style={styles.label}>
                Body <span style={styles.required}>*</span>
              </label>
              <div style={styles.previewToggleRow}>
                {!previewMode ? (
                  <button
                    type="button"
                    style={styles.toggleBtn}
                    onClick={togglePreview}
                    aria-label="Preview"
                  >
                    Preview
                  </button>
                ) : (
                  <button
                    type="button"
                    style={styles.toggleBtn}
                    onClick={togglePreview}
                    aria-label="Edit"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {!previewMode ? (
              <textarea
                id="thread-body"
                placeholder="Write your thread content here. Markdown is supported."
                style={errors.body ? { ...styles.textarea, borderColor: '#b93040' } : styles.textarea}
                value={formData.body}
                onChange={e => handleChange('body', e.target.value)}
                aria-required="true"
                aria-invalid={!!errors.body}
              />
            ) : (
              <div
                style={styles.previewPanel}
                data-testid="preview-panel"
                aria-label="Preview"
              >
                {formData.body ? (
                  <div style={styles.previewContent}>
                    {formData.body.split('\n').map((line, i) => (
                      <p key={i} style={styles.previewParagraph}>
                        {line || <br />}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p style={styles.previewEmpty}>Nothing to preview yet.</p>
                )}
              </div>
            )}

            {errors.body && (
              <span style={styles.fieldError} role="alert" data-testid="error-body">
                {errors.body}
              </span>
            )}
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
              {submitting ? 'Posting...' : 'Post Thread'}
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
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    marginTop: '4px',
  },
  card: {
    backgroundColor: 'var(--platform-bg-card)',
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
  bodyHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewToggleRow: {
    display: 'flex',
    gap: '8px',
  },
  toggleBtn: {
    backgroundColor: 'transparent',
    color: 'var(--platform-accent)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-accent)',
    borderRadius: '4px',
    padding: '3px 12px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
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
    minHeight: '200px',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  previewPanel: {
    width: '100%',
    backgroundColor: 'var(--platform-bg)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '9px 12px',
    minHeight: '200px',
    boxSizing: 'border-box',
  },
  previewContent: {
    fontSize: '14px',
    color: 'var(--platform-text-primary)',
    lineHeight: '1.6',
  },
  previewParagraph: {
    margin: '0 0 8px 0',
    fontSize: '14px',
    color: 'var(--platform-text-primary)',
  },
  previewEmpty: {
    fontSize: '14px',
    color: 'var(--platform-text-muted)',
    fontStyle: 'italic',
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
