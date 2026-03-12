/**
 * BookingFlow page — /platform/bookings/new
 *
 * Multi-step amenity booking flow:
 * - Step 1: Amenity selector (card grid)
 * - Step 2: Date picker
 * - Step 3: Time slot grid (available/unavailable slots)
 * - Step 4: Confirmation (summary + notes + submit)
 * - Success/error feedback
 * - Navigate to my bookings on success
 *
 * API:
 * - GET  /api/platform/amenities                              — list amenities
 * - GET  /api/platform/amenities/:id/availability?date=YYYY-MM-DD — available slots
 * - POST /api/platform/bookings                               — create booking
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Amenity } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Users, AlertTriangle, Clock, CheckCircle, MapPin } from 'lucide-react';
import '../styles/tokens.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TimeSlot {
  time: string;     // ISO datetime string
  available: boolean;
}

interface AvailabilityResponse {
  amenityId: string;
  date: string;
  slots: TimeSlot[];
}

interface BookingResult {
  id: string;
  status: 'APPROVED' | 'PENDING' | 'WAITLISTED' | string;
  amenity?: { name: string };
  startTime: string;
  endTime: string;
}

type Step = 1 | 2 | 3 | 4 | 'success';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(pricePerHour: number | null, pricePerDay: number | null): string {
  if (pricePerHour != null) return `$${pricePerHour.toFixed(0)}/hr`;
  if (pricePerDay != null) return `$${pricePerDay.toFixed(0)}/day`;
  return 'Free';
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(isoString: string): string {
  const date = new Date(isoString + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const datePart = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const endTime = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${datePart}, ${startTime} – ${endTime}`;
}

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Step Indicator ──────────────────────────────────────────────────────────

const STEP_LABELS = ['Amenity', 'Date', 'Time', 'Confirm'];

function StepIndicator({ current }: { current: number }) {
  const stepStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0',
    marginBottom: '28px',
  };

  return (
    <div style={stepStyle} data-testid="step-indicator" aria-label={`Step ${current} of ${STEP_LABELS.length}`}>
      {STEP_LABELS.map((label, idx) => {
        const stepNum = idx + 1;
        const isActive = stepNum === current;
        const isCompleted = stepNum < current;

        const circleStyle: CSSProperties = {
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          fontWeight: 700,
          backgroundColor: isActive
            ? 'var(--platform-accent)'
            : isCompleted
            ? 'var(--platform-accent)'
            : 'var(--platform-surface)',
          color: isActive || isCompleted ? '#fff' : 'var(--platform-text-secondary)',
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: isActive || isCompleted ? 'var(--platform-accent)' : 'var(--platform-border)',
          flexShrink: 0,
          opacity: isActive ? 1 : isCompleted ? 0.8 : 0.5,
        };

        const labelStyle: CSSProperties = {
          fontSize: '11px',
          fontWeight: isActive ? 700 : 500,
          color: isActive ? 'var(--platform-accent)' : 'var(--platform-text-secondary)',
          whiteSpace: 'nowrap',
          opacity: isActive ? 1 : isCompleted ? 0.8 : 0.5,
        };

        const connectorStyle: CSSProperties = {
          flex: 1,
          height: '2px',
          backgroundColor: isCompleted ? 'var(--platform-accent)' : 'var(--platform-border)',
          opacity: isCompleted ? 0.8 : 0.4,
          minWidth: '20px',
        };

        return (
          <div key={stepNum} style={{ display: 'flex', alignItems: 'center', flex: idx < STEP_LABELS.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={circleStyle}>{isCompleted ? '✓' : stepNum}</div>
              <span style={labelStyle}>{label}</span>
            </div>
            {idx < STEP_LABELS.length - 1 && (
              <div style={{ ...connectorStyle, marginBottom: '14px', marginLeft: '4px', marginRight: '4px' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Amenity Card ────────────────────────────────────────────────────────────

function AmenityCard({ amenity, onSelect }: { amenity: Amenity; onSelect: (a: Amenity) => void }) {
  const [hovered, setHovered] = useState(false);

  const cardStyle: CSSProperties = {
    backgroundColor: hovered ? 'var(--platform-surface-hover)' : 'var(--platform-surface)',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: hovered ? 'var(--platform-accent)' : 'var(--platform-border)',
    borderRadius: '12px',
    padding: '20px',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
    boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.10)' : 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  };

  const nameStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: 0,
  };

  const metaStyle: CSSProperties = {
    fontSize: '13px',
    color: 'var(--platform-text-secondary)',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    alignItems: 'center',
  };

  const priceStyle: CSSProperties = {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--platform-accent)',
    marginTop: 'auto',
  };

  const approvalBadgeStyle: CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '4px',
    backgroundColor: 'var(--platform-status-limited-bg)',
    color: 'var(--platform-status-limited)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-status-limited)',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={cardStyle}
      data-testid={`amenity-option-${amenity.id}`}
      onClick={() => onSelect(amenity)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      aria-label={`Select ${amenity.name}`}
      onKeyDown={e => e.key === 'Enter' && onSelect(amenity)}
    >
      <h3 style={nameStyle}>{amenity.name}</h3>
      <div style={metaStyle}>
        {amenity.location && <span><MapPin size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{amenity.location}</span>}
        {amenity.capacity != null && <span><Users size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Capacity: {amenity.capacity}</span>}
        {amenity.category && (
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '4px',
            backgroundColor: 'var(--platform-bg)',
            color: 'var(--platform-text-secondary)',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: 'var(--platform-border)',
          }}>
            {amenity.category}
          </span>
        )}
      </div>
      {amenity.description && (
        <p style={{ fontSize: '13px', color: 'var(--platform-text-secondary)', margin: 0, lineHeight: 1.5 }}>
          {amenity.description.length > 100
            ? amenity.description.slice(0, 100) + '…'
            : amenity.description}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <span style={priceStyle}>{formatPrice(amenity.pricePerHour, amenity.pricePerDay)}</span>
        {amenity.requiresApproval && (
          <span style={approvalBadgeStyle}>Approval Required</span>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function BookingFlow() {
  const [step, setStep] = useState<Step>(1);

  // Data state
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [selectedAmenity, setSelectedAmenity] = useState<Amenity | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [notes, setNotes] = useState('');
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);

  // Loading / error state
  const [loadingAmenities, setLoadingAmenities] = useState(true);
  const [amenitiesError, setAmenitiesError] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // ── Fetch amenities on mount ──────────────────────────────────────────────

  const fetchAmenities = useCallback(async () => {
    setLoadingAmenities(true);
    setAmenitiesError(null);
    try {
      const data = await api.get<Amenity[]>('/api/platform/amenities');
      setAmenities(Array.isArray(data) ? data : []);
    } catch (err) {
      setAmenitiesError(err instanceof Error ? err.message : 'Failed to load amenities');
    } finally {
      setLoadingAmenities(false);
    }
  }, []);

  useEffect(() => {
    fetchAmenities();
  }, [fetchAmenities]);

  // ── Fetch availability slots ───────────────────────────────────────────────

  const fetchSlots = useCallback(async (amenityId: number | string, date: string) => {
    setLoadingSlots(true);
    setSlotsError(null);
    setSlots([]);
    try {
      const data = await api.get<AvailabilityResponse>(
        `/api/platform/amenities/${amenityId}/availability?date=${date}`
      );
      setSlots(data.slots ?? []);
    } catch (err) {
      setSlotsError(err instanceof Error ? err.message : 'Failed to load availability');
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  // ── Step navigation ────────────────────────────────────────────────────────

  function handleSelectAmenity(amenity: Amenity) {
    setSelectedAmenity(amenity);
    setSelectedDate('');
    setSlots([]);
    setSelectedSlot(null);
    setStep(2);
  }

  function handleDateNext() {
    if (!selectedDate || !selectedAmenity) return;
    setStep(3);
    fetchSlots(selectedAmenity.id, selectedDate);
  }

  function handleSelectSlot(slot: TimeSlot) {
    setSelectedSlot(slot);
    setBookingError(null);
    setStep(4);
  }

  function handleBack() {
    if (step === 2) {
      setSelectedAmenity(null);
      setStep(1);
    } else if (step === 3) {
      setStep(2);
    } else if (step === 4) {
      setSelectedSlot(null);
      setStep(3);
    }
  }

  // ── Submit booking ─────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!selectedAmenity || !selectedSlot) return;

    setSubmitting(true);
    setBookingError(null);

    // Calculate endTime as start + 1 hour
    const startTime = new Date(selectedSlot.time);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    try {
      const result = await api.post<BookingResult>('/api/platform/bookings', {
        amenityId: String(selectedAmenity.id),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        notes: notes.trim() || undefined,
      });
      setBookingResult(result);
      setStep('success');
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '800px',
    margin: '0 auto',
  };

  const headerStyle: CSSProperties = {
    marginBottom: '8px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: '0 0 4px',
  };

  const subtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    margin: '0 0 24px',
  };

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
  };

  const errorBoxStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '24px',
    backgroundColor: 'rgba(185, 48, 64, 0.06)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(185, 48, 64, 0.3)',
    borderRadius: '8px',
    color: '#b93040',
    fontSize: '14px',
    textAlign: 'center',
  };

  const retryBtnStyle: CSSProperties = {
    padding: '8px 20px',
    backgroundColor: 'transparent',
    color: '#b93040',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#b93040',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  };

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '12px',
    padding: '24px',
  };

  const backBtnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'transparent',
    color: 'var(--platform-text-secondary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    marginBottom: '20px',
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: 'var(--platform-bg)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const primaryBtnStyle: CSSProperties = {
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
  };

  const sectionLabelStyle: CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--platform-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: '6px',
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loadingAmenities) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // ── Success state ──────────────────────────────────────────────────────────

  if (step === 'success' && bookingResult) {
    const isPending = bookingResult.status === 'PENDING' || bookingResult.status === 'WAITLISTED';

    const successCardStyle: CSSProperties = {
      ...cardStyle,
      textAlign: 'center',
      padding: '40px',
    };

    const iconStyle: CSSProperties = {
      fontSize: '48px',
      marginBottom: '16px',
    };

    const successTitleStyle: CSSProperties = {
      fontSize: '22px',
      fontWeight: 700,
      color: 'var(--platform-text-primary)',
      marginBottom: '12px',
    };

    const successMsgStyle: CSSProperties = {
      fontSize: '14px',
      color: 'var(--platform-text-secondary)',
      lineHeight: 1.6,
      maxWidth: '400px',
      margin: '0 auto 24px',
    };

    const myBookingsLinkStyle: CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      backgroundColor: 'var(--platform-accent)',
      color: '#fff',
      textDecoration: 'none',
      borderRadius: '8px',
      padding: '10px 24px',
      fontSize: '14px',
      fontWeight: 600,
    };

    return (
      <div style={pageStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Book an Amenity</h1>
        </div>
        <div style={successCardStyle} data-testid="booking-success">
          <div style={iconStyle}>{isPending ? <Clock size={40} color="#c9921b" /> : <CheckCircle size={40} color="#2d7a47" />}</div>
          <h2 style={successTitleStyle}>
            {isPending ? 'Booking Submitted — Pending Approval' : 'Booking Confirmed!'}
          </h2>
          <p style={successMsgStyle}>
            {isPending
              ? 'Your booking request is pending approval from building management. You will be notified once it is reviewed.'
              : 'Your booking has been confirmed. Enjoy your time!'}
          </p>
          {selectedAmenity && selectedSlot && (
            <div style={{
              backgroundColor: 'var(--platform-bg)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '24px',
              textAlign: 'left',
            }}>
              <p style={{ margin: '0 0 6px', fontSize: '14px', color: 'var(--platform-text-secondary)' }}>
                <strong style={{ color: 'var(--platform-text-primary)' }}>{selectedAmenity.name}</strong>
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--platform-text-secondary)' }}>
                {formatDateTimeRange(
                  selectedSlot.time,
                  new Date(new Date(selectedSlot.time).getTime() + 60 * 60 * 1000).toISOString()
                )}
              </p>
            </div>
          )}
          <Link
            to="/platform/bookings"
            style={myBookingsLinkStyle}
            data-testid="my-bookings-link"
          >
            View My Bookings
          </Link>
        </div>
      </div>
    );
  }

  // ── Step 1: Amenity Selection ──────────────────────────────────────────────

  if (step === 1) {
    return (
      <div style={pageStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Book an Amenity</h1>
          <p style={subtitleStyle}>Select an amenity to get started</p>
        </div>

        <StepIndicator current={1} />

        {amenitiesError && (
          <div style={errorBoxStyle} role="alert">
            <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{amenitiesError}
            <button style={retryBtnStyle} onClick={fetchAmenities} aria-label="Retry">
              Retry
            </button>
          </div>
        )}

        {!amenitiesError && amenities.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '48px',
            color: 'var(--platform-text-secondary)',
            fontSize: '14px',
          }}>
            No amenities available at this time.
          </div>
        )}

        {!amenitiesError && amenities.length > 0 && (
          <div style={gridStyle}>
            {amenities.map(amenity => (
              <AmenityCard
                key={amenity.id}
                amenity={amenity}
                onSelect={handleSelectAmenity}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Step 2: Date Picker ────────────────────────────────────────────────────

  if (step === 2) {
    const isDateValid = !!selectedDate;

    return (
      <div style={pageStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Book an Amenity</h1>
        </div>

        <StepIndicator current={2} />

        <button style={backBtnStyle} onClick={handleBack} data-testid="back-button" type="button">
          ← Back
        </button>

        <div style={cardStyle}>
          <p style={{ fontSize: '13px', color: 'var(--platform-text-secondary)', marginBottom: '16px', marginTop: 0 }}>
            Booking:{' '}
            <strong style={{ color: 'var(--platform-text-primary)' }} data-testid="selected-amenity-name">
              {selectedAmenity?.name}
            </strong>
          </p>

          <div style={sectionLabelStyle as CSSProperties}>Select a Date</div>
          <input
            type="date"
            value={selectedDate}
            min={getTodayString()}
            onChange={e => setSelectedDate(e.target.value)}
            style={inputStyle}
            data-testid="date-picker"
            aria-label="Select booking date"
          />

          <div style={{ marginTop: '20px' }}>
            <button
              style={{
                ...primaryBtnStyle,
                opacity: isDateValid ? 1 : 0.5,
                cursor: isDateValid ? 'pointer' : 'not-allowed',
              }}
              onClick={handleDateNext}
              disabled={!isDateValid}
              data-testid="date-next-button"
              type="button"
            >
              Check Availability →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3: Time Slot Grid ─────────────────────────────────────────────────

  if (step === 3) {
    const slotGridStyle: CSSProperties = {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
      gap: '10px',
      marginTop: '16px',
    };

    const availableSlotStyle: CSSProperties = {
      padding: '12px 8px',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: 600,
      textAlign: 'center',
      cursor: 'pointer',
      transition: 'background 0.12s, border-color 0.12s',
      backgroundColor: 'var(--platform-surface)',
      color: 'var(--platform-accent)',
      borderWidth: 2,
      borderStyle: 'solid',
      borderColor: 'var(--platform-accent)',
    };

    const unavailableSlotStyle: CSSProperties = {
      padding: '12px 8px',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: 600,
      textAlign: 'center',
      cursor: 'not-allowed',
      backgroundColor: 'var(--platform-bg)',
      color: 'var(--platform-text-muted)',
      borderWidth: 2,
      borderStyle: 'solid',
      borderColor: 'var(--platform-border)',
      opacity: 0.5,
    };

    return (
      <div style={pageStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Book an Amenity</h1>
        </div>

        <StepIndicator current={3} />

        <button style={backBtnStyle} onClick={handleBack} data-testid="back-button" type="button">
          ← Back
        </button>

        <div style={cardStyle}>
          <p style={{ fontSize: '13px', color: 'var(--platform-text-secondary)', marginBottom: '4px', marginTop: 0 }}>
            <strong style={{ color: 'var(--platform-text-primary)' }}>{selectedAmenity?.name}</strong>
            {' '}&middot;{' '}
            {selectedDate && formatDate(selectedDate)}
          </p>

          <div style={{ ...sectionLabelStyle as CSSProperties, marginTop: '16px' }}>Available Time Slots</div>

          {loadingSlots && (
            <div
              style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}
              data-testid="slots-loading"
            >
              <LoadingSpinner size="md" />
            </div>
          )}

          {!loadingSlots && slotsError && (
            <div style={errorBoxStyle} data-testid="slots-error" role="alert">
              <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{slotsError}
              <button
                style={retryBtnStyle}
                onClick={() => selectedAmenity && fetchSlots(selectedAmenity.id, selectedDate)}
                aria-label="Retry"
              >
                Retry
              </button>
            </div>
          )}

          {!loadingSlots && !slotsError && slots.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '32px',
              color: 'var(--platform-text-secondary)',
              fontSize: '14px',
            }}>
              No time slots available for this date.
            </div>
          )}

          {!loadingSlots && !slotsError && slots.length > 0 && (
            <div style={slotGridStyle} data-testid="time-slot-grid">
              {slots.map((slot, idx) => (
                slot.available ? (
                  <button
                    key={slot.time}
                    style={availableSlotStyle}
                    onClick={() => handleSelectSlot(slot)}
                    data-testid={`time-slot-available-${idx}`}
                    type="button"
                    aria-label={`Select ${formatTime(slot.time)}`}
                  >
                    {formatTime(slot.time)}
                  </button>
                ) : (
                  <button
                    key={slot.time}
                    style={unavailableSlotStyle}
                    disabled
                    data-testid={`time-slot-unavailable-${idx}`}
                    type="button"
                    aria-label={`${formatTime(slot.time)} — unavailable`}
                  >
                    {formatTime(slot.time)}
                  </button>
                )
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Step 4: Confirmation ───────────────────────────────────────────────────

  if (step === 4) {
    const summaryRowStyle: CSSProperties = {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: '10px 0',
      borderBottomWidth: 1,
      borderBottomStyle: 'solid',
      borderBottomColor: 'var(--platform-border)',
    };

    const summaryLabelStyle: CSSProperties = {
      fontSize: '13px',
      color: 'var(--platform-text-secondary)',
      fontWeight: 500,
    };

    const summaryValueStyle: CSSProperties = {
      fontSize: '13px',
      color: 'var(--platform-text-primary)',
      fontWeight: 600,
      textAlign: 'right',
    };

    const startTime = selectedSlot ? new Date(selectedSlot.time) : null;
    const endTime = startTime ? new Date(startTime.getTime() + 60 * 60 * 1000) : null;

    return (
      <div style={pageStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Book an Amenity</h1>
        </div>

        <StepIndicator current={4} />

        <button style={backBtnStyle} onClick={handleBack} data-testid="back-button" type="button">
          ← Back
        </button>

        <div style={cardStyle}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--platform-text-primary)',
            margin: '0 0 16px',
          }}>
            Confirm Your Booking
          </h2>

          {/* Summary */}
          <div data-testid="confirmation-summary" style={{ marginBottom: '24px' }}>
            <div style={summaryRowStyle}>
              <span style={summaryLabelStyle}>Amenity</span>
              <span style={summaryValueStyle}>{selectedAmenity?.name}</span>
            </div>
            {selectedAmenity?.location && (
              <div style={summaryRowStyle}>
                <span style={summaryLabelStyle}>Location</span>
                <span style={summaryValueStyle}>{selectedAmenity.location}</span>
              </div>
            )}
            <div style={summaryRowStyle}>
              <span style={summaryLabelStyle}>Date</span>
              <span style={summaryValueStyle}>{selectedDate && formatDate(selectedDate)}</span>
            </div>
            <div style={summaryRowStyle}>
              <span style={summaryLabelStyle}>Time</span>
              <span style={summaryValueStyle}>
                {startTime && endTime
                  ? `${formatTime(startTime.toISOString())} – ${formatTime(endTime.toISOString())}`
                  : ''}
              </span>
            </div>
            <div style={{ ...summaryRowStyle, borderBottomWidth: 0 }}>
              <span style={summaryLabelStyle}>Price</span>
              <span style={{ ...summaryValueStyle, color: 'var(--platform-accent)', fontSize: '15px' }}>
                {selectedAmenity ? formatPrice(selectedAmenity.pricePerHour, selectedAmenity.pricePerDay) : ''}
              </span>
            </div>
          </div>

          {/* Approval notice */}
          {selectedAmenity?.requiresApproval && (
            <div style={{
              backgroundColor: 'var(--platform-status-limited-bg)',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '20px',
              fontSize: '13px',
              color: 'var(--platform-status-limited)',
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: 'var(--platform-status-limited)',
            }}>
              <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />This amenity requires approval. Your booking will be submitted as pending.
            </div>
          )}

          {/* Notes */}
          <div style={{ marginBottom: '20px' }}>
            <label style={sectionLabelStyle as CSSProperties} htmlFor="booking-notes-input">
              Notes (optional)
            </label>
            <textarea
              id="booking-notes-input"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any special requests or notes..."
              style={{
                ...inputStyle,
                resize: 'vertical',
                minHeight: '72px',
                marginTop: '6px',
              }}
              data-testid="booking-notes"
              aria-label="Booking notes"
            />
          </div>

          {/* Error */}
          {bookingError && (
            <div style={{
              ...errorBoxStyle,
              textAlign: 'left',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
            }} data-testid="booking-error" role="alert">
              <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
              <span>{bookingError}</span>
            </div>
          )}

          {/* Submit */}
          <button
            style={primaryBtnStyle}
            onClick={handleSubmit}
            disabled={submitting}
            data-testid="confirm-booking-button"
            type="button"
          >
            {submitting ? 'Submitting...' : 'Confirm Booking'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
