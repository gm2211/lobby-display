/**
 * BookingFlow component tests (TDD - Red phase first)
 *
 * Tests cover:
 * - Step 1: Amenity selector (dropdown or cards)
 * - Step 2: Date picker
 * - Step 3: Time slot grid showing available slots
 * - Step 4: Confirmation step (summary + submit)
 * - Success/error feedback
 * - Navigate to my bookings on success
 * - Loading and error states
 * - Back navigation between steps
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BookingFlow from '../../../src/platform/pages/BookingFlow';
import type { Amenity, AmenityImage } from '../../../src/platform/types';
import { api } from '../../../src/utils/api';

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
    description: 'A great amenity',
    category: 'FITNESS',
    location: 'Floor 3',
    capacity: 20,
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

function makeAmenities(count: number, overrides: Partial<Amenity> = {}): Amenity[] {
  return Array.from({ length: count }, (_, i) => makeAmenity(overrides, i));
}

function makeAvailabilityResponse(date: string, slots: Array<{ time: string; available: boolean }> = []) {
  return {
    amenityId: '1',
    date,
    slots: slots.length > 0 ? slots : [
      { time: `${date}T09:00:00`, available: true },
      { time: `${date}T10:00:00`, available: true },
      { time: `${date}T11:00:00`, available: false },
      { time: `${date}T12:00:00`, available: true },
    ],
  };
}

function mockFetch(handlers: Array<{
  url?: string | RegExp;
  method?: string;
  response: object;
  status?: number;
}>) {
  global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';

    // CSRF handler first
    if (url.includes('/api/auth/csrf')) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ token: 'test-csrf' }),
      } as unknown as Response);
    }

    // Find matching handler - use exact match or regex for more precision
    for (const handler of handlers) {
      let urlMatches = !handler.url;
      if (handler.url) {
        if (typeof handler.url === 'string') {
          // Use exact match or ends-with to avoid prefix collision
          urlMatches = url === handler.url || url.endsWith(handler.url) ||
            // For availability URLs, check full path pattern
            (handler.url === '/availability' && url.includes('/availability'));
          // Exact endpoint match: only match /api/platform/amenities if URL is exactly that
          if (handler.url === '/api/platform/amenities') {
            urlMatches = url.includes('/api/platform/amenities') && !url.includes('/availability') && !url.match(/\/amenities\/\d+/);
          }
        } else {
          urlMatches = handler.url.test(url);
        }
      }
      const methodMatches = !handler.method || handler.method === method;
      if (urlMatches && methodMatches) {
        return Promise.resolve({
          ok: (handler.status ?? 200) < 400,
          status: handler.status ?? 200,
          json: () => Promise.resolve(handler.response),
          statusText: 'OK',
        } as unknown as Response);
      }
    }

    return Promise.resolve({
      ok: false, status: 404,
      json: () => Promise.resolve({ message: `No handler for ${method} ${url}` }),
    } as unknown as Response);
  });
}

function renderBookingFlow() {
  return render(
    <MemoryRouter>
      <BookingFlow />
    </MemoryRouter>
  );
}

// --- Tests ---

describe('BookingFlow', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
    // Clear CSRF cache so sequential mock counts are predictable
    api.clearCsrf();
  });

  // ─── Loading State ─────────────────────────────────────────────────────────

  it('shows loading spinner while fetching amenities', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    renderBookingFlow();

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // ─── Step 1: Amenity Selection ─────────────────────────────────────────────

  it('renders page heading', async () => {
    mockFetch([{ url: '/api/platform/amenities', response: makeAmenities(2) }]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/book/i);
  });

  it('renders amenity selector step indicator', async () => {
    mockFetch([{ url: '/api/platform/amenities', response: makeAmenities(2) }]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('step-indicator')).toBeInTheDocument();
    });
  });

  it('renders amenity cards after loading', async () => {
    const amenities = makeAmenities(3);
    mockFetch([{ url: '/api/platform/amenities', response: amenities }]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('amenity-option-2')).toBeInTheDocument();
    expect(screen.getByTestId('amenity-option-3')).toBeInTheDocument();
  });

  it('shows amenity name in each card', async () => {
    mockFetch([{ url: '/api/platform/amenities', response: [makeAmenity({ name: 'Rooftop Pool' })] }]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByText('Rooftop Pool')).toBeInTheDocument();
    });
  });

  it('shows amenity location in card', async () => {
    mockFetch([{ url: '/api/platform/amenities', response: [makeAmenity({ location: 'Floor 5' })] }]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByText(/floor 5/i)).toBeInTheDocument();
    });
  });

  it('shows amenity price in card', async () => {
    mockFetch([{ url: '/api/platform/amenities', response: [makeAmenity({ pricePerHour: 50 })] }]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByText(/\$50/)).toBeInTheDocument();
    });
  });

  it('shows "requires approval" badge when amenity requires approval', async () => {
    mockFetch([{ url: '/api/platform/amenities', response: [makeAmenity({ requiresApproval: true })] }]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByText(/approval required/i)).toBeInTheDocument();
    });
  });

  it('shows error state when amenities fail to load', async () => {
    mockFetch([{ url: '/api/platform/amenities', response: { message: 'Server error' }, status: 500 }]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('advances to step 2 when amenity is selected', async () => {
    const amenities = makeAmenities(2);
    mockFetch([{ url: '/api/platform/amenities', response: amenities }]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('amenity-option-1'));

    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
  });

  // ─── Step 2: Date Picker ───────────────────────────────────────────────────

  it('renders date picker input in step 2', async () => {
    const amenities = makeAmenities(1);
    mockFetch([{ url: '/api/platform/amenities', response: amenities }]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));

    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
  });

  it('shows back button in step 2', async () => {
    mockFetch([{ url: '/api/platform/amenities', response: makeAmenities(1) }]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));

    await waitFor(() => {
      expect(screen.getByTestId('back-button')).toBeInTheDocument();
    });
  });

  it('back button returns to step 1 from step 2', async () => {
    mockFetch([{ url: '/api/platform/amenities', response: makeAmenities(1) }]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));

    await waitFor(() => {
      expect(screen.getByTestId('back-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('back-button'));

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
  });

  it('shows selected amenity name in step 2 header', async () => {
    mockFetch([{ url: '/api/platform/amenities', response: [makeAmenity({ name: 'Tennis Court' })] }]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));

    await waitFor(() => {
      expect(screen.getByTestId('selected-amenity-name')).toBeInTheDocument();
    });
    expect(screen.getByTestId('selected-amenity-name').textContent).toContain('Tennis Court');
  });

  it('advances to step 3 when date is selected', async () => {
    const date = '2026-03-15';
    mockFetch([
      { url: '/api/platform/amenities', response: makeAmenities(1) },
      { url: '/availability', response: makeAvailabilityResponse(date) },
    ]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));

    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });

    const nextBtn = screen.getByTestId('date-next-button');
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-grid')).toBeInTheDocument();
    });
  });

  // ─── Step 3: Time Slot Grid ────────────────────────────────────────────────

  it('renders time slot grid in step 3', async () => {
    const date = '2026-03-15';
    mockFetch([
      { url: '/api/platform/amenities', response: makeAmenities(1) },
      { url: '/availability', response: makeAvailabilityResponse(date) },
    ]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));

    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-grid')).toBeInTheDocument();
    });
  });

  it('renders available time slots as clickable buttons', async () => {
    const date = '2026-03-15';
    mockFetch([
      { url: '/api/platform/amenities', response: makeAmenities(1) },
      { url: '/availability', response: makeAvailabilityResponse(date, [
        { time: `${date}T09:00:00`, available: true },
        { time: `${date}T10:00:00`, available: true },
      ]) },
    ]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-grid')).toBeInTheDocument();
    });

    // Available slots should be clickable
    const availableSlots = screen.getAllByTestId(/^time-slot-available-/);
    expect(availableSlots.length).toBe(2);
  });

  it('renders unavailable time slots as disabled', async () => {
    const date = '2026-03-15';
    mockFetch([
      { url: '/api/platform/amenities', response: makeAmenities(1) },
      { url: '/availability', response: makeAvailabilityResponse(date, [
        { time: `${date}T09:00:00`, available: false },
      ]) },
    ]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-grid')).toBeInTheDocument();
    });

    const unavailableSlots = screen.getAllByTestId(/^time-slot-unavailable-/);
    expect(unavailableSlots.length).toBe(1);
    expect(unavailableSlots[0]).toBeDisabled();
  });

  it('shows time formatted as HH:MM for each slot', async () => {
    const date = '2026-03-15';
    mockFetch([
      { url: '/api/platform/amenities', response: makeAmenities(1) },
      { url: '/availability', response: makeAvailabilityResponse(date, [
        { time: `${date}T09:00:00`, available: true },
      ]) },
    ]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-grid')).toBeInTheDocument();
    });

    // Should show formatted time
    const slotEl = screen.getByTestId('time-slot-available-0');
    expect(slotEl.textContent).toMatch(/9|09/);
  });

  it('shows loading while fetching time slots', async () => {
    const date = '2026-03-15';
    let resolveAvailability!: (v: unknown) => void;
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve(makeAmenities(1)),
      } as unknown as Response)
      .mockReturnValueOnce(new Promise(r => { resolveAvailability = r; }));

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    // Should show loading state for slots
    expect(screen.getByTestId('slots-loading')).toBeInTheDocument();

    resolveAvailability({ ok: true, json: () => Promise.resolve(makeAvailabilityResponse(date)) });
  });

  it('shows error when availability fetch fails', async () => {
    const date = '2026-03-15';
    mockFetch([
      { url: '/api/platform/amenities', response: makeAmenities(1) },
      { url: '/availability', response: { message: 'Server error' }, status: 500 },
    ]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('slots-error')).toBeInTheDocument();
    });
  });

  it('shows back button in step 3', async () => {
    const date = '2026-03-15';
    mockFetch([
      { url: '/api/platform/amenities', response: makeAmenities(1) },
      { url: '/availability', response: makeAvailabilityResponse(date) },
    ]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-grid')).toBeInTheDocument();
    });
    expect(screen.getByTestId('back-button')).toBeInTheDocument();
  });

  it('back button returns to step 2 from step 3', async () => {
    const date = '2026-03-15';
    mockFetch([
      { url: '/api/platform/amenities', response: makeAmenities(1) },
      { url: '/availability', response: makeAvailabilityResponse(date) },
    ]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-grid')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('back-button'));

    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
  });

  // ─── Step 4: Confirmation ──────────────────────────────────────────────────

  it('advances to confirmation step when a time slot is selected', async () => {
    const date = '2026-03-15';
    mockFetch([
      { url: '/api/platform/amenities', response: makeAmenities(1) },
      { url: '/availability', response: makeAvailabilityResponse(date, [
        { time: `${date}T09:00:00`, available: true },
      ]) },
    ]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-available-0')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('time-slot-available-0'));

    await waitFor(() => {
      expect(screen.getByTestId('confirmation-summary')).toBeInTheDocument();
    });
  });

  it('shows amenity name in confirmation summary', async () => {
    const date = '2026-03-15';
    mockFetch([
      { url: '/api/platform/amenities', response: [makeAmenity({ name: 'Swimming Pool' })] },
      { url: '/availability', response: makeAvailabilityResponse(date, [
        { time: `${date}T09:00:00`, available: true },
      ]) },
    ]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-available-0')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('time-slot-available-0'));

    await waitFor(() => {
      expect(screen.getByTestId('confirmation-summary')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirmation-summary').textContent).toContain('Swimming Pool');
  });

  it('shows date in confirmation summary', async () => {
    const date = '2026-03-15';
    mockFetch([
      { url: '/api/platform/amenities', response: makeAmenities(1) },
      { url: '/availability', response: makeAvailabilityResponse(date, [
        { time: `${date}T09:00:00`, available: true },
      ]) },
    ]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-available-0')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('time-slot-available-0'));

    await waitFor(() => {
      expect(screen.getByTestId('confirmation-summary')).toBeInTheDocument();
    });
    // Should show the date (March 15)
    expect(screen.getByTestId('confirmation-summary').textContent).toMatch(/mar/i);
  });

  it('shows confirm booking button in step 4', async () => {
    const date = '2026-03-15';
    mockFetch([
      { url: '/api/platform/amenities', response: makeAmenities(1) },
      { url: '/availability', response: makeAvailabilityResponse(date, [
        { time: `${date}T09:00:00`, available: true },
      ]) },
    ]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-available-0')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('time-slot-available-0'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-booking-button')).toBeInTheDocument();
    });
  });

  it('shows notes textarea in confirmation step', async () => {
    const date = '2026-03-15';
    mockFetch([
      { url: '/api/platform/amenities', response: makeAmenities(1) },
      { url: '/availability', response: makeAvailabilityResponse(date, [
        { time: `${date}T09:00:00`, available: true },
      ]) },
    ]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-available-0')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('time-slot-available-0'));

    await waitFor(() => {
      expect(screen.getByTestId('booking-notes')).toBeInTheDocument();
    });
  });

  it('back button in step 4 returns to step 3', async () => {
    const date = '2026-03-15';
    mockFetch([
      { url: '/api/platform/amenities', response: makeAmenities(1) },
      { url: '/availability', response: makeAvailabilityResponse(date, [
        { time: `${date}T09:00:00`, available: true },
      ]) },
    ]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-available-0')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('time-slot-available-0'));

    await waitFor(() => {
      expect(screen.getByTestId('back-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('back-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-grid')).toBeInTheDocument();
    });
  });

  // ─── Submit Booking ────────────────────────────────────────────────────────

  it('calls POST /api/platform/bookings when confirm is clicked', async () => {
    const date = '2026-03-15';
    const bookingResponse = {
      id: 'booking-123',
      amenityId: '1',
      userId: 'user-1',
      startTime: `${date}T09:00:00Z`,
      endTime: `${date}T10:00:00Z`,
      status: 'APPROVED',
      notes: null,
    };

    const fetchMock = vi.fn()
      // Amenities list
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(makeAmenities(1)) })
      // Availability
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(makeAvailabilityResponse(date, [{ time: `${date}T09:00:00`, available: true }])) })
      // CSRF
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ token: 'test-csrf' }) })
      // POST booking
      .mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve(bookingResponse) });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-available-0')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('time-slot-available-0'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-booking-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-booking-button'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'POST'
      );
      expect(postCall).toBeTruthy();
    });
  });

  // ─── Success State ─────────────────────────────────────────────────────────

  it('shows success message after booking is created', async () => {
    const date = '2026-03-15';
    const bookingResponse = {
      id: 'booking-123',
      amenityId: '1',
      userId: 'user-1',
      startTime: `${date}T09:00:00Z`,
      endTime: `${date}T10:00:00Z`,
      status: 'APPROVED',
      notes: null,
    };

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(makeAmenities(1)) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(makeAvailabilityResponse(date, [{ time: `${date}T09:00:00`, available: true }])) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ token: 'test-csrf' }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve(bookingResponse) }) as unknown as typeof fetch;

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-available-0')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('time-slot-available-0'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-booking-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-booking-button'));

    await waitFor(() => {
      expect(screen.getByTestId('booking-success')).toBeInTheDocument();
    });
  });

  it('shows pending status message when booking requires approval', async () => {
    const date = '2026-03-15';
    const bookingResponse = {
      id: 'booking-123',
      amenityId: '1',
      userId: 'user-1',
      startTime: `${date}T09:00:00Z`,
      endTime: `${date}T10:00:00Z`,
      status: 'PENDING',
      notes: null,
    };

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([makeAmenity({ requiresApproval: true })]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(makeAvailabilityResponse(date, [{ time: `${date}T09:00:00`, available: true }])) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ token: 'test-csrf' }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve(bookingResponse) }) as unknown as typeof fetch;

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-available-0')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('time-slot-available-0'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-booking-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-booking-button'));

    await waitFor(() => {
      expect(screen.getByTestId('booking-success')).toBeInTheDocument();
    });
    expect(screen.getByTestId('booking-success').textContent).toMatch(/pending|approval/i);
  });

  it('shows link to my bookings after success', async () => {
    const date = '2026-03-15';
    const bookingResponse = {
      id: 'booking-123',
      amenityId: '1',
      userId: 'user-1',
      startTime: `${date}T09:00:00Z`,
      endTime: `${date}T10:00:00Z`,
      status: 'APPROVED',
      notes: null,
    };

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(makeAmenities(1)) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(makeAvailabilityResponse(date, [{ time: `${date}T09:00:00`, available: true }])) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ token: 'test-csrf' }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve(bookingResponse) }) as unknown as typeof fetch;

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-available-0')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('time-slot-available-0'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-booking-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-booking-button'));

    await waitFor(() => {
      expect(screen.getByTestId('my-bookings-link')).toBeInTheDocument();
    });
  });

  // ─── Error State on Submit ─────────────────────────────────────────────────

  it('shows error when booking POST fails', async () => {
    const date = '2026-03-15';

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(makeAmenities(1)) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(makeAvailabilityResponse(date, [{ time: `${date}T09:00:00`, available: true }])) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ token: 'test-csrf' }) })
      .mockResolvedValueOnce({ ok: false, status: 422, json: () => Promise.resolve({ message: 'Booking conflict', errors: ['Time slot not available'] }) }) as unknown as typeof fetch;

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-available-0')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('time-slot-available-0'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-booking-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-booking-button'));

    await waitFor(() => {
      expect(screen.getByTestId('booking-error')).toBeInTheDocument();
    });
  });

  it('shows submit loading state while booking is being created', async () => {
    const date = '2026-03-15';
    let resolvePost!: (v: unknown) => void;

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(makeAmenities(1)) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(makeAvailabilityResponse(date, [{ time: `${date}T09:00:00`, available: true }])) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ token: 'test-csrf' }) })
      .mockReturnValueOnce(new Promise(r => { resolvePost = r; })) as unknown as typeof fetch;

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));
    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: date } });
    fireEvent.click(screen.getByTestId('date-next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('time-slot-available-0')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('time-slot-available-0'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-booking-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-booking-button'));

    // Button should be disabled/loading
    expect(screen.getByTestId('confirm-booking-button')).toBeDisabled();

    resolvePost({ ok: true, status: 201, json: () => Promise.resolve({ id: 'b1', status: 'APPROVED' }) });
  });

  // ─── Step Indicator ────────────────────────────────────────────────────────

  it('step indicator shows current step 1 of 4', async () => {
    mockFetch([{ url: '/api/platform/amenities', response: makeAmenities(2) }]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('step-indicator')).toBeInTheDocument();
    });
    expect(screen.getByTestId('step-indicator').textContent).toMatch(/1/);
  });

  it('step indicator updates to step 2 after amenity selection', async () => {
    mockFetch([{ url: '/api/platform/amenities', response: makeAmenities(1) }]);

    renderBookingFlow();

    await waitFor(() => {
      expect(screen.getByTestId('amenity-option-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('amenity-option-1'));

    await waitFor(() => {
      expect(screen.getByTestId('step-indicator')).toBeInTheDocument();
    });
    expect(screen.getByTestId('step-indicator').textContent).toMatch(/2/);
  });
});
