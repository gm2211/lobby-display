/**
 * Tests for the PlatformDashboard component.
 *
 * Strategy: mock global.fetch to control what each API call returns,
 * then assert the rendered output matches the expected UI.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PlatformDashboard from '../../src/platform/pages/PlatformDashboard';
import type { PlatformAnnouncement, PlatformBooking, PlatformMaintenanceRequest } from '../../src/platform/pages/PlatformDashboard';
import { ThemeProvider } from '../../src/theme/ThemeContext';

// ---- Auth mock ------------------------------------------------------------

const mockUser = { id: 1, username: 'testuser', role: 'VIEWER' as const };

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, loading: false, login: vi.fn(), logout: vi.fn(), refresh: vi.fn() }),
}));

// ---- Fetch helpers --------------------------------------------------------

function fetchOk(data: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  } as Response);
}

function fetchErr(status: number): Promise<Response> {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ message: 'Server error' }),
  } as Response);
}

// ---- Wrapper --------------------------------------------------------------

function renderDashboard() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <PlatformDashboard />
      </MemoryRouter>
    </ThemeProvider>
  );
}

// ---- Tests ----------------------------------------------------------------

describe('PlatformDashboard', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes('/api/platform/announcements')) return fetchOk([]);
      if (u.includes('/api/platform/bookings')) return fetchOk([]);
      if (u.includes('/api/platform/maintenance')) return fetchOk([]);
      return fetchOk({});
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -- Welcome banner -------------------------------------------------------

  it('renders welcome banner with username', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByTestId('welcome-banner')).toBeInTheDocument();
    });
    const banner = screen.getByTestId('welcome-banner');
    expect(banner.textContent).toContain('testuser');
  });

  it('renders the welcome message from theme', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByTestId('welcome-banner')).toBeInTheDocument());
    const banner = screen.getByTestId('welcome-banner');
    expect(banner.textContent).toBeTruthy();
  });

  // -- Quick actions --------------------------------------------------------

  it('renders 4 quick-action cards', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Pay Rent')).toBeInTheDocument();
    expect(screen.getByLabelText('Book Amenity')).toBeInTheDocument();
    expect(screen.getByLabelText('Submit Request')).toBeInTheDocument();
    expect(screen.getByLabelText('Announcements')).toBeInTheDocument();
  });

  // -- Empty states ---------------------------------------------------------

  it('shows empty state for announcements when list is empty', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('No announcements at this time.')).toBeInTheDocument();
    });
  });

  it('shows empty state for bookings when list is empty', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('No upcoming bookings.')).toBeInTheDocument();
    });
  });

  it('shows empty state for maintenance when list is empty', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('No maintenance requests.')).toBeInTheDocument();
    });
  });

  // -- Data rendering -------------------------------------------------------

  it('renders announcements from API', async () => {
    const announcements: PlatformAnnouncement[] = [
      { id: 1, title: 'Pool Closed', body: 'Pool closed for maintenance', publishedAt: new Date().toISOString() },
      { id: 2, title: 'Gym Open Late', body: 'Extended hours this weekend', publishedAt: new Date().toISOString() },
    ];
    (global.fetch as Mock).mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes('/api/platform/announcements')) return fetchOk(announcements);
      if (u.includes('/api/platform/bookings')) return fetchOk([]);
      if (u.includes('/api/platform/maintenance')) return fetchOk([]);
      return fetchOk({});
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Pool Closed')).toBeInTheDocument();
      expect(screen.getByText('Gym Open Late')).toBeInTheDocument();
    });
    expect(screen.getByText('Pool closed for maintenance')).toBeInTheDocument();
    expect(screen.getByText('Extended hours this weekend')).toBeInTheDocument();
  });

  it('shows only the 3 most recent announcements', async () => {
    const announcements: PlatformAnnouncement[] = [
      { id: 1, title: 'Notice 1', body: '', publishedAt: new Date().toISOString() },
      { id: 2, title: 'Notice 2', body: '', publishedAt: new Date().toISOString() },
      { id: 3, title: 'Notice 3', body: '', publishedAt: new Date().toISOString() },
      { id: 4, title: 'Notice 4', body: '', publishedAt: new Date().toISOString() },
    ];
    (global.fetch as Mock).mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes('/api/platform/announcements')) return fetchOk(announcements);
      if (u.includes('/api/platform/bookings')) return fetchOk([]);
      if (u.includes('/api/platform/maintenance')) return fetchOk([]);
      return fetchOk({});
    });

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Notice 1')).toBeInTheDocument());
    expect(screen.queryByText('Notice 4')).not.toBeInTheDocument();
  });

  it('renders bookings from API', async () => {
    const bookings: PlatformBooking[] = [
      { id: 1, amenity: 'Rooftop Lounge', date: '2026-03-15', timeSlot: '6:00 PM – 8:00 PM', status: 'confirmed' },
    ];
    (global.fetch as Mock).mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes('/api/platform/announcements')) return fetchOk([]);
      if (u.includes('/api/platform/bookings')) return fetchOk(bookings);
      if (u.includes('/api/platform/maintenance')) return fetchOk([]);
      return fetchOk({});
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Rooftop Lounge')).toBeInTheDocument();
    });
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('renders maintenance requests from API', async () => {
    const maintenance: PlatformMaintenanceRequest[] = [
      { id: 1, title: 'Leaking faucet', status: 'in_progress', submittedAt: new Date().toISOString(), unit: '42A' },
    ];
    (global.fetch as Mock).mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes('/api/platform/announcements')) return fetchOk([]);
      if (u.includes('/api/platform/bookings')) return fetchOk([]);
      if (u.includes('/api/platform/maintenance')) return fetchOk(maintenance);
      return fetchOk({});
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Leaking faucet')).toBeInTheDocument();
    });
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  // -- Error states ---------------------------------------------------------

  it('shows error state when announcements fetch fails', async () => {
    (global.fetch as Mock).mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes('/api/platform/announcements')) return fetchErr(500);
      if (u.includes('/api/platform/bookings')) return fetchOk([]);
      if (u.includes('/api/platform/maintenance')) return fetchOk([]);
      return fetchOk({});
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows error state when bookings fetch fails', async () => {
    (global.fetch as Mock).mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes('/api/platform/announcements')) return fetchOk([]);
      if (u.includes('/api/platform/bookings')) return fetchErr(503);
      if (u.includes('/api/platform/maintenance')) return fetchOk([]);
      return fetchOk({});
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows error state when maintenance fetch fails', async () => {
    (global.fetch as Mock).mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes('/api/platform/announcements')) return fetchOk([]);
      if (u.includes('/api/platform/bookings')) return fetchOk([]);
      if (u.includes('/api/platform/maintenance')) return fetchErr(502);
      return fetchOk({});
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // -- Section headings -----------------------------------------------------

  it('renders section titles', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Recent Announcements')).toBeInTheDocument();
    });
    expect(screen.getByText('My Upcoming Bookings')).toBeInTheDocument();
    expect(screen.getByText('Recent Maintenance')).toBeInTheDocument();
  });
});
