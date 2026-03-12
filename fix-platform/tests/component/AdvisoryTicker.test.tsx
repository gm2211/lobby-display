import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdvisoryTicker from '../../src/components/AdvisoryTicker';
import type { Advisory } from '../../src/types';

function makeAdvisory(overrides: Partial<Advisory> = {}, index = 0): Advisory {
  return {
    id: index + 1,
    message: `Advisory message ${index + 1}`,
    active: true,
    ...overrides,
  };
}

describe('AdvisoryTicker', () => {
  it('renders advisory messages', () => {
    const advisories = [makeAdvisory({ message: 'Storm warning tonight' })];
    render(<AdvisoryTicker advisories={advisories} />);
    expect(screen.getByText('Storm warning tonight')).toBeInTheDocument();
  });

  it('filters out inactive advisories', () => {
    const advisories = [
      makeAdvisory({ message: 'Visible', active: true }),
      makeAdvisory({ message: 'Hidden', active: false }, 1),
    ];
    render(<AdvisoryTicker advisories={advisories} />);
    expect(screen.getByText('Visible')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('returns null when no active advisories', () => {
    const { container } = render(<AdvisoryTicker advisories={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders multiple advisories', () => {
    const advisories = [
      makeAdvisory({ message: 'First' }),
      makeAdvisory({ message: 'Second' }, 1),
    ];
    render(<AdvisoryTicker advisories={advisories} />);
    // Content is duplicated for seamless scrolling, so use getAllByText
    expect(screen.getAllByText('First').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Second').length).toBeGreaterThanOrEqual(1);
  });

  it('returns null when all advisories are inactive', () => {
    const advisories = [
      makeAdvisory({ active: false }),
      makeAdvisory({ active: false }, 1),
    ];
    const { container } = render(<AdvisoryTicker advisories={advisories} />);
    expect(container.innerHTML).toBe('');
  });
});
