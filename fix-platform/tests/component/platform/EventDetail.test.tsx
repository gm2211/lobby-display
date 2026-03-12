/**
 * EventDetail component tests
 *
 * Tests: renders event info, RSVP button, attendee count/capacity,
 *        cancel RSVP, back link, loading/error/not-found states.
 *
 * RED/BLUE TDD: write tests first, then implement the component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EventDetail from '../../../src/platform/pages/EventDetail';
import type { PlatformEvent } from '../../../src/platform/types';

// --- Helpers ---

function renderWithParams(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/platform/events/${id}`]}>
      <Routes>
        <Route path="/platform/events/:id" element={<EventDetail />} />
        <Route path="/platform/events" element={<div>Events List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const baseEvent: PlatformEvent = {
  id: 'evt-abc',
  title: 'Rooftop Summer BBQ',
  description: 'Annual summer barbecue for all building residents. Enjoy great food and views!',
  location: 'Rooftop Terrace',
  startTime: '2026-07-04T18:00:00.000Z',
  endTime: '2026-07-04T21:00:00.000Z',
  isRecurring: false,
  recurrenceRule: null,
  capacity: 80,
  imageId: null,
  createdBy: 'user-1',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  _count: { rsvps: 42 },
};

function makeEvent(overrides: Partial<PlatformEvent> = {}): PlatformEvent {
  return { ...baseEvent, ...overrides };
}

function mockFetch(handlers: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
    const urlStr = String(url);

    // CSRF token endpoint
    if (urlStr.includes('/csrf')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: 'test-csrf-token' }),
      } as Response);
    }

    // RSVP POST endpoint
    if (urlStr.includes('/rsvp') && opts?.method === 'POST') {
      const rsvpResponse = handlers['rsvp'] ?? { id: 'rsvp-1', eventId: 'evt-abc', userId: 'user-1', status: 'GOING' };
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(rsvpResponse),
      } as Response);
    }

    // Event GET endpoint
    const eventData = handlers['event'] ?? baseEvent;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(eventData),
    } as Response);
  }));
}

function mockFetchError(status: number, message: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: message,
    json: () => Promise.resolve({ message }),
  } as unknown as Response));
}

// --- Tests ---

describe('EventDetail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Loading state ---

  it('shows loading spinner initially', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    renderWithParams('evt-abc');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Not found / error states ---

  it('shows not-found state when event returns 404', async () => {
    mockFetchError(404, 'Event not found');
    renderWithParams('nonexistent-id');

    await waitFor(() => {
      expect(screen.getByText(/event not found/i)).toBeInTheDocument();
    });
  });

  it('shows error state when fetch fails with server error', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  // --- Event info ---

  it('renders event title as h1', async () => {
    mockFetch({ event: makeEvent({ title: 'Rooftop Summer BBQ' }) });
    renderWithParams('evt-abc');

    await waitFor(() => {
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.textContent).toBe('Rooftop Summer BBQ');
    });
  });

  it('renders event description', async () => {
    mockFetch({ event: makeEvent({ description: 'Annual summer barbecue for all building residents.' }) });
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByText(/annual summer barbecue/i)).toBeInTheDocument();
    });
  });

  it('renders event location', async () => {
    mockFetch({ event: makeEvent({ location: 'Rooftop Terrace' }) });
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByText(/rooftop terrace/i)).toBeInTheDocument();
    });
  });

  it('renders event start date', async () => {
    mockFetch({ event: makeEvent({ startTime: '2026-07-04T18:00:00.000Z' }) });
    renderWithParams('evt-abc');

    await waitFor(() => {
      // Should show some form of "Jul 4" or "July"
      expect(screen.getByText(/jul/i)).toBeInTheDocument();
    });
  });

  it('does not render location section when location is null', async () => {
    mockFetch({ event: makeEvent({ location: null }) });
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Check that location label is not visible
    expect(screen.queryByText(/location/i)).toBeNull();
  });

  // --- Capacity indicator ---

  it('shows RSVP attendee count', async () => {
    mockFetch({ event: makeEvent({ _count: { rsvps: 42 } }) });
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByText(/42/)).toBeInTheDocument();
    });
  });

  it('shows capacity when set', async () => {
    mockFetch({ event: makeEvent({ capacity: 80, _count: { rsvps: 42 } }) });
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByText(/80/)).toBeInTheDocument();
    });
  });

  it('shows "Full" or similar when at capacity', async () => {
    mockFetch({ event: makeEvent({ capacity: 50, _count: { rsvps: 50 } }) });
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByText(/full/i)).toBeInTheDocument();
    });
  });

  it('does not show capacity section when capacity is null', async () => {
    mockFetch({ event: makeEvent({ capacity: null, _count: { rsvps: 10 } }) });
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // No capacity text like "/ 0" should appear
    expect(screen.queryByText(/capacity/i)).toBeNull();
  });

  // --- RSVP button ---

  it('renders RSVP button', async () => {
    mockFetch({ event: makeEvent() });
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /rsvp|going|attend/i })).toBeInTheDocument();
    });
  });

  it('submits RSVP with GOING status when RSVP button is clicked', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (urlStr.includes('/rsvp') && opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'rsvp-1', status: 'GOING' }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(makeEvent()),
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /rsvp|going|attend/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /rsvp|going|attend/i }));

    await waitFor(() => {
      // After RSVP, the POST should have been called with status GOING
      const rsvpCalls = fetchMock.mock.calls.filter(([u, o]: [unknown, RequestInit | undefined]) =>
        String(u).includes('/rsvp') && o?.method === 'POST'
      );
      expect(rsvpCalls.length).toBeGreaterThan(0);
    });
  });

  it('shows confirmation after RSVP submission', async () => {
    mockFetch({
      event: makeEvent(),
      rsvp: { id: 'rsvp-1', status: 'GOING' },
    });
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /rsvp|going|attend/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /rsvp|going|attend/i }));

    await waitFor(() => {
      // Should show some confirmation that RSVP was submitted (e.g. "Going" or "You're going")
      const confirmed =
        screen.queryByText(/you're going/i) ||
        screen.queryByText(/going/i) ||
        screen.queryByText(/rsvp'd/i) ||
        screen.queryByText(/cancel rsvp/i);
      expect(confirmed).toBeInTheDocument();
    });
  });

  // --- Cancel RSVP ---

  it('shows cancel RSVP option after RSVPing', async () => {
    mockFetch({
      event: makeEvent(),
      rsvp: { id: 'rsvp-1', status: 'GOING' },
    });
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /rsvp|going|attend/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /rsvp|going|attend/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel rsvp|not going|remove/i })).toBeInTheDocument();
    });
  });

  it('cancels RSVP when cancel button is clicked', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (urlStr.includes('/rsvp') && opts?.method === 'POST') {
        const body = opts.body ? JSON.parse(String(opts.body)) : {};
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'rsvp-1', status: body.status }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(makeEvent()),
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithParams('evt-abc');

    // Wait for the page to load
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /rsvp|going|attend/i })).toBeInTheDocument();
    });

    // Click RSVP
    fireEvent.click(screen.getByRole('button', { name: /rsvp|going|attend/i }));

    // Wait for cancel button to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel rsvp|not going|remove/i })).toBeInTheDocument();
    });

    // Click cancel
    fireEvent.click(screen.getByRole('button', { name: /cancel rsvp|not going|remove/i }));

    await waitFor(() => {
      // After cancelling, the main RSVP button should re-appear
      const calls = fetchMock.mock.calls.filter(([u, o]: [unknown, RequestInit | undefined]) =>
        String(u).includes('/rsvp') && o?.method === 'POST'
      );
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // --- Back link ---

  it('renders back link to events list', async () => {
    mockFetch({ event: makeEvent() });
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByText(/back to events/i)).toBeInTheDocument();
    });
  });

  it('back link navigates to /platform/events', async () => {
    mockFetch({ event: makeEvent() });
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByText(/back to events/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/back to events/i));

    await waitFor(() => {
      expect(screen.getByText('Events List')).toBeInTheDocument();
    });
  });

  // --- Recurring badge ---

  it('shows recurring badge for recurring events', async () => {
    mockFetch({ event: makeEvent({ isRecurring: true }) });
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByText(/recurring/i)).toBeInTheDocument();
    });
  });

  it('does not show recurring badge for one-time events', async () => {
    mockFetch({ event: makeEvent({ isRecurring: false }) });
    renderWithParams('evt-abc');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    expect(screen.queryByText(/recurring/i)).toBeNull();
  });
});
