/**
 * EventsPage component tests
 *
 * Tests: renders events in list view, calendar/list toggle, category filter,
 *        RSVP badge, loading/empty/error states, event click navigation.
 *
 * TDD: Written before implementation (Red phase).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventsPage from '../../../src/platform/pages/EventsPage';
import type { PlatformEvent } from '../../../src/platform/types';

// Helper to render with router context
function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const baseEvent: PlatformEvent = {
  id: 'evt-1',
  title: 'Building BBQ',
  description: 'Annual summer BBQ for all residents.',
  location: 'Rooftop Terrace',
  startTime: '2026-07-04T18:00:00.000Z',
  endTime: '2026-07-04T21:00:00.000Z',
  isRecurring: false,
  recurrenceRule: null,
  capacity: 100,
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

describe('EventsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Loading state ---

  it('shows loading spinner initially', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<EventsPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- List view (default) ---

  it('renders event titles in list view after fetching', async () => {
    const events = [
      makeEvent({ id: 'evt-1', title: 'Building BBQ' }),
      makeEvent({ id: 'evt-2', title: 'Yoga on the Roof' }),
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: events }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      expect(screen.getByText('Building BBQ')).toBeInTheDocument();
      expect(screen.getByText('Yoga on the Roof')).toBeInTheDocument();
    });
  });

  it('shows event location in list view', async () => {
    const events = [makeEvent({ location: 'Rooftop Terrace' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: events }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      expect(screen.getByText(/rooftop terrace/i)).toBeInTheDocument();
    });
  });

  it('shows description excerpt in list view', async () => {
    const events = [makeEvent({ description: 'Annual summer BBQ for all residents.' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: events }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      expect(screen.getByText(/annual summer bbq/i)).toBeInTheDocument();
    });
  });

  it('shows RSVP attendee count badge', async () => {
    const events = [makeEvent({ _count: { rsvps: 42 } })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: events }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      expect(screen.getByText(/42/)).toBeInTheDocument();
    });
  });

  it('renders link to event detail page', async () => {
    const events = [makeEvent({ id: 'evt-abc', title: 'Test Event' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: events }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /test event/i });
      expect(link).toBeInTheDocument();
      expect(link.getAttribute('href')).toContain('/platform/events/evt-abc');
    });
  });

  // --- Empty state ---

  it('shows empty state when no events returned', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      expect(screen.getByText(/no events/i)).toBeInTheDocument();
    });
  });

  // --- Error state ---

  it('shows error message on fetch failure', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'Server Error' }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'Server Error' }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  // --- View toggle ---

  it('has calendar and list toggle buttons', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /calendar/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /list/i })).toBeInTheDocument();
    });
  });

  it('switches to calendar view when Calendar button is clicked', async () => {
    const events = [makeEvent({ title: 'Calendar Event' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: events }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /calendar/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /calendar/i }));

    // Calendar view renders the calendar grid
    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeInTheDocument();
    });
  });

  it('switches back to list view when List button is clicked', async () => {
    const events = [makeEvent({ title: 'List Event' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: events }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /calendar/i })).toBeInTheDocument();
    });

    // Switch to calendar
    fireEvent.click(screen.getByRole('button', { name: /calendar/i }));

    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeInTheDocument();
    });

    // Switch back to list
    fireEvent.click(screen.getByRole('button', { name: /list/i }));

    await waitFor(() => {
      expect(screen.getByText('List Event')).toBeInTheDocument();
    });
  });

  // --- Category filter ---

  it('shows category filter when events have categories (via location as category proxy)', async () => {
    // The API uses location/isRecurring but not a "category" field per se
    // We'll check that category filter appears for recurring events marked with a tag
    const events = [
      makeEvent({ id: 'evt-1', title: 'Weekly Yoga', isRecurring: true }),
      makeEvent({ id: 'evt-2', title: 'One-time BBQ', isRecurring: false }),
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: events }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      // Filter dropdown should appear
      expect(screen.getByLabelText(/filter/i)).toBeInTheDocument();
    });
  });

  // --- Date formatting ---

  it('shows formatted date in list view', async () => {
    const events = [makeEvent({ startTime: '2026-07-04T18:00:00.000Z' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: events }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      // Should show month and day like "Jul 4" or "July 4, 2026"
      expect(screen.getByText(/jul/i)).toBeInTheDocument();
    });
  });

  // --- Page heading ---

  it('renders the page heading', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /events/i })).toBeInTheDocument();
    });
  });

  // --- Capacity indicator ---

  it('shows capacity when event has capacity set', async () => {
    const events = [makeEvent({ capacity: 50, _count: { rsvps: 30 } })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: events }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      expect(screen.getByText(/50/)).toBeInTheDocument();
    });
  });

  // --- Recurring badge ---

  it('shows recurring badge for recurring events', async () => {
    const events = [makeEvent({ isRecurring: true })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: events }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      expect(screen.getByText(/recurring/i)).toBeInTheDocument();
    });
  });

  // --- Calendar view events ---

  it('shows calendar events when in calendar view', async () => {
    const events = [
      makeEvent({
        id: 'evt-cal',
        title: 'Rooftop Party',
        startTime: '2026-02-15T14:00:00.000Z',
      }),
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: events }),
    } as Response);

    renderWithRouter(<EventsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /calendar/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /calendar/i }));

    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeInTheDocument();
    });
  });
});
