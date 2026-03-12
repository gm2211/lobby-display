import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '../../../src/platform/components/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with default size (md)', () => {
    render(<LoadingSpinner />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
  });

  it('renders with sm size', () => {
    const { container } = render(<LoadingSpinner size="sm" />);
    // The spinner <span> inside should have width of 16px
    const spinner = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(spinner).not.toBeNull();
    expect(spinner.style.width).toBe('16px');
    expect(spinner.style.height).toBe('16px');
  });

  it('renders with md size', () => {
    const { container } = render(<LoadingSpinner size="md" />);
    const spinner = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(spinner).not.toBeNull();
    expect(spinner.style.width).toBe('32px');
    expect(spinner.style.height).toBe('32px');
  });

  it('renders with lg size', () => {
    const { container } = render(<LoadingSpinner size="lg" />);
    const spinner = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(spinner).not.toBeNull();
    expect(spinner.style.width).toBe('56px');
    expect(spinner.style.height).toBe('56px');
  });

  it('uses default label "Loading..."', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status', { name: 'Loading...' })).toBeInTheDocument();
  });

  it('uses a custom label', () => {
    render(<LoadingSpinner label="Fetching data..." />);
    expect(screen.getByRole('status', { name: 'Fetching data...' })).toBeInTheDocument();
  });

  it('applies custom color to spinner border', () => {
    const { container } = render(<LoadingSpinner color="#ff0000" />);
    const spinner = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(spinner.style.borderTopColor).toBe('rgb(255, 0, 0)');
  });

  it('has animation style applied', () => {
    const { container } = render(<LoadingSpinner />);
    const spinner = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(spinner.style.animation).toContain('__spinner-rotate');
  });
});
