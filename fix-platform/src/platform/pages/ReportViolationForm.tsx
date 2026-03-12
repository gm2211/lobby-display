/**
 * ReportViolationForm page - /platform/violations/new
 *
 * Form for MANAGER+ users to report a new violation.
 *
 * FIELDS:
 * - unitNumber (required) - text input
 * - category (required) - dropdown (Noise, Parking, Pet, Property Damage, Other, ...)
 * - description (required) - textarea
 * - severity (required) - color-coded selector (LOW, MEDIUM, HIGH, CRITICAL)
 * - fineAmount (optional) - number input, currency formatted
 * - dueDate (optional) - date picker
 *
 * SUBMIT:
 * - POSTs to /api/platform/violations
 * - Shows success message and navigates to /platform/violations on success
 * - Shows error message on failure
 *
 * RELATED FILES:
 * - server/routes/platform/violations.ts - POST / endpoint
 * - src/platform/types.ts - ViolationSeverity type
 * - tests/component/platform/ReportViolationForm.test.tsx - tests
 */
import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import type { ViolationSeverity } from '../types';
import { AlertTriangle } from 'lucide-react';
import '../styles/tokens.css';

// --- Constants ---

const CATEGORIES = [
  'Noise',
  'Parking',
  'Pet',
  'Cleanliness',
  'Lease',
  'Safety',
  'Property Damage',
  'Unauthorized Occupant',
  'Other',
];

const SEVERITY_CONFIG: Record<ViolationSeverity, { label: string; color: string; bg: string; borderColor: string }> = {
  LOW:      { label: 'Low',      color: '#2d7a47', bg: '#d4edda', borderColor: '#2d7a47' },
  MEDIUM:   { label: 'Medium',   color: '#c9921b', bg: '#fff3cd', borderColor: '#c9921b' },
  HIGH:     { label: 'High',     color: '#c62828', bg: '#f8d7da', borderColor: '#b93040' },
  CRITICAL: { label: 'Critical', color: '#7a1f2b', bg: '#f5c6cb', borderColor: '#7a1f2b' },
};

const SEVERITIES: ViolationSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// --- Types ---

interface FormData {
  unitNumber: string;
  category: string;
  description: string;
  severity: ViolationSeverity | '';
  fineAmount: string;
  dueDate: string;
}

interface FormErrors {
  unitNumber?: string;
  category?: string;
  description?: string;
  severity?: string;
}

// --- Main component ---

