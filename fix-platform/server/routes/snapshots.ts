/**
 * Snapshots API Routes - Draft/Publish workflow and version history.
 *
 * PURPOSE:
 * Manages the publish workflow where changes are staged as drafts,
 * then published atomically. Supports version history with restore.
 *
 * KEY CONCEPTS:
 * - Draft: Current database state (items may have markedForDeletion: true)
 * - Published: Last published snapshot (clean state, no marked items)
 * - Publish: Hard-deletes marked items, creates new snapshot version
 * - Discard: Restores draft to match last published snapshot
 *
 * DATA FORMAT:
 * Snapshots use section-based format:
 * ```
 * {
 *   config: { dashboardTitle },
 *   services: { items: [...], scrollSpeed: 8 },
 *   events: { items: [...], scrollSpeed: 30 },
 *   advisories: { items: [...], tickerSpeed: 25 }
 * }
 * ```
 *
 * ROUTES:
 * - GET /api/snapshots - List all snapshots
 * - GET /api/snapshots/latest - Get latest published state
 * - GET /api/snapshots/draft-status - Compare draft vs published
 * - GET /api/snapshots/:version - Get specific snapshot
 * - GET /api/snapshots/:v1/diff/:v2 - Get diff between versions
 * - POST /api/snapshots - Publish (create new version)
 * - POST /api/snapshots/discard - Discard draft changes
 * - POST /api/snapshots/restore/:version - Full restore to version
 * - POST /api/snapshots/restore-items - Selective item restore
 * - DELETE /api/snapshots/:version - Delete specific snapshot
 * - DELETE /api/snapshots - Purge all history except latest
 *
 * GOTCHAS / AI AGENT NOTES:
 * - markedForDeletion is used for soft-delete (hard-deleted on publish)
 * - Events.details is JSON string in DB, parsed/stringified in code
 * - Restoration uses createMany for batch inserts (preserves IDs)
 * - Always broadcast after publishing to notify connected clients
 *
 * RELATED FILES:
 * - server/sse.ts - broadcast() for real-time updates
 * - src/components/admin/SnapshotHistory.tsx - UI for history
 */
import { Router } from 'express';
import prisma from '../db.js';
import { broadcast } from '../sse.js';
import { asyncHandler, NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { DEFAULT_SPEEDS, DEFAULT_FONTS } from '../constants.js';

const router = Router();

// ============================================================================
// STATE HELPERS
// ============================================================================

/**
 * Get current draft state organized by section.
 * Each section contains its items + any config that affects it.
 */
async function getCurrentState() {
  const [services, events, advisories, config] = await Promise.all([
    prisma.service.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.event.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.advisory.findMany(),
    prisma.buildingConfig.findFirst(),
  ]);

  return {
    config: config
      ? { dashboardTitle: config.dashboardTitle }
      : null,
    services: {
      items: services.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        notes: s.notes,
        lastChecked: s.lastChecked.toISOString(),
        sortOrder: s.sortOrder,
        markedForDeletion: s.markedForDeletion,
      })),
      scrollSpeed: config?.servicesScrollSpeed ?? DEFAULT_SPEEDS.SERVICES,
      servicesFontSize: config?.servicesFontSize ?? DEFAULT_FONTS.SERVICES_FONT_SIZE,
      notesFontSize: config?.notesFontSize ?? DEFAULT_FONTS.NOTES_FONT_SIZE,
      notesFontWeight: config?.notesFontWeight ?? DEFAULT_FONTS.NOTES_FONT_WEIGHT,
    },
    events: {
      items: events.map(e => ({
        id: e.id,
        title: e.title,
        subtitle: e.subtitle,
        details: JSON.parse(e.details),
        imageUrl: e.imageUrl,
        accentColor: e.accentColor,
        sortOrder: e.sortOrder,
        markedForDeletion: e.markedForDeletion,
      })),
      scrollSpeed: config?.scrollSpeed ?? DEFAULT_SPEEDS.EVENTS,
    },
    advisories: {
      items: advisories.map(a => ({
        id: a.id,
        message: a.message,
        active: a.active,
        markedForDeletion: a.markedForDeletion,
      })),
      tickerSpeed: config?.tickerSpeed ?? DEFAULT_SPEEDS.TICKER,
    },
  };
}

