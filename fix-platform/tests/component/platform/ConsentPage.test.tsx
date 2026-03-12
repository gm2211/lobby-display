/**
 * ConsentPage component tests
 *
 * Tests: renders pending/signed sections, shows loading/error/empty states,
 *        signing action with optimistic updates, success/error feedback.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConsentPage from '../../../src/platform/pages/ConsentPage';

// Helper to render with router context
function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// ---- Mock data ----

const baseConsentForm = {
  id: 'form-uuid-1',
  title: 'Resident Agreement',
  body: '<p>I agree to the terms of the building.</p>',
  version: '1.0',
  requiredForRoles: ['RESIDENT'],
  active: true,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  _count: { signatures: 0 },
};

const baseSignature = {
  id: 'sig-uuid-1',
  formId: 'form-uuid-1',
  userId: 42,
  signedAt: '2025-03-15T14:30:00.000Z',
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
  form: {
    id: 'form-uuid-1',
    title: 'Resident Agreement',
    version: '1.0',
    active: true,
  },
};

function makeFetchImpl(
  forms: typeof baseConsentForm[],
  signatures: typeof baseSignature[]
) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('/my-signatures')) {
      return Promise.resolve({
        ok: true,
        json: async () => signatures,
      } as Response);
    }
    if (url.includes('/api/platform/consent') && url.includes('/sign')) {
      return Promise.resolve({
        ok: true,
        status: 201,
        json: async () => ({ ...baseSignature }),
      } as Response);
    }
    // GET /api/platform/consent?active=true
    return Promise.resolve({
      ok: true,
      json: async () => forms,
    } as Response);
  });
}

describe('ConsentPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Loading state ----

  it('shows loading spinner while fetching', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<ConsentPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // ---- Error state ----

  it('shows error message when forms fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server Error' }),
    } as Response);

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load consent forms/i)).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server Error' }),
    } as Response);

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  // ---- Empty state ----

  it('shows empty state when there are no consent forms', async () => {
    vi.mocked(fetch).mockImplementation(makeFetchImpl([], []));

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      // getAllByText because EmptyState renders both a headline and a description
      const matches = screen.getAllByText(/no consent forms/i);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---- Pending forms section ----

  it('shows pending forms section heading', async () => {
    vi.mocked(fetch).mockImplementation(
      makeFetchImpl([{ ...baseConsentForm, id: 'form-1' }], [])
    );

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByText(/pending/i)).toBeInTheDocument();
    });
  });

  it('renders pending form title', async () => {
    vi.mocked(fetch).mockImplementation(
      makeFetchImpl([{ ...baseConsentForm, title: 'Building Rules Consent' }], [])
    );

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByText('Building Rules Consent')).toBeInTheDocument();
    });
  });

  it('renders pending form version', async () => {
    vi.mocked(fetch).mockImplementation(
      makeFetchImpl([{ ...baseConsentForm, version: '2.1' }], [])
    );

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByText(/2\.1/)).toBeInTheDocument();
    });
  });

  it('renders pending form body as HTML', async () => {
    vi.mocked(fetch).mockImplementation(
      makeFetchImpl(
        [{ ...baseConsentForm, body: '<p>Please read these <strong>important</strong> terms.</p>' }],
        []
      )
    );

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByText(/please read these/i)).toBeInTheDocument();
      expect(screen.getByText('important')).toBeInTheDocument();
    });
  });

  it('shows Sign button for pending forms', async () => {
    vi.mocked(fetch).mockImplementation(
      makeFetchImpl([{ ...baseConsentForm }], [])
    );

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign/i })).toBeInTheDocument();
    });
  });

  // ---- Signed forms section ----

  it('shows signed forms section heading when there are signed forms', async () => {
    vi.mocked(fetch).mockImplementation(
      makeFetchImpl([], [{ ...baseSignature }])
    );

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      // Section heading is an h2 with text "Signed"
      expect(screen.getByRole('heading', { name: /^signed$/i, level: 2 })).toBeInTheDocument();
    });
  });

  it('renders signed form title', async () => {
    vi.mocked(fetch).mockImplementation(
      makeFetchImpl([], [{ ...baseSignature, form: { ...baseSignature.form, title: 'Privacy Policy' } }])
    );

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    });
  });

  it('renders signed form version', async () => {
    vi.mocked(fetch).mockImplementation(
      makeFetchImpl([], [{ ...baseSignature, form: { ...baseSignature.form, version: '3.0' } }])
    );

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByText(/3\.0/)).toBeInTheDocument();
    });
  });

  it('renders signed date for signed forms', async () => {
    vi.mocked(fetch).mockImplementation(
      makeFetchImpl([], [{ ...baseSignature, signedAt: '2025-03-15T14:30:00.000Z' }])
    );

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      // Should render a formatted date
      expect(screen.getByText(/mar 15, 2025/i)).toBeInTheDocument();
    });
  });

  it('does not show Sign button for already-signed forms', async () => {
    // form is in forms list AND has a signature -> should appear in Signed, not Pending
    const form = { ...baseConsentForm, id: 'form-uuid-1' };
    const sig = { ...baseSignature, formId: 'form-uuid-1' };

    vi.mocked(fetch).mockImplementation(makeFetchImpl([form], [sig]));

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      // Signed section should be visible
      expect(screen.getByText('Resident Agreement')).toBeInTheDocument();
    });

    // Sign button should NOT be present
    expect(screen.queryByRole('button', { name: /^sign$/i })).not.toBeInTheDocument();
  });

  // ---- Signing action ----

  it('calls sign API when Sign button is clicked', async () => {
    const fetchMock = makeFetchImpl([{ ...baseConsentForm, id: 'form-uuid-1' }], []);
    vi.mocked(fetch).mockImplementation(fetchMock);

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /sign/i }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls;
      const signCall = calls.find(
        ([url]: [string]) => url.includes('/sign')
      );
      expect(signCall).toBeTruthy();
    });
  });

  it('shows success feedback after signing', async () => {
    const fetchMock = makeFetchImpl([{ ...baseConsentForm, id: 'form-uuid-1' }], []);
    vi.mocked(fetch).mockImplementation(fetchMock);

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /sign/i }));

    await waitFor(() => {
      // Success feedback appears either inline or as a page-level alert
      const alerts = screen.getAllByRole('alert');
      const successAlert = alerts.find((el) => /signed successfully/i.test(el.textContent ?? ''));
      expect(successAlert).toBeTruthy();
    });
  });

  it('moves form from pending to signed section after signing (optimistic update)', async () => {
    const form = { ...baseConsentForm, id: 'form-uuid-1', title: 'Terms of Service' };
    const fetchMock = makeFetchImpl([form], []);
    vi.mocked(fetch).mockImplementation(fetchMock);

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /sign/i }));

    await waitFor(() => {
      // After signing, Sign button should be gone
      expect(screen.queryByRole('button', { name: /^sign$/i })).not.toBeInTheDocument();
    });
  });

  it('shows error feedback when signing fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/my-signatures')) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }
      if (url.includes('/sign')) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ error: 'Failed to sign' }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => [{ ...baseConsentForm }],
      } as Response);
    });

    vi.mocked(fetch).mockImplementation(fetchMock);

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /sign/i }));

    await waitFor(() => {
      // Error feedback appears as an alert
      const alerts = screen.getAllByRole('alert');
      const errAlert = alerts.find((el) => /failed to sign/i.test(el.textContent ?? ''));
      expect(errAlert).toBeTruthy();
    });
  });

  it('disables Sign button while signing is in progress', async () => {
    let resolveSign: (value: Response) => void;
    const signPromise = new Promise<Response>((resolve) => {
      resolveSign = resolve;
    });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/my-signatures')) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }
      if (url.includes('/sign')) {
        return signPromise;
      }
      return Promise.resolve({
        ok: true,
        json: async () => [{ ...baseConsentForm }],
      } as Response);
    });

    vi.mocked(fetch).mockImplementation(fetchMock);

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /sign/i }));

    // Button should be disabled immediately after click
    await waitFor(() => {
      const btn = screen.queryByRole('button', { name: /signing/i })
        || screen.queryByRole('button', { name: /sign/i });
      expect(btn).toBeDisabled();
    });

    // Resolve the sign promise to clean up
    resolveSign!({
      ok: true,
      status: 201,
      json: async () => ({ ...baseSignature }),
    } as Response);
  });

  // ---- Grouping logic ----

  it('separates pending and signed forms correctly', async () => {
    const pendingForm = { ...baseConsentForm, id: 'pending-form', title: 'Pending Form' };
    const signedForm = { ...baseConsentForm, id: 'signed-form', title: 'Signed Form' };
    const sig = {
      ...baseSignature,
      formId: 'signed-form',
      form: { ...baseSignature.form, id: 'signed-form', title: 'Signed Form' },
    };

    vi.mocked(fetch).mockImplementation(makeFetchImpl([pendingForm, signedForm], [sig]));

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByText('Pending Form')).toBeInTheDocument();
      expect(screen.getByText('Signed Form')).toBeInTheDocument();
    });

    // Sign button should only appear for pending form
    expect(screen.getAllByRole('button', { name: /sign/i })).toHaveLength(1);
  });

  // ---- Page title ----

  it('renders a page title', async () => {
    vi.mocked(fetch).mockImplementation(makeFetchImpl([], []));

    renderWithRouter(<ConsentPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
  });
});
