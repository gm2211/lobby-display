import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Calendar from '../../src/platform/components/Calendar';

const MONTH_YEAR_PATTERN = /january|february|march|april|may|june|july|august|september|october|november|december/i;

function makeDate(year: number, month: number, day: number): Date {
  return new Date(year, month, day);
}

describe('Calendar', () => {
  describe('Rendering', () => {
    it('renders a calendar with 7 day-of-week headers', () => {
      render(<Calendar events={[]} />);
      // Should show Sun, Mon, Tue, Wed, Thu, Fri, Sat (or similar)
      const headers = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (const header of headers) {
        expect(screen.getByText(header)).toBeInTheDocument();
      }
    });

    it('renders month and year in the header', () => {
      render(<Calendar events={[]} />);
      // Should display month name and year
      const header = screen.getByRole('heading', { level: 2 });
      expect(header.textContent).toMatch(MONTH_YEAR_PATTERN);
      expect(header.textContent).toMatch(/\d{4}/);
    });

    it('renders day numbers for the current month', () => {
      // We'll freeze a month by initializing with a date
      render(<Calendar events={[]} initialDate={makeDate(2024, 0, 1)} />);
      // January 2024 has 31 days
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('31')).toBeInTheDocument();
    });

    it('renders the grid with CSS Grid layout (7 columns)', () => {
      const { container } = render(<Calendar events={[]} />);
      // Find the calendar grid element
      const grid = container.querySelector('[data-testid="calendar-grid"]');
      expect(grid).not.toBeNull();
      // Check the style has grid columns
      const style = grid!.getAttribute('style') ?? '';
      expect(style).toContain('repeat(7');
    });

    it('renders prev and next navigation buttons', () => {
      render(<Calendar events={[]} />);
      expect(screen.getByRole('button', { name: /prev/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });
  });

  describe('Month Navigation', () => {
    it('navigates to previous month when prev button is clicked', () => {
      render(<Calendar events={[]} initialDate={makeDate(2024, 1, 1)} />); // Feb 2024
      const prevBtn = screen.getByRole('button', { name: /prev/i });
      fireEvent.click(prevBtn);
      const header = screen.getByRole('heading', { level: 2 });
      expect(header.textContent).toMatch(/january/i);
    });

    it('navigates to next month when next button is clicked', () => {
      render(<Calendar events={[]} initialDate={makeDate(2024, 0, 1)} />); // Jan 2024
      const nextBtn = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextBtn);
      const header = screen.getByRole('heading', { level: 2 });
      expect(header.textContent).toMatch(/february/i);
    });

    it('wraps from December to January when navigating next', () => {
      render(<Calendar events={[]} initialDate={makeDate(2024, 11, 1)} />); // Dec 2024
      const nextBtn = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextBtn);
      const header = screen.getByRole('heading', { level: 2 });
      expect(header.textContent).toMatch(/january/i);
      expect(header.textContent).toMatch(/2025/);
    });

    it('wraps from January to December when navigating prev', () => {
      render(<Calendar events={[]} initialDate={makeDate(2024, 0, 1)} />); // Jan 2024
      const prevBtn = screen.getByRole('button', { name: /prev/i });
      fireEvent.click(prevBtn);
      const header = screen.getByRole('heading', { level: 2 });
      expect(header.textContent).toMatch(/december/i);
      expect(header.textContent).toMatch(/2023/);
    });
  });

  describe('Day Click Handler', () => {
    it('calls onDayClick with the correct date when a day is clicked', () => {
      const onDayClick = vi.fn();
      render(
        <Calendar
          events={[]}
          initialDate={makeDate(2024, 0, 1)}
          onDayClick={onDayClick}
        />
      );
      // Click on day 15
      const day15 = screen.getByText('15');
      fireEvent.click(day15.closest('[data-testid="calendar-day"]') ?? day15);
      expect(onDayClick).toHaveBeenCalledTimes(1);
      const calledDate: Date = onDayClick.mock.calls[0][0];
      expect(calledDate.getFullYear()).toBe(2024);
      expect(calledDate.getMonth()).toBe(0); // January
      expect(calledDate.getDate()).toBe(15);
    });

    it('does not throw when onDayClick is not provided', () => {
      render(<Calendar events={[]} initialDate={makeDate(2024, 0, 1)} />);
      const day10 = screen.getByText('10');
      expect(() => {
        fireEvent.click(day10.closest('[data-testid="calendar-day"]') ?? day10);
      }).not.toThrow();
    });
  });

  describe('Event Display', () => {
    it('renders event blocks on the correct day', () => {
      const events = [
        { id: 'evt-1', title: 'Board Meeting', date: makeDate(2024, 0, 15) },
      ];
      render(
        <Calendar
          events={events}
          initialDate={makeDate(2024, 0, 1)}
        />
      );
      expect(screen.getByText('Board Meeting')).toBeInTheDocument();
    });

    it('renders multiple events on the same day', () => {
      const events = [
        { id: 'evt-1', title: 'Morning Yoga', date: makeDate(2024, 0, 10) },
        { id: 'evt-2', title: 'Evening Run', date: makeDate(2024, 0, 10) },
      ];
      render(
        <Calendar
          events={events}
          initialDate={makeDate(2024, 0, 1)}
        />
      );
      expect(screen.getByText('Morning Yoga')).toBeInTheDocument();
      expect(screen.getByText('Evening Run')).toBeInTheDocument();
    });

    it('applies custom color to event blocks', () => {
      const events = [
        { id: 'evt-1', title: 'Custom Event', date: makeDate(2024, 0, 5), color: '#ff5733' },
      ];
      const { container } = render(
        <Calendar
          events={events}
          initialDate={makeDate(2024, 0, 1)}
        />
      );
      const eventEl = container.querySelector('[data-testid="calendar-event"]');
      expect(eventEl).not.toBeNull();
      const style = (eventEl as HTMLElement).style;
      expect(style.backgroundColor).toBeTruthy();
    });

    it('does not render events from other months', () => {
      const events = [
        { id: 'evt-1', title: 'February Event', date: makeDate(2024, 1, 5) }, // Feb
      ];
      render(
        <Calendar
          events={events}
          initialDate={makeDate(2024, 0, 1)} // Jan
        />
      );
      expect(screen.queryByText('February Event')).toBeNull();
    });

    it('calls onEventClick with the event id when an event block is clicked', () => {
      const onEventClick = vi.fn();
      const events = [
        { id: 'evt-1', title: 'Clickable Event', date: makeDate(2024, 0, 8) },
      ];
      render(
        <Calendar
          events={events}
          initialDate={makeDate(2024, 0, 1)}
          onEventClick={onEventClick}
        />
      );
      const eventEl = screen.getByText('Clickable Event');
      fireEvent.click(eventEl.closest('[data-testid="calendar-event"]') ?? eventEl);
      expect(onEventClick).toHaveBeenCalledWith('evt-1');
    });
  });

  describe('Selected Date', () => {
    it('highlights the selected date', () => {
      const { container } = render(
        <Calendar
          events={[]}
          initialDate={makeDate(2024, 0, 1)}
          selectedDate={makeDate(2024, 0, 20)}
        />
      );
      const selectedDay = container.querySelector('[data-testid="calendar-day"][data-selected="true"]');
      expect(selectedDay).not.toBeNull();
    });
  });

  describe('Highlighted Dates', () => {
    it('marks highlighted dates with a visual indicator', () => {
      const { container } = render(
        <Calendar
          events={[]}
          initialDate={makeDate(2024, 0, 1)}
          highlightedDates={[makeDate(2024, 0, 5), makeDate(2024, 0, 12)]}
        />
      );
      const highlighted = container.querySelectorAll('[data-highlighted="true"]');
      expect(highlighted.length).toBe(2);
    });
  });
});
