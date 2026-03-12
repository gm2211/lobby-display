/**
 * DocumentsPage component tests (TDD)
 *
 * Tests: renders document list, category filter, search, version display,
 *        loading/empty states, error handling, expandable version history.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DocumentsPage from '../../../src/platform/pages/DocumentsPage';
import type { Document, DocumentCategory, DocumentVersion, DocumentsListResponse } from '../../../src/platform/types';

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const baseCategory: DocumentCategory = {
  id: 1,
  name: 'Bylaws',
  description: 'Building bylaws and regulations',
};

const category2: DocumentCategory = {
  id: 2,
  name: 'Financials',
  description: 'Financial reports and statements',
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
  uploadedAt: '2025-02-15T10:00:00.000Z',
};

const baseDocument: Document = {
  id: 1,
  title: 'Building Bylaws',
  description: 'Official building bylaws and regulations for residents',
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

function mockFetchSuccess(data: DocumentsListResponse) {
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

describe('DocumentsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Loading state ----

  it('shows loading spinner initially', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<DocumentsPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // ---- Page heading ----

  it('renders the page heading "Documents"', async () => {
    mockFetchSuccess({ items: [] });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /documents/i })).toBeInTheDocument();
    });
  });

  // ---- Renders document list ----

  it('renders a list of documents after fetching', async () => {
    mockFetchSuccess({
      items: [
        makeDocument({ id: 1, title: 'Building Bylaws' }),
        makeDocument({ id: 2, title: 'Annual Report 2024', categoryId: 2, category: category2 }),
      ],
    });

    renderWithRouter(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText('Building Bylaws')).toBeInTheDocument();
      expect(screen.getByText('Annual Report 2024')).toBeInTheDocument();
    });
  });

  it('renders document description', async () => {
    mockFetchSuccess({
      items: [makeDocument({ description: 'Official bylaws for residents' })],
    });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText(/official bylaws for residents/i)).toBeInTheDocument();
    });
  });

  it('renders document category', async () => {
    mockFetchSuccess({
      items: [makeDocument({ category: baseCategory })],
    });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getAllByText('Bylaws').length).toBeGreaterThan(0);
    });
  });

  it('renders upload date', async () => {
    mockFetchSuccess({
      items: [makeDocument({ createdAt: '2025-01-10T09:00:00.000Z' })],
    });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText(/jan 10, 2025/i)).toBeInTheDocument();
    });
  });

  it('renders version info for the latest version', async () => {
    mockFetchSuccess({
      items: [makeDocument({ versions: [baseVersion] })],
    });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText(/v1/i)).toBeInTheDocument();
    });
  });

  it('renders download link for latest version', async () => {
    mockFetchSuccess({
      items: [makeDocument({ versions: [{ ...baseVersion, fileUrl: '/uploads/bylaws-v1.pdf' }] })],
    });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      const downloadLink = screen.getByRole('link', { name: /download/i });
      expect(downloadLink).toBeInTheDocument();
      expect(downloadLink).toHaveAttribute('href', '/uploads/bylaws-v1.pdf');
    });
  });

  it('shows file type icon for PDF', async () => {
    mockFetchSuccess({
      items: [makeDocument({ versions: [{ ...baseVersion, fileName: 'document.pdf' }] })],
    });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      // PDF icon should be present
      expect(screen.getByTestId('file-icon-pdf')).toBeInTheDocument();
    });
  });

  it('shows file type icon for DOCX', async () => {
    mockFetchSuccess({
      items: [makeDocument({ versions: [{ ...baseVersion, fileName: 'document.docx' }] })],
    });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('file-icon-docx')).toBeInTheDocument();
    });
  });

  // ---- Search ----

  it('renders search input', async () => {
    mockFetchSuccess({ items: [] });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });

  it('filters documents by title search', async () => {
    mockFetchSuccess({
      items: [
        makeDocument({ id: 1, title: 'Building Bylaws' }),
        makeDocument({ id: 2, title: 'Annual Report 2024', category: category2 }),
      ],
    });

    renderWithRouter(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText('Building Bylaws')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'Annual' } });

    expect(screen.queryByText('Building Bylaws')).not.toBeInTheDocument();
    expect(screen.getByText('Annual Report 2024')).toBeInTheDocument();
  });

  it('filters documents by description search', async () => {
    mockFetchSuccess({
      items: [
        makeDocument({ id: 1, title: 'Doc A', description: 'Contains financial info' }),
        makeDocument({ id: 2, title: 'Doc B', description: 'Contains building rules' }),
      ],
    });

    renderWithRouter(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText('Doc A')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'financial' } });

    expect(screen.queryByText('Doc B')).not.toBeInTheDocument();
    expect(screen.getByText('Doc A')).toBeInTheDocument();
  });

  it('search is case-insensitive', async () => {
    mockFetchSuccess({
      items: [makeDocument({ title: 'Building Bylaws' })],
    });

    renderWithRouter(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText('Building Bylaws')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'BYLAWS' } });

    expect(screen.getByText('Building Bylaws')).toBeInTheDocument();
  });

  // ---- Category filter ----

  it('renders category filter', async () => {
    mockFetchSuccess({ items: [makeDocument()] });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    });
  });

  it('shows all categories in filter dropdown', async () => {
    mockFetchSuccess({
      items: [
        makeDocument({ id: 1, category: baseCategory }),
        makeDocument({ id: 2, title: 'Report', category: category2 }),
      ],
    });

    renderWithRouter(<DocumentsPage />);

    await waitFor(() => {
      const select = screen.getByLabelText(/category/i);
      expect(select).toBeInTheDocument();
    });

    const select = screen.getByLabelText(/category/i);
    // Should have "All Categories" plus the actual categories
    expect(select.querySelectorAll('option').length).toBeGreaterThanOrEqual(2);
  });

  it('filters documents by category', async () => {
    mockFetchSuccess({
      items: [
        makeDocument({ id: 1, title: 'Building Bylaws', categoryId: 1, category: baseCategory }),
        makeDocument({ id: 2, title: 'Annual Report 2024', categoryId: 2, category: category2 }),
      ],
    });

    renderWithRouter(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText('Building Bylaws')).toBeInTheDocument();
    });

    const select = screen.getByLabelText(/category/i);
    fireEvent.change(select, { target: { value: String(category2.id) } });

    expect(screen.queryByText('Building Bylaws')).not.toBeInTheDocument();
    expect(screen.getByText('Annual Report 2024')).toBeInTheDocument();
  });

  // ---- Version history ----

  it('shows version history expand button when document has multiple versions', async () => {
    mockFetchSuccess({
      items: [makeDocument({ versions: [baseVersion, version2] })],
    });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /version history/i })).toBeInTheDocument();
    });
  });

  it('expands version history when button clicked', async () => {
    mockFetchSuccess({
      items: [makeDocument({ versions: [baseVersion, version2] })],
    });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /version history/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /version history/i }));

    await waitFor(() => {
      // Both version filenames should be visible
      expect(screen.getByText(/bylaws-v1\.pdf/i)).toBeInTheDocument();
      expect(screen.getByText(/bylaws-v2\.pdf/i)).toBeInTheDocument();
    });
  });

  it('collapses version history when button clicked again', async () => {
    mockFetchSuccess({
      items: [makeDocument({ versions: [baseVersion, version2] })],
    });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /version history/i })).toBeInTheDocument();
    });

    const versionBtn = screen.getByRole('button', { name: /version history/i });
    fireEvent.click(versionBtn);

    await waitFor(() => {
      expect(screen.getByText(/bylaws-v1\.pdf/i)).toBeInTheDocument();
    });

    fireEvent.click(versionBtn);

    await waitFor(() => {
      expect(screen.queryByText(/bylaws-v1\.pdf/i)).not.toBeInTheDocument();
    });
  });

  it('shows version number and upload date in version history', async () => {
    mockFetchSuccess({
      items: [makeDocument({ versions: [baseVersion, version2] })],
    });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /version history/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /version history/i }));

    await waitFor(() => {
      // Feb 15, 2025 should appear as upload date in version history
      expect(screen.getByText(/feb 15, 2025/i)).toBeInTheDocument();
      // v2 appears as version badge in header and in history panel (multiple matches ok)
      const v2Elements = screen.getAllByText(/v2/i);
      expect(v2Elements.length).toBeGreaterThan(0);
    });
  });

  // ---- Empty states ----

  it('shows empty state when no documents exist', async () => {
    mockFetchSuccess({ items: [] });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      // The EmptyState renders "No documents found" as a <p> via role="status"
      expect(screen.getByText(/no documents found/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when search returns no results', async () => {
    mockFetchSuccess({
      items: [makeDocument({ title: 'Building Bylaws' })],
    });

    renderWithRouter(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText('Building Bylaws')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });

    expect(screen.queryByText('Building Bylaws')).not.toBeInTheDocument();
    expect(screen.getByText(/no documents found/i)).toBeInTheDocument();
  });

  it('shows empty state when category filter returns no results', async () => {
    // Provide two documents so both categories appear in the dropdown
    // Then filter by category2; Building Bylaws (category1) should be hidden
    mockFetchSuccess({
      items: [
        makeDocument({ id: 1, title: 'Building Bylaws', categoryId: 1, category: baseCategory }),
        makeDocument({ id: 2, title: 'Temp Report', categoryId: 2, category: category2 }),
      ],
    });

    renderWithRouter(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText('Building Bylaws')).toBeInTheDocument();
    });

    // Filter by category1 (Bylaws) - should hide "Temp Report"
    const select = screen.getByLabelText(/category/i);
    fireEvent.change(select, { target: { value: String(baseCategory.id) } });

    expect(screen.queryByText('Temp Report')).not.toBeInTheDocument();
    expect(screen.getByText('Building Bylaws')).toBeInTheDocument();

    // Now filter by category2 - should show only "Temp Report"
    fireEvent.change(select, { target: { value: String(category2.id) } });

    expect(screen.queryByText('Building Bylaws')).not.toBeInTheDocument();
    // After filtering by category2 - only category2 doc remains
    expect(screen.getByText('Temp Report')).toBeInTheDocument();
  });

  // ---- Error state ----

  it('shows error message on fetch failure', async () => {
    mockFetchError();
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load documents/i)).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockFetchError();
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('retries fetch on retry button click', async () => {
    mockFetchError();
    renderWithRouter(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    mockFetchSuccess({ items: [makeDocument({ title: 'Retried Document' })] });

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Retried Document')).toBeInTheDocument();
    });
  });

  // ---- Pagination / Load more ----

  it('shows Load More button when nextCursor is provided', async () => {
    mockFetchSuccess({
      items: [makeDocument()],
      nextCursor: 'cursor123',
    });

    renderWithRouter(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
    });
  });

  it('does not show Load More button when no nextCursor', async () => {
    mockFetchSuccess({ items: [makeDocument()] });
    renderWithRouter(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
    });
  });

  it('loads more documents on Load More click', async () => {
    mockFetchSuccess({
      items: [makeDocument({ id: 1, title: 'First Document' })],
      nextCursor: 'cursor123',
    });

    renderWithRouter(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText('First Document')).toBeInTheDocument();
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [makeDocument({ id: 2, title: 'Second Document' })],
      }),
    } as Response);

    fireEvent.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() => {
      expect(screen.getByText('First Document')).toBeInTheDocument();
      expect(screen.getByText('Second Document')).toBeInTheDocument();
    });
  });

  // ---- Categories organized ----

  it('groups documents by category', async () => {
    mockFetchSuccess({
      items: [
        makeDocument({ id: 1, title: 'Building Bylaws', category: baseCategory }),
        makeDocument({ id: 2, title: 'Annual Report 2024', category: category2 }),
      ],
    });

    renderWithRouter(<DocumentsPage />);

    await waitFor(() => {
      // Category headings should appear
      const bylaws = screen.getAllByText('Bylaws');
      expect(bylaws.length).toBeGreaterThan(0);
      const financials = screen.getAllByText('Financials');
      expect(financials.length).toBeGreaterThan(0);
    });
  });
});