/** Get next version number for new snapshot. */
async function getNextVersion(): Promise<number> {
  const latest = await prisma.publishedSnapshot.findFirst({ orderBy: { version: 'desc' } });
  return (latest?.version ?? 0) + 1;
}

/** Transform section-based format to flat API format for frontend.
 *  Also handles legacy flat format (services/events/advisories as plain arrays)
 *  for backward compatibility with old snapshots.
 */
function toApiFormat(state: ReturnType<typeof getCurrentState> extends Promise<infer T> ? T : never) {
  // Handle legacy flat format where services/events/advisories are plain arrays
  const isLegacy = Array.isArray(state.services);
  if (isLegacy) {
    const legacy = state as unknown as {
      services: unknown[]; events: unknown[]; advisories: unknown[];
      config: Record<string, unknown> | null;
    };
    return {
      services: legacy.services,
      events: legacy.events,
      advisories: legacy.advisories,
      config: legacy.config,
    };
  }

  return {
    services: state.services.items,
    events: state.events.items,
    advisories: state.advisories.items,
    config: state.config
      ? {
          ...state.config,
          scrollSpeed: state.events.scrollSpeed,
          tickerSpeed: state.advisories.tickerSpeed,
          servicesScrollSpeed: state.services.scrollSpeed,
          servicesFontSize: state.services.servicesFontSize,
          notesFontSize: state.services.notesFontSize,
          notesFontWeight: state.services.notesFontWeight,
        }
      : null,
  };
}

// ============================================================================
// RESTORE HELPER (eliminates duplication across discard/restore endpoints)
// ============================================================================

interface SnapshotData {
  config?: { dashboardTitle?: string } | null;
  services?: { items?: ServiceItem[]; scrollSpeed?: number; servicesFontSize?: number; notesFontSize?: number; notesFontWeight?: number };
  events?: { items?: EventItem[]; scrollSpeed?: number };
  advisories?: { items?: AdvisoryItem[]; tickerSpeed?: number };
}

interface ServiceItem {
  id: number;
  name: string;
  status: string;
  notes?: string;
  sortOrder: number;
  lastChecked: string;
  markedForDeletion?: boolean;
}

interface EventItem {
  id: number;
  title: string;
  subtitle: string;
  details: string[];
  imageUrl: string;
  accentColor: string;
  sortOrder: number;
  markedForDeletion?: boolean;
}

interface AdvisoryItem {
  id: number;
  message: string;
  active: boolean;
  markedForDeletion?: boolean;
}

/**
 * Restore database state from snapshot data.
 * Deletes all current items and recreates from snapshot.
 *
 * @param data - Snapshot data in section-based format
 */
