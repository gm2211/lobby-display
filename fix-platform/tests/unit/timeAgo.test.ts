import { describe, it, expect, vi, afterEach } from 'vitest';
import { timeAgo } from '../../src/utils/timeAgo';

describe('timeAgo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function dateMinutesAgo(minutes: number): string {
    return new Date(Date.now() - minutes * 60000).toISOString();
  }

  it('returns "Just now" for less than 60 seconds ago', () => {
    const recent = new Date(Date.now() - 30000).toISOString(); // 30 seconds ago
    expect(timeAgo(recent)).toBe('Just now');
  });

  it('returns "1 min" for exactly 1 minute', () => {
    expect(timeAgo(dateMinutesAgo(1))).toBe('1 min');
  });

  it('returns "X mins" for 2-59 minutes', () => {
    expect(timeAgo(dateMinutesAgo(5))).toBe('5 mins');
    expect(timeAgo(dateMinutesAgo(30))).toBe('30 mins');
    expect(timeAgo(dateMinutesAgo(59))).toBe('59 mins');
  });

  it('returns "1 hour" for exactly 60 minutes', () => {
    expect(timeAgo(dateMinutesAgo(60))).toBe('1 hour');
  });

  it('returns "X hours" for 2-23 hours', () => {
    expect(timeAgo(dateMinutesAgo(120))).toBe('2 hours');
    expect(timeAgo(dateMinutesAgo(720))).toBe('12 hours');
  });

  it('returns "Yesterday" for 24 hours', () => {
    expect(timeAgo(dateMinutesAgo(60 * 24))).toBe('Yesterday');
  });

  it('returns "X days" for 2-6 days', () => {
    expect(timeAgo(dateMinutesAgo(60 * 48))).toBe('2 days');
    expect(timeAgo(dateMinutesAgo(60 * 24 * 6))).toBe('6 days');
  });

  it('returns formatted date for 7+ days', () => {
    const oldDate = new Date(Date.now() - 60000 * 60 * 24 * 10).toISOString();
    const result = timeAgo(oldDate);
    // Should be something like "Jan 28" — a short date
    expect(result).not.toContain('ago');
    expect(result).not.toBe('Just now');
  });

  it('handles ISO string input', () => {
    const iso = new Date(Date.now() - 5 * 60000).toISOString();
    expect(timeAgo(iso)).toBe('5 mins');
  });

  it('returns "Just now" for future dates (negative diff)', () => {
    const future = new Date(Date.now() + 60000).toISOString();
    // Math.floor of negative minutes = negative, which is < 1
    expect(timeAgo(future)).toBe('Just now');
  });
});
