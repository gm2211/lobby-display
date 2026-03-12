/**
 * DirectoryPage component tests.
 *
 * Tests cover:
 * - Renders directory entries in card layout
 * - Displays entry fields: name, unit, phone, email, boardMember badge, role
 * - Search by name (filters client-side)
 * - Search by unit (filters client-side)
 * - Floor filter (filters client-side by first char of unit)
 * - Alphabetical sort by name
 * - Loading state
 * - Empty state
 * - Error state
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DirectoryPage from '../../../src/platform/pages/DirectoryPage';
import type { DirectoryEntry } from '../../../src/platform/types';

// --- Helpers ---

function makeEntry(overrides: Partial<DirectoryEntry> = {}, index = 0): DirectoryEntry {
  return {
    id: `entry-${index}`,
    userId: `user-${index}`,
    displayName: `Resident ${String.fromCharCode(65 + index)}`, // Resident A, B, C...
    title: null,
    department: null,
    phone: `555-000${index}`,
    email: `resident${index}@example.com`,
    photoUrl: null,
    visible: true,
    sortOrder: index,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    boardMember: false,
    user: {
      id: `user-${index}`,
      role: 'RESIDENT',
      unitNumber: `${index + 1}A`,
    },
    ...overrides,
  };
}

function makeEntries(count: number, overrides: Partial<DirectoryEntry> = {}): DirectoryEntry[] {
  return Array.from({ length: count }, (_, i) => makeEntry(overrides, i));
}

function mockFetchSuccess(data: unknown) {
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

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// --- Tests ---

describe('DirectoryPage', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // --- Loading state ---

  it('shows loading spinner while fetching', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    renderWithRouter(<DirectoryPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Rendering ---

  it('renders directory page heading', async () => {
    mockFetchSuccess([]);
    renderWithRouter(<DirectoryPage />);
    await waitFor(() => {
      expect(screen.getByText('Directory')).toBeInTheDocument();
    });
  });

  it('renders directory entries as cards', async () => {
    const entries = makeEntries(3);
    mockFetchSuccess(entries);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText('Resident A')).toBeInTheDocument();
      expect(screen.getByText('Resident B')).toBeInTheDocument();
      expect(screen.getByText('Resident C')).toBeInTheDocument();
    });
  });

  it('shows display name for each entry', async () => {
    const entries = [makeEntry({ displayName: 'John Smith' }, 0)];
    mockFetchSuccess(entries);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });
  });

  it('shows unit number for each entry', async () => {
    const entries = [makeEntry({ user: { id: 'u1', role: 'RESIDENT', unitNumber: '12C' } }, 0)];
    mockFetchSuccess(entries);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText('12C')).toBeInTheDocument();
    });
  });

  it('shows phone number when available', async () => {
    const entries = [makeEntry({ phone: '555-1234' }, 0)];
    mockFetchSuccess(entries);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText('555-1234')).toBeInTheDocument();
    });
  });

  it('shows email when available', async () => {
    const entries = [makeEntry({ email: 'john@example.com' }, 0)];
    mockFetchSuccess(entries);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
    });
  });

  it('shows board member badge for board members', async () => {
    const entries = [makeEntry({ boardMember: true }, 0)];
    mockFetchSuccess(entries);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/board member/i)).toBeInTheDocument();
    });
  });

  it('does not show board member badge for regular residents', async () => {
    const entries = [makeEntry({ boardMember: false }, 0)];
    mockFetchSuccess(entries);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.queryByText(/board member/i)).not.toBeInTheDocument();
    });
  });

  it('shows role label for each entry', async () => {
    const entries = [makeEntry({ user: { id: 'u1', role: 'MANAGER', unitNumber: '1A' } }, 0)];
    mockFetchSuccess(entries);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/manager/i)).toBeInTheDocument();
    });
  });

  // --- Empty state ---

  it('shows empty state when no entries', async () => {
    mockFetchSuccess([]);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/no residents found/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when search returns no results', async () => {
    const entries = [makeEntry({ displayName: 'Alice Smith' }, 0)];
    mockFetchSuccess(entries);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'Zzz No Match' } });

    expect(screen.getByText(/no residents found/i)).toBeInTheDocument();
  });

  // --- Error state ---

  it('shows error message when fetch fails', async () => {
    mockFetchError(500, 'Server error');
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows retry button when fetch fails', async () => {
    mockFetchError(500, 'Server error');
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  // --- Search by name ---

  it('renders search input', async () => {
    mockFetchSuccess([]);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });

  it('filters entries by name (case-insensitive)', async () => {
    const entries = [
      makeEntry({ displayName: 'Alice Smith' }, 0),
      makeEntry({ displayName: 'Bob Jones' }, 1),
      makeEntry({ displayName: 'Charlie Brown' }, 2),
    ];
    mockFetchSuccess(entries);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'alice' } });

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
    expect(screen.queryByText('Charlie Brown')).not.toBeInTheDocument();
  });

  // --- Search by unit ---

  it('filters entries by unit number', async () => {
    const entries = [
      makeEntry({ displayName: 'Apt 3A Resident', user: { id: 'u1', role: 'RESIDENT', unitNumber: '3A' } }, 0),
      makeEntry({ displayName: 'Apt 7B Resident', user: { id: 'u2', role: 'RESIDENT', unitNumber: '7B' } }, 1),
    ];
    mockFetchSuccess(entries);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText('Apt 3A Resident')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: '3A' } });

    expect(screen.getByText('Apt 3A Resident')).toBeInTheDocument();
    expect(screen.queryByText('Apt 7B Resident')).not.toBeInTheDocument();
  });

  // --- Floor filter ---

  it('renders floor filter select', async () => {
    mockFetchSuccess([]);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/floor/i)).toBeInTheDocument();
    });
  });

  it('floor filter populates floors derived from entries', async () => {
    const entries = [
      makeEntry({ user: { id: 'u1', role: 'RESIDENT', unitNumber: '3A' } }, 0),
      makeEntry({ user: { id: 'u2', role: 'RESIDENT', unitNumber: '7B' } }, 1),
    ];
    mockFetchSuccess(entries);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      const select = screen.getByLabelText(/floor/i) as HTMLSelectElement;
      const opts = Array.from(select.options).map(o => o.value);
      expect(opts).toContain('3');
      expect(opts).toContain('7');
    });
  });

  it('filters entries by floor', async () => {
    const entries = [
      makeEntry({ displayName: 'Floor 3 Resident', user: { id: 'u1', role: 'RESIDENT', unitNumber: '3A' } }, 0),
      makeEntry({ displayName: 'Floor 7 Resident', user: { id: 'u2', role: 'RESIDENT', unitNumber: '7B' } }, 1),
    ];
    mockFetchSuccess(entries);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText('Floor 3 Resident')).toBeInTheDocument();
    });

    const floorSelect = screen.getByLabelText(/floor/i);
    fireEvent.change(floorSelect, { target: { value: '3' } });

    expect(screen.getByText('Floor 3 Resident')).toBeInTheDocument();
    expect(screen.queryByText('Floor 7 Resident')).not.toBeInTheDocument();
  });

  // --- Alphabetical sort ---

  it('displays entries in alphabetical order by name', async () => {
    const entries = [
      makeEntry({ displayName: 'Zara Wells' }, 0),
      makeEntry({ displayName: 'Alice Chen' }, 1),
      makeEntry({ displayName: 'Mike Torres' }, 2),
    ];
    mockFetchSuccess(entries);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText('Zara Wells')).toBeInTheDocument();
    });

    const cards = screen.getAllByTestId(/^directory-entry-/);
    const names = cards.map(card => card.querySelector('[data-testid="entry-name"]')?.textContent);
    expect(names[0]).toBe('Alice Chen');
    expect(names[1]).toBe('Mike Torres');
    expect(names[2]).toBe('Zara Wells');
  });

  // --- Entry count ---

  it('shows count of displayed entries', async () => {
    const entries = makeEntries(5);
    mockFetchSuccess(entries);
    renderWithRouter(<DirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/5 residents/i)).toBeInTheDocument();
    });
  });
});
