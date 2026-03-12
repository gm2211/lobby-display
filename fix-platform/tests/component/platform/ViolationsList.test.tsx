/**
 * ViolationsList component tests.
 *
 * Tests cover:
 * - Renders list of violations
 * - Status badges with correct colors
 * - Severity indicators
 * - Filter controls (status, category, unit)
 * - Pagination (load more)
 * - Loading state
 * - Empty state
 * - Error state
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ViolationsList from '../../../src/platform/pages/ViolationsList';
import type { Violation } from '../../../src/platform/types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// --- Helpers ---

function makeViolation(overrides: Partial<Violation> = {}, index = 0): Violation {
  return {
    id: index + 1,
    unitNumber: `${index + 1}A`,
    category: 'Noise',
    description: 'Loud music after midnight',
    status: 'OPEN',
    severity: 'MEDIUM',
    fineAmount: null,
    dueDate: null,
    issuedAt: '2025-06-15T10:00:00Z',
    resolvedAt: null,
    createdAt: '2025-06-15T10:00:00Z',
    updatedAt: '2025-06-15T10:00:00Z',
    ...overrides,
  };
}

function makeViolations(count: number, overrides: Partial<Violation> = {}): Violation[] {
  return Array.from({ length: count }, (_, i) => makeViolation(overrides, i));
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

describe('ViolationsList', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockNavigate.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // --- Rendering ---

  it('renders table headers when violations exist', async () => {
    mockFetchSuccess({ items: makeViolations(2), nextCursor: undefined });

    renderWithRouter(<ViolationsList />);

    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });

    // Check table column headers via th elements
    const table = screen.getByRole('table', { name: 'Violations list' });
    expect(table).toBeInTheDocument();
    const headers = table.querySelectorAll('th');
    const headerTexts = Array.from(headers).map(th => th.textContent?.trim());
    expect(headerTexts).toContain('Unit');
    expect(headerTexts).toContain('Category');
    expect(headerTexts).toContain('Status');
    expect(headerTexts).toContain('Severity');
    expect(headerTexts).toContain('Date');
    expect(headerTexts).toContain('Description');
  });

  it('renders violations in a table', async () => {
    const violations = makeViolations(3);
    mockFetchSuccess({ items: violations, nextCursor: undefined });

    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByText('1A')).toBeInTheDocument();
    });

    expect(screen.getByText('1A')).toBeInTheDocument();
    expect(screen.getByText('2A')).toBeInTheDocument();
    expect(screen.getByText('3A')).toBeInTheDocument();
    // 3 violations rendered (category "Noise" also appears in the filter dropdown, so use data-testid rows)
    expect(screen.getByTestId('violation-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('violation-row-2')).toBeInTheDocument();
    expect(screen.getByTestId('violation-row-3')).toBeInTheDocument();
  });

  it('shows violation description excerpts', async () => {
    const longDesc = 'A'.repeat(120);
    const violations = [makeViolation({ description: longDesc })];
    mockFetchSuccess({ items: violations });

    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      // Should be truncated to 80 chars + ellipsis
      const descEls = screen.getAllByText((_, el) => el?.textContent?.includes('…') ?? false);
      expect(descEls.length).toBeGreaterThan(0);
    });
  });

  it('shows short description in full', async () => {
    const violations = [makeViolation({ description: 'Short description' })];
    mockFetchSuccess({ items: violations });

    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByText('Short description')).toBeInTheDocument();
    });
  });

  // --- Status badges ---

  it('renders OPEN status badge', async () => {
    mockFetchSuccess({ items: [makeViolation({ status: 'OPEN' })], nextCursor: undefined });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-OPEN')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-OPEN')).toHaveTextContent('Open');
  });

  it('renders ACKNOWLEDGED status badge', async () => {
    mockFetchSuccess({ items: [makeViolation({ status: 'ACKNOWLEDGED' })], nextCursor: undefined });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-ACKNOWLEDGED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-ACKNOWLEDGED')).toHaveTextContent('Acknowledged');
  });

  it('renders RESOLVED status badge', async () => {
    mockFetchSuccess({ items: [makeViolation({ status: 'RESOLVED' })], nextCursor: undefined });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-RESOLVED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-RESOLVED')).toHaveTextContent('Resolved');
  });

  it('renders APPEALED status badge', async () => {
    mockFetchSuccess({ items: [makeViolation({ status: 'APPEALED' })], nextCursor: undefined });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-APPEALED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-APPEALED')).toHaveTextContent('Appealed');
  });

  it('renders DISMISSED status badge', async () => {
    mockFetchSuccess({ items: [makeViolation({ status: 'DISMISSED' })], nextCursor: undefined });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-DISMISSED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-DISMISSED')).toHaveTextContent('Dismissed');
  });

  // --- Severity indicators ---

  it('renders LOW severity indicator', async () => {
    mockFetchSuccess({ items: [makeViolation({ severity: 'LOW' })], nextCursor: undefined });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByTestId('severity-LOW')).toBeInTheDocument();
    });
    expect(screen.getByTestId('severity-LOW')).toHaveTextContent('Low');
  });

  it('renders MEDIUM severity indicator', async () => {
    mockFetchSuccess({ items: [makeViolation({ severity: 'MEDIUM' })], nextCursor: undefined });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByTestId('severity-MEDIUM')).toBeInTheDocument();
    });
  });

  it('renders HIGH severity indicator', async () => {
    mockFetchSuccess({ items: [makeViolation({ severity: 'HIGH' })], nextCursor: undefined });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByTestId('severity-HIGH')).toBeInTheDocument();
    });
    expect(screen.getByTestId('severity-HIGH')).toHaveTextContent('High');
  });

  it('renders CRITICAL severity indicator', async () => {
    mockFetchSuccess({ items: [makeViolation({ severity: 'CRITICAL' })], nextCursor: undefined });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByTestId('severity-CRITICAL')).toBeInTheDocument();
    });
    expect(screen.getByTestId('severity-CRITICAL')).toHaveTextContent('Critical');
  });

  // --- Filters ---

  it('renders status filter dropdown', async () => {
    mockFetchSuccess({ items: [] });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByLabelText('Status')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Status') as HTMLSelectElement;
    expect(select.value).toBe('');

    // Should have all statuses as options
    const options = Array.from(select.options).map(o => o.value);
    expect(options).toContain('OPEN');
    expect(options).toContain('ACKNOWLEDGED');
    expect(options).toContain('RESOLVED');
    expect(options).toContain('APPEALED');
    expect(options).toContain('DISMISSED');
  });

  it('renders category filter dropdown', async () => {
    mockFetchSuccess({ items: [] });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByLabelText('Category')).toBeInTheDocument();
    });
  });

  it('renders unit filter input when no unitNumberFilter prop', async () => {
    mockFetchSuccess({ items: [] });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by unit number')).toBeInTheDocument();
    });
  });

  it('hides unit filter when unitNumberFilter prop is provided', async () => {
    mockFetchSuccess({ items: [] });
    renderWithRouter(<ViolationsList unitNumberFilter="4B" />);

    await waitFor(() => {
      expect(screen.queryByLabelText('Filter by unit number')).toBeNull();
    });
  });

  it('refetches when status filter changes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    } as unknown as Response);
    global.fetch = fetchMock;

    renderWithRouter(<ViolationsList />);

    // Wait for initial fetch
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Change status filter
    const select = screen.getByLabelText('Status');
    fireEvent.change(select, { target: { value: 'OPEN' } });

    // Should trigger a new fetch
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

    renderWithRouter(<ViolationsList />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const select = screen.getByLabelText('Category');
    fireEvent.change(select, { target: { value: 'Noise' } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const lastCall = fetchMock.mock.calls[1][0] as string;
    expect(lastCall).toContain('category=Noise');
  });

  // --- Pagination ---

  it('shows "Load more" button when nextCursor is present', async () => {
    mockFetchSuccess({ items: makeViolations(20), nextCursor: '20' });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument();
    });
  });

  it('does not show "Load more" button when no nextCursor', async () => {
    mockFetchSuccess({ items: makeViolations(3), nextCursor: undefined });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.queryByText('Load more')).toBeNull();
    });
  });

  it('loads more violations when "Load more" is clicked', async () => {
    const page1 = makeViolations(20);
    const page2 = makeViolations(5, { id: 21 } as Partial<Violation>);
    page2.forEach((v, i) => { v.id = 21 + i; v.unitNumber = `${21 + i}B`; });

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

    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Load more'));

    await waitFor(() => {
      expect(screen.queryByText('Load more')).toBeNull();
    });

    // Second fetch should include cursor param
    const secondCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain('cursor=20');
  });

  // --- Loading state ---

  it('shows loading spinner while fetching', () => {
    let resolve!: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));

    renderWithRouter(<ViolationsList />);

    // Should show spinner immediately
    expect(screen.getByRole('status')).toBeInTheDocument();

    // Cleanup
    resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
  });

  // --- Empty state ---

  it('shows empty state when no violations', async () => {
    mockFetchSuccess({ items: [], nextCursor: undefined });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByText('No violations found')).toBeInTheDocument();
    });
  });

  // --- Error state ---

  it('shows error message when fetch fails', async () => {
    mockFetchError(500, 'Something went wrong');
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // --- Row click navigation ---

  it('navigates to violation detail on row click', async () => {
    mockFetchSuccess({ items: [makeViolation({ id: 42 })], nextCursor: undefined });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByTestId('violation-row-42')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('violation-row-42'));
    expect(mockNavigate).toHaveBeenCalledWith('/platform/violations/42');
  });

  // --- Date formatting ---

  it('formats issuedAt date correctly', async () => {
    mockFetchSuccess({
      items: [makeViolation({ issuedAt: '2025-06-15T10:00:00Z' })],
      nextCursor: undefined,
    });
    renderWithRouter(<ViolationsList />);

    await waitFor(() => {
      expect(screen.getByText('Jun 15, 2025')).toBeInTheDocument();
    });
  });
});
