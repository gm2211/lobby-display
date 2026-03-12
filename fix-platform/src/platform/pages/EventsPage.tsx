/**
 * EventsPage — /platform/events
 *
 * Resident-facing events page with two view modes:
 * - Calendar view: CSS Grid monthly calendar with events on their dates
 * - List view: Chronological list of event cards
 *
 * Features:
 * - Toggle between calendar/list views
 * - Filter events by recurring/one-time (using isRecurring field)
 * - RSVP badge showing attendee count
 * - Capacity indicator when capacity is set
 * - Click event navigates to /platform/events/:id
 *
 * API: GET /api/platform/events → PlatformEvent[] (array, not { items })
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Calendar, { type CalendarEvent } from '../components/Calendar';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { Users, Calendar as CalendarIcon, AlertTriangle, MapPin } from 'lucide-react';
import '../styles/tokens.css';
import type { PlatformEvent, EventsListResponse } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const startStr = `${formatDate(startIso)} at ${formatTime(startIso)}`;
  if (!endIso) return startStr;

  const end = new Date(endIso);
  // Same day: just show time range
  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  ) {
    return `${formatDate(startIso)}, ${formatTime(startIso)} – ${formatTime(endIso)}`;
  }
  return `${startStr} – ${formatDate(endIso)}`;
}

function descriptionExcerpt(text: string, maxLen = 140): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

// ---------------------------------------------------------------------------
// EventCard (List view)
// ---------------------------------------------------------------------------

interface EventCardProps {
  event: PlatformEvent;
}

function EventCard({ event }: EventCardProps) {
  const [hovered, setHovered] = useState(false);
  const rsvpCount = event._count.rsvps;
  const isFull = event.capacity != null && rsvpCount >= event.capacity;

  const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '20px',
    backgroundColor: hovered ? 'var(--platform-surface-hover)' : 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hovered ? 'var(--platform-accent)' : 'var(--platform-border)',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
    boxShadow: hovered ? '0 4px 16px rgba(26, 92, 90, 0.15)' : '0 1px 4px rgba(0,0,0,0.07)',
    textDecoration: 'none',
    color: 'inherit',
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '17px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: 0,
    flex: 1,
    lineHeight: 1.3,
  };

  const badgesStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  };

  const rsvpBadgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 600,
    color: isFull ? 'var(--platform-status-unavailable)' : 'var(--platform-status-available)',
    backgroundColor: isFull
      ? 'var(--platform-status-unavailable-bg)'
      : 'var(--platform-status-available-bg)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: isFull
      ? 'var(--platform-status-unavailable)'
      : 'var(--platform-status-available)',
    whiteSpace: 'nowrap' as const,
  };

  const recurringBadgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#1a5c5a',
    backgroundColor: 'rgba(26, 92, 90, 0.08)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#1a5c5a',
    whiteSpace: 'nowrap' as const,
  };

  const metaStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
  };

  const metaItemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '13px',
    color: 'var(--platform-text-secondary)',
  };

  const descStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    lineHeight: 1.5,
    margin: 0,
  };

  return (
    <Link
      to={`/platform/events/${event.id}`}
      style={cardStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={event.title}
      data-testid={`event-card-${event.id}`}
    >
      {/* Header: title + badges */}
      <div style={headerStyle}>
        <h3 style={titleStyle}>{event.title}</h3>
        <div style={badgesStyle}>
          {event.isRecurring && (
            <span style={recurringBadgeStyle} title="Recurring event">
              Recurring
            </span>
          )}
          <span style={rsvpBadgeStyle} title="RSVP count">
            <Users size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }} />
            {rsvpCount}
            {event.capacity != null && ` / ${event.capacity}`}
          </span>
        </div>
      </div>

      {/* Meta: date, location */}
      <div style={metaStyle}>
        <span style={metaItemStyle}>
          <CalendarIcon size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }} />
          {formatDateRange(event.startTime, event.endTime)}
        </span>
        {event.location && (
          <span style={metaItemStyle}>
            <MapPin size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }} />
            {event.location}
          </span>
        )}
      </div>

      {/* Description */}
      {event.description && (
        <p style={descStyle}>{descriptionExcerpt(event.description)}</p>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type ViewMode = 'list' | 'calendar';

export default function EventsPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('list');
  const [filterRecurring, setFilterRecurring] = useState<'' | 'recurring' | 'one-time'>('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/platform/events', { credentials: 'same-origin' });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          msg = body.message || body.error || msg;
        } catch {
          // keep default
        }
        throw new Error(msg);
      }
      // API returns plain array (not { items })
      const raw = await res.json();
      const items: PlatformEvent[] = Array.isArray(raw) ? raw : (raw as EventsListResponse).items ?? [];
      setEvents(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Filtered events
  const filtered = events.filter((e) => {
    if (filterRecurring === 'recurring') return e.isRecurring;
    if (filterRecurring === 'one-time') return !e.isRecurring;
    return true;
  });

  // Events for selected date (calendar view)
  const eventsForSelectedDate = selectedDate
    ? filtered.filter((e) => {
        const d = new Date(e.startTime);
        return (
          d.getFullYear() === selectedDate.getFullYear() &&
          d.getMonth() === selectedDate.getMonth() &&
          d.getDate() === selectedDate.getDate()
        );
      })
    : [];

  // Map platform events to CalendarEvent shape
  const calendarEvents: CalendarEvent[] = filtered.map((e) => ({
    id: e.id,
    title: e.title,
    date: new Date(e.startTime),
    color: e.isRecurring ? '#1a5c5a' : '#00838f',
  }));

  // --- Styles ---

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '1100px',
    margin: '0 auto',
  };

  const headerRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px',
    marginBottom: '24px',
  };

  const titleBlockStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  };

  const titleStyle: CSSProperties = {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: 0,
  };

  const subtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    margin: 0,
  };

  const controlsStyle: CSSProperties = {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    alignItems: 'center',
  };

  const toggleGroupStyle: CSSProperties = {
    display: 'flex',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '8px',
    overflow: 'hidden',
  };

  const toggleBtnStyle = (active: boolean): CSSProperties => ({
    padding: '7px 16px',
    fontSize: '14px',
    fontWeight: active ? 600 : 400,
    backgroundColor: active ? 'var(--platform-accent)' : 'transparent',
    color: active ? '#fff' : 'var(--platform-text-secondary)',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s, color 0.15s',
  });

  const selectStyle: CSSProperties = {
    padding: '7px 14px',
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    outline: 'none',
    minWidth: '140px',
  };

  const listStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
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

  // ---------------------------------------------------------------------------
  // Calendar selected-day panel
  // ---------------------------------------------------------------------------

  const dayPanelStyle: CSSProperties = {
    marginTop: '24px',
    padding: '20px',
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '12px',
  };

  const dayPanelTitleStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: '0 0 16px',
  };

  return (
    <div style={pageStyle}>
      {/* Page header */}
      <div style={headerRowStyle}>
        <div style={titleBlockStyle}>
          <h1 style={titleStyle}>Events</h1>
          <p style={subtitleStyle}>Upcoming community events and activities</p>
        </div>

        {/* Controls: view toggle + filter */}
        <div style={controlsStyle}>
          {/* Recurring filter */}
          <select
            value={filterRecurring}
            onChange={(e) => setFilterRecurring(e.target.value as typeof filterRecurring)}
            style={selectStyle}
            aria-label="Filter by event type"
          >
            <option value="">All Events</option>
            <option value="recurring">Recurring</option>
            <option value="one-time">One-time</option>
          </select>

          {/* View toggle */}
          <div style={toggleGroupStyle} role="group" aria-label="View mode">
            <button
              style={toggleBtnStyle(view === 'list')}
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
            >
              List
            </button>
            <button
              style={toggleBtnStyle(view === 'calendar')}
              onClick={() => setView('calendar')}
              aria-pressed={view === 'calendar'}
            >
              Calendar
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <LoadingSpinner size="lg" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={errorStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{error}
          <button style={retryBtnStyle} onClick={fetchEvents} aria-label="Retry">
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {/* ---- Calendar view ---- */}
          {view === 'calendar' && (
            <div>
              <Calendar
                events={calendarEvents}
                selectedDate={selectedDate}
                onDayClick={(date) => {
                  setSelectedDate((prev) => {
                    if (
                      prev &&
                      prev.getFullYear() === date.getFullYear() &&
                      prev.getMonth() === date.getMonth() &&
                      prev.getDate() === date.getDate()
                    ) {
                      // Deselect same day
                      return undefined;
                    }
                    return date;
                  });
                }}
                onEventClick={(eventId) => {
                  navigate(`/platform/events/${eventId}`);
                }}
              />

              {/* Day detail panel */}
              {selectedDate && (
                <div style={dayPanelStyle}>
                  <h3 style={dayPanelTitleStyle}>
                    Events on {formatDate(selectedDate.toISOString())}
                  </h3>
                  {eventsForSelectedDate.length === 0 ? (
                    <p style={{ color: 'var(--platform-text-secondary)', fontSize: '14px', margin: 0 }}>
                      No events on this day.
                    </p>
                  ) : (
                    <div style={listStyle}>
                      {eventsForSelectedDate.map((e) => (
                        <EventCard key={e.id} event={e} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ---- List view ---- */}
          {view === 'list' && (
            <>
              {filtered.length === 0 ? (
                <EmptyState
                  icon={<CalendarIcon size={22} />}
                  message="No events found"
                  description={
                    filterRecurring
                      ? 'Try changing the event type filter.'
                      : 'No upcoming events at this time.'
                  }
                />
              ) : (
                <div style={listStyle}>
                  {filtered.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
