/**
 * MaintenanceList component tests.
 *
 * Tests cover:
 * - Renders list of maintenance requests
 * - Status badges with correct colors/labels
 * - Priority indicators
 * - Filter controls (status, category, priority)
 * - Pagination (load more)
 * - Loading state
 * - Empty state
 * - Error state
 * - Row click navigation
 * - Date formatting
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MaintenanceList from '../../../src/platform/pages/MaintenanceList';
import type { MaintenanceRequest } from '../../../src/platform/types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// --- Helpers ---

function makeRequest(overrides: Partial<MaintenanceRequest> = {}, index = 0): MaintenanceRequest {
  return {
    id: index + 1,
    title: `Fix leaking pipe ${index + 1}`,
    description: 'Water is leaking from the pipe under the sink',
    category: 'Plumbing',
    priority: 'MEDIUM',
    status: 'OPEN',
    unitNumber: `${index + 1}A`,
    location: null,
    createdAt: '2025-06-15T10:00:00Z',
    updatedAt: '2025-06-15T10:00:00Z',
    ...overrides,
  };
}

function makeRequests(count: number, overrides: Partial<MaintenanceRequest> = {}): MaintenanceRequest[] {
  return Array.from({ length: count }, (_, i) => makeRequest(overrides, i));
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

// --- Tests ---

describe('MaintenanceList', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockNavigate.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // --- Rendering ---

  it('renders table headers when requests exist', async () => {
    mockFetchSuccess({ items: makeRequests(2), nextCursor: undefined });

    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });

    const table = screen.getByRole('table', { name: 'Maintenance requests list' });
    expect(table).toBeInTheDocument();
    const headers = table.querySelectorAll('th');
    const headerTexts = Array.from(headers).map(th => th.textContent?.trim());
    expect(headerTexts).toContain('Title');
    expect(headerTexts).toContain('Category');
    expect(headerTexts).toContain('Status');
    expect(headerTexts).toContain('Priority');
    expect(headerTexts).toContain('Unit');
    expect(headerTexts).toContain('Date');
    expect(headerTexts).toContain('Description');
  });

  it('renders maintenance requests in a table', async () => {
    const requests = makeRequests(3);
    mockFetchSuccess({ items: requests, nextCursor: undefined });

    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByTestId('maintenance-row-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('maintenance-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('maintenance-row-2')).toBeInTheDocument();
    expect(screen.getByTestId('maintenance-row-3')).toBeInTheDocument();
  });

  it('shows request titles', async () => {
    const requests = [makeRequest({ title: 'Broken heating unit' })];
    mockFetchSuccess({ items: requests, nextCursor: undefined });

    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByText('Broken heating unit')).toBeInTheDocument();
    });
  });

  it('shows description excerpts', async () => {
    const longDesc = 'A'.repeat(120);
    const requests = [makeRequest({ description: longDesc })];
    mockFetchSuccess({ items: requests });

    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      const descEls = screen.getAllByText((_, el) => el?.textContent?.includes('…') ?? false);
      expect(descEls.length).toBeGreaterThan(0);
    });
  });

  it('shows short description in full', async () => {
    const requests = [makeRequest({ description: 'Short description text' })];
    mockFetchSuccess({ items: requests });

    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByText('Short description text')).toBeInTheDocument();
    });
  });

  // --- Status badges ---

  it('renders OPEN status badge', async () => {
    mockFetchSuccess({ items: [makeRequest({ status: 'OPEN' })], nextCursor: undefined });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-OPEN')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-OPEN')).toHaveTextContent('Open');
  });

  it('renders IN_PROGRESS status badge', async () => {
    mockFetchSuccess({ items: [makeRequest({ status: 'IN_PROGRESS' })], nextCursor: undefined });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-IN_PROGRESS')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-IN_PROGRESS')).toHaveTextContent('In Progress');
  });

  it('renders COMPLETED status badge', async () => {
    mockFetchSuccess({ items: [makeRequest({ status: 'COMPLETED' })], nextCursor: undefined });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-COMPLETED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-COMPLETED')).toHaveTextContent('Completed');
  });

  it('renders CANCELLED status badge', async () => {
    mockFetchSuccess({ items: [makeRequest({ status: 'CANCELLED' })], nextCursor: undefined });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-CANCELLED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-CANCELLED')).toHaveTextContent('Cancelled');
  });

  // --- Priority indicators ---

  it('renders LOW priority indicator', async () => {
    mockFetchSuccess({ items: [makeRequest({ priority: 'LOW' })], nextCursor: undefined });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByTestId('priority-LOW')).toBeInTheDocument();
    });
    expect(screen.getByTestId('priority-LOW')).toHaveTextContent('Low');
  });

  it('renders MEDIUM priority indicator', async () => {
    mockFetchSuccess({ items: [makeRequest({ priority: 'MEDIUM' })], nextCursor: undefined });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByTestId('priority-MEDIUM')).toBeInTheDocument();
    });
    expect(screen.getByTestId('priority-MEDIUM')).toHaveTextContent('Medium');
  });

  it('renders HIGH priority indicator', async () => {
    mockFetchSuccess({ items: [makeRequest({ priority: 'HIGH' })], nextCursor: undefined });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByTestId('priority-HIGH')).toBeInTheDocument();
    });
    expect(screen.getByTestId('priority-HIGH')).toHaveTextContent('High');
  });

  it('renders URGENT priority indicator', async () => {
    mockFetchSuccess({ items: [makeRequest({ priority: 'URGENT' })], nextCursor: undefined });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByTestId('priority-URGENT')).toBeInTheDocument();
    });
    expect(screen.getByTestId('priority-URGENT')).toHaveTextContent('Urgent');
  });

  // --- Filters ---

  it('renders status filter dropdown', async () => {
    mockFetchSuccess({ items: [] });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByLabelText('Status')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Status') as HTMLSelectElement;
    expect(select.value).toBe('');

    const options = Array.from(select.options).map(o => o.value);
    expect(options).toContain('OPEN');
    expect(options).toContain('IN_PROGRESS');
    expect(options).toContain('COMPLETED');
    expect(options).toContain('CANCELLED');
  });

  it('renders category filter dropdown', async () => {
    mockFetchSuccess({ items: [] });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByLabelText('Category')).toBeInTheDocument();
    });
  });

  it('renders priority filter dropdown', async () => {
    mockFetchSuccess({ items: [] });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByLabelText('Priority')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Priority') as HTMLSelectElement;
    const options = Array.from(select.options).map(o => o.value);
    expect(options).toContain('LOW');
    expect(options).toContain('MEDIUM');
    expect(options).toContain('HIGH');
    expect(options).toContain('URGENT');
  });

  it('refetches when status filter changes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    } as unknown as Response);
    global.fetch = fetchMock;

    renderWithRouter(<MaintenanceList />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const select = screen.getByLabelText('Status');
    fireEvent.change(select, { target: { value: 'OPEN' } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const lastCall = fetchMock.mock.calls[1][0] as string;
    expect(lastCall).toContain('status=OPEN');
  });

  it('refetches when category filter changes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    } as unknown as Response);
    global.fetch = fetchMock;

    renderWithRouter(<MaintenanceList />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const select = screen.getByLabelText('Category');
    fireEvent.change(select, { target: { value: 'Plumbing' } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const lastCall = fetchMock.mock.calls[1][0] as string;
    expect(lastCall).toContain('category=Plumbing');
  });

  it('refetches when priority filter changes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    } as unknown as Response);
    global.fetch = fetchMock;

    renderWithRouter(<MaintenanceList />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const select = screen.getByLabelText('Priority');
    fireEvent.change(select, { target: { value: 'HIGH' } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const lastCall = fetchMock.mock.calls[1][0] as string;
    expect(lastCall).toContain('priority=HIGH');
  });

  // --- Pagination ---

  it('shows "Load more" button when nextCursor is present', async () => {
    mockFetchSuccess({ items: makeRequests(20), nextCursor: '20' });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument();
    });
  });

  it('does not show "Load more" button when no nextCursor', async () => {
    mockFetchSuccess({ items: makeRequests(3), nextCursor: undefined });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.queryByText('Load more')).toBeNull();
    });
  });

  it('loads more requests when "Load more" is clicked', async () => {
    const page1 = makeRequests(20);
    const page2 = makeRequests(5);
    page2.forEach((r, i) => { r.id = 21 + i; r.unitNumber = `${21 + i}B`; });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: page1, nextCursor: '20' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: page2, nextCursor: undefined }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Load more'));

    await waitFor(() => {
      expect(screen.queryByText('Load more')).toBeNull();
    });

    const secondCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain('cursor=20');
  });

  // --- Loading state ---

  it('shows loading spinner while fetching', () => {
    let resolve!: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));

    renderWithRouter(<MaintenanceList />);

    expect(screen.getByRole('status')).toBeInTheDocument();

    resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
  });

  // --- Empty state ---

  it('shows empty state when no requests', async () => {
    mockFetchSuccess({ items: [], nextCursor: undefined });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByText('No maintenance requests found')).toBeInTheDocument();
    });
  });

  // --- Error state ---

  it('shows error message when fetch fails', async () => {
    mockFetchError(500, 'Something went wrong');
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // --- Row click navigation ---

  it('navigates to detail page on row click', async () => {
    mockFetchSuccess({ items: [makeRequest({ id: 42 })], nextCursor: undefined });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByTestId('maintenance-row-42')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('maintenance-row-42'));
    expect(mockNavigate).toHaveBeenCalledWith('/platform/maintenance/42');
  });

  // --- Date formatting ---

  it('formats createdAt date correctly', async () => {
    mockFetchSuccess({
      items: [makeRequest({ createdAt: '2025-06-15T10:00:00Z' })],
      nextCursor: undefined,
    });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByText('Jun 15, 2025')).toBeInTheDocument();
    });
  });

  // --- Unit number ---

  it('shows unit number in monospace', async () => {
    mockFetchSuccess({ items: [makeRequest({ unitNumber: '4B' })], nextCursor: undefined });
    renderWithRouter(<MaintenanceList />);

    await waitFor(() => {
      expect(screen.getByText('4B')).toBeInTheDocument();
    });
  });
});
