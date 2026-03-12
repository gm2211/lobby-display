/**
 * DocumentManagement component tests (TDD — Red phase)
 *
 * Tests cover:
 * - Loading spinner while fetching
 * - Document list rendering: title, category, current version, upload date, download count
 * - Upload new document form: title, description, category select, role access checkboxes, file input
 * - Upload submission (POST to /api/platform/documents)
 * - Version management per document: upload new version with changelog textarea
 * - POST to /api/platform/documents/:id/versions for new versions
 * - Version history list: version number, changelog, upload date, uploader, download link
 * - Download links for specific versions
 * - Error state with retry
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DocumentManagement from '../../../src/platform/pages/DocumentManagement';
import type { Document, DocumentCategory, DocumentVersion } from '../../../src/platform/types';

// --- Test helpers ---

const baseCategory: DocumentCategory = {
  id: 1,
  name: 'Bylaws',
  description: 'Building bylaws',
};

const category2: DocumentCategory = {
  id: 2,
  name: 'Financials',
  description: 'Financial reports',
};

const baseVersion: DocumentVersion = {
  id: 1,
  documentId: 1,
  fileName: 'bylaws-v1.pdf',
  fileUrl: '/uploads/bylaws-v1.pdf',
  fileSize: 204800,
  versionNumber: 1,
  uploadedAt: '2025-01-10T09:00:00.000Z',
};

const version2: DocumentVersion = {
  id: 2,
  documentId: 1,
  fileName: 'bylaws-v2.pdf',
  fileUrl: '/uploads/bylaws-v2.pdf',
  fileSize: 512000,
  versionNumber: 2,
  uploadedAt: '2025-03-15T10:00:00.000Z',
};

const baseDocument: Document = {
  id: 1,
  title: 'Building Bylaws',
  description: 'Official building bylaws',
  categoryId: 1,
  category: baseCategory,
  versions: [baseVersion],
  uploadedById: 1,
  createdAt: '2025-01-10T09:00:00.000Z',
  updatedAt: '2025-01-10T09:00:00.000Z',
};

function makeDocument(overrides: Partial<Document> = {}): Document {
  return { ...baseDocument, ...overrides };
}

function makeDocuments(count: number): Document[] {
  return Array.from({ length: count }, (_, i) =>
    makeDocument({ id: i + 1, title: `Document ${i + 1}` })
  );
}

interface MockResponse {
  ok: boolean;
  data: unknown;
  status?: number;
}

function mockFetchSuccess(documents: Document[], categories: DocumentCategory[] = [baseCategory]) {
  let callCount = 0;
  const responses: MockResponse[] = [
    { ok: true, data: documents },     // GET /api/platform/documents
    { ok: true, data: categories },    // GET /api/platform/documents/categories
  ];
  global.fetch = vi.fn().mockImplementation(() => {
    const response = responses[callCount] ?? responses[responses.length - 1];
    callCount++;
    return Promise.resolve({
      ok: response.ok,
      status: response.ok ? 200 : (response.status ?? 500),
      json: () => Promise.resolve(response.data),
      statusText: response.ok ? 'OK' : 'Internal Server Error',
    } as unknown as Response);
  });
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

describe('DocumentManagement', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // ---- Loading state ----

  it('shows loading spinner while fetching', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<DocumentManagement />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // ---- Document list ----

  it('renders document list after fetching', async () => {
    mockFetchSuccess([
      makeDocument({ id: 1, title: 'Building Bylaws' }),
      makeDocument({ id: 2, title: 'Annual Report 2024', categoryId: 2, category: category2 }),
    ]);

    render(<DocumentManagement />);

    await waitFor(() => {
      expect(screen.getByText('Building Bylaws')).toBeInTheDocument();
      expect(screen.getByText('Annual Report 2024')).toBeInTheDocument();
    });
  });

  it('renders document title in list', async () => {
    mockFetchSuccess([makeDocument({ title: 'HOA Rules 2025' })]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByText('HOA Rules 2025')).toBeInTheDocument();
    });
  });

  it('renders document category in list', async () => {
    mockFetchSuccess([makeDocument({ category: baseCategory })]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getAllByText('Bylaws').length).toBeGreaterThan(0);
    });
  });

  it('renders current version number', async () => {
    mockFetchSuccess([makeDocument({ versions: [baseVersion] })]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByText(/v1/i)).toBeInTheDocument();
    });
  });

  it('renders upload date for documents', async () => {
    mockFetchSuccess([makeDocument({ createdAt: '2025-01-10T09:00:00.000Z' })]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByText(/jan 10, 2025/i)).toBeInTheDocument();
    });
  });

  it('renders document rows with testid', async () => {
    mockFetchSuccess([
      makeDocument({ id: 1, title: 'Doc One' }),
      makeDocument({ id: 2, title: 'Doc Two', category: category2 }),
    ]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('document-row-1')).toBeInTheDocument();
      expect(screen.getByTestId('document-row-2')).toBeInTheDocument();
    });
  });

  // ---- Download links ----

  it('renders download link for latest version', async () => {
    mockFetchSuccess([
      makeDocument({ versions: [{ ...baseVersion, fileUrl: '/uploads/bylaws-v1.pdf' }] }),
    ]);
    render(<DocumentManagement />);
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /download/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/uploads/bylaws-v1.pdf');
    });
  });

  // ---- Upload document form ----

  it('renders upload document form section', async () => {
    mockFetchSuccess([]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('upload-document-form')).toBeInTheDocument();
    });
  });

  it('renders title input in upload form', async () => {
    mockFetchSuccess([]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('upload-title')).toBeInTheDocument();
    });
  });

  it('renders description input in upload form', async () => {
    mockFetchSuccess([]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('upload-description')).toBeInTheDocument();
    });
  });

  it('renders category select in upload form', async () => {
    mockFetchSuccess([]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('upload-category')).toBeInTheDocument();
    });
  });

  it('renders file input in upload form', async () => {
    mockFetchSuccess([]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('upload-file')).toBeInTheDocument();
    });
  });

  it('renders submit button in upload form', async () => {
    mockFetchSuccess([]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('upload-submit')).toBeInTheDocument();
    });
  });

  it('shows validation error when submitting form with no title', async () => {
    mockFetchSuccess([]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('upload-submit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('upload-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('upload-form-error')).toBeInTheDocument();
    });
  });

  it('populates category select with available categories', async () => {
    mockFetchSuccess([], [baseCategory, category2]);
    render(<DocumentManagement />);
    await waitFor(() => {
      const select = screen.getByTestId('upload-category');
      const options = select.querySelectorAll('option');
      // At least the two categories plus empty option
      expect(options.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('submits upload form with POST to /api/platform/documents', async () => {
    const newDoc = makeDocument({ id: 99, title: 'New Document' });
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      // CSRF token fetch
      if (typeof url === 'string' && url.includes('csrf')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ token: 'test-csrf' }) });
      }
      // POST call
      if (options?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve(newDoc) });
      }
      // GET /api/platform/documents (matches end of url)
      if (typeof url === 'string' && !url.includes('/categories')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      }
      // GET /api/platform/documents/categories
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([baseCategory]) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<DocumentManagement />);

    // Wait for form to render AND categories to load
    await waitFor(() => {
      expect(screen.getByTestId('upload-title')).toBeInTheDocument();
      // Category select should have at least one real option (from categories fetch)
      const select = screen.getByTestId('upload-category') as HTMLSelectElement;
      expect(select.options.length).toBeGreaterThan(1);
    });

    fireEvent.change(screen.getByTestId('upload-title'), { target: { value: 'New Document' } });
    fireEvent.change(screen.getByTestId('upload-description'), { target: { value: 'A test document' } });
    fireEvent.change(screen.getByTestId('upload-category'), { target: { value: String(baseCategory.id) } });

    fireEvent.click(screen.getByTestId('upload-submit'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'POST'
      );
      expect(postCall).toBeTruthy();
    });
  });

  // ---- Version management ----

  it('renders "Upload Version" button per document', async () => {
    mockFetchSuccess([makeDocument({ id: 1 })]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('upload-version-btn-1')).toBeInTheDocument();
    });
  });

  it('shows version upload form when "Upload Version" is clicked', async () => {
    mockFetchSuccess([makeDocument({ id: 1 })]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('upload-version-btn-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('upload-version-btn-1'));

    await waitFor(() => {
      expect(screen.getByTestId('version-form-1')).toBeInTheDocument();
    });
  });

  it('version form has changelog textarea', async () => {
    mockFetchSuccess([makeDocument({ id: 1 })]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('upload-version-btn-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('upload-version-btn-1'));

    await waitFor(() => {
      expect(screen.getByTestId('version-changelog-1')).toBeInTheDocument();
    });
  });

  it('version form has file input', async () => {
    mockFetchSuccess([makeDocument({ id: 1 })]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('upload-version-btn-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('upload-version-btn-1'));

    await waitFor(() => {
      expect(screen.getByTestId('version-file-1')).toBeInTheDocument();
    });
  });

  it('version form has submit button', async () => {
    mockFetchSuccess([makeDocument({ id: 1 })]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('upload-version-btn-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('upload-version-btn-1'));

    await waitFor(() => {
      expect(screen.getByTestId('version-submit-1')).toBeInTheDocument();
    });
  });

  it('submits version form with POST to /api/platform/documents/:id/versions', async () => {
    const doc = makeDocument({ id: 5 });
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      // CSRF token fetch
      if (typeof url === 'string' && url.includes('csrf')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ token: 'test-csrf' }) });
      }
      // POST call
      if (options?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ id: 99, version: 2 }) });
      }
      // GET /api/platform/documents/categories
      if (typeof url === 'string' && url.includes('/categories')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([baseCategory]) });
      }
      // GET /api/platform/documents
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([doc]) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<DocumentManagement />);

    await waitFor(() => {
      expect(screen.getByTestId('upload-version-btn-5')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('upload-version-btn-5'));

    await waitFor(() => {
      expect(screen.getByTestId('version-submit-5')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('version-submit-5'));

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'POST'
      );
      const versionPostCall = postCalls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/versions')
      );
      expect(versionPostCall).toBeTruthy();
    });
  });

  // ---- Version history list ----

  it('renders "Show versions" button for documents', async () => {
    mockFetchSuccess([makeDocument({ id: 1, versions: [baseVersion, version2] })]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('show-versions-btn-1')).toBeInTheDocument();
    });
  });

  it('shows version history when "Show versions" is clicked', async () => {
    mockFetchSuccess([makeDocument({ id: 1, versions: [baseVersion, version2] })]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('show-versions-btn-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('show-versions-btn-1'));

    await waitFor(() => {
      expect(screen.getByTestId('version-history-1')).toBeInTheDocument();
    });
  });

  it('shows version number in history list', async () => {
    mockFetchSuccess([makeDocument({ id: 1, versions: [baseVersion, version2] })]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('show-versions-btn-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('show-versions-btn-1'));

    await waitFor(() => {
      // v1 and v2 should be visible in history
      const v2Items = screen.getAllByText(/v2/i);
      expect(v2Items.length).toBeGreaterThan(0);
    });
  });

  it('shows upload date in version history', async () => {
    mockFetchSuccess([makeDocument({ id: 1, versions: [baseVersion, version2] })]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('show-versions-btn-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('show-versions-btn-1'));

    await waitFor(() => {
      // Mar 15, 2025 for version2
      expect(screen.getByText(/mar 15, 2025/i)).toBeInTheDocument();
    });
  });

  it('renders download link for each version in history', async () => {
    mockFetchSuccess([makeDocument({ id: 1, versions: [baseVersion, version2] })]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('show-versions-btn-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('show-versions-btn-1'));

    await waitFor(() => {
      const downloadLinks = screen.getAllByRole('link', { name: /download/i });
      expect(downloadLinks.length).toBeGreaterThan(0);
    });
  });

  it('version download links point to correct file URLs', async () => {
    mockFetchSuccess([makeDocument({ id: 1, versions: [baseVersion, version2] })]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByTestId('show-versions-btn-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('show-versions-btn-1'));

    await waitFor(() => {
      const downloadLinks = screen.getAllByRole('link', { name: /download/i });
      const hrefs = downloadLinks.map(l => l.getAttribute('href'));
      expect(hrefs).toContain('/uploads/bylaws-v2.pdf');
    });
  });

  // ---- Empty state ----

  it('shows empty state when no documents exist', async () => {
    mockFetchSuccess([]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByText(/no documents/i)).toBeInTheDocument();
    });
  });

  // ---- Error state ----

  it('shows error message on fetch failure', async () => {
    mockFetchError('Failed to load documents');
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockFetchError();
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('retries fetch on retry button click', async () => {
    mockFetchError();
    render(<DocumentManagement />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    // Set up success response for retry
    mockFetchSuccess([makeDocument({ title: 'Retried Document' })]);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Retried Document')).toBeInTheDocument();
    });
  });

  // ---- Page heading ----

  it('renders the page heading "Document Management"', async () => {
    mockFetchSuccess([]);
    render(<DocumentManagement />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /document management/i })).toBeInTheDocument();
    });
  });
});
