/**
 * SubmitMaintenanceForm page - /platform/maintenance/new
 *
 * Form for residents and managers to submit a new maintenance request.
 *
 * FIELDS:
 * - title (required) - text input
 * - description (required) - textarea
 * - category (required) - dropdown (Plumbing, Electrical, HVAC, Appliance, Structural, Pest Control, Other)
 * - priority (required) - dropdown (LOW, MEDIUM, HIGH, URGENT)
 * - unitNumber (required) - text input, pre-filled from user context if available
 * - location (optional) - text input, specific room/area
 *
 * SUBMIT:
 * - POSTs to /api/platform/maintenance
 * - Shows success message with request number after submission
 * - "Submit Another" button resets form
 * - Back link to /platform/maintenance
 * - Form validation: required fields
 * - Loading state during submission
 * - Error handling with inline error messages
 *
 * RELATED FILES:
 * - server/routes/platform/maintenance.ts - POST / endpoint
 * - src/platform/types.ts - MaintenancePriority type
 * - tests/component/platform/SubmitMaintenanceForm.test.tsx - tests
 */
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../utils/api';
import type { MaintenancePriority } from '../types';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import '../styles/tokens.css';

// --- Constants ---

const CATEGORIES = [
  'Plumbing',
  'Electrical',
  'HVAC',
  'Appliance',
  'Structural',
  'Pest Control',
  'Other',
];

const PRIORITIES: MaintenancePriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const PRIORITY_LABELS: Record<MaintenancePriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

// --- Types ---

interface FormData {
  title: string;
  description: string;
  category: string;
  priority: MaintenancePriority | '';
  unitNumber: string;
  location: string;
}

interface FormErrors {
  title?: string;
  description?: string;
  category?: string;
  priority?: string;
  unitNumber?: string;
}

interface SubmittedRequest {
  id: number;
  title: string;
}

const INITIAL_FORM: FormData = {
  title: '',
  description: '',
  category: '',
  priority: '',
  unitNumber: '',
  location: '',
};

// --- Main component ---