export default function ReportViolationForm() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState<FormData>({
    unitNumber: '',
    category: '',
    description: '',
    severity: '',
    fineAmount: '',
    dueDate: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // --- Validation ---

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!formData.unitNumber.trim()) {
      errs.unitNumber = 'Unit number is required';
    }
    if (!formData.category) {
      errs.category = 'Category is required';
    }
    if (!formData.description.trim()) {
      errs.description = 'Description is required';
    }
    if (!formData.severity) {
      errs.severity = 'Severity is required';
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

  function handleSeveritySelect(severity: ViolationSeverity) {
    setFormData(prev => ({ ...prev, severity }));
    if (errors.severity) {
      setErrors(prev => ({ ...prev, severity: undefined }));
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
        unitNumber: formData.unitNumber.trim(),
        category: formData.category,
        description: formData.description.trim(),
        severity: formData.severity,
      };

      if (formData.fineAmount) {
        body.fineAmount = parseFloat(formData.fineAmount);
      }
      if (formData.dueDate) {
        body.dueDate = formData.dueDate;
      }

      await api.post('/api/platform/violations', body);
      navigate('/platform/violations');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit violation report');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    navigate('/platform/violations');
  }

  // --- Styles ---

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '700px',
    margin: '0 auto',
  };

  const headerStyle: CSSProperties = {
    marginBottom: '28px',
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
    borderColor: '#c62828',
  };

  const textareaStyle: CSSProperties = {
    ...inputStyle,
    minHeight: '100px',
    resize: 'vertical',
  };

  const textareaErrorStyle: CSSProperties = {
    ...textareaStyle,
    borderColor: '#c62828',
  };

  const selectStyle: CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  };

  const selectErrorStyle: CSSProperties = {
    ...selectStyle,
    borderColor: '#c62828',
  };

  const fieldErrorStyle: CSSProperties = {
    display: 'block',
    fontSize: '12px',
    color: '#c62828',
    marginTop: '4px',
  };

  const severityGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '10px',
    marginTop: '6px',
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
    backgroundColor: '#fff0f0',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#fbc2c4',
    borderRadius: '8px',
    color: '#c62828',
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

  const cancelBtnStyle: CSSProperties = {
    backgroundColor: 'transparent',
    color: 'var(--platform-text-secondary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border-default)',
    borderRadius: '6px',
    padding: '9px 20px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
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

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Report Violation</h1>
        <p style={subtitleStyle}>Submit a violation report for a unit</p>
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
          {/* Unit Number */}
          <div style={fieldGroupStyle}>
            <label htmlFor="unit-number" style={labelStyle}>
              Unit Number <span style={{ color: '#c62828' }}>*</span>
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

          {/* Category */}
          <div style={fieldGroupStyle}>
            <label htmlFor="category" style={labelStyle}>
              Category <span style={{ color: '#c62828' }}>*</span>
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

          {/* Description */}
          <div style={fieldGroupStyle}>
            <label htmlFor="description" style={labelStyle}>
              Description <span style={{ color: '#c62828' }}>*</span>
            </label>
            <textarea
              id="description"
              placeholder="Describe the violation in detail..."
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

          {/* Severity */}
          <div style={fieldGroupStyle}>
            <span style={labelStyle} id="severity-label">
              Severity <span style={{ color: '#c62828' }}>*</span>
            </span>
            <div style={severityGridStyle} role="group" aria-labelledby="severity-label">
              {SEVERITIES.map(sev => {
                const config = SEVERITY_CONFIG[sev];
                const isSelected = formData.severity === sev;
                const optionStyle: CSSProperties = {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px 8px',
                  borderRadius: '8px',
                  borderWidth: 2,
                  borderStyle: 'solid',
                  borderColor: isSelected ? config.borderColor : 'var(--platform-border-default)',
                  backgroundColor: isSelected ? config.bg : 'var(--platform-bg-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  gap: '6px',
                };
                const dotStyle: CSSProperties = {
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: config.color,
                };
                const labelTextStyle: CSSProperties = {
                  fontSize: '13px',
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? config.color : 'var(--platform-text-secondary)',
                };
                return (
                  <button
                    key={sev}
                    type="button"
                    data-testid={`severity-${sev}`}
                    style={optionStyle}
                    onClick={() => handleSeveritySelect(sev)}
                    aria-pressed={isSelected}
                    aria-label={`Severity: ${config.label}`}
                  >
                    <span style={dotStyle} />
                    <span style={labelTextStyle}>{config.label}</span>
                  </button>
                );
              })}
            </div>
            {errors.severity && (
              <span style={fieldErrorStyle} role="alert" data-testid="error-severity">
                {errors.severity}
              </span>
            )}
          </div>

          {/* Fine Amount + Due Date (optional row) */}
          <div style={rowStyle}>
            <div style={fieldGroupStyle}>
              <label htmlFor="fine-amount" style={optionalLabelStyle}>
                Fine Amount <span style={{ fontSize: '12px', color: 'var(--platform-text-muted)' }}>(optional)</span>
              </label>
              <input
                id="fine-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                style={inputStyle}
                value={formData.fineAmount}
                onChange={e => handleChange('fineAmount', e.target.value)}
                aria-label="Fine amount"
              />
            </div>

            <div style={fieldGroupStyle}>
              <label htmlFor="due-date" style={optionalLabelStyle}>
                Due Date <span style={{ fontSize: '12px', color: 'var(--platform-text-muted)' }}>(optional)</span>
              </label>
              <input
                id="due-date"
                type="date"
                style={inputStyle}
                value={formData.dueDate}
                onChange={e => handleChange('dueDate', e.target.value)}
                aria-label="Due date"
              />
            </div>
          </div>

          {/* Actions */}
          <div style={actionsStyle}>
            <button
              type="button"
              style={cancelBtnStyle}
              onClick={handleCancel}
              aria-label="Cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              style={submitBtnStyle}
              disabled={submitting}
              aria-label={submitting ? 'Submitting...' : 'Submit violation report'}
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
