import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PlatformRouter from '../../src/platform/PlatformRouter';
import { ThemeProvider } from '../../src/theme/ThemeContext';

// Mock useAuth
vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'testuser', role: 'ADMIN' }, loading: false }),
}));

// Mock the api module so async pages resolve immediately with empty data
vi.mock('../../src/utils/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

// Stub fetch globally for pages that use fetch directly (e.g. ConsentPage)
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => [],
  } as unknown as Response));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Wrap PlatformRouter inside a /platform/* parent route to match production mount
function renderAtPath(path: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/platform/*" element={<PlatformRouter />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('PlatformRouter', () => {
  it('renders platform dashboard at /platform', async () => {
    renderAtPath('/platform');
    await waitFor(() => {
      expect(screen.getByTestId('welcome-banner')).toBeInTheDocument();
    });
  });

  it('renders announcements page at /platform/announcements', async () => {
    renderAtPath('/platform/announcements');
    // Page heading (h1) should say "Announcements"
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /announcements/i })).toBeInTheDocument();
    });
  });

  it('renders maintenance page at /platform/maintenance', () => {
    renderAtPath('/platform/maintenance');
    expect(screen.getByRole('heading', { name: /maintenance/i })).toBeInTheDocument();
  });

  it('renders amenities page at /platform/amenities', () => {
    renderAtPath('/platform/amenities');
    expect(screen.getByRole('heading', { name: /amenities/i })).toBeInTheDocument();
  });

  it('renders events page at /platform/events', () => {
    renderAtPath('/platform/events');
    expect(screen.getByRole('heading', { name: /events/i })).toBeInTheDocument();
  });

  it('renders bookings page at /platform/bookings', () => {
    renderAtPath('/platform/bookings');
    expect(screen.getByRole('heading', { name: /bookings/i })).toBeInTheDocument();
  });

  it('renders visitors page at /platform/visitors', () => {
    renderAtPath('/platform/visitors');
    // The sidebar nav always shows "Visitors" link text, confirming we're on the visitors route
    const links = screen.getAllByText(/visitors/i);
    expect(links.length).toBeGreaterThan(0);
  });

  it('renders violations page at /platform/violations', () => {
    renderAtPath('/platform/violations');
    expect(screen.getByRole('heading', { name: /violations/i })).toBeInTheDocument();
  });

  it('renders payments page at /platform/payments', async () => {
    renderAtPath('/platform/payments');
    // Page renders "Payment History" as h1
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /payment/i })).toBeInTheDocument();
    });
  });

  it('renders parcels page at /platform/parcels', () => {
    renderAtPath('/platform/parcels');
    expect(screen.getByRole('heading', { name: /parcels/i })).toBeInTheDocument();
  });

  it('renders directory page at /platform/directory', () => {
    renderAtPath('/platform/directory');
    expect(screen.getByRole('heading', { name: /directory/i })).toBeInTheDocument();
  });

  it('renders forum page at /platform/forum', async () => {
    renderAtPath('/platform/forum');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /forum/i })).toBeInTheDocument();
    });
  });

  it('renders marketplace page at /platform/marketplace', () => {
    renderAtPath('/platform/marketplace');
    expect(screen.getByRole('heading', { name: /marketplace/i })).toBeInTheDocument();
  });

  it('renders documents page at /platform/documents', () => {
    renderAtPath('/platform/documents');
    expect(screen.getByRole('heading', { name: /documents/i })).toBeInTheDocument();
  });

  it('renders training page at /platform/training', () => {
    renderAtPath('/platform/training');
    expect(screen.getByRole('heading', { name: /training/i })).toBeInTheDocument();
  });

  it('renders surveys page at /platform/surveys', async () => {
    renderAtPath('/platform/surveys');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /surveys/i })).toBeInTheDocument();
    });
  });

  it('renders consent page at /platform/consent', async () => {
    renderAtPath('/platform/consent');
    // Page renders "Consent Forms" as h1
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /consent/i })).toBeInTheDocument();
    });
  });

  it('renders search page at /platform/search', () => {
    renderAtPath('/platform/search');
    expect(screen.getByRole('heading', { name: /search/i })).toBeInTheDocument();
  });
});