async function restoreFromSnapshot(data: SnapshotData): Promise<void> {
  await prisma.$transaction(async tx => {
    // Delete all current items
    await tx.service.deleteMany();
    await tx.event.deleteMany();
    await tx.advisory.deleteMany();

    // Restore services
    if (data.services?.items?.length) {
      await tx.service.createMany({
        data: data.services.items.map(s => ({
          id: s.id,
          name: s.name,
          status: s.status,
          notes: s.notes || '',
          sortOrder: s.sortOrder,
          lastChecked: new Date(s.lastChecked),
        })),
      });
    }

    // Restore events
    if (data.events?.items?.length) {
      await tx.event.createMany({
        data: data.events.items.map(e => ({
          id: e.id,
          title: e.title,
          subtitle: e.subtitle,
          details: JSON.stringify(e.details),
          imageUrl: e.imageUrl,
          accentColor: e.accentColor,
          sortOrder: e.sortOrder,
        })),
      });
    }

    // Restore advisories
    if (data.advisories?.items?.length) {
      await tx.advisory.createMany({
        data: data.advisories.items.map(a => ({
          id: a.id,
          message: a.message,
          active: a.active,
        })),
      });
    }

    // Restore config
    const existing = await tx.buildingConfig.findFirst();
    if (existing) {
      await tx.buildingConfig.update({
        where: { id: existing.id },
        data: {
          dashboardTitle: data.config?.dashboardTitle ?? existing.dashboardTitle,
          scrollSpeed: data.events?.scrollSpeed ?? DEFAULT_SPEEDS.EVENTS,
          tickerSpeed: data.advisories?.tickerSpeed ?? DEFAULT_SPEEDS.TICKER,
          servicesScrollSpeed: data.services?.scrollSpeed ?? DEFAULT_SPEEDS.SERVICES,
          servicesFontSize: data.services?.servicesFontSize ?? DEFAULT_FONTS.SERVICES_FONT_SIZE,
          notesFontSize: data.services?.notesFontSize ?? DEFAULT_FONTS.NOTES_FONT_SIZE,
          notesFontWeight: data.services?.notesFontWeight ?? DEFAULT_FONTS.NOTES_FONT_WEIGHT,
        },
      });
    }
  });
}

// ============================================================================
// DIFF HELPERS
// ============================================================================

/** Normalize a section for comparison (excludes operational fields). */
function normalizeSection(
  section: { items?: unknown[]; [key: string]: unknown } | null,
  excludeFields: string[] = []
) {
  if (!section) return null;
  const { items, ...config } = section;
  const normalizedItems = ((items as Array<Record<string, unknown>>) || [])
    .filter(item => !item.markedForDeletion)
    .map(item => {
      const normalized = { ...item };
      delete normalized.markedForDeletion;
      excludeFields.forEach(f => delete normalized[f]);
      return normalized;
    })
    .sort((a, b) => (a.id as number) - (b.id as number));
  return { items: normalizedItems, ...config };
}

/** Check if any fields differ between two objects. */
function hasFieldChanges(from: Record<string, unknown>, to: Record<string, unknown>, fields: string[]): boolean {
  return fields.some(f => String(from[f] ?? '') !== String(to[f] ?? ''));
}

/**
 * Diff a single section (services, events, or advisories) between two snapshots.
 * Builds added/removed/changed lists by comparing items by ID.
 */
function diffSection<T extends { id: number; markedForDeletion?: boolean }>(
  fromItems: T[],
  toItems: T[],
  hasChanges: (from: T, to: T) => boolean,
) {
  const fromMap = new Map(fromItems.map(item => [item.id, item]));
  const toMap = new Map(toItems.filter(item => !item.markedForDeletion).map(item => [item.id, item]));

  const added: T[] = [];
  const removed: T[] = [];
  const changed: { from: T; to: T }[] = [];

  for (const [id, toItem] of toMap) {
    const fromItem = fromMap.get(id);
    if (!fromItem) {
      added.push(toItem);
    } else if (hasChanges(fromItem, toItem)) {
      changed.push({ from: fromItem, to: toItem });
    }
  }
  for (const [id, fromItem] of fromMap) {
    if (!toMap.has(id)) {
      removed.push(fromItem);
    }
  }

  return { added, removed, changed };
}

