/**
 * MaintenanceDetail component tests
 *
 * Tests: renders maintenance request info, status/priority badges,
 *        comments section, add comment form, back link,
 *        loading/error/not-found states.
 *
 * RED/BLUE TDD: write tests first, then implement the component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MaintenanceDetail from '../../../src/platform/pages/MaintenanceDetail';
import type { MaintenanceRequest } from '../../../src/platform/types';

// --- Types ---

interface MaintenanceComment {
  id: number;
  requestId: number;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

interface MaintenanceDetailData extends MaintenanceRequest {
  comments: MaintenanceComment[];
}

// --- Helpers ---

function renderWithParams(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/platform/maintenance/${id}`]}>
      <Routes>
        <Route path="/platform/maintenance/:id" element={<MaintenanceDetail />} />
        <Route path="/platform/maintenance" element={<div>Maintenance List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const baseRequest: MaintenanceDetailData = {
  id: 42,
  title: 'Leaking faucet in kitchen',
  description: 'The kitchen faucet has been dripping constantly for two days.',
  category: 'Plumbing',
  priority: 'MEDIUM',
  status: 'OPEN',
  unitNumber: '4B',
  location: 'Kitchen',
  createdAt: '2025-06-15T10:00:00.000Z',
  updatedAt: '2025-06-16T12:00:00.000Z',
  comments: [],
};

function makeRequest(overrides: Partial<MaintenanceDetailData> = {}): MaintenanceDetailData {
  return { ...baseRequest, ...overrides };
}

function makeComment(overrides: Partial<MaintenanceComment> = {}): MaintenanceComment {
  return {
    id: 1,
    requestId: 42,
    authorId: 'user-1',
    authorName: 'Jane Smith',
    body: 'We will send a technician tomorrow.',
    createdAt: '2025-06-16T14:00:00.000Z',
    ...overrides,
  };
}

function mockFetchSuccess(data: unknown, commentsData: unknown = []) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes('/comments')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(commentsData),
      } as Response);
    }
    if (urlStr.includes('/csrf')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token: 'test-csrf' }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
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

describe('MaintenanceDetail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // --- Loading state ---

  it('shows loading spinner initially', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    renderWithParams('42');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Error states ---

  it('shows not-found state when request is 404', async () => {
    mockFetchError(404, 'Maintenance request not found');
    renderWithParams('999');

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });

  it('shows error state with retry when fetch fails with server error', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('allows retry after error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Server error' }),
        statusText: 'Internal Server Error',
      })
      .mockImplementation((url: unknown) => {
        const urlStr = String(url);
        if (urlStr.includes('/comments')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve([]),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(makeRequest()),
        });
      });
    vi.stubGlobal('fetch', fetchMock);

    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
  });

  // --- Basic request info ---

  it('renders title as h1', async () => {
    mockFetchSuccess(makeRequest({ title: 'Broken heater in bedroom' }));
    renderWithParams('42');

    await waitFor(() => {
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Broken heater in bedroom');
    });
  });

  it('renders category', async () => {
    mockFetchSuccess(makeRequest({ category: 'Electrical' }));
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByText('Electrical')).toBeInTheDocument();
    });
  });

  it('renders description', async () => {
    mockFetchSuccess(makeRequest({ description: 'The heater stopped working after a power outage.' }));
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByText('The heater stopped working after a power outage.')).toBeInTheDocument();
    });
  });

  it('renders unit number', async () => {
    mockFetchSuccess(makeRequest({ unitNumber: '7C' }));
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByText('7C')).toBeInTheDocument();
    });
  });

  it('renders location when present', async () => {
    mockFetchSuccess(makeRequest({ location: 'Master Bedroom' }));
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByText('Master Bedroom')).toBeInTheDocument();
    });
  });

  it('renders created date', async () => {
    mockFetchSuccess(makeRequest({ createdAt: '2025-06-15T10:00:00.000Z' }));
    renderWithParams('42');

    await waitFor(() => {
      const dateEls = screen.getAllByText(/jun 15, 2025/i);
      expect(dateEls.length).toBeGreaterThan(0);
    });
  });

  it('renders updated date', async () => {
    mockFetchSuccess(makeRequest({ updatedAt: '2025-06-20T08:00:00.000Z' }));
    renderWithParams('42');

    await waitFor(() => {
      const dateEls = screen.getAllByText(/jun 20, 2025/i);
      expect(dateEls.length).toBeGreaterThan(0);
    });
  });

  // --- Status badge ---

  it('renders OPEN status badge with blue styling', async () => {
    mockFetchSuccess(makeRequest({ status: 'OPEN' }));
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-OPEN')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-OPEN')).toHaveTextContent('Open');
  });

  it('renders IN_PROGRESS status badge with orange styling', async () => {
    mockFetchSuccess(makeRequest({ status: 'IN_PROGRESS' }));
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-IN_PROGRESS')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-IN_PROGRESS')).toHaveTextContent('In Progress');
  });

  it('renders COMPLETED status badge with green styling', async () => {
    mockFetchSuccess(makeRequest({ status: 'COMPLETED' }));
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-COMPLETED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-COMPLETED')).toHaveTextContent('Completed');
  });

  it('renders CANCELLED status badge with gray styling', async () => {
    mockFetchSuccess(makeRequest({ status: 'CANCELLED' }));
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-CANCELLED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-CANCELLED')).toHaveTextContent('Cancelled');
  });

  // --- Priority badge ---

  it('renders LOW priority badge with gray styling', async () => {
    mockFetchSuccess(makeRequest({ priority: 'LOW' }));
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByTestId('priority-badge-LOW')).toBeInTheDocument();
    });
    expect(screen.getByTestId('priority-badge-LOW')).toHaveTextContent('Low');
  });

  it('renders MEDIUM priority badge with yellow styling', async () => {
    mockFetchSuccess(makeRequest({ priority: 'MEDIUM' }));
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByTestId('priority-badge-MEDIUM')).toBeInTheDocument();
    });
    expect(screen.getByTestId('priority-badge-MEDIUM')).toHaveTextContent('Medium');
  });

  it('renders HIGH priority badge with orange styling', async () => {
    mockFetchSuccess(makeRequest({ priority: 'HIGH' }));
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByTestId('priority-badge-HIGH')).toBeInTheDocument();
    });
    expect(screen.getByTestId('priority-badge-HIGH')).toHaveTextContent('High');
  });

  it('renders URGENT priority badge with red styling', async () => {
    mockFetchSuccess(makeRequest({ priority: 'URGENT' }));
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByTestId('priority-badge-URGENT')).toBeInTheDocument();
    });
    expect(screen.getByTestId('priority-badge-URGENT')).toHaveTextContent('Urgent');
  });

  // --- Comments section ---

  it('shows empty comments state when no comments', async () => {
    mockFetchSuccess(makeRequest(), []);
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();
  });

  it('renders comments with author name', async () => {
    const comments = [makeComment({ authorName: 'Bob Jones', body: 'Technician scheduled.' })];
    mockFetchSuccess(makeRequest(), comments);
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    });
  });

  it('renders comment body text', async () => {
    const comments = [makeComment({ body: 'Parts have been ordered.' })];
    mockFetchSuccess(makeRequest(), comments);
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByText('Parts have been ordered.')).toBeInTheDocument();
    });
  });

  it('renders comment timestamp', async () => {
    const comments = [makeComment({ createdAt: '2025-06-16T14:00:00.000Z' })];
    mockFetchSuccess(makeRequest(), comments);
    renderWithParams('42');

    await waitFor(() => {
      const dateEls = screen.getAllByText(/jun 16, 2025/i);
      expect(dateEls.length).toBeGreaterThan(0);
    });
  });

  it('renders multiple comments', async () => {
    const comments = [
      makeComment({ id: 1, body: 'First comment.' }),
      makeComment({ id: 2, body: 'Second comment.' }),
      makeComment({ id: 3, body: 'Third comment.' }),
    ];
    mockFetchSuccess(makeRequest(), comments);
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByText('First comment.')).toBeInTheDocument();
      expect(screen.getByText('Second comment.')).toBeInTheDocument();
      expect(screen.getByText('Third comment.')).toBeInTheDocument();
    });
  });

  // --- Add comment form ---

  it('renders add comment textarea', async () => {
    mockFetchSuccess(makeRequest());
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders add comment submit button', async () => {
    mockFetchSuccess(makeRequest());
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add comment/i })).toBeInTheDocument();
    });
  });

  it('submits a new comment', async () => {
    const newComment = makeComment({ id: 99, body: 'New comment text.' });
    const fetchMock = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'test-csrf' }),
        });
      }
      if (urlStr.includes('/comments') && fetchMock.mock.calls.length > 3) {
        // POST comment - return the new comment
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve(newComment),
        });
      }
      if (urlStr.includes('/comments')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(makeRequest()),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'New comment text.' } });
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }));

    await waitFor(() => {
      // Comment was submitted - textarea should be cleared
      expect((textarea as HTMLTextAreaElement).value).toBe('');
    }, { timeout: 5000 });
  });

  it('disables submit button when textarea is empty', async () => {
    mockFetchSuccess(makeRequest());
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add comment/i })).toBeDisabled();
    });
  });

  // --- Back link ---

  it('renders back link to maintenance list', async () => {
    mockFetchSuccess(makeRequest());
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByText(/back to maintenance/i)).toBeInTheDocument();
    });
  });

  it('back link navigates to /platform/maintenance', async () => {
    mockFetchSuccess(makeRequest());
    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByText(/back to maintenance/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/back to maintenance/i));

    await waitFor(() => {
      expect(screen.getByText('Maintenance List')).toBeInTheDocument();
    });
  });
});
