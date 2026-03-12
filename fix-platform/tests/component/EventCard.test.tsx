import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EventCard from '../../src/components/EventCard';
import type { Event } from '../../src/types';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 1,
    title: 'Yoga Class',
    subtitle: 'Weekly yoga session',
    details: ['Tuesday 7 AM', 'Studio B'],
    imageUrl: '',
    accentColor: '',
    sortOrder: 0,
    ...overrides,
  };
}

describe('EventCard', () => {
  it('renders title', () => {
    render(<EventCard event={makeEvent()} />);
    expect(screen.getByText('Yoga Class')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<EventCard event={makeEvent()} />);
    expect(screen.getByText('Weekly yoga session')).toBeInTheDocument();
  });

  it('renders detail items as HTML', () => {
    const { container } = render(<EventCard event={makeEvent()} />);
    // Details are rendered via dangerouslySetInnerHTML with <br/> tags
    const detailsDiv = container.querySelector('div[style*="font-size: 13px"]');
    expect(detailsDiv).not.toBeNull();
    expect(detailsDiv!.textContent).toContain('Tuesday 7 AM');
    expect(detailsDiv!.textContent).toContain('Studio B');
  });

  it('does not render subtitle when empty', () => {
    render(<EventCard event={makeEvent({ subtitle: '' })} />);
    // The subtitle <p> shouldn't be present since subtitle is falsy
    const paragraphs = document.querySelectorAll('p');
    for (const p of paragraphs) {
      expect(p.textContent).not.toBe('');
    }
  });

  it('does not render details section when details are empty', () => {
    const { container } = render(<EventCard event={makeEvent({ details: [] })} />);
    // With empty details, the details div with dangerouslySetInnerHTML should not render
    // since detailsMarkdown.trim() is empty
    const detailsDiv = container.querySelector('[dangerouslysetinnerhtml]');
    expect(detailsDiv).toBeNull();
  });

  it('renders accent color bar when provided', () => {
    const { container } = render(<EventCard event={makeEvent({ accentColor: '#e91e63' })} />);
    const accentBar = container.querySelector('div[style*="background: rgb(233, 30, 99)"]') ||
      container.querySelector('div[style*="#e91e63"]');
    expect(accentBar).not.toBeNull();
  });

  it('does not render accent bar when accentColor is empty', () => {
    const { container } = render(<EventCard event={makeEvent({ accentColor: '' })} />);
    // With empty accentColor, the accent bar div should not render
    // because of the conditional: event.accentColor && <div>
    const divs = container.querySelectorAll('div');
    const accentBars = Array.from(divs).filter(d => {
      const style = d.getAttribute('style') || '';
      return style.includes('height: 4px') || style.includes('height:4px');
    });
    expect(accentBars).toHaveLength(0);
  });

  it('handles markdown in details', () => {
    const { container } = render(
      <EventCard event={makeEvent({ details: ['**Bold item**', '*Italic item*'] })} />
    );
    expect(container.querySelector('strong')?.textContent).toBe('Bold item');
    expect(container.querySelector('em')?.textContent).toBe('Italic item');
  });

  it('renders with background image when imageUrl provided', () => {
    const { container } = render(
      <EventCard event={makeEvent({ imageUrl: '/images/yoga.jpg' })} />
    );
    const card = container.firstElementChild as HTMLElement;
    const bg = card.style.background;
    expect(bg).toContain('/images/yoga.jpg');
  });

  it('renders with gradient when no imageUrl', () => {
    const { container } = render(
      <EventCard event={makeEvent({ imageUrl: '' })} />
    );
    const card = container.firstElementChild as HTMLElement;
    const bg = card.style.background;
    expect(bg).toContain('linear-gradient');
  });
});
