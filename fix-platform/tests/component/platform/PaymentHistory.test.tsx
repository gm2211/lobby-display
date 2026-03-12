/**
 * PaymentHistory component tests.
 *
 * Tests cover:
 * - Renders payment history table with correct columns
 * - Status badges for all payment statuses
 * - Outstanding balance summary card
 * - Status filter dropdown
 * - Date range filters (from/to)
 * - Loading state
 * - Empty state
 * - Error state
 * - Currency formatting
 * - Date formatting
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PaymentHistory from '../../../src/platform/pages/PaymentHistory';
import type { Payment } from '../../../src/platform/types';

// --- Helpers ---

function makePayment(overrides: Partial<Payment> = {}, index = 0): Payment {
  return {
    id: `payment-${index + 1}`,
    userId: 'user-1',
    amount: '150.00',
    currency: 'USD',
    status: 'PENDING',
    paymentMethod: null,
    externalId: null,
    description: 'Monthly HOA Fee',
    dueDate: '2025-07-01T00:00:00Z',
    paidAt: null,
    createdAt: '2025-06-01T10:00:00Z',
    updatedAt: '2025-06-01T10:00:00Z',
    items: [],
    ...overrides,
  };
}

function makePayments(count: number, overrides: Partial<Payment> = {}): Payment[] {
  return Array.from({ length: count }, (_, i) => makePayment(overrides, i));
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

// --- Tests ---

describe('PaymentHistory', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // --- Rendering ---

  it('renders page title', async () => {
    mockFetchSuccess([]);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /payment history/i })).toBeInTheDocument();
    });
  });

  it('renders table headers when payments exist', async () => {
    mockFetchSuccess(makePayments(2));
    render(<PaymentHistory />);

    await waitFor(() => {
      const table = screen.getByRole('table', { name: /payment history/i });
      expect(table).toBeInTheDocument();
    });

    const table = screen.getByRole('table', { name: /payment history/i });
    const headers = table.querySelectorAll('th');
    const headerTexts = Array.from(headers).map(th => th.textContent?.trim());
    expect(headerTexts).toContain('Date');
    expect(headerTexts).toContain('Description');
    expect(headerTexts).toContain('Amount');
    expect(headerTexts).toContain('Status');
    expect(headerTexts).toContain('Paid Date');
  });

  it('renders payments in a table', async () => {
    const payments = [
      makePayment({ id: 'p-1', description: 'HOA Fee January' }),
      makePayment({ id: 'p-2', description: 'Parking Fee' }),
    ];
    mockFetchSuccess(payments);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByText('HOA Fee January')).toBeInTheDocument();
    });
    expect(screen.getByText('Parking Fee')).toBeInTheDocument();
    expect(screen.getByTestId('payment-row-p-1')).toBeInTheDocument();
    expect(screen.getByTestId('payment-row-p-2')).toBeInTheDocument();
  });

  // --- Outstanding balance summary card ---

  it('renders outstanding balance summary card', async () => {
    const payments = [
      makePayment({ amount: '200.00', status: 'PENDING' }),
      makePayment({ amount: '150.00', status: 'PAID', paidAt: '2025-06-10T00:00:00Z' }),
    ];
    mockFetchSuccess(payments);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByTestId('outstanding-balance-card')).toBeInTheDocument();
    });
  });

  it('shows correct outstanding balance total', async () => {
    const payments = [
      makePayment({ amount: '200.00', status: 'PENDING' }),
      makePayment({ amount: '100.00', status: 'PENDING' }),
      makePayment({ amount: '150.00', status: 'PAID', paidAt: '2025-06-10T00:00:00Z' }),
    ];
    mockFetchSuccess(payments);
    render(<PaymentHistory />);

    await waitFor(() => {
      // Should show $300.00 as outstanding (pending payments)
      expect(screen.getByTestId('outstanding-amount')).toHaveTextContent('$300.00');
    });
  });

  // --- Status badges ---

  it('renders PENDING status badge', async () => {
    mockFetchSuccess([makePayment({ status: 'PENDING' })]);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-status-PENDING')).toBeInTheDocument();
    });
    expect(screen.getByTestId('payment-status-PENDING')).toHaveTextContent('Pending');
  });

  it('renders PAID status badge', async () => {
    mockFetchSuccess([makePayment({ status: 'PAID', paidAt: '2025-06-10T00:00:00Z' })]);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-status-PAID')).toBeInTheDocument();
    });
    expect(screen.getByTestId('payment-status-PAID')).toHaveTextContent('Paid');
  });

  it('renders FAILED status badge', async () => {
    mockFetchSuccess([makePayment({ status: 'FAILED' })]);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-status-FAILED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('payment-status-FAILED')).toHaveTextContent('Overdue');
  });

  it('renders REFUNDED status badge', async () => {
    mockFetchSuccess([makePayment({ status: 'REFUNDED' })]);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-status-REFUNDED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('payment-status-REFUNDED')).toHaveTextContent('Refunded');
  });

  // --- Status filter ---

  it('renders status filter dropdown', async () => {
    mockFetchSuccess([]);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByLabelText('Status')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Status') as HTMLSelectElement;
    expect(select.value).toBe('');
    const options = Array.from(select.options).map(o => o.value);
    expect(options).toContain('');
    expect(options).toContain('PENDING');
    expect(options).toContain('PAID');
    expect(options).toContain('FAILED');
    expect(options).toContain('REFUNDED');
  });

  it('filters payments by status when filter changes', async () => {
    const payments = [
      makePayment({ id: 'p-1', status: 'PENDING' }),
      makePayment({ id: 'p-2', status: 'PAID', paidAt: '2025-06-10T00:00:00Z' }),
    ];
    mockFetchSuccess(payments);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-row-p-1')).toBeInTheDocument();
      expect(screen.getByTestId('payment-row-p-2')).toBeInTheDocument();
    });

    // Filter to PAID only
    const select = screen.getByLabelText('Status');
    fireEvent.change(select, { target: { value: 'PAID' } });

    await waitFor(() => {
      expect(screen.queryByTestId('payment-row-p-1')).toBeNull();
      expect(screen.getByTestId('payment-row-p-2')).toBeInTheDocument();
    });
  });

  // --- Date range filter ---

  it('renders date range filters', async () => {
    mockFetchSuccess([]);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByLabelText('From date')).toBeInTheDocument();
      expect(screen.getByLabelText('To date')).toBeInTheDocument();
    });
  });

  it('filters payments by date range', async () => {
    const payments = [
      makePayment({ id: 'p-1', createdAt: '2025-06-01T10:00:00Z' }),
      makePayment({ id: 'p-2', createdAt: '2025-07-15T10:00:00Z' }),
      makePayment({ id: 'p-3', createdAt: '2025-08-01T10:00:00Z' }),
    ];
    mockFetchSuccess(payments);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-row-p-1')).toBeInTheDocument();
    });

    // Set date range to only July
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2025-07-01' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2025-07-31' } });

    await waitFor(() => {
      expect(screen.queryByTestId('payment-row-p-1')).toBeNull();
      expect(screen.getByTestId('payment-row-p-2')).toBeInTheDocument();
      expect(screen.queryByTestId('payment-row-p-3')).toBeNull();
    });
  });

  // --- Amount formatting ---

  it('formats amounts as USD currency', async () => {
    mockFetchSuccess([makePayment({ amount: '1234.56' })]);
    render(<PaymentHistory />);

    await waitFor(() => {
      // Amount appears in both the summary card and the table row
      const amountEls = screen.getAllByText('$1,234.56');
      expect(amountEls.length).toBeGreaterThan(0);
    });
  });

  // --- Date formatting ---

  it('formats createdAt date correctly', async () => {
    mockFetchSuccess([makePayment({ createdAt: '2025-06-15T10:00:00Z' })]);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByText('Jun 15, 2025')).toBeInTheDocument();
    });
  });

  it('shows dash for unpaid paidAt date', async () => {
    mockFetchSuccess([makePayment({ status: 'PENDING', paidAt: null })]);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-row-payment-1')).toBeInTheDocument();
    });

    const row = screen.getByTestId('payment-row-payment-1');
    expect(row).toHaveTextContent('—');
  });

  it('formats paidAt date when present', async () => {
    mockFetchSuccess([makePayment({ status: 'PAID', paidAt: '2025-06-20T10:00:00Z' })]);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByText('Jun 20, 2025')).toBeInTheDocument();
    });
  });

  // --- Loading state ---

  it('shows loading spinner while fetching', () => {
    let resolve!: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));

    render(<PaymentHistory />);

    expect(screen.getByRole('status')).toBeInTheDocument();

    // Cleanup
    resolve({ ok: true, json: () => Promise.resolve([]) });
  });

  // --- Empty state ---

  it('shows empty state when no payments', async () => {
    mockFetchSuccess([]);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByText('No payments found')).toBeInTheDocument();
    });
  });

  it('shows empty state message for filtered results', async () => {
    const payments = [makePayment({ id: 'p-1', status: 'PAID', paidAt: '2025-06-10T00:00:00Z' })];
    mockFetchSuccess(payments);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-row-p-1')).toBeInTheDocument();
    });

    // Filter to PENDING - nothing matches
    const select = screen.getByLabelText('Status');
    fireEvent.change(select, { target: { value: 'PENDING' } });

    await waitFor(() => {
      expect(screen.getByText('No payments found')).toBeInTheDocument();
    });
  });

  // --- Error state ---

  it('shows error message when fetch fails', async () => {
    mockFetchError(500, 'Something went wrong');
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockFetchError(500, 'Network error');
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('retries fetch when retry button is clicked', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Error' }),
        statusText: 'Error',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  // --- Accessibility ---

  it('has accessible filter region', async () => {
    mockFetchSuccess([]);
    render(<PaymentHistory />);

    await waitFor(() => {
      expect(screen.getByRole('search', { name: /filter payments/i })).toBeInTheDocument();
    });
  });
});
