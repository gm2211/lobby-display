/**
 * VisitorRegistration component tests (TDD)
 *
 * Tests cover:
 * - Register expected visitor form (name, date/time, purpose/notes)
 * - My visitors list (upcoming + past, with status)
 * - Access code display for each visitor
 * - Cancel visit action
 * - Loading/error/empty states
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VisitorRegistration from '../../../src/platform/pages/VisitorRegistration';
import type { Visitor } from '../../../src/platform/types';

// --- Helpers ---

function makeVisitor(overrides: Partial<Visitor> = {}, index = 0): Visitor {
  return {
    id: `visitor-${index + 1}`,
    hostId: 'user-1',
    guestName: `Guest ${index + 1}`,
    guestEmail: null,
    guestPhone: null,
    purpose: 'Social visit',
    expectedDate: '2025-09-15T14:00:00Z',
    accessCode: 'ABC123',
    status: 'EXPECTED',
    notes: null,
    createdAt: '2025-09-01T10:00:00Z',
    updatedAt: '2025-09-01T10:00:00Z',
    ...overrides,
  };
}

function makeVisitors(count: number, overrides: Partial<Visitor> = {}): Visitor[] {
  return Array.from({ length: count }, (_, i) => makeVisitor(overrides, i));
}

function mockFetchSuccess(visitors: Visitor[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(visitors),
    statusText: 'OK',
  } as unknown as Response);
}

function mockFetchError(message = 'Internal Server Error') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ message }),
    statusText: message,
  } as unknown as Response);
}

// --- Tests ---

describe('VisitorRegistration', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // --- Loading state ---

  it('shows loading spinner while fetching', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<VisitorRegistration />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Page structure ---

  it('renders page heading', async () => {
    mockFetchSuccess([]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/visitor/i);
  });

  // --- Registration form ---

  it('renders visitor registration form', async () => {
    mockFetchSuccess([]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-form')).toBeInTheDocument();
    });
  });

  it('has guest name input', async () => {
    mockFetchSuccess([]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('guest-name-input')).toBeInTheDocument();
    });
  });

  it('has expected date input', async () => {
    mockFetchSuccess([]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('expected-date-input')).toBeInTheDocument();
    });
  });

  it('has purpose input', async () => {
    mockFetchSuccess([]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('purpose-input')).toBeInTheDocument();
    });
  });

  it('has notes input', async () => {
    mockFetchSuccess([]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('notes-input')).toBeInTheDocument();
    });
  });

  it('has register submit button', async () => {
    mockFetchSuccess([]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-submit')).toBeInTheDocument();
    });
  });

  // --- Form validation ---

  it('shows validation error when submitting empty form', async () => {
    mockFetchSuccess([]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-submit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('visitor-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toBeInTheDocument();
    });
  });

  it('shows validation error when guest name is missing', async () => {
    mockFetchSuccess([]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-submit')).toBeInTheDocument();
    });

    // Fill date but not name
    fireEvent.change(screen.getByTestId('expected-date-input'), {
      target: { value: '2025-09-15T14:00' },
    });
    fireEvent.click(screen.getByTestId('visitor-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('form-error').textContent).toMatch(/name/i);
  });

  it('shows validation error when date is missing', async () => {
    mockFetchSuccess([]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-submit')).toBeInTheDocument();
    });

    // Fill name but not date
    fireEvent.change(screen.getByTestId('guest-name-input'), {
      target: { value: 'John Visitor' },
    });
    fireEvent.click(screen.getByTestId('visitor-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('form-error').textContent).toMatch(/date/i);
  });

  // --- Visitors list ---

  it('renders visitors list section', async () => {
    mockFetchSuccess([makeVisitor()]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('visitors-list')).toBeInTheDocument();
    });
  });

  it('renders visitor cards for each visitor', async () => {
    const visitors = [makeVisitor({}, 0), makeVisitor({}, 1)];
    mockFetchSuccess(visitors);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-card-visitor-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('visitor-card-visitor-2')).toBeInTheDocument();
  });

  it('displays guest name in visitor card', async () => {
    mockFetchSuccess([makeVisitor({ guestName: 'Alice Smith' })]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });
  });

  it('shows empty state when no visitors', async () => {
    mockFetchSuccess([]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByText(/no visitor/i)).toBeInTheDocument();
    });
  });

  // --- Access code ---

  it('displays access code for each visitor', async () => {
    mockFetchSuccess([makeVisitor({ accessCode: 'XYZ789' })]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('access-code-visitor-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('access-code-visitor-1').textContent).toContain('XYZ789');
  });

  // --- Status badges ---

  it('renders EXPECTED status badge', async () => {
    mockFetchSuccess([makeVisitor({ status: 'EXPECTED' })]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-EXPECTED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-EXPECTED').textContent).toMatch(/expected/i);
  });

  it('renders CHECKED_IN status badge', async () => {
    mockFetchSuccess([makeVisitor({ status: 'CHECKED_IN' })]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-CHECKED_IN')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-CHECKED_IN').textContent).toMatch(/checked.?in/i);
  });

  it('renders CHECKED_OUT status badge', async () => {
    mockFetchSuccess([makeVisitor({ status: 'CHECKED_OUT' })]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-CHECKED_OUT')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-CHECKED_OUT').textContent).toMatch(/checked.?out/i);
  });

  it('renders CANCELLED status badge', async () => {
    mockFetchSuccess([makeVisitor({ status: 'CANCELLED' })]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-CANCELLED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-CANCELLED').textContent).toMatch(/cancelled/i);
  });

  // --- Cancel action ---

  it('shows cancel button for EXPECTED visitors', async () => {
    mockFetchSuccess([makeVisitor({ id: 'v-1', status: 'EXPECTED' })]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('cancel-visit-v-1')).toBeInTheDocument();
    });
  });

  it('does not show cancel button for CANCELLED visitors', async () => {
    mockFetchSuccess([makeVisitor({ id: 'v-2', status: 'CANCELLED' })]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-card-v-2')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('cancel-visit-v-2')).toBeNull();
  });

  it('does not show cancel button for CHECKED_IN visitors', async () => {
    mockFetchSuccess([makeVisitor({ id: 'v-3', status: 'CHECKED_IN' })]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-card-v-3')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('cancel-visit-v-3')).toBeNull();
  });

  it('calls PUT endpoint when cancel is clicked', async () => {
    const visitor = makeVisitor({ id: 'v-10', status: 'EXPECTED' });
    const fetchMock = vi.fn()
      // Initial GET
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([visitor]) })
      // CSRF token fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) })
      // PUT call
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...visitor, status: 'CANCELLED' }) })
      // Refetch GET
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ ...visitor, status: 'CANCELLED' }]) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('cancel-visit-v-10')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('cancel-visit-v-10'));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'PUT'
      );
      expect(putCall).toBeTruthy();
    });
  });

  // --- Upcoming vs Past sections ---

  it('separates upcoming and past visitors', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 2).toISOString(); // 2 days from now
    const pastDate = new Date(Date.now() - 86400000 * 2).toISOString();  // 2 days ago
    const visitors = [
      makeVisitor({ id: 'future-1', expectedDate: futureDate, status: 'EXPECTED' }, 0),
      makeVisitor({ id: 'past-1', expectedDate: pastDate, status: 'CHECKED_OUT' }, 1),
    ];
    mockFetchSuccess(visitors);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('upcoming-section')).toBeInTheDocument();
    });
    expect(screen.getByTestId('past-section')).toBeInTheDocument();
  });

  // --- Error state ---

  it('shows error message when fetch fails', async () => {
    mockFetchError('Something went wrong');

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // --- Successful registration ---

  it('calls POST endpoint when form is submitted with valid data', async () => {
    const fetchMock = vi.fn()
      // Initial GET
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      // CSRF token fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) })
      // POST call
      .mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve(makeVisitor()) })
      // Refetch GET
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([makeVisitor()]) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-form')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('guest-name-input'), {
      target: { value: 'Test Visitor' },
    });
    fireEvent.change(screen.getByTestId('expected-date-input'), {
      target: { value: '2025-09-15T14:00' },
    });
    fireEvent.click(screen.getByTestId('visitor-submit'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'POST'
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('resets form after successful submission', async () => {
    const fetchMock = vi.fn()
      // Initial GET
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      // CSRF token fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) })
      // POST call
      .mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve(makeVisitor()) })
      // Refetch GET
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([makeVisitor()]) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-form')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('guest-name-input'), {
      target: { value: 'Test Visitor' },
    });
    fireEvent.change(screen.getByTestId('expected-date-input'), {
      target: { value: '2025-09-15T14:00' },
    });
    fireEvent.click(screen.getByTestId('visitor-submit'));

    await waitFor(() => {
      expect((screen.getByTestId('guest-name-input') as HTMLInputElement).value).toBe('');
    });
  });

  // --- Date formatting ---

  it('formats expected date in visitor card', async () => {
    mockFetchSuccess([makeVisitor({ expectedDate: '2025-09-15T14:00:00Z' })]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-card-visitor-1')).toBeInTheDocument();
    });

    // Should show a formatted date string — not raw ISO
    const card = screen.getByTestId('visitor-card-visitor-1');
    expect(card.textContent).toMatch(/sep/i);
  });

  // --- Optional fields ---

  it('displays purpose when present', async () => {
    mockFetchSuccess([makeVisitor({ purpose: 'Birthday party' })]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByText(/birthday party/i)).toBeInTheDocument();
    });
  });

  it('has optional email input in form', async () => {
    mockFetchSuccess([]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('guest-email-input')).toBeInTheDocument();
    });
  });

  it('has optional phone input in form', async () => {
    mockFetchSuccess([]);

    render(<VisitorRegistration />);

    await waitFor(() => {
      expect(screen.getByTestId('guest-phone-input')).toBeInTheDocument();
    });
  });
});