/** Compute diff between two snapshots. */
function computeDiff(from: SnapshotData, to: SnapshotData) {
  const diff = {
    services: diffSection(
      from.services?.items || [],
      to.services?.items || [],
      (a, b) => hasFieldChanges(a as Record<string, unknown>, b as Record<string, unknown>, ['name', 'status', 'notes']),
    ),
    events: diffSection(
      from.events?.items || [],
      to.events?.items || [],
      (a, b) =>
        hasFieldChanges(a as Record<string, unknown>, b as Record<string, unknown>, ['title', 'subtitle', 'imageUrl']) ||
        JSON.stringify(a.details) !== JSON.stringify(b.details),
    ),
    advisories: diffSection(
      from.advisories?.items || [],
      to.advisories?.items || [],
      (a, b) => hasFieldChanges(a as Record<string, unknown>, b as Record<string, unknown>, ['message', 'active']),
    ),
    config: { changed: [] as { field: string; from: unknown; to: unknown }[] },
  };

  // Config diff
  const fromConfig = from.config || {};
  const toConfig = to.config || {};
  for (const key of Object.keys({ ...fromConfig, ...toConfig })) {
    const fromVal = (fromConfig as Record<string, unknown>)[key] ?? '';
    const toVal = (toConfig as Record<string, unknown>)[key] ?? '';
    if (String(fromVal) !== String(toVal)) {
      diff.config.changed.push({ field: key, from: fromVal, to: toVal });
    }
  }

  // Scroll speed changes
  if ((from.services?.scrollSpeed ?? DEFAULT_SPEEDS.SERVICES) !== (to.services?.scrollSpeed ?? DEFAULT_SPEEDS.SERVICES)) {
    diff.config.changed.push({ field: 'Services Page Speed', from: from.services?.scrollSpeed ?? DEFAULT_SPEEDS.SERVICES, to: to.services?.scrollSpeed ?? DEFAULT_SPEEDS.SERVICES });
  }
  if ((from.events?.scrollSpeed ?? DEFAULT_SPEEDS.EVENTS) !== (to.events?.scrollSpeed ?? DEFAULT_SPEEDS.EVENTS)) {
    diff.config.changed.push({ field: 'Events Scroll Speed', from: from.events?.scrollSpeed ?? DEFAULT_SPEEDS.EVENTS, to: to.events?.scrollSpeed ?? DEFAULT_SPEEDS.EVENTS });
  }
  if ((from.advisories?.tickerSpeed ?? DEFAULT_SPEEDS.TICKER) !== (to.advisories?.tickerSpeed ?? DEFAULT_SPEEDS.TICKER)) {
    diff.config.changed.push({ field: 'Ticker Speed', from: from.advisories?.tickerSpeed ?? DEFAULT_SPEEDS.TICKER, to: to.advisories?.tickerSpeed ?? DEFAULT_SPEEDS.TICKER });
  }

  return diff;
}

// ============================================================================
// ROUTES
// ============================================================================

// GET /api/snapshots - List all snapshots
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const snapshots = await prisma.publishedSnapshot.findMany({
      orderBy: { version: 'desc' },
      select: { id: true, version: true, publishedAt: true, publishedBy: true },
    });
    res.json(snapshots);
  })
);

// GET /api/snapshots/latest - Get latest published snapshot
router.get(
  '/latest',
  asyncHandler(async (_req, res) => {
    const snapshot = await prisma.publishedSnapshot.findFirst({ orderBy: { version: 'desc' } });
    if (!snapshot) {
      return res.json(toApiFormat(await getCurrentState()));
    }
    res.json(toApiFormat(JSON.parse(snapshot.data)));
  })
);

// GET /api/snapshots/draft-status - Get draft vs latest diff
router.get(
  '/draft-status',
  asyncHandler(async (_req, res) => {
    const snapshot = await prisma.publishedSnapshot.findFirst({ orderBy: { version: 'desc' } });
    if (!snapshot) {
      return res.json({
        hasChanges: true,
        sectionChanges: { config: true, services: true, events: true, advisories: true },
        published: null,
      });
    }

    const current = await getCurrentState();
    const published = JSON.parse(snapshot.data) as SnapshotData;

    // Check for marked-for-deletion items
    const hasMarkedServices = current.services.items.some(s => s.markedForDeletion);
    const hasMarkedEvents = current.events.items.some(e => e.markedForDeletion);
    const hasMarkedAdvisories = current.advisories.items.some(a => a.markedForDeletion);

    // Normalize and compare sections
    const currentServicesNorm = normalizeSection(current.services as { items?: unknown[] }, ['lastChecked']);
    const publishedServicesNorm = normalizeSection(published.services as { items?: unknown[] } | null, ['lastChecked']);

    const currentEventsNorm = normalizeSection(current.events as { items?: unknown[] });
    const publishedEventsNorm = normalizeSection(published.events as { items?: unknown[] } | null);

    const currentAdvisoriesNorm = normalizeSection(current.advisories as { items?: unknown[] });
    const publishedAdvisoriesNorm = normalizeSection(published.advisories as { items?: unknown[] } | null);

    const sectionChanges = {
      config: JSON.stringify(current.config) !== JSON.stringify(published.config),
      services: hasMarkedServices || JSON.stringify(currentServicesNorm) !== JSON.stringify(publishedServicesNorm),
      events: hasMarkedEvents || JSON.stringify(currentEventsNorm) !== JSON.stringify(publishedEventsNorm),
      advisories: hasMarkedAdvisories || JSON.stringify(currentAdvisoriesNorm) !== JSON.stringify(publishedAdvisoriesNorm),
    };

    const hasChanges = Object.values(sectionChanges).some(Boolean);
    res.json({ hasChanges, sectionChanges, published: toApiFormat(published as Awaited<ReturnType<typeof getCurrentState>>), current: toApiFormat(current) });
  })
);

