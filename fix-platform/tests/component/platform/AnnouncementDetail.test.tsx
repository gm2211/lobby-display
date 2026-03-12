/**
 * AnnouncementDetail component tests
 *
 * Tests: renders detail, shows loading/error states, auto-marks as read,
 *        back button, renders rich text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AnnouncementDetail from '../../../src/platform/pages/AnnouncementDetail';
import type { Announcement } from '../../../src/platform/types';

// Helper to render with router context and params
function renderWithParams(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/platform/announcements/${id}`]}>
      <Routes>
        <Route path="/platform/announcements/:id" element={<AnnouncementDetail />} />
        <Route path="/platform/announcements" element={<div>Announcements List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const baseAnnouncement: Announcement = {
  id: 1,
  title: 'Important Update',
  body: 'This is the **full body** of the announcement.',
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

describe('AnnouncementDetail', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading spinner initially', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderWithParams('1');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders announcement title', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (String(url).includes('/read')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => makeAnnouncement({ id: 1, title: 'Important Update' }),
      } as Response);
    });

    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Important Update')).toBeInTheDocument();
    });
  });

  it('renders announcement category badge', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (String(url).includes('/read')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => makeAnnouncement({ category: 'Maintenance' }),
      } as Response);
    });

    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Maintenance')).toBeInTheDocument();
    });
  });

  it('renders announcement date', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (String(url).includes('/read')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => makeAnnouncement({ createdAt: '2025-03-10T10:00:00.000Z' }),
      } as Response);
    });

    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/march 10, 2025/i)).toBeInTheDocument();
    });
  });

  it('renders body content as HTML (markdown rendered)', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (String(url).includes('/read')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => makeAnnouncement({ body: '**Bold text** in announcement' }),
      } as Response);
    });

    renderWithParams('1');

    await waitFor(() => {
      const strong = document.querySelector('strong');
      expect(strong?.textContent).toBe('Bold text');
    });
  });

  it('shows pinned badge for pinned announcements', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (String(url).includes('/read')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => makeAnnouncement({ pinned: true }),
      } as Response);
    });

    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/pinned/i)).toBeInTheDocument();
    });
  });

  it('shows priority for URGENT announcements', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (String(url).includes('/read')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => makeAnnouncement({ priority: 'URGENT' }),
      } as Response);
    });

    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/urgent/i)).toBeInTheDocument();
    });
  });

  it('auto-marks unread announcements as read', async () => {
    const readCallUrls: string[] = [];
    vi.mocked(fetch).mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes('/read')) {
        readCallUrls.push(urlStr);
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
      }
      // Handle CSRF token endpoint
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: async () => ({ token: 'test-csrf' }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => makeAnnouncement({ id: 42, isRead: false }),
      } as Response);
    });

    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByText('Important Update')).toBeInTheDocument();
    });

    // Should have called the read endpoint after rendering
    await waitFor(() => {
      expect(readCallUrls.some((u) => u.includes('/42/read'))).toBe(true);
    }, { timeout: 3000 });
  });

  it('does NOT call read endpoint if announcement is already read', async () => {
    const readCallUrls: string[] = [];
    vi.mocked(fetch).mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes('/read')) {
        readCallUrls.push(urlStr);
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => makeAnnouncement({ id: 1, isRead: true }),
      } as Response);
    });

    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Important Update')).toBeInTheDocument();
    });

    // No read call should be made since already read
    await new Promise((r) => setTimeout(r, 100));
    expect(readCallUrls).toHaveLength(0);
  });

  it('shows error state when announcement not found', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'Not Found', message: 'Announcement not found' }),
    } as Response);

    renderWithParams('9999');

    await waitFor(() => {
      // The EmptyState renders the title in h3 and the error message in a p
      // Use getAllByText since the error text may appear in both heading and description
      const elements = screen.getAllByText('Announcement not found');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows back button', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (String(url).includes('/read')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => makeAnnouncement(),
      } as Response);
    });

    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Back to announcements')).toBeInTheDocument();
    });
  });

  it('shows "no content" message when body is empty', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (String(url).includes('/read')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => makeAnnouncement({ body: '' }),
      } as Response);
    });

    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/no content available/i)).toBeInTheDocument();
    });
  });

  it('renders the full title in an h1 element', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (String(url).includes('/read')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => makeAnnouncement({ title: 'My Important Title' }),
      } as Response);
    });

    renderWithParams('1');

    await waitFor(() => {
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1.textContent).toBe('My Important Title');
    });
  });
});
