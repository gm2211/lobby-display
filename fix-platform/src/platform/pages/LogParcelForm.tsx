/**
 * LogParcelForm Page — /platform/parcels/new
 *
 * Form for CONCIERGE/MANAGER/SECURITY staff to log incoming parcels.
 *
 * FIELDS:
 * - trackingNumber (required) - text input
 * - carrier (required) - select: UPS, FedEx, USPS, Amazon, DHL, Other
 * - unitNumber (required) - text input, recipient's unit
 * - recipientName (required) - text input
 * - description (optional) - textarea
 * - notes (optional) - textarea
 *
 * ROLE-BASED ACCESS:
 * - Only CONCIERGE, MANAGER, SECURITY can access this page
 * - Shows "Access Denied" message for other roles
 *
 * SUBMIT:
 * - POSTs to /api/platform/parcels
 * - Shows success state with parcel details and "Log Another" button
 * - Shows inline error on failure
 *
 * RELATED FILES:
 * - server/routes/platform/parcels.ts       - POST / endpoint
 * - src/platform/types.ts                   - Parcel type
 * - tests/component/platform/LogParcelForm.test.tsx - tests
 */
import { useState, useEffect, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Parcel, PlatformRole } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { AlertTriangle } from 'lucide-react';
import '../styles/tokens.css';

// --- Constants ---

const CARRIERS = ['UPS', 'FedEx', 'USPS', 'Amazon', 'DHL', 'Other'] as const;
type Carrier = (typeof CARRIERS)[number];

const ALLOWED_ROLES: PlatformRole[] = ['CONCIERGE', 'MANAGER', 'SECURITY'];

// --- Types ---

interface FormData {
  trackingNumber: string;
  carrier: Carrier | '';
  unitNumber: string;
  recipientName: string;
  description: string;
  notes: string;
}

interface FormErrors {
  trackingNumber?: string;
  carrier?: string;
  unitNumber?: string;
  recipientName?: string;
}

interface ProfileResponse {
  platformRole: PlatformRole | null;
}

// --- Main component ---

