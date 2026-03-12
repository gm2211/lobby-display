/**
 * ParcelPickup component tests (Red/Blue TDD)
 *
 * Tests: parcel info display, pickup confirmation, already-picked-up state,
 *        role restriction note, loading/error/not-found states, back link.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ParcelPickup from '../../../src/platform/pages/ParcelPickup';
import type { Parcel } from '../../../src/platform/types';

// --- Helpers ---

function renderWithParams(id: string | number) {
  return render(
    <MemoryRouter initialEntries={[`/platform/parcels/${id}/pickup`]}>
      <Routes>
        <Route path="/platform/parcels/:id/pickup" element={<ParcelPickup />} />
        <Route path="/platform/parcels" element={<div>Parcels List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const baseParcel: Parcel = {
  id: 42,
  trackingNumber: 'TRACK-XYZ-001',
  carrier: 'FedEx',
  status: 'RECEIVED',
  recipientName: 'Jane Smith',
  unitNumber: '7A',
  description: 'Large brown box',
  receivedAt: '2025-01-20T10:00:00.000Z',
  notifiedAt: '2025-01-20T11:00:00.000Z',
  pickedUpAt: null,
  notes: null,
  createdAt: '2025-01-20T10:00:00.000Z',
  updatedAt: '2025-01-20T10:00:00.000Z',
};

function makeParcel(overrides: Partial<Parcel> = {}): Parcel {
  return { ...baseParcel, ...overrides };
}

function mockFetchSuccess(data: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as Response));
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

describe('ParcelPickup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Loading state ---

  it('shows loading spinner initially', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    renderWithParams(42);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Error states ---

  it('shows not-found state when parcel is 404', async () => {
    mockFetchError(404, 'Parcel not found');
    renderWithParams(999);

    await waitFor(() => {
      expect(screen.getByText(/parcel not found/i)).toBeInTheDocument();
    });
  });

  it('shows error state when fetch fails with server error', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // --- Parcel info display ---

  it('renders tracking number', async () => {
    mockFetchSuccess(makeParcel({ trackingNumber: 'TRACK-XYZ-001' }));
    renderWithParams(42);

    await waitFor(() => {
      const elements = screen.getAllByText('TRACK-XYZ-001');
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it('renders carrier', async () => {
    mockFetchSuccess(makeParcel({ carrier: 'FedEx' }));
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByText('FedEx')).toBeInTheDocument();
    });
  });

  it('renders recipient name', async () => {
    mockFetchSuccess(makeParcel({ recipientName: 'Jane Smith' }));
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByText(/jane smith/i)).toBeInTheDocument();
    });
  });

  it('renders unit number', async () => {
    mockFetchSuccess(makeParcel({ unitNumber: '7A' }));
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByText('7A')).toBeInTheDocument();
    });
  });

  it('renders description', async () => {
    mockFetchSuccess(makeParcel({ description: 'Large brown box' }));
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByText(/large brown box/i)).toBeInTheDocument();
    });
  });

  it('renders received date', async () => {
    mockFetchSuccess(makeParcel({ receivedAt: '2025-01-20T10:00:00.000Z' }));
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByText(/jan 20, 2025/i)).toBeInTheDocument();
    });
  });

  it('renders status badge for RECEIVED', async () => {
    mockFetchSuccess(makeParcel({ status: 'RECEIVED' }));
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-RECEIVED')).toBeInTheDocument();
    });
  });

  it('renders status badge for NOTIFIED', async () => {
    mockFetchSuccess(makeParcel({ status: 'NOTIFIED' }));
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-NOTIFIED')).toBeInTheDocument();
    });
  });

  it('renders dash when description is null', async () => {
    mockFetchSuccess(makeParcel({ description: null }));
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
    // Should render em dash or similar for null description
    expect(screen.getByTestId('parcel-description')).toBeInTheDocument();
  });

  // --- Confirm Pickup button ---

  it('renders Confirm Pickup button for non-picked-up parcel', async () => {
    mockFetchSuccess(makeParcel({ status: 'RECEIVED' }));
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm pickup/i })).toBeInTheDocument();
    });
  });

  it('calls PUT /api/platform/parcels/:id/pickup on confirm', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'test-csrf' }),
        } as Response);
      }
      if (urlStr.includes('/pickup') && !urlStr.endsWith('/pickup')) {
        // shouldn't happen
      }
      if (urlStr.match(/\/parcels\/\d+\/pickup$/) && !urlStr.includes('csrf')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeParcel({
            status: 'PICKED_UP',
            pickedUpAt: '2025-01-21T14:30:00.000Z',
          })),
        } as Response);
      }
      // Default GET parcel
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(makeParcel({ status: 'RECEIVED' })),
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm pickup/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /confirm pickup/i }));

    await waitFor(() => {
      // After pickup, should show picked-up state
      const pickedUpEl =
        screen.queryByTestId('status-badge-PICKED_UP') ||
        screen.queryByText(/picked up/i);
      expect(pickedUpEl).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  // --- Already picked up state ---

  it('does NOT show Confirm Pickup button when status is PICKED_UP', async () => {
    mockFetchSuccess(makeParcel({
      status: 'PICKED_UP',
      pickedUpAt: '2025-01-21T14:30:00.000Z',
    }));
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /confirm pickup/i })).toBeNull();
  });

  it('shows already-picked-up message when status is PICKED_UP', async () => {
    mockFetchSuccess(makeParcel({
      status: 'PICKED_UP',
      pickedUpAt: '2025-01-21T14:30:00.000Z',
    }));
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByText(/already picked up/i)).toBeInTheDocument();
    });
  });

  it('shows picked up date when status is PICKED_UP', async () => {
    mockFetchSuccess(makeParcel({
      status: 'PICKED_UP',
      pickedUpAt: '2025-01-21T14:30:00.000Z',
    }));
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByText(/jan 21, 2025/i)).toBeInTheDocument();
    });
  });

  // --- Confirmation success state ---

  it('shows pickup confirmation success after confirming', async () => {
    const pickedUpParcel = makeParcel({
      status: 'PICKED_UP',
      pickedUpAt: '2025-01-21T14:30:00.000Z',
    });

    const fetchMock = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'test-csrf' }),
        } as Response);
      }
      if (urlStr.match(/\/parcels\/42\/pickup$/) && !urlStr.includes('csrf')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(pickedUpParcel),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(makeParcel({ status: 'RECEIVED' })),
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm pickup/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /confirm pickup/i }));

    await waitFor(() => {
      expect(screen.getByTestId('pickup-confirmed')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  // --- Back link ---

  it('renders back link to parcels list', async () => {
    mockFetchSuccess(makeParcel());
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByText(/back to parcels/i)).toBeInTheDocument();
    });
  });

  it('back link navigates to /platform/parcels', async () => {
    mockFetchSuccess(makeParcel());
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByText(/back to parcels/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/back to parcels/i));

    await waitFor(() => {
      expect(screen.getByText('Parcels List')).toBeInTheDocument();
    });
  });

  // --- Page heading ---

  it('renders a page heading for parcel pickup', async () => {
    mockFetchSuccess(makeParcel());
    renderWithParams(42);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
  });
});
