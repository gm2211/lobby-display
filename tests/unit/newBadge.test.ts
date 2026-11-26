import { describe, it, expect } from 'vitest';
import { isEventNew } from '../../shared/newBadge';

const DAY = 86_400_000;
const now = Date.parse('2026-11-26T00:00:00Z');
const ago = (d: number) => new Date(now - d * DAY).toISOString();

describe('isEventNew', () => {
  it('defaults to 7 days', () => {
    expect(isEventNew({ firstPublishedAt: ago(6.9) }, null, now)).toBe(true);
    expect(isEventNew({ firstPublishedAt: ago(7) }, null, now)).toBe(false);
  });
  it('honours a custom number of days', () => {
    expect(isEventNew({ firstPublishedAt: ago(10) }, { newBadgeMode: 'days', newBadgeDays: 14 }, now)).toBe(true);
    expect(isEventNew({ firstPublishedAt: ago(2) }, { newBadgeMode: 'days', newBadgeDays: 1 }, now)).toBe(false);
  });
  it('untilNextUpdate follows the snapshot flag, regardless of age', () => {
    const cfg = { newBadgeMode: 'untilNextUpdate' };
    expect(isEventNew({ firstPublishedAt: ago(30), newInLastUpdate: true }, cfg, now)).toBe(true);
    expect(isEventNew({ firstPublishedAt: ago(0), newInLastUpdate: false }, cfg, now)).toBe(false);
  });
  it('off never shows', () => {
    expect(isEventNew({ firstPublishedAt: null }, { newBadgeMode: 'off' }, now)).toBe(false);
  });
  it('drafts (null) show as new in preview; legacy snapshot items (missing) never do', () => {
    expect(isEventNew({ firstPublishedAt: null }, null, now)).toBe(true);
    expect(isEventNew({}, null, now)).toBe(false);
  });
});
