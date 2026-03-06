import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AutoScrollCards from '../../src/components/AutoScrollCards';
import type { Event } from '../../src/types';

function makeEvent(overrides: Partial<Event> = {}, index = 0): Event {
  return {
    id: index + 1,
    title: `Event ${index + 1}`,
    subtitle: `Subtitle ${index + 1}`,
    details: ['Detail line'],
    imageUrl: '',
    accentColor: '',
    sortOrder: index,
    ...overrides,
  };
}

describe('AutoScrollCards', () => {
  it('renders all event cards', () => {
    const events = [
      makeEvent({ title: 'Yoga Class' }),
      makeEvent({ title: 'Brunch' }, 1),
    ];
    render(<AutoScrollCards events={events} scrollSpeed={30} />);
    expect(screen.getByText('Yoga Class')).toBeInTheDocument();
    expect(screen.getByText('Brunch')).toBeInTheDocument();
  });

  it('handles empty events array', () => {
    const { container } = render(<AutoScrollCards events={[]} scrollSpeed={30} />);
    // Should render wrapper but no event cards
    expect(container.firstElementChild).not.toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('renders single copy of events when scrollSpeed is 0', () => {
    const events = [makeEvent({ title: 'Only Once' })];
    render(<AutoScrollCards events={events} scrollSpeed={0} />);
    // With scrollSpeed=0, shouldScroll=false, so no duplication
    const matches = screen.getAllByText('Only Once');
    expect(matches).toHaveLength(1);
  });

  it('renders event titles as h3 elements', () => {
    const events = [makeEvent({ title: 'My Event' })];
    render(<AutoScrollCards events={events} scrollSpeed={0} />);
    const heading = screen.getByText('My Event');
    expect(heading.tagName).toBe('H3');
  });

  it('renders event subtitles', () => {
    const events = [makeEvent({ subtitle: 'Fun times' })];
    render(<AutoScrollCards events={events} scrollSpeed={0} />);
    expect(screen.getByText('Fun times')).toBeInTheDocument();
  });
});
