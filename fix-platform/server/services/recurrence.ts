/**
 * Recurrence Expansion Service
 *
 * Expands recurring event patterns into individual date instances for
 * calendar display. No external RRULE libraries — pure date arithmetic.
 *
 * Supported recurrence frequencies:
 *   DAILY    — every N days
 *   WEEKLY   — every N weeks (optionally on specific daysOfWeek)
 *   BIWEEKLY — every 2 weeks (optionally on specific daysOfWeek)
 *   MONTHLY  — every N months on the same day-of-month
 *   YEARLY   — every N years on the same month/day
 *
 * Termination conditions (applied in order):
 *   1. count    — stop after N occurrences
 *   2. until    — stop after this date (inclusive)
 *   3. rangeEnd — stop at the query range boundary
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported recurrence patterns. */
export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';

/**
 * Recurrence rule stored in PlatformEvent.recurrenceRule as JSON.
 *
 * @property frequency   - How often the event repeats.
 * @property interval    - Every N periods (default: 1).
 * @property daysOfWeek  - For WEEKLY/BIWEEKLY: which days to include
 *                         (0=Sun, 1=Mon, …, 6=Sat). If omitted the event
 *                         repeats on the same day of week as startDate.
 * @property count       - Maximum number of occurrences.
 * @property until       - Last allowed occurrence date (inclusive). Can be a
 *                         Date or an ISO string (will be coerced).
 * @property excludeDates - Specific dates to skip (matched by calendar date,
 *                          not exact time). Can be Date objects or ISO strings.
 */
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval?: number;
  daysOfWeek?: number[]; // 0=Sun … 6=Sat
  count?: number;
  until?: Date | string;
  excludeDates?: (Date | string)[];
}

/**
 * A minimal event-like object understood by getEventOccurrences.
 * Mirrors relevant fields from PlatformEvent.
 */
export interface EventLike {
  id: string;
  startTime: Date;
  endTime: Date | null;
  isRecurring: boolean;
  recurrenceRule: string | null; // JSON-encoded RecurrenceRule
}

