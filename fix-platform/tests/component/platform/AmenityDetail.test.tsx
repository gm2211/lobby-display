/**
 * AmenityDetail component tests.
 *
 * Tests cover:
 * - Amenity info (name, description, location, capacity, pricing, availability)
 * - Rules list
 * - Image gallery
 * - Calendar view showing booked/available time slots
 * - "Book Now" link to booking flow
 * - Back link to amenities list
 * - Loading/error/not-found states
 *
 * RED/BLUE TDD: tests written first, then component implemented.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AmenityDetail from '../../../src/platform/pages/AmenityDetail';
import type { Amenity, AmenityImage, AmenityRule } from '../../../src/platform/types';

// --- Helpers ---

function renderWithParams(id: string | number) {
  return render(
    <MemoryRouter initialEntries={[`/platform/amenities/${id}`]}>
      <Routes>
        <Route path="/platform/amenities/:id" element={<AmenityDetail />} />
        <Route path="/platform/amenities" element={<div>Amenities List</div>} />
        <Route path="/platform/bookings" element={<div>Bookings Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function makeImage(overrides: Partial<AmenityImage> = {}): AmenityImage {
  return {
    id: 1,
    amenityId: 1,
    url: 'https://example.com/image.jpg',
    caption: 'Test image',
    sortOrder: 0,
    ...overrides,
  };
}

function makeRule(overrides: Partial<AmenityRule> = {}): AmenityRule {
  return {
    id: 1,
    amenityId: 1,
    rule: 'No smoking allowed',
    sortOrder: 0,
    ...overrides,
  };
}

function makeAmenity(overrides: Partial<Amenity> = {}): Amenity {
  return {
    id: 1,
    name: 'Rooftop Pool',
    description: 'A beautiful rooftop pool with panoramic city views.',
    category: 'POOL',
    location: 'Floor 20',
    capacity: 30,
    pricePerHour: 25.0,
    pricePerDay: null,
    availabilityStatus: 'AVAILABLE',
    requiresApproval: false,
    rules: [],
    images: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

interface AvailabilitySlot {
  time: string;
  available: boolean;
}

interface AvailabilityResponse {
  amenityId: number;
  date: string;
  slots: AvailabilitySlot[];
}

function makeAvailabilityResponse(date: string, amenityId = 1): AvailabilityResponse {
  const slots: AvailabilitySlot[] = [];
  for (let hour = 6; hour <= 22; hour++) {
    const timeStr = `${String(hour).padStart(2, '0')}:00`;
    slots.push({ time: `${date}T${timeStr}:00`, available: true });
  }
  return { amenityId, date, slots };
}

function mockFetch(
  amenity: Amenity | null = makeAmenity(),
  availability?: AvailabilityResponse
) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: unknown) => {
    const urlStr = String(url);

    // CSRF token endpoint
    if (urlStr.includes('/csrf')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: 'test-csrf-token' }),
      } as Response);
    }

    // Availability endpoint
    if (urlStr.includes('/availability')) {
      const avail = availability ?? makeAvailabilityResponse('2026-02-01');
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(avail),
      } as Response);
    }

    // Amenity GET endpoint
    if (amenity === null) {
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ message: 'Amenity 999 not found' }),
      } as Response);
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(amenity),
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

describe('AmenityDetail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Loading state ---

  it('shows loading spinner initially', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    renderWithParams('1');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Not found state ---

  it('shows not-found state when amenity returns 404', async () => {
    mockFetch(null);
    renderWithParams('999');

    await waitFor(() => {
      expect(screen.getByText(/amenity not found/i)).toBeInTheDocument();
    });
  });

  it('shows back link on not-found state', async () => {
    mockFetch(null);
    renderWithParams('999');

    await waitFor(() => {
      expect(screen.getByText(/amenity not found/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/back to amenities/i)).toBeInTheDocument();
  });

  // --- Error state ---

  it('shows error state when fetch fails with server error', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  // --- Amenity info ---

  it('renders amenity name as h1', async () => {
    mockFetch(makeAmenity({ name: 'Rooftop Pool' }));
    renderWithParams('1');

    await waitFor(() => {
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.textContent).toBe('Rooftop Pool');
    });
  });

  it('renders amenity description', async () => {
    mockFetch(makeAmenity({ description: 'A beautiful rooftop pool with panoramic city views.' }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/beautiful rooftop pool/i)).toBeInTheDocument();
    });
  });

  it('renders amenity location', async () => {
    mockFetch(makeAmenity({ location: 'Floor 20' }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/floor 20/i)).toBeInTheDocument();
    });
  });

  it('renders amenity capacity', async () => {
    mockFetch(makeAmenity({ capacity: 30 }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/30 capacity/i)).toBeInTheDocument();
    });
  });

  it('renders hourly pricing', async () => {
    mockFetch(makeAmenity({ pricePerHour: 25.0, pricePerDay: null }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/\$25/)).toBeInTheDocument();
    });
  });

  it('renders daily pricing', async () => {
    mockFetch(makeAmenity({ pricePerHour: null, pricePerDay: 200.0 }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/\$200/)).toBeInTheDocument();
    });
  });

  it('shows "Free" when no pricing is set', async () => {
    mockFetch(makeAmenity({ pricePerHour: null, pricePerDay: null }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/free/i)).toBeInTheDocument();
    });
  });

  it('renders availability status badge', async () => {
    mockFetch(makeAmenity({ availabilityStatus: 'AVAILABLE' }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/available/i)).toBeInTheDocument();
    });
  });

  it('renders LIMITED availability status', async () => {
    mockFetch(makeAmenity({ availabilityStatus: 'LIMITED' }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/limited/i)).toBeInTheDocument();
    });
  });

  it('renders UNAVAILABLE status', async () => {
    mockFetch(makeAmenity({ availabilityStatus: 'UNAVAILABLE' }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
    });
  });

  it('shows "Approval required" when requiresApproval is true', async () => {
    mockFetch(makeAmenity({ requiresApproval: true }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/approval required/i)).toBeInTheDocument();
    });
  });

  it('does not show approval note when requiresApproval is false', async () => {
    mockFetch(makeAmenity({ requiresApproval: false }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    expect(screen.queryByText(/approval required/i)).toBeNull();
  });

  // --- Rules list ---

  it('renders rules section when amenity has rules', async () => {
    const rules = [
      makeRule({ id: 1, rule: 'No smoking allowed', sortOrder: 0 }),
      makeRule({ id: 2, rule: 'No pets allowed', sortOrder: 1 }),
    ];
    mockFetch(makeAmenity({ rules }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('No smoking allowed')).toBeInTheDocument();
      expect(screen.getByText('No pets allowed')).toBeInTheDocument();
    });
  });

  it('does not show rules section when amenity has no rules', async () => {
    mockFetch(makeAmenity({ rules: [] }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    expect(screen.queryByText(/rules/i)).toBeNull();
  });

  // --- Image gallery ---

  it('renders images in gallery', async () => {
    const images = [
      makeImage({ id: 1, url: 'https://example.com/pool1.jpg', caption: 'Pool view', sortOrder: 0 }),
      makeImage({ id: 2, url: 'https://example.com/pool2.jpg', caption: 'Pool deck', sortOrder: 1 }),
    ];
    mockFetch(makeAmenity({ images }));
    renderWithParams('1');

    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows image captions in gallery', async () => {
    const images = [
      makeImage({ id: 1, url: 'https://example.com/pool.jpg', caption: 'Pool view', sortOrder: 0 }),
    ];
    mockFetch(makeAmenity({ images }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByAltText('Pool view')).toBeInTheDocument();
    });
  });

  it('shows placeholder when no images', async () => {
    mockFetch(makeAmenity({ images: [] }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    expect(screen.queryByRole('img')).toBeNull();
  });

  // --- Calendar view ---

  it('renders calendar section', async () => {
    mockFetch(makeAmenity());
    renderWithParams('1');

    await waitFor(() => {
      // Calendar navigation buttons should be visible
      expect(screen.getByRole('button', { name: /prev/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });
  });

  it('renders calendar grid', async () => {
    mockFetch(makeAmenity());
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByTestId('calendar-grid')).toBeInTheDocument();
    });
  });

  // --- Book Now link ---

  it('renders Book Now link', async () => {
    mockFetch(makeAmenity({ id: 5 }));
    renderWithParams('5');

    await waitFor(() => {
      const bookBtn = screen.getByRole('link', { name: /book now/i });
      expect(bookBtn).toBeInTheDocument();
    });
  });

  it('Book Now link points to bookings page', async () => {
    mockFetch(makeAmenity({ id: 5 }));
    renderWithParams('5');

    await waitFor(() => {
      const bookBtn = screen.getByRole('link', { name: /book now/i });
      expect(bookBtn).toHaveAttribute('href', expect.stringContaining('bookings'));
    });
  });

  it('Book Now link includes amenity id in href', async () => {
    mockFetch(makeAmenity({ id: 5 }));
    renderWithParams('5');

    await waitFor(() => {
      const bookBtn = screen.getByRole('link', { name: /book now/i });
      expect(bookBtn).toHaveAttribute('href', expect.stringContaining('5'));
    });
  });

  // --- Back link ---

  it('renders back link to amenities list', async () => {
    mockFetch(makeAmenity());
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/back to amenities/i)).toBeInTheDocument();
    });
  });

  it('back link navigates to /platform/amenities', async () => {
    mockFetch(makeAmenity());
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/back to amenities/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/back to amenities/i));

    await waitFor(() => {
      expect(screen.getByText('Amenities List')).toBeInTheDocument();
    });
  });

  // --- category display ---

  it('renders amenity category', async () => {
    mockFetch(makeAmenity({ category: 'POOL' }));
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('POOL')).toBeInTheDocument();
    });
  });

  // --- data-testid ---

  it('renders amenity detail container with data-testid', async () => {
    mockFetch(makeAmenity({ id: 7 }));
    renderWithParams('7');

    await waitFor(() => {
      expect(screen.getByTestId('amenity-detail-7')).toBeInTheDocument();
    });
  });
});
