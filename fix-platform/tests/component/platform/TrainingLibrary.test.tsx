/**
 * TrainingLibrary component tests.
 *
 * Tests cover:
 * - List training modules (title, description, duration, completion status)
 * - Category filter (contentType: VIDEO, DOCUMENT, LINK)
 * - Search by title (client-side)
 * - Progress indicator per module (completed/not-started)
 * - Click to view module detail (link to /platform/training/:id)
 * - Loading/error/empty states
 *
 * TDD: Written before implementation (Red phase).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TrainingLibrary from '../../../src/platform/pages/TrainingLibrary';

// Helper to render with router context
function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// --- Types ---
interface TrainingResource {
  id: string;
  title: string;
  description: string;
  contentType: 'VIDEO' | 'DOCUMENT' | 'LINK';
  contentUrl: string | null;
  uploadId: string | null;
  requiredForRoles: string[];
  dueDate: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { completions: number };
  completions?: Array<{ id: string; resourceId: string; userId: string; completedAt: string }>;
}

// --- Helpers ---

const baseResource: TrainingResource = {
  id: 'res-1',
  title: 'Fire Safety Training',
  description: 'Learn fire safety procedures for building residents.',
  contentType: 'VIDEO',
  contentUrl: 'https://example.com/video/fire-safety',
  uploadId: null,
  requiredForRoles: [],
  dueDate: null,
  sortOrder: 0,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  _count: { completions: 0 },
};

function makeResource(overrides: Partial<TrainingResource> = {}): TrainingResource {
  return { ...baseResource, ...overrides };
}

function mockFetchSuccess(resources: TrainingResource[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => resources,
  } as Response));
}

function mockFetchError(message = 'Internal Server Error') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    statusText: message,
    json: async () => ({ message }),
  } as unknown as Response));
}

// --- Tests ---

describe('TrainingLibrary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Loading state ---

  it('shows loading spinner initially', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    renderWithRouter(<TrainingLibrary />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Page heading ---

  it('renders the page heading', async () => {
    mockFetchSuccess([]);
    renderWithRouter(<TrainingLibrary />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /training/i })).toBeInTheDocument();
    });
  });

  // --- List view ---

  it('renders training module titles after fetching', async () => {
    const resources = [
      makeResource({ id: 'res-1', title: 'Fire Safety Training' }),
      makeResource({ id: 'res-2', title: 'Building Access Procedures' }),
    ];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByText('Fire Safety Training')).toBeInTheDocument();
      expect(screen.getByText('Building Access Procedures')).toBeInTheDocument();
    });
  });

  it('renders training module descriptions', async () => {
    const resources = [
      makeResource({ description: 'Learn fire safety procedures for building residents.' }),
    ];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByText(/learn fire safety procedures/i)).toBeInTheDocument();
    });
  });

  it('renders content type badge for each module', async () => {
    const resources = [
      makeResource({ id: 'res-1', contentType: 'VIDEO' }),
      makeResource({ id: 'res-2', title: 'Doc Module', contentType: 'DOCUMENT' }),
      makeResource({ id: 'res-3', title: 'Link Module', contentType: 'LINK' }),
    ];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByTestId('content-type-res-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('content-type-res-2')).toBeInTheDocument();
    expect(screen.getByTestId('content-type-res-3')).toBeInTheDocument();
  });

  it('renders link to module detail page', async () => {
    const resources = [makeResource({ id: 'res-abc', title: 'Test Module' })];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /test module/i });
      expect(link).toBeInTheDocument();
      expect(link.getAttribute('href')).toContain('/platform/training/res-abc');
    });
  });

  it('renders module card for each resource', async () => {
    const resources = [
      makeResource({ id: 'res-1' }),
      makeResource({ id: 'res-2', title: 'Module 2' }),
    ];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByTestId('training-card-res-1')).toBeInTheDocument();
      expect(screen.getByTestId('training-card-res-2')).toBeInTheDocument();
    });
  });

  // --- Progress/completion status ---

  it('shows "Not Started" status for module with no completions', async () => {
    const resources = [makeResource({ id: 'res-1', _count: { completions: 0 } })];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByTestId('progress-res-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('progress-res-1').textContent).toMatch(/not started/i);
  });

  it('shows completions count badge when completions > 0', async () => {
    const resources = [makeResource({ id: 'res-1', _count: { completions: 5 } })];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByTestId('training-card-res-1')).toBeInTheDocument();
    });
    // Should show "5" somewhere in the card
    expect(screen.getByTestId('training-card-res-1').textContent).toContain('5');
  });

  // --- Empty state ---

  it('shows empty state when no modules returned', async () => {
    mockFetchSuccess([]);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByText(/no training modules found/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when search yields no results', async () => {
    const resources = [makeResource({ title: 'Fire Safety Training' })];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByText('Fire Safety Training')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'xyznotfound' } });

    await waitFor(() => {
      expect(screen.queryByText('Fire Safety Training')).toBeNull();
      expect(screen.getByText(/no training modules found/i)).toBeInTheDocument();
    });
  });

  // --- Error state ---

  it('shows error message on fetch failure', async () => {
    mockFetchError('Server Error');

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockFetchError('Server Error');

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  // --- Search ---

  it('has search input', async () => {
    mockFetchSuccess([]);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByLabelText(/search/i)).toBeInTheDocument();
    });
  });

  it('filters modules by title search', async () => {
    const resources = [
      makeResource({ id: 'res-1', title: 'Fire Safety Training' }),
      makeResource({ id: 'res-2', title: 'Building Access Procedures' }),
    ];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByText('Fire Safety Training')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'fire' } });

    await waitFor(() => {
      expect(screen.getByText('Fire Safety Training')).toBeInTheDocument();
      expect(screen.queryByText('Building Access Procedures')).toBeNull();
    });
  });

  it('search is case insensitive', async () => {
    const resources = [
      makeResource({ id: 'res-1', title: 'Fire Safety Training' }),
    ];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByText('Fire Safety Training')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'FIRE' } });

    await waitFor(() => {
      expect(screen.getByText('Fire Safety Training')).toBeInTheDocument();
    });
  });

  // --- Category filter ---

  it('has category/type filter dropdown', async () => {
    mockFetchSuccess([]);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByLabelText(/type|category|filter/i)).toBeInTheDocument();
    });
  });

  it('filters modules by content type VIDEO', async () => {
    const resources = [
      makeResource({ id: 'res-1', title: 'Video Module', contentType: 'VIDEO' }),
      makeResource({ id: 'res-2', title: 'Doc Module', contentType: 'DOCUMENT' }),
    ];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByText('Video Module')).toBeInTheDocument();
      expect(screen.getByText('Doc Module')).toBeInTheDocument();
    });

    const filterSelect = screen.getByLabelText(/type|category|filter/i);
    fireEvent.change(filterSelect, { target: { value: 'VIDEO' } });

    await waitFor(() => {
      expect(screen.getByText('Video Module')).toBeInTheDocument();
      expect(screen.queryByText('Doc Module')).toBeNull();
    });
  });

  it('filters modules by content type DOCUMENT', async () => {
    const resources = [
      makeResource({ id: 'res-1', title: 'Video Module', contentType: 'VIDEO' }),
      makeResource({ id: 'res-2', title: 'Doc Module', contentType: 'DOCUMENT' }),
    ];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByText('Doc Module')).toBeInTheDocument();
    });

    const filterSelect = screen.getByLabelText(/type|category|filter/i);
    fireEvent.change(filterSelect, { target: { value: 'DOCUMENT' } });

    await waitFor(() => {
      expect(screen.getByText('Doc Module')).toBeInTheDocument();
      expect(screen.queryByText('Video Module')).toBeNull();
    });
  });

  it('shows all modules when All filter is selected', async () => {
    const resources = [
      makeResource({ id: 'res-1', title: 'Video Module', contentType: 'VIDEO' }),
      makeResource({ id: 'res-2', title: 'Doc Module', contentType: 'DOCUMENT' }),
    ];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByText('Video Module')).toBeInTheDocument();
    });

    const filterSelect = screen.getByLabelText(/type|category|filter/i);
    // Apply a filter first
    fireEvent.change(filterSelect, { target: { value: 'VIDEO' } });
    await waitFor(() => {
      expect(screen.queryByText('Doc Module')).toBeNull();
    });

    // Reset to all
    fireEvent.change(filterSelect, { target: { value: '' } });
    await waitFor(() => {
      expect(screen.getByText('Video Module')).toBeInTheDocument();
      expect(screen.getByText('Doc Module')).toBeInTheDocument();
    });
  });

  // --- Due date display ---

  it('shows due date when present', async () => {
    const resources = [makeResource({ dueDate: '2026-03-15T00:00:00.000Z' })];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByText(/mar/i)).toBeInTheDocument();
    });
  });

  // --- Required roles ---

  it('shows required badge when requiredForRoles is non-empty', async () => {
    const resources = [makeResource({ id: 'res-1', requiredForRoles: ['RESIDENT', 'MANAGER'] })];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByTestId('required-badge-res-1')).toBeInTheDocument();
    });
  });

  it('does not show required badge when requiredForRoles is empty', async () => {
    const resources = [makeResource({ id: 'res-1', requiredForRoles: [] })];
    mockFetchSuccess(resources);

    renderWithRouter(<TrainingLibrary />);

    await waitFor(() => {
      expect(screen.getByTestId('training-card-res-1')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('required-badge-res-1')).toBeNull();
  });
});