// GET /api/snapshots/:version - Get specific snapshot
router.get(
  '/:version(\\d+)',
  asyncHandler(async (req, res) => {
    const version = Number(req.params.version);
    const snapshot = await prisma.publishedSnapshot.findUnique({ where: { version } });
    if (!snapshot) {
      throw new NotFoundError('Snapshot not found');
    }
    res.json({ ...toApiFormat(JSON.parse(snapshot.data)), version: snapshot.version, publishedAt: snapshot.publishedAt });
  })
);

// GET /api/snapshots/:v1/diff/:v2 - Get diff between versions
router.get(
  '/:v1(\\d+)/diff/:v2',
  asyncHandler(async (req, res) => {
    const v1 = Number(req.params.v1);
    const v2 = req.params.v2;

    const snapshot1 = await prisma.publishedSnapshot.findUnique({ where: { version: v1 } });
    if (!snapshot1) {
      throw new NotFoundError(`Snapshot v${v1} not found`);
    }

    let data2: SnapshotData;
    if (v2 === 'draft') {
      data2 = await getCurrentState();
    } else {
      const snapshot2 = await prisma.publishedSnapshot.findUnique({ where: { version: Number(v2) } });
      if (!snapshot2) {
        throw new NotFoundError(`Snapshot v${v2} not found`);
      }
      data2 = JSON.parse(snapshot2.data);
    }

    const data1 = JSON.parse(snapshot1.data);
    res.json(computeDiff(data1, data2));
  })
);

// POST /api/snapshots - Publish (create new version)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    // Hard-delete items marked for deletion
    await prisma.$transaction([
      prisma.service.deleteMany({ where: { markedForDeletion: true } }),
      prisma.event.deleteMany({ where: { markedForDeletion: true } }),
      prisma.advisory.deleteMany({ where: { markedForDeletion: true } }),
    ]);

    const state = await getCurrentState();
    const version = await getNextVersion();
    const publishedBy = req.session?.user?.username ?? 'admin';

    await prisma.publishedSnapshot.create({
      data: { version, data: JSON.stringify(state), publishedBy },
    });

    broadcast();
    res.json({ ok: true, version, publishedBy, state: toApiFormat(state) });
  })
);

// POST /api/snapshots/discard - Discard draft changes
router.post(
  '/discard',
  asyncHandler(async (_req, res) => {
    const snapshot = await prisma.publishedSnapshot.findFirst({ orderBy: { version: 'desc' } });
    if (!snapshot) {
      return res.json({ ok: true, message: 'No snapshot to restore' });
    }

    const data = JSON.parse(snapshot.data) as SnapshotData;
    await restoreFromSnapshot(data);
    res.json({ ok: true });
  })
);

