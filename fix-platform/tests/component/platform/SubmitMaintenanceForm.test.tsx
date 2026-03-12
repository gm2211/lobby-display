/**
 * SubmitMaintenanceForm component tests.
 *
 * Tests cover:
 * - Renders all form fields (title, description, category, priority, unitNumber, location)
 * - Form validation - required fields show error messages
 * - Submit button POSTs to /api/platform/maintenance
 * - Success state shows request number and "Submit Another" button
 * - Error state shows inline error messages
 * - Back link to /platform/maintenance
 * - Loading state during submission
 * - Optional fields (location) not required
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SubmitMaintenanceForm from '../../../src/platform/pages/SubmitMaintenanceForm';

// --- Helpers ---

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/platform/maintenance/new']}>
      <Routes>
        <Route path="/platform/maintenance/new" element={<SubmitMaintenanceForm />} />
        <Route path="/platform/maintenance" element={<div data-testid="maintenance-list">Maintenance List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function mockFetchSuccess(data: object = { id: 42, title: 'Leaky faucet' }) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    // CSRF token endpoint - always return a valid token
    if (url.includes('/csrf')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token: 'test-csrf-token' }),
      } as unknown as Response);
    }
    // Maintenance endpoint - return success
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
    // Maintenance endpoint - return error
    return Promise.resolve({
      ok: false,
      status,
      json: () => Promise.resolve({ message }),
      statusText: message,
    } as unknown as Response);
  });
}

// Fill all required fields
function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Leaky faucet in bathroom' } });
  fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'The faucet drips constantly' } });
  // Category select
  fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Plumbing' } });
  // Priority select
  fireEvent.change(screen.getByLabelText(/priority/i), { target: { value: 'HIGH' } });
  // Unit number
  fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
}

// --- Tests ---

describe('SubmitMaintenanceForm', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // --- Rendering ---

  it('renders the page title', () => {
    renderForm();
    expect(screen.getByText(/submit maintenance request/i)).toBeInTheDocument();
  });

  it('renders title input', () => {
    renderForm();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
  });

  it('renders description textarea', () => {
    renderForm();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it('renders category dropdown with required options', () => {
    renderForm();
    const categorySelect = screen.getByLabelText(/category/i);
    expect(categorySelect).toBeInTheDocument();
    const options = Array.from((categorySelect as HTMLSelectElement).options).map(o => o.value);
    expect(options).toContain('Plumbing');
    expect(options).toContain('Electrical');
    expect(options).toContain('HVAC');
    expect(options).toContain('Appliance');
    expect(options).toContain('Structural');
    expect(options).toContain('Pest Control');
    expect(options).toContain('Other');
  });

  it('renders priority dropdown with required options', () => {
    renderForm();
    const prioritySelect = screen.getByLabelText(/priority/i);
    expect(prioritySelect).toBeInTheDocument();
    const options = Array.from((prioritySelect as HTMLSelectElement).options).map(o => o.value);
    expect(options).toContain('LOW');
    expect(options).toContain('MEDIUM');
    expect(options).toContain('HIGH');
    expect(options).toContain('URGENT');
  });

  it('renders unit number input', () => {
    renderForm();
    expect(screen.getByLabelText(/unit number/i)).toBeInTheDocument();
  });

  it('renders location input (optional)', () => {
    renderForm();
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
  });

  it('renders submit button', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });

  it('renders back link to /platform/maintenance', () => {
    renderForm();
    const backLink = screen.getByRole('link', { name: /back|maintenance/i });
    expect(backLink).toBeInTheDocument();
  });

  // --- Validation ---

  it('shows validation error when title is empty on submit', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      expect(screen.getByTestId('error-title')).toBeInTheDocument();
    });
  });

  it('shows validation error when description is empty on submit', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Leaky faucet' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      expect(screen.getByTestId('error-description')).toBeInTheDocument();
    });
  });

  it('shows validation error when category is not selected', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Leaky faucet' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Dripping constantly' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      expect(screen.getByTestId('error-category')).toBeInTheDocument();
    });
  });

  it('shows validation error when priority is not selected', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Leaky faucet' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Dripping constantly' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Plumbing' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      expect(screen.getByTestId('error-priority')).toBeInTheDocument();
    });
  });

  it('shows validation error when unit number is empty', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Leaky faucet' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Dripping constantly' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Plumbing' } });
    fireEvent.change(screen.getByLabelText(/priority/i), { target: { value: 'HIGH' } });
    // Leave unit number empty
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      expect(screen.getByTestId('error-unitNumber')).toBeInTheDocument();
    });
  });

  it('does NOT show validation error when location is empty (optional)', async () => {
    mockFetchSuccess({ id: 1 });
    renderForm();
    fillRequiredFields();
    // Leave location empty
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      expect(screen.queryByTestId('error-location')).toBeNull();
    });
  });

  it('clears field error when user starts typing', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      expect(screen.getByTestId('error-title')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Fix drain' } });
    await waitFor(() => {
      expect(screen.queryByTestId('error-title')).toBeNull();
    });
  });

  // --- Submission ---

  it('POSTs to /api/platform/maintenance on valid form submit', async () => {
    mockFetchSuccess({ id: 42 });
    renderForm();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const maintenancePost = fetchCalls.find((call: unknown[]) => {
      const url = call[0] as string;
      return url.includes('/api/platform/maintenance') && !url.includes('/csrf');
    });
    expect(maintenancePost).toBeDefined();
  });

  it('sends correct request body with required fields', async () => {
    mockFetchSuccess({ id: 42 });
    renderForm();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const maintenancePost = fetchCalls.find((call: unknown[]) => {
        const url = call[0] as string;
        return url.includes('/api/platform/maintenance') && !url.includes('/csrf');
      });
      expect(maintenancePost).toBeDefined();
      if (maintenancePost) {
        const body = JSON.parse((maintenancePost[1] as RequestInit).body as string);
        expect(body.title).toBe('Leaky faucet in bathroom');
        expect(body.description).toBe('The faucet drips constantly');
        expect(body.category).toBe('Plumbing');
        expect(body.priority).toBe('HIGH');
        expect(body.unitNumber).toBe('4B');
      }
    });
  });

  it('includes location in request body when provided', async () => {
    mockFetchSuccess({ id: 42 });
    renderForm();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/location/i), { target: { value: 'Kitchen sink' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const maintenancePost = fetchCalls.find((call: unknown[]) => {
        const url = call[0] as string;
        return url.includes('/api/platform/maintenance') && !url.includes('/csrf');
      });
      if (maintenancePost) {
        const body = JSON.parse((maintenancePost[1] as RequestInit).body as string);
        expect(body.location).toBe('Kitchen sink');
      }
    });
  });

  // --- Success state ---

  it('shows success message with request number after submission', async () => {
    mockFetchSuccess({ id: 42, title: 'Leaky faucet in bathroom' });
    renderForm();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      expect(screen.getByText(/request.*submitted|submitted.*successfully/i)).toBeInTheDocument();
    });
  });

  it('shows request number (id) in success message', async () => {
    mockFetchSuccess({ id: 42, title: 'Leaky faucet in bathroom' });
    renderForm();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      expect(screen.getByText(/42|#42/)).toBeInTheDocument();
    });
  });

  it('shows "Submit Another" button after successful submission', async () => {
    mockFetchSuccess({ id: 42 });
    renderForm();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submit another/i })).toBeInTheDocument();
    });
  });

  it('resets form when "Submit Another" is clicked', async () => {
    mockFetchSuccess({ id: 42 });
    renderForm();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      screen.getByRole('button', { name: /submit another/i });
    });
    fireEvent.click(screen.getByRole('button', { name: /submit another/i }));
    await waitFor(() => {
      // Form should be reset - title field should be empty
      expect(screen.getByLabelText(/title/i)).toHaveValue('');
    });
  });

  // --- Error state ---

  it('shows error message when submission fails', async () => {
    mockFetchError(400, 'Title is required');
    renderForm();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows server error message when submission fails with 500', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderForm();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // --- Loading state ---

  it('disables submit button during submission', async () => {
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
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      const submitBtn = screen.getByRole('button', { name: /submit|submitting/i });
      expect(submitBtn).toBeDisabled();
    });

    // Cleanup
    resolvePromise({ ok: true, status: 201, json: () => Promise.resolve({ id: 1 }) });
  });

  it('shows loading text during submission', async () => {
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
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/submitting/i)).toBeInTheDocument();
    });

    resolvePromise({ ok: true, status: 201, json: () => Promise.resolve({ id: 1 }) });
  });

  // --- Navigation ---

  it('navigates to /platform/maintenance when back link is clicked', () => {
    renderForm();
    const backLink = screen.getByRole('link', { name: /back|maintenance/i });
    fireEvent.click(backLink);
    expect(screen.getByTestId('maintenance-list')).toBeInTheDocument();
  });
});
