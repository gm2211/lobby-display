/**
 * MarketplaceForm page — create and edit marketplace listings
 *
 * Routes:
 *   /platform/marketplace/new        — create mode (POST to /api/platform/marketplace)
 *   /platform/marketplace/:id/edit   — edit mode (GET then PUT /api/platform/marketplace/:id)
 *
 * Form fields:
 *   - Title (required, text)
 *   - Description (required, textarea)
 *   - Category (required, select: For Sale, Wanted, Free, Services)
 *   - Price (optional, number — hidden for "Wanted" and "Free" categories)
 *   - Contact method (required, select: Message, Email, Phone)
 *   - Contact info (required, text — email/phone based on method)
 *   - Active (checkbox, default true)
 *
 * On success → navigate to /platform/marketplace/:id
 * On cancel  → navigate to /platform/marketplace
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import type { MarketplaceListing, ListingCategory, ContactMethod } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { AlertTriangle } from 'lucide-react';
import '../styles/tokens.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormState {
  title: string;
  description: string;
  category: ListingCategory;
  price: string;
  contactMethod: ContactMethod;
  contactInfo: string;
  active: boolean;
}

interface FormErrors {
  title?: string;
  description?: string;
  category?: string;
  contactMethod?: string;
  contactInfo?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: Array<{ value: ListingCategory; label: string }> = [
  { value: 'FOR_SALE', label: 'For Sale' },
  { value: 'WANTED', label: 'Wanted' },
  { value: 'FREE', label: 'Free' },
  { value: 'SERVICES', label: 'Services' },
];

const CONTACT_METHOD_OPTIONS: Array<{ value: ContactMethod; label: string }> = [
  { value: 'MESSAGE', label: 'Message' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Phone' },
];

/** Categories that hide the price field */
const HIDE_PRICE_CATEGORIES: Set<ListingCategory> = new Set(['WANTED', 'FREE']);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MarketplaceForm() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  // Determine mode: if we have an id param and we're on the edit route, it's edit mode
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    category: 'FOR_SALE',
    price: '',
    contactMethod: 'MESSAGE',
    contactInfo: '',
    active: true,
  });

  // Load listing data in edit mode
  const loadListing = useCallback(async () => {
    if (!isEdit || !id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.get<MarketplaceListing>(`/api/platform/marketplace/${id}`);
      setForm({
        title: data.title ?? '',
        description: data.description ?? '',
        category: (data.category as ListingCategory) ?? 'FOR_SALE',
        price: data.price != null ? String(data.price) : '',
        contactMethod: (data.contactMethod as ContactMethod) ?? 'MESSAGE',
        contactInfo: data.contactInfo ?? '',
        active: data.active ?? true,
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load listing');
    } finally {
      setLoading(false);
    }
  }, [id, isEdit]);

  useEffect(() => {
    loadListing();
  }, [loadListing]);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validate(): FormErrors {
    const errors: FormErrors = {};
    if (!form.title.trim()) {
      errors.title = 'Title is required';
    }
    if (!form.description.trim()) {
      errors.description = 'Description is required';
    }
    if (!form.category) {
      errors.category = 'Category is required';
    }
    if (!form.contactMethod) {
      errors.contactMethod = 'Contact method is required';
    }
    if (!form.contactInfo.trim()) {
      errors.contactInfo = 'Contact info is required';
    }
    return errors;
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const hidePrice = HIDE_PRICE_CATEGORIES.has(form.category);
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        price: !hidePrice && form.price ? parseFloat(form.price) : null,
        contactMethod: form.contactMethod,
        contactInfo: form.contactInfo.trim(),
        active: form.active,
      };

      let result: MarketplaceListing;
      if (isEdit && id) {
        result = await api.put<MarketplaceListing>(`/api/platform/marketplace/${id}`, payload);
      } else {
        result = await api.post<MarketplaceListing>('/api/platform/marketplace', payload);
      }

      navigate(`/platform/marketplace/${result.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save listing');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate('/platform/marketplace');
  };

  // ---------------------------------------------------------------------------
  // Field change helpers
  // ---------------------------------------------------------------------------

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    // Clear field error on change
    if (key in fieldErrors) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[key as keyof FormErrors];
        return next;
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const showPrice = !HIDE_PRICE_CATEGORIES.has(form.category);

  const contactInfoPlaceholder =
    form.contactMethod === 'EMAIL'
      ? 'your@email.com'
      : form.contactMethod === 'PHONE'
      ? 'e.g. +1 555 123 4567'
      : 'Your name or profile link';

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '720px',
    margin: '0 auto',
  };

  const headingStyle: CSSProperties = {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: '0 0 24px',
  };

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '12px',
    padding: '28px 32px',
  };

  const fieldGroupStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '18px',
  };

  const labelStyle: CSSProperties = {
    fontSize: '13px',
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
    padding: '9px 12px',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  const inputErrorStyle: CSSProperties = {
    ...inputStyle,
    borderColor: '#ef4444',
  };

  const textareaStyle: CSSProperties = {
    ...inputStyle,
    resize: 'vertical',
    minHeight: '80px',
  };

  const textareaErrorStyle: CSSProperties = {
    ...textareaStyle,
    borderColor: '#ef4444',
  };

  const selectStyle: CSSProperties = {
    ...inputStyle,
    appearance: 'none',
    cursor: 'pointer',
  };

  const selectErrorStyle: CSSProperties = {
    ...selectStyle,
    borderColor: '#ef4444',
  };

  const fieldErrorStyle: CSSProperties = {
    fontSize: '12px',
    color: '#ef4444',
    marginTop: '2px',
  };

  const checkboxRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '18px',
  };

  const checkboxLabelStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-primary)',
    cursor: 'pointer',
    userSelect: 'none',
  };

  const actionsStyle: CSSProperties = {
    display: 'flex',
    gap: '12px',
    marginTop: '28px',
    justifyContent: 'flex-end',
  };

  const submitBtnStyle: CSSProperties = {
    backgroundColor: 'var(--platform-accent)',
    color: '#fff',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '8px',
    padding: '10px 28px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: submitting ? 'not-allowed' : 'pointer',
    opacity: submitting ? 0.7 : 1,
    fontFamily: 'inherit',
  };

  const cancelBtnStyle: CSSProperties = {
    backgroundColor: 'transparent',
    color: 'var(--platform-text-secondary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '8px',
    padding: '10px 24px',
    fontSize: '15px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const errorAlertStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '14px 16px',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#ef4444',
    fontSize: '14px',
    marginTop: '20px',
  };

  // ---------------------------------------------------------------------------
  // Loading (edit mode fetch)
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
        <LoadingSpinner size="lg" label="Loading listing..." />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Load error
  // ---------------------------------------------------------------------------

  if (loadError) {
    return (
      <div style={pageStyle}>
        <div style={errorAlertStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          <span>{loadError}</span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render form
  // ---------------------------------------------------------------------------

  return (
    <div style={pageStyle}>
      <h1 style={headingStyle}>
        {isEdit ? 'Edit Listing' : 'Create Listing'}
      </h1>

      <div style={cardStyle}>
        <form onSubmit={handleSubmit} noValidate data-testid="marketplace-form">
          {/* Title */}
          <div style={fieldGroupStyle}>
            <label htmlFor="marketplace-title" style={labelStyle}>
              Title *
            </label>
            <input
              id="marketplace-title"
              type="text"
              style={fieldErrors.title ? inputErrorStyle : inputStyle}
              value={form.title}
              onChange={e => setField('title', e.target.value)}
              placeholder="Listing title"
              aria-label="Title"
              data-testid="marketplace-title-input"
            />
            {fieldErrors.title && (
              <span style={fieldErrorStyle} data-testid="title-error">
                {fieldErrors.title}
              </span>
            )}
          </div>

          {/* Description */}
          <div style={fieldGroupStyle}>
            <label htmlFor="marketplace-description" style={labelStyle}>
              Description *
            </label>
            <textarea
              id="marketplace-description"
              style={fieldErrors.description ? textareaErrorStyle : textareaStyle}
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="Describe the item or service..."
              aria-label="Description"
              data-testid="marketplace-description-input"
              rows={3}
            />
            {fieldErrors.description && (
              <span style={fieldErrorStyle} data-testid="description-error">
                {fieldErrors.description}
              </span>
            )}
          </div>

          {/* Category */}
          <div style={fieldGroupStyle}>
            <label htmlFor="marketplace-category" style={labelStyle}>
              Category *
            </label>
            <select
              id="marketplace-category"
              style={fieldErrors.category ? selectErrorStyle : selectStyle}
              value={form.category}
              onChange={e => setField('category', e.target.value as ListingCategory)}
              aria-label="Category"
              data-testid="marketplace-category-select"
            >
              {CATEGORY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {fieldErrors.category && (
              <span style={fieldErrorStyle} data-testid="category-error">
                {fieldErrors.category}
              </span>
            )}
          </div>

          {/* Price — hidden for Wanted and Free */}
          {showPrice && (
            <div style={fieldGroupStyle}>
              <label htmlFor="marketplace-price" style={labelStyle}>
                Price
              </label>
              <input
                id="marketplace-price"
                type="number"
                min={0}
                step="0.01"
                style={inputStyle}
                value={form.price}
                onChange={e => setField('price', e.target.value)}
                placeholder="Leave blank if free or negotiable"
                aria-label="Price"
                data-testid="marketplace-price-input"
              />
            </div>
          )}

          {/* Contact method */}
          <div style={fieldGroupStyle}>
            <label htmlFor="marketplace-contact-method" style={labelStyle}>
              Contact Method *
            </label>
            <select
              id="marketplace-contact-method"
              style={fieldErrors.contactMethod ? selectErrorStyle : selectStyle}
              value={form.contactMethod}
              onChange={e => setField('contactMethod', e.target.value as ContactMethod)}
              aria-label="Contact Method"
              data-testid="marketplace-contact-method-select"
            >
              {CONTACT_METHOD_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {fieldErrors.contactMethod && (
              <span style={fieldErrorStyle} data-testid="contact-method-error">
                {fieldErrors.contactMethod}
              </span>
            )}
          </div>

          {/* Contact info */}
          <div style={fieldGroupStyle}>
            <label htmlFor="marketplace-contact-info" style={labelStyle}>
              Contact Info *
            </label>
            <input
              id="marketplace-contact-info"
              type="text"
              style={fieldErrors.contactInfo ? inputErrorStyle : inputStyle}
              value={form.contactInfo}
              onChange={e => setField('contactInfo', e.target.value)}
              placeholder={contactInfoPlaceholder}
              aria-label="Contact Info"
              data-testid="marketplace-contact-info-input"
            />
            {fieldErrors.contactInfo && (
              <span style={fieldErrorStyle} data-testid="contact-info-error">
                {fieldErrors.contactInfo}
              </span>
            )}
          </div>

          {/* Active */}
          <div style={checkboxRowStyle}>
            <input
              id="marketplace-active"
              type="checkbox"
              checked={form.active}
              onChange={e => setField('active', e.target.checked)}
              aria-label="Active"
              data-testid="marketplace-active-input"
            />
            <label htmlFor="marketplace-active" style={checkboxLabelStyle}>
              Active
            </label>
          </div>

          {/* Submit error */}
          {submitError && (
            <div style={errorAlertStyle} role="alert" data-testid="submit-error">
              <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
              <span>{submitError}</span>
            </div>
          )}

          {/* Actions */}
          <div style={actionsStyle}>
            <button
              type="button"
              style={cancelBtnStyle}
              onClick={handleCancel}
              aria-label="Cancel"
              data-testid="marketplace-cancel-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              style={submitBtnStyle}
              disabled={submitting}
              data-testid="marketplace-submit-btn"
            >
              {submitting
                ? 'Saving...'
                : isEdit
                ? 'Save Changes'
                : 'Create Listing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
