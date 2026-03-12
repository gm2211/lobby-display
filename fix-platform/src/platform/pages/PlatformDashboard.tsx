/**
 * PlatformDashboard -- resident portal landing page.
 *
 * Clean 2-column layout:
 *   Left (wider): Recent Announcements + Upcoming Events
 *   Right (narrower): Quick Actions + My Bookings + Open Requests
 *
 * Data from:
 *   /api/platform/announcements?limit=3
 *   /api/platform/events?limit=3
 *   /api/platform/bookings?limit=2
 *   /api/platform/maintenance?limit=5
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import {
  CreditCard,
  Dumbbell,
  Wrench,
  Megaphone,
  CalendarDays,
} from 'lucide-react';
import type { Announcement, PlatformEvent, Booking, MaintenanceRequest, MaintenanceListResponse, EventsListResponse } from '../types';

// ---- Helpers ---------------------------------------------------------------

function timeAgoShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function bookingStatusColor(status: Booking['status']): string {
  switch (status) {
    case 'APPROVED': return '#2d7a47';
    case 'PENDING': return '#c9921b';
    case 'WAITLISTED': return '#1a5f8a';
    case 'CANCELLED': return '#888';
    case 'REJECTED': return '#c62828';
    case 'COMPLETED': return '#888';
    default: return '#888';
  }
}

function bookingStatusLabel(status: Booking['status']): string {
  switch (status) {
    case 'APPROVED': return 'Confirmed';
    case 'PENDING': return 'Pending';
    case 'WAITLISTED': return 'Waitlisted';
    case 'CANCELLED': return 'Cancelled';
    case 'REJECTED': return 'Rejected';
    case 'COMPLETED': return 'Completed';
    default: return status;
  }
}

function maintenanceStatusColor(status: MaintenanceRequest['status']): string {
  switch (status) {
    case 'OPEN': return '#1a5f8a';
    case 'IN_PROGRESS': return '#c9921b';
    case 'COMPLETED': return '#2d7a47';
    case 'CANCELLED': return '#888';
    default: return '#888';
  }
}

function maintenanceStatusLabel(status: MaintenanceRequest['status']): string {
  switch (status) {
    case 'OPEN': return 'Open';
    case 'IN_PROGRESS': return 'In Progress';
    case 'COMPLETED': return 'Completed';
    case 'CANCELLED': return 'Cancelled';
    default: return status;
  }
}

// ---- Sub-components --------------------------------------------------------

function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={skeletonStyles.row}>
          <div style={{ ...skeletonStyles.bar, width: '60%' }} />
          <div style={{ ...skeletonStyles.bar, width: '30%', marginTop: '6px', opacity: 0.5 }} />
        </div>
      ))}
    </>
  );
}

const skeletonStyles: Record<string, React.CSSProperties> = {
  row: {
    paddingTop: '12px',
    paddingBottom: '12px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: '#f0f0f0',
  },
  bar: {
    height: '12px',
    background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
    borderRadius: '6px',
  },
};

function ErrorMsg({ message }: { message: string }) {
  return (
    <p style={{
      margin: 0,
      fontSize: '13px',
      color: '#c62828',
      padding: '12px 0',
    }} role="alert">
      {message}
    </p>
  );
}

function EmptyMsg({ message }: { message: string }) {
  return (
    <p style={{
      margin: 0,
      fontSize: '13px',
      color: '#999',
      padding: '16px 0',
      textAlign: 'center',
    }}>
      {message}
    </p>
  );
}

interface CardProps {
  title: string;
  viewAllTo?: string;
  children: React.ReactNode;
}

function DashCard({ title, viewAllTo, children }: CardProps) {
  return (
    <div style={cardStyles.card}>
      <div style={cardStyles.header}>
        <h2 style={cardStyles.title}>{title}</h2>
        {viewAllTo && (
          <Link to={viewAllTo} style={cardStyles.viewAll}>
            View all &rsaquo;
          </Link>
        )}
      </div>
      <div style={cardStyles.body}>{children}</div>
    </div>
  );
}

const cardStyles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#ebebeb',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  title: {
    margin: 0,
    fontSize: '11px',
    fontWeight: 700,
    color: '#aaa',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.07em',
  },
  viewAll: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    fontSize: '12px',
    color: '#1a5c5a',
    textDecoration: 'none',
    fontWeight: 500,
  },
  body: {},
};

// ---- Quick action button ---------------------------------------------------

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  to: string;
}

function QuickAction({ icon, label, to }: QuickActionProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to={to}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...qaStyles.btn,
        ...(hovered ? qaStyles.btnHover : {}),
      }}
      aria-label={label}
    >
      <span style={qaStyles.icon}>{icon}</span>
      <span style={qaStyles.label}>{label}</span>
    </Link>
  );
}

const qaStyles: Record<string, React.CSSProperties> = {
  btn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '11px 14px',
    background: '#fafafa',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#ebebeb',
    borderRadius: '8px',
    textDecoration: 'none',
    color: '#333',
    fontSize: '13px',
    fontWeight: 500,
    transition: 'border-color 0.15s, background 0.15s',
    cursor: 'pointer',
  },
  btnHover: {
    borderColor: '#1a5c5a',
    background: '#f0f9f8',
    color: '#1a5c5a',
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    color: '#1a5c5a',
    flexShrink: 0,
  },
  label: {
    flex: 1,
  },
};

// ---- Main dashboard --------------------------------------------------------

export default function PlatformDashboard() {
  const { user } = useAuth();
  const theme = useTheme();

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null);

  // Events
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  // Bookings
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState<string | null>(null);

  // Maintenance
  const [maintenance, setMaintenance] = useState<MaintenanceRequest[]>([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/platform/announcements?limit=3', { credentials: 'same-origin' })
      .then(async res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data: Announcement[] | { items: Announcement[] }) =>
        setAnnouncements(Array.isArray(data) ? data.slice(0, 3) : data.items.slice(0, 3))
      )
      .catch((err: unknown) =>
        setAnnouncementsError(err instanceof Error ? err.message : 'Failed to load')
      )
      .finally(() => setAnnouncementsLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/platform/events?limit=3', { credentials: 'same-origin' })
      .then(async res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data: PlatformEvent[] | EventsListResponse) =>
        setEvents(Array.isArray(data) ? data.slice(0, 3) : data.items.slice(0, 3))
      )
      .catch((err: unknown) =>
        setEventsError(err instanceof Error ? err.message : 'Failed to load')
      )
      .finally(() => setEventsLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/platform/bookings?limit=2', { credentials: 'same-origin' })
      .then(async res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data: Booking[] | { items: Booking[] }) =>
        setBookings(Array.isArray(data) ? data.slice(0, 2) : data.items.slice(0, 2))
      )
      .catch((err: unknown) =>
        setBookingsError(err instanceof Error ? err.message : 'Failed to load')
      )
      .finally(() => setBookingsLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/platform/maintenance?limit=5', { credentials: 'same-origin' })
      .then(async res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data: MaintenanceRequest[] | MaintenanceListResponse) =>
        setMaintenance(Array.isArray(data) ? data.slice(0, 5) : data.items.slice(0, 5))
      )
      .catch((err: unknown) =>
        setMaintenanceError(err instanceof Error ? err.message : 'Failed to load')
      )
      .finally(() => setMaintenanceLoading(false));
  }, []);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Count open maintenance requests
  const openRequests = maintenance.filter(m => m.status === 'OPEN' || m.status === 'IN_PROGRESS');

  return (
    <div style={styles.page}>
      {/* Welcome banner */}
      <div style={styles.welcome} data-testid="welcome-banner">
        <div>
          <h1 style={styles.welcomeHeading}>
            {greeting}{user ? `, ${user.username}` : ''}
          </h1>
          <p style={styles.welcomeSub}>{today} &middot; {theme.welcomeMessage}</p>
        </div>
      </div>

      {/* 2-column content grid */}
      <div style={styles.grid}>
        {/* LEFT column */}
        <div style={styles.leftCol}>
          {/* Recent Announcements */}
          <DashCard title="Recent Announcements" viewAllTo="/platform/announcements">
            {announcementsLoading && <LoadingRows count={3} />}
            {announcementsError && <ErrorMsg message={`Could not load announcements (${announcementsError})`} />}
            {!announcementsLoading && !announcementsError && announcements.length === 0 && (
              <EmptyMsg message="No announcements yet." />
            )}
            {!announcementsLoading && !announcementsError && announcements.map((a, idx) => (
              <Link
                key={a.id}
                to={`/platform/announcements/${a.id}`}
                style={{
                  ...listStyles.item,
                  ...(idx === announcements.length - 1 ? listStyles.itemLast : {}),
                  textDecoration: 'none',
                  display: 'block',
                }}
              >
                <div style={listStyles.row}>
                  <div style={listStyles.iconWrap}>
                    <Megaphone size={13} color="#1a5c5a" />
                  </div>
                  <div style={listStyles.textBlock}>
                    <span style={listStyles.title}>{a.title}</span>
                    {a.body && (
                      <span style={listStyles.excerpt}>
                        {a.body.length > 80 ? `${a.body.slice(0, 80)}...` : a.body}
                      </span>
                    )}
                  </div>
                  <span style={listStyles.meta}>{timeAgoShort(a.createdAt)}</span>
                </div>
              </Link>
            ))}
          </DashCard>

          {/* Upcoming Events */}
          <DashCard title="Upcoming Events" viewAllTo="/platform/events">
            {eventsLoading && <LoadingRows count={3} />}
            {eventsError && <ErrorMsg message={`Could not load events (${eventsError})`} />}
            {!eventsLoading && !eventsError && events.length === 0 && (
              <EmptyMsg message="No upcoming events." />
            )}
            {!eventsLoading && !eventsError && events.map((e, idx) => (
              <Link
                key={e.id}
                to={`/platform/events/${e.id}`}
                style={{
                  ...listStyles.item,
                  ...(idx === events.length - 1 ? listStyles.itemLast : {}),
                  textDecoration: 'none',
                  display: 'block',
                }}
              >
                <div style={listStyles.row}>
                  <div style={listStyles.dateBlock}>
                    <span style={listStyles.dateDay}>
                      {new Date(e.startTime).getDate()}
                    </span>
                    <span style={listStyles.dateMon}>
                      {new Date(e.startTime).toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                  </div>
                  <div style={listStyles.textBlock}>
                    <span style={listStyles.title}>{e.title}</span>
                    <span style={listStyles.meta}>
                      {formatEventDate(e.startTime)}
                      {e.startTime ? ` \u00b7 ${formatEventTime(e.startTime)}` : ''}
                      {e.location ? ` \u00b7 ${e.location}` : ''}
                    </span>
                  </div>
                  <span style={{ color: '#ccc', fontSize: '16px', flexShrink: 0 }}>&rsaquo;</span>
                </div>
              </Link>
            ))}
          </DashCard>
        </div>

        {/* RIGHT column */}
        <div style={styles.rightCol}>
          {/* Quick Actions */}
          <DashCard title="Quick Actions">
            <div style={styles.quickActions}>
              <QuickAction
                icon={<CreditCard size={16} color="#1a5c5a" />}
                label="Pay Rent"
                to="/platform/payments"
              />
              <QuickAction
                icon={<Dumbbell size={16} color="#1a5c5a" />}
                label="Book Amenity"
                to="/platform/bookings/new"
              />
              <QuickAction
                icon={<Wrench size={16} color="#1a5c5a" />}
                label="Submit Request"
                to="/platform/maintenance/new"
              />
              <QuickAction
                icon={<Megaphone size={16} color="#1a5c5a" />}
                label="Announcements"
                to="/platform/announcements"
              />
            </div>
          </DashCard>

          {/* My Bookings */}
          <DashCard title="My Bookings" viewAllTo="/platform/bookings">
            {bookingsLoading && <LoadingRows count={2} />}
            {bookingsError && <ErrorMsg message={`Could not load bookings (${bookingsError})`} />}
            {!bookingsLoading && !bookingsError && bookings.length === 0 && (
              <EmptyMsg message="No upcoming bookings." />
            )}
            {!bookingsLoading && !bookingsError && bookings.map((b, idx) => (
              <div
                key={b.id}
                style={{
                  ...listStyles.item,
                  ...(idx === bookings.length - 1 ? listStyles.itemLast : {}),
                }}
              >
                <div style={listStyles.row}>
                  <div style={listStyles.iconWrap}>
                    <CalendarDays size={13} color="#1a5c5a" />
                  </div>
                  <div style={listStyles.textBlock}>
                    <span style={listStyles.title}>{b.amenity?.name ?? 'Amenity'}</span>
                    <span style={listStyles.meta}>
                      {b.startTime ? formatDate(b.startTime) : ''}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: bookingStatusColor(b.status),
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.05em',
                  }}>
                    {bookingStatusLabel(b.status)}
                  </span>
                </div>
              </div>
            ))}
          </DashCard>

          {/* Open Requests */}
          <DashCard title="Maintenance Requests" viewAllTo="/platform/maintenance">
            {maintenanceLoading && <LoadingRows count={2} />}
            {maintenanceError && <ErrorMsg message={`Could not load requests (${maintenanceError})`} />}
            {!maintenanceLoading && !maintenanceError && openRequests.length === 0 && (
              <EmptyMsg message="No open requests." />
            )}
            {!maintenanceLoading && !maintenanceError && openRequests.slice(0, 3).map((m, idx) => (
              <Link
                key={m.id}
                to={`/platform/maintenance/${m.id}`}
                style={{
                  ...listStyles.item,
                  ...(idx === Math.min(openRequests.length, 3) - 1 ? listStyles.itemLast : {}),
                  textDecoration: 'none',
                  display: 'block',
                }}
              >
                <div style={listStyles.row}>
                  <div style={listStyles.iconWrap}>
                    <Wrench size={13} color="#1a5c5a" />
                  </div>
                  <div style={listStyles.textBlock}>
                    <span style={listStyles.title}>{m.title}</span>
                    <span style={listStyles.meta}>{timeAgoShort(m.createdAt)}</span>
                  </div>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: maintenanceStatusColor(m.status),
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.05em',
                  }}>
                    {maintenanceStatusLabel(m.status)}
                  </span>
                </div>
              </Link>
            ))}
            {!maintenanceLoading && !maintenanceError && openRequests.length > 3 && (
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#999', textAlign: 'center' }}>
                + {openRequests.length - 3} more
              </p>
            )}
          </DashCard>
        </div>
      </div>
    </div>
  );
}

