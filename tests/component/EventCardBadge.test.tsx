import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EventCard from '../../src/components/EventCard';

const base = { id: 1, title: 'Party', subtitle: '', details: [], imageUrl: '', accentColor: '', sortOrder: 0, markedForDeletion: false };

describe('EventCard NEW badge', () => {
  it('shows the badge when isNew', () => {
    render(<EventCard event={{ ...base, isNew: true }} />);
    expect(screen.getByTestId('new-badge').textContent).toBe('NEW');
  });
  it('hides the badge otherwise', () => {
    render(<EventCard event={base} />);
    expect(screen.queryByTestId('new-badge')).toBeNull();
  });
});
