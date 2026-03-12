/**
 * ParcelsList component tests (TDD)
 *
 * Tests: renders list, status badges, filters, pending/history tabs,
 *        loading/empty states, pagination, error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ParcelsList from '../../../src/platform/pages/ParcelsList';
import type { Parcel, ParcelsListResponse } from '../../../src/platform/types';

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const baseParcel: Parcel = {
  id: 1,
  trackingNumber: 'TRACK001',
  carrier: 'UPS',
  status: 'RECEIVED',
  recipientName: 'John Doe',
  unitNumber: '4B',
  description: 'Amazon package',
  receivedAt: '2025-01-15T10:00:00.000Z',
  notifiedAt: null,
  pickedUpAt: null,
  notes: null,
  createdAt: '2025-01-15T10:00:00.000Z',
  updatedAt: '2025-01-15T10:00:00.000Z',
};

function makeParcel(overrides: Partial<Parcel> = {}): Parcel {
  return { ...baseParcel, ...overrides };
}

function mockFetchSuccess(data: ParcelsListResponse) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => data,
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

describe('ParcelsList', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Loading state ----

  it('shows loading spinner initially', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<ParcelsList />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // ---- Renders list ----

  it('renders a list of parcels after fetching', async () => {
    mockFetchSuccess({
      items: [
        makeParcel({ id: 1, trackingNumber: 'TRACK001' }),
        makeParcel({ id: 2, trackingNumber: 'TRACK002' }),
      ],
    });

    renderWithRouter(<ParcelsList />);

    await waitFor(() => {
      expect(screen.getByText('TRACK001')).toBeInTheDocument();
      expect(screen.getByText('TRACK002')).toBeInTheDocument();
    });
  });

  it('renders parcel carrier', async () => {
    mockFetchSuccess({ items: [makeParcel({ carrier: 'FedEx' })] });
    renderWithRouter(<ParcelsList />);
    await waitFor(() => {
      expect(screen.getByText('FedEx')).toBeInTheDocument();
    });
  });

  it('renders recipient name', async () => {
    mockFetchSuccess({ items: [makeParcel({ recipientName: 'Jane Smith' })] });
    renderWithRouter(<ParcelsList />);
    await waitFor(() => {
      expect(screen.getByText(/jane smith/i)).toBeInTheDocument();
    });
  });

  it('renders unit number', async () => {
    mockFetchSuccess({ items: [makeParcel({ unitNumber: '12C' })] });
    renderWithRouter(<ParcelsList />);
    await waitFor(() => {
      expect(screen.getByText('12C')).toBeInTheDocument();
    });
  });

  it('renders received date', async () => {
    mockFetchSuccess({ items: [makeParcel({ receivedAt: '2025-01-15T10:00:00.000Z' })] });
    renderWithRouter(<ParcelsList />);
    await waitFor(() => {
      expect(screen.getByText(/jan 15, 2025/i)).toBeInTheDocument();
    });
  });

  it('renders description when present', async () => {
    mockFetchSuccess({ items: [makeParcel({ description: 'Fragile box from IKEA' })] });
    renderWithRouter(<ParcelsList />);
    await waitFor(() => {
      expect(screen.getByText(/fragile box from ikea/i)).toBeInTheDocument();
    });
  });

  // ---- Status badges ----

  it('shows RECEIVED badge in blue', async () => {
    mockFetchSuccess({ items: [makeParcel({ status: 'RECEIVED' })] });
    renderWithRouter(<ParcelsList />);
    await waitFor(() => {
      const badge = screen.getByTestId('status-badge-RECEIVED');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Received');
    });
  });

  it('shows NOTIFIED badge in yellow', async () => {
    mockFetchSuccess({ items: [makeParcel({ status: 'NOTIFIED', notifiedAt: '2025-01-15T11:00:00.000Z' })] });
    renderWithRouter(<ParcelsList />);
    await waitFor(() => {
      const badge = screen.getByTestId('status-badge-NOTIFIED');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Notified');
    });
  });

  it('shows PICKED_UP badge in green', async () => {
    mockFetchSuccess({
      items: [makeParcel({ status: 'PICKED_UP', pickedUpAt: '2025-01-16T09:00:00.000Z' })],
    });
    renderWithRouter(<ParcelsList />);
    // Need to switch to History tab
    await waitFor(() => {
      const historyTab = screen.getByRole('tab', { name: /history/i });
      expect(historyTab).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: /history/i }));
    await waitFor(() => {
      const badge = screen.getByTestId('status-badge-PICKED_UP');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Picked Up');
    });
  });

  // ---- Pending / History tabs ----

  it('shows Pending tab by default', async () => {
    mockFetchSuccess({
      items: [
        makeParcel({ id: 1, trackingNumber: 'PENDING1', status: 'RECEIVED' }),
        makeParcel({ id: 2, trackingNumber: 'DONE1', status: 'PICKED_UP', pickedUpAt: '2025-01-16T09:00:00.000Z' }),
      ],
    });

    renderWithRouter(<ParcelsList />);

    await waitFor(() => {
      expect(screen.getByText('PENDING1')).toBeInTheDocument();
      expect(screen.queryByText('DONE1')).not.toBeInTheDocument();
    });
  });

  it('switches to History tab and shows PICKED_UP parcels', async () => {
    mockFetchSuccess({
      items: [
        makeParcel({ id: 1, trackingNumber: 'PENDING1', status: 'RECEIVED' }),
        makeParcel({ id: 2, trackingNumber: 'DONE1', status: 'PICKED_UP', pickedUpAt: '2025-01-16T09:00:00.000Z' }),
      ],
    });

    renderWithRouter(<ParcelsList />);

    await waitFor(() => {
      expect(screen.getByText('PENDING1')).toBeInTheDocument();
    });

    const historyTab = screen.getByRole('tab', { name: /history/i });
    fireEvent.click(historyTab);

    expect(screen.queryByText('PENDING1')).not.toBeInTheDocument();
    expect(screen.getByText('DONE1')).toBeInTheDocument();
  });

  it('shows both RECEIVED and NOTIFIED in Pending tab', async () => {
    mockFetchSuccess({
      items: [
        makeParcel({ id: 1, trackingNumber: 'REC001', status: 'RECEIVED' }),
        makeParcel({ id: 2, trackingNumber: 'NOT001', status: 'NOTIFIED', notifiedAt: '2025-01-15T11:00:00.000Z' }),
        makeParcel({ id: 3, trackingNumber: 'DONE1', status: 'PICKED_UP', pickedUpAt: '2025-01-16T09:00:00.000Z' }),
      ],
    });

    renderWithRouter(<ParcelsList />);

    await waitFor(() => {
      expect(screen.getByText('REC001')).toBeInTheDocument();
      expect(screen.getByText('NOT001')).toBeInTheDocument();
      expect(screen.queryByText('DONE1')).not.toBeInTheDocument();
    });
  });

  // ---- Filters ----

  it('renders status filter dropdown', async () => {
    mockFetchSuccess({ items: [makeParcel()] });
    renderWithRouter(<ParcelsList />);
    await waitFor(() => {
      expect(screen.getByLabelText(/filter by status/i)).toBeInTheDocument();
    });
  });

  it('renders unit filter input', async () => {
    mockFetchSuccess({ items: [makeParcel()] });
    renderWithRouter(<ParcelsList />);
    await waitFor(() => {
      expect(screen.getByLabelText(/filter by unit/i)).toBeInTheDocument();
    });
  });

  it('filters by unit number', async () => {
    mockFetchSuccess({
      items: [
        makeParcel({ id: 1, trackingNumber: 'UNIT4B', unitNumber: '4B' }),
        makeParcel({ id: 2, trackingNumber: 'UNIT12C', unitNumber: '12C' }),
      ],
    });

    renderWithRouter(<ParcelsList />);

    await waitFor(() => {
      expect(screen.getByText('UNIT4B')).toBeInTheDocument();
    });

    const unitInput = screen.getByLabelText(/filter by unit/i);
    fireEvent.change(unitInput, { target: { value: '12C' } });

    expect(screen.queryByText('UNIT4B')).not.toBeInTheDocument();
    expect(screen.getByText('UNIT12C')).toBeInTheDocument();
  });

  it('filters by status', async () => {
    mockFetchSuccess({
      items: [
        makeParcel({ id: 1, trackingNumber: 'REC001', status: 'RECEIVED' }),
        makeParcel({ id: 2, trackingNumber: 'NOT001', status: 'NOTIFIED', notifiedAt: '2025-01-15T11:00:00.000Z' }),
      ],
    });

    renderWithRouter(<ParcelsList />);

    await waitFor(() => {
      expect(screen.getByText('REC001')).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText(/filter by status/i);
    fireEvent.change(statusSelect, { target: { value: 'NOTIFIED' } });

    expect(screen.queryByText('REC001')).not.toBeInTheDocument();
    expect(screen.getByText('NOT001')).toBeInTheDocument();
  });

  // ---- Empty states ----

  it('shows empty state when no parcels exist', async () => {
    mockFetchSuccess({ items: [] });
    renderWithRouter(<ParcelsList />);
    await waitFor(() => {
      expect(screen.getByText(/no parcels/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when no parcels match filters', async () => {
    mockFetchSuccess({
      items: [makeParcel({ unitNumber: '4B' })],
    });

    renderWithRouter(<ParcelsList />);

    await waitFor(() => {
      expect(screen.getByText('TRACK001')).toBeInTheDocument();
    });

    const unitInput = screen.getByLabelText(/filter by unit/i);
    fireEvent.change(unitInput, { target: { value: 'ZZZ' } });

    expect(screen.queryByText('TRACK001')).not.toBeInTheDocument();
    expect(screen.getByText(/no parcels/i)).toBeInTheDocument();
  });

  it('shows empty state message for Pending tab when no pending parcels', async () => {
    mockFetchSuccess({
      items: [makeParcel({ id: 1, status: 'PICKED_UP', pickedUpAt: '2025-01-16T09:00:00.000Z' })],
    });
    renderWithRouter(<ParcelsList />);
    await waitFor(() => {
      expect(screen.getByText(/no parcels/i)).toBeInTheDocument();
    });
  });

  // ---- Error state ----

  it('shows error message on fetch failure', async () => {
    mockFetchError();
    renderWithRouter(<ParcelsList />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load parcels/i)).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockFetchError();
    renderWithRouter(<ParcelsList />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('retries fetch on retry button click', async () => {
    mockFetchError();
    renderWithRouter(<ParcelsList />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    // Mock success for retry
    mockFetchSuccess({ items: [makeParcel({ trackingNumber: 'RETRIED' })] });

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('RETRIED')).toBeInTheDocument();
    });
  });

  // ---- Pagination ----

  it('shows Load More button when nextCursor is provided', async () => {
    mockFetchSuccess({
      items: [makeParcel()],
      nextCursor: 'cursor123',
    });

    renderWithRouter(<ParcelsList />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
    });
  });

  it('does not show Load More button when no nextCursor', async () => {
    mockFetchSuccess({ items: [makeParcel()] });
    renderWithRouter(<ParcelsList />);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
    });
  });

  it('loads more parcels on Load More click', async () => {
    mockFetchSuccess({
      items: [makeParcel({ id: 1, trackingNumber: 'FIRST' })],
      nextCursor: 'cursor123',
    });

    renderWithRouter(<ParcelsList />);

    await waitFor(() => {
      expect(screen.getByText('FIRST')).toBeInTheDocument();
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [makeParcel({ id: 2, trackingNumber: 'SECOND' })],
      }),
    } as Response);

    fireEvent.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() => {
      expect(screen.getByText('FIRST')).toBeInTheDocument();
      expect(screen.getByText('SECOND')).toBeInTheDocument();
    });
  });

  // ---- Page title ----

  it('renders the page heading "Parcels"', async () => {
    mockFetchSuccess({ items: [] });
    renderWithRouter(<ParcelsList />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /parcels/i })).toBeInTheDocument();
    });
  });
});
