/**
 * MyBookings Page
 *
 * Displays a resident's amenity bookings split into:
 * - Upcoming bookings: future startTime, with cancel action for PENDING/APPROVED/WAITLISTED
 * - Past bookings: past startTime (status: COMPLETED, CANCELLED, REJECTED, etc.)
 *
 * Features:
 * - Status badges for all 6 BookingStatus values
 * - Cancel booking action (PUT /api/platform/bookings/:id/cancel)
 * - Link to new booking flow
 * - Loading / error / empty states
 *
 * ROLE-BASED ACCESS:
 * - All roles see their own bookings (API filters by session user unless MANAGER+)
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import type { Booking, BookingStatus } from '../types';
import { api } from '../../utils/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { CalendarDays, AlertTriangle } from 'lucide-react';
import '../styles/tokens.css';

// --- Status badge config ---

const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; bg: string }> = {
  PENDING:    { label: 'Pending',    color: '#c9921b', bg: '#fff3cd' },
  APPROVED:   { label: 'Approved',   color: '#2d7a47', bg: '#d4edda' },
  REJECTED:   { label: 'Rejected',   color: '#b93040', bg: '#f8d7da' },
  CANCELLED:  { label: 'Cancelled',  color: '#6c757d', bg: '#e9ecef' },
  COMPLETED:  { label: 'Completed',  color: '#1a5f8a', bg: '#d0e8f5' },
  WAITLISTED: { label: 'Waitlisted', color: '#7b5cb0', bg: '#ede8f7' },
};

/** Statuses that allow the user to cancel the booking. */
const CANCELLABLE_STATUSES: BookingStatus[] = ['PENDING', 'APPROVED', 'WAITLISTED'];

// --- Helpers ---

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isUpcoming(booking: Booking): boolean {
  return new Date(booking.startTime) > new Date();
}

// --- Sub-components ---

function StatusBadge({ status }: { status: BookingStatus }) {
  const { label, color, bg } = STATUS_CONFIG[status];
  const style: CSSProperties = {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 600,
    color,
    backgroundColor: bg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color,
    whiteSpace: 'nowrap',
  };
  return (
    <span style={style} data-testid={`booking-status-${status}`}>
      {label}
    </span>
  );
}

interface BookingCardProps {
  booking: Booking;
  onCancel: (id: string) => void;
  cancelling: boolean;
}

