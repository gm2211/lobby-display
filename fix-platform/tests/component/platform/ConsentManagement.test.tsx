/**
 * ConsentManagement component tests.
 *
 * Tests cover:
 * - Loading state
 * - Consent form list rendering (title, status, required roles, completion rate)
 * - Create form modal/section (title, body, required roles, active toggle)
 * - Edit existing form
 * - Completion rate display (total required, total signed, percentage)
 * - Export button (CSV download)
 * - Archive/activate toggle
 * - Error state with retry
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConsentManagement from '../../../src/platform/pages/ConsentManagement';
import type { ConsentFormItem, ConsentSignature } from '../../../src/platform/types';
import { api } from '../../../src/utils/api';

// --- Helpers ---

function makeConsentForm(overrides: Partial<ConsentFormItem> = {}, index = 0): ConsentFormItem {
  return {
    id: `form-${index + 1}`,
    title: `Consent Form ${index + 1}`,
    body: `<p>Body content for form ${index + 1}</p>`,
    status: 'ACTIVE',
    requiredRoles: ['RESIDENT'],
    createdAt: '2025-07-01T10:00:00Z',
    updatedAt: '2025-07-01T10:00:00Z',
    _count: { signatures: 3 },
    totalRequired: 10,
    completionRate: 30,
    ...overrides,
  };
}

function makeConsentForms(count: number, overrides: Partial<ConsentFormItem> = {}): ConsentFormItem[] {
  return Array.from({ length: count }, (_, i) => makeConsentForm(overrides, i));
}

function makeSignature(overrides: Partial<ConsentSignature> = {}, index = 0): ConsentSignature {
  return {
    id: `sig-${index + 1}`,
    consentFormId: `form-1`,
    userId: `user-${index + 1}`,
    userName: `User ${index + 1}`,
    signedAt: '2025-07-15T10:00:00Z',
    ...overrides,
  };
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

function mockFetchSuccess(forms: ConsentFormItem[]) {
  mockFetchSequence([
    { ok: true, data: forms }, // GET /api/platform/consent/manage
  ]);
}

function mockFetchError() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: 'Internal Server Error' }),
    statusText: 'Internal Server Error',
  } as unknown as Response);
}

// --- Tests ---

describe('ConsentManagement', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Clear CSRF token cache between tests so mocks sequence correctly
    api.clearCsrf();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // --- Loading state ---

  it('shows loading spinner while fetching', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<ConsentManagement />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Error state ---

  it('shows error message when fetch fails', async () => {
    mockFetchError();

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows retry button when fetch fails', async () => {
    mockFetchError();

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('retries fetch when retry button is clicked', async () => {
    // First call fails, second succeeds
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Error' }),
          statusText: 'Internal Server Error',
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(makeConsentForms(1)),
        statusText: 'OK',
      });
    });

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Consent Form 1')).toBeInTheDocument();
    });
  });

  // --- Consent form list rendering ---

  it('renders page title', async () => {
    mockFetchSuccess([]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByText('Consent Management')).toBeInTheDocument();
    });
  });

  it('renders consent form titles', async () => {
    const forms = [
      makeConsentForm({ title: 'Pet Policy Agreement' }, 0),
      makeConsentForm({ title: 'Move-In Inspection' }, 1),
    ];
    mockFetchSuccess(forms);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByText('Pet Policy Agreement')).toBeInTheDocument();
      expect(screen.getByText('Move-In Inspection')).toBeInTheDocument();
    });
  });

  it('renders status badge for each form', async () => {
    const forms = [
      makeConsentForm({ status: 'ACTIVE' }, 0),
      makeConsentForm({ status: 'DRAFT' }, 1),
      makeConsentForm({ status: 'ARCHIVED' }, 2),
    ];
    mockFetchSuccess(forms);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-form-1')).toBeInTheDocument();
      expect(screen.getByTestId('status-badge-form-2')).toBeInTheDocument();
      expect(screen.getByTestId('status-badge-form-3')).toBeInTheDocument();
    });

    expect(screen.getByTestId('status-badge-form-1')).toHaveTextContent('Active');
    expect(screen.getByTestId('status-badge-form-2')).toHaveTextContent('Draft');
    expect(screen.getByTestId('status-badge-form-3')).toHaveTextContent('Archived');
  });

  it('renders required roles for each form', async () => {
    const forms = [
      makeConsentForm({ requiredRoles: ['RESIDENT', 'BOARD_MEMBER'] }, 0),
    ];
    mockFetchSuccess(forms);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByText(/RESIDENT/)).toBeInTheDocument();
      expect(screen.getByText(/BOARD_MEMBER/)).toBeInTheDocument();
    });
  });

  it('renders completion rate for each form', async () => {
    const forms = [
      makeConsentForm({ _count: { signatures: 5 }, totalRequired: 10, completionRate: 50 }, 0),
    ];
    mockFetchSuccess(forms);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('completion-rate-form-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('completion-rate-form-1')).toHaveTextContent('50%');
  });

  it('renders signature count (signed / total required)', async () => {
    const forms = [
      makeConsentForm({ _count: { signatures: 7 }, totalRequired: 20, completionRate: 35 }, 0),
    ];
    mockFetchSuccess(forms);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('completion-rate-form-1')).toBeInTheDocument();
    });

    const completionEl = screen.getByTestId('completion-rate-form-1');
    expect(completionEl.textContent).toMatch(/7/);
    expect(completionEl.textContent).toMatch(/20/);
  });

  it('shows empty state when no consent forms exist', async () => {
    mockFetchSuccess([]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByText(/no consent forms/i)).toBeInTheDocument();
    });
  });

  // --- Create form ---

  it('renders "Create New Form" button', async () => {
    mockFetchSuccess([]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('create-form-btn')).toBeInTheDocument();
    });
  });

  it('opens create form panel when create button is clicked', async () => {
    mockFetchSuccess([]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('create-form-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-form-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('consent-form-editor')).toBeInTheDocument();
    });
  });

  it('has title input in create form', async () => {
    mockFetchSuccess([]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('create-form-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-form-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('form-title-input')).toBeInTheDocument();
    });
  });

  it('has body textarea in create form', async () => {
    mockFetchSuccess([]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('create-form-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-form-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('form-body-input')).toBeInTheDocument();
    });
  });

  it('has required roles selection in create form', async () => {
    mockFetchSuccess([]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('create-form-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-form-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('form-roles-section')).toBeInTheDocument();
    });
  });

  it('has active toggle in create form', async () => {
    mockFetchSuccess([]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('create-form-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-form-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('form-active-toggle')).toBeInTheDocument();
    });
  });

  it('has save button in create form', async () => {
    mockFetchSuccess([]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('create-form-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-form-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('form-save-btn')).toBeInTheDocument();
    });
  });

  it('has cancel button in create form', async () => {
    mockFetchSuccess([]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('create-form-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-form-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('form-cancel-btn')).toBeInTheDocument();
    });
  });

  it('hides editor when cancel is clicked', async () => {
    mockFetchSuccess([]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('create-form-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-form-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('consent-form-editor')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('form-cancel-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('consent-form-editor')).toBeNull();
    });
  });

  it('shows validation error when saving empty form', async () => {
    mockFetchSuccess([]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('create-form-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-form-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('form-save-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('form-save-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('form-editor-error')).toBeInTheDocument();
    });
  });

  it('calls POST endpoint when creating new consent form', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      // CSRF token
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) })
      // POST create
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(makeConsentForm({ id: 'new-form', title: 'New Form' })) })
      // Refetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([makeConsentForm({ id: 'new-form', title: 'New Form' })]) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('create-form-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-form-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('form-title-input')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('form-title-input'), { target: { value: 'New Form' } });
    fireEvent.change(screen.getByTestId('form-body-input'), { target: { value: 'Form body content' } });

    fireEvent.click(screen.getByTestId('form-save-btn'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'POST'
      );
      expect(postCall).toBeTruthy();
    });
  });

  // --- Edit form ---

  it('renders edit button for each form', async () => {
    const forms = [makeConsentForm({}, 0)];
    mockFetchSuccess(forms);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-form-form-1')).toBeInTheDocument();
    });
  });

  it('opens edit form with pre-filled values when edit is clicked', async () => {
    const form = makeConsentForm({ title: 'Existing Form Title', body: '<p>Existing body</p>' }, 0);
    mockFetchSuccess([form]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-form-form-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-form-form-1'));

    await waitFor(() => {
      expect(screen.getByTestId('form-title-input')).toBeInTheDocument();
    });

    expect((screen.getByTestId('form-title-input') as HTMLInputElement).value).toBe('Existing Form Title');
  });

  it('calls PUT endpoint when editing consent form', async () => {
    const form = makeConsentForm({ title: 'Old Title' }, 0);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([form]) })
      // CSRF token
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) })
      // PUT update
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...form, title: 'New Title' }) })
      // Refetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ ...form, title: 'New Title' }]) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-form-form-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-form-form-1'));

    await waitFor(() => {
      expect(screen.getByTestId('form-title-input')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('form-title-input'), { target: { value: 'New Title' } });
    fireEvent.click(screen.getByTestId('form-save-btn'));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'PUT'
      );
      expect(putCall).toBeTruthy();
    });
  });

  // --- Archive / Activate toggle ---

  it('renders archive button for ACTIVE forms', async () => {
    const form = makeConsentForm({ status: 'ACTIVE' }, 0);
    mockFetchSuccess([form]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('archive-btn-form-1')).toBeInTheDocument();
    });
  });

  it('renders activate button for ARCHIVED forms', async () => {
    const form = makeConsentForm({ status: 'ARCHIVED' }, 0);
    mockFetchSuccess([form]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('activate-btn-form-1')).toBeInTheDocument();
    });
  });

  it('calls PUT with ARCHIVED status when archive button is clicked', async () => {
    const form = makeConsentForm({ status: 'ACTIVE' }, 0);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([form]) })
      // CSRF token
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) })
      // PUT archive
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...form, status: 'ARCHIVED' }) })
      // Refetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ ...form, status: 'ARCHIVED' }]) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('archive-btn-form-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('archive-btn-form-1'));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'PUT'
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body.status).toBe('ARCHIVED');
    });
  });

  it('calls PUT with ACTIVE status when activate button is clicked', async () => {
    const form = makeConsentForm({ status: 'ARCHIVED' }, 0);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([form]) })
      // CSRF token
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'test-csrf' }) })
      // PUT activate
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...form, status: 'ACTIVE' }) })
      // Refetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ ...form, status: 'ACTIVE' }]) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('activate-btn-form-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('activate-btn-form-1'));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'PUT'
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body.status).toBe('ACTIVE');
    });
  });

  // --- Export signatures ---

  it('renders export CSV button for each form', async () => {
    const forms = [makeConsentForm({}, 0)];
    mockFetchSuccess(forms);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('export-csv-form-1')).toBeInTheDocument();
    });
  });

  it('fetches signatures and triggers download when export is clicked', async () => {
    const form = makeConsentForm({}, 0);
    const signatures = [
      makeSignature({ consentFormId: 'form-1', userName: 'Jane Doe' }, 0),
      makeSignature({ consentFormId: 'form-1', userName: 'John Smith' }, 1),
    ];

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([form]) })
      // GET signatures for export
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(signatures) });
    global.fetch = fetchMock as unknown as typeof fetch;

    // Mock URL.createObjectURL
    const createObjectURL = vi.fn().mockReturnValue('blob:url');
    const revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    // Render first so React internals don't get caught by the spy
    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('export-csv-form-1')).toBeInTheDocument();
    });

    // Now set up DOM mocks after render
    const clickMock = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: clickMock, style: {} } as unknown as HTMLAnchorElement;
      }
      return originalCreateElement(tag);
    });
    const appendChildMock = vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.body);
    const removeChildMock = vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.body);

    fireEvent.click(screen.getByTestId('export-csv-form-1'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    createElementSpy.mockRestore();
    appendChildMock.mockRestore();
    removeChildMock.mockRestore();
  });

  // --- Completion rate details ---

  it('shows 0 completion rate when no signatures', async () => {
    const form = makeConsentForm({ _count: { signatures: 0 }, totalRequired: 10, completionRate: 0 }, 0);
    mockFetchSuccess([form]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('completion-rate-form-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('completion-rate-form-1')).toHaveTextContent('0%');
  });

  it('shows 100% completion rate when all required have signed', async () => {
    const form = makeConsentForm({ _count: { signatures: 15 }, totalRequired: 15, completionRate: 100 }, 0);
    mockFetchSuccess([form]);

    render(<ConsentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('completion-rate-form-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('completion-rate-form-1')).toHaveTextContent('100%');
  });
});