// ---- Styles ----------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: '28px 32px',
    maxWidth: '1100px',
  },
  welcome: {
    marginBottom: '28px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  welcomeHeading: {
    margin: '0 0 4px',
    fontSize: '26px',
    fontWeight: 700,
    color: '#1a2b2b',
    letterSpacing: '-0.02em',
  },
  welcomeSub: {
    margin: 0,
    fontSize: '14px',
    color: '#999',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 340px',
    gap: '20px',
    alignItems: 'start',
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  quickActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
};

const listStyles: Record<string, React.CSSProperties> = {
  item: {
    paddingTop: '11px',
    paddingBottom: '11px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: '#f0f0f0',
  },
  itemLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  iconWrap: {
    width: '28px',
    height: '28px',
    background: '#f5f5f5',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dateBlock: {
    width: '32px',
    textAlign: 'center' as const,
    flexShrink: 0,
    background: '#f0f9f8',
    borderRadius: '6px',
    padding: '4px 2px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  dateDay: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#1a5c5a',
    lineHeight: 1,
  },
  dateMon: {
    fontSize: '9px',
    fontWeight: 600,
    color: '#1a5c5a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  title: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#222',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  excerpt: {
    fontSize: '12px',
    color: '#888',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  meta: {
    fontSize: '12px',
    color: '#aaa',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
};