function BookingCard({ booking, onCancel, cancelling }: BookingCardProps) {
  const canCancel = CANCELLABLE_STATUSES.includes(booking.status);

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  };

  const amenityNameStyle: CSSProperties = {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--platform-text-primary)',
    marginBottom: '4px',
  };

  const dateStyle: CSSProperties = {
    fontSize: '13px',
    color: 'var(--platform-text-secondary)',
    marginBottom: '8px',
  };

  const notesStyle: CSSProperties = {
    fontSize: '12px',
    color: 'var(--platform-text-secondary)',
    fontStyle: 'italic',
    marginTop: '4px',
  };

  const actionsStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexShrink: 0,
  };

  const cancelBtnStyle: CSSProperties = {
    backgroundColor: 'transparent',
    color: '#b93040',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#b93040',
    borderRadius: '6px',
    padding: '5px 14px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: cancelling ? 'not-allowed' : 'pointer',
    opacity: cancelling ? 0.6 : 1,
    whiteSpace: 'nowrap',
  };

  return (
    <div style={cardStyle} data-testid={`booking-card-${booking.id}`}>
      <div style={{ flex: 1 }}>
        <div style={amenityNameStyle}>{booking.amenity.name}</div>
        <div style={dateStyle}>
          {formatDateTime(booking.startTime)} &ndash; {formatTime(booking.endTime)}
          {booking.amenity.location && (
            <span style={{ marginLeft: '8px', color: 'var(--platform-text-secondary)' }}>
              &bull; {booking.amenity.location}
            </span>
          )}
        </div>
        <StatusBadge status={booking.status} />
        {booking.notes && (
          <div style={notesStyle}>Note: {booking.notes}</div>
        )}
        {booking.cancellationReason && (
          <div style={{ ...notesStyle, marginTop: '6px' }}>
            Reason: {booking.cancellationReason}
          </div>
        )}
      </div>
      <div style={actionsStyle}>
        {canCancel && (
          <button
            style={cancelBtnStyle}
            onClick={() => onCancel(booking.id)}
            disabled={cancelling}
            type="button"
            aria-label={`Cancel booking for ${booking.amenity.name}`}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

interface BookingSectionProps {
  title: string;
  bookings: Booking[];
  emptyMessage: string;
  emptyDescription?: string;
  onCancel: (id: string) => void;
  cancellingId: string | null;
}

function BookingSection({
  title,
  bookings,
  emptyMessage,
  emptyDescription,
  onCancel,
  cancellingId,
}: BookingSectionProps) {
  const sectionTitleStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    marginBottom: '12px',
    marginTop: '0',
  };

  const listStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  };

  return (
    <section style={{ marginBottom: '32px' }}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {bookings.length === 0 ? (
        <EmptyState
          message={emptyMessage}
          description={emptyDescription}
          icon={<CalendarDays size={22} />}
        />
      ) : (
        <div style={listStyle}>
          {bookings.map(booking => (
            <BookingCard
              key={booking.id}
              booking={booking}
              onCancel={onCancel}
              cancelling={cancellingId === booking.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// --- Main page ---

export default function MyBookings() {
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Booking[]>('/api/platform/bookings');
      setAllBookings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const handleRetry = () => {
    setCancelError(null);
    setRetryKey(k => k + 1);
  };

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    setCancelError(null);
    try {
      const updated = await api.put<Booking>(`/api/platform/bookings/${id}/cancel`, {});
      setAllBookings(prev => prev.map(b => (b.id === id ? updated : b)));
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Failed to cancel booking');
    } finally {
      setCancellingId(null);
    }
  };

  // Split into upcoming and past
  const upcomingBookings = allBookings
    .filter(isUpcoming)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const pastBookings = allBookings
    .filter(b => !isUpcoming(b))
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  // --- Styles ---

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '900px',
    margin: '0 auto',
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '28px',
    flexWrap: 'wrap',
    gap: '12px',
  };

  const titleGroupStyle: CSSProperties = {};

  const titleStyle: CSSProperties = {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    marginBottom: '4px',
    marginTop: '0',
  };

  const subtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    margin: '0',
  };

  const newBookingLinkStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'var(--platform-accent, #1a7a78)',
    color: '#fff',
    borderRadius: '8px',
    padding: '8px 18px',
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    whiteSpace: 'nowrap',
  };

  const errorStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    backgroundColor: 'rgba(185, 48, 64, 0.1)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(185, 48, 64, 0.3)',
    borderRadius: '8px',
    color: '#b93040',
    fontSize: '14px',
    marginBottom: '20px',
  };

  const retryBtnStyle: CSSProperties = {
    backgroundColor: 'transparent',
    color: '#b93040',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#b93040',
    borderRadius: '4px',
    padding: '4px 12px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={titleGroupStyle}>
          <h1 style={titleStyle}>My Bookings</h1>
          <p style={subtitleStyle}>Manage your amenity reservations</p>
        </div>
        <a
          href="/platform/bookings/new"
          style={newBookingLinkStyle}
          aria-label="New booking"
        >
          + New Booking
        </a>
      </div>

      {/* Error (page-level fetch error) */}
      {error && (
        <div style={errorStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} aria-hidden="true" />
          <span style={{ flex: 1 }}>{error}</span>
          <button style={retryBtnStyle} onClick={handleRetry} type="button" aria-label="Retry">
            Retry
          </button>
        </div>
      )}

      {/* Cancel error */}
      {cancelError && (
        <div style={errorStyle} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} aria-hidden="true" />
          <span style={{ flex: 1 }}>{cancelError}</span>
          <button
            style={retryBtnStyle}
            onClick={() => setCancelError(null)}
            type="button"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <LoadingSpinner size="lg" />
        </div>
      ) : !error ? (
        <>
          <BookingSection
            title="Upcoming Bookings"
            bookings={upcomingBookings}
            emptyMessage="No upcoming bookings"
            emptyDescription="You have no upcoming reservations. Book an amenity to get started."
            onCancel={handleCancel}
            cancellingId={cancellingId}
          />
          <BookingSection
            title="Past Bookings"
            bookings={pastBookings}
            emptyMessage="No past bookings"
            emptyDescription="Your booking history will appear here."
            onCancel={handleCancel}
            cancellingId={cancellingId}
          />
        </>
      ) : null}
    </div>
  );
}
