import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PlatformNavItem from '../../src/platform/components/PlatformNavItem';

function renderNavItem(props: { label: string; to: string; icon?: string; active?: boolean }) {
  return render(
    <MemoryRouter>
      <nav>
        <ul>
          <PlatformNavItem {...props} />
        </ul>
      </nav>
    </MemoryRouter>
  );
}

describe('PlatformNavItem', () => {
  it('renders the label', () => {
    renderNavItem({ label: 'Dashboard', to: '/platform' });
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders as a link to the given path', () => {
    renderNavItem({ label: 'Announcements', to: '/platform/announcements' });
    const link = screen.getByRole('link', { name: /announcements/i });
    expect(link).toHaveAttribute('href', '/platform/announcements');
  });

  it('applies active styling when active prop is true', () => {
    renderNavItem({ label: 'Events', to: '/platform/events', active: true });
    const link = screen.getByRole('link', { name: /events/i });
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('does not apply active styling when active prop is false', () => {
    renderNavItem({ label: 'Events', to: '/platform/events', active: false });
    const link = screen.getByRole('link', { name: /events/i });
    expect(link).not.toHaveAttribute('aria-current', 'page');
  });
});
