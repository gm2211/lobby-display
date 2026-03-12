/**
 * AnnouncementForm component tests.
 *
 * Tests cover:
 * - Renders all form fields (title, body, category, priority, pinned, active)
 * - Create mode: shows correct title, POSTs to /api/platform/announcements
 * - Edit mode: fetches announcement and pre-populates form, PUTs to /api/platform/announcements/:id
 * - Form validation - required fields show error messages
 * - Success state navigates to /platform/announcements/:id
 * - Error handling with inline messages
 * - Cancel navigates back to announcements list
 * - Loading spinner while fetching (edit mode)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AnnouncementForm from '../../../src/platform/pages/AnnouncementForm';

// --- Mock api module ---

vi.mock('../../../src/utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

import { api } from '../../../src/utils/api';

// --- Helpers ---

function renderCreateForm() {
  return render(
    <MemoryRouter initialEntries={['/platform/announcements/new']}>
      <Routes>
        <Route path="/platform/announcements/new" element={<AnnouncementForm />} />
        <Route path="/platform/announcements" element={<div data-testid="announcements-list">Announcements List</div>} />
        <Route path="/platform/announcements/:id" element={<div data-testid="announcement-detail">Announcement Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderEditForm(id = '42') {
  return render(
    <MemoryRouter initialEntries={[`/platform/announcements/${id}/edit`]}>
      <Routes>
        <Route path="/platform/announcements/:id/edit" element={<AnnouncementForm />} />
        <Route path="/platform/announcements" element={<div data-testid="announcements-list">Announcements List</div>} />
        <Route path="/platform/announcements/:id" element={<div data-testid="announcement-detail">Announcement Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const mockAnnouncement = {
  id: 42,
  title: 'Existing Announcement',
  body: 'Existing body content',
  category: 'Safety',
  priority: 'HIGH',
  pinned: true,
  active: true,
  sortOrder: 0,
  createdAt: '2025-01-15T10:00:00.000Z',
  updatedAt: '2025-01-15T10:00:00.000Z',
  isRead: false,
};

// --- Tests ---

describe('AnnouncementForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Create mode rendering ---

  describe('Create mode', () => {
    it('renders the create form title', () => {
      renderCreateForm();
      // h1 heading - use getByRole to be specific
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/new announcement|create announcement/i);
    });

    it('renders title input', () => {
      renderCreateForm();
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    });

    it('renders body textarea', () => {
      renderCreateForm();
      expect(screen.getByLabelText(/body/i)).toBeInTheDocument();
    });

    it('renders category select with all options', () => {
      renderCreateForm();
      const categorySelect = screen.getByLabelText(/category/i);
      expect(categorySelect).toBeInTheDocument();
      const options = Array.from((categorySelect as HTMLSelectElement).options).map(o => o.value);
      expect(options).toContain('General');
      expect(options).toContain('Safety');
      expect(options).toContain('Maintenance');
      expect(options).toContain('Community');
      expect(options).toContain('Emergency');
    });

    it('renders priority select with all options', () => {
      renderCreateForm();
      const prioritySelect = screen.getByLabelText(/priority/i);
      expect(prioritySelect).toBeInTheDocument();
      const options = Array.from((prioritySelect as HTMLSelectElement).options).map(o => o.value);
      expect(options).toContain('LOW');
      expect(options).toContain('NORMAL');
      expect(options).toContain('HIGH');
      expect(options).toContain('URGENT');
    });

    it('renders pinned checkbox', () => {
      renderCreateForm();
      expect(screen.getByLabelText(/pinned/i)).toBeInTheDocument();
    });

    it('renders active checkbox', () => {
      renderCreateForm();
      expect(screen.getByLabelText(/active/i)).toBeInTheDocument();
    });

    it('active checkbox is checked by default', () => {
      renderCreateForm();
      const activeCheckbox = screen.getByLabelText(/active/i);
      expect(activeCheckbox).toBeChecked();
    });

    it('pinned checkbox is unchecked by default', () => {
      renderCreateForm();
      const pinnedCheckbox = screen.getByLabelText(/pinned/i);
      expect(pinnedCheckbox).not.toBeChecked();
    });

    it('renders submit button', () => {
      renderCreateForm();
      expect(screen.getByRole('button', { name: /create|save|submit/i })).toBeInTheDocument();
    });

    it('renders cancel button', () => {
      renderCreateForm();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('does NOT show loading spinner initially in create mode', () => {
      renderCreateForm();
      // In create mode there is no fetch on mount, so no spinner
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  // --- Edit mode rendering ---

  describe('Edit mode', () => {
    it('shows loading spinner while fetching announcement', () => {
      vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
      renderEditForm();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders the edit form title', async () => {
      vi.mocked(api.get).mockResolvedValue(mockAnnouncement);
      renderEditForm();
      await waitFor(() => {
        expect(screen.getByText(/edit announcement/i)).toBeInTheDocument();
      });
    });

    it('pre-populates title from fetched announcement', async () => {
      vi.mocked(api.get).mockResolvedValue(mockAnnouncement);
      renderEditForm();
      await waitFor(() => {
        const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
        expect(titleInput.value).toBe('Existing Announcement');
      });
    });

    it('pre-populates body from fetched announcement', async () => {
      vi.mocked(api.get).mockResolvedValue(mockAnnouncement);
      renderEditForm();
      await waitFor(() => {
        const bodyTextarea = screen.getByLabelText(/body/i) as HTMLTextAreaElement;
        expect(bodyTextarea.value).toBe('Existing body content');
      });
    });

    it('pre-populates category from fetched announcement', async () => {
      vi.mocked(api.get).mockResolvedValue(mockAnnouncement);
      renderEditForm();
      await waitFor(() => {
        const categorySelect = screen.getByLabelText(/category/i) as HTMLSelectElement;
        expect(categorySelect.value).toBe('Safety');
      });
    });

    it('pre-populates priority from fetched announcement', async () => {
      vi.mocked(api.get).mockResolvedValue(mockAnnouncement);
      renderEditForm();
      await waitFor(() => {
        const prioritySelect = screen.getByLabelText(/priority/i) as HTMLSelectElement;
        expect(prioritySelect.value).toBe('HIGH');
      });
    });

    it('pre-populates pinned from fetched announcement', async () => {
      vi.mocked(api.get).mockResolvedValue(mockAnnouncement);
      renderEditForm();
      await waitFor(() => {
        const pinnedCheckbox = screen.getByLabelText(/pinned/i) as HTMLInputElement;
        expect(pinnedCheckbox.checked).toBe(true);
      });
    });

    it('shows error state when fetch fails', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Not found'));
      renderEditForm();
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('GETs from correct endpoint with id from URL', async () => {
      vi.mocked(api.get).mockResolvedValue(mockAnnouncement);
      renderEditForm('42');
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/api/platform/announcements/42');
      });
    });
  });

  // --- Validation ---

  describe('Validation', () => {
    it('shows validation error when title is empty on submit', async () => {
      renderCreateForm();
      fireEvent.click(screen.getByRole('button', { name: /create|save|submit/i }));
      await waitFor(() => {
        expect(screen.getByText(/title.*required|required.*title/i)).toBeInTheDocument();
      });
    });

    it('shows validation error when body is empty on submit', async () => {
      renderCreateForm();
      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Title' } });
      fireEvent.click(screen.getByRole('button', { name: /create|save|submit/i }));
      await waitFor(() => {
        expect(screen.getByText(/body.*required|required.*body/i)).toBeInTheDocument();
      });
    });

    it('shows validation error when category is not selected on submit', async () => {
      renderCreateForm();
      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Title' } });
      fireEvent.change(screen.getByLabelText(/body/i), { target: { value: 'Test body' } });
      fireEvent.click(screen.getByRole('button', { name: /create|save|submit/i }));
      await waitFor(() => {
        expect(screen.getByText(/category.*required|required.*category/i)).toBeInTheDocument();
      });
    });

    it('shows validation error when priority is not selected on submit', async () => {
      renderCreateForm();
      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Title' } });
      fireEvent.change(screen.getByLabelText(/body/i), { target: { value: 'Test body' } });
      fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'General' } });
      fireEvent.click(screen.getByRole('button', { name: /create|save|submit/i }));
      await waitFor(() => {
        expect(screen.getByText(/priority.*required|required.*priority/i)).toBeInTheDocument();
      });
    });
  });

  // --- Create submission ---

  describe('Create submission', () => {
    it('POSTs to /api/platform/announcements on valid create', async () => {
      vi.mocked(api.post).mockResolvedValue({ id: 99, title: 'New Announcement' });
      renderCreateForm();

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'New Announcement' } });
      fireEvent.change(screen.getByLabelText(/body/i), { target: { value: 'Body text here' } });
      fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'General' } });
      fireEvent.change(screen.getByLabelText(/priority/i), { target: { value: 'NORMAL' } });

      fireEvent.click(screen.getByRole('button', { name: /create|save|submit/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/api/platform/announcements',
          expect.objectContaining({
            title: 'New Announcement',
            body: 'Body text here',
            category: 'General',
            priority: 'NORMAL',
          })
        );
      });
    });

    it('includes pinned and active in POST body', async () => {
      vi.mocked(api.post).mockResolvedValue({ id: 99 });
      renderCreateForm();

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Title' } });
      fireEvent.change(screen.getByLabelText(/body/i), { target: { value: 'Body' } });
      fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Community' } });
      fireEvent.change(screen.getByLabelText(/priority/i), { target: { value: 'HIGH' } });
      fireEvent.click(screen.getByLabelText(/pinned/i)); // check pinned

      fireEvent.click(screen.getByRole('button', { name: /create|save|submit/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/api/platform/announcements',
          expect.objectContaining({
            pinned: true,
            active: true,
          })
        );
      });
    });

    it('navigates to announcement detail on successful create', async () => {
      vi.mocked(api.post).mockResolvedValue({ id: 99 });
      renderCreateForm();

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Title' } });
      fireEvent.change(screen.getByLabelText(/body/i), { target: { value: 'Body' } });
      fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'General' } });
      fireEvent.change(screen.getByLabelText(/priority/i), { target: { value: 'NORMAL' } });

      fireEvent.click(screen.getByRole('button', { name: /create|save|submit/i }));

      await waitFor(() => {
        expect(screen.getByTestId('announcement-detail')).toBeInTheDocument();
      });
    });

    it('shows error message when create fails', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Server error'));
      renderCreateForm();

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Title' } });
      fireEvent.change(screen.getByLabelText(/body/i), { target: { value: 'Body' } });
      fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'General' } });
      fireEvent.change(screen.getByLabelText(/priority/i), { target: { value: 'NORMAL' } });

      fireEvent.click(screen.getByRole('button', { name: /create|save|submit/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('disables submit button during submission', async () => {
      let resolvePost!: (v: unknown) => void;
      vi.mocked(api.post).mockReturnValue(new Promise(r => { resolvePost = r; }));
      renderCreateForm();

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Title' } });
      fireEvent.change(screen.getByLabelText(/body/i), { target: { value: 'Body' } });
      fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'General' } });
      fireEvent.change(screen.getByLabelText(/priority/i), { target: { value: 'NORMAL' } });

      fireEvent.click(screen.getByRole('button', { name: /create|save|submit/i }));

      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /saving|creating|submitting|create|save|submit/i });
        expect(btn).toBeDisabled();
      });

      // Cleanup
      resolvePost({ id: 1 });
    });
  });

  // --- Edit submission ---

  describe('Edit submission', () => {
    it('PUTs to /api/platform/announcements/:id on valid edit', async () => {
      vi.mocked(api.get).mockResolvedValue(mockAnnouncement);
      vi.mocked(api.put).mockResolvedValue({ ...mockAnnouncement, title: 'Updated Title' });
      renderEditForm('42');

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Updated Title' } });
      fireEvent.click(screen.getByRole('button', { name: /save|update|submit/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          '/api/platform/announcements/42',
          expect.objectContaining({
            title: 'Updated Title',
          })
        );
      });
    });

    it('navigates to announcement detail on successful edit', async () => {
      vi.mocked(api.get).mockResolvedValue(mockAnnouncement);
      vi.mocked(api.put).mockResolvedValue(mockAnnouncement);
      renderEditForm('42');

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /save|update|submit/i }));

      await waitFor(() => {
        expect(screen.getByTestId('announcement-detail')).toBeInTheDocument();
      });
    });

    it('shows error message when update fails', async () => {
      vi.mocked(api.get).mockResolvedValue(mockAnnouncement);
      vi.mocked(api.put).mockRejectedValue(new Error('Update failed'));
      renderEditForm('42');

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /save|update|submit/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  // --- Cancel navigation ---

  describe('Cancel navigation', () => {
    it('navigates to announcements list on cancel (create mode)', () => {
      renderCreateForm();
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.getByTestId('announcements-list')).toBeInTheDocument();
    });

    it('navigates to announcements list on cancel (edit mode)', async () => {
      vi.mocked(api.get).mockResolvedValue(mockAnnouncement);
      renderEditForm('42');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.getByTestId('announcements-list')).toBeInTheDocument();
    });
  });
});
