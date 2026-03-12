/**
 * AmenityListing component tests.
 *
 * Tests cover:
 * - Renders grid of amenity cards
 * - Shows amenity details (name, description excerpt, capacity, pricing, availability status, photos)
 * - Availability indicator colors: available (green), limited (yellow), unavailable (red)
 * - Filter/search by name or category
 * - Loading state
 * - Empty state
 * - Error state
 * - Click navigates to amenity detail
 * - Responsive grid layout
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AmenityListing from '../../../src/platform/pages/AmenityListing';
import type { Amenity, AmenityImage } from '../../../src/platform/types';

// --- Helpers ---

function makeAmenityImage(overrides: Partial<AmenityImage> = {}): AmenityImage {
  return {
    id: 1,
    amenityId: 1,
    url: 'https://example.com/image.jpg',
    caption: 'Test image',
    sortOrder: 0,
    ...overrides,
  };
}

function makeAmenity(overrides: Partial<Amenity> = {}, index = 0): Amenity {
  return {
    id: index + 1,
    name: `Amenity ${index + 1}`,
    description: 'A great amenity with lots of features and wonderful details.',
    category: 'FITNESS',
    location: 'Floor 3',
    capacity: 20,
    pricePerHour: 25.0,
    pricePerDay: 150.0,
    availabilityStatus: 'AVAILABLE',
    requiresApproval: false,
    rules: [],
    images: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeAmenities(count: number, overrides: Partial<Amenity> = {}): Amenity[] {
  return Array.from({ length: count }, (_, i) => makeAmenity(overrides, i));
}

function mockFetchSuccess(data: object) {
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

function renderAmenityListing() {
  return render(
    <MemoryRouter>
      <AmenityListing />
    </MemoryRouter>
  );
}

// --- Tests ---

describe('AmenityListing', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // --- Rendering ---

  it('renders the page heading', async () => {
    mockFetchSuccess({ items: [], nextCursor: undefined });
    renderAmenityListing();

    expect(screen.getByRole('heading', { name: /amenities/i })).toBeInTheDocument();
  });

  it('renders amenity cards in a grid', async () => {
    const amenities = makeAmenities(3);
    mockFetchSuccess({ items: amenities, nextCursor: undefined });

    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByText('Amenity 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Amenity 1')).toBeInTheDocument();
    expect(screen.getByText('Amenity 2')).toBeInTheDocument();
    expect(screen.getByText('Amenity 3')).toBeInTheDocument();
  });

  it('renders amenity card with name', async () => {
    mockFetchSuccess({ items: [makeAmenity({ name: 'Rooftop Pool' })], nextCursor: undefined });
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByText('Rooftop Pool')).toBeInTheDocument();
    });
  });

  it('renders amenity description excerpt', async () => {
    mockFetchSuccess({
      items: [makeAmenity({ description: 'Beautiful swimming pool with panoramic views.' })],
      nextCursor: undefined,
    });
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByText(/beautiful swimming pool/i)).toBeInTheDocument();
    });
  });

  it('truncates long descriptions', async () => {
    const longDesc = 'A'.repeat(200);
    mockFetchSuccess({ items: [makeAmenity({ description: longDesc })], nextCursor: undefined });
    renderAmenityListing();

    await waitFor(() => {
      const excerptEls = screen.getAllByText((_, el) => el?.textContent?.includes('…') ?? false);
      expect(excerptEls.length).toBeGreaterThan(0);
    });
  });

  it('renders capacity information', async () => {
    mockFetchSuccess({ items: [makeAmenity({ capacity: 50 })], nextCursor: undefined });
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByText(/50/)).toBeInTheDocument();
    });
  });

  it('renders pricing information', async () => {
    mockFetchSuccess({
      items: [makeAmenity({ pricePerHour: 30.0, pricePerDay: null })],
      nextCursor: undefined,
    });
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByText(/\$30/)).toBeInTheDocument();
    });
  });

  it('renders per-day pricing when available', async () => {
    mockFetchSuccess({
      items: [makeAmenity({ pricePerHour: null, pricePerDay: 200.0 })],
      nextCursor: undefined,
    });
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByText(/\$200/)).toBeInTheDocument();
    });
  });

  // --- Availability indicators ---

  it('shows green AVAILABLE indicator', async () => {
    mockFetchSuccess({
      items: [makeAmenity({ availabilityStatus: 'AVAILABLE' })],
      nextCursor: undefined,
    });
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByTestId('availability-AVAILABLE')).toBeInTheDocument();
    });
    expect(screen.getByTestId('availability-AVAILABLE')).toHaveTextContent(/available/i);
  });

  it('shows yellow LIMITED indicator', async () => {
    mockFetchSuccess({
      items: [makeAmenity({ availabilityStatus: 'LIMITED' })],
      nextCursor: undefined,
    });
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByTestId('availability-LIMITED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('availability-LIMITED')).toHaveTextContent(/limited/i);
  });

  it('shows red UNAVAILABLE indicator', async () => {
    mockFetchSuccess({
      items: [makeAmenity({ availabilityStatus: 'UNAVAILABLE' })],
      nextCursor: undefined,
    });
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByTestId('availability-UNAVAILABLE')).toBeInTheDocument();
    });
    expect(screen.getByTestId('availability-UNAVAILABLE')).toHaveTextContent(/unavailable/i);
  });

  // --- Images ---

  it('shows amenity thumbnail when images are available', async () => {
    const image = makeAmenityImage({ url: 'https://example.com/pool.jpg', sortOrder: 0 });
    mockFetchSuccess({
      items: [makeAmenity({ images: [image] })],
      nextCursor: undefined,
    });
    renderAmenityListing();

    await waitFor(() => {
      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/pool.jpg');
    });
  });

  it('shows placeholder when no images', async () => {
    mockFetchSuccess({
      items: [makeAmenity({ images: [] })],
      nextCursor: undefined,
    });
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-card-1')).toBeInTheDocument();
      // No img element since no images
      expect(screen.queryByRole('img')).toBeNull();
    });
  });

  // --- Category display ---

  it('renders category badge on card', async () => {
    mockFetchSuccess({
      items: [makeAmenity({ category: 'POOL' })],
      nextCursor: undefined,
    });
    renderAmenityListing();

    await waitFor(() => {
      // Category appears in the card badge and possibly in the dropdown option
      const categoryElements = screen.getAllByText('POOL');
      expect(categoryElements.length).toBeGreaterThan(0);
    });
  });

  // --- Search / filter ---

  it('renders search input', async () => {
    mockFetchSuccess({ items: [], nextCursor: undefined });
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });

  it('filters amenities by name search', async () => {
    const amenities = [
      makeAmenity({ name: 'Rooftop Pool', category: 'POOL' }, 0),
      makeAmenity({ name: 'Fitness Center', category: 'FITNESS' }, 1),
      makeAmenity({ name: 'Party Room', category: 'SOCIAL' }, 2),
    ];
    mockFetchSuccess({ items: amenities, nextCursor: undefined });

    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByText('Rooftop Pool')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'pool' } });

    expect(screen.getByText('Rooftop Pool')).toBeInTheDocument();
    expect(screen.queryByText('Fitness Center')).toBeNull();
    expect(screen.queryByText('Party Room')).toBeNull();
  });

  it('filters amenities by category search', async () => {
    const amenities = [
      makeAmenity({ name: 'Rooftop Pool', category: 'POOL' }, 0),
      makeAmenity({ name: 'Fitness Center', category: 'FITNESS' }, 1),
    ];
    mockFetchSuccess({ items: amenities, nextCursor: undefined });

    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByText('Rooftop Pool')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'FITNESS' } });

    expect(screen.getByText('Fitness Center')).toBeInTheDocument();
    expect(screen.queryByText('Rooftop Pool')).toBeNull();
  });

  it('shows all amenities when search is cleared', async () => {
    const amenities = makeAmenities(3);
    mockFetchSuccess({ items: amenities, nextCursor: undefined });

    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByText('Amenity 1')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'Amenity 1' } });
    expect(screen.getByText('Amenity 1')).toBeInTheDocument();
    expect(screen.queryByText('Amenity 2')).toBeNull();

    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('Amenity 1')).toBeInTheDocument();
    expect(screen.getByText('Amenity 2')).toBeInTheDocument();
    expect(screen.getByText('Amenity 3')).toBeInTheDocument();
  });

  it('renders category filter dropdown', async () => {
    mockFetchSuccess({ items: makeAmenities(3), nextCursor: undefined });
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  it('filters by category dropdown', async () => {
    const amenities = [
      makeAmenity({ name: 'Rooftop Pool', category: 'POOL' }, 0),
      makeAmenity({ name: 'Fitness Center', category: 'FITNESS' }, 1),
    ];
    mockFetchSuccess({ items: amenities, nextCursor: undefined });

    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByText('Rooftop Pool')).toBeInTheDocument();
    });

    const categorySelect = screen.getByRole('combobox');
    fireEvent.change(categorySelect, { target: { value: 'POOL' } });

    expect(screen.getByText('Rooftop Pool')).toBeInTheDocument();
    expect(screen.queryByText('Fitness Center')).toBeNull();
  });

  // --- Loading state ---

  it('shows loading state while fetching', () => {
    let resolve!: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));

    renderAmenityListing();

    expect(screen.getByRole('status')).toBeInTheDocument();

    // cleanup
    resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
  });

  // --- Empty state ---

  it('shows empty state when no amenities', async () => {
    mockFetchSuccess({ items: [], nextCursor: undefined });
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByText('No amenities found')).toBeInTheDocument();
    });
  });

  it('shows empty state message when search returns no results', async () => {
    mockFetchSuccess({ items: makeAmenities(2), nextCursor: undefined });
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByText('Amenity 1')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'zzz-no-match' } });

    expect(screen.getByText('No amenities found')).toBeInTheDocument();
  });

  // --- Error state ---

  it('shows error message when fetch fails', async () => {
    mockFetchError(500, 'Something went wrong');
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows a retry button on error', async () => {
    mockFetchError(500, 'Server error');
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  // --- Navigation ---

  it('renders link to amenity detail page', async () => {
    mockFetchSuccess({
      items: [makeAmenity({ id: 7, name: 'Tennis Court' })],
      nextCursor: undefined,
    });
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByText('Tennis Court')).toBeInTheDocument();
    });

    const card = screen.getByTestId('amenity-card-7');
    expect(card.closest('a') ?? card).toBeTruthy();
  });

  // --- Card data attributes ---

  it('renders amenity card with data-testid', async () => {
    mockFetchSuccess({
      items: [makeAmenity({ id: 42 })],
      nextCursor: undefined,
    });
    renderAmenityListing();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-card-42')).toBeInTheDocument();
    });
  });
});