export default function SubmitMaintenanceForm() {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedRequest | null>(null);

  // --- Validation ---

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!formData.title.trim()) {
      errs.title = 'Title is required';
    }
    if (!formData.description.trim()) {
      errs.description = 'Description is required';
    }
    if (!formData.category) {
      errs.category = 'Category is required';
    }
    if (!formData.priority) {
      errs.priority = 'Priority is required';
    }
    if (!formData.unitNumber.trim()) {
      errs.unitNumber = 'Unit number is required';
    }
    return errs;
  }

  // --- Handlers ---

  function handleChange(field: keyof FormData, value: string) {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (errors[field as keyof FormErrors]) {
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
      const body: Record<string, unknown> = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        priority: formData.priority,
        unitNumber: formData.unitNumber.trim(),
      };

      if (formData.location.trim()) {
        body.location = formData.location.trim();
      }

      const result = await api.post<{ id: number; title: string }>('/api/platform/maintenance', body);
      setSubmitted({ id: result.id, title: result.title });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit maintenance request');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmitAnother() {
    setFormData(INITIAL_FORM);
    setErrors({});
    setSubmitError(null);
    setSubmitted(null);
  }

  // --- Styles ---

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '700px',
    margin: '0 auto',
  };

  const headerStyle: CSSProperties = {
    marginBottom: '8px',
  };

  const backLinkStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    textDecoration: 'none',
    marginBottom: '16px',
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
    marginBottom: '28px',
  };

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-bg-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border-default)',
    borderRadius: '10px',
    padding: '28px',
  };

  const fieldGroupStyle: CSSProperties = {
    marginBottom: '20px',
  };

  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--platform-text-primary)',
    marginBottom: '6px',
  };

  const optionalLabelStyle: CSSProperties = {
    ...labelStyle,
    fontWeight: 400,
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    backgroundColor: 'var(--platform-bg-surface)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border-default)',
    borderRadius: '6px',
    padding: '9px 12px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const inputErrorStyle: CSSProperties = {
    ...inputStyle,
    borderColor: '#b93040',
  };

  const textareaStyle: CSSProperties = {
    ...inputStyle,
    minHeight: '100px',
    resize: 'vertical',
  };

  const textareaErrorStyle: CSSProperties = {
    ...textareaStyle,
    borderColor: '#b93040',
  };

  const selectStyle: CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  };

  const selectErrorStyle: CSSProperties = {
    ...selectStyle,
    borderColor: '#b93040',
  };

  const fieldErrorStyle: CSSProperties = {
    display: 'block',
    fontSize: '12px',
    color: '#b93040',
    marginTop: '4px',
  };

  const rowStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  };

  const errorBannerStyle: CSSProperties = {
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

  const actionsStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '28px',
    paddingTop: '20px',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--platform-border-subtle)',
  };

  const submitBtnStyle: CSSProperties = {
    backgroundColor: 'var(--platform-accent-primary)',
    color: '#ffffff',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-accent-primary)',
    borderRadius: '6px',
    padding: '9px 24px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: submitting ? 'not-allowed' : 'pointer',
    opacity: submitting ? 0.7 : 1,
  };

  // --- Success view ---

  if (submitted) {
    const successCardStyle: CSSProperties = {
      backgroundColor: 'var(--platform-bg-surface)',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: 'var(--platform-border-default)',
      borderRadius: '10px',
      padding: '40px 28px',
      textAlign: 'center',
    };

    const successIconStyle: CSSProperties = {
      fontSize: '48px',
      marginBottom: '16px',
    };

    const successTitleStyle: CSSProperties = {
      fontSize: '20px',
      fontWeight: 700,
      color: 'var(--platform-text-primary)',
      marginBottom: '8px',
    };

    const successDescStyle: CSSProperties = {
      fontSize: '14px',
      color: 'var(--platform-text-secondary)',
      marginBottom: '4px',
    };

    const requestNumberStyle: CSSProperties = {
      fontSize: '14px',
      color: 'var(--platform-text-secondary)',
      marginBottom: '28px',
    };

    const successActionsStyle: CSSProperties = {
      display: 'flex',
      justifyContent: 'center',
      gap: '12px',
      flexWrap: 'wrap',
    };

    const submitAnotherBtnStyle: CSSProperties = {
      backgroundColor: 'var(--platform-accent-primary)',
      color: '#ffffff',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: 'var(--platform-accent-primary)',
      borderRadius: '6px',
      padding: '9px 24px',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
    };

    return (
      <div style={pageStyle}>
        <Link to="/platform/maintenance" style={backLinkStyle} aria-label="Back to Maintenance">
          &larr; Back to Maintenance
        </Link>
        <div style={successCardStyle}>
          <div style={successIconStyle}><CheckCircle size={40} color="#2d7a47" /></div>
          <h2 style={successTitleStyle}>Request Submitted Successfully</h2>
          <p style={successDescStyle}>{submitted.title}</p>
          <p style={requestNumberStyle}>Request #{submitted.id}</p>
          <div style={successActionsStyle}>
            <button
              type="button"
              style={submitAnotherBtnStyle}
              onClick={handleSubmitAnother}
            >
              Submit Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Form view ---

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <Link to="/platform/maintenance" style={backLinkStyle} aria-label="Back to Maintenance">
          &larr; Back to Maintenance
        </Link>
        <h1 style={titleStyle}>Submit Maintenance Request</h1>
        <p style={subtitleStyle}>Report an issue or request maintenance for your unit</p>
      </div>

      <div style={cardStyle}>
        {/* Error banner */}
        {submitError && (
          <div style={errorBannerStyle} role="alert">
            <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
            <span>{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Title */}
          <div style={fieldGroupStyle}>
            <label htmlFor="title" style={labelStyle}>
              Title <span style={{ color: '#b93040' }}>*</span>
            </label>
            <input
              id="title"
              type="text"
              placeholder="e.g. Leaky faucet in bathroom"
              style={errors.title ? inputErrorStyle : inputStyle}
              value={formData.title}
              onChange={e => handleChange('title', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.title}
            />
            {errors.title && (
              <span style={fieldErrorStyle} role="alert" data-testid="error-title">
                {errors.title}
              </span>
            )}
          </div>

          {/* Description */}
          <div style={fieldGroupStyle}>
            <label htmlFor="description" style={labelStyle}>
              Description <span style={{ color: '#b93040' }}>*</span>
            </label>
            <textarea
              id="description"
              placeholder="Describe the issue in detail..."
              style={errors.description ? textareaErrorStyle : textareaStyle}
              value={formData.description}
              onChange={e => handleChange('description', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.description}
            />
            {errors.description && (
              <span style={fieldErrorStyle} role="alert" data-testid="error-description">
                {errors.description}
              </span>
            )}
          </div>

          {/* Category + Priority row */}
          <div style={rowStyle}>
            <div style={fieldGroupStyle}>
              <label htmlFor="category" style={labelStyle}>
                Category <span style={{ color: '#b93040' }}>*</span>
              </label>
              <select
                id="category"
                style={errors.category ? selectErrorStyle : selectStyle}
                value={formData.category}
                onChange={e => handleChange('category', e.target.value)}
                aria-required="true"
                aria-invalid={!!errors.category}
              >
                <option value="">Select a category</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {errors.category && (
                <span style={fieldErrorStyle} role="alert" data-testid="error-category">
                  {errors.category}
                </span>
              )}
            </div>

            <div style={fieldGroupStyle}>
              <label htmlFor="priority" style={labelStyle}>
                Priority <span style={{ color: '#b93040' }}>*</span>
              </label>
              <select
                id="priority"
                style={errors.priority ? selectErrorStyle : selectStyle}
                value={formData.priority}
                onChange={e => handleChange('priority', e.target.value as MaintenancePriority)}
                aria-required="true"
                aria-invalid={!!errors.priority}
              >
                <option value="">Select a priority</option>
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
              {errors.priority && (
                <span style={fieldErrorStyle} role="alert" data-testid="error-priority">
                  {errors.priority}
                </span>
              )}
            </div>
          </div>

          {/* Unit Number + Location row */}
          <div style={rowStyle}>
            <div style={fieldGroupStyle}>
              <label htmlFor="unit-number" style={labelStyle}>
                Unit Number <span style={{ color: '#b93040' }}>*</span>
              </label>
              <input
                id="unit-number"
                type="text"
                placeholder="e.g. 4B"
                style={errors.unitNumber ? inputErrorStyle : inputStyle}
                value={formData.unitNumber}
                onChange={e => handleChange('unitNumber', e.target.value)}
                aria-required="true"
                aria-invalid={!!errors.unitNumber}
              />
              {errors.unitNumber && (
                <span style={fieldErrorStyle} role="alert" data-testid="error-unitNumber">
                  {errors.unitNumber}
                </span>
              )}
            </div>

            <div style={fieldGroupStyle}>
              <label htmlFor="location" style={optionalLabelStyle}>
                Location{' '}
                <span style={{ fontSize: '12px', color: 'var(--platform-text-muted)' }}>(optional)</span>
              </label>
              <input
                id="location"
                type="text"
                placeholder="e.g. Kitchen, Master bathroom"
                style={inputStyle}
                value={formData.location}
                onChange={e => handleChange('location', e.target.value)}
                aria-label="Location"
              />
            </div>
          </div>

          {/* Actions */}
          <div style={actionsStyle}>
            <button
              type="submit"
              style={submitBtnStyle}
              disabled={submitting}
              aria-label={submitting ? 'Submitting...' : 'Submit maintenance request'}
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
