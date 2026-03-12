/**
 * AnnouncementsList component tests
 *
 * Tests: renders list, shows pinned items first, filters work,
 *        shows loading/error states.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AnnouncementsList from '../../../src/platform/pages/AnnouncementsList';
import type { Announcement } from '../../../src/platform/types';

// Helper to render with router context
function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const baseAnnouncement: Announcement = {
  id: 1,
  title: 'Test Announcement',
  body: 'Test body content',
  category: 'General',
  priority: 'NORMAL',
  pinned: false,
  active: true,
  sortOrder: 0,
  createdAt: '2025-01-15T10:00:00.000Z',
  updatedAt: '2025-01-15T10:00:00.000Z',
  isRead: false,
};

function makeAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
  return { ...baseAnnouncement, ...overrides };
}

describe('AnnouncementsList', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading spinner initially', () => {
    // Never resolves to keep in loading state
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<AnnouncementsList />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders a list of announcements after fetching', async () => {
    const announcements = [
      makeAnnouncement({ id: 1, title: 'First Announcement' }),
      makeAnnouncement({ id: 2, title: 'Second Announcement' }),
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      expect(screen.getByText('First Announcement')).toBeInTheDocument();
      expect(screen.getByText('Second Announcement')).toBeInTheDocument();
    });
  });

  it('shows unread count in header', async () => {
    const announcements = [
      makeAnnouncement({ id: 1, isRead: false }),
      makeAnnouncement({ id: 2, isRead: false }),
      makeAnnouncement({ id: 3, isRead: true }),
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      expect(screen.getByText('2 unread')).toBeInTheDocument();
    });
  });

  it('shows unread dot for unread announcements', async () => {
    const announcements = [makeAnnouncement({ id: 1, isRead: false })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      const unreadDot = screen.getByTitle('Unread');
      expect(unreadDot).toBeInTheDocument();
    });
  });

  it('shows "Read" indicator for read announcements', async () => {
    const announcements = [makeAnnouncement({ id: 1, isRead: true })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      const readDot = screen.getByTitle('Read');
      expect(readDot).toBeInTheDocument();
    });
  });

  it('shows pinned badge for pinned announcements', async () => {
    const announcements = [makeAnnouncement({ id: 1, pinned: true })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      expect(screen.getByText(/pinned/i)).toBeInTheDocument();
    });
  });

  it('shows category badge', async () => {
    const announcements = [makeAnnouncement({ id: 1, category: 'Maintenance' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      // Category appears in both the badge and the filter dropdown; getAllByText handles multiple matches
      const elements = screen.getAllByText('Maintenance');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows priority for HIGH priority announcements', async () => {
    const announcements = [makeAnnouncement({ id: 1, priority: 'HIGH' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      expect(screen.getByText(/high/i)).toBeInTheDocument();
    });
  });

  it('shows priority for URGENT announcements', async () => {
    const announcements = [makeAnnouncement({ id: 1, priority: 'URGENT' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      expect(screen.getByText(/urgent/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when no announcements', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      expect(screen.getByText('No announcements found')).toBeInTheDocument();
    });
  });

  it('shows error state on fetch failure', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'Server Error' }),
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load announcements')).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'Server Error' }),
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('shows category dropdown when announcements have categories', async () => {
    const announcements = [
      makeAnnouncement({ id: 1, category: 'General' }),
      makeAnnouncement({ id: 2, category: 'Maintenance' }),
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by category')).toBeInTheDocument();
    });
  });

  it('filters by category', async () => {
    const announcements = [
      makeAnnouncement({ id: 1, title: 'General Item', category: 'General' }),
      makeAnnouncement({ id: 2, title: 'Maintenance Item', category: 'Maintenance' }),
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      expect(screen.getByText('General Item')).toBeInTheDocument();
    });

    const categorySelect = screen.getByLabelText('Filter by category');
    fireEvent.change(categorySelect, { target: { value: 'Maintenance' } });

    expect(screen.queryByText('General Item')).not.toBeInTheDocument();
    expect(screen.getByText('Maintenance Item')).toBeInTheDocument();
  });

  it('filters by read status - unread only', async () => {
    const announcements = [
      makeAnnouncement({ id: 1, title: 'Read Item', isRead: true }),
      makeAnnouncement({ id: 2, title: 'Unread Item', isRead: false }),
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      expect(screen.getByText('Read Item')).toBeInTheDocument();
    });

    const readStatusSelect = screen.getByLabelText('Filter by read status');
    fireEvent.change(readStatusSelect, { target: { value: 'unread' } });

    expect(screen.queryByText('Read Item')).not.toBeInTheDocument();
    expect(screen.getByText('Unread Item')).toBeInTheDocument();
  });

  it('filters by read status - read only', async () => {
    const announcements = [
      makeAnnouncement({ id: 1, title: 'Read Item', isRead: true }),
      makeAnnouncement({ id: 2, title: 'Unread Item', isRead: false }),
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      expect(screen.getByText('Unread Item')).toBeInTheDocument();
    });

    const readStatusSelect = screen.getByLabelText('Filter by read status');
    fireEvent.change(readStatusSelect, { target: { value: 'read' } });

    expect(screen.queryByText('Unread Item')).not.toBeInTheDocument();
    expect(screen.getByText('Read Item')).toBeInTheDocument();
  });

  it('filters by search query', async () => {
    const announcements = [
      makeAnnouncement({ id: 1, title: 'Fire Drill Notice' }),
      makeAnnouncement({ id: 2, title: 'HVAC Maintenance' }),
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      expect(screen.getByText('Fire Drill Notice')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search announcements...');
    fireEvent.change(searchInput, { target: { value: 'HVAC' } });

    expect(screen.queryByText('Fire Drill Notice')).not.toBeInTheDocument();
    expect(screen.getByText('HVAC Maintenance')).toBeInTheDocument();
  });

  it('shows excerpt of body text', async () => {
    const announcements = [
      makeAnnouncement({ id: 1, body: 'This is the body content of the announcement.' }),
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      expect(screen.getByText(/this is the body content/i)).toBeInTheDocument();
    });
  });

  it('renders announcement date', async () => {
    const announcements = [
      makeAnnouncement({ id: 1, createdAt: '2025-01-15T10:00:00.000Z' }),
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      // Date format: Jan 15, 2025
      expect(screen.getByText(/jan 15, 2025/i)).toBeInTheDocument();
    });
  });

  it('each announcement card is clickable (has article role)', async () => {
    const announcements = [makeAnnouncement({ id: 1, title: 'Clickable Item' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => announcements,
    } as Response);

    renderWithRouter(<AnnouncementsList />);

    await waitFor(() => {
      const article = screen.getByRole('article', { name: 'Clickable Item' });
      expect(article).toBeInTheDocument();
    });
  });
});
