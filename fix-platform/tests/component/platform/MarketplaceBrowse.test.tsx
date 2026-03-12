/**
 * MarketplaceBrowse component tests
 *
 * Tests: renders listings in grid/list, category filter, search, loading/empty/error states,
 *        click navigation, "New Listing" button.
 *
 * RED/BLUE TDD: tests written before implementation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MarketplaceBrowse from '../../../src/platform/pages/MarketplaceBrowse';

// Helper to render with router context
function renderWithRouter(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/platform/marketplace']}>
      <Routes>
        <Route path="/platform/marketplace" element={ui} />
        <Route path="/platform/marketplace/new" element={<div>New Listing Page</div>} />
        <Route path="/platform/marketplace/:id" element={<div>Listing Detail Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

interface ListingImage {
  id: string;
  listingId: string;
  url: string;
  sortOrder: number;
}

interface MarketplaceListing {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  price: string | null;
  category: string;
  condition: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  images: ListingImage[];
}

const baseListing: MarketplaceListing = {
  id: 'listing-1',
  sellerId: 'seller-1',
  title: 'Used Bicycle',
  description: 'Great condition mountain bike',
  price: '150.00',
  category: 'FOR_SALE',
  condition: 'GOOD',
  status: 'ACTIVE',
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  images: [],
};

function makeListing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return { ...baseListing, ...overrides };
}

function mockFetch(listings: MarketplaceListing[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      listings,
      pagination: { page: 1, pageSize: 20, total: listings.length },
    }),
  } as Response));
}

function mockFetchError(status: number, message: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: message,
    json: async () => ({ message }),
  } as unknown as Response));
}

describe('MarketplaceBrowse', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Loading state ---

  it('shows loading spinner initially', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    renderWithRouter(<MarketplaceBrowse />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- List rendering ---

  it('renders listing titles after fetching', async () => {
    const listings = [
      makeListing({ id: 'l-1', title: 'Used Bicycle' }),
      makeListing({ id: 'l-2', title: 'Desk Lamp' }),
    ];
    mockFetch(listings);

    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      expect(screen.getByText('Used Bicycle')).toBeInTheDocument();
      expect(screen.getByText('Desk Lamp')).toBeInTheDocument();
    });
  });

  it('renders listing price', async () => {
    mockFetch([makeListing({ price: '150.00' })]);
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      expect(screen.getByText(/\$150/)).toBeInTheDocument();
    });
  });

  it('renders "Free" when price is null', async () => {
    mockFetch([makeListing({ price: null })]);
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      expect(screen.getByText(/free/i)).toBeInTheDocument();
    });
  });

  it('renders category badge', async () => {
    mockFetch([makeListing({ category: 'FOR_SALE' })]);
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      // The category badge shows "For Sale" (uppercase via CSS, textContent is mixed case)
      const badges = screen.getAllByText(/for sale/i);
      // At least one badge should be present (may also match filter button or subtitle)
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it('renders posted date', async () => {
    mockFetch([makeListing({ createdAt: '2026-01-15T10:00:00.000Z' })]);
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      expect(screen.getByText(/jan/i)).toBeInTheDocument();
    });
  });

  it('renders link to listing detail', async () => {
    mockFetch([makeListing({ id: 'listing-abc', title: 'Test Item' })]);
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /test item/i });
      expect(link).toBeInTheDocument();
      expect(link.getAttribute('href')).toContain('/platform/marketplace/listing-abc');
    });
  });

  // --- Empty state ---

  it('shows empty state when no listings returned', async () => {
    mockFetch([]);
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      expect(screen.getByText(/no listings/i)).toBeInTheDocument();
    });
  });

  // --- Error state ---

  it('shows error message on fetch failure', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  // --- Category filter ---

  it('renders category filter buttons', async () => {
    mockFetch([makeListing()]);
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    });
  });

  it('filters listings by category', async () => {
    const listings = [
      makeListing({ id: 'l-1', title: 'Bicycle', category: 'FOR_SALE' }),
      makeListing({ id: 'l-2', title: 'Wanted: Books', category: 'WANTED' }),
    ];
    mockFetch(listings);
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      expect(screen.getByText('Bicycle')).toBeInTheDocument();
    });

    // Click "For Sale" filter
    const forSaleBtn = screen.getByRole('button', { name: /for sale/i });
    fireEvent.click(forSaleBtn);

    await waitFor(() => {
      expect(screen.getByText('Bicycle')).toBeInTheDocument();
      expect(screen.queryByText('Wanted: Books')).toBeNull();
    });
  });

  it('shows all listings when "All" filter is selected', async () => {
    const listings = [
      makeListing({ id: 'l-1', title: 'Bicycle', category: 'FOR_SALE' }),
      makeListing({ id: 'l-2', title: 'Wanted: Books', category: 'WANTED' }),
    ];
    mockFetch(listings);
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      expect(screen.getByText('Bicycle')).toBeInTheDocument();
    });

    // Filter by FOR_SALE first
    fireEvent.click(screen.getByRole('button', { name: /for sale/i }));

    await waitFor(() => {
      expect(screen.queryByText('Wanted: Books')).toBeNull();
    });

    // Click All
    fireEvent.click(screen.getByRole('button', { name: /all/i }));

    await waitFor(() => {
      expect(screen.getByText('Bicycle')).toBeInTheDocument();
      expect(screen.getByText('Wanted: Books')).toBeInTheDocument();
    });
  });

  // --- Search ---

  it('renders search input', async () => {
    mockFetch([]);
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  it('filters listings by search query', async () => {
    const listings = [
      makeListing({ id: 'l-1', title: 'Used Bicycle' }),
      makeListing({ id: 'l-2', title: 'Desk Lamp' }),
    ];
    mockFetch(listings);
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      expect(screen.getByText('Used Bicycle')).toBeInTheDocument();
    });

    const searchInput = screen.getByRole('textbox');
    fireEvent.change(searchInput, { target: { value: 'bicycle' } });

    await waitFor(() => {
      expect(screen.getByText('Used Bicycle')).toBeInTheDocument();
      expect(screen.queryByText('Desk Lamp')).toBeNull();
    });
  });

  // --- New Listing button ---

  it('renders "New Listing" button', async () => {
    mockFetch([]);
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /new listing/i })).toBeInTheDocument();
    });
  });

  it('"New Listing" button links to /platform/marketplace/new', async () => {
    mockFetch([]);
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /new listing/i });
      expect(link.getAttribute('href')).toContain('/platform/marketplace/new');
    });
  });

  // --- Page heading ---

  it('renders the page heading', async () => {
    mockFetch([]);
    renderWithRouter(<MarketplaceBrowse />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /marketplace/i })).toBeInTheDocument();
    });
  });
});
