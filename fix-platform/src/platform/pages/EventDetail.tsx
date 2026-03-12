/**
 * EventDetail page — /platform/events/:id
 *
 * Shows full event detail including:
 * - Title, description, location, date/time, capacity
 * - RSVP button (POST to /api/platform/events/:id/rsvp with status GOING)
 * - Attendee count / capacity indicator
 * - Cancel RSVP option (POST with status NOT_GOING)
 * - Back link to events list
 * - Loading / error / not-found states
 *
 * API:
 *   GET  /api/platform/events/:id         → PlatformEvent
 *   POST /api/platform/events/:id/rsvp    → { id, eventId, userId, status }
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import type { PlatformEvent } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Calendar, MapPin, AlertTriangle } from 'lucide-react';
import '../styles/tokens.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RSVPStatus = 'GOING' | 'MAYBE' | 'NOT_GOING';

interface EventRSVP {
  id: string;
  eventId: string;
  userId: string;
  status: RSVPStatus;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateRange(startIso: string, endIso: string | null): string {
  const startStr = `${formatDate(startIso)} at ${formatTime(startIso)}`;
  if (!endIso) return startStr;

  const start = new Date(startIso);
  const end = new Date(endIso);

  // Same day: show time range
  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  ) {
    return `${formatDate(startIso)}, ${formatTime(startIso)} – ${formatTime(endIso)}`;
  }
  return `${startStr} – ${formatDate(endIso)}`;
}

// ---------------------------------------------------------------------------
// Capacity bar
// ---------------------------------------------------------------------------

interface CapacityBarProps {
  rsvpCount: number;
  capacity: number;
}

function CapacityBar({ rsvpCount, capacity }: CapacityBarProps) {
  const pct = Math.min(100, Math.round((rsvpCount / capacity) * 100));
  const isFull = rsvpCount >= capacity;

  const barColor = isFull
    ? 'var(--platform-status-unavailable, #ef4444)'
    : pct >= 80
    ? '#f59e0b'
    : 'var(--platform-status-available, #22c55e)';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '6px',
          fontSize: '13px',
          color: 'var(--platform-text-secondary)',
        }}
      >
        <span>
          {rsvpCount} / {capacity} attending
        </span>
        {isFull && (
          <span
            style={{
              fontWeight: 700,
              color: 'var(--platform-status-unavailable, #ef4444)',
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Full
          </span>
        )}
      </div>
      <div
        style={{
          height: '6px',
          borderRadius: '999px',
          backgroundColor: 'var(--platform-border)',
          overflow: 'hidden',
        }}
        aria-label={`${pct}% capacity filled`}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            backgroundColor: barColor,
            borderRadius: '999px',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RSVP Section
// ---------------------------------------------------------------------------

interface RSVPSectionProps {
  eventId: string;
  rsvpCount: number;
  capacity: number | null;
  onRSVPChange: (delta: number) => void;
}

function RSVPSection({ eventId, rsvpCount, capacity, onRSVPChange }: RSVPSectionProps) {
  const [myRSVP, setMyRSVP] = useState<RSVPStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitRSVP = useCallback(
    async (status: RSVPStatus) => {
      if (submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const rsvp = await api.post<EventRSVP>(`/api/platform/events/${eventId}/rsvp`, { status });
        const prev = myRSVP;
        setMyRSVP(rsvp.status);
        // Track count change
        if (prev === null && rsvp.status === 'GOING') {
          onRSVPChange(1);
        } else if (prev === 'GOING' && rsvp.status !== 'GOING') {
          onRSVPChange(-1);
        } else if (prev !== 'GOING' && rsvp.status === 'GOING') {
          onRSVPChange(1);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit RSVP');
      } finally {
        setSubmitting(false);
      }
    },
    [eventId, myRSVP, onRSVPChange, submitting]
  );

  const isFull = capacity != null && rsvpCount >= capacity;
  const isGoing = myRSVP === 'GOING';

  const primaryBtnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 24px',
    backgroundColor: isGoing ? '#1a5c5a' : 'transparent',
    color: isGoing ? '#fff' : '#1a5c5a',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: '#1a5c5a',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: submitting ? 'wait' : 'pointer',
    fontFamily: 'inherit',
    opacity: submitting ? 0.7 : 1,
    transition: 'background 0.15s, color 0.15s',
  };

  const cancelBtnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 18px',
    backgroundColor: 'transparent',
    color: 'var(--platform-text-secondary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: submitting ? 'wait' : 'pointer',
    fontFamily: 'inherit',
    opacity: submitting ? 0.7 : 1,
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '20px',
        backgroundColor: 'var(--platform-surface)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'var(--platform-border)',
        borderRadius: '12px',
      }}
    >
      <div
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--platform-text-primary)',
        }}
      >
        RSVP
      </div>

      {isGoing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--platform-status-available, #22c55e)',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            <span aria-hidden="true">✓</span>
            <span>You're going!</span>
          </div>
          <button
            style={cancelBtnStyle}
            onClick={() => submitRSVP('NOT_GOING')}
            disabled={submitting}
            aria-label="Cancel RSVP"
          >
            Cancel RSVP
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {isFull && myRSVP === null && (
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                color: 'var(--platform-status-unavailable, #ef4444)',
                fontWeight: 500,
              }}
            >
              This event is at capacity.
            </p>
          )}
          <button
            style={primaryBtnStyle}
            onClick={() => submitRSVP('GOING')}
            disabled={submitting}
            aria-label="RSVP as Going"
          >
            {submitting ? 'Submitting…' : 'RSVP — Going'}
          </button>
        </div>
      )}

      {error && (
        <p
          style={{
            margin: 0,
            fontSize: '12px',
            color: '#ef4444',
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [event, setEvent] = useState<PlatformEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  // Local RSVP count (updated optimistically)
  const [localRsvpCount, setLocalRsvpCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await api.get<PlatformEvent>(`/api/platform/events/${id}`);
      setEvent(data);
      setLocalRsvpCount(data._count.rsvps);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load event';
      // Check if it's a 404
      if (msg.toLowerCase().includes('not found') || (err as { status?: number }).status === 404) {
        setNotFound(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRSVPChange = useCallback((delta: number) => {
    setLocalRsvpCount((prev) => (prev === null ? null : prev + delta));
  }, []);

  // --- Styles ---

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '760px',
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

  const metaRowStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    marginBottom: '20px',
  };

  const metaItemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
  };

  const metaLabelStyle: CSSProperties = {
    fontWeight: 600,
    color: 'var(--platform-text-primary)',
    marginRight: '2px',
  };

  // --- Loading ---
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
        <LoadingSpinner size="lg" label="Loading event..." />
      </div>
    );
  }

  // --- Not found ---
  if (notFound) {
    return (
      <div style={pageStyle}>
        <button style={backBtnStyle} onClick={() => navigate('/platform/events')}>
          <span>←</span>
          <span>Back to events</span>
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
          <Calendar size={48} color="#888" />
          <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--platform-text-primary)' }}>
            Event not found
          </h2>
          <p style={{ margin: 0, color: 'var(--platform-text-secondary)', fontSize: '14px' }}>
            This event may have been removed or is no longer available.
          </p>
        </div>
      </div>
    );
  }

  // --- Error ---
  if (error) {
    return (
      <div style={pageStyle}>
        <button style={backBtnStyle} onClick={() => navigate('/platform/events')}>
          <span>←</span>
          <span>Back to events</span>
        </button>
        <div style={errorStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{error}
          <button style={retryBtnStyle} onClick={load} aria-label="Retry">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!event) return null;

  const rsvpCount = localRsvpCount ?? event._count.rsvps;

  return (
    <div style={pageStyle}>
      {/* Back button */}
      <button style={backBtnStyle} onClick={() => navigate('/platform/events')}>
        <span>←</span>
        <span>Back to events</span>
      </button>

      {/* Main card */}
      <div style={cardStyle}>
        {/* Badges row */}
        {event.isRecurring && (
          <div style={{ marginBottom: '12px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#1a5c5a',
                backgroundColor: 'rgba(26, 92, 90, 0.08)',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: '#1a5c5a',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Recurring
            </span>
          </div>
        )}

        {/* Title */}
        <h1
          style={{
            margin: '0 0 20px',
            fontSize: '26px',
            fontWeight: 700,
            color: 'var(--platform-text-primary)',
            lineHeight: 1.3,
          }}
        >
          {event.title}
        </h1>

        {/* Meta rows */}
        <div style={metaRowStyle}>
          {/* Date/time */}
          <div style={metaItemStyle}>
            <Calendar size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span>{formatDateRange(event.startTime, event.endTime)}</span>
          </div>

          {/* Location */}
          {event.location && (
            <div style={metaItemStyle}>
              <MapPin size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span style={metaLabelStyle}>Location:</span>
              <span>{event.location}</span>
            </div>
          )}
        </div>

        {/* Description */}
        {event.description && (
          <p
            style={{
              margin: '0 0 20px',
              fontSize: '15px',
              color: 'var(--platform-text-primary)',
              lineHeight: 1.7,
            }}
          >
            {event.description}
          </p>
        )}

        {/* Divider */}
        <div
          style={{
            height: '1px',
            backgroundColor: 'var(--platform-border)',
            marginBottom: '20px',
          }}
        />

        {/* Attendees + capacity */}
        <div style={{ marginBottom: '8px' }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--platform-text-primary)',
              marginBottom: '10px',
            }}
          >
            Attendees
          </div>
          {event.capacity != null ? (
            <CapacityBar rsvpCount={rsvpCount} capacity={event.capacity} />
          ) : (
            <div
              style={{
                fontSize: '13px',
                color: 'var(--platform-text-secondary)',
              }}
            >
              {rsvpCount} {rsvpCount === 1 ? 'person' : 'people'} attending
            </div>
          )}
        </div>
      </div>

      {/* RSVP section */}
      {event.id && (
        <RSVPSection
          eventId={event.id}
          rsvpCount={rsvpCount}
          capacity={event.capacity}
          onRSVPChange={handleRSVPChange}
        />
      )}
    </div>
  );
}
