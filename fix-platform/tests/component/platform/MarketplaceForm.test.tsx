/**
 * MarketplaceForm component tests — RED/BLUE TDD
 *
 * Tests cover:
 * - Create mode: renders empty form at /platform/marketplace/new
 * - Edit mode: loads data at /platform/marketplace/:id/edit
 * - Validates required fields (title, description, contactInfo)
 * - Submits create (POST /api/platform/marketplace)
 * - Submits edit (PUT /api/platform/marketplace/:id)
 * - Handles API errors with inline messages
 * - Cancel navigation back to marketplace list
 * - Loading spinner while fetching in edit mode
 * - Price field hidden for Wanted and Free categories
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MarketplaceForm from '../../../src/platform/pages/MarketplaceForm';
import type { MarketplaceListing } from '../../../src/platform/types';

// --- Helpers ---

const baseListing: MarketplaceListing = {
  id: 'listing-123',
  title: 'Vintage Lamp',
  description: 'A beautiful vintage lamp in great condition.',
  category: 'FOR_SALE',
  price: 50,
  contactMethod: 'MESSAGE',
  contactInfo: 'John Doe',
  authorId: 'user-1',
  authorName: 'John Doe',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeListing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return { ...baseListing, ...overrides };
}

function renderCreateForm() {
  return render(
    <MemoryRouter initialEntries={['/platform/marketplace/new']}>
      <Routes>
        <Route path="/platform/marketplace/new" element={<MarketplaceForm />} />
        <Route path="/platform/marketplace" element={<div>Marketplace List</div>} />
        <Route path="/platform/marketplace/:id" element={<div data-testid="listing-detail">Listing Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderEditForm(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/platform/marketplace/${id}/edit`]}>
      <Routes>
        <Route path="/platform/marketplace/:id/edit" element={<MarketplaceForm />} />
        <Route path="/platform/marketplace" element={<div>Marketplace List</div>} />
        <Route path="/platform/marketplace/:id" element={<div data-testid="listing-detail">Listing Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function mockFetchCreate(createdListing: MarketplaceListing = makeListing()) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes('/csrf')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: 'test-csrf' }),
      } as Response);
    }
    if (opts?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(createdListing),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(createdListing),
    } as Response);
  }));
}

function mockFetchEdit(listing: MarketplaceListing = makeListing()) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes('/csrf')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: 'test-csrf' }),
      } as Response);
    }
    if (opts?.method === 'PUT') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(listing),
      } as Response);
    }
    // GET listing by id
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(listing),
    } as Response);
  }));
}

function mockFetchError(status = 500, message = 'Server error') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: message,
    json: () => Promise.resolve({ message }),
  } as unknown as Response));
}

// --- Tests ---

describe('MarketplaceForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Create mode: renders empty form ---

  it('renders heading for create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByRole('heading', { name: /create listing|new listing/i })).toBeInTheDocument();
  });

  it('renders title input empty in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
    expect(titleInput.value).toBe('');
  });

  it('renders description textarea empty in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    const descInput = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
    expect(descInput.value).toBe('');
  });

  it('renders category select in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
  });

  it('renders category options (For Sale, Wanted, Free, Services)', () => {
    mockFetchCreate();
    renderCreateForm();
    const select = screen.getByLabelText(/category/i) as HTMLSelectElement;
    const options = Array.from(select.options).map(o => o.text);
    expect(options).toContain('For Sale');
    expect(options).toContain('Wanted');
    expect(options).toContain('Free');
    expect(options).toContain('Services');
  });

  it('renders price input in create mode (default category is FOR_SALE)', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByLabelText(/price/i)).toBeInTheDocument();
  });

  it('renders contact method select in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByLabelText(/contact method/i)).toBeInTheDocument();
  });

  it('renders contact method options (Message, Email, Phone)', () => {
    mockFetchCreate();
    renderCreateForm();
    const select = screen.getByLabelText(/contact method/i) as HTMLSelectElement;
    const options = Array.from(select.options).map(o => o.text);
    expect(options).toContain('Message');
    expect(options).toContain('Email');
    expect(options).toContain('Phone');
  });

  it('renders contact info input in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByLabelText(/contact info/i)).toBeInTheDocument();
  });

  it('renders active checkbox checked by default in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    const activeCheckbox = screen.getByLabelText(/active/i) as HTMLInputElement;
    expect(activeCheckbox.checked).toBe(true);
  });

  it('renders submit button in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByRole('button', { name: /create listing|save|submit/i })).toBeInTheDocument();
  });

  it('renders cancel button in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  // --- Price visibility ---

  it('hides price field when category is Wanted', () => {
    mockFetchCreate();
    renderCreateForm();
    const categorySelect = screen.getByLabelText(/category/i);
    fireEvent.change(categorySelect, { target: { value: 'WANTED' } });
    expect(screen.queryByLabelText(/price/i)).toBeNull();
  });

  it('hides price field when category is Free', () => {
    mockFetchCreate();
    renderCreateForm();
    const categorySelect = screen.getByLabelText(/category/i);
    fireEvent.change(categorySelect, { target: { value: 'FREE' } });
    expect(screen.queryByLabelText(/price/i)).toBeNull();
  });

  it('shows price field when category is For Sale', () => {
    mockFetchCreate();
    renderCreateForm();
    const categorySelect = screen.getByLabelText(/category/i);
    fireEvent.change(categorySelect, { target: { value: 'FOR_SALE' } });
    expect(screen.getByLabelText(/price/i)).toBeInTheDocument();
  });

  it('shows price field when category is Services', () => {
    mockFetchCreate();
    renderCreateForm();
    const categorySelect = screen.getByLabelText(/category/i);
    fireEvent.change(categorySelect, { target: { value: 'SERVICES' } });
    expect(screen.getByLabelText(/price/i)).toBeInTheDocument();
  });

  // --- Validation ---

  it('shows error when title is empty on submit', async () => {
    mockFetchCreate();
    renderCreateForm();

    const submitBtn = screen.getByRole('button', { name: /create listing|save|submit/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/title.*required|required.*title/i)).toBeInTheDocument();
    });
  });

  it('shows error when description is empty on submit', async () => {
    mockFetchCreate();
    renderCreateForm();

    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: 'Vintage Lamp' } });

    const submitBtn = screen.getByRole('button', { name: /create listing|save|submit/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/description.*required|required.*description/i)).toBeInTheDocument();
    });
  });

  it('shows error when contact info is empty on submit', async () => {
    mockFetchCreate();
    renderCreateForm();

    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: 'Vintage Lamp' } });
    const descInput = screen.getByLabelText(/description/i);
    fireEvent.change(descInput, { target: { value: 'A lamp.' } });

    const submitBtn = screen.getByRole('button', { name: /create listing|save|submit/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/contact info.*required|required.*contact/i)).toBeInTheDocument();
    });
  });

  // --- Create submission ---

  it('submits create form with POST to /api/platform/marketplace', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeListing({ id: 'listing-new' })) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeListing()) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCreateForm();

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Vintage Lamp' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'A beautiful vintage lamp.' } });
    fireEvent.change(screen.getByLabelText(/contact info/i), { target: { value: 'John Doe' } });

    fireEvent.click(screen.getByRole('button', { name: /create listing|save|submit/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([u, o]: [unknown, RequestInit | undefined]) =>
          String(u).includes('/api/platform/marketplace') && o?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('navigates to listing detail after successful create', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeListing({ id: 'listing-new' })) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeListing()) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCreateForm();

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Vintage Lamp' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'A beautiful vintage lamp.' } });
    fireEvent.change(screen.getByLabelText(/contact info/i), { target: { value: 'John Doe' } });

    fireEvent.click(screen.getByRole('button', { name: /create listing|save|submit/i }));

    await waitFor(() => {
      expect(screen.getByTestId('listing-detail')).toBeInTheDocument();
    });
  });

  // --- Edit mode: loads data ---

  it('shows loading spinner while fetching listing in edit mode', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    renderEditForm('listing-123');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders heading for edit mode', async () => {
    mockFetchEdit(makeListing({ id: 'listing-123', title: 'Vintage Lamp' }));
    renderEditForm('listing-123');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /edit listing/i })).toBeInTheDocument();
    });
  });

  it('populates title input with existing value in edit mode', async () => {
    mockFetchEdit(makeListing({ id: 'listing-123', title: 'Vintage Lamp' }));
    renderEditForm('listing-123');

    await waitFor(() => {
      const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
      expect(titleInput.value).toBe('Vintage Lamp');
    });
  });

  it('populates description with existing value in edit mode', async () => {
    mockFetchEdit(makeListing({ id: 'listing-123', description: 'A beautiful vintage lamp.' }));
    renderEditForm('listing-123');

    await waitFor(() => {
      const descInput = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
      expect(descInput.value).toBe('A beautiful vintage lamp.');
    });
  });

  it('populates category with existing value in edit mode', async () => {
    mockFetchEdit(makeListing({ id: 'listing-123', category: 'SERVICES' }));
    renderEditForm('listing-123');

    await waitFor(() => {
      const categorySelect = screen.getByLabelText(/category/i) as HTMLSelectElement;
      expect(categorySelect.value).toBe('SERVICES');
    });
  });

  it('hides price field when loaded listing category is Wanted', async () => {
    mockFetchEdit(makeListing({ id: 'listing-123', category: 'WANTED', price: null }));
    renderEditForm('listing-123');

    await waitFor(() => {
      expect(screen.queryByLabelText(/price/i)).toBeNull();
    });
  });

  it('populates contact method with existing value in edit mode', async () => {
    mockFetchEdit(makeListing({ id: 'listing-123', contactMethod: 'EMAIL' }));
    renderEditForm('listing-123');

    await waitFor(() => {
      const methodSelect = screen.getByLabelText(/contact method/i) as HTMLSelectElement;
      expect(methodSelect.value).toBe('EMAIL');
    });
  });

  it('populates contact info with existing value in edit mode', async () => {
    mockFetchEdit(makeListing({ id: 'listing-123', contactInfo: 'john@example.com' }));
    renderEditForm('listing-123');

    await waitFor(() => {
      const contactInfoInput = screen.getByLabelText(/contact info/i) as HTMLInputElement;
      expect(contactInfoInput.value).toBe('john@example.com');
    });
  });

  it('populates active checkbox with existing value in edit mode', async () => {
    mockFetchEdit(makeListing({ id: 'listing-123', active: false }));
    renderEditForm('listing-123');

    await waitFor(() => {
      const activeCheckbox = screen.getByLabelText(/active/i) as HTMLInputElement;
      expect(activeCheckbox.checked).toBe(false);
    });
  });

  // --- Edit submission ---

  it('submits edit form with PUT to /api/platform/marketplace/:id', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeListing({ id: 'listing-123' })) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeListing({ id: 'listing-123' })) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditForm('listing-123');

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    });

    // Update title
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Updated Lamp' } });

    fireEvent.click(screen.getByRole('button', { name: /save|update|submit/i }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([u, o]: [unknown, RequestInit | undefined]) =>
          String(u).includes('/api/platform/marketplace/listing-123') && o?.method === 'PUT'
      );
      expect(putCall).toBeTruthy();
    });
  });

  it('navigates to listing detail after successful edit', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeListing({ id: 'listing-123' })) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeListing({ id: 'listing-123' })) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditForm('listing-123');

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save|update|submit/i }));

    await waitFor(() => {
      expect(screen.getByTestId('listing-detail')).toBeInTheDocument();
    });
  });

  // --- Error handling ---

  it('shows error message when create API fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Server Error',
          json: () => Promise.resolve({ message: 'Failed to create listing' }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeListing()) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCreateForm();

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Lamp' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Test description' } });
    fireEvent.change(screen.getByLabelText(/contact info/i), { target: { value: 'John' } });

    fireEvent.click(screen.getByRole('button', { name: /create listing|save|submit/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows error message when edit API fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Server Error',
          json: () => Promise.resolve({ message: 'Failed to update listing' }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeListing({ id: 'listing-123' })) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditForm('listing-123');

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save|update|submit/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows error message when fetch listing fails in edit mode', async () => {
    mockFetchError(404, 'Listing not found');
    renderEditForm('nonexistent');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // --- Cancel navigation ---

  it('navigates back to marketplace list when cancel is clicked in create mode', async () => {
    mockFetchCreate();
    renderCreateForm();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.getByText('Marketplace List')).toBeInTheDocument();
    });
  });

  it('navigates back to marketplace list when cancel is clicked in edit mode', async () => {
    mockFetchEdit();
    renderEditForm('listing-123');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.getByText('Marketplace List')).toBeInTheDocument();
    });
  });
});
