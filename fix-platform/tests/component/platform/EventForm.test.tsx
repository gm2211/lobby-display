/**
 * EventForm component tests — RED/BLUE TDD
 *
 * Tests cover:
 * - Create mode: renders empty form at /platform/events/new
 * - Edit mode: loads data at /platform/events/:id/edit
 * - Validates required fields (title, description, startTime)
 * - Submits create (POST /api/platform/events)
 * - Submits edit (PUT /api/platform/events/:id)
 * - Handles API errors with inline messages
 * - Cancel navigation back to events list
 * - Loading spinner while fetching in edit mode
 * - isRecurring checkbox toggles recurrenceRule field visibility
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EventForm from '../../../src/platform/pages/EventForm';
import type { PlatformEvent } from '../../../src/platform/types';

// --- Helpers ---

const baseEvent: PlatformEvent = {
  id: 'evt-123',
  title: 'Annual BBQ',
  description: 'A great annual event for all residents.',
  location: 'Rooftop',
  startTime: '2026-08-01T18:00:00.000Z',
  endTime: '2026-08-01T21:00:00.000Z',
  isRecurring: false,
  recurrenceRule: null,
  capacity: 50,
  imageId: null,
  createdBy: 'user-1',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  _count: { rsvps: 10 },
};

function makeEvent(overrides: Partial<PlatformEvent> = {}): PlatformEvent {
  return { ...baseEvent, ...overrides };
}

function renderCreateForm() {
  return render(
    <MemoryRouter initialEntries={['/platform/events/new']}>
      <Routes>
        <Route path="/platform/events/new" element={<EventForm />} />
        <Route path="/platform/events" element={<div>Events List</div>} />
        <Route path="/platform/events/:id" element={<div data-testid="event-detail">Event Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderEditForm(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/platform/events/${id}/edit`]}>
      <Routes>
        <Route path="/platform/events/:id/edit" element={<EventForm />} />
        <Route path="/platform/events" element={<div>Events List</div>} />
        <Route path="/platform/events/:id" element={<div data-testid="event-detail">Event Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function mockFetchCreate(createdEvent: PlatformEvent = makeEvent()) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes('/csrf')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: 'test-csrf' }),
      } as Response);
    }
    if (opts?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(createdEvent),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(createdEvent),
    } as Response);
  }));
}

function mockFetchEdit(event: PlatformEvent = makeEvent()) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes('/csrf')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: 'test-csrf' }),
      } as Response);
    }
    if (opts?.method === 'PUT') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(event),
      } as Response);
    }
    // GET event by id
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(event),
    } as Response);
  }));
}

function mockFetchError(status = 500, message = 'Server error') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: message,
    json: () => Promise.resolve({ message }),
  } as unknown as Response));
}

// --- Tests ---

describe('EventForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Create mode: renders empty form ---

  it('renders heading for create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByRole('heading', { name: /create event|new event/i })).toBeInTheDocument();
  });

  it('renders title input empty in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
    expect(titleInput.value).toBe('');
  });

  it('renders description textarea empty in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    const descInput = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
    expect(descInput.value).toBe('');
  });

  it('renders location input in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
  });

  it('renders start time input in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByLabelText(/start time/i)).toBeInTheDocument();
  });

  it('renders end time input in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByLabelText(/end time/i)).toBeInTheDocument();
  });

  it('renders capacity input in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByLabelText(/capacity/i)).toBeInTheDocument();
  });

  it('renders isRecurring checkbox in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByLabelText(/recurring/i)).toBeInTheDocument();
  });

  it('renders active checkbox checked by default in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    const activeCheckbox = screen.getByLabelText(/active/i) as HTMLInputElement;
    expect(activeCheckbox.checked).toBe(true);
  });

  it('does not show recurrenceRule field when isRecurring is unchecked', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.queryByLabelText(/recurrence rule/i)).toBeNull();
  });

  it('shows recurrenceRule field when isRecurring is checked', () => {
    mockFetchCreate();
    renderCreateForm();
    const recurringCheckbox = screen.getByLabelText(/recurring/i);
    fireEvent.click(recurringCheckbox);
    expect(screen.getByLabelText(/recurrence rule/i)).toBeInTheDocument();
  });

  it('renders submit button in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByRole('button', { name: /create event|save|submit/i })).toBeInTheDocument();
  });

  it('renders cancel button in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  // --- Validation ---

  it('shows error when title is empty on submit', async () => {
    mockFetchCreate();
    renderCreateForm();

    const submitBtn = screen.getByRole('button', { name: /create event|save|submit/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/title.*required|required.*title/i)).toBeInTheDocument();
    });
  });

  it('shows error when description is empty on submit', async () => {
    mockFetchCreate();
    renderCreateForm();

    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: 'Test Event' } });

    const submitBtn = screen.getByRole('button', { name: /create event|save|submit/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/description.*required|required.*description/i)).toBeInTheDocument();
    });
  });

  it('shows error when start time is empty on submit', async () => {
    mockFetchCreate();
    renderCreateForm();

    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: 'Test Event' } });
    const descInput = screen.getByLabelText(/description/i);
    fireEvent.change(descInput, { target: { value: 'A description' } });

    const submitBtn = screen.getByRole('button', { name: /create event|save|submit/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/start time.*required|required.*start/i)).toBeInTheDocument();
    });
  });

  // --- Create submission ---

  it('submits create form with POST to /api/platform/events', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeEvent({ id: 'evt-new' })) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeEvent()) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCreateForm();

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'New Event Title' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Event description here.' } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '2026-09-01T10:00' } });

    fireEvent.click(screen.getByRole('button', { name: /create event|save|submit/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([u, o]: [unknown, RequestInit | undefined]) =>
          String(u).includes('/api/platform/events') && o?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('navigates to event detail after successful create', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeEvent({ id: 'evt-new' })) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeEvent()) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCreateForm();

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'New Event Title' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Event description here.' } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '2026-09-01T10:00' } });

    fireEvent.click(screen.getByRole('button', { name: /create event|save|submit/i }));

    await waitFor(() => {
      expect(screen.getByTestId('event-detail')).toBeInTheDocument();
    });
  });

  // --- Edit mode: loads data ---

  it('shows loading spinner while fetching event in edit mode', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    renderEditForm('evt-123');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders heading for edit mode', async () => {
    mockFetchEdit(makeEvent({ id: 'evt-123', title: 'Annual BBQ' }));
    renderEditForm('evt-123');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /edit event/i })).toBeInTheDocument();
    });
  });

  it('populates title input with existing value in edit mode', async () => {
    mockFetchEdit(makeEvent({ id: 'evt-123', title: 'Annual BBQ' }));
    renderEditForm('evt-123');

    await waitFor(() => {
      const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
      expect(titleInput.value).toBe('Annual BBQ');
    });
  });

  it('populates description with existing value in edit mode', async () => {
    mockFetchEdit(makeEvent({ id: 'evt-123', description: 'An amazing event' }));
    renderEditForm('evt-123');

    await waitFor(() => {
      const descInput = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
      expect(descInput.value).toBe('An amazing event');
    });
  });

  it('populates location with existing value in edit mode', async () => {
    mockFetchEdit(makeEvent({ id: 'evt-123', location: 'Rooftop' }));
    renderEditForm('evt-123');

    await waitFor(() => {
      const locationInput = screen.getByLabelText(/location/i) as HTMLInputElement;
      expect(locationInput.value).toBe('Rooftop');
    });
  });

  it('populates capacity with existing value in edit mode', async () => {
    mockFetchEdit(makeEvent({ id: 'evt-123', capacity: 50 }));
    renderEditForm('evt-123');

    await waitFor(() => {
      const capacityInput = screen.getByLabelText(/capacity/i) as HTMLInputElement;
      expect(capacityInput.value).toBe('50');
    });
  });

  it('shows recurrenceRule field in edit mode when isRecurring is true', async () => {
    mockFetchEdit(makeEvent({ id: 'evt-123', isRecurring: true, recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO' }));
    renderEditForm('evt-123');

    await waitFor(() => {
      expect(screen.getByLabelText(/recurrence rule/i)).toBeInTheDocument();
    });
  });

  it('populates recurrenceRule with existing value in edit mode', async () => {
    mockFetchEdit(makeEvent({ id: 'evt-123', isRecurring: true, recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO' }));
    renderEditForm('evt-123');

    await waitFor(() => {
      const ruleInput = screen.getByLabelText(/recurrence rule/i) as HTMLInputElement;
      expect(ruleInput.value).toBe('FREQ=WEEKLY;BYDAY=MO');
    });
  });

  // --- Edit submission ---

  it('submits edit form with PUT to /api/platform/events/:id', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeEvent({ id: 'evt-123' })) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeEvent({ id: 'evt-123' })) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditForm('evt-123');

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    });

    // Update title
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Updated Title' } });

    fireEvent.click(screen.getByRole('button', { name: /save|update|submit/i }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([u, o]: [unknown, RequestInit | undefined]) =>
          String(u).includes('/api/platform/events/evt-123') && o?.method === 'PUT'
      );
      expect(putCall).toBeTruthy();
    });
  });

  it('navigates to event detail after successful edit', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeEvent({ id: 'evt-123' })) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeEvent({ id: 'evt-123' })) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditForm('evt-123');

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save|update|submit/i }));

    await waitFor(() => {
      expect(screen.getByTestId('event-detail')).toBeInTheDocument();
    });
  });

  // --- Error handling ---

  it('shows error message when create API fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Server Error',
          json: () => Promise.resolve({ message: 'Failed to create event' }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeEvent()) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCreateForm();

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Event' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Test description' } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '2026-09-01T10:00' } });

    fireEvent.click(screen.getByRole('button', { name: /create event|save|submit/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows error message when edit API fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Server Error',
          json: () => Promise.resolve({ message: 'Failed to update event' }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeEvent({ id: 'evt-123' })) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditForm('evt-123');

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save|update|submit/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows error message when fetch event fails in edit mode', async () => {
    mockFetchError(404, 'Event not found');
    renderEditForm('nonexistent');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // --- Cancel navigation ---

  it('navigates back to events list when cancel is clicked in create mode', async () => {
    mockFetchCreate();
    renderCreateForm();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.getByText('Events List')).toBeInTheDocument();
    });
  });

  it('navigates back to events list when cancel is clicked in edit mode', async () => {
    mockFetchEdit();
    renderEditForm('evt-123');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.getByText('Events List')).toBeInTheDocument();
    });
  });
});