/** A single expanded occurrence of an event. */
export interface EventOccurrence {
  originalEventId: string;
  startTime: Date;
  endTime: Date | null;
  isRecurrence: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Normalise a value to a Date, accepting Date objects or ISO strings. */
function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

/**
 * Return the UTC year/month/day of a Date as a comparable number
 * (YYYYMMDD). Used for date-only comparisons (ignores time).
 */
function ymd(d: Date): number {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/**
 * Check whether a candidate date should be excluded based on the rule's
 * excludeDates list. Comparison is by calendar date only (UTC).
 */
function isExcluded(candidate: Date, excludeDates: (Date | string)[]): boolean {
  const candidateYmd = ymd(candidate);
  for (const ex of excludeDates) {
    const exDate = toDate(ex);
    if (exDate && ymd(exDate) === candidateYmd) {
      return true;
    }
  }
  return false;
}

/**
 * Add months to a UTC Date, returning a new Date.
 * Handles month-end clamping (e.g. Jan 31 + 1 month → Feb 28).
 */
function addMonthsUTC(base: Date, months: number): Date {
  const result = new Date(base);
  const targetMonth = result.getUTCMonth() + months;
  // Temporarily set day to 1 to avoid month overflow during month assignment
  result.setUTCDate(1);
  result.setUTCMonth(targetMonth);
  // Clamp day to the last valid day of the target month
  const maxDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(base.getUTCDate(), maxDay));
  return result;
}

/**
 * Add years to a UTC Date, returning a new Date.
 * Handles leap-year clamping (e.g. Feb 29 → Feb 28 on non-leap years).
 */
function addYearsUTC(base: Date, years: number): Date {
  return addMonthsUTC(base, years * 12);
}

// ---------------------------------------------------------------------------
// expandRecurrence
// ---------------------------------------------------------------------------

/**
 * Expand a recurrence rule into an array of occurrence start times that
 * fall within [rangeStart, rangeEnd] (both inclusive by calendar day).
 *
 * @param rule       - The recurrence rule to expand.
 * @param startDate  - The original event start time (defines the time-of-day
 *                     for all occurrences and the first occurrence date).
 * @param rangeStart - Beginning of the query window (inclusive).
 * @param rangeEnd   - End of the query window (inclusive).
 * @returns Sorted array of occurrence start times within the range.
 */
export function expandRecurrence(
  rule: RecurrenceRule,
  startDate: Date,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  if (rangeEnd < rangeStart) {
    return [];
  }

  const interval = rule.interval ?? 1;
  const untilDate = toDate(rule.until);
  const excludeDates = rule.excludeDates ?? [];

  // Normalize rangeEnd to end-of-day (23:59:59.999 UTC) so that occurrences
  // whose time-of-day is after rangeEnd midnight are still included when they
  // fall on the rangeEnd calendar date.
  const rangeEndNormalized = new Date(
    Date.UTC(
      rangeEnd.getUTCFullYear(),
      rangeEnd.getUTCMonth(),
      rangeEnd.getUTCDate(),
      23, 59, 59, 999,
    ),
  );

  const effectiveUntil = untilDate ?? rangeEndNormalized;

  const results: Date[] = [];

  // Safety cap — avoids runaway loops for extremely large ranges
  const MAX_ITERATIONS = 100_000;
  let iterations = 0;

  // -------------------------------------------------------------------------
  // DAILY
  // -------------------------------------------------------------------------
  if (rule.frequency === 'DAILY') {
    let cursor = new Date(startDate);

    while (cursor <= rangeEndNormalized && cursor <= effectiveUntil) {
      if (++iterations > MAX_ITERATIONS) break;

      if (cursor >= rangeStart && !isExcluded(cursor, excludeDates)) {
        results.push(new Date(cursor));
      }

      if (rule.count != null && results.length >= rule.count) break;

      cursor = new Date(cursor.getTime() + interval * 24 * 60 * 60 * 1000);
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // WEEKLY / BIWEEKLY
  // -------------------------------------------------------------------------
  if (rule.frequency === 'WEEKLY' || rule.frequency === 'BIWEEKLY') {
    const weekIntervalMs =
      (rule.frequency === 'BIWEEKLY' ? 2 * interval : interval) * 7 * 24 * 60 * 60 * 1000;

    if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
      // Sort the days so we iterate them in order
      const sortedDays = [...rule.daysOfWeek].sort((a, b) => a - b);

      // Find the Monday (or Sunday) of the week containing startDate so we
      // can anchor the weekly intervals correctly.
      // We'll step through each week-anchor and emit the requested days.
      const startDow = startDate.getUTCDay(); // 0=Sun … 6=Sat
      // Find which "week block" startDate belongs to: offset from startDate
      // to the first day in sortedDays that is >= startDow (or wrap around).
      // We anchor week blocks to startDate itself — advance by weekIntervalMs.

      // Find the start of the week (Sunday) of startDate
      const startOfWeekMs =
        startDate.getTime() - startDow * 24 * 60 * 60 * 1000;
      // Zero out h/m/s/ms within the day
      const startOfWeekDay = new Date(startOfWeekMs);
      startOfWeekDay.setUTCHours(0, 0, 0, 0);

      // Time-of-day offset from the start-of-day
      const timeOfDayMs =
        startDate.getUTCHours() * 3_600_000 +
        startDate.getUTCMinutes() * 60_000 +
        startDate.getUTCSeconds() * 1_000 +
        startDate.getUTCMilliseconds();

      // We need to figure out: starting from startDate, which week blocks
      // are "active"?  Week blocks begin at the week containing startDate,
      // then advance by weekIntervalMs each time.
      let weekAnchor = startOfWeekDay;

      // Bound the iteration to avoid infinite loops
      const latestBound =
        untilDate != null
          ? new Date(Math.min(rangeEndNormalized.getTime(), untilDate.getTime()))
          : rangeEndNormalized;

      while (weekAnchor.getTime() <= latestBound.getTime() + 7 * 24 * 60 * 60 * 1000) {
        if (++iterations > MAX_ITERATIONS) break;

        for (const dow of sortedDays) {
          // Build the actual occurrence date for this day-of-week in this week
          const occurrenceMs =
            weekAnchor.getTime() + dow * 24 * 60 * 60 * 1000 + timeOfDayMs;
          const occurrence = new Date(occurrenceMs);

          // Must be on or after startDate
          if (occurrence < startDate) continue;
          // Must be within the effective range
          if (occurrence > latestBound) continue;
          if (occurrence > rangeEndNormalized) continue;
          if (occurrence < rangeStart) continue;
          if (isExcluded(occurrence, excludeDates)) continue;

          results.push(occurrence);

          if (rule.count != null && results.length >= rule.count) break;
        }

        if (rule.count != null && results.length >= rule.count) break;

        weekAnchor = new Date(weekAnchor.getTime() + weekIntervalMs);
      }
    } else {
      // No daysOfWeek — repeat on the same day of week as startDate
      let cursor = new Date(startDate);

      while (cursor <= rangeEndNormalized && cursor <= effectiveUntil) {
        if (++iterations > MAX_ITERATIONS) break;

        if (cursor >= rangeStart && !isExcluded(cursor, excludeDates)) {
          results.push(new Date(cursor));
        }

        if (rule.count != null && results.length >= rule.count) break;

        cursor = new Date(cursor.getTime() + weekIntervalMs);
      }
    }

    // Sort chronologically (day-of-week emissions may already be sorted,
    // but guarantee it)
    results.sort((a, b) => a.getTime() - b.getTime());
    return results;
  }

  // -------------------------------------------------------------------------
  // MONTHLY
  // -------------------------------------------------------------------------
  if (rule.frequency === 'MONTHLY') {
    let cursor = new Date(startDate);

    while (cursor <= rangeEndNormalized && cursor <= effectiveUntil) {
      if (++iterations > MAX_ITERATIONS) break;

      if (cursor >= rangeStart && !isExcluded(cursor, excludeDates)) {
        results.push(new Date(cursor));
      }

      if (rule.count != null && results.length >= rule.count) break;

      cursor = addMonthsUTC(cursor, interval);
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // YEARLY
  // -------------------------------------------------------------------------
  if (rule.frequency === 'YEARLY') {
    let cursor = new Date(startDate);

    while (cursor <= rangeEndNormalized && cursor <= effectiveUntil) {
      if (++iterations > MAX_ITERATIONS) break;

      if (cursor >= rangeStart && !isExcluded(cursor, excludeDates)) {
        results.push(new Date(cursor));
      }

      if (rule.count != null && results.length >= rule.count) break;

      cursor = addYearsUTC(cursor, interval);
    }

    return results;
  }

  return results;
}

// ---------------------------------------------------------------------------
// getEventOccurrences
// ---------------------------------------------------------------------------

/**
 * Given an event, return its occurrences within [rangeStart, rangeEnd].
 *
 * For non-recurring events (or events with missing/invalid recurrenceRule):
 *   - Returns a single occurrence if the event's startTime is within range.
 *   - Returns an empty array otherwise.
 *
 * For recurring events:
 *   - Parses recurrenceRule as JSON.
 *   - Calls expandRecurrence to get all start times in range.
 *   - Returns one EventOccurrence per expanded date, preserving the
 *     original event's duration (endTime - startTime).
 *   - All occurrences are marked with isRecurrence: true.
 *
 * Results are always sorted chronologically.
 *
 * @param event      - The event to expand.
 * @param rangeStart - Beginning of the query window (inclusive).
 * @param rangeEnd   - End of the query window (inclusive).
 */
export function getEventOccurrences(
  event: EventLike,
  rangeStart: Date,
  rangeEnd: Date,
): EventOccurrence[] {
  const duration =
    event.endTime != null
      ? event.endTime.getTime() - event.startTime.getTime()
      : null;

  // -------------------------------------------------------------------------
  // Non-recurring path
  // -------------------------------------------------------------------------
  if (!event.isRecurring || event.recurrenceRule == null) {
    if (event.startTime >= rangeStart && event.startTime <= rangeEnd) {
      return [
        {
          originalEventId: event.id,
          startTime: event.startTime,
          endTime: event.endTime,
          isRecurrence: false,
        },
      ];
    }
    return [];
  }

  // -------------------------------------------------------------------------
  // Recurring path — parse rule
  // -------------------------------------------------------------------------
  let rule: RecurrenceRule;
  try {
    rule = JSON.parse(event.recurrenceRule) as RecurrenceRule;
  } catch {
    // Malformed JSON — fall back to treating as single non-recurring event
    if (event.startTime >= rangeStart && event.startTime <= rangeEnd) {
      return [
        {
          originalEventId: event.id,
          startTime: event.startTime,
          endTime: event.endTime,
          isRecurrence: false,
        },
      ];
    }
    return [];
  }

  // Parse any date-string fields inside the rule (until, excludeDates)
  if (rule.until != null) {
    rule.until = toDate(rule.until) ?? undefined;
  }
  if (rule.excludeDates) {
    rule.excludeDates = rule.excludeDates.map((d) => toDate(d) ?? d);
  }

  const startTimes = expandRecurrence(rule, event.startTime, rangeStart, rangeEnd);

  const occurrences: EventOccurrence[] = startTimes.map((startTime) => ({
    originalEventId: event.id,
    startTime,
    endTime: duration != null ? new Date(startTime.getTime() + duration) : null,
    isRecurrence: true,
  }));

  // Guaranteed sorted because expandRecurrence returns sorted results,
  // but sort again defensively.
  occurrences.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  return occurrences;
}
