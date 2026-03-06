import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceTable from '../../src/components/ServiceTable';
import type { Service } from '../../src/types';

function makeService(overrides: Partial<Service> = {}, index = 0): Service {
  return {
    id: index + 1,
    name: `Service ${index + 1}`,
    status: 'Operational',
    notes: '',
    lastChecked: new Date().toISOString(),
    sortOrder: index,
    ...overrides,
  };
}

function makeServices(count: number): Service[] {
  return Array.from({ length: count }, (_, i) => makeService({}, i));
}

describe('ServiceTable', () => {
  it('renders column headers', () => {
    render(<ServiceTable services={[]} />);
    expect(screen.getByText('Service')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Last Updated')).toBeInTheDocument();
  });

  it('renders all services when 10 or fewer (no pagination)', () => {
    const services = makeServices(5);
    render(<ServiceTable services={services} scrollSpeed={0} />);
    for (const s of services) {
      expect(screen.getByText(s.name)).toBeInTheDocument();
    }
    // No page indicator
    expect(screen.queryByText(/Page/)).toBeNull();
  });

  it('paginates when more than 10 services', () => {
    const services = makeServices(12);
    render(<ServiceTable services={services} scrollSpeed={0} />);
    // Page indicator should appear
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    // Only first 10 should be visible
    expect(screen.getByText('Service 1')).toBeInTheDocument();
    expect(screen.getByText('Service 10')).toBeInTheDocument();
    expect(screen.queryByText('Service 11')).toBeNull();
  });

  it('shows correct status color dots for each service', () => {
    const services = [
      makeService({ name: 'HVAC', status: 'Operational' }),
      makeService({ name: 'Elevators', status: 'Maintenance' }, 1),
      makeService({ name: 'Internet', status: 'Outage' }, 2),
    ];
    const { container } = render(<ServiceTable services={services} scrollSpeed={0} />);
    expect(screen.getByText('HVAC')).toBeInTheDocument();
    expect(screen.getByText('Elevators')).toBeInTheDocument();
    expect(screen.getByText('Internet')).toBeInTheDocument();
    // Status is shown as colored dots, not text
    const dots = container.querySelectorAll('span[style*="border-radius: 50%"]');
    expect(dots.length).toBeGreaterThanOrEqual(3);
  });

  it('shows "Just now" for recently checked services', () => {
    const services = [makeService({ lastChecked: new Date().toISOString() })];
    render(<ServiceTable services={services} scrollSpeed={0} />);
    expect(screen.getByText('Just now')).toBeInTheDocument();
  });

  it('shows notes when present', () => {
    const services = [makeService({ notes: 'Scheduled maintenance at 5 PM' })];
    render(<ServiceTable services={services} scrollSpeed={0} />);
    expect(screen.getByText('Scheduled maintenance at 5 PM')).toBeInTheDocument();
  });

  it('shows em dash when notes are empty', () => {
    const services = [makeService({ notes: '' })];
    render(<ServiceTable services={services} scrollSpeed={0} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('handles empty service list', () => {
    const { container } = render(<ServiceTable services={[]} scrollSpeed={0} />);
    // Should render headers but no data rows
    expect(screen.getByText('Service')).toBeInTheDocument();
    const tbody = container.querySelector('tbody');
    // Either no tbody (only header table) or empty tbody
    if (tbody) {
      expect(tbody.children).toHaveLength(0);
    }
  });

  it('renders correct number of page dots', () => {
    const services = makeServices(25); // 3 pages
    render(<ServiceTable services={services} scrollSpeed={0} />);
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    // 3 page dot buttons
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });

  it('shows status color dots', () => {
    const services = [makeService({ status: 'Operational' })];
    const { container } = render(<ServiceTable services={services} scrollSpeed={0} />);
    // Status dot should have green background (#4caf50)
    const dot = container.querySelector('span[style*="background: rgb(76, 175, 80)"]') ||
      container.querySelector('span[style*="#4caf50"]');
    expect(dot).not.toBeNull();
  });
});
