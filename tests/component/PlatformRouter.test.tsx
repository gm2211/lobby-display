import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PlatformRouter from '../../src/platform/PlatformRouter';
import { ThemeProvider } from '../../src/theme/ThemeContext';

// Mock useAuth
vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'testuser', role: 'ADMIN' }, loading: false }),
}));

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

// Helper: assert that at least one element with the text exists
function expectTextExists(text: string | RegExp) {
  const elements = screen.getAllByText(text);
  expect(elements.length).toBeGreaterThan(0);
}

describe('PlatformRouter', () => {
  it('renders platform dashboard at /platform', () => {
    renderAtPath('/platform');
    expect(screen.getByText(/platform dashboard/i)).toBeInTheDocument();
  });

  it('renders announcements page at /platform/announcements', () => {
    renderAtPath('/platform/announcements');
    // Page heading (h1) should say "Announcements"
    expect(screen.getByRole('heading', { name: /announcements/i })).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { name: /visitors/i })).toBeInTheDocument();
  });

  it('renders violations page at /platform/violations', () => {
    renderAtPath('/platform/violations');
    expect(screen.getByRole('heading', { name: /violations/i })).toBeInTheDocument();
  });

  it('renders payments page at /platform/payments', () => {
    renderAtPath('/platform/payments');
    expect(screen.getByRole('heading', { name: /payments/i })).toBeInTheDocument();
  });

  it('renders parcels page at /platform/parcels', () => {
    renderAtPath('/platform/parcels');
    expect(screen.getByRole('heading', { name: /parcels/i })).toBeInTheDocument();
  });

  it('renders directory page at /platform/directory', () => {
    renderAtPath('/platform/directory');
    expect(screen.getByRole('heading', { name: /directory/i })).toBeInTheDocument();
  });

  it('renders forum page at /platform/forum', () => {
    renderAtPath('/platform/forum');
    expect(screen.getByRole('heading', { name: /forum/i })).toBeInTheDocument();
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

  it('renders surveys page at /platform/surveys', () => {
    renderAtPath('/platform/surveys');
    expect(screen.getByRole('heading', { name: /surveys/i })).toBeInTheDocument();
  });

  it('renders consent page at /platform/consent', () => {
    renderAtPath('/platform/consent');
    expect(screen.getByRole('heading', { name: /consent/i })).toBeInTheDocument();
  });

  it('renders search page at /platform/search', () => {
    renderAtPath('/platform/search');
    expect(screen.getByRole('heading', { name: /search/i })).toBeInTheDocument();
  });
});
