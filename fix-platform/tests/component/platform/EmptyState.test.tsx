import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '../../../src/platform/components/EmptyState';

describe('EmptyState', () => {
  it('renders the message', () => {
    render(<EmptyState message="No items found" />);
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('renders optional description', () => {
    render(
      <EmptyState
        message="No events"
        description="Add your first event to get started."
      />
    );
    expect(screen.getByText('Add your first event to get started.')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { container } = render(<EmptyState message="Empty" />);
    // Description paragraph should be absent
    const paragraphs = container.querySelectorAll('p');
    const texts = Array.from(paragraphs).map(p => p.textContent);
    expect(texts).not.toContain(undefined);
    // Only one <p> (the message), no description
    expect(paragraphs.length).toBe(1);
  });

  it('renders default icon', () => {
    const { container } = render(<EmptyState message="Empty" />);
    const iconSpan = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(iconSpan).not.toBeNull();
    // Default icon is \u25A1 (□)
    expect(iconSpan.textContent).toBe('\u25A1');
  });

  it('renders custom icon', () => {
    const { container } = render(<EmptyState message="Empty" icon="+" />);
    const iconSpan = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(iconSpan.textContent).toBe('+');
  });

  it('renders action button when action is provided', () => {
    const handleClick = vi.fn();
    render(
      <EmptyState
        message="No services"
        action={{ label: 'Add Service', onClick: handleClick }}
      />
    );
    expect(screen.getByRole('button', { name: 'Add Service' })).toBeInTheDocument();
  });

  it('does not render action button when action is not provided', () => {
    render(<EmptyState message="No services" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('calls action onClick when button is clicked', () => {
    const handleClick = vi.fn();
    render(
      <EmptyState
        message="No services"
        action={{ label: 'Add Service', onClick: handleClick }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Service' }));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('has role="status" for accessibility', () => {
    render(<EmptyState message="Nothing here" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('aria-label matches message', () => {
    render(<EmptyState message="No data available" />);
    expect(screen.getByLabelText('No data available')).toBeInTheDocument();
  });
});
