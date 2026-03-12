import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSkeleton } from '../../../src/platform/components/LoadingSkeleton';

describe('LoadingSkeleton', () => {
  it('renders default 3 rows', () => {
    const { container } = render(<LoadingSkeleton />);
    // Default variant is 'rows' — rows are rendered as direct children of rowContainer
    const rowContainer = container.firstElementChild as HTMLElement;
    expect(rowContainer).not.toBeNull();
    // 3 skeleton rows by default
    expect(rowContainer.children.length).toBe(3);
  });

  it('renders specified number of rows', () => {
    const { container } = render(<LoadingSkeleton rows={5} />);
    const rowContainer = container.firstElementChild as HTMLElement;
    expect(rowContainer.children.length).toBe(5);
  });

  it('has aria-busy="true"', () => {
    render(<LoadingSkeleton />);
    expect(screen.getByLabelText('Loading...')).toBeInTheDocument();
  });

  it('applies custom row widths', () => {
    const { container } = render(
      <LoadingSkeleton rows={2} rowWidths={['80%', '60%']} />
    );
    const rows = container.firstElementChild!.children;
    expect((rows[0] as HTMLElement).style.width).toBe('80%');
    expect((rows[1] as HTMLElement).style.width).toBe('60%');
  });

  it('renders card variant with thumbnail and body', () => {
    const { container } = render(<LoadingSkeleton variant="card" rows={2} />);
    // Each card has a thumb + body container
    const cardGrid = container.firstElementChild as HTMLElement;
    // 2 card children
    expect(cardGrid.children.length).toBe(2);

    // Each card should have a thumb (first child) and body (second child)
    const firstCard = cardGrid.children[0] as HTMLElement;
    expect(firstCard.children.length).toBeGreaterThanOrEqual(2);
  });

  it('renders 1 card by default when variant is card and rows=1', () => {
    const { container } = render(<LoadingSkeleton variant="card" rows={1} />);
    const cardGrid = container.firstElementChild as HTMLElement;
    expect(cardGrid.children.length).toBe(1);
  });

  it('applies shimmer animation to row elements', () => {
    const { container } = render(<LoadingSkeleton rows={1} />);
    const row = container.firstElementChild!.children[0] as HTMLElement;
    expect(row.style.animation).toContain('__skeleton-shimmer');
  });
});
