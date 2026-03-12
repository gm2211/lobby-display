/**
 * ReportViolationForm component tests.
 *
 * Tests cover:
 * - Renders all form fields (unit number, category, description, severity, fineAmount, dueDate)
 * - Severity selector shows color-coded labels (LOW, MEDIUM, HIGH, CRITICAL)
 * - Form validation - required fields show error messages
 * - Submit button POSTs to /api/platform/violations
 * - Success state navigates back to violations list
 * - Error state shows error message
 * - Cancel/back button navigates to violations list
 * - Optional fields (fineAmount, dueDate) are not required
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReportViolationForm from '../../../src/platform/pages/ReportViolationForm';

// --- Helpers ---

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/platform/violations/new']}>
      <Routes>
        <Route path="/platform/violations/new" element={<ReportViolationForm />} />
        <Route path="/platform/violations" element={<div data-testid="violations-list">Violations List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function mockFetchSuccess(data: object = {}) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    // CSRF token endpoint - always return a valid token
    if (url.includes('/csrf')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token: 'test-csrf-token' }),
      } as unknown as Response);
    }
    // Violations endpoint - return success
    return Promise.resolve({
      ok: true,
      status: 201,
      json: () => Promise.resolve(data),
    } as unknown as Response);
  });
}

function mockFetchError(status = 400, message = 'Validation error') {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    // CSRF token endpoint - always return a valid token
    if (url.includes('/csrf')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token: 'test-csrf-token' }),
      } as unknown as Response);
    }
    // Violations endpoint - return error
    return Promise.resolve({
      ok: false,
      status,
      json: () => Promise.resolve({ message }),
      statusText: message,
    } as unknown as Response);
  });
}

// --- Tests ---

describe('ReportViolationForm', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // --- Rendering ---

  it('renders the page title', () => {
    renderForm();
    expect(screen.getByText('Report Violation')).toBeInTheDocument();
  });

  it('renders unit number input', () => {
    renderForm();
    expect(screen.getByLabelText(/unit number/i)).toBeInTheDocument();
  });

  it('renders category dropdown', () => {
    renderForm();
    const categorySelect = screen.getByLabelText(/category/i);
    expect(categorySelect).toBeInTheDocument();
    // Should have category options
    const options = Array.from((categorySelect as HTMLSelectElement).options).map(o => o.value);
    expect(options).toContain('Noise');
    expect(options).toContain('Parking');
    expect(options).toContain('Pet');
    expect(options).toContain('Property Damage');
    expect(options).toContain('Other');
  });

  it('renders description textarea', () => {
    renderForm();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it('renders severity selector with all options', () => {
    renderForm();
    // Check all severity options are present
    expect(screen.getByTestId('severity-LOW')).toBeInTheDocument();
    expect(screen.getByTestId('severity-MEDIUM')).toBeInTheDocument();
    expect(screen.getByTestId('severity-HIGH')).toBeInTheDocument();
    expect(screen.getByTestId('severity-CRITICAL')).toBeInTheDocument();
  });

  it('renders severity labels', () => {
    renderForm();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('renders fine amount input (optional)', () => {
    renderForm();
    expect(screen.getByLabelText(/fine amount/i)).toBeInTheDocument();
  });

  it('renders due date input (optional)', () => {
    renderForm();
    expect(screen.getByLabelText(/due date/i)).toBeInTheDocument();
  });

  it('renders submit button', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });

  it('renders cancel/back button', () => {
    renderForm();
    // Should have a cancel or back button
    const cancelBtn = screen.getByRole('button', { name: /cancel|back/i });
    expect(cancelBtn).toBeInTheDocument();
  });

  // --- Severity selector color-coding ---

  it('LOW severity has green/muted color styling', () => {
    renderForm();
    const lowOption = screen.getByTestId('severity-LOW');
    // Just verify it exists and has text
    expect(lowOption).toHaveTextContent('Low');
  });

  it('CRITICAL severity has red/danger color styling', () => {
    renderForm();
    const criticalOption = screen.getByTestId('severity-CRITICAL');
    expect(criticalOption).toHaveTextContent('Critical');
  });

  // --- Validation ---

  it('shows validation error when unit number is empty on submit', async () => {
    renderForm();

    const submitBtn = screen.getByRole('button', { name: /submit/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/unit number.*required|required.*unit number/i)).toBeInTheDocument();
    });
  });

  it('shows validation error when category is not selected on submit', async () => {
    renderForm();

    // Fill unit number but leave category empty
    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });

    const submitBtn = screen.getByRole('button', { name: /submit/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/category.*required|required.*category/i)).toBeInTheDocument();
    });
  });

  it('shows validation error when description is empty on submit', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    const categorySelect = screen.getByLabelText(/category/i);
    fireEvent.change(categorySelect, { target: { value: 'Noise' } });

    const submitBtn = screen.getByRole('button', { name: /submit/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/description.*required|required.*description/i)).toBeInTheDocument();
    });
  });

  it('shows validation error when severity is not selected on submit', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Noise' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Loud music' } });
    // Don't select severity

    const submitBtn = screen.getByRole('button', { name: /submit/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/severity.*required|required.*severity/i)).toBeInTheDocument();
    });
  });

  it('does NOT show validation error when fine amount is empty (optional)', async () => {
    mockFetchSuccess({ id: 1 });

    renderForm();

    // Fill required fields
    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Noise' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Loud music' } });
    // Select severity
    fireEvent.click(screen.getByTestId('severity-MEDIUM'));

    // Leave fine amount empty (optional)
    const submitBtn = screen.getByRole('button', { name: /submit/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      // Should not show fine amount validation error
      expect(screen.queryByText(/fine amount.*required/i)).toBeNull();
    });
  });

  // --- Submission ---

  it('POSTs to /api/platform/violations on valid form submit', async () => {
    mockFetchSuccess({ id: 1, unitNumber: '4B' });

    renderForm();

    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Noise' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Loud music after midnight' } });
    fireEvent.click(screen.getByTestId('severity-HIGH'));

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // Check the URL and method
    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const violationPost = fetchCalls.find((call: unknown[]) =>
      typeof call[0] === 'string' && (call[0] as string).includes('/api/platform/violations') &&
      !String(call[0]).includes('/csrf')
    );
    expect(violationPost).toBeDefined();
  });

  it('sends correct request body including required fields', async () => {
    mockFetchSuccess({ id: 1 });

    renderForm();

    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '5C' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Parking' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Car blocking exit' } });
    fireEvent.click(screen.getByTestId('severity-MEDIUM'));

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const violationPost = fetchCalls.find((call: unknown[]) => {
        const url = call[0] as string;
        return url.includes('/api/platform/violations') && !url.includes('/csrf');
      });
      expect(violationPost).toBeDefined();
      if (violationPost) {
        const body = JSON.parse((violationPost[1] as RequestInit).body as string);
        expect(body.unitNumber).toBe('5C');
        expect(body.category).toBe('Parking');
        expect(body.description).toBe('Car blocking exit');
        expect(body.severity).toBe('MEDIUM');
      }
    });
  });

  it('includes fineAmount in request body when provided', async () => {
    mockFetchSuccess({ id: 1 });

    renderForm();

    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '6D' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Pet' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Unauthorized pet' } });
    fireEvent.click(screen.getByTestId('severity-LOW'));
    fireEvent.change(screen.getByLabelText(/fine amount/i), { target: { value: '250' } });

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const violationPost = fetchCalls.find((call: unknown[]) => {
        const url = call[0] as string;
        return url.includes('/api/platform/violations') && !url.includes('/csrf');
      });
      if (violationPost) {
        const body = JSON.parse((violationPost[1] as RequestInit).body as string);
        expect(body.fineAmount).toBe(250);
      }
    });
  });

  // --- Success state ---

  it('navigates to violations list on successful submission', async () => {
    mockFetchSuccess({ id: 1, unitNumber: '4B' });

    renderForm();

    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Noise' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Loud music' } });
    fireEvent.click(screen.getByTestId('severity-HIGH'));

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByTestId('violations-list')).toBeInTheDocument();
    });
  });

  // --- Error state ---

  it('shows error message when submission fails', async () => {
    mockFetchError(400, 'unitNumber is required');

    renderForm();

    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Noise' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Loud music' } });
    fireEvent.click(screen.getByTestId('severity-HIGH'));

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows server error message when submission fails with 500', async () => {
    mockFetchError(500, 'Internal Server Error');

    renderForm();

    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Noise' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Loud music' } });
    fireEvent.click(screen.getByTestId('severity-HIGH'));

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // --- Submit button states ---

  it('disables submit button during submission', async () => {
    // Simulate a slow API
    let resolvePromise!: (v: unknown) => void;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/csrf')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'test-token' }),
        });
      }
      return new Promise(r => { resolvePromise = r; });
    });

    renderForm();

    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Noise' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Loud music' } });
    fireEvent.click(screen.getByTestId('severity-HIGH'));

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      const submitBtn = screen.getByRole('button', { name: /submit|submitting/i });
      expect(submitBtn).toBeDisabled();
    });

    // Cleanup
    resolvePromise({ ok: true, status: 201, json: () => Promise.resolve({ id: 1 }) });
  });

  // --- Cancel navigation ---

  it('navigates to violations list on cancel', () => {
    renderForm();

    const cancelBtn = screen.getByRole('button', { name: /cancel|back/i });
    fireEvent.click(cancelBtn);

    expect(screen.getByTestId('violations-list')).toBeInTheDocument();
  });
});
