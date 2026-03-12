/**
 * LogParcelForm component tests — Red/Blue TDD
 *
 * Tests cover:
 * - Renders all form fields (tracking number, carrier, unit, recipient name, description, notes)
 * - Role-based access: shows "Access Denied" for RESIDENT/BOARD_MEMBER roles
 * - Role-based access: renders form for CONCIERGE/MANAGER/SECURITY roles
 * - Form validation: required fields show error messages
 * - Tracking number format validation
 * - Submit via POST /api/platform/parcels with correct data
 * - Success state: shows parcel details and "Log Another" button
 * - "Log Another" resets form
 * - Back link to /platform/parcels
 * - Loading state during submission
 * - Error handling with inline error messages
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock api module
vi.mock('../../../src/utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import LogParcelForm from '../../../src/platform/pages/LogParcelForm';
import { api } from '../../../src/utils/api';

// --- Helpers ---

const mockedApi = api as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/platform/parcels/new']}>
      <Routes>
        <Route path="/platform/parcels/new" element={<LogParcelForm />} />
        <Route path="/platform/parcels" element={<div data-testid="parcels-list">Parcels List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const allowedRoles = ['CONCIERGE', 'MANAGER', 'SECURITY'] as const;
const deniedRoles = ['RESIDENT', 'BOARD_MEMBER'] as const;

const baseParcel = {
  id: 1,
  trackingNumber: 'UPS12345678',
  carrier: 'UPS',
  status: 'RECEIVED',
  recipientName: 'Jane Smith',
  unitNumber: '4B',
  description: 'Small box',
  receivedAt: '2025-01-15T10:00:00.000Z',
  notifiedAt: null,
  pickedUpAt: null,
  notes: null,
  createdAt: '2025-01-15T10:00:00.000Z',
  updatedAt: '2025-01-15T10:00:00.000Z',
};

// --- Tests ---

describe('LogParcelForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    // Default: CONCIERGE role
    mockedApi.get.mockResolvedValue({ platformRole: 'CONCIERGE' });
    mockedApi.post.mockResolvedValue(baseParcel);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Rendering ---

  it('renders the page title', async () => {
    renderForm();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /log parcel/i })).toBeInTheDocument();
    });
  });

  it('renders back link to /platform/parcels', async () => {
    renderForm();
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /back|parcels/i });
      expect(link).toBeInTheDocument();
    });
  });

  it('renders tracking number input', async () => {
    renderForm();
    await waitFor(() => {
      expect(screen.getByLabelText(/tracking number/i)).toBeInTheDocument();
    });
  });

  it('renders carrier select with required options', async () => {
    renderForm();
    await waitFor(() => {
      const select = screen.getByLabelText(/carrier/i);
      expect(select).toBeInTheDocument();
      const options = Array.from((select as HTMLSelectElement).options).map(o => o.value);
      expect(options).toContain('UPS');
      expect(options).toContain('FedEx');
      expect(options).toContain('USPS');
      expect(options).toContain('Amazon');
      expect(options).toContain('DHL');
      expect(options).toContain('Other');
    });
  });

  it('renders recipient unit number input', async () => {
    renderForm();
    await waitFor(() => {
      expect(screen.getByLabelText(/unit number/i)).toBeInTheDocument();
    });
  });

  it('renders recipient name input', async () => {
    renderForm();
    await waitFor(() => {
      expect(screen.getByLabelText(/recipient name/i)).toBeInTheDocument();
    });
  });

  it('renders description textarea (optional)', async () => {
    renderForm();
    await waitFor(() => {
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    });
  });

  it('renders notes textarea (optional)', async () => {
    renderForm();
    await waitFor(() => {
      expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    });
  });

  it('renders submit button', async () => {
    renderForm();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log parcel|submit/i })).toBeInTheDocument();
    });
  });

  // --- Role-based access ---

  it.each(allowedRoles)('renders form for %s role', async (role) => {
    mockedApi.get.mockResolvedValue({ platformRole: role });
    renderForm();
    await waitFor(() => {
      expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/tracking number/i)).toBeInTheDocument();
    });
  });

  it.each(deniedRoles)('shows Access Denied for %s role', async (role) => {
    mockedApi.get.mockResolvedValue({ platformRole: role });
    renderForm();
    await waitFor(() => {
      expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    });
  });

  it('shows Access Denied when platformRole is not present', async () => {
    mockedApi.get.mockResolvedValue({ platformRole: null });
    renderForm();
    await waitFor(() => {
      expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    });
  });

  // --- Validation ---

  it('shows validation error when tracking number is empty on submit', async () => {
    renderForm();
    await waitFor(() => screen.getByRole('button', { name: /log parcel|submit/i }));

    fireEvent.click(screen.getByRole('button', { name: /log parcel|submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/tracking number.*required|required.*tracking/i)).toBeInTheDocument();
    });
  });

  it('shows validation error when carrier is not selected on submit', async () => {
    renderForm();
    await waitFor(() => screen.getByRole('button', { name: /log parcel|submit/i }));

    fireEvent.change(screen.getByLabelText(/tracking number/i), { target: { value: 'UPS12345678' } });

    fireEvent.click(screen.getByRole('button', { name: /log parcel|submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/carrier.*required|required.*carrier/i)).toBeInTheDocument();
    });
  });

  it('shows validation error when unit number is empty on submit', async () => {
    renderForm();
    await waitFor(() => screen.getByRole('button', { name: /log parcel|submit/i }));

    fireEvent.change(screen.getByLabelText(/tracking number/i), { target: { value: 'UPS12345678' } });
    fireEvent.change(screen.getByLabelText(/carrier/i), { target: { value: 'UPS' } });

    fireEvent.click(screen.getByRole('button', { name: /log parcel|submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/unit number.*required|required.*unit/i)).toBeInTheDocument();
    });
  });

  it('shows validation error when recipient name is empty on submit', async () => {
    renderForm();
    await waitFor(() => screen.getByRole('button', { name: /log parcel|submit/i }));

    fireEvent.change(screen.getByLabelText(/tracking number/i), { target: { value: 'UPS12345678' } });
    fireEvent.change(screen.getByLabelText(/carrier/i), { target: { value: 'UPS' } });
    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });

    fireEvent.click(screen.getByRole('button', { name: /log parcel|submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/recipient name.*required|required.*recipient/i)).toBeInTheDocument();
    });
  });

  it('does NOT require description or notes', async () => {
    renderForm();
    await waitFor(() => screen.getByRole('button', { name: /log parcel|submit/i }));

    fireEvent.change(screen.getByLabelText(/tracking number/i), { target: { value: 'UPS12345678' } });
    fireEvent.change(screen.getByLabelText(/carrier/i), { target: { value: 'UPS' } });
    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/recipient name/i), { target: { value: 'Jane Smith' } });
    // Leave description and notes empty

    fireEvent.click(screen.getByRole('button', { name: /log parcel|submit/i }));

    await waitFor(() => {
      expect(screen.queryByText(/description.*required/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/notes.*required/i)).not.toBeInTheDocument();
    });
  });

  it('clears validation error when user types in field', async () => {
    renderForm();
    await waitFor(() => screen.getByRole('button', { name: /log parcel|submit/i }));

    fireEvent.click(screen.getByRole('button', { name: /log parcel|submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/tracking number.*required|required.*tracking/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/tracking number/i), { target: { value: 'UPS12345678' } });

    await waitFor(() => {
      expect(screen.queryByText(/tracking number.*required|required.*tracking/i)).not.toBeInTheDocument();
    });
  });

  // --- Submission ---

  it('POSTs to /api/platform/parcels on valid form submit', async () => {
    renderForm();
    await waitFor(() => screen.getByLabelText(/tracking number/i));

    fireEvent.change(screen.getByLabelText(/tracking number/i), { target: { value: 'UPS12345678' } });
    fireEvent.change(screen.getByLabelText(/carrier/i), { target: { value: 'UPS' } });
    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/recipient name/i), { target: { value: 'Jane Smith' } });

    fireEvent.click(screen.getByRole('button', { name: /log parcel|submit/i }));

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith(
        '/api/platform/parcels',
        expect.objectContaining({
          trackingNumber: 'UPS12345678',
          carrier: 'UPS',
          unitNumber: '4B',
          recipientName: 'Jane Smith',
        })
      );
    });
  });

  it('includes description and notes in request when provided', async () => {
    renderForm();
    await waitFor(() => screen.getByLabelText(/tracking number/i));

    fireEvent.change(screen.getByLabelText(/tracking number/i), { target: { value: 'FEDEX9876' } });
    fireEvent.change(screen.getByLabelText(/carrier/i), { target: { value: 'FedEx' } });
    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '12C' } });
    fireEvent.change(screen.getByLabelText(/recipient name/i), { target: { value: 'Bob Jones' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Large box' } });
    fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: 'Fragile' } });

    fireEvent.click(screen.getByRole('button', { name: /log parcel|submit/i }));

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith(
        '/api/platform/parcels',
        expect.objectContaining({
          description: 'Large box',
          notes: 'Fragile',
        })
      );
    });
  });

  // --- Success state ---

  it('shows success message with parcel details after submission', async () => {
    mockedApi.post.mockResolvedValue({
      ...baseParcel,
      trackingNumber: 'UPS12345678',
      carrier: 'UPS',
      recipientName: 'Jane Smith',
      unitNumber: '4B',
    });

    renderForm();
    await waitFor(() => screen.getByLabelText(/tracking number/i));

    fireEvent.change(screen.getByLabelText(/tracking number/i), { target: { value: 'UPS12345678' } });
    fireEvent.change(screen.getByLabelText(/carrier/i), { target: { value: 'UPS' } });
    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/recipient name/i), { target: { value: 'Jane Smith' } });

    fireEvent.click(screen.getByRole('button', { name: /log parcel|submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/parcel logged|success/i)).toBeInTheDocument();
    });
  });

  it('shows tracking number in success state', async () => {
    mockedApi.post.mockResolvedValue({
      ...baseParcel,
      trackingNumber: 'UPS12345678',
    });

    renderForm();
    await waitFor(() => screen.getByLabelText(/tracking number/i));

    fireEvent.change(screen.getByLabelText(/tracking number/i), { target: { value: 'UPS12345678' } });
    fireEvent.change(screen.getByLabelText(/carrier/i), { target: { value: 'UPS' } });
    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/recipient name/i), { target: { value: 'Jane Smith' } });

    fireEvent.click(screen.getByRole('button', { name: /log parcel|submit/i }));

    await waitFor(() => {
      expect(screen.getByText('UPS12345678')).toBeInTheDocument();
    });
  });

  it('shows "Log Another" button in success state', async () => {
    renderForm();
    await waitFor(() => screen.getByLabelText(/tracking number/i));

    fireEvent.change(screen.getByLabelText(/tracking number/i), { target: { value: 'UPS12345678' } });
    fireEvent.change(screen.getByLabelText(/carrier/i), { target: { value: 'UPS' } });
    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/recipient name/i), { target: { value: 'Jane Smith' } });

    fireEvent.click(screen.getByRole('button', { name: /log parcel|submit/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log another/i })).toBeInTheDocument();
    });
  });

  it('"Log Another" button resets the form', async () => {
    renderForm();
    await waitFor(() => screen.getByLabelText(/tracking number/i));

    fireEvent.change(screen.getByLabelText(/tracking number/i), { target: { value: 'UPS12345678' } });
    fireEvent.change(screen.getByLabelText(/carrier/i), { target: { value: 'UPS' } });
    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/recipient name/i), { target: { value: 'Jane Smith' } });

    fireEvent.click(screen.getByRole('button', { name: /log parcel|submit/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log another/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /log another/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/tracking number/i)).toBeInTheDocument();
      expect((screen.getByLabelText(/tracking number/i) as HTMLInputElement).value).toBe('');
    });
  });

  // --- Error handling ---

  it('shows error message when submission fails', async () => {
    mockedApi.post.mockRejectedValue(new Error('Failed to log parcel'));

    renderForm();
    await waitFor(() => screen.getByLabelText(/tracking number/i));

    fireEvent.change(screen.getByLabelText(/tracking number/i), { target: { value: 'UPS12345678' } });
    fireEvent.change(screen.getByLabelText(/carrier/i), { target: { value: 'UPS' } });
    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/recipient name/i), { target: { value: 'Jane Smith' } });

    fireEvent.click(screen.getByRole('button', { name: /log parcel|submit/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows error message content from API error', async () => {
    mockedApi.post.mockRejectedValue(new Error('Tracking number already exists'));

    renderForm();
    await waitFor(() => screen.getByLabelText(/tracking number/i));

    fireEvent.change(screen.getByLabelText(/tracking number/i), { target: { value: 'UPS12345678' } });
    fireEvent.change(screen.getByLabelText(/carrier/i), { target: { value: 'UPS' } });
    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/recipient name/i), { target: { value: 'Jane Smith' } });

    fireEvent.click(screen.getByRole('button', { name: /log parcel|submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/tracking number already exists/i)).toBeInTheDocument();
    });
  });

  // --- Loading state ---

  it('disables submit button during submission', async () => {
    let resolvePost!: (value: unknown) => void;
    // Profile loads fast, only block post
    mockedApi.get.mockResolvedValue({ platformRole: 'CONCIERGE' });
    mockedApi.post.mockReturnValue(new Promise(r => { resolvePost = r; }));

    renderForm();
    await waitFor(() => screen.getByLabelText(/tracking number/i));

    fireEvent.change(screen.getByLabelText(/tracking number/i), { target: { value: 'UPS12345678' } });
    fireEvent.change(screen.getByLabelText(/carrier/i), { target: { value: 'UPS' } });
    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/recipient name/i), { target: { value: 'Jane Smith' } });

    fireEvent.click(screen.getByRole('button', { name: /log parcel/i }));

    await waitFor(() => {
      const btn = screen.queryByRole('button', { name: /logging/i });
      expect(btn).not.toBeNull();
      expect(btn).toBeDisabled();
    });

    // Cleanup
    resolvePost(baseParcel);
  });

  it('shows loading text during submission', async () => {
    let resolvePost!: (value: unknown) => void;
    mockedApi.post.mockReturnValue(new Promise(r => { resolvePost = r; }));

    renderForm();
    await waitFor(() => screen.getByLabelText(/tracking number/i));

    fireEvent.change(screen.getByLabelText(/tracking number/i), { target: { value: 'UPS12345678' } });
    fireEvent.change(screen.getByLabelText(/carrier/i), { target: { value: 'UPS' } });
    fireEvent.change(screen.getByLabelText(/unit number/i), { target: { value: '4B' } });
    fireEvent.change(screen.getByLabelText(/recipient name/i), { target: { value: 'Jane Smith' } });

    fireEvent.click(screen.getByRole('button', { name: /log parcel|submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/logging|submitting/i)).toBeInTheDocument();
    });

    // Cleanup
    resolvePost(baseParcel);
  });
});
