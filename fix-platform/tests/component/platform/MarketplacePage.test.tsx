/**
 * MarketplacePage component tests (TDD — Red/Blue)
 *
 * Tests: category sidebar, listing grid, search, price range filter,
 *        navigation links, loading/empty/error states, new listing button.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MarketplacePage from '../../../src/platform/pages/MarketplacePage';
import type { MarketplaceListing } from '../../../src/platform/types';

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// ---- Fixtures ----

const listing1: MarketplaceListing = {
  id: 'listing-1',
  title: 'Vintage Lamp',
  description: 'Beautiful lamp in great condition',
  category: 'FOR_SALE',
  price: 50,
  contactMethod: 'MESSAGE',
  contactInfo: 'Alice Smith',
  authorId: 'user-1',
  authorName: 'Alice Smith',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const listing2: MarketplaceListing = {
  id: 'listing-2',
  title: 'Free Moving Boxes',
  description: 'Leftover moving boxes, free to good home',
  category: 'FREE',
  price: null,
  contactMethod: 'EMAIL',
  contactInfo: 'bob@example.com',
  authorId: 'user-2',
  authorName: 'Bob Jones',
  active: true,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const listing3: MarketplaceListing = {
  id: 'listing-3',
  title: 'Need a Plumber',
  description: 'Looking for a reliable plumber for bathroom renovation',
  category: 'WANTED',
  price: null,
  contactMethod: 'PHONE',
  contactInfo: '+1 555 123 4567',
  authorId: 'user-3',
  authorName: 'Carol Davis',
  active: true,
  createdAt: '2026-01-03T00:00:00.000Z',
  updatedAt: '2026-01-03T00:00:00.000Z',
};

const listing4: MarketplaceListing = {
  id: 'listing-4',
  title: 'Dog Walking Services',
  description: 'Professional dog walking, $20/hour',
  category: 'SERVICES',
  price: 20,
  contactMethod: 'MESSAGE',
  contactInfo: 'Dave Wilson',
  authorId: 'user-4',
  authorName: 'Dave Wilson',
  active: true,
  createdAt: '2026-01-04T00:00:00.000Z',
  updatedAt: '2026-01-04T00:00:00.000Z',
};

function mockFetchSuccess(listings: MarketplaceListing[]) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => listings,
  } as Response);
}

function mockFetchError() {
  vi.mocked(fetch).mockResolvedValue({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    json: async () => ({ error: 'Server Error' }),
  } as Response);
}

describe('MarketplacePage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Loading state ----

  it('shows loading spinner initially', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<MarketplacePage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // ---- Page heading ----

  it('renders the page heading "Marketplace"', async () => {
    mockFetchSuccess([listing1]);
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /marketplace/i })).toBeInTheDocument();
    });
  });

  // ---- "New Listing" button ----

  it('renders a "New Listing" link pointing to /platform/marketplace/new', async () => {
    mockFetchSuccess([listing1]);
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /new listing/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/platform/marketplace/new');
    });
  });

  // ---- Listing grid rendering ----

  it('renders listing titles', async () => {
    mockFetchSuccess([listing1, listing2]);
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      expect(screen.getByText('Vintage Lamp')).toBeInTheDocument();
      expect(screen.getByText('Free Moving Boxes')).toBeInTheDocument();
    });
  });

  it('renders listing price when price is set', async () => {
    mockFetchSuccess([listing1]);
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      expect(screen.getByText(/\$50/)).toBeInTheDocument();
    });
  });

  it('renders "Free" when price is null', async () => {
    mockFetchSuccess([listing2]);
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      // The price display should show "Free" — look for it in the card
      const card = screen.getByTestId('listing-card-listing-2');
      expect(card).toHaveTextContent(/free/i);
    });
  });

  it('renders category badge for each listing', async () => {
    mockFetchSuccess([listing1]);
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      // Verify the card contains the category badge text
      const card = screen.getByTestId('listing-card-listing-1');
      expect(card).toHaveTextContent(/for sale/i);
    });
  });

  it('renders seller name for each listing', async () => {
    mockFetchSuccess([listing1]);
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      expect(screen.getByText(/alice smith/i)).toBeInTheDocument();
    });
  });

  // ---- Listing navigation ----

  it('listing card links to detail page /platform/marketplace/:id', async () => {
    mockFetchSuccess([listing1]);
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /vintage lamp/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/platform/marketplace/listing-1');
    });
  });

  // ---- Category filter sidebar ----

  it('renders category filter sidebar with all categories', async () => {
    mockFetchSuccess([listing1, listing2, listing3, listing4]);
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      // The sidebar has buttons for each category
      expect(screen.getByRole('button', { name: /^for sale$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^wanted$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^free$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^services$/i })).toBeInTheDocument();
    });
  });

  it('renders an "All" option in category sidebar', async () => {
    mockFetchSuccess([listing1]);
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    });
  });

  it('filters listings by category when category is clicked', async () => {
    mockFetchSuccess([listing1, listing2, listing3, listing4]);
    renderWithRouter(<MarketplacePage />);

    await waitFor(() => {
      expect(screen.getByText('Vintage Lamp')).toBeInTheDocument();
      expect(screen.getByText('Free Moving Boxes')).toBeInTheDocument();
    });

    // Click FREE category
    const freeButton = screen.getByRole('button', { name: /^free$/i });
    fireEvent.click(freeButton);

    await waitFor(() => {
      expect(screen.queryByText('Vintage Lamp')).not.toBeInTheDocument();
      expect(screen.getByText('Free Moving Boxes')).toBeInTheDocument();
    });
  });

  it('resets category filter when "All" is clicked', async () => {
    mockFetchSuccess([listing1, listing2]);
    renderWithRouter(<MarketplacePage />);

    await waitFor(() => {
      expect(screen.getByText('Vintage Lamp')).toBeInTheDocument();
    });

    // Filter to FOR_SALE
    const forSaleButton = screen.getByRole('button', { name: /for sale/i });
    fireEvent.click(forSaleButton);

    await waitFor(() => {
      expect(screen.queryByText('Free Moving Boxes')).not.toBeInTheDocument();
    });

    // Reset to all
    fireEvent.click(screen.getByRole('button', { name: /all/i }));

    await waitFor(() => {
      expect(screen.getByText('Vintage Lamp')).toBeInTheDocument();
      expect(screen.getByText('Free Moving Boxes')).toBeInTheDocument();
    });
  });

  // ---- Search ----

  it('renders a search input', async () => {
    mockFetchSuccess([listing1]);
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });

  it('filters listings by title search (client-side)', async () => {
    mockFetchSuccess([listing1, listing2]);
    renderWithRouter(<MarketplacePage />);

    await waitFor(() => {
      expect(screen.getByText('Vintage Lamp')).toBeInTheDocument();
      expect(screen.getByText('Free Moving Boxes')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'lamp' } });

    expect(screen.getByText('Vintage Lamp')).toBeInTheDocument();
    expect(screen.queryByText('Free Moving Boxes')).not.toBeInTheDocument();
  });

  it('filters listings by description search (client-side)', async () => {
    mockFetchSuccess([listing1, listing2]);
    renderWithRouter(<MarketplacePage />);

    await waitFor(() => {
      expect(screen.getByText('Vintage Lamp')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'moving' } });

    expect(screen.queryByText('Vintage Lamp')).not.toBeInTheDocument();
    expect(screen.getByText('Free Moving Boxes')).toBeInTheDocument();
  });

  it('search is case-insensitive', async () => {
    mockFetchSuccess([listing1]);
    renderWithRouter(<MarketplacePage />);

    await waitFor(() => {
      expect(screen.getByText('Vintage Lamp')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'VINTAGE' } });

    expect(screen.getByText('Vintage Lamp')).toBeInTheDocument();
  });

  // ---- Price range filter ----

  it('renders min price input', async () => {
    mockFetchSuccess([listing1]);
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/min/i)).toBeInTheDocument();
    });
  });

  it('renders max price input', async () => {
    mockFetchSuccess([listing1]);
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/max/i)).toBeInTheDocument();
    });
  });

  it('filters out listings below min price', async () => {
    mockFetchSuccess([listing1, listing4]); // listing1: $50, listing4: $20
    renderWithRouter(<MarketplacePage />);

    await waitFor(() => {
      expect(screen.getByText('Vintage Lamp')).toBeInTheDocument();
      expect(screen.getByText('Dog Walking Services')).toBeInTheDocument();
    });

    const minInput = screen.getByPlaceholderText(/min/i);
    fireEvent.change(minInput, { target: { value: '30' } });

    await waitFor(() => {
      expect(screen.getByText('Vintage Lamp')).toBeInTheDocument();
      expect(screen.queryByText('Dog Walking Services')).not.toBeInTheDocument();
    });
  });

  it('filters out listings above max price', async () => {
    mockFetchSuccess([listing1, listing4]); // listing1: $50, listing4: $20
    renderWithRouter(<MarketplacePage />);

    await waitFor(() => {
      expect(screen.getByText('Vintage Lamp')).toBeInTheDocument();
      expect(screen.getByText('Dog Walking Services')).toBeInTheDocument();
    });

    const maxInput = screen.getByPlaceholderText(/max/i);
    fireEvent.change(maxInput, { target: { value: '30' } });

    await waitFor(() => {
      expect(screen.queryByText('Vintage Lamp')).not.toBeInTheDocument();
      expect(screen.getByText('Dog Walking Services')).toBeInTheDocument();
    });
  });

  it('includes free listings (null price) when min price filter is set', async () => {
    mockFetchSuccess([listing1, listing2]); // listing1: $50, listing2: free (null)
    renderWithRouter(<MarketplacePage />);

    await waitFor(() => {
      expect(screen.getByText('Free Moving Boxes')).toBeInTheDocument();
    });

    const minInput = screen.getByPlaceholderText(/min/i);
    fireEvent.change(minInput, { target: { value: '10' } });

    // Free listings (null price) should still be visible
    await waitFor(() => {
      expect(screen.getByText('Free Moving Boxes')).toBeInTheDocument();
    });
  });

  // ---- Empty state ----

  it('shows empty state when no listings exist', async () => {
    mockFetchSuccess([]);
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      expect(screen.getByText(/no listings/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when filters produce no results', async () => {
    mockFetchSuccess([listing1]);
    renderWithRouter(<MarketplacePage />);

    await waitFor(() => {
      expect(screen.getByText('Vintage Lamp')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });

    expect(screen.queryByText('Vintage Lamp')).not.toBeInTheDocument();
    expect(screen.getByText(/no listings/i)).toBeInTheDocument();
  });

  // ---- Error state ----

  it('shows error message on fetch failure', async () => {
    mockFetchError();
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockFetchError();
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('retries fetch on retry button click', async () => {
    mockFetchError();
    renderWithRouter(<MarketplacePage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    // Reset mock to return success on retry
    mockFetchSuccess([listing1]);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Vintage Lamp')).toBeInTheDocument();
    });
  });

  // ---- Thumbnail placeholder ----

  it('renders a thumbnail placeholder for each listing', async () => {
    mockFetchSuccess([listing1]);
    renderWithRouter(<MarketplacePage />);
    await waitFor(() => {
      expect(screen.getByTestId('listing-thumbnail-listing-1')).toBeInTheDocument();
    });
  });
});
