import { describe, it, expect } from 'vitest';
import { computeDraftChanges, countBySection, humanizeField } from '../../src/utils/draftChanges';
import type { Service, Event, Advisory, BuildingConfig } from '../../src/types';

const svc = (id: number, extra: Partial<Service> = {}): Service =>
  ({ id, name: `S${id}`, status: 'Operational', notes: '', lastChecked: '', sortOrder: id, markedForDeletion: false, ...extra }) as Service;
const ev = (id: number, extra: Partial<Event> = {}): Event =>
  ({ id, title: `E${id}`, subtitle: '', details: [], imageUrl: '', sortOrder: id, markedForDeletion: false, ...extra }) as unknown as Event;
const cfg = (extra: Partial<BuildingConfig> = {}) => ({ id: 1, dashboardTitle: 'T', scrollSpeed: 30, ...extra }) as BuildingConfig;

const published = { services: [svc(1), svc(2)], events: [ev(1), ev(2)], advisories: [] as Advisory[], config: cfg() };

describe('computeDraftChanges', () => {
  it('returns nothing when draft matches published', () => {
    expect(computeDraftChanges(published, published)).toEqual([]);
  });

  it('lists edited, added, removing and config changes', () => {
    const current = {
      services: [svc(1, { status: 'Outage' }), svc(2)],
      events: [ev(1), ev(2, { markedForDeletion: true }), ev(3)],
      advisories: [],
      config: cfg({ scrollSpeed: 40 }),
    };
    const changes = computeDraftChanges(current, published);
    expect(changes.map(c => `${c.section}:${c.kind}:${c.id ?? c.label}`)).toEqual([
      'services:edited:1',
      'events:removing:2',
      'events:added:3',
      'config:edited:Scroll speed',
    ]);
    expect(countBySection(changes)).toEqual({ services: 1, events: 2, advisories: 0, config: 1 });
  });

  it('does not list deleting a never-published item', () => {
    const current = { ...published, events: [ev(1), ev(2), ev(9, { markedForDeletion: true })] };
    expect(computeDraftChanges(current, published)).toEqual([]);
  });

  it('detects a reorder of published items', () => {
    const current = { ...published, events: [ev(1, { sortOrder: 2 }), ev(2, { sortOrder: 1 })] };
    expect(computeDraftChanges(current, published).map(c => c.kind)).toEqual(['reordered']);
  });

  it('returns nothing before anything is published', () => {
    expect(computeDraftChanges(published, null)).toEqual([]);
  });
});

describe('humanizeField', () => {
  it('turns camelCase into a sentence', () => {
    expect(humanizeField('servicesScrollSpeed')).toBe('Services scroll speed');
  });
});
