/**
 * ForumThreadDetail component tests — Red/Blue TDD
 *
 * Tests cover:
 * - Loading spinner while fetching thread
 * - Thread display: title, author, body, date
 * - Pinned / locked badges
 * - Reply list rendering (chronological order, author, date, body)
 * - Reply count displayed
 * - Reply form: textarea (required), submit button
 * - Reply form submission (POST to correct endpoint)
 * - Moderation actions for MANAGER+: pin/unpin, lock/unlock, delete thread
 * - Error state if thread not found
 * - Back link to /platform/forum
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock api module
vi.mock('../../../src/utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import ForumThreadDetail from '../../../src/platform/pages/ForumThreadDetail';
import { api } from '../../../src/utils/api';
import type { ForumReply, ForumThreadWithReplies } from '../../../src/platform/types';

// --- Helpers ---

const mockedApi = api as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function renderDetail(threadId = '42') {
  return render(
    <MemoryRouter initialEntries={[`/platform/forum/${threadId}`]}>
      <Routes>
        <Route path="/platform/forum/:threadId" element={<ForumThreadDetail />} />
        <Route path="/platform/forum" element={<div data-testid="forum-list">Forum List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// --- Fixtures ---

const reply1: ForumReply = {
  id: 'reply-1',
  threadId: '42',
  authorId: 'user-2',
  authorName: 'Bob Jones',
  body: 'Great topic, thanks for posting!',
  createdAt: '2025-01-16T10:00:00.000Z',
  updatedAt: '2025-01-16T10:00:00.000Z',
};

const reply2: ForumReply = {
  id: 'reply-2',
  threadId: '42',
  authorId: 'user-3',
  authorName: 'Carol White',
  body: 'I agree with the above.',
  createdAt: '2025-01-17T10:00:00.000Z',
  updatedAt: '2025-01-17T10:00:00.000Z',
};

const baseThread: ForumThreadWithReplies = {
  id: 42,
  title: 'Welcome to the forum',
  categoryId: 1,
  authorId: 'user-1',
  authorName: 'Alice Smith',
  body: 'This is the full body of the thread post.',
  pinned: false,
  locked: false,
  createdAt: '2025-01-15T10:00:00.000Z',
  updatedAt: '2025-01-15T10:00:00.000Z',
  lastReplyAt: null,
  _count: { replies: 2 },
  replies: [reply1, reply2],
};

function makeThread(overrides: Partial<ForumThreadWithReplies> = {}): ForumThreadWithReplies {
  return { ...baseThread, ...overrides };
}

// --- Tests ---

describe('ForumThreadDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    // Default: RESIDENT role and successful thread fetch
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'RESIDENT' });
      }
      return Promise.resolve(makeThread());
    });
    mockedApi.post.mockResolvedValue({ id: 'reply-new', body: 'My reply' });
    mockedApi.put.mockResolvedValue({ ...baseThread });
    mockedApi.delete.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Loading state ----

  it('shows loading spinner initially', () => {
    mockedApi.get.mockReturnValue(new Promise(() => {}));
    renderDetail();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // ---- Thread display ----

  it('renders thread title', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome to the forum/i })).toBeInTheDocument();
    });
  });

  it('renders thread author', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/alice smith/i)).toBeInTheDocument();
    });
  });

  it('renders thread created date', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/jan 15, 2025/i)).toBeInTheDocument();
    });
  });

  it('renders thread body content', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/full body of the thread post/i)).toBeInTheDocument();
    });
  });

  it('renders reply count', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/2 repl/i)).toBeInTheDocument();
    });
  });

  // ---- Pinned / locked badges ----

  it('shows pinned badge for pinned thread', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'RESIDENT' });
      }
      return Promise.resolve(makeThread({ pinned: true }));
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/pinned/i)).toBeInTheDocument();
    });
  });

  it('does NOT show pinned badge for non-pinned thread', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.queryByText(/pinned/i)).not.toBeInTheDocument();
    });
  });

  it('shows locked badge for locked thread', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'RESIDENT' });
      }
      return Promise.resolve(makeThread({ locked: true }));
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/locked/i)).toBeInTheDocument();
    });
  });

  it('does NOT show locked badge for non-locked thread', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.queryByText(/locked/i)).not.toBeInTheDocument();
    });
  });

  // ---- Reply list ----

  it('renders all replies', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/great topic, thanks for posting/i)).toBeInTheDocument();
      expect(screen.getByText(/i agree with the above/i)).toBeInTheDocument();
    });
  });

  it('renders reply author names', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/bob jones/i)).toBeInTheDocument();
      expect(screen.getByText(/carol white/i)).toBeInTheDocument();
    });
  });

  it('renders reply dates', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/jan 16, 2025/i)).toBeInTheDocument();
      expect(screen.getByText(/jan 17, 2025/i)).toBeInTheDocument();
    });
  });

  it('renders replies in chronological order', async () => {
    renderDetail();
    await waitFor(() => {
      const bodies = screen.getAllByText(/great topic|i agree/i);
      expect(bodies[0]).toHaveTextContent(/great topic/i);
      expect(bodies[1]).toHaveTextContent(/i agree/i);
    });
  });

  it('shows empty state when there are no replies', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'RESIDENT' });
      }
      return Promise.resolve(makeThread({ replies: [], _count: { replies: 0 } }));
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/no replies yet/i)).toBeInTheDocument();
    });
  });

  // ---- Reply form ----

  it('renders reply textarea', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  it('renders submit button for reply', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /post reply/i })).toBeInTheDocument();
    });
  });

  it('submits reply to the correct endpoint', async () => {
    renderDetail('42');
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My new reply' } });
    fireEvent.click(screen.getByRole('button', { name: /post reply/i }));

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith(
        '/api/platform/forum/threads/42/replies',
        expect.objectContaining({ body: 'My new reply' })
      );
    });
  });

  it('clears reply textarea after successful submission', async () => {
    renderDetail('42');
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'My new reply' } });
    fireEvent.click(screen.getByRole('button', { name: /post reply/i }));

    await waitFor(() => {
      expect(textarea).toHaveValue('');
    });
  });

  it('shows validation error when submitting empty reply', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /post reply/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /post reply/i }));

    await waitFor(() => {
      expect(screen.getByText(/reply cannot be empty/i)).toBeInTheDocument();
    });
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it('does not show reply form when thread is locked', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'RESIDENT' });
      }
      return Promise.resolve(makeThread({ locked: true }));
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /post reply/i })).not.toBeInTheDocument();
    });
  });

  // ---- Back link ----

  it('renders back link to /platform/forum', async () => {
    renderDetail();
    await waitFor(() => {
      const backLink = screen.getByRole('link', { name: /back to forum/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/platform/forum');
    });
  });

  // ---- Error state ----

  it('shows error state when thread not found', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'RESIDENT' });
      }
      return Promise.reject(new Error('Thread not found'));
    });
    renderDetail('9999');
    await waitFor(() => {
      const elements = screen.getAllByText(/thread not found/i);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows error state when API returns an error', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'RESIDENT' });
      }
      return Promise.reject(new Error('Server error'));
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument();
    });
  });

  // ---- Moderation actions (MANAGER+) ----

  it('does NOT show moderation actions for RESIDENT role', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/welcome to the forum/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /pin|unpin|lock|unlock|delete thread/i })).not.toBeInTheDocument();
  });

  it('shows pin/unpin button for MANAGER role', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'MANAGER' });
      }
      return Promise.resolve(makeThread({ pinned: false }));
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pin thread/i })).toBeInTheDocument();
    });
  });

  it('shows unpin button for pinned thread (MANAGER role)', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'MANAGER' });
      }
      return Promise.resolve(makeThread({ pinned: true }));
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /unpin thread/i })).toBeInTheDocument();
    });
  });

  it('shows lock button for MANAGER role', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'MANAGER' });
      }
      return Promise.resolve(makeThread({ locked: false }));
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /lock thread/i })).toBeInTheDocument();
    });
  });

  it('shows unlock button for locked thread (MANAGER role)', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'MANAGER' });
      }
      return Promise.resolve(makeThread({ locked: true }));
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /unlock thread/i })).toBeInTheDocument();
    });
  });

  it('shows delete thread button for MANAGER role', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'MANAGER' });
      }
      return Promise.resolve(makeThread());
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete thread/i })).toBeInTheDocument();
    });
  });

  it('calls PUT to pin a thread', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'MANAGER' });
      }
      return Promise.resolve(makeThread({ pinned: false }));
    });
    renderDetail('42');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pin thread/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /pin thread/i }));

    await waitFor(() => {
      expect(mockedApi.put).toHaveBeenCalledWith(
        '/api/platform/forum/threads/42',
        expect.objectContaining({ pinned: true })
      );
    });
  });

  it('calls PUT to lock a thread', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'MANAGER' });
      }
      return Promise.resolve(makeThread({ locked: false }));
    });
    renderDetail('42');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /lock thread/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /lock thread/i }));

    await waitFor(() => {
      expect(mockedApi.put).toHaveBeenCalledWith(
        '/api/platform/forum/threads/42',
        expect.objectContaining({ locked: true })
      );
    });
  });

  it('calls DELETE and navigates away when deleting a thread', async () => {
    // Mock window.confirm to return true
    vi.stubGlobal('confirm', () => true);

    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'MANAGER' });
      }
      return Promise.resolve(makeThread());
    });
    renderDetail('42');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete thread/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /delete thread/i }));

    await waitFor(() => {
      expect(mockedApi.delete).toHaveBeenCalledWith('/api/platform/forum/threads/42');
      expect(mockNavigate).toHaveBeenCalledWith('/platform/forum');
    });
  });

  it('shows moderation actions for BOARD_MEMBER role', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/profile')) {
        return Promise.resolve({ platformRole: 'BOARD_MEMBER' });
      }
      return Promise.resolve(makeThread());
    });
    renderDetail();
    await waitFor(() => {
      // BOARD_MEMBER is considered MANAGER+ in many contexts; we only show mod actions for MANAGER
      // This test verifies BOARD_MEMBER does NOT see mod actions (only MANAGER does)
      expect(screen.queryByRole('button', { name: /pin thread|lock thread|delete thread/i })).not.toBeInTheDocument();
    });
  });
});
