/**
 * VisitorCheckIn component tests.
 *
 * Tests cover:
 * - Search bar (by access code or name, debounced)
 * - Today's expected visitors list (name, host, unit, time, status)
 * - Check-in / check-out action buttons
 * - Visitor log history table
 * - Loading / error / empty states
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import VisitorCheckIn from '../../../src/platform/pages/VisitorCheckIn';
import type { Visitor, VisitorLog } from '../../../src/platform/types';

// --- Helpers ---

function makeVisitor(overrides: Partial<Visitor> = {}, index = 0): Visitor {
  return {
    id: `visitor-${index + 1}`,
    hostId: `host-${index + 1}`,
    guestName: `Guest ${index + 1}`,
    guestEmail: `guest${index + 1}@example.com`,
    guestPhone: null,
    purpose: 'Personal visit',
    expectedDate: '2026-02-27T14:00:00.000Z',
    accessCode: `ABC${String(index + 1).padStart(3, '0')}`,
    status: 'EXPECTED',
    notes: null,
    createdAt: '2026-02-27T08:00:00.000Z',
    updatedAt: '2026-02-27T08:00:00.000Z',
    logs: [],
    host: {
      id: `host-${index + 1}`,
      displayName: `Host ${index + 1}`,
      unitNumber: `${index + 1}A`,
    },
    ...overrides,
  };
}

function makeVisitors(count: number, overrides: Partial<Visitor> = {}): Visitor[] {
  return Array.from({ length: count }, (_, i) => makeVisitor(overrides, i));
}

function makeVisitorLog(overrides: Partial<VisitorLog> = {}, index = 0): VisitorLog {
  return {
    id: `log-${index + 1}`,
    visitorId: 'visitor-1',
    action: 'CHECK_IN',
    performedBy: 'performer-1',
    timestamp: '2026-02-27T09:00:00.000Z',
    notes: null,
    ...overrides,
  };
}

function mockFetchSequence(responses: Array<{ ok: boolean; data: unknown }>) {
  let callCount = 0;
  global.fetch = vi.fn().mockImplementation(() => {
    const response = responses[callCount] ?? responses[responses.length - 1];
    callCount++;
    return Promise.resolve({
      ok: response.ok,
      status: response.ok ? 200 : 500,
      json: () => Promise.resolve(response.data),
      statusText: response.ok ? 'OK' : 'Internal Server Error',
    } as unknown as Response);
  });
}

function mockFetchSuccess(visitorsData: Visitor[]) {
  mockFetchSequence([
    { ok: true, data: visitorsData }, // GET /api/platform/visitors/expected
  ]);
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

describe('VisitorCheckIn', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // --- Loading state ---

  it('shows loading spinner while fetching', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<VisitorCheckIn />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Error state ---

  it('shows error message when fetch fails', async () => {
    mockFetchError('Something went wrong');

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // --- Page header ---

  it('renders page title', async () => {
    mockFetchSuccess([]);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByText(/guard desk|visitor check.in/i)).toBeInTheDocument();
    });
  });

  // --- Search bar ---

  it('renders a search input', async () => {
    mockFetchSuccess([]);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-search')).toBeInTheDocument();
    });
  });

  it('search input accepts typing', async () => {
    mockFetchSuccess([]);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-search')).toBeInTheDocument();
    });

    const input = screen.getByTestId('visitor-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ABC123' } });
    expect(input.value).toBe('ABC123');
  });

  // --- Today's visitors list ---

  it('renders expected visitors list after loading', async () => {
    const visitors = makeVisitors(3);
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('visitors-table')).toBeInTheDocument();
    });
  });

  it('renders visitor rows with guest name', async () => {
    const visitors = [
      makeVisitor({ id: 'v1', guestName: 'Alice Johnson' }, 0),
      makeVisitor({ id: 'v2', guestName: 'Bob Smith' }, 1),
    ];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });

  it('renders host name and unit in visitor row', async () => {
    const visitors = [
      makeVisitor({
        id: 'v1',
        host: { id: 'h1', displayName: 'Jane Host', unitNumber: '4B' },
      }),
    ];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByText('Jane Host')).toBeInTheDocument();
    });

    expect(screen.getByText(/4B/)).toBeInTheDocument();
  });

  it('shows expected time in visitor row', async () => {
    const visitors = [
      makeVisitor({ id: 'v1', expectedDate: '2026-02-27T15:30:00.000Z' }),
    ];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-row-v1')).toBeInTheDocument();
    });

    // Should show a time
    const row = screen.getByTestId('visitor-row-v1');
    expect(row.textContent).toMatch(/\d+:\d{2}/);
  });

  it('shows access code in visitor row', async () => {
    const visitors = [makeVisitor({ id: 'v1', accessCode: 'XYZ789' })];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByText('XYZ789')).toBeInTheDocument();
    });
  });

  it('shows EXPECTED status badge', async () => {
    const visitors = [makeVisitor({ id: 'v1', status: 'EXPECTED' })];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-EXPECTED')).toBeInTheDocument();
    });
  });

  it('shows CHECKED_IN status badge', async () => {
    const visitors = [makeVisitor({ id: 'v1', status: 'CHECKED_IN' })];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-CHECKED_IN')).toBeInTheDocument();
    });
  });

  it('shows CHECKED_OUT status badge', async () => {
    const visitors = [makeVisitor({ id: 'v1', status: 'CHECKED_OUT' })];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-CHECKED_OUT')).toBeInTheDocument();
    });
  });

  // --- Empty state ---

  it('shows empty state when no expected visitors', async () => {
    mockFetchSuccess([]);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      const matches = screen.getAllByText(/no.*visitor|no expected/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  // --- Table headers ---

  it('renders table headers', async () => {
    mockFetchSuccess(makeVisitors(1));

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('visitors-table')).toBeInTheDocument();
    });

    const table = screen.getByTestId('visitors-table');
    const headers = table.querySelectorAll('th');
    const texts = Array.from(headers).map(th => th.textContent?.toLowerCase() ?? '');

    expect(texts.some(t => t.includes('guest') || t.includes('name'))).toBe(true);
    expect(texts.some(t => t.includes('host') || t.includes('unit'))).toBe(true);
    expect(texts.some(t => t.includes('time') || t.includes('expected'))).toBe(true);
    expect(texts.some(t => t.includes('status'))).toBe(true);
  });

  // --- Check-in action ---

  it('shows Check In button for EXPECTED visitors', async () => {
    const visitors = [makeVisitor({ id: 'v1', status: 'EXPECTED' })];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('checkin-btn-v1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('checkin-btn-v1')).toHaveTextContent(/check.?in/i);
  });

  it('does not show Check In button for CHECKED_IN visitors', async () => {
    const visitors = [makeVisitor({ id: 'v1', status: 'CHECKED_IN' })];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-row-v1')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('checkin-btn-v1')).toBeNull();
  });

  // --- Check-out action ---

  it('shows Check Out button for CHECKED_IN visitors', async () => {
    const visitors = [makeVisitor({ id: 'v1', status: 'CHECKED_IN' })];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('checkout-btn-v1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('checkout-btn-v1')).toHaveTextContent(/check.?out/i);
  });

  it('does not show Check Out button for EXPECTED visitors', async () => {
    const visitors = [makeVisitor({ id: 'v1', status: 'EXPECTED' })];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-row-v1')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('checkout-btn-v1')).toBeNull();
  });

  // --- Check-in API call ---

  it('calls POST checkin endpoint when Check In is clicked', async () => {
    const visitor = makeVisitor({ id: 'v1', status: 'EXPECTED' });
    const checkedIn = { ...visitor, status: 'CHECKED_IN' };
    let initialLoaded = false;
    // URL-aware mock handles CSRF caching correctly
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) });
      }
      if (!initialLoaded) {
        initialLoaded = true;
        return Promise.resolve({ ok: true, json: () => Promise.resolve([visitor]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([checkedIn]) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('checkin-btn-v1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('checkin-btn-v1'));

    // Wait for async effects to settle after click
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    });

    const postCall = fetchMock.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('checkin')
    );
    expect(postCall).toBeTruthy();
  });

  // --- Check-out API call ---

  it('calls POST checkout endpoint when Check Out is clicked', async () => {
    const visitor = makeVisitor({ id: 'v1', status: 'CHECKED_IN' });
    const checkedOut = { ...visitor, status: 'CHECKED_OUT' };
    let initialLoaded = false;
    // URL-aware mock handles CSRF caching correctly
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) });
      }
      if (!initialLoaded) {
        initialLoaded = true;
        return Promise.resolve({ ok: true, json: () => Promise.resolve([visitor]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([checkedOut]) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('checkout-btn-v1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('checkout-btn-v1'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('checkout')
      );
      expect(postCall).toBeTruthy();
    });

    // Wait for all async effects to settle
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  // --- Search filtering ---

  it('filters visitors by guest name when searching', async () => {
    const visitors = [
      makeVisitor({ id: 'v1', guestName: 'Alice Johnson' }, 0),
      makeVisitor({ id: 'v2', guestName: 'Bob Smith' }, 1),
    ];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-row-v1')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('visitor-search');
    fireEvent.change(searchInput, { target: { value: 'Alice' } });

    await waitFor(() => {
      expect(screen.queryByTestId('visitor-row-v2')).toBeNull();
    });
    expect(screen.getByTestId('visitor-row-v1')).toBeInTheDocument();
  });

  it('filters visitors by access code when searching', async () => {
    const visitors = [
      makeVisitor({ id: 'v1', accessCode: 'AAA111' }, 0),
      makeVisitor({ id: 'v2', accessCode: 'BBB222' }, 1),
    ];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-row-v1')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('visitor-search');
    fireEvent.change(searchInput, { target: { value: 'BBB222' } });

    await waitFor(() => {
      expect(screen.queryByTestId('visitor-row-v1')).toBeNull();
    });
    expect(screen.getByTestId('visitor-row-v2')).toBeInTheDocument();
  });

  it('shows all visitors when search is cleared', async () => {
    const visitors = [
      makeVisitor({ id: 'v1', guestName: 'Alice Johnson' }, 0),
      makeVisitor({ id: 'v2', guestName: 'Bob Smith' }, 1),
    ];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-row-v1')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('visitor-search');
    fireEvent.change(searchInput, { target: { value: 'Alice' } });

    await waitFor(() => {
      expect(screen.queryByTestId('visitor-row-v2')).toBeNull();
    });

    fireEvent.change(searchInput, { target: { value: '' } });

    await waitFor(() => {
      expect(screen.getByTestId('visitor-row-v2')).toBeInTheDocument();
    });
    expect(screen.getByTestId('visitor-row-v1')).toBeInTheDocument();
  });

  // --- Visitor log history ---

  it('renders visitor log history section', async () => {
    const logs: VisitorLog[] = [
      makeVisitorLog({ id: 'log-1', action: 'CHECK_IN', timestamp: '2026-02-27T09:00:00.000Z' }),
      makeVisitorLog({ id: 'log-2', action: 'CHECK_OUT', timestamp: '2026-02-27T11:00:00.000Z' }, 1),
    ];
    const visitors = [makeVisitor({ id: 'v1', logs })];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-log-table')).toBeInTheDocument();
    });
  });

  it('renders log entries in the history table', async () => {
    const logs: VisitorLog[] = [
      makeVisitorLog({ id: 'log-1', visitorId: 'v1', action: 'CHECK_IN', timestamp: '2026-02-27T09:00:00.000Z' }),
    ];
    const visitors = [makeVisitor({ id: 'v1', logs })];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-log-table')).toBeInTheDocument();
    });

    const logTable = screen.getByTestId('visitor-log-table');
    expect(logTable.textContent).toMatch(/check.?in/i);
  });

  it('shows empty state in log table when no logs', async () => {
    const visitors = [makeVisitor({ id: 'v1', logs: [] })];
    mockFetchSuccess(visitors);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('visitor-log-table')).toBeInTheDocument();
    });

    // Should show some no-logs indication
    const logSection = screen.getByTestId('visitor-log-section');
    expect(logSection.textContent).toMatch(/no.*log|no.*activit|no.*histor/i);
  });

  // --- Refresh button ---

  it('renders a refresh button', async () => {
    mockFetchSuccess([]);

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('refresh-btn')).toBeInTheDocument();
    });
  });

  it('calls fetch again when refresh is clicked', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<VisitorCheckIn />);

    await waitFor(() => {
      expect(screen.getByTestId('refresh-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('refresh-btn'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
