import { describe, it, expect, vi } from 'vitest';
import { buildRows, hasAnyDiff } from '../../src/components/admin/SnapshotHistory';
import type { SnapshotDiff } from '../../src/types';

const empty = (): SnapshotDiff => ({
  services: { added: [], removed: [], changed: [] },
  events: { added: [], removed: [], changed: [] },
  advisories: { added: [], removed: [], changed: [] },
  config: { changed: [] },
} as unknown as SnapshotDiff);

const act = () => ({ restore: vi.fn(async () => {}), remove: vi.fn(async () => {}), keep: vi.fn(async () => {}) });

describe('History "Different from now" rows', () => {
  it('is empty when nothing differs', () => {
    expect(hasAnyDiff(empty())).toBe(false);
    expect(buildRows(empty(), 45, act())).toEqual([]);
  });

  it('maps each kind of difference to a chip and an action', async () => {
    const d = empty() as unknown as Record<string, any>;
    d.services.changed.push({ from: { id: 1, name: 'Parking Garage', status: 'Outage', notes: '' }, to: { id: 1, name: 'Parking Garage', status: 'Operational', notes: '' } });
    d.events.removed.push({ id: 7, title: 'Lobby Renovation Update' });
    d.events.added.push({ id: 9, title: 'Thanksgiving Weekend Hours' });
    d.advisories.added.push({ id: 3, message: 'Water shut-off', active: true, markedForDeletion: true });
    d.config.changed.push({ field: 'themePreset', from: 'default', to: '77-hudson' });
    const a = act();
    const rows = buildRows(d as unknown as SnapshotDiff, 45, a);

    expect(rows.map(r => [r.title, r.state, r.action?.label])).toEqual([
      ['Parking Garage', 'different', 'Use this'],
      ['Lobby Renovation Update', 'only-then', 'Use this'],
      ['Thanksgiving Weekend Hours', 'not-then', 'Remove'],
      ['Water shut-off', 'removing', 'Keep'],
      ['Theme', 'different', undefined],
    ]);
    expect(rows[0].detail).toBe('Outage then · Operational now');

    await rows[1].action!.run();
    expect(a.restore).toHaveBeenCalledWith('events', 7);
    await rows[2].action!.run();
    expect(a.remove).toHaveBeenCalledWith('events', 9);
    await rows[3].action!.run();
    expect(a.keep).toHaveBeenCalledWith('advisories', 3);
  });
});
