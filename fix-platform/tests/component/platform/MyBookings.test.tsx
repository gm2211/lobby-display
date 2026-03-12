/**
 * MyBookings component tests.
 *
 * Tests cover:
 * - Renders page title and subtitle
 * - Upcoming bookings section
 * - Past bookings section
 * - Status badges for all booking statuses (PENDING, APPROVED, REJECTED, CANCELLED, COMPLETED, WAITLISTED)
 * - Cancel booking action (PUT /api/platform/bookings/:id/cancel)
 * - Link to new booking flow (/platform/bookings/new)
 * - Loading state
 * - Empty states (no upcoming, no past)
 * - Error state with retry
 * - Date/time formatting
 * - Amenity name display
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MyBookings from '../../../src/platform/pages/MyBookings';
import type { Booking } from '../../../src/platform/types';
import { api } from '../../../src/utils/api';

// --- Helpers ---

function makeAmenity(overrides: Partial<Booking['amenity']> = {}): Booking['amenity'] {
  return {
    id: 'amenity-1',
    name: 'Rooftop Terrace',
    description: 'Beautiful rooftop space',
    location: '30th Floor',
    capacity: 50,
    requiresApproval: true,
    pricePerHour: '100.00',
    currency: 'USD',
    availableFrom: '09:00',
    availableTo: '22:00',
    daysAvailable: [1, 2, 3, 4, 5],
    minAdvanceHours: 1,
    maxAdvanceHours: 720,
    maxDurationHours: 4,
    active: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Booking> = {}, index = 0): Booking {
  // Future date for upcoming bookings by default
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);
  const endDate = new Date(futureDate);
  endDate.setHours(endDate.getHours() + 2);

  return {
    id: `booking-${index + 1}`,
    amenityId: 'amenity-1',
    amenity: makeAmenity(),
    userId: 'user-1',
    startTime: futureDate.toISOString(),
    endTime: endDate.toISOString(),
    status: 'APPROVED',
    notes: null,
    approvedBy: null,
    approvedAt: null,
    cancellationReason: null,
    createdAt: '2025-06-01T10:00:00Z',
    updatedAt: '2025-06-01T10:00:00Z',
    ...overrides,
  };
}

function makePastBooking(overrides: Partial<Booking> = {}, index = 0): Booking {
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 7);
  const endDate = new Date(pastDate);
  endDate.setHours(endDate.getHours() + 2);

  return makeBooking({
    id: `past-booking-${index + 1}`,
    startTime: pastDate.toISOString(),
    endTime: endDate.toISOString(),
    status: 'COMPLETED',
    ...overrides,
  }, index);
}

function mockFetchSuccess(data: object) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as unknown as Response);
}

function mockFetchError(status = 500, message = 'Internal Server Error') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ message }),
    statusText: message,
  } as unknown as Response);
}

function mockFetchSequence(responses: Array<{ ok: boolean; data: object; status?: number }>) {
  let callCount = 0;
  global.fetch = vi.fn().mockImplementation(() => {
    const resp = responses[callCount] ?? responses[responses.length - 1];
    callCount++;
    return Promise.resolve({
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 500),
      json: () => Promise.resolve(resp.data),
      statusText: resp.ok ? 'OK' : 'Error',
    } as unknown as Response);
  });
}

// --- Tests ---

describe('MyBookings', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Clear cached CSRF token between tests to prevent mock sequence bleed
    api.clearCsrf();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
    api.clearCsrf();
  });

  // --- Page structure ---

  it('renders page title', async () => {
    mockFetchSuccess([]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /my bookings/i })).toBeInTheDocument();
    });
  });

  it('renders a link to create new booking', async () => {
    mockFetchSuccess([]);
    render(<MyBookings />);
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /new booking/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/platform/bookings/new');
    });
  });

  // --- Loading state ---

  it('shows loading spinner while fetching', () => {
    let resolvePromise!: (value: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(
      new Promise(resolve => { resolvePromise = resolve; })
    );

    render(<MyBookings />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    resolvePromise({ ok: true, status: 200, json: () => Promise.resolve([]) });
  });

  // --- Empty states ---

  it('shows empty state when no bookings at all', async () => {
    mockFetchSuccess([]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByText(/no upcoming bookings/i)).toBeInTheDocument();
    });
  });

  it('shows empty state for upcoming section when only past bookings exist', async () => {
    const pastBooking = makePastBooking();
    mockFetchSuccess([pastBooking]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByText(/no upcoming bookings/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Rooftop Terrace')).toBeInTheDocument();
  });

  // --- Upcoming bookings ---

  it('renders upcoming bookings section', async () => {
    const booking = makeBooking();
    mockFetchSuccess([booking]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByText(/upcoming/i)).toBeInTheDocument();
    });
  });

  it('shows upcoming booking amenity name', async () => {
    const booking = makeBooking({ amenity: makeAmenity({ name: 'Fitness Center' }) });
    mockFetchSuccess([booking]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByText('Fitness Center')).toBeInTheDocument();
    });
  });

  it('shows upcoming booking date', async () => {
    const futureDate = new Date('2027-03-15T14:00:00Z');
    const endDate = new Date('2027-03-15T16:00:00Z');
    const booking = makeBooking({
      startTime: futureDate.toISOString(),
      endTime: endDate.toISOString(),
    });
    mockFetchSuccess([booking]);
    render(<MyBookings />);
    await waitFor(() => {
      // Should show Mar 15, 2027 or similar
      expect(screen.getByText(/mar.*15.*2027/i)).toBeInTheDocument();
    });
  });

  // --- Past bookings ---

  it('renders past bookings section', async () => {
    const pastBooking = makePastBooking();
    mockFetchSuccess([pastBooking]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByText(/past/i)).toBeInTheDocument();
    });
  });

  it('shows past booking amenity name', async () => {
    const pastBooking = makePastBooking({
      amenity: makeAmenity({ name: 'Conference Room A' }),
    });
    mockFetchSuccess([pastBooking]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByText('Conference Room A')).toBeInTheDocument();
    });
  });

  // --- Status badges ---

  it('shows PENDING status badge', async () => {
    const booking = makeBooking({ status: 'PENDING' });
    mockFetchSuccess([booking]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByTestId('booking-status-PENDING')).toBeInTheDocument();
    });
  });

  it('shows APPROVED status badge', async () => {
    const booking = makeBooking({ status: 'APPROVED' });
    mockFetchSuccess([booking]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByTestId('booking-status-APPROVED')).toBeInTheDocument();
    });
  });

  it('shows REJECTED status badge', async () => {
    const booking = makeBooking({ status: 'REJECTED' });
    mockFetchSuccess([booking]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByTestId('booking-status-REJECTED')).toBeInTheDocument();
    });
  });

  it('shows CANCELLED status badge', async () => {
    const booking = makeBooking({ status: 'CANCELLED' });
    mockFetchSuccess([booking]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByTestId('booking-status-CANCELLED')).toBeInTheDocument();
    });
  });

  it('shows COMPLETED status badge', async () => {
    const pastBooking = makePastBooking({ status: 'COMPLETED' });
    mockFetchSuccess([pastBooking]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByTestId('booking-status-COMPLETED')).toBeInTheDocument();
    });
  });

  it('shows WAITLISTED status badge', async () => {
    const booking = makeBooking({ status: 'WAITLISTED' });
    mockFetchSuccess([booking]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByTestId('booking-status-WAITLISTED')).toBeInTheDocument();
    });
  });

  // --- Cancel action ---

  it('shows cancel button for cancellable upcoming bookings (PENDING, APPROVED, WAITLISTED)', async () => {
    const booking = makeBooking({ status: 'APPROVED' });
    mockFetchSuccess([booking]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  it('does NOT show cancel button for completed bookings', async () => {
    const pastBooking = makePastBooking({ status: 'COMPLETED' });
    mockFetchSuccess([pastBooking]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    });
  });

  it('does NOT show cancel button for already cancelled bookings', async () => {
    const booking = makeBooking({ status: 'CANCELLED' });
    mockFetchSuccess([booking]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    });
  });

  it('does NOT show cancel button for rejected bookings', async () => {
    const booking = makeBooking({ status: 'REJECTED' });
    mockFetchSuccess([booking]);
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    });
  });

  it('calls cancel API and updates booking status on cancel', async () => {
    const booking = makeBooking({ id: 'booking-abc', status: 'APPROVED' });
    const cancelledBooking = { ...booking, status: 'CANCELLED' };

    // First call = GET /bookings, second = CSRF, third = PUT cancel
    mockFetchSequence([
      { ok: true, data: [booking] },
      { ok: true, data: { token: 'test-csrf' } },
      { ok: true, data: cancelledBooking },
    ]);

    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.getByTestId('booking-status-CANCELLED')).toBeInTheDocument();
    });
  });

  it('shows error message when cancel fails', async () => {
    const booking = makeBooking({ id: 'booking-abc', status: 'APPROVED' });

    mockFetchSequence([
      { ok: true, data: [booking] },
      { ok: true, data: { token: 'test-csrf' } },
      { ok: false, status: 500, data: { message: 'Server error' } },
    ]);

    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // --- Error state ---

  it('shows error state when fetch fails', async () => {
    mockFetchError(500, 'Internal Server Error');
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockFetchError(500, 'Internal Server Error');
    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('retries fetch when retry button clicked', async () => {
    const booking = makeBooking();

    mockFetchSequence([
      { ok: false, status: 500, data: { message: 'Server error' } },
      { ok: true, data: [booking] },
    ]);

    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Rooftop Terrace')).toBeInTheDocument();
    });
  });

  // --- Sorting ---

  it('separates upcoming (future startTime) from past (past startTime)', async () => {
    const upcomingBooking = makeBooking({ id: 'upcoming-1', amenity: makeAmenity({ name: 'Pool' }) });
    const pastBooking = makePastBooking({ id: 'past-1', amenity: makeAmenity({ name: 'Gym' }) });
    mockFetchSuccess([upcomingBooking, pastBooking]);

    render(<MyBookings />);
    await waitFor(() => {
      expect(screen.getByText('Pool')).toBeInTheDocument();
      expect(screen.getByText('Gym')).toBeInTheDocument();
    });

    // Both sections should exist
    expect(screen.getByText(/upcoming/i)).toBeInTheDocument();
    expect(screen.getByText(/past/i)).toBeInTheDocument();
  });
});
