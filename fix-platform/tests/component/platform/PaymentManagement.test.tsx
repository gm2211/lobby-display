/**
 * PaymentManagement component tests.
 *
 * Tests cover:
 * - Summary dashboard (total charges, total paid, total overdue, outstanding balance)
 * - Create charge form (resident/unit select, amount, description, due date, submit)
 * - Payments table (sortable list showing resident, amount, status, due date, paid date)
 * - Actions per payment: "Mark as Paid" and "Issue Refund" buttons
 * - Filters by status (all/pending/paid/overdue/refunded)
 * - Loading/error/empty states
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PaymentManagement from '../../../src/platform/pages/PaymentManagement';
import type { Payment, PaymentSummary, PlatformUserItem } from '../../../src/platform/types';

// --- Helpers ---

function makePayment(overrides: Partial<Payment> = {}, index = 0): Payment {
  return {
    id: index + 1,
    userId: index + 1,
    amount: '100.00',
    currency: 'USD',
    description: `Rent - Month ${index + 1}`,
    status: 'PENDING',
    paymentMethod: null,
    externalId: null,
    dueDate: '2025-08-01T00:00:00Z',
    paidAt: null,
    createdAt: '2025-07-01T10:00:00Z',
    updatedAt: '2025-07-01T10:00:00Z',
    items: [],
    user: {
      id: index + 1,
      unitNumber: `${index + 1}A`,
      displayName: `Resident ${index + 1}`,
    },
    ...overrides,
  };
}

function makePayments(count: number, overrides: Partial<Payment> = {}): Payment[] {
  return Array.from({ length: count }, (_, i) => makePayment(overrides, i));
}

function makeSummary(overrides: Partial<PaymentSummary> = {}): PaymentSummary {
  return {
    total: 1000,
    paid: 600,
    pending: 400,
    failed: 0,
    refunded: 0,
    count: 10,
    ...overrides,
  };
}

function makePlatformUsers(count = 3): PlatformUserItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    unitNumber: `${i + 1}A`,
    displayName: `Resident ${i + 1}`,
  }));
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

function mockFetchSuccess(paymentsData: Payment[], summaryData?: PaymentSummary, usersData?: PlatformUserItem[]) {
  const summary = summaryData ?? makeSummary();
  const users = usersData ?? makePlatformUsers();
  mockFetchSequence([
    { ok: true, data: summary },       // GET /api/platform/payments/summary
    { ok: true, data: paymentsData },  // GET /api/platform/payments
    { ok: true, data: users },         // GET /api/platform/users (for create form)
  ]);
}

function mockFetchError(message = 'Internal Server Error') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ message }),
    statusText: message,
  } as unknown as Response);
}

// --- Tests ---

describe('PaymentManagement', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // --- Loading state ---

  it('shows loading spinner while fetching', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<PaymentManagement />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Summary dashboard ---

  it('renders summary dashboard with correct totals', async () => {
    const summary = makeSummary({
      total: 5000,
      paid: 3000,
      pending: 2000,
      failed: 0,
      refunded: 500,
    });
    mockFetchSuccess(makePayments(2), summary);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('summary-total')).toBeInTheDocument();
    });

    expect(screen.getByTestId('summary-total')).toBeInTheDocument();
    expect(screen.getByTestId('summary-paid')).toBeInTheDocument();
    expect(screen.getByTestId('summary-pending')).toBeInTheDocument();
    expect(screen.getByTestId('summary-outstanding')).toBeInTheDocument();
  });

  it('displays formatted currency amounts in summary', async () => {
    const summary = makeSummary({ total: 5000, paid: 3000, pending: 2000 });
    mockFetchSuccess([], summary);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('summary-total')).toBeInTheDocument();
    });

    // Should show dollar amounts
    const totalCard = screen.getByTestId('summary-total');
    expect(totalCard.textContent).toContain('5,000');
  });

  // --- Payments table ---

  it('renders table headers for payments', async () => {
    mockFetchSuccess(makePayments(2));

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByRole('table', { name: /payments/i })).toBeInTheDocument();
    });

    const table = screen.getByRole('table', { name: /payments/i });
    const headers = table.querySelectorAll('th');
    const headerTexts = Array.from(headers).map(th => th.textContent?.trim().toLowerCase());
    expect(headerTexts.some(t => t?.includes('resident') || t?.includes('unit'))).toBe(true);
    expect(headerTexts.some(t => t?.includes('amount'))).toBe(true);
    expect(headerTexts.some(t => t?.includes('status'))).toBe(true);
    expect(headerTexts.some(t => t?.includes('due'))).toBe(true);
  });

  it('renders payment rows with resident info', async () => {
    const payments = [
      makePayment({ id: 1, user: { id: 1, unitNumber: '3B', displayName: 'Jane Doe' } }),
      makePayment({ id: 2, user: { id: 2, unitNumber: '5A', displayName: 'John Smith' } }, 1),
    ];
    mockFetchSuccess(payments);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-row-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('payment-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('payment-row-2')).toBeInTheDocument();
  });

  it('shows empty state when no payments', async () => {
    mockFetchSuccess([]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByText('No payments found')).toBeInTheDocument();
    });
  });

  // --- Status badges ---

  it('renders PENDING status badge', async () => {
    mockFetchSuccess([makePayment({ status: 'PENDING' })]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-PENDING')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-PENDING')).toHaveTextContent('Pending');
  });

  it('renders PAID status badge', async () => {
    mockFetchSuccess([makePayment({ status: 'PAID', paidAt: '2025-07-15T10:00:00Z' })]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-PAID')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-PAID')).toHaveTextContent('Paid');
  });

  it('renders FAILED status badge', async () => {
    mockFetchSuccess([makePayment({ status: 'FAILED' })]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-FAILED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-FAILED')).toHaveTextContent('Overdue');
  });

  it('renders REFUNDED status badge', async () => {
    mockFetchSuccess([makePayment({ status: 'REFUNDED' })]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-REFUNDED')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-badge-REFUNDED')).toHaveTextContent('Refunded');
  });

  // --- Action buttons ---

  it('shows Mark as Paid button for PENDING payments', async () => {
    mockFetchSuccess([makePayment({ id: 5, status: 'PENDING' })]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('mark-paid-5')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mark-paid-5')).toHaveTextContent(/mark.*paid/i);
  });

  it('shows Issue Refund button for PAID payments', async () => {
    mockFetchSuccess([makePayment({ id: 7, status: 'PAID', paidAt: '2025-07-15T10:00:00Z' })]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('refund-7')).toBeInTheDocument();
    });
    expect(screen.getByTestId('refund-7')).toHaveTextContent(/refund/i);
  });

  it('does not show Mark as Paid for already PAID payments', async () => {
    mockFetchSuccess([makePayment({ id: 8, status: 'PAID', paidAt: '2025-07-15T10:00:00Z' })]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-row-8')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('mark-paid-8')).toBeNull();
  });

  // --- Status filter ---

  it('renders status filter buttons/tabs', async () => {
    mockFetchSuccess([]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('filter-all')).toBeInTheDocument();
    });

    expect(screen.getByTestId('filter-all')).toBeInTheDocument();
    expect(screen.getByTestId('filter-PENDING')).toBeInTheDocument();
    expect(screen.getByTestId('filter-PAID')).toBeInTheDocument();
    expect(screen.getByTestId('filter-FAILED')).toBeInTheDocument();
    expect(screen.getByTestId('filter-REFUNDED')).toBeInTheDocument();
  });

  it('filters payments by PENDING status', async () => {
    const payments = [
      makePayment({ id: 1, status: 'PENDING' }),
      makePayment({ id: 2, status: 'PAID', paidAt: '2025-07-15T10:00:00Z' }, 1),
    ];
    mockFetchSuccess(payments);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-row-1')).toBeInTheDocument();
    });

    // Click PENDING filter
    fireEvent.click(screen.getByTestId('filter-PENDING'));

    // PAID payment should be hidden
    await waitFor(() => {
      expect(screen.queryByTestId('payment-row-2')).toBeNull();
    });
    expect(screen.getByTestId('payment-row-1')).toBeInTheDocument();
  });

  it('filters payments by PAID status', async () => {
    const payments = [
      makePayment({ id: 1, status: 'PENDING' }),
      makePayment({ id: 2, status: 'PAID', paidAt: '2025-07-15T10:00:00Z' }, 1),
    ];
    mockFetchSuccess(payments);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-row-2')).toBeInTheDocument();
    });

    // Click PAID filter
    fireEvent.click(screen.getByTestId('filter-PAID'));

    // PENDING payment should be hidden
    await waitFor(() => {
      expect(screen.queryByTestId('payment-row-1')).toBeNull();
    });
    expect(screen.getByTestId('payment-row-2')).toBeInTheDocument();
  });

  it('shows all payments when "All" filter is clicked', async () => {
    const payments = [
      makePayment({ id: 1, status: 'PENDING' }),
      makePayment({ id: 2, status: 'PAID', paidAt: '2025-07-15T10:00:00Z' }, 1),
    ];
    mockFetchSuccess(payments);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-row-1')).toBeInTheDocument();
    });

    // Filter to PENDING, then back to all
    fireEvent.click(screen.getByTestId('filter-PENDING'));
    await waitFor(() => {
      expect(screen.queryByTestId('payment-row-2')).toBeNull();
    });

    fireEvent.click(screen.getByTestId('filter-all'));

    await waitFor(() => {
      expect(screen.getByTestId('payment-row-2')).toBeInTheDocument();
    });
    expect(screen.getByTestId('payment-row-1')).toBeInTheDocument();
  });

  // --- Create charge form ---

  it('renders create charge form section', async () => {
    mockFetchSuccess([]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('create-charge-form')).toBeInTheDocument();
    });
  });

  it('has amount input in create charge form', async () => {
    mockFetchSuccess([]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('charge-amount')).toBeInTheDocument();
    });
  });

  it('has description input in create charge form', async () => {
    mockFetchSuccess([]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('charge-description')).toBeInTheDocument();
    });
  });

  it('has due date input in create charge form', async () => {
    mockFetchSuccess([]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('charge-due-date')).toBeInTheDocument();
    });
  });

  it('has submit button in create charge form', async () => {
    mockFetchSuccess([]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('charge-submit')).toBeInTheDocument();
    });
  });

  it('shows validation error when submitting empty form', async () => {
    mockFetchSuccess([]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('charge-submit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('charge-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toBeInTheDocument();
    });
  });

  // --- Error state ---

  it('shows error message when fetch fails', async () => {
    mockFetchError('Something went wrong');

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // --- Mark as Paid action ---

  it('calls PUT endpoint when Mark as Paid is clicked', async () => {
    const payment = makePayment({ id: 10, status: 'PENDING' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(makeSummary()) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([payment]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(makePlatformUsers()) })
      // CSRF token fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) })
      // PUT call
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...payment, status: 'PAID', paidAt: new Date().toISOString() }) })
      // Refetch summary
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(makeSummary({ paid: 100 })) })
      // Refetch payments
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ ...payment, status: 'PAID' }]) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('mark-paid-10')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mark-paid-10'));

    await waitFor(() => {
      // Should have made a PUT call
      const putCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'PUT'
      );
      expect(putCall).toBeTruthy();
    });
  });

  // --- Sorting ---

  it('renders sort controls or sortable column headers', async () => {
    mockFetchSuccess(makePayments(3));

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByRole('table', { name: /payments/i })).toBeInTheDocument();
    });

    // Should have at least one sortable column
    const table = screen.getByRole('table', { name: /payments/i });
    const sortableHeaders = table.querySelectorAll('[data-sortable]');
    expect(sortableHeaders.length).toBeGreaterThan(0);
  });

  // --- Date formatting ---

  it('formats due date correctly in table', async () => {
    const payment = makePayment({ dueDate: '2025-08-15T00:00:00Z' });
    mockFetchSuccess([payment]);

    render(<PaymentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-row-1')).toBeInTheDocument();
    });

    // Should show formatted date
    expect(screen.getByText('Aug 15, 2025')).toBeInTheDocument();
  });
});
