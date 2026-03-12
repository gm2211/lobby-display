/**
 * AmenityManagement component tests.
 *
 * Tests cover:
 * - Create amenity form (name, description, location, active, sortOrder)
 * - Edit existing amenities (inline editing)
 * - Toggle availability status (active/inactive)
 * - Manage rules list (add/remove per amenity)
 * - Loading / error / empty states
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AmenityManagement from '../../../src/platform/pages/AmenityManagement';
import type { Amenity, AmenityRule } from '../../../src/platform/types';

// --- Helpers ---

function makeRule(overrides: Partial<AmenityRule> = {}, index = 0): AmenityRule {
  return {
    id: index + 1,
    amenityId: 1,
    rule: `Rule ${index + 1}`,
    sortOrder: index,
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

function mockFetchSuccess(amenities: Amenity[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(amenities),
  } as unknown as Response);
}

function mockFetchError(message = 'Internal Server Error') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ message }),
    statusText: message,
  } as unknown as Response);
}

function mockFetchSequence(responses: Array<{ ok: boolean; data: unknown }>) {
  let callCount = 0;
  global.fetch = vi.fn().mockImplementation(() => {
    const response = responses[callCount] ?? responses[responses.length - 1];
    callCount++;
    return Promise.resolve({
      ok: response.ok,
      status: response.ok ? 200 : 500,
      json: () => Promise.resolve(response.data),
      statusText: response.ok ? 'OK' : 'Internal Server Error',
    } as unknown as Response);
  });
}

// --- Tests ---

describe('AmenityManagement', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // --- Page heading ---

  it('renders the page heading', async () => {
    mockFetchSuccess([]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /amenity management/i })).toBeInTheDocument();
    });
  });

  // --- Loading state ---

  it('shows loading spinner while fetching', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<AmenityManagement />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Error state ---

  it('shows error message when fetch fails', async () => {
    mockFetchError('Something went wrong');

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // --- Empty state ---

  it('shows empty state when no amenities exist', async () => {
    mockFetchSuccess([]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByText('No amenities found')).toBeInTheDocument();
    });
  });

  // --- Amenity list ---

  it('renders a list of amenities', async () => {
    mockFetchSuccess(makeAmenities(3));

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('amenity-row-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('amenity-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('amenity-row-2')).toBeInTheDocument();
    expect(screen.getByTestId('amenity-row-3')).toBeInTheDocument();
  });

  it('shows amenity name in the list', async () => {
    mockFetchSuccess([makeAmenity({ name: 'Rooftop Pool' })]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByText('Rooftop Pool')).toBeInTheDocument();
    });
  });

  it('shows amenity location in the list', async () => {
    mockFetchSuccess([makeAmenity({ location: 'Level 12' })]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByText('Level 12')).toBeInTheDocument();
    });
  });

  // --- Create form ---

  it('renders the create amenity form', async () => {
    mockFetchSuccess([]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('create-amenity-form')).toBeInTheDocument();
    });
  });

  it('has name input in create form', async () => {
    mockFetchSuccess([]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('amenity-name-input')).toBeInTheDocument();
    });
  });

  it('has description input in create form', async () => {
    mockFetchSuccess([]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('amenity-description-input')).toBeInTheDocument();
    });
  });

  it('has location input in create form', async () => {
    mockFetchSuccess([]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('amenity-location-input')).toBeInTheDocument();
    });
  });

  it('has submit button in create form', async () => {
    mockFetchSuccess([]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('amenity-submit-btn')).toBeInTheDocument();
    });
  });

  it('shows form validation error when name is empty on submit', async () => {
    mockFetchSuccess([]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('amenity-submit-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('amenity-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toBeInTheDocument();
    });
  });

  it('submits create form with correct data', async () => {
    const newAmenity = makeAmenity({ id: 99, name: 'Tennis Court', location: 'Rooftop' });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      // CSRF token
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) })
      // POST create
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(newAmenity) })
      // Refetch list
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([newAmenity]) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('amenity-name-input')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('amenity-name-input'), { target: { value: 'Tennis Court' } });
    fireEvent.change(screen.getByTestId('amenity-location-input'), { target: { value: 'Rooftop' } });
    fireEvent.click(screen.getByTestId('amenity-submit-btn'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'POST'
      );
      expect(postCall).toBeTruthy();
    });
  });

  // --- Availability toggle ---

  it('renders availability toggle for each amenity', async () => {
    mockFetchSuccess([makeAmenity({ id: 1, availabilityStatus: 'AVAILABLE' })]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('availability-toggle-1')).toBeInTheDocument();
    });
  });

  it('shows AVAILABLE badge for available amenity', async () => {
    mockFetchSuccess([makeAmenity({ id: 1, availabilityStatus: 'AVAILABLE' })]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('availability-badge-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('availability-badge-1')).toHaveTextContent(/available/i);
  });

  it('shows UNAVAILABLE badge for unavailable amenity', async () => {
    mockFetchSuccess([makeAmenity({ id: 2, availabilityStatus: 'UNAVAILABLE' })]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('availability-badge-2')).toBeInTheDocument();
    });
    expect(screen.getByTestId('availability-badge-2')).toHaveTextContent(/unavailable/i);
  });

  it('calls PUT when availability toggle is clicked', async () => {
    const amenity = makeAmenity({ id: 5, availabilityStatus: 'AVAILABLE' });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([amenity]) })
      // CSRF token
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) })
      // PUT update
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...amenity, active: false }) })
      // Refetch list
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ ...amenity, availabilityStatus: 'UNAVAILABLE' }]) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('availability-toggle-5')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('availability-toggle-5'));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'PUT'
      );
      expect(putCall).toBeTruthy();
    });
  });

  // --- Edit amenity ---

  it('renders edit button for each amenity', async () => {
    mockFetchSuccess([makeAmenity({ id: 3 })]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-amenity-3')).toBeInTheDocument();
    });
  });

  it('shows edit form when edit button is clicked', async () => {
    mockFetchSuccess([makeAmenity({ id: 3, name: 'Gym' })]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-amenity-3')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-amenity-3'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-form-3')).toBeInTheDocument();
    });
  });

  it('pre-fills edit form with existing amenity data', async () => {
    mockFetchSuccess([makeAmenity({ id: 3, name: 'Gym', location: 'Basement' })]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-amenity-3')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-amenity-3'));

    await waitFor(() => {
      const nameInput = screen.getByTestId('edit-name-3') as HTMLInputElement;
      expect(nameInput.value).toBe('Gym');
    });
  });

  it('cancels edit when cancel button is clicked', async () => {
    mockFetchSuccess([makeAmenity({ id: 3, name: 'Gym' })]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-amenity-3')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-amenity-3'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-form-3')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-cancel-3'));

    await waitFor(() => {
      expect(screen.queryByTestId('edit-form-3')).toBeNull();
    });
  });

  it('calls PUT when save edit is clicked', async () => {
    const amenity = makeAmenity({ id: 3, name: 'Gym' });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([amenity]) })
      // CSRF token
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) })
      // PUT update
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...amenity, name: 'Updated Gym' }) })
      // Refetch list
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ ...amenity, name: 'Updated Gym' }]) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-amenity-3')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-amenity-3'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-form-3')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-save-3'));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'PUT'
      );
      expect(putCall).toBeTruthy();
    });
  });

  // --- Delete amenity ---

  it('renders delete button for each amenity', async () => {
    mockFetchSuccess([makeAmenity({ id: 4 })]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('delete-amenity-4')).toBeInTheDocument();
    });
  });

  it('calls DELETE when delete button is clicked', async () => {
    const amenity = makeAmenity({ id: 4 });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([amenity]) })
      // CSRF token
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) })
      // DELETE
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) })
      // Refetch list
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('delete-amenity-4')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('delete-amenity-4'));

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'DELETE'
      );
      expect(deleteCall).toBeTruthy();
    });
  });

  // --- Rules management ---

  it('renders expand/rules button for each amenity', async () => {
    mockFetchSuccess([makeAmenity({ id: 6 })]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('manage-rules-6')).toBeInTheDocument();
    });
  });

  it('shows rules section when manage rules is clicked', async () => {
    const amenityWithRules = makeAmenity({
      id: 6,
      rules: [makeRule({ id: 1, amenityId: 6, rule: 'No smoking' })],
    });
    mockFetchSequence([
      { ok: true, data: [amenityWithRules] },
      { ok: true, data: amenityWithRules }, // detail fetch
    ]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('manage-rules-6')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('manage-rules-6'));

    await waitFor(() => {
      expect(screen.getByTestId('rules-section-6')).toBeInTheDocument();
    });
  });

  it('shows add rule form in rules section', async () => {
    const amenityWithRules = makeAmenity({ id: 6, rules: [] });
    mockFetchSequence([
      { ok: true, data: [amenityWithRules] },
      { ok: true, data: amenityWithRules },
    ]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('manage-rules-6')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('manage-rules-6'));

    await waitFor(() => {
      expect(screen.getByTestId('add-rule-input-6')).toBeInTheDocument();
    });
  });

  it('shows existing rules in rules section', async () => {
    const amenityWithRules = makeAmenity({
      id: 7,
      rules: [
        makeRule({ id: 10, amenityId: 7, rule: 'No smoking', sortOrder: 0 }),
        makeRule({ id: 11, amenityId: 7, rule: 'No pets', sortOrder: 1 }),
      ],
    });
    mockFetchSequence([
      { ok: true, data: [amenityWithRules] },
      { ok: true, data: amenityWithRules },
    ]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('manage-rules-7')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('manage-rules-7'));

    await waitFor(() => {
      expect(screen.getByTestId('rule-item-10')).toBeInTheDocument();
      expect(screen.getByTestId('rule-item-11')).toBeInTheDocument();
    });

    expect(screen.getByText('No smoking')).toBeInTheDocument();
    expect(screen.getByText('No pets')).toBeInTheDocument();
  });

  it('shows remove button for each rule', async () => {
    const amenityWithRules = makeAmenity({
      id: 7,
      rules: [makeRule({ id: 10, amenityId: 7, rule: 'No smoking', sortOrder: 0 })],
    });
    mockFetchSequence([
      { ok: true, data: [amenityWithRules] },
      { ok: true, data: amenityWithRules },
    ]);

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('manage-rules-7')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('manage-rules-7'));

    await waitFor(() => {
      expect(screen.getByTestId('remove-rule-10')).toBeInTheDocument();
    });
  });

  it('calls DELETE on rule when remove button is clicked', async () => {
    const amenityWithRules = makeAmenity({
      id: 7,
      rules: [makeRule({ id: 10, amenityId: 7, rule: 'No smoking', sortOrder: 0 })],
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([amenityWithRules]) })
      // Detail fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(amenityWithRules) })
      // CSRF token
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) })
      // DELETE rule
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) })
      // Refetch detail
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...amenityWithRules, rules: [] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('manage-rules-7')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('manage-rules-7'));

    await waitFor(() => {
      expect(screen.getByTestId('remove-rule-10')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('remove-rule-10'));

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'DELETE'
      );
      expect(deleteCall).toBeTruthy();
    });
  });

  it('can add a new rule', async () => {
    const amenity = makeAmenity({ id: 8, rules: [] });
    const newRule = makeRule({ id: 20, amenityId: 8, rule: 'Guests must sign in' });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([amenity]) })
      // Detail fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(amenity) })
      // CSRF token
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) })
      // POST new rule
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(newRule) })
      // Refetch detail
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...amenity, rules: [newRule] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AmenityManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('manage-rules-8')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('manage-rules-8'));

    await waitFor(() => {
      expect(screen.getByTestId('add-rule-input-8')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('add-rule-input-8'), {
      target: { value: 'Guests must sign in' },
    });
    fireEvent.click(screen.getByTestId('add-rule-btn-8'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'POST'
      );
      expect(postCall).toBeTruthy();
    });
  });
});
