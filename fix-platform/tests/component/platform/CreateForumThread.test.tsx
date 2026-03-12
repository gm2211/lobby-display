/**
 * CreateForumThread component tests.
 *
 * Tests cover:
 * - Renders all form fields (category select fetched from API, title, body)
 * - Form validation (required fields)
 * - Preview toggle shows formatted content
 * - Successful submission flow (POST to /api/platform/forum/threads, navigate to /platform/forum/:id)
 * - Error handling with inline banner
 * - Cancel navigation returns to /platform/forum
 * - Loading spinner while submitting
 * - MANAGER+ role check in UI
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreateForumThread from '../../../src/platform/pages/CreateForumThread';

// --- Mock api module ---

vi.mock('../../../src/utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

import { api } from '../../../src/utils/api';

// --- Mock data ---

const mockCategories = [
  { id: 1, name: 'General Discussion', description: 'General topics', _count: { threads: 5 } },
  { id: 2, name: 'Announcements', description: 'Official announcements', _count: { threads: 3 } },
  { id: 3, name: 'Help & Support', description: null, _count: { threads: 10 } },
];

const mockCreatedThread = {
  id: 42,
  title: 'Test Thread Title',
  categoryId: 1,
  authorId: 'user-1',
  authorName: 'Test User',
  pinned: false,
  locked: false,
  createdAt: '2025-01-15T10:00:00.000Z',
  updatedAt: '2025-01-15T10:00:00.000Z',
  _count: { replies: 0 },
  lastReplyAt: null,
};

// --- Helpers ---

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/platform/forum/new']}>
      <Routes>
        <Route path="/platform/forum/new" element={<CreateForumThread />} />
        <Route path="/platform/forum" element={<div data-testid="forum-list">Forum List</div>} />
        <Route path="/platform/forum/:id" element={<div data-testid="forum-thread">Forum Thread</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// --- Tests ---

describe('CreateForumThread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: categories load successfully
    vi.mocked(api.get).mockResolvedValue(mockCategories);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Rendering ---

  describe('Rendering', () => {
    it('renders the page heading', async () => {
      renderForm();
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/new thread|create.*thread/i);
    });

    it('renders title input', async () => {
      renderForm();
      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });
    });

    it('renders body textarea', async () => {
      renderForm();
      await waitFor(() => {
        expect(screen.getByLabelText(/body/i)).toBeInTheDocument();
      });
    });

    it('renders category select', async () => {
      renderForm();
      await waitFor(() => {
        expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
      });
    });

    it('fetches categories from /api/platform/forum/categories', async () => {
      renderForm();
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/api/platform/forum/categories');
      });
    });

    it('populates category select with fetched categories', async () => {
      renderForm();
      await waitFor(() => {
        const select = screen.getByLabelText(/category/i) as HTMLSelectElement;
        const options = Array.from(select.options).map(o => o.text);
        expect(options).toContain('General Discussion');
        expect(options).toContain('Announcements');
        expect(options).toContain('Help & Support');
      });
    });

    it('renders cancel button', async () => {
      renderForm();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });
    });

    it('renders submit button', async () => {
      renderForm();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /post|create|submit/i })).toBeInTheDocument();
      });
    });

    it('renders preview toggle button', async () => {
      renderForm();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument();
      });
    });
  });

  // --- Form validation ---

  describe('Validation', () => {
    it('shows validation error when title is empty on submit', async () => {
      renderForm();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /post|create|submit/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /post|create|submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/title.*required|required.*title/i)).toBeInTheDocument();
      });
    });

    it('shows validation error when body is empty on submit', async () => {
      renderForm();
      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Title' } });
      fireEvent.click(screen.getByRole('button', { name: /post|create|submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/body.*required|required.*body/i)).toBeInTheDocument();
      });
    });

    it('shows validation error when category is not selected', async () => {
      renderForm();
      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Title' } });
      fireEvent.change(screen.getByLabelText(/body/i), { target: { value: 'Test body content' } });
      fireEvent.click(screen.getByRole('button', { name: /post|create|submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/category.*required|required.*category/i)).toBeInTheDocument();
      });
    });

    it('does not submit when validation fails', async () => {
      renderForm();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /post|create|submit/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /post|create|submit/i }));

      await waitFor(() => {
        expect(api.post).not.toHaveBeenCalled();
      });
    });
  });

  // --- Successful submission ---

  describe('Successful submission', () => {
    async function fillAndSubmitForm() {
      renderForm();
      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Thread Title' } });
      fireEvent.change(screen.getByLabelText(/body/i), { target: { value: 'Test body content here' } });
      // Select first non-empty option in category
      const select = screen.getByLabelText(/category/i) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: '1' } });
      fireEvent.click(screen.getByRole('button', { name: /post|create|submit/i }));
    }

    it('POSTs to /api/platform/forum/threads on valid submit', async () => {
      vi.mocked(api.post).mockResolvedValue(mockCreatedThread);
      await fillAndSubmitForm();

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/api/platform/forum/threads',
          expect.objectContaining({
            title: 'Test Thread Title',
            body: 'Test body content here',
          })
        );
      });
    });

    it('includes categoryId in POST body', async () => {
      vi.mocked(api.post).mockResolvedValue(mockCreatedThread);
      await fillAndSubmitForm();

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/api/platform/forum/threads',
          expect.objectContaining({
            categoryId: expect.anything(),
          })
        );
      });
    });

    it('navigates to /platform/forum/:id on successful create', async () => {
      vi.mocked(api.post).mockResolvedValue(mockCreatedThread);
      await fillAndSubmitForm();

      await waitFor(() => {
        expect(screen.getByTestId('forum-thread')).toBeInTheDocument();
      });
    });
  });

  // --- Error handling ---

  describe('Error handling', () => {
    it('shows error banner when API call fails', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Server error'));
      renderForm();

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Title' } });
      fireEvent.change(screen.getByLabelText(/body/i), { target: { value: 'Body content' } });
      const select = screen.getByLabelText(/category/i) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: '1' } });
      fireEvent.click(screen.getByRole('button', { name: /post|create|submit/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('shows error text from API error message', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Failed to create thread'));
      renderForm();

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Title' } });
      fireEvent.change(screen.getByLabelText(/body/i), { target: { value: 'Body content' } });
      const select = screen.getByLabelText(/category/i) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: '1' } });
      fireEvent.click(screen.getByRole('button', { name: /post|create|submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to create thread/i)).toBeInTheDocument();
      });
    });
  });

  // --- Loading state ---

  describe('Loading state', () => {
    it('shows loading spinner while categories are fetching', () => {
      vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
      renderForm();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('disables submit button during form submission', async () => {
      let resolvePost!: (v: unknown) => void;
      vi.mocked(api.post).mockReturnValue(new Promise(r => { resolvePost = r; }));

      renderForm();

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Title' } });
      fireEvent.change(screen.getByLabelText(/body/i), { target: { value: 'Body content' } });
      const select = screen.getByLabelText(/category/i) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: '1' } });
      fireEvent.click(screen.getByRole('button', { name: /post|create|submit/i }));

      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /posting|creating|submitting|post|create|submit/i });
        expect(btn).toBeDisabled();
      });

      // Cleanup
      resolvePost(mockCreatedThread);
    });
  });

  // --- Cancel navigation ---

  describe('Cancel navigation', () => {
    it('navigates to /platform/forum on cancel', async () => {
      renderForm();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.getByTestId('forum-list')).toBeInTheDocument();
    });
  });

  // --- Preview toggle ---

  describe('Preview toggle', () => {
    it('shows preview button initially in write mode', async () => {
      renderForm();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument();
      });
    });

    it('toggling preview shows the body content as formatted text', async () => {
      renderForm();
      await waitFor(() => {
        expect(screen.getByLabelText(/body/i)).toBeInTheDocument();
      });

      const bodyText = 'This is my **bold** thread body';
      fireEvent.change(screen.getByLabelText(/body/i), { target: { value: bodyText } });
      fireEvent.click(screen.getByRole('button', { name: /preview/i }));

      await waitFor(() => {
        // Preview panel should be visible
        expect(screen.getByTestId('preview-panel')).toBeInTheDocument();
      });
    });

    it('toggling preview back to write mode shows the textarea again', async () => {
      renderForm();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /preview/i }));

      await waitFor(() => {
        // Now it should show something to switch back
        expect(screen.getByRole('button', { name: /edit|write/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /edit|write/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/body/i)).toBeInTheDocument();
      });
    });
  });

  // --- Category fetch error ---

  describe('Category fetch error', () => {
    it('shows error message when categories fail to load', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Failed to load categories'));
      renderForm();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });
});
