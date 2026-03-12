/**
 * MarketplaceDetail component tests
 *
 * Tests: renders listing info, contact section, edit link, back link,
 *        loading/error/not-found states.
 *
 * RED/BLUE TDD: tests written before implementation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MarketplaceDetail from '../../../src/platform/pages/MarketplaceDetail';

// Helper to render with router and path params
function renderWithParams(id: string, currentSellerId?: string) {
  return render(
    <MemoryRouter initialEntries={[`/platform/marketplace/${id}`]}>
      <Routes>
        <Route path="/platform/marketplace/:id" element={<MarketplaceDetail currentSellerId={currentSellerId} />} />
        <Route path="/platform/marketplace" element={<div>Marketplace List</div>} />
        <Route path="/platform/marketplace/:id/edit" element={<div>Edit Listing</div>} />
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
  id: 'listing-abc',
  sellerId: 'seller-1',
  title: 'Used Mountain Bike',
  description: 'Great condition mountain bike, barely used.',
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

function mockFetch(listing: MarketplaceListing) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => listing,
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

describe('MarketplaceDetail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Loading state ---

  it('shows loading spinner initially', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    renderWithParams('listing-abc');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Not found / error states ---

  it('shows not-found state when listing returns 404', async () => {
    mockFetchError(404, 'Listing not found');
    renderWithParams('nonexistent-id');

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });

  it('shows error state when fetch fails with server error', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithParams('listing-abc');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithParams('listing-abc');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  // --- Listing info ---

  it('renders listing title as h1', async () => {
    mockFetch(makeListing({ title: 'Used Mountain Bike' }));
    renderWithParams('listing-abc');

    await waitFor(() => {
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.textContent).toBe('Used Mountain Bike');
    });
  });

  it('renders listing description', async () => {
    mockFetch(makeListing({ description: 'Great condition mountain bike, barely used.' }));
    renderWithParams('listing-abc');

    await waitFor(() => {
      expect(screen.getByText(/great condition mountain bike/i)).toBeInTheDocument();
    });
  });

  it('renders category badge', async () => {
    mockFetch(makeListing({ category: 'FOR_SALE' }));
    renderWithParams('listing-abc');

    await waitFor(() => {
      expect(screen.getByText(/for sale/i)).toBeInTheDocument();
    });
  });

  it('renders price when set', async () => {
    mockFetch(makeListing({ price: '150.00' }));
    renderWithParams('listing-abc');

    await waitFor(() => {
      expect(screen.getByText(/\$150/)).toBeInTheDocument();
    });
  });

  it('renders "Free" when price is null', async () => {
    mockFetch(makeListing({ price: null }));
    renderWithParams('listing-abc');

    await waitFor(() => {
      expect(screen.getByText(/free/i)).toBeInTheDocument();
    });
  });

  it('renders active status', async () => {
    mockFetch(makeListing({ status: 'ACTIVE' }));
    renderWithParams('listing-abc');

    await waitFor(() => {
      expect(screen.getByText(/active/i)).toBeInTheDocument();
    });
  });

  it('renders sold status', async () => {
    mockFetch(makeListing({ status: 'SOLD' }));
    renderWithParams('listing-abc');

    await waitFor(() => {
      expect(screen.getByText(/sold/i)).toBeInTheDocument();
    });
  });

  it('renders posted date', async () => {
    mockFetch(makeListing({ createdAt: '2026-01-15T10:00:00.000Z' }));
    renderWithParams('listing-abc');

    await waitFor(() => {
      expect(screen.getByText(/jan/i)).toBeInTheDocument();
    });
  });

  // --- Contact section ---

  it('renders contact section', async () => {
    mockFetch(makeListing());
    renderWithParams('listing-abc');

    await waitFor(() => {
      const contactElements = screen.getAllByText(/contact/i);
      expect(contactElements.length).toBeGreaterThan(0);
    });
  });

  // --- Edit link ---

  it('shows edit link when current user is the seller', async () => {
    mockFetch(makeListing({ sellerId: 'seller-1' }));
    renderWithParams('listing-abc', 'seller-1');

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /edit/i })).toBeInTheDocument();
    });
  });

  it('does not show edit link when current user is not the seller', async () => {
    mockFetch(makeListing({ sellerId: 'seller-1' }));
    renderWithParams('listing-abc', 'other-user');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    expect(screen.queryByRole('link', { name: /edit/i })).toBeNull();
  });

  it('does not show edit link when no current user', async () => {
    mockFetch(makeListing({ sellerId: 'seller-1' }));
    renderWithParams('listing-abc');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    expect(screen.queryByRole('link', { name: /edit/i })).toBeNull();
  });

  // --- Back link ---

  it('renders back link to marketplace list', async () => {
    mockFetch(makeListing());
    renderWithParams('listing-abc');

    await waitFor(() => {
      expect(screen.getByText(/back to marketplace/i)).toBeInTheDocument();
    });
  });

  // --- Condition ---

  it('renders condition when present', async () => {
    mockFetch(makeListing({ condition: 'GOOD' }));
    renderWithParams('listing-abc');

    await waitFor(() => {
      expect(screen.getByText(/good/i)).toBeInTheDocument();
    });
  });
});
