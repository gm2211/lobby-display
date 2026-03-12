/**
 * ViolationDetail component tests
 *
 * Tests: renders violation info, status/severity badges, fine info,
 *        status timeline, appeal button, back link, loading/error/not-found states.
 *
 * RED/BLUE TDD: write tests first, then implement the component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ViolationDetail from '../../../src/platform/pages/ViolationDetail';

// --- Types matching the actual API response ---
interface ViolationComment {
  id: string;
  violationId: string;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

interface ViolationDetailResponse {
  id: string;
  reportedBy: string;
  unitNumber: string;
  category: string;
  description: string;
  evidence: unknown | null;
  status: string;
  severity: string;
  fineAmount: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  comments: ViolationComment[];
}

// --- Helpers ---

function renderWithParams(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/platform/violations/${id}`]}>
      <Routes>
        <Route path="/platform/violations/:id" element={<ViolationDetail />} />
        <Route path="/platform/violations" element={<div>Violations List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const baseViolation: ViolationDetailResponse = {
  id: 'abc-123',
  reportedBy: 'user-1',
  unitNumber: '4B',
  category: 'Noise',
  description: 'Loud music after midnight disturbing neighbors.',
  evidence: null,
  status: 'REPORTED',
  severity: 'MEDIUM',
  fineAmount: null,
  assignedTo: null,
  createdAt: '2025-06-15T10:00:00.000Z',
  updatedAt: '2025-06-15T10:00:00.000Z',
  comments: [],
};

function makeViolation(overrides: Partial<ViolationDetailResponse> = {}): ViolationDetailResponse {
  return { ...baseViolation, ...overrides };
}

function mockFetchSuccess(data: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as Response));
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

describe('ViolationDetail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Loading state ---

  it('shows loading spinner initially', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    renderWithParams('abc-123');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Error states ---

  it('shows not-found state when violation is 404', async () => {
    mockFetchError(404, 'Violation not found');
    renderWithParams('not-found-id');

    await waitFor(() => {
      expect(screen.getByText(/violation not found/i)).toBeInTheDocument();
    });
  });

  it('shows error state when fetch fails with server error', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // --- Basic violation info ---

  it('renders unit number', async () => {
    mockFetchSuccess(makeViolation({ unitNumber: '4B' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByText('4B')).toBeInTheDocument();
    });
  });

  it('renders category', async () => {
    mockFetchSuccess(makeViolation({ category: 'Parking' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByText('Parking')).toBeInTheDocument();
    });
  });

  it('renders description', async () => {
    mockFetchSuccess(makeViolation({ description: 'Unauthorized vehicle in reserved spot.' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByText('Unauthorized vehicle in reserved spot.')).toBeInTheDocument();
    });
  });

  it('renders issued date from createdAt', async () => {
    mockFetchSuccess(makeViolation({ createdAt: '2025-06-15T10:00:00.000Z' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      const dateElements = screen.getAllByText(/jun 15, 2025/i);
      expect(dateElements.length).toBeGreaterThan(0);
    });
  });

  // --- Status badge ---

  it('renders REPORTED status badge', async () => {
    mockFetchSuccess(makeViolation({ status: 'REPORTED' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-REPORTED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-REPORTED')).toHaveTextContent('Reported');
  });

  it('renders UNDER_REVIEW status badge', async () => {
    mockFetchSuccess(makeViolation({ status: 'UNDER_REVIEW' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-UNDER_REVIEW')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-UNDER_REVIEW')).toHaveTextContent('Under Review');
  });

  it('renders CONFIRMED status badge', async () => {
    mockFetchSuccess(makeViolation({ status: 'CONFIRMED' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-CONFIRMED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-CONFIRMED')).toHaveTextContent('Confirmed');
  });

  it('renders RESOLVED status badge', async () => {
    mockFetchSuccess(makeViolation({ status: 'RESOLVED' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-RESOLVED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-RESOLVED')).toHaveTextContent('Resolved');
  });

  it('renders DISMISSED status badge', async () => {
    mockFetchSuccess(makeViolation({ status: 'DISMISSED' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-DISMISSED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-DISMISSED')).toHaveTextContent('Dismissed');
  });

  it('renders APPEALED status badge', async () => {
    mockFetchSuccess(makeViolation({ status: 'APPEALED' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-APPEALED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-APPEALED')).toHaveTextContent('Appealed');
  });

  // --- Severity badge ---

  it('renders LOW severity badge', async () => {
    mockFetchSuccess(makeViolation({ severity: 'LOW' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByTestId('severity-badge-LOW')).toBeInTheDocument();
    });
    expect(screen.getByTestId('severity-badge-LOW')).toHaveTextContent('Low');
  });

  it('renders MEDIUM severity badge', async () => {
    mockFetchSuccess(makeViolation({ severity: 'MEDIUM' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByTestId('severity-badge-MEDIUM')).toBeInTheDocument();
    });
    expect(screen.getByTestId('severity-badge-MEDIUM')).toHaveTextContent('Medium');
  });

  it('renders HIGH severity badge', async () => {
    mockFetchSuccess(makeViolation({ severity: 'HIGH' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByTestId('severity-badge-HIGH')).toBeInTheDocument();
    });
    expect(screen.getByTestId('severity-badge-HIGH')).toHaveTextContent('High');
  });

  // --- Fine info ---

  it('does not show fine section when fineAmount is null', async () => {
    mockFetchSuccess(makeViolation({ fineAmount: null }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByText('4B')).toBeInTheDocument();
    });

    expect(screen.queryByText(/fine amount/i)).toBeNull();
  });

  it('shows fine amount when present', async () => {
    mockFetchSuccess(makeViolation({ fineAmount: '250.00' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByText(/\$250/)).toBeInTheDocument();
    });
  });

  // --- Status timeline ---

  it('renders status timeline section', async () => {
    mockFetchSuccess(makeViolation());
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByTestId('status-timeline')).toBeInTheDocument();
    });
  });

  it('shows current status highlighted in timeline', async () => {
    mockFetchSuccess(makeViolation({ status: 'CONFIRMED' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      const timeline = screen.getByTestId('status-timeline');
      expect(timeline).toBeInTheDocument();
      // The current status step should be marked as active
      expect(screen.getByTestId('timeline-step-CONFIRMED')).toBeInTheDocument();
    });
  });

  // --- Appeal button ---

  it('does NOT show appeal button for non-CONFIRMED violations', async () => {
    mockFetchSuccess(makeViolation({ status: 'REPORTED' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByText('4B')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /appeal/i })).toBeNull();
  });

  it('shows appeal button for CONFIRMED violations', async () => {
    mockFetchSuccess(makeViolation({ status: 'CONFIRMED' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /appeal/i })).toBeInTheDocument();
    });
  });

  it('submits appeal and shows submitted state', async () => {
    // Mock all fetch calls: GET violation, optionally GET CSRF, POST appeal
    const fetchMock = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'test-csrf' }),
        } as Response);
      }
      if (urlStr.includes('/appeal')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeViolation({ status: 'APPEALED' })),
        } as Response);
      }
      // Default: GET violation
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(makeViolation({ status: 'CONFIRMED' })),
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /appeal/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /appeal/i }));

    await waitFor(() => {
      // After appeal, show "Appeal Submitted" message or updated badge
      const appealedOrSubmitted =
        screen.queryByTestId('status-badge-APPEALED') ||
        screen.queryByText(/appeal submitted/i);
      expect(appealedOrSubmitted).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  // --- Back link ---

  it('renders back link to violations list', async () => {
    mockFetchSuccess(makeViolation());
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByText(/back to violations/i)).toBeInTheDocument();
    });
  });

  it('back link navigates to /platform/violations', async () => {
    mockFetchSuccess(makeViolation());
    renderWithParams('abc-123');

    await waitFor(() => {
      const backBtn = screen.getByText(/back to violations/i);
      expect(backBtn).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/back to violations/i));

    await waitFor(() => {
      expect(screen.getByText('Violations List')).toBeInTheDocument();
    });
  });

  // --- Comments ---

  it('renders comments section when comments exist', async () => {
    const violation = makeViolation({
      comments: [
        {
          id: 'comment-1',
          violationId: 'abc-123',
          authorId: 'user-1',
          body: 'This is a comment about the violation.',
          isInternal: false,
          createdAt: '2025-06-16T12:00:00.000Z',
        },
      ],
    });
    mockFetchSuccess(violation);
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByText('This is a comment about the violation.')).toBeInTheDocument();
    });
  });

  it('does not show internal comments (isInternal: true) to public', async () => {
    const violation = makeViolation({
      comments: [
        {
          id: 'comment-1',
          violationId: 'abc-123',
          authorId: 'user-1',
          body: 'Internal staff note.',
          isInternal: true,
          createdAt: '2025-06-16T12:00:00.000Z',
        },
      ],
    });
    mockFetchSuccess(violation);
    renderWithParams('abc-123');

    await waitFor(() => {
      expect(screen.getByText('4B')).toBeInTheDocument();
    });

    expect(screen.queryByText('Internal staff note.')).toBeNull();
  });

  // --- heading ---

  it('renders a heading with the violation id or unit', async () => {
    mockFetchSuccess(makeViolation({ unitNumber: '12C', category: 'Pet' }));
    renderWithParams('abc-123');

    await waitFor(() => {
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
    });
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });
});
