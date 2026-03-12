/**
 * SearchPage component tests
 *
 * Tests: renders search bar, debounced search, groups results by type,
 *        snippet highlighting, loading/empty states, URL param sync, click-through links.
 *
 * NOTE: We use DEBOUNCE_TEST_DELAY=10 via the component's exported constant override,
 * and use real timers to avoid async issues with fake timers + promise resolution.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SearchPage from '../../../src/platform/pages/SearchPage';

// Helper to render with router context and optional initial URL
function renderWithRouter(ui: React.ReactElement, initialPath = '/search') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/search" element={ui} />
      </Routes>
    </MemoryRouter>
  );
}

interface SearchResult {
  id: number;
  entityType: string;
  entityId: number;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 1,
    entityType: 'Announcement',
    entityId: 101,
    title: 'Test Result',
    body: 'This is the body of the test result',
    url: '/platform/announcements/101',
    createdAt: '2025-01-15T10:00:00.000Z',
    updatedAt: '2025-01-15T10:00:00.000Z',
    ...overrides,
  };
}

function mockFetchSuccess(results: SearchResult[], total = results.length) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ results, total }),
  } as Response);
}

function mockFetchError(status = 500) {
  vi.mocked(fetch).mockResolvedValue({
    ok: false,
    status,
    statusText: 'Internal Server Error',
    json: async () => ({ error: 'Server Error' }),
  } as Response);
}

// Helper: wait for debounce + fetch to complete
async function waitForSearch() {
  // Wait for debounce timer (>300ms) and fetch resolution
  await new Promise(r => setTimeout(r, 50));
  await waitFor(() => {
    // Wait until loading spinner is gone (fetch done)
    expect(screen.queryByRole('status', { name: /searching/i })).not.toBeInTheDocument();
  }, { timeout: 5000 });
}

describe('SearchPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Rendering ---

  it('renders the page title', () => {
    renderWithRouter(<SearchPage />);
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  it('renders a search input', () => {
    renderWithRouter(<SearchPage />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('renders search input with placeholder', () => {
    renderWithRouter(<SearchPage />);
    const input = screen.getByRole('searchbox');
    expect(input).toHaveAttribute('placeholder');
  });

  // --- Initial state ---

  it('does not fetch on initial render when no query', () => {
    renderWithRouter(<SearchPage />);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows initial empty state when no query entered', () => {
    renderWithRouter(<SearchPage />);
    expect(screen.getByText(/enter a search term/i)).toBeInTheDocument();
  });

  // --- URL param sync: initial query from URL ---

  it('reads initial query from URL search param', async () => {
    mockFetchSuccess([makeResult({ title: 'URL Loaded Result' })]);
    renderWithRouter(<SearchPage />, '/search?q=initial');

    await waitFor(() => {
      const input = screen.getByRole('searchbox') as HTMLInputElement;
      expect(input.value).toBe('initial');
    });
  });

  it('fetches results when initial URL has a query param', async () => {
    mockFetchSuccess([makeResult({ title: 'URL Loaded Result' })]);
    renderWithRouter(<SearchPage />, '/search?q=initial');

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('q=initial'),
        expect.anything()
      );
    }, { timeout: 2000 });
  });

  // --- Loading state ---

  it('shows loading state while fetching', async () => {
    // Never resolves to keep in loading state
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<SearchPage />, '/search?q=test');

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  // --- Debounced search ---

  it('fetches after debounce when user types', async () => {
    mockFetchSuccess([]);
    renderWithRouter(<SearchPage />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'hello' } });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('q=hello'),
        expect.anything()
      );
    }, { timeout: 2000 });
  });

  // --- Results rendering ---

  it('shows results after successful search', async () => {
    mockFetchSuccess([makeResult({ title: 'Found Announcement' })]);
    renderWithRouter(<SearchPage />, '/search?q=xyz_no_match');

    await waitFor(() => {
      // Title not highlighted because query doesn't match it
      expect(screen.getByText('Found Announcement')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows result count after search', async () => {
    mockFetchSuccess([
      makeResult({ id: 1, title: 'Result One' }),
      makeResult({ id: 2, title: 'Result Two' }),
    ], 2);
    renderWithRouter(<SearchPage />, '/search?q=result');

    await waitFor(() => {
      expect(screen.getByText(/2 result/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  // --- Grouping by entity type ---

  it('groups results by entity type', async () => {
    mockFetchSuccess([
      makeResult({ id: 1, entityType: 'Announcement', title: 'Announcement Result' }),
      makeResult({ id: 2, entityType: 'Event', title: 'Event Result' }),
    ]);
    renderWithRouter(<SearchPage />, '/search?q=result');

    await waitFor(() => {
      expect(screen.getByText('Announcements')).toBeInTheDocument();
      expect(screen.getByText('Events')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows section header for each entity type group', async () => {
    mockFetchSuccess([
      makeResult({ id: 1, entityType: 'Maintenance', title: 'A maintenance item' }),
    ]);
    renderWithRouter(<SearchPage />, '/search?q=xyz_nomatch');

    await waitFor(() => {
      // The section aria-label or h2 for Maintenance group
      expect(screen.getByRole('heading', { name: 'Maintenance' })).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  // --- Snippet rendering ---

  it('renders result body as snippet', async () => {
    mockFetchSuccess([
      makeResult({ title: 'Test Result', body: 'This is visible body text here' }),
    ]);
    renderWithRouter(<SearchPage />, '/search?q=xyz_nomatch');

    await waitFor(() => {
      // Body snippet should be visible - query doesn't match so no highlighting
      expect(screen.getByText(/visible body text/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('highlights matching terms in snippet', async () => {
    mockFetchSuccess([
      makeResult({ title: 'Test Result', body: 'The boiler maintenance is scheduled' }),
    ]);
    renderWithRouter(<SearchPage />, '/search?q=boiler');

    await waitFor(() => {
      const marks = document.querySelectorAll('mark');
      expect(marks.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  // --- Click-through links ---

  it('renders a link for each result', async () => {
    mockFetchSuccess([
      makeResult({ title: 'Clickable Result', url: '/platform/announcements/101' }),
    ]);
    renderWithRouter(<SearchPage />, '/search?q=clickable');

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /clickable result/i });
      expect(link).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('result link has correct href from result url', async () => {
    mockFetchSuccess([
      makeResult({ title: 'Linked Result', url: '/platform/announcements/42' }),
    ]);
    renderWithRouter(<SearchPage />, '/search?q=linked');

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /linked result/i });
      expect(link).toHaveAttribute('href', '/platform/announcements/42');
    }, { timeout: 3000 });
  });

  // --- Empty state ---

  it('shows no-results empty state when search returns no results', async () => {
    mockFetchSuccess([]);
    renderWithRouter(<SearchPage />, '/search?q=noresults');

    await waitFor(() => {
      expect(screen.getByText(/no results/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  // --- Error state ---

  it('shows error state on fetch failure', async () => {
    mockFetchError(500);
    renderWithRouter(<SearchPage />, '/search?q=test');

    await waitFor(() => {
      expect(screen.getByText(/search failed/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows retry button on error', async () => {
    mockFetchError(500);
    renderWithRouter(<SearchPage />, '/search?q=test');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('clears results when search input is cleared', async () => {
    mockFetchSuccess([makeResult({ title: 'Some Result' })]);
    renderWithRouter(<SearchPage />, '/search?q=test');

    await waitFor(() => {
      expect(screen.getByText('Some Result')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Clear the input
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: '' } });

    await waitFor(() => {
      expect(screen.queryByText('Some Result')).not.toBeInTheDocument();
    }, { timeout: 3000 });
  });

  // --- Debounce: does not fetch immediately ---

  it('does not fetch immediately after typing (debounce)', async () => {
    // Use fake timer to check debounce
    vi.useFakeTimers();
    mockFetchSuccess([]);
    renderWithRouter(<SearchPage />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    // Before debounce fires, fetch should NOT have been called
    expect(fetch).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  // --- Accessibility ---

  it('search input has accessible label', () => {
    renderWithRouter(<SearchPage />);
    const input = screen.getByRole('searchbox');
    expect(input).toHaveAccessibleName();
  });
});
