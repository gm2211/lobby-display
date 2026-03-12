/**
 * AmenityDetail page — /platform/amenities/:id
 *
 * Shows full amenity detail including:
 * - Name, description, location, capacity, pricing, availability status
 * - Rules list
 * - Image gallery
 * - Calendar view showing booked/available time slots
 * - "Book Now" link to booking flow
 * - Back link to amenities list
 * - Loading / error / not-found states
 *
 * API:
 *   GET /api/platform/amenities/:id               → Amenity (with rules + images)
 *   GET /api/platform/amenities/:id/availability  → AvailabilityResponse
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../utils/api';
import type { Amenity, AvailabilityStatus } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import Calendar from '../components/Calendar';
import type { CalendarEvent } from '../components/Calendar';
import { Dumbbell, AlertTriangle, MapPin, Users, CheckCircle } from 'lucide-react';
import '../styles/tokens.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AvailabilitySlot {
  time: string;
  available: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AVAILABILITY_CONFIG: Record<
  AvailabilityStatus,
  { label: string; color: string; bg: string }
> = {
  AVAILABLE:   { label: 'Available',   color: 'var(--platform-status-available)',   bg: 'var(--platform-status-available-bg)' },
  LIMITED:     { label: 'Limited',     color: 'var(--platform-status-limited)',     bg: 'var(--platform-status-limited-bg)' },
  UNAVAILABLE: { label: 'Unavailable', color: 'var(--platform-status-unavailable)', bg: 'var(--platform-status-unavailable-bg)' },
};

function formatPrice(pricePerHour: number | null, pricePerDay: number | null): string {
  if (pricePerHour != null) return `$${pricePerHour.toFixed(0)}/hr`;
  if (pricePerDay != null) return `$${pricePerDay.toFixed(0)}/day`;
  return 'Free';
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  const { label, color, bg } = AVAILABILITY_CONFIG[status];
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '4px 12px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 600,
    color,
    backgroundColor: bg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color,
    whiteSpace: 'nowrap',
  };
  const dotStyle: CSSProperties = {
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: color,
    flexShrink: 0,
  };
  return (
    <span style={style} data-testid={`availability-badge-${status}`}>
      <span style={dotStyle} aria-hidden="true" />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Image Gallery
// ---------------------------------------------------------------------------

interface ImageGalleryProps {
  images: Amenity['images'];
  amenityName: string;
}

function ImageGallery({ images, amenityName }: ImageGalleryProps) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (images.length === 0) return null;

  const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);
  const active = sorted[activeIdx];

  const mainImgStyle: CSSProperties = {
    width: '100%',
    height: '320px',
    objectFit: 'cover',
    borderRadius: '8px',
    display: 'block',
  };

  const thumbContainerStyle: CSSProperties = {
    display: 'flex',
    gap: '8px',
    marginTop: '10px',
    flexWrap: 'wrap',
  };

  const thumbStyle = (idx: number): CSSProperties => ({
    width: '72px',
    height: '52px',
    objectFit: 'cover',
    borderRadius: '4px',
    cursor: 'pointer',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: idx === activeIdx ? 'var(--platform-accent)' : 'transparent',
    opacity: idx === activeIdx ? 1 : 0.7,
    transition: 'opacity 0.15s, border-color 0.15s',
  });

  return (
    <div>
      <img
        src={active.url}
        alt={active.caption ?? amenityName}
        style={mainImgStyle}
      />
      {sorted.length > 1 && (
        <div style={thumbContainerStyle}>
          {sorted.map((img, idx) => (
            <img
              key={img.id}
              src={img.url}
              alt={img.caption ?? `${amenityName} photo ${idx + 1}`}
              style={thumbStyle(idx)}
              onClick={() => setActiveIdx(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Availability Calendar Section
// ---------------------------------------------------------------------------

interface AvailabilityCalendarProps {
  amenityId: number;
}

function AvailabilityCalendar({ amenityId }: AvailabilityCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const loadAvailability = useCallback(
    async (date: Date) => {
      setLoadingSlots(true);
      try {
        const dateStr = toDateString(date);
        const data = await api.get<{ slots: AvailabilitySlot[] }>(
          `/api/platform/amenities/${amenityId}/availability?date=${dateStr}`
        );
        setSlots(data.slots);
      } catch {
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    },
    [amenityId]
  );

  const handleDayClick = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      void loadAvailability(date);
    },
    [loadAvailability]
  );

  // Build calendar events from slots (booked = not available)
  const calendarEvents: CalendarEvent[] = slots
    .filter(s => !s.available)
    .map((s, idx) => {
      const slotDate = new Date(s.time);
      return {
        id: `slot-${idx}`,
        title: 'Booked',
        date: slotDate,
        color: '#ef4444',
      };
    });

  const sectionHeaderStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: '0 0 16px',
  };

  const slotGridStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '16px',
  };

  const slotStyle = (available: boolean): CSSProperties => ({
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    backgroundColor: available ? 'var(--platform-status-available-bg)' : 'rgba(239,68,68,0.1)',
    color: available ? 'var(--platform-status-available)' : '#ef4444',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: available ? 'var(--platform-status-available)' : '#ef4444',
  });

  return (
    <div>
      <h2 style={sectionHeaderStyle}>Availability Calendar</h2>
      <Calendar
        events={calendarEvents}
        onDayClick={handleDayClick}
        selectedDate={selectedDate}
        initialDate={new Date()}
      />

      {selectedDate && (
        <div style={{ marginTop: '16px' }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--platform-text-primary)',
              marginBottom: '10px',
            }}
          >
            Time slots for{' '}
            {selectedDate.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>

          {loadingSlots ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
              <LoadingSpinner size="sm" />
            </div>
          ) : slots.length > 0 ? (
            <div style={slotGridStyle}>
              {slots.map((slot, idx) => {
                const time = new Date(slot.time).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                });
                return (
                  <span key={idx} style={slotStyle(slot.available)}>
                    {time} — {slot.available ? 'Available' : 'Booked'}
                  </span>
                );
              })}
            </div>
          ) : (
            <p
              style={{
                fontSize: '13px',
                color: 'var(--platform-text-secondary)',
                margin: 0,
              }}
            >
              No time slot data available for this date.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AmenityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [amenity, setAmenity] = useState<Amenity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await api.get<Amenity>(`/api/platform/amenities/${id}`);
      setAmenity(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load amenity';
      if (
        msg.toLowerCase().includes('not found') ||
        (err as { status?: number }).status === 404
      ) {
        setNotFound(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // --- Styles ---

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '900px',
    margin: '0 auto',
  };

  const backBtnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '24px',
    padding: '6px 12px',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    color: 'var(--platform-text-secondary)',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '12px',
    padding: '28px 32px',
    marginBottom: '20px',
  };

  const errorStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '32px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#ef4444',
    fontSize: '14px',
    textAlign: 'center',
  };

  const retryBtnStyle: CSSProperties = {
    padding: '8px 20px',
    backgroundColor: 'transparent',
    color: '#ef4444',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#ef4444',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  // --- Loading ---
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
        <LoadingSpinner size="lg" label="Loading amenity..." />
      </div>
    );
  }

  // --- Not found ---
  if (notFound) {
    return (
      <div style={pageStyle}>
        <button style={backBtnStyle} onClick={() => navigate('/platform/amenities')}>
          <span>&#8592;</span>
          <span>Back to amenities</span>
        </button>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            padding: '48px',
            textAlign: 'center',
          }}
        >
          <Dumbbell size={48} color="#888" />
          <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--platform-text-primary)' }}>
            Amenity not found
          </h2>
          <p style={{ margin: 0, color: 'var(--platform-text-secondary)', fontSize: '14px' }}>
            This amenity may have been removed or is no longer available.
          </p>
        </div>
      </div>
    );
  }

  // --- Error ---
  if (error) {
    return (
      <div style={pageStyle}>
        <button style={backBtnStyle} onClick={() => navigate('/platform/amenities')}>
          <span>&#8592;</span>
          <span>Back to amenities</span>
        </button>
        <div style={errorStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{error}
          <button style={retryBtnStyle} onClick={() => void load()} aria-label="Retry">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!amenity) return null;

  const sortedImages = [...amenity.images].sort((a, b) => a.sortOrder - b.sortOrder);

  const sectionHeaderStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: '0 0 14px',
  };

  const metaRowStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '14px',
    marginBottom: '16px',
    alignItems: 'center',
  };

  const metaItemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
  };

  const dividerStyle: CSSProperties = {
    height: '1px',
    backgroundColor: 'var(--platform-border)',
    margin: '20px 0',
  };

  const bookNowBtnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 28px',
    backgroundColor: 'var(--platform-accent)',
    color: '#fff',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 700,
    textDecoration: 'none',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  };

  const categoryBadgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 10px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    backgroundColor: 'var(--platform-bg)',
    color: 'var(--platform-text-secondary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
  };

  return (
    <div style={pageStyle}>
      {/* Back button */}
      <button style={backBtnStyle} onClick={() => navigate('/platform/amenities')}>
        <span>&#8592;</span>
        <span>Back to amenities</span>
      </button>

      {/* Main info card */}
      <div
        style={cardStyle}
        data-testid={`amenity-detail-${amenity.id}`}
      >
        {/* Image gallery */}
        {sortedImages.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <ImageGallery images={sortedImages} amenityName={amenity.name} />
          </div>
        )}

        {/* Header: name + category */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '12px',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: '26px',
              fontWeight: 700,
              color: 'var(--platform-text-primary)',
              lineHeight: 1.3,
            }}
          >
            {amenity.name}
          </h1>
          <span style={categoryBadgeStyle}>{amenity.category}</span>
        </div>

        {/* Availability badge */}
        <div style={{ marginBottom: '16px' }}>
          <AvailabilityBadge status={amenity.availabilityStatus} />
        </div>

        {/* Meta: location, capacity, pricing, approval */}
        <div style={metaRowStyle}>
          {amenity.location && (
            <span style={metaItemStyle}>
              <MapPin size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }} />
              {amenity.location}
            </span>
          )}
          {amenity.capacity != null && (
            <span style={metaItemStyle}>
              <Users size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }} />
              {amenity.capacity} capacity
            </span>
          )}
          <span style={{ ...metaItemStyle, fontWeight: 700, color: 'var(--platform-accent)' }}>
            {formatPrice(amenity.pricePerHour, amenity.pricePerDay)}
          </span>
          {amenity.requiresApproval && (
            <span
              style={{
                ...metaItemStyle,
                color: 'var(--platform-status-limited)',
                fontWeight: 600,
              }}
            >
              <CheckCircle size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }} />
              Approval required
            </span>
          )}
        </div>

        {/* Description */}
        {amenity.description && (
          <>
            <p
              style={{
                margin: '0 0 16px',
                fontSize: '15px',
                color: 'var(--platform-text-primary)',
                lineHeight: 1.7,
              }}
            >
              {amenity.description}
            </p>
          </>
        )}

        {/* Rules section */}
        {amenity.rules.length > 0 && (
          <>
            <div style={dividerStyle} />
            <div>
              <h2 style={sectionHeaderStyle}>Rules</h2>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {[...amenity.rules]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map(rule => (
                    <li
                      key={rule.id}
                      style={{
                        fontSize: '14px',
                        color: 'var(--platform-text-primary)',
                        lineHeight: 1.5,
                      }}
                    >
                      {rule.rule}
                    </li>
                  ))}
              </ul>
            </div>
          </>
        )}

        <div style={dividerStyle} />

        {/* Book Now CTA */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <Link
            to={`/platform/bookings?amenityId=${amenity.id}`}
            style={bookNowBtnStyle}
            aria-label="Book Now"
          >
            Book Now
          </Link>
        </div>
      </div>

      {/* Availability Calendar */}
      <div style={cardStyle}>
        <AvailabilityCalendar amenityId={amenity.id} />
      </div>
    </div>
  );
}
