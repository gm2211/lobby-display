/**
 * EventForm page — create and edit events (MANAGER+ only)
 *
 * Routes:
 *   /platform/events/new        — create mode (POST to /api/platform/events)
 *   /platform/events/:id/edit   — edit mode (GET then PUT /api/platform/events/:id)
 *
 * Form fields:
 *   - Title (required, text)
 *   - Description (required, textarea)
 *   - Location (optional, text)
 *   - Start time (required, datetime-local)
 *   - End time (optional, datetime-local)
 *   - Capacity (optional, number)
 *   - Is recurring (checkbox)
 *   - Recurrence rule (text, shown only when isRecurring is checked)
 *   - Active (checkbox, default true)
 *
 * On success → navigate to /platform/events/:id
 * On cancel  → navigate to /platform/events
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import type { PlatformEvent } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { AlertTriangle } from 'lucide-react';
import '../styles/tokens.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormState {
  title: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
  capacity: string;
  isRecurring: boolean;
  recurrenceRule: string;
  active: boolean;
}

interface FormErrors {
  title?: string;
  description?: string;
  startTime?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an ISO datetime string to datetime-local input format (YYYY-MM-DDTHH:mm)
 */
function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
}

/**
 * Convert datetime-local string to ISO for API submission
 */
function datetimeLocalToIso(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function EventForm() {
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
    location: '',
    startTime: '',
    endTime: '',
    capacity: '',
    isRecurring: false,
    recurrenceRule: '',
    active: true,
  });

  // Load event data in edit mode
  const loadEvent = useCallback(async () => {
    if (!isEdit || !id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.get<PlatformEvent>(`/api/platform/events/${id}`);
      setForm({
        title: data.title ?? '',
        description: data.description ?? '',
        location: data.location ?? '',
        startTime: isoToDatetimeLocal(data.startTime),
        endTime: isoToDatetimeLocal(data.endTime),
        capacity: data.capacity != null ? String(data.capacity) : '',
        isRecurring: data.isRecurring ?? false,
        recurrenceRule: data.recurrenceRule ?? '',
        active: data.active ?? true,
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load event');
    } finally {
      setLoading(false);
    }
  }, [id, isEdit]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

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
    if (!form.startTime) {
      errors.startTime = 'Start time is required';
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
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim() || null,
        startTime: datetimeLocalToIso(form.startTime),
        endTime: datetimeLocalToIso(form.endTime),
        capacity: form.capacity ? parseInt(form.capacity, 10) : null,
        isRecurring: form.isRecurring,
        recurrenceRule: form.isRecurring && form.recurrenceRule.trim() ? form.recurrenceRule.trim() : null,
        active: form.active,
      };

      let result: PlatformEvent;
      if (isEdit && id) {
        result = await api.put<PlatformEvent>(`/api/platform/events/${id}`, payload);
      } else {
        result = await api.post<PlatformEvent>('/api/platform/events', payload);
      }

      navigate(`/platform/events/${result.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate('/platform/events');
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

  const fieldErrorStyle: CSSProperties = {
    fontSize: '12px',
    color: '#ef4444',
    marginTop: '2px',
  };

  const rowStyle: CSSProperties = {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
  };

  const halfFieldStyle: CSSProperties = {
    ...fieldGroupStyle,
    flex: '1 1 240px',
    minWidth: '200px',
    marginBottom: 0,
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
        <LoadingSpinner size="lg" label="Loading event..." />
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
        {isEdit ? 'Edit Event' : 'Create Event'}
      </h1>

      <div style={cardStyle}>
        <form onSubmit={handleSubmit} noValidate data-testid="event-form">
          {/* Title */}
          <div style={fieldGroupStyle}>
            <label htmlFor="event-title" style={labelStyle}>
              Title *
            </label>
            <input
              id="event-title"
              type="text"
              style={fieldErrors.title ? inputErrorStyle : inputStyle}
              value={form.title}
              onChange={e => setField('title', e.target.value)}
              placeholder="Event title"
              aria-label="Title"
              data-testid="event-title-input"
            />
            {fieldErrors.title && (
              <span style={fieldErrorStyle} data-testid="title-error">
                {fieldErrors.title}
              </span>
            )}
          </div>

          {/* Description */}
          <div style={fieldGroupStyle}>
            <label htmlFor="event-description" style={labelStyle}>
              Description *
            </label>
            <textarea
              id="event-description"
              style={fieldErrors.description ? textareaErrorStyle : textareaStyle}
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="Event description"
              aria-label="Description"
              data-testid="event-description-input"
              rows={3}
            />
            {fieldErrors.description && (
              <span style={fieldErrorStyle} data-testid="description-error">
                {fieldErrors.description}
              </span>
            )}
          </div>

          {/* Location */}
          <div style={fieldGroupStyle}>
            <label htmlFor="event-location" style={labelStyle}>
              Location
            </label>
            <input
              id="event-location"
              type="text"
              style={inputStyle}
              value={form.location}
              onChange={e => setField('location', e.target.value)}
              placeholder="e.g. Rooftop Terrace, Lobby..."
              aria-label="Location"
              data-testid="event-location-input"
            />
          </div>

          {/* Start / End time row */}
          <div style={{ ...rowStyle, marginBottom: '18px' }}>
            <div style={halfFieldStyle}>
              <label htmlFor="event-start-time" style={labelStyle}>
                Start Time *
              </label>
              <input
                id="event-start-time"
                type="datetime-local"
                style={fieldErrors.startTime ? inputErrorStyle : inputStyle}
                value={form.startTime}
                onChange={e => setField('startTime', e.target.value)}
                aria-label="Start Time"
                data-testid="event-start-time-input"
              />
              {fieldErrors.startTime && (
                <span style={fieldErrorStyle} data-testid="start-time-error">
                  {fieldErrors.startTime}
                </span>
              )}
            </div>

            <div style={halfFieldStyle}>
              <label htmlFor="event-end-time" style={labelStyle}>
                End Time
              </label>
              <input
                id="event-end-time"
                type="datetime-local"
                style={inputStyle}
                value={form.endTime}
                onChange={e => setField('endTime', e.target.value)}
                aria-label="End Time"
                data-testid="event-end-time-input"
              />
            </div>
          </div>

          {/* Capacity */}
          <div style={fieldGroupStyle}>
            <label htmlFor="event-capacity" style={labelStyle}>
              Capacity
            </label>
            <input
              id="event-capacity"
              type="number"
              min={1}
              style={inputStyle}
              value={form.capacity}
              onChange={e => setField('capacity', e.target.value)}
              placeholder="Leave blank for unlimited"
              aria-label="Capacity"
              data-testid="event-capacity-input"
            />
          </div>

          {/* Is recurring */}
          <div style={checkboxRowStyle}>
            <input
              id="event-is-recurring"
              type="checkbox"
              checked={form.isRecurring}
              onChange={e => setField('isRecurring', e.target.checked)}
              aria-label="Is Recurring"
              data-testid="event-is-recurring-input"
            />
            <label htmlFor="event-is-recurring" style={checkboxLabelStyle}>
              Recurring event
            </label>
          </div>

          {/* Recurrence rule — only shown when isRecurring is true */}
          {form.isRecurring && (
            <div style={fieldGroupStyle}>
              <label htmlFor="event-recurrence-rule" style={labelStyle}>
                Recurrence Rule
              </label>
              <input
                id="event-recurrence-rule"
                type="text"
                style={inputStyle}
                value={form.recurrenceRule}
                onChange={e => setField('recurrenceRule', e.target.value)}
                placeholder="e.g. FREQ=WEEKLY;BYDAY=MO"
                aria-label="Recurrence Rule"
                data-testid="event-recurrence-rule-input"
              />
            </div>
          )}

          {/* Active */}
          <div style={checkboxRowStyle}>
            <input
              id="event-active"
              type="checkbox"
              checked={form.active}
              onChange={e => setField('active', e.target.checked)}
              aria-label="Active"
              data-testid="event-active-input"
            />
            <label htmlFor="event-active" style={checkboxLabelStyle}>
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
              data-testid="event-cancel-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              style={submitBtnStyle}
              disabled={submitting}
              data-testid="event-submit-btn"
            >
              {submitting
                ? 'Saving...'
                : isEdit
                ? 'Save Changes'
                : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
