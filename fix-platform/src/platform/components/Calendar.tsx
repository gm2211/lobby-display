/**
 * Calendar component using CSS Grid layout.
 *
 * A reusable monthly calendar showing events/bookings as colored blocks.
 * Supports month navigation, day click, event click, selected date,
 * and highlighted dates.
 *
 * Usage:
 *   <Calendar
 *     events={[{ id: 'e1', title: 'Board Meeting', date: new Date(2024, 0, 15) }]}
 *     onDayClick={(date) => console.log(date)}
 *     onEventClick={(id) => console.log(id)}
 *     selectedDate={new Date(2024, 0, 20)}
 *     highlightedDates={[new Date(2024, 0, 5)]}
 *   />
 */

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  /** Optional background color for the event block. Defaults to #1a5c5a. */
  color?: string;
}

export interface CalendarProps {
  /** List of events to display on the calendar. */
  events: CalendarEvent[];
  /** Called when a day cell is clicked. */
  onDayClick?: (date: Date) => void;
  /** Called when an event block is clicked. */
  onEventClick?: (eventId: string) => void;
  /** The currently selected date (renders with highlighted border). */
  selectedDate?: Date;
  /** Additional dates to mark with a dot indicator. */
  highlightedDates?: Date[];
  /**
   * Initial date to display (useful for testing and controlled rendering).
   * If omitted, defaults to the current date.
   */
  initialDate?: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const DEFAULT_EVENT_COLOR = '#1a5c5a';

/** Returns the number of days in a given month (0-indexed). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Returns 0 (Sun) – 6 (Sat) for the first day of the given month. */
function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/** Returns true if two dates fall on the same calendar day. */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Calendar({
  events,
  onDayClick,
  onEventClick,
  selectedDate,
  highlightedDates = [],
  initialDate,
}: CalendarProps) {
  const today = initialDate ?? new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  // ---- Navigation ----

  function handlePrev() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function handleNext() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  // ---- Grid computation ----

  const numDays = daysInMonth(year, month);
  const startOffset = firstDayOfMonth(year, month); // 0 = Sun

  // Build flat array: nulls for empty leading cells, then day numbers 1..N
  const gridCells: (number | null)[] = [
    ...Array<null>(startOffset).fill(null),
    ...Array.from({ length: numDays }, (_, i) => i + 1),
  ];

  // Pad trailing cells so we have complete 7-column rows
  while (gridCells.length % 7 !== 0) {
    gridCells.push(null);
  }

  // Filter events for the current month/year only
  const visibleEvents = events.filter(
    (e) => e.date.getFullYear() === year && e.date.getMonth() === month
  );

  // Build a map: day-of-month → CalendarEvent[]
  const eventsByDay = new Map<number, CalendarEvent[]>();
  for (const evt of visibleEvents) {
    const d = evt.date.getDate();
    if (!eventsByDay.has(d)) eventsByDay.set(d, []);
    eventsByDay.get(d)!.push(evt);
  }

  // ---- Render ----

  return (
    <div style={styles.wrapper}>
      {/* Header row: prev button, month/year, next button */}
      <div style={styles.header}>
        <button
          aria-label="prev month"
          onClick={handlePrev}
          style={styles.navButton}
        >
          ‹ Prev
        </button>

        <h2 style={styles.monthYear}>
          {MONTH_NAMES[month]} {year}
        </h2>

        <button
          aria-label="next month"
          onClick={handleNext}
          style={styles.navButton}
        >
          Next ›
        </button>
      </div>

      {/* Day-of-week column headers */}
      <div
        data-testid="calendar-grid"
        style={{
          ...styles.grid,
          gridTemplateColumns: 'repeat(7, 1fr)',
        }}
      >
        {DAY_NAMES.map((name) => (
          <div key={name} style={styles.dayHeader}>
            {name}
          </div>
        ))}

        {/* Day cells */}
        {gridCells.map((day, idx) => {
          if (day === null) {
            // Empty cell outside the current month
            return <div key={`empty-${idx}`} style={styles.emptyCell} />;
          }

          const cellDate = new Date(year, month, day);
          const isSelected = selectedDate ? isSameDay(cellDate, selectedDate) : false;
          const isHighlighted = highlightedDates.some((d) => isSameDay(d, cellDate));
          const dayEvents = eventsByDay.get(day) ?? [];

          return (
            <div
              key={`day-${day}`}
              data-testid="calendar-day"
              data-selected={isSelected ? 'true' : 'false'}
              data-highlighted={isHighlighted ? 'true' : 'false'}
              onClick={() => onDayClick?.(cellDate)}
              style={{
                ...styles.dayCell,
                ...(isSelected ? styles.dayCellSelected : {}),
                ...(isHighlighted ? styles.dayCellHighlighted : {}),
                cursor: onDayClick ? 'pointer' : 'default',
              }}
            >
              <span style={styles.dayNumber}>{day}</span>

              {/* Event blocks */}
              <div style={styles.eventsContainer}>
                {dayEvents.map((evt) => (
                  <div
                    key={evt.id}
                    data-testid="calendar-event"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick?.(evt.id);
                    }}
                    style={{
                      ...styles.eventBlock,
                      backgroundColor: evt.color ?? DEFAULT_EVENT_COLOR,
                    }}
                    title={evt.title}
                  >
                    {evt.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (inline, consistent with existing project patterns)
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    fontFamily: 'inherit',
    background: '#ffffff',
    borderRadius: '10px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#e0e0e0',
    overflow: 'hidden',
    width: '100%',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    background: 'linear-gradient(135deg, #1a5c5a 0%, #0f3d3b 100%)',
  },

  monthYear: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
  },

  navButton: {
    background: 'rgba(255,255,255,0.15)',
    color: '#ffffff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: '6px',
    padding: '6px 14px',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 600,
  },

  // The actual CSS Grid container (7 columns)
  grid: {
    display: 'grid',
    // gridTemplateColumns is set inline so tests can detect it
  },

  dayHeader: {
    padding: '8px 0',
    textAlign: 'center' as const,
    fontSize: '11px',
    fontWeight: 700,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    background: '#f9f9f9',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: '#eee',
  },

  emptyCell: {
    minHeight: '80px',
    background: '#fafafa',
    borderWidth: '0 1px 1px 0',
    borderStyle: 'solid',
    borderColor: '#eee',
  },

  dayCell: {
    minHeight: '80px',
    padding: '6px',
    background: '#ffffff',
    borderWidth: '0 1px 1px 0',
    borderStyle: 'solid',
    borderColor: '#eee',
    position: 'relative' as const,
    overflow: 'hidden',
    verticalAlign: 'top',
  },

  dayCellSelected: {
    background: '#e8f5f5',
    borderWidth: '0 1px 1px 0',
    borderStyle: 'solid',
    borderColor: '#1a5c5a',
    outlineWidth: '2px',
    outlineStyle: 'solid',
    outlineColor: '#1a5c5a',
    outlineOffset: '-2px',
  },

  dayCellHighlighted: {
    background: '#fff8e1',
  },

  dayNumber: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#444444',
    marginBottom: '4px',
  },

  eventsContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },

  eventBlock: {
    display: 'block',
    padding: '2px 5px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#ffffff',
    overflow: 'hidden',
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis',
    cursor: 'pointer',
    lineHeight: '1.4',
  },
};