export default function LogParcelForm() {
  const [platformRole, setPlatformRole] = useState<PlatformRole | null | undefined>(undefined);
  const [roleLoading, setRoleLoading] = useState(true);

  const [formData, setFormData] = useState<FormData>({
    trackingNumber: '',
    carrier: '',
    unitNumber: '',
    recipientName: '',
    description: '',
    notes: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successParcel, setSuccessParcel] = useState<Parcel | null>(null);

  // Load platform role on mount
  useEffect(() => {
    api
      .get<ProfileResponse>('/api/platform/profile')
      .then(data => setPlatformRole(data.platformRole ?? null))
      .catch(() => setPlatformRole(null))
      .finally(() => setRoleLoading(false));
  }, []);

  // --- Validation ---

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!formData.trackingNumber.trim()) {
      errs.trackingNumber = 'Tracking number is required';
    }
    if (!formData.carrier) {
      errs.carrier = 'Carrier is required';
    }
    if (!formData.unitNumber.trim()) {
      errs.unitNumber = 'Unit number is required';
    }
    if (!formData.recipientName.trim()) {
      errs.recipientName = 'Recipient name is required';
    }
    return errs;
  }

  // --- Handlers ---

  function handleChange(field: keyof FormData, value: string) {
    setFormData(prev => ({ ...prev, [field]: value }));
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
        trackingNumber: formData.trackingNumber.trim(),
        carrier: formData.carrier,
        unitNumber: formData.unitNumber.trim(),
        recipientName: formData.recipientName.trim(),
      };

      if (formData.description.trim()) {
        body.description = formData.description.trim();
      }
      if (formData.notes.trim()) {
        body.notes = formData.notes.trim();
      }

      const parcel = await api.post<Parcel>('/api/platform/parcels', body);
      setSuccessParcel(parcel);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to log parcel');
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogAnother() {
    setSuccessParcel(null);
    setSubmitError(null);
    setErrors({});
    setFormData({
      trackingNumber: '',
      carrier: '',
      unitNumber: '',
      recipientName: '',
      description: '',
      notes: '',
    });
  }

  // --- Styles ---

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '700px',
    margin: '0 auto',
  };

  const backLinkStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    color: 'var(--platform-accent)',
    textDecoration: 'none',
    marginBottom: '20px',
  };

  const headerStyle: CSSProperties = {
    marginBottom: '28px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    marginBottom: '4px',
    margin: 0,
  };

  const subtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    marginTop: '6px',
    marginBottom: 0,
  };

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
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
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
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
    minHeight: '90px',
    resize: 'vertical',
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
    borderTopColor: 'var(--platform-border)',
  };

  const submitBtnStyle: CSSProperties = {
    backgroundColor: 'var(--platform-accent)',
    color: '#ffffff',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-accent)',
    borderRadius: '6px',
    padding: '9px 24px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: submitting ? 'not-allowed' : 'pointer',
    opacity: submitting ? 0.7 : 1,
  };

  const successCardStyle: CSSProperties = {
    backgroundColor: 'rgba(26, 92, 90, 0.06)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(26, 92, 90, 0.3)',
    borderRadius: '10px',
    padding: '28px',
    textAlign: 'center',
  };

  const successTitleStyle: CSSProperties = {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    marginBottom: '8px',
  };

  const successSubtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    marginBottom: '20px',
  };

  const parcelDetailStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
    textAlign: 'left',
  };

  const detailRowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '8px',
    paddingBottom: '8px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border)',
    fontSize: '14px',
  };

  const detailLabelStyle: CSSProperties = {
    color: 'var(--platform-text-secondary)',
    fontWeight: 500,
  };

  const detailValueStyle: CSSProperties = {
    color: 'var(--platform-text-primary)',
    fontWeight: 600,
    fontFamily: 'monospace',
  };

  const logAnotherBtnStyle: CSSProperties = {
    backgroundColor: 'var(--platform-accent)',
    color: '#ffffff',
    borderWidth: 0,
    borderRadius: '6px',
    padding: '10px 28px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginRight: '12px',
  };

  const accessDeniedStyle: CSSProperties = {
    padding: '48px 24px',
    textAlign: 'center',
  };

  const accessDeniedTitleStyle: CSSProperties = {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    marginBottom: '8px',
  };

  const accessDeniedSubtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
  };

  // --- Render: Loading role ---

  if (roleLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
        <LoadingSpinner size="lg" label="Loading..." />
      </div>
    );
  }

  // --- Render: Access denied ---

  if (platformRole === null || (platformRole !== undefined && !ALLOWED_ROLES.includes(platformRole))) {
    return (
      <div style={pageStyle}>
        <Link to="/platform/parcels" style={backLinkStyle}>
          &larr; Back to Parcels
        </Link>
        <div style={accessDeniedStyle}>
          <h1 style={accessDeniedTitleStyle}>Access Denied</h1>
          <p style={accessDeniedSubtitleStyle}>
            This page is only accessible to Concierge, Manager, or Security staff.
          </p>
        </div>
      </div>
    );
  }

  // --- Render: Success state ---

  if (successParcel) {
    return (
      <div style={pageStyle}>
        <Link to="/platform/parcels" style={backLinkStyle}>
          &larr; Back to Parcels
        </Link>
        <div style={successCardStyle}>
          <div style={successTitleStyle}>Parcel Logged Successfully</div>
          <div style={successSubtitleStyle}>The parcel has been logged and is ready for resident pickup.</div>

          <div style={parcelDetailStyle}>
            <div style={{ ...detailRowStyle, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--platform-border)' }}>
              <span style={detailLabelStyle}>Tracking Number</span>
              <span style={detailValueStyle}>{successParcel.trackingNumber}</span>
            </div>
            <div style={detailRowStyle}>
              <span style={detailLabelStyle}>Carrier</span>
              <span style={{ ...detailValueStyle, fontFamily: 'inherit' }}>{successParcel.carrier}</span>
            </div>
            <div style={detailRowStyle}>
              <span style={detailLabelStyle}>Unit</span>
              <span style={detailValueStyle}>{successParcel.unitNumber}</span>
            </div>
            <div style={{ ...detailRowStyle, borderBottomWidth: 0 }}>
              <span style={detailLabelStyle}>Recipient</span>
              <span style={{ ...detailValueStyle, fontFamily: 'inherit' }}>{successParcel.recipientName}</span>
            </div>
          </div>

          <button
            type="button"
            style={logAnotherBtnStyle}
            onClick={handleLogAnother}
            aria-label="Log another parcel"
          >
            Log Another
          </button>
          <Link to="/platform/parcels" style={{ fontSize: '14px', color: 'var(--platform-accent)' }}>
            View All Parcels
          </Link>
        </div>
      </div>
    );
  }

  // --- Render: Form ---

  return (
    <div style={pageStyle}>
      <Link to="/platform/parcels" style={backLinkStyle}>
        &larr; Back to Parcels
      </Link>

      <div style={headerStyle}>
        <h1 style={titleStyle}>Log Parcel</h1>
        <p style={subtitleStyle}>Record an incoming package for a resident</p>
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
          {/* Tracking Number */}
          <div style={fieldGroupStyle}>
            <label htmlFor="tracking-number" style={labelStyle}>
              Tracking Number <span style={{ color: '#b93040' }}>*</span>
            </label>
            <input
              id="tracking-number"
              type="text"
              placeholder="e.g. 1Z999AA10123456784"
              style={errors.trackingNumber ? inputErrorStyle : inputStyle}
              value={formData.trackingNumber}
              onChange={e => handleChange('trackingNumber', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.trackingNumber}
              aria-label="Tracking number"
            />
            {errors.trackingNumber && (
              <span style={fieldErrorStyle} role="alert" data-testid="error-trackingNumber">
                {errors.trackingNumber}
              </span>
            )}
          </div>

          {/* Carrier */}
          <div style={fieldGroupStyle}>
            <label htmlFor="carrier" style={labelStyle}>
              Carrier <span style={{ color: '#b93040' }}>*</span>
            </label>
            <select
              id="carrier"
              style={errors.carrier ? selectErrorStyle : selectStyle}
              value={formData.carrier}
              onChange={e => handleChange('carrier', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.carrier}
              aria-label="Carrier"
            >
              <option value="">Select a carrier</option>
              {CARRIERS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {errors.carrier && (
              <span style={fieldErrorStyle} role="alert" data-testid="error-carrier">
                {errors.carrier}
              </span>
            )}
          </div>

          {/* Unit Number */}
          <div style={fieldGroupStyle}>
            <label htmlFor="unit-number" style={labelStyle}>
              Recipient Unit Number <span style={{ color: '#b93040' }}>*</span>
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
              aria-label="Unit number"
            />
            {errors.unitNumber && (
              <span style={fieldErrorStyle} role="alert" data-testid="error-unitNumber">
                {errors.unitNumber}
              </span>
            )}
          </div>

          {/* Recipient Name */}
          <div style={fieldGroupStyle}>
            <label htmlFor="recipient-name" style={labelStyle}>
              Recipient Name <span style={{ color: '#b93040' }}>*</span>
            </label>
            <input
              id="recipient-name"
              type="text"
              placeholder="e.g. Jane Smith"
              style={errors.recipientName ? inputErrorStyle : inputStyle}
              value={formData.recipientName}
              onChange={e => handleChange('recipientName', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.recipientName}
              aria-label="Recipient name"
            />
            {errors.recipientName && (
              <span style={fieldErrorStyle} role="alert" data-testid="error-recipientName">
                {errors.recipientName}
              </span>
            )}
          </div>

          {/* Description (optional) */}
          <div style={fieldGroupStyle}>
            <label htmlFor="description" style={optionalLabelStyle}>
              Description{' '}
              <span style={{ fontSize: '12px', color: 'var(--platform-text-secondary)' }}>(optional)</span>
            </label>
            <textarea
              id="description"
              placeholder="e.g. Medium brown box, fragile"
              style={textareaStyle}
              value={formData.description}
              onChange={e => handleChange('description', e.target.value)}
              aria-label="Description"
            />
          </div>

          {/* Notes (optional) */}
          <div style={fieldGroupStyle}>
            <label htmlFor="notes" style={optionalLabelStyle}>
              Notes{' '}
              <span style={{ fontSize: '12px', color: 'var(--platform-text-secondary)' }}>(optional)</span>
            </label>
            <textarea
              id="notes"
              placeholder="e.g. Left at front desk, requires ID"
              style={textareaStyle}
              value={formData.notes}
              onChange={e => handleChange('notes', e.target.value)}
              aria-label="Notes"
            />
          </div>

          {/* Actions */}
          <div style={actionsStyle}>
            <button
              type="submit"
              style={submitBtnStyle}
              disabled={submitting}
              aria-label={submitting ? 'Logging parcel...' : 'Log parcel'}
            >
              {submitting ? 'Logging...' : 'Log Parcel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
