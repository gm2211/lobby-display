import { describe, it, expect } from 'vitest';
import { toSnapshotData, assertStagingUrl } from '../../scripts/sync-prod-to-staging';

const PROD = 'https://prod.example.com';

describe('sync-prod-to-staging', () => {
  it('converts /api/snapshots/latest output back to snapshot sections', () => {
    const data = toSnapshotData(
      {
        services: [
          { id: 1, name: 'Gym', status: 'Operational', notes: '', sortOrder: 0, lastChecked: '2026-01-01T00:00:00.000Z' },
          { id: 2, name: 'Old', status: 'Outage', sortOrder: 1, lastChecked: '2026-01-01T00:00:00.000Z', markedForDeletion: true },
        ],
        events: [
          { id: 5, title: 'Yoga', subtitle: '', details: ['a'], imageUrl: '/images/uploads/x.jpg', accentColor: '', sortOrder: 0 },
          { id: 6, title: 'Bagels', subtitle: '', details: [], imageUrl: '/images/bagels.jpg', accentColor: '', sortOrder: 1 },
        ],
        advisories: [{ id: 9, message: 'Hi', active: true }],
        config: {
          dashboardTitle: '77 Hudson', logoUrl: '/images/uploads/logo.png',
          customLogos: '["/images/uploads/a.png","https://cdn/b.png"]',
          scrollSpeed: 31, tickerSpeed: 26, servicesScrollSpeed: 9,
          servicesFontSize: 18, notesFontSize: 17, notesFontWeight: 600,
        },
      },
      PROD,
    );
    expect(data.services?.items?.map(s => s.id)).toEqual([1]);
    expect(data.services?.scrollSpeed).toBe(9);
    expect(data.events?.scrollSpeed).toBe(31);
    expect(data.advisories?.tickerSpeed).toBe(26);
    expect(data.events?.items?.[0].imageUrl).toBe(`${PROD}/images/uploads/x.jpg`);
    expect(data.events?.items?.[1].imageUrl).toBe('/images/bagels.jpg');
    expect(data.config?.logoUrl).toBe(`${PROD}/images/uploads/logo.png`);
    expect(JSON.parse(data.config!.customLogos!)).toEqual([`${PROD}/images/uploads/a.png`, 'https://cdn/b.png']);
  });

  it('only allows writing to a staging database', () => {
    expect(() => assertStagingUrl('postgresql://u:p@host/lobby_staging')).not.toThrow();
    expect(() => assertStagingUrl('postgresql://u:p@host/lobby')).toThrow(/Refusing/);
    expect(() => assertStagingUrl('not a url')).toThrow();
  });
});