// POST /api/snapshots/restore/:version - Full restore to version
router.post(
  '/restore/:version',
  asyncHandler(async (req, res) => {
    const version = Number(req.params.version);
    const snapshot = await prisma.publishedSnapshot.findUnique({ where: { version } });
    if (!snapshot) {
      throw new NotFoundError('Snapshot not found');
    }

    const data = JSON.parse(snapshot.data) as SnapshotData;
    await restoreFromSnapshot(data);

    res.json({ ok: true, message: `Restored v${version} as draft — publish to make it live` });
  })
);

// POST /api/snapshots/restore-items - Selective item restore
router.post(
  '/restore-items',
  asyncHandler(async (req, res) => {
    const { sourceVersion, items } = req.body as {
      sourceVersion: number;
      items: { services?: number[]; events?: number[]; advisories?: number[] };
    };

    if (!sourceVersion) {
      throw new ValidationError('sourceVersion is required');
    }

    const snapshot = await prisma.publishedSnapshot.findUnique({ where: { version: sourceVersion } });
    if (!snapshot) {
      throw new NotFoundError('Snapshot not found');
    }

    const data = JSON.parse(snapshot.data) as SnapshotData;
    const restoredItems = { services: [] as number[], events: [] as number[], advisories: [] as number[] };

    await prisma.$transaction(async tx => {
      // Restore selected services
      if (items.services?.length) {
        for (const id of items.services) {
          const service = data.services?.items?.find(s => s.id === id);
          if (service) {
            await tx.service.deleteMany({ where: { id } });
            await tx.service.create({
              data: {
                id: service.id,
                name: service.name,
                status: service.status,
                notes: service.notes || '',
                sortOrder: service.sortOrder,
                lastChecked: new Date(service.lastChecked),
              },
            });
            restoredItems.services.push(id);
          }
        }
      }

      // Restore selected events
      if (items.events?.length) {
        for (const id of items.events) {
          const event = data.events?.items?.find(e => e.id === id);
          if (event) {
            await tx.event.deleteMany({ where: { id } });
            await tx.event.create({
              data: {
                id: event.id,
                title: event.title,
                subtitle: event.subtitle,
                details: JSON.stringify(event.details),
                imageUrl: event.imageUrl,
                accentColor: event.accentColor,
                sortOrder: event.sortOrder,
              },
            });
            restoredItems.events.push(id);
          }
        }
      }

      // Restore selected advisories
      if (items.advisories?.length) {
        for (const id of items.advisories) {
          const advisory = data.advisories?.items?.find(a => a.id === id);
          if (advisory) {
            await tx.advisory.deleteMany({ where: { id } });
            await tx.advisory.create({
              data: {
                id: advisory.id,
                message: advisory.message,
                active: advisory.active,
              },
            });
            restoredItems.advisories.push(id);
          }
        }
      }
    });

    res.json({ ok: true, restored: restoredItems });
  })
);

// DELETE /api/snapshots/:version - Delete specific snapshot
router.delete(
  '/:version(\\d+)',
  asyncHandler(async (req, res) => {
    const version = Number(req.params.version);

    const count = await prisma.publishedSnapshot.count();
    if (count === 1) {
      throw new ValidationError('Cannot delete the only remaining snapshot');
    }

    const snapshot = await prisma.publishedSnapshot.findUnique({ where: { version } });
    if (!snapshot) {
      throw new NotFoundError('Snapshot not found');
    }

    await prisma.publishedSnapshot.delete({ where: { version } });
    res.json({ ok: true, message: `Deleted snapshot v${version}` });
  })
);

// DELETE /api/snapshots - Purge all history except latest
router.delete(
  '/',
  asyncHandler(async (_req, res) => {
    const latest = await prisma.publishedSnapshot.findFirst({ orderBy: { version: 'desc' } });
    if (!latest) {
      return res.json({ ok: true, message: 'No snapshots to purge', deleted: 0 });
    }

    const result = await prisma.publishedSnapshot.deleteMany({
      where: { version: { not: latest.version } },
    });

    res.json({ ok: true, message: `Purged ${result.count} old snapshots, kept v${latest.version}`, deleted: result.count });
  })
);

export default router;
