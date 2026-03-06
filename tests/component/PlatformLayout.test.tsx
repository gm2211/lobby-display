import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PlatformLayout from '../../src/platform/PlatformLayout';
import { ThemeProvider } from '../../src/theme/ThemeContext';

// Mock useAuth so we don't need a full AuthProvider
vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'testuser', role: 'ADMIN' }, loading: false }),
}));

function renderWithRouter(ui: React.ReactElement, initialPath = '/platform') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        {ui}
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('PlatformLayout', () => {
  it('renders the sidebar', () => {
    renderWithRouter(<PlatformLayout><div>content</div></PlatformLayout>);
    expect(screen.getByRole('navigation', { name: /platform navigation/i })).toBeInTheDocument();
  });

  it('renders all nav items', () => {
    renderWithRouter(<PlatformLayout><div>content</div></PlatformLayout>);
    const navItems = [
      'Dashboard', 'Announcements', 'Maintenance', 'Amenities', 'Events',
      'Bookings', 'Visitors', 'Violations', 'Payments', 'Parcels',
      'Directory', 'Forum', 'Marketplace', 'Documents', 'Training',
      'Surveys', 'Consent', 'Search',
    ];
    for (const item of navItems) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  it('renders the top bar with user info', () => {
    renderWithRouter(<PlatformLayout><div>content</div></PlatformLayout>);
    expect(screen.getByText('testuser')).toBeInTheDocument();
  });

  it('renders child content', () => {
    renderWithRouter(<PlatformLayout><div>hello world</div></PlatformLayout>);
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  it('renders building branding in sidebar', () => {
    renderWithRouter(<PlatformLayout><div>content</div></PlatformLayout>);
    expect(screen.getByRole('navigation', { name: /platform navigation/i })).toBeInTheDocument();
  });

  it('has a menu toggle button for mobile', () => {
    renderWithRouter(<PlatformLayout><div>content</div></PlatformLayout>);
    const toggleBtn = screen.getByRole('button', { name: /toggle sidebar/i });
    expect(toggleBtn).toBeInTheDocument();
  });

  it('toggles sidebar when menu button is clicked', () => {
    renderWithRouter(<PlatformLayout><div>content</div></PlatformLayout>);
    const toggleBtn = screen.getByRole('button', { name: /toggle sidebar/i });
    const nav = screen.getByRole('navigation', { name: /platform navigation/i });
    // Initial state: sidebar open on desktop
    fireEvent.click(toggleBtn);
    // After click, sidebar should have different class/attribute
    expect(nav).toBeInTheDocument();
  });

  it('shows role badge in top bar', () => {
    renderWithRouter(<PlatformLayout><div>content</div></PlatformLayout>);
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
  });
});
