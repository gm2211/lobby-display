/**
 * Unit tests for Recurrence Expansion Service
 *
 * Tests the expandRecurrence and getEventOccurrences functions that expand
 * recurring event patterns into individual date instances.
 *
 * No database or external libraries required — pure date math.
 */
import { describe, it, expect } from 'vitest';
import {
  expandRecurrence,
  getEventOccurrences,
  type RecurrenceRule,
  type EventLike,
  type EventOccurrence,
} from '../../server/services/recurrence.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a UTC date at midnight on the given YYYY-MM-DD string. */
function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Return a UTC date at the given ISO datetime string. */
function dt(iso: string): Date {
  return new Date(iso);
}

// ---------------------------------------------------------------------------
// expandRecurrence — DAILY
// ---------------------------------------------------------------------------
describe('expandRecurrence — DAILY', () => {
  it('returns daily dates within the range', () => {
    const rule: RecurrenceRule = { frequency: 'DAILY', interval: 1 };
    const startDate = d('2025-01-01');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2025-01-05');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    expect(dates).toHaveLength(5);
    expect(dates[0]).toEqual(d('2025-01-01'));
    expect(dates[4]).toEqual(d('2025-01-05'));
  });

  it('respects interval (every 2 days)', () => {
    const rule: RecurrenceRule = { frequency: 'DAILY', interval: 2 };
    const startDate = d('2025-01-01');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2025-01-10');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    // 1, 3, 5, 7, 9 = 5 occurrences
    expect(dates).toHaveLength(5);
    expect(dates[0]).toEqual(d('2025-01-01'));
    expect(dates[1]).toEqual(d('2025-01-03'));
    expect(dates[2]).toEqual(d('2025-01-05'));
  });

  it('respects count limit', () => {
    const rule: RecurrenceRule = { frequency: 'DAILY', interval: 1, count: 3 };
    const startDate = d('2025-01-01');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2025-12-31');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    expect(dates).toHaveLength(3);
    expect(dates[0]).toEqual(d('2025-01-01'));
    expect(dates[2]).toEqual(d('2025-01-03'));
  });

  it('respects until date', () => {
    const rule: RecurrenceRule = { frequency: 'DAILY', interval: 1, until: d('2025-01-04') };
    const startDate = d('2025-01-01');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2025-12-31');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    // 1, 2, 3, 4 = 4 occurrences (until is inclusive)
    expect(dates).toHaveLength(4);
    expect(dates[dates.length - 1]).toEqual(d('2025-01-04'));
  });

  it('excludes dates in excludeDates', () => {
    const rule: RecurrenceRule = {
      frequency: 'DAILY',
      interval: 1,
      excludeDates: [d('2025-01-03')],
    };
    const startDate = d('2025-01-01');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2025-01-05');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    // 1, 2, 4, 5 = 4 occurrences (3 excluded)
    expect(dates).toHaveLength(4);
    expect(dates.find((d) => d.getTime() === new Date('2025-01-03T00:00:00.000Z').getTime())).toBeUndefined();
  });

  it('returns empty array when range is before startDate', () => {
    const rule: RecurrenceRule = { frequency: 'DAILY', interval: 1 };
    const startDate = d('2025-06-01');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2025-01-31');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    expect(dates).toHaveLength(0);
  });

  it('returns empty array when rangeEnd is before rangeStart', () => {
    const rule: RecurrenceRule = { frequency: 'DAILY', interval: 1 };
    const startDate = d('2025-01-01');
    const rangeStart = d('2025-01-10');
    const rangeEnd = d('2025-01-05');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    expect(dates).toHaveLength(0);
  });

  it('returns dates sorted chronologically', () => {
    const rule: RecurrenceRule = { frequency: 'DAILY', interval: 1 };
    const startDate = d('2025-01-01');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2025-01-05');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i].getTime()).toBeGreaterThan(dates[i - 1].getTime());
    }
  });

  it('starts from startDate time (preserves time of day)', () => {
    const rule: RecurrenceRule = { frequency: 'DAILY', interval: 1 };
    const startDate = dt('2025-01-01T10:30:00.000Z');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2025-01-03');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    // Should preserve the 10:30 time of day
    expect(dates[0].getUTCHours()).toBe(10);
    expect(dates[0].getUTCMinutes()).toBe(30);
    expect(dates[1].getUTCHours()).toBe(10);
    expect(dates[1].getUTCMinutes()).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// expandRecurrence — WEEKLY
// ---------------------------------------------------------------------------
describe('expandRecurrence — WEEKLY', () => {
  it('returns weekly dates within the range', () => {
    const rule: RecurrenceRule = { frequency: 'WEEKLY', interval: 1 };
    // Wednesday, Jan 1 2025
    const startDate = d('2025-01-01');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2025-02-01');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    // Jan 1, 8, 15, 22, 29 = 5 occurrences
    expect(dates).toHaveLength(5);
    expect(dates[0]).toEqual(d('2025-01-01'));
    expect(dates[1]).toEqual(d('2025-01-08'));
    expect(dates[4]).toEqual(d('2025-01-29'));
  });

  it('supports daysOfWeek — Mon/Wed/Fri', () => {
    const rule: RecurrenceRule = {
      frequency: 'WEEKLY',
      interval: 1,
      daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
    };
    // Start on Monday Jan 6 2025
    const startDate = d('2025-01-06');
    const rangeStart = d('2025-01-06');
    const rangeEnd = d('2025-01-12');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    // Mon 6, Wed 8, Fri 10 = 3 occurrences (Sun 12 is the range end)
    expect(dates).toHaveLength(3);
    expect(dates[0]).toEqual(d('2025-01-06')); // Monday
    expect(dates[1]).toEqual(d('2025-01-08')); // Wednesday
    expect(dates[2]).toEqual(d('2025-01-10')); // Friday
  });

  it('supports daysOfWeek — every Tue and Thu for 2 weeks', () => {
    const rule: RecurrenceRule = {
      frequency: 'WEEKLY',
      interval: 1,
      daysOfWeek: [2, 4], // Tue, Thu
    };
    const startDate = d('2025-01-07'); // Tuesday
    const rangeStart = d('2025-01-07');
    const rangeEnd = d('2025-01-20');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    // Tue 7, Thu 9, Tue 14, Thu 16 = 4 occurrences
    expect(dates).toHaveLength(4);
    expect(dates[0]).toEqual(d('2025-01-07'));
    expect(dates[1]).toEqual(d('2025-01-09'));
    expect(dates[2]).toEqual(d('2025-01-14'));
    expect(dates[3]).toEqual(d('2025-01-16'));
  });

  it('respects count with daysOfWeek', () => {
    const rule: RecurrenceRule = {
      frequency: 'WEEKLY',
      interval: 1,
      daysOfWeek: [1, 3, 5],
      count: 4,
    };
    const startDate = d('2025-01-06');
    const rangeStart = d('2025-01-06');
    const rangeEnd = d('2025-12-31');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    expect(dates).toHaveLength(4);
    // Mon, Wed, Fri, Mon
    expect(dates[0]).toEqual(d('2025-01-06'));
    expect(dates[3]).toEqual(d('2025-01-13'));
  });
});

// ---------------------------------------------------------------------------
// expandRecurrence — BIWEEKLY
// ---------------------------------------------------------------------------
describe('expandRecurrence — BIWEEKLY', () => {
  it('returns every-2-weeks dates within range', () => {
    const rule: RecurrenceRule = { frequency: 'BIWEEKLY', interval: 1 };
    const startDate = d('2025-01-01');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2025-03-01');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    // Jan 1, 15, 29, Feb 12, 26 = 5 occurrences
    expect(dates).toHaveLength(5);
    expect(dates[0]).toEqual(d('2025-01-01'));
    expect(dates[1]).toEqual(d('2025-01-15'));
    expect(dates[2]).toEqual(d('2025-01-29'));
    expect(dates[3]).toEqual(d('2025-02-12'));
    expect(dates[4]).toEqual(d('2025-02-26'));
  });

  it('supports daysOfWeek for biweekly', () => {
    const rule: RecurrenceRule = {
      frequency: 'BIWEEKLY',
      interval: 1,
      daysOfWeek: [1, 5], // Mon, Fri
    };
    const startDate = d('2025-01-06'); // Monday
    const rangeStart = d('2025-01-06');
    const rangeEnd = d('2025-01-31');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    // Week 1 (Jan 6): Mon 6, Fri 10
    // Week 3 (Jan 20): Mon 20, Fri 24
    expect(dates).toHaveLength(4);
    expect(dates[0]).toEqual(d('2025-01-06'));
    expect(dates[1]).toEqual(d('2025-01-10'));
    expect(dates[2]).toEqual(d('2025-01-20'));
    expect(dates[3]).toEqual(d('2025-01-24'));
  });
});

// ---------------------------------------------------------------------------
// expandRecurrence — MONTHLY
// ---------------------------------------------------------------------------
describe('expandRecurrence — MONTHLY', () => {
  it('returns monthly dates on same day-of-month', () => {
    const rule: RecurrenceRule = { frequency: 'MONTHLY', interval: 1 };
    const startDate = d('2025-01-15');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2025-06-30');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    // Jan 15, Feb 15, Mar 15, Apr 15, May 15, Jun 15 = 6 occurrences
    expect(dates).toHaveLength(6);
    expect(dates[0]).toEqual(d('2025-01-15'));
    expect(dates[1]).toEqual(d('2025-02-15'));
    expect(dates[5]).toEqual(d('2025-06-15'));
  });

  it('respects interval (every 3 months)', () => {
    const rule: RecurrenceRule = { frequency: 'MONTHLY', interval: 3 };
    const startDate = d('2025-01-01');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2025-12-31');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    // Jan, Apr, Jul, Oct = 4 occurrences
    expect(dates).toHaveLength(4);
    expect(dates[0]).toEqual(d('2025-01-01'));
    expect(dates[1]).toEqual(d('2025-04-01'));
    expect(dates[2]).toEqual(d('2025-07-01'));
    expect(dates[3]).toEqual(d('2025-10-01'));
  });

  it('respects count limit', () => {
    const rule: RecurrenceRule = { frequency: 'MONTHLY', interval: 1, count: 3 };
    const startDate = d('2025-01-01');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2030-12-31');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    expect(dates).toHaveLength(3);
    expect(dates[2]).toEqual(d('2025-03-01'));
  });
});

// ---------------------------------------------------------------------------
// expandRecurrence — YEARLY
// ---------------------------------------------------------------------------
describe('expandRecurrence — YEARLY', () => {
  it('returns yearly dates on same month/day', () => {
    const rule: RecurrenceRule = { frequency: 'YEARLY', interval: 1 };
    const startDate = d('2025-03-15');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2028-12-31');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    // Mar 15 of 2025, 2026, 2027, 2028 = 4 occurrences
    expect(dates).toHaveLength(4);
    expect(dates[0]).toEqual(d('2025-03-15'));
    expect(dates[1]).toEqual(d('2026-03-15'));
    expect(dates[3]).toEqual(d('2028-03-15'));
  });

  it('respects count limit', () => {
    const rule: RecurrenceRule = { frequency: 'YEARLY', interval: 1, count: 2 };
    const startDate = d('2025-06-01');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2030-12-31');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    expect(dates).toHaveLength(2);
    expect(dates[0]).toEqual(d('2025-06-01'));
    expect(dates[1]).toEqual(d('2026-06-01'));
  });

  it('respects until date', () => {
    const rule: RecurrenceRule = { frequency: 'YEARLY', interval: 1, until: d('2026-12-31') };
    const startDate = d('2025-01-01');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2030-12-31');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    expect(dates).toHaveLength(2);
    expect(dates[0]).toEqual(d('2025-01-01'));
    expect(dates[1]).toEqual(d('2026-01-01'));
  });
});

// ---------------------------------------------------------------------------
// expandRecurrence — excludeDates
// ---------------------------------------------------------------------------
describe('expandRecurrence — excludeDates', () => {
  it('excludes multiple specific dates', () => {
    const rule: RecurrenceRule = {
      frequency: 'DAILY',
      interval: 1,
      excludeDates: [d('2025-01-02'), d('2025-01-04')],
    };
    const startDate = d('2025-01-01');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2025-01-05');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    // 1, 3, 5 = 3 occurrences
    expect(dates).toHaveLength(3);
    expect(dates[0]).toEqual(d('2025-01-01'));
    expect(dates[1]).toEqual(d('2025-01-03'));
    expect(dates[2]).toEqual(d('2025-01-05'));
  });

  it('excludeDates with time components matches by date only', () => {
    const rule: RecurrenceRule = {
      frequency: 'DAILY',
      interval: 1,
      // exclude date with a time component — should still match by date
      excludeDates: [dt('2025-01-03T15:00:00.000Z')],
    };
    const startDate = dt('2025-01-01T10:00:00.000Z');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2025-01-05');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    expect(dates).toHaveLength(4);
    expect(dates.some(d => d.getUTCDate() === 3 && d.getUTCMonth() === 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getEventOccurrences — non-recurring
// ---------------------------------------------------------------------------
describe('getEventOccurrences — non-recurring events', () => {
  const rangeStart = d('2025-01-01');
  const rangeEnd = d('2025-12-31');

  it('returns the event itself for non-recurring events', () => {
    const event: EventLike = {
      id: 'event-1',
      startTime: dt('2025-06-01T18:00:00.000Z'),
      endTime: dt('2025-06-01T20:00:00.000Z'),
      isRecurring: false,
      recurrenceRule: null,
    };

    const occurrences = getEventOccurrences(event, rangeStart, rangeEnd);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].originalEventId).toBe('event-1');
    expect(occurrences[0].startTime).toEqual(event.startTime);
    expect(occurrences[0].endTime).toEqual(event.endTime);
    expect(occurrences[0].isRecurrence).toBe(false);
  });

  it('returns empty when non-recurring event is outside range', () => {
    const event: EventLike = {
      id: 'event-2',
      startTime: dt('2024-01-01T10:00:00.000Z'),
      endTime: dt('2024-01-01T12:00:00.000Z'),
      isRecurring: false,
      recurrenceRule: null,
    };

    const occurrences = getEventOccurrences(event, rangeStart, rangeEnd);
    expect(occurrences).toHaveLength(0);
  });

  it('includes event when startTime equals rangeStart', () => {
    const event: EventLike = {
      id: 'event-3',
      startTime: rangeStart,
      endTime: dt('2025-01-01T02:00:00.000Z'),
      isRecurring: false,
      recurrenceRule: null,
    };

    const occurrences = getEventOccurrences(event, rangeStart, rangeEnd);
    expect(occurrences).toHaveLength(1);
  });

  it('treats event without recurrenceRule as non-recurring', () => {
    const event: EventLike = {
      id: 'event-4',
      startTime: dt('2025-03-01T10:00:00.000Z'),
      endTime: dt('2025-03-01T11:00:00.000Z'),
      isRecurring: true, // isRecurring=true but no rule
      recurrenceRule: null,
    };

    const occurrences = getEventOccurrences(event, rangeStart, rangeEnd);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].isRecurrence).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getEventOccurrences — recurring
// ---------------------------------------------------------------------------
describe('getEventOccurrences — recurring events', () => {
  const rangeStart = d('2025-01-01');
  const rangeEnd = d('2025-01-31');

  it('expands recurring event into multiple occurrences', () => {
    const event: EventLike = {
      id: 'event-recurring-1',
      startTime: dt('2025-01-06T18:00:00.000Z'), // Monday
      endTime: dt('2025-01-06T20:00:00.000Z'),
      isRecurring: true,
      recurrenceRule: JSON.stringify({ frequency: 'WEEKLY', interval: 1 }),
    };

    const occurrences = getEventOccurrences(event, rangeStart, rangeEnd);
    // Mondays in Jan: 6, 13, 20, 27 = 4 occurrences
    expect(occurrences).toHaveLength(4);
    expect(occurrences.every((o) => o.isRecurrence)).toBe(true);
    expect(occurrences.every((o) => o.originalEventId === 'event-recurring-1')).toBe(true);
  });

  it('each occurrence has correct startTime and endTime', () => {
    const event: EventLike = {
      id: 'event-recurring-2',
      startTime: dt('2025-01-06T14:00:00.000Z'), // Monday 2pm UTC
      endTime: dt('2025-01-06T15:00:00.000Z'), // 1-hour event
      isRecurring: true,
      recurrenceRule: JSON.stringify({ frequency: 'WEEKLY', interval: 1 }),
    };

    const occurrences = getEventOccurrences(event, rangeStart, rangeEnd);
    // Each occurrence should be exactly 1 hour
    for (const o of occurrences) {
      const durationMs = o.endTime!.getTime() - o.startTime.getTime();
      expect(durationMs).toBe(60 * 60 * 1000);
    }
  });

  it('occurrences are sorted chronologically', () => {
    const event: EventLike = {
      id: 'event-recurring-3',
      startTime: dt('2025-01-01T10:00:00.000Z'),
      endTime: dt('2025-01-01T11:00:00.000Z'),
      isRecurring: true,
      recurrenceRule: JSON.stringify({ frequency: 'DAILY', interval: 1 }),
    };

    const occurrences = getEventOccurrences(event, rangeStart, rangeEnd);
    for (let i = 1; i < occurrences.length; i++) {
      expect(occurrences[i].startTime.getTime()).toBeGreaterThan(
        occurrences[i - 1].startTime.getTime(),
      );
    }
  });

  it('handles excludeDates in recurrenceRule', () => {
    const excludeDates = [d('2025-01-08').toISOString(), d('2025-01-15').toISOString()];
    const event: EventLike = {
      id: 'event-recurring-4',
      startTime: dt('2025-01-06T10:00:00.000Z'), // Monday
      endTime: dt('2025-01-06T11:00:00.000Z'),
      isRecurring: true,
      recurrenceRule: JSON.stringify({
        frequency: 'WEEKLY',
        interval: 1,
        excludeDates,
      }),
    };

    const occurrences = getEventOccurrences(event, rangeStart, rangeEnd);
    // Mondays: 6, 13, 20, 27 minus 8 (Wed, not Monday anyway) and 15 (Wednesday)
    // Actually excludeDates are Jan 8 (Wed) and Jan 15 (Wed) which aren't Monday occurrences
    // So still 4 Mondays: 6, 13, 20, 27
    expect(occurrences.length).toBe(4);
  });

  it('handles excludeDates that do match occurrence dates', () => {
    const excludeDates = [d('2025-01-13').toISOString(), d('2025-01-27').toISOString()];
    const event: EventLike = {
      id: 'event-recurring-5',
      startTime: dt('2025-01-06T10:00:00.000Z'), // Monday
      endTime: dt('2025-01-06T11:00:00.000Z'),
      isRecurring: true,
      recurrenceRule: JSON.stringify({
        frequency: 'WEEKLY',
        interval: 1,
        excludeDates,
      }),
    };

    const occurrences = getEventOccurrences(event, rangeStart, rangeEnd);
    // Mondays: 6, 13, 20, 27 minus 13 and 27 = 2 occurrences
    expect(occurrences.length).toBe(2);
    expect(occurrences[0].startTime.getUTCDate()).toBe(6);
    expect(occurrences[1].startTime.getUTCDate()).toBe(20);
  });

  it('handles event with no endTime (endTime is null)', () => {
    const event: EventLike = {
      id: 'event-no-end',
      startTime: dt('2025-01-01T10:00:00.000Z'),
      endTime: null,
      isRecurring: true,
      recurrenceRule: JSON.stringify({ frequency: 'WEEKLY', interval: 1 }),
    };

    const occurrences = getEventOccurrences(event, rangeStart, rangeEnd);
    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences.every((o) => o.endTime === null)).toBe(true);
  });

  it('handles recurrenceRule with count', () => {
    const event: EventLike = {
      id: 'event-with-count',
      startTime: dt('2025-01-01T10:00:00.000Z'),
      endTime: dt('2025-01-01T11:00:00.000Z'),
      isRecurring: true,
      recurrenceRule: JSON.stringify({ frequency: 'DAILY', interval: 1, count: 5 }),
    };

    const occurrences = getEventOccurrences(event, rangeStart, rangeEnd);
    expect(occurrences).toHaveLength(5);
  });

  it('handles malformed recurrenceRule gracefully (returns single occurrence)', () => {
    const event: EventLike = {
      id: 'event-bad-rule',
      startTime: dt('2025-01-15T10:00:00.000Z'),
      endTime: dt('2025-01-15T11:00:00.000Z'),
      isRecurring: true,
      recurrenceRule: 'not-valid-json',
    };

    const occurrences = getEventOccurrences(event, rangeStart, rangeEnd);
    // Fallback: treat as single non-recurring occurrence
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].isRecurrence).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('expandRecurrence — edge cases', () => {
  it('handles default interval of 1 when not specified', () => {
    // interval can be omitted and defaults to 1
    const rule: RecurrenceRule = { frequency: 'DAILY' };
    const startDate = d('2025-01-01');
    const rangeStart = d('2025-01-01');
    const rangeEnd = d('2025-01-03');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    expect(dates).toHaveLength(3);
  });

  it('does not generate more than a reasonable safety limit of occurrences', () => {
    // Even without a count/until, should not produce infinite loop
    const rule: RecurrenceRule = { frequency: 'DAILY', interval: 1 };
    const startDate = d('2025-01-01');
    const rangeStart = d('2025-01-01');
    // 5-year range
    const rangeEnd = d('2030-01-01');

    const dates = expandRecurrence(rule, startDate, rangeStart, rangeEnd);
    // Should be bounded by the range (about 1826 days in 5 years)
    expect(dates.length).toBeLessThanOrEqual(1827);
    expect(dates.length).toBeGreaterThan(1800);
  });
});
