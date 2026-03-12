/**
 * ForumPage component tests (TDD — Red/Blue)
 *
 * Tests: category sidebar, thread list, filtering, search,
 *        navigation links, loading/empty/error states.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ForumPage from '../../../src/platform/pages/ForumPage';
import type { ForumCategory, ForumThread } from '../../../src/platform/types';

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// ---- Fixtures ----

const cat1: ForumCategory = {
  id: 1,
  name: 'General Discussion',
  description: 'Talk about anything',
  _count: { threads: 3 },
};

const cat2: ForumCategory = {
  id: 2,
  name: 'Announcements',
  description: 'Official building announcements',
  _count: { threads: 1 },
};

const thread1: ForumThread = {
  id: 101,
  title: 'Welcome to the forum',
  categoryId: 1,
  authorId: 'user-1',
  authorName: 'Alice Smith',
  pinned: false,
  locked: false,
  createdAt: '2025-01-15T10:00:00.000Z',
  updatedAt: '2025-01-15T10:00:00.000Z',
  _count: { replies: 5 },
  lastReplyAt: '2025-01-20T14:30:00.000Z',
};

const thread2: ForumThread = {
  id: 102,
  title: 'Building maintenance update',
  categoryId: 2,
  authorId: 'user-2',
  authorName: 'Bob Jones',
  pinned: true,
  locked: false,
  createdAt: '2025-02-01T09:00:00.000Z',
  updatedAt: '2025-02-01T09:00:00.000Z',
  _count: { replies: 2 },
  lastReplyAt: '2025-02-05T11:00:00.000Z',
};

function mockFetchSequence(responses: Array<{ ok: boolean; data: unknown }>) {
  let call = 0;
  vi.mocked(fetch).mockImplementation(() => {
    const resp = responses[call] ?? responses[responses.length - 1];
    call++;
    return Promise.resolve({
      ok: resp.ok,
      status: resp.ok ? 200 : 500,
      statusText: resp.ok ? 'OK' : 'Internal Server Error',
      json: async () => resp.data,
    } as Response);
  });
}

function mockFetchSuccess(categories: ForumCategory[], threads: ForumThread[]) {
  mockFetchSequence([
    { ok: true, data: categories },
    { ok: true, data: threads },
  ]);
}

function mockFetchError() {
  vi.mocked(fetch).mockResolvedValue({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    json: async () => ({ error: 'Server Error' }),
  } as Response);
}

describe('ForumPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Loading state ----

  it('shows loading spinner initially', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<ForumPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // ---- Page heading ----

  it('renders the page heading "Forum"', async () => {
    mockFetchSuccess([cat1], [thread1]);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /forum/i })).toBeInTheDocument();
    });
  });

  // ---- "New Thread" button ----

  it('renders a "New Thread" link', async () => {
    mockFetchSuccess([cat1], [thread1]);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /new thread/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/platform/forum/new');
    });
  });

  // ---- Category sidebar ----

  it('renders all categories', async () => {
    mockFetchSuccess([cat1, cat2], [thread1, thread2]);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByText('General Discussion')).toBeInTheDocument();
      expect(screen.getByText('Announcements')).toBeInTheDocument();
    });
  });

  it('renders category description', async () => {
    mockFetchSuccess([cat1], [thread1]);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByText('Talk about anything')).toBeInTheDocument();
    });
  });

  it('renders category thread count', async () => {
    mockFetchSuccess([cat1], [thread1]);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByText(/3 threads/i)).toBeInTheDocument();
    });
  });

  // ---- Thread list ----

  it('renders thread titles', async () => {
    mockFetchSuccess([cat1, cat2], [thread1, thread2]);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByText('Welcome to the forum')).toBeInTheDocument();
      expect(screen.getByText('Building maintenance update')).toBeInTheDocument();
    });
  });

  it('renders author name for each thread', async () => {
    mockFetchSuccess([cat1], [thread1]);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByText(/alice smith/i)).toBeInTheDocument();
    });
  });

  it('renders reply count for each thread', async () => {
    mockFetchSuccess([cat1], [thread1]);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByText(/5 replies/i)).toBeInTheDocument();
    });
  });

  it('renders created date for each thread', async () => {
    mockFetchSuccess([cat1], [thread1]);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByText(/jan 15, 2025/i)).toBeInTheDocument();
    });
  });

  it('renders last reply date when available', async () => {
    mockFetchSuccess([cat1], [thread1]);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByText(/jan 20, 2025/i)).toBeInTheDocument();
    });
  });

  // ---- Thread navigation ----

  it('thread title links to thread detail page', async () => {
    mockFetchSuccess([cat1], [thread1]);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /welcome to the forum/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/platform/forum/101');
    });
  });

  // ---- Category filtering ----

  it('clicking a category filters threads to that category', async () => {
    mockFetchSequence([
      { ok: true, data: [cat1, cat2] },
      { ok: true, data: [thread1, thread2] },
      { ok: true, data: [thread2] },
    ]);
    renderWithRouter(<ForumPage />);

    await waitFor(() => {
      expect(screen.getByText('Welcome to the forum')).toBeInTheDocument();
    });

    // Click on cat2
    fireEvent.click(screen.getByText('Announcements'));

    await waitFor(() => {
      expect(screen.queryByText('Welcome to the forum')).not.toBeInTheDocument();
      expect(screen.getByText('Building maintenance update')).toBeInTheDocument();
    });
  });

  it('shows all categories option to reset filter', async () => {
    mockFetchSuccess([cat1, cat2], [thread1, thread2]);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByText(/all categories/i)).toBeInTheDocument();
    });
  });

  // ---- Search ----

  it('renders a search input', async () => {
    mockFetchSuccess([cat1], [thread1]);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });

  it('filters threads by title search (client-side)', async () => {
    mockFetchSuccess([cat1, cat2], [thread1, thread2]);
    renderWithRouter(<ForumPage />);

    await waitFor(() => {
      expect(screen.getByText('Welcome to the forum')).toBeInTheDocument();
      expect(screen.getByText('Building maintenance update')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'maintenance' } });

    expect(screen.queryByText('Welcome to the forum')).not.toBeInTheDocument();
    expect(screen.getByText('Building maintenance update')).toBeInTheDocument();
  });

  it('search is case-insensitive', async () => {
    mockFetchSuccess([cat1], [thread1]);
    renderWithRouter(<ForumPage />);

    await waitFor(() => {
      expect(screen.getByText('Welcome to the forum')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'WELCOME' } });

    expect(screen.getByText('Welcome to the forum')).toBeInTheDocument();
  });

  // ---- Empty states ----

  it('shows empty state when no threads exist', async () => {
    mockFetchSuccess([cat1], []);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByText(/no threads/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when search returns no results', async () => {
    mockFetchSuccess([cat1], [thread1]);
    renderWithRouter(<ForumPage />);

    await waitFor(() => {
      expect(screen.getByText('Welcome to the forum')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });

    expect(screen.queryByText('Welcome to the forum')).not.toBeInTheDocument();
    expect(screen.getByText(/no threads/i)).toBeInTheDocument();
  });

  it('shows empty state when no categories exist', async () => {
    mockFetchSuccess([], []);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByText(/no categories/i)).toBeInTheDocument();
    });
  });

  // ---- Error state ----

  it('shows error message on fetch failure', async () => {
    mockFetchError();
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockFetchError();
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('retries fetch on retry button click', async () => {
    mockFetchError();
    renderWithRouter(<ForumPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    // Reset mock to return success on retry
    mockFetchSuccess([cat1], [thread1]);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Welcome to the forum')).toBeInTheDocument();
    });
  });

  // ---- Pinned thread indicator ----

  it('shows pinned indicator for pinned threads', async () => {
    mockFetchSuccess([cat2], [thread2]);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByText(/pinned/i)).toBeInTheDocument();
    });
  });

  // ---- Locked thread indicator ----

  it('shows locked indicator for locked threads', async () => {
    const lockedThread: ForumThread = { ...thread1, locked: true };
    mockFetchSuccess([cat1], [lockedThread]);
    renderWithRouter(<ForumPage />);
    await waitFor(() => {
      expect(screen.getByText(/locked/i)).toBeInTheDocument();
    });
  });
});
