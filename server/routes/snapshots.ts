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
 * - Restores must NOT delete + recreate services: ServiceStatusLog cascades on delete
 *   and the Metrics history would be lost. Use upsertService().
 * - Always broadcast after publishing to notify connected clients
 * - Publish runs in ONE transaction (deletes, NEW-badge stamps, snapshot row).
 *   Helpers it calls take the transaction client (`db`), never the global `prisma`
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
import { invalidateThemeCache } from '../themeCSS.js';
import { NEW_BADGE_DEFAULTS } from '../../shared/newBadge.js';

const router = Router();

// ============================================================================
// STATE HELPERS
// ============================================================================

/**
 * Get current draft state organized by section.
 * Each section contains its items + any config that affects it.
 */
/** The Prisma client, or a transaction client inside prisma.$transaction(). */
type Db = Pick<typeof prisma, 'service' | 'event' | 'advisory' | 'buildingConfig' | 'publishedSnapshot'>;

export async function getCurrentState(db: Db = prisma) {
  // Sequential on purpose: a transaction client runs one query at a time.
  const services = await db.service.findMany({ orderBy: { sortOrder: 'asc' } });
  const events = await db.event.findMany({ orderBy: { sortOrder: 'asc' } });
  const advisories = await db.advisory.findMany();
  const config = await db.buildingConfig.findFirst({ orderBy: { id: 'asc' } });

  return {
    config: config
      ? { dashboardTitle: config.dashboardTitle, titleFontSize: config.titleFontSize, timezone: config.timezone, logoUrl: config.logoUrl, customLogos: config.customLogos, themePreset: config.themePreset, fontFamily: config.fontFamily, fontScale: config.fontScale, colorPrimary: config.colorPrimary, colorSecondary: config.colorSecondary, newBadgeMode: config.newBadgeMode, newBadgeDays: config.newBadgeDays, newBadgeColor: config.newBadgeColor }
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
        firstPublishedAt: e.firstPublishedAt ? e.firstPublishedAt.toISOString() : null,
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

export interface SnapshotData {
  config?: { dashboardTitle?: string; titleFontSize?: number; timezone?: string; logoUrl?: string; customLogos?: string; themePreset?: string; fontFamily?: string; fontScale?: number; colorPrimary?: string; colorSecondary?: string; newBadgeMode?: string; newBadgeDays?: number; newBadgeColor?: string } | null;
  services?: { items?: ServiceItem[]; scrollSpeed?: number; servicesFontSize?: number; notesFontSize?: number; notesFontWeight?: number };
  events?: { items?: EventItem[]; scrollSpeed?: number };
  advisories?: { items?: AdvisoryItem[]; tickerSpeed?: number };
  // NOTE: very old snapshots hold plain arrays here instead; read items via sectionItems().
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
  /** ISO time the event first went live; null = draft; absent in pre-badge snapshots */
  firstPublishedAt?: string | null;
  /** True if the event first went live in the latest publish that changed the events list */
  newInLastUpdate?: boolean;
}

interface AdvisoryItem {
  id: number;
  message: string;
  active: boolean;
  markedForDeletion?: boolean;
}

/**
 * Items of a snapshot section. Old snapshots stored each section as a plain array
 * (legacy flat format); newer ones use `{ items, ...settings }`.
 */
function sectionItems<T>(section: { items?: T[] } | T[] | null | undefined): T[] {
  if (Array.isArray(section)) return section;
  return section?.items ?? [];
}

type ServiceWriter = Pick<typeof prisma, 'service'>;

/**
 * Write a snapshot's service row without deleting it first. Service has a cascading
 * relation to ServiceStatusLog, so delete + recreate would wipe the status history
 * that the Metrics page is built on.
 */
async function upsertService(tx: ServiceWriter, s: ServiceItem): Promise<void> {
  const fields = {
    name: s.name,
    status: s.status,
    notes: s.notes || '',
    sortOrder: s.sortOrder,
    lastChecked: new Date(s.lastChecked),
    markedForDeletion: false,
  };
  await tx.service.upsert({ where: { id: s.id }, create: { id: s.id, ...fields }, update: fields });
}

/**
 * Restore database state (the draft) from snapshot data.
 * Events and advisories are deleted and recreated; services are updated in place
 * so their status history survives.
 *
 * @param data - Snapshot data (section-based, or the legacy flat format)
 */
export async function restoreFromSnapshot(data: SnapshotData): Promise<void> {
  const services = sectionItems(data.services);
  const events = sectionItems(data.events);
  const advisories = sectionItems(data.advisories);

  await prisma.$transaction(async tx => {
    // Services are updated in place (see upsertService); only ones absent from the
    // snapshot are removed.
    await tx.service.deleteMany({ where: { id: { notIn: services.map(s => s.id) } } });
    for (const s of services) {
      await upsertService(tx, s);
    }

    await tx.event.deleteMany();
    await tx.advisory.deleteMany();

    // Restore events
    if (events.length) {
      await tx.event.createMany({
        data: events.map(e => ({
          id: e.id,
          title: e.title,
          subtitle: e.subtitle,
          details: JSON.stringify(e.details ?? []),
          imageUrl: e.imageUrl,
          accentColor: e.accentColor,
          sortOrder: e.sortOrder,
          firstPublishedAt: e.firstPublishedAt ? new Date(e.firstPublishedAt) : null,
        })),
      });
    }

    // Restore advisories
    if (advisories.length) {
      await tx.advisory.createMany({
        data: advisories.map(a => ({
          id: a.id,
          message: a.message,
          active: a.active,
        })),
      });
    }

    // Restore config
    const existing = await tx.buildingConfig.findFirst({ orderBy: { id: 'asc' } });
    if (existing) {
      await tx.buildingConfig.update({
        where: { id: existing.id },
        data: {
          dashboardTitle: data.config?.dashboardTitle ?? existing.dashboardTitle,
          titleFontSize: data.config?.titleFontSize ?? existing.titleFontSize,
          timezone: data.config?.timezone ?? existing.timezone,
          logoUrl: data.config?.logoUrl ?? existing.logoUrl,
          customLogos: data.config?.customLogos ?? existing.customLogos,
          themePreset: data.config?.themePreset ?? '',
          fontFamily: data.config?.fontFamily ?? '',
          fontScale: data.config?.fontScale ?? DEFAULT_FONTS.FONT_SCALE,
          colorPrimary: data.config?.colorPrimary ?? '',
          colorSecondary: data.config?.colorSecondary ?? '',
          newBadgeMode: data.config?.newBadgeMode ?? NEW_BADGE_DEFAULTS.mode,
          newBadgeDays: data.config?.newBadgeDays ?? NEW_BADGE_DEFAULTS.days,
          newBadgeColor: data.config?.newBadgeColor ?? NEW_BADGE_DEFAULTS.color,
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
// NEW BADGE BOOKKEEPING (see shared/newBadge.ts)
// ============================================================================

type SnapshotState = Awaited<ReturnType<typeof getCurrentState>> & {
  events: { items: Array<EventItem & { newInLastUpdate?: boolean }> };
};

/**
 * Set firstPublishedAt on events going live for the first time.
 * Events that already appear in an older snapshot (published before this feature
 * existed) are backfilled with that snapshot's time, so they don't all look new.
 */
async function stampEventPublishTimes(db: Db, publishedAt: Date): Promise<void> {
  const unstamped = await db.event.findMany({
    where: { firstPublishedAt: null, markedForDeletion: false },
    select: { id: true },
  });
  if (unstamped.length === 0) return;

  const pending = new Set(unstamped.map(e => e.id));
  const firstSeen = new Map<number, Date>();
  const snapshots = await db.publishedSnapshot.findMany({
    orderBy: { version: 'asc' },
    select: { data: true, publishedAt: true },
  });
  for (const snap of snapshots) {
    if (pending.size === 0) break;
    const items = sectionItems((JSON.parse(snap.data) as SnapshotData).events);
    for (const item of items) {
      if (pending.has(item.id) && !item.markedForDeletion) {
        firstSeen.set(item.id, snap.publishedAt);
        pending.delete(item.id);
      }
    }
  }

  for (const [id, at] of firstSeen) {
    await db.event.update({ where: { id }, data: { firstPublishedAt: at } });
  }
  await db.event.updateMany({
    where: { id: { in: [...pending] } },
    data: { firstPublishedAt: publishedAt },
  });
}

/** Content fields that count as "the events list was updated" (order included). */
function eventsFingerprint(items: EventItem[] = []): string {
  return JSON.stringify(
    items
      .filter(e => !e.markedForDeletion)
      .map(e => [e.id, e.title, e.subtitle, e.details, e.imageUrl, e.accentColor, e.sortOrder]),
  );
}

/**
 * Set newInLastUpdate on each event in the snapshot being published.
 * If the events list changed, new = went live in this publish.
 * If it didn't change (e.g. only services were edited), keep the previous flags.
 */
export function markNewInLastUpdate(
  state: { events: { items: Array<EventItem & { newInLastUpdate?: boolean }> } },
  previous: SnapshotData | null,
  publishedAt: Date,
): void {
  const prevItems = previous?.events?.items ?? [];
  const eventsChanged = !previous || eventsFingerprint(prevItems) !== eventsFingerprint(state.events.items);
  const prevFlags = new Map(prevItems.map(e => [e.id, e.newInLastUpdate === true]));
  const stamp = publishedAt.toISOString();
  for (const item of state.events.items) {
    item.newInLastUpdate = eventsChanged
      ? item.firstPublishedAt === stamp
      : prevFlags.get(item.id) ?? false;
  }
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

    // firstPublishedAt/newInLastUpdate are publish bookkeeping, not editable content
    const eventBookkeeping = ['firstPublishedAt', 'newInLastUpdate'];
    const currentEventsNorm = normalizeSection(current.events as { items?: unknown[] }, eventBookkeeping);
    const publishedEventsNorm = normalizeSection(published.events as { items?: unknown[] } | null, eventBookkeeping);

    const currentAdvisoriesNorm = normalizeSection(current.advisories as { items?: unknown[] });
    const publishedAdvisoriesNorm = normalizeSection(published.advisories as { items?: unknown[] } | null);

    // Normalize config comparison: fill in defaults for fields missing from old snapshots
    const configDefaults = { themePreset: '', fontFamily: '', fontScale: 100, colorPrimary: '', colorSecondary: '', newBadgeMode: NEW_BADGE_DEFAULTS.mode, newBadgeDays: NEW_BADGE_DEFAULTS.days, newBadgeColor: NEW_BADGE_DEFAULTS.color };
    const publishedConfigNorm = published.config ? { ...configDefaults, ...published.config } : null;
    // Use sorted keys for order-independent comparison
    const sortedStringify = (obj: unknown) => JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort());

    const sectionChanges = {
      config: sortedStringify(current.config) !== sortedStringify(publishedConfigNorm),
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
    const publishedBy = req.session?.user?.username ?? 'admin';
    const publishedAt = new Date();

    // One transaction: if any step fails, nothing is deleted and no version is created.
    // Two publishes at once can't both win either: `version` is unique, so the second
    // one fails and rolls back (reported as a 409).
    const { state, version } = await prisma.$transaction(async tx => {
      // Hard-delete items marked for deletion
      await tx.service.deleteMany({ where: { markedForDeletion: true } });
      await tx.event.deleteMany({ where: { markedForDeletion: true } });
      await tx.advisory.deleteMany({ where: { markedForDeletion: true } });

      await stampEventPublishTimes(tx, publishedAt);

      const state: SnapshotState = await getCurrentState(tx);
      const previous = await tx.publishedSnapshot.findFirst({ orderBy: { version: 'desc' } });
      markNewInLastUpdate(state, previous ? (JSON.parse(previous.data) as SnapshotData) : null, publishedAt);

      const version = (previous?.version ?? 0) + 1;
      await tx.publishedSnapshot.create({
        data: { version, data: JSON.stringify(state), publishedBy, publishedAt },
      });
      return { state, version };
    });

    invalidateThemeCache();
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
  '/restore/:version(\\d+)',
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
    const body = (req.body ?? {}) as {
      sourceVersion?: unknown;
      items?: { services?: unknown; events?: unknown; advisories?: unknown };
    };
    const sourceVersion = Number(body.sourceVersion);
    if (!Number.isInteger(sourceVersion) || sourceVersion <= 0) {
      throw new ValidationError('sourceVersion must be a snapshot version number');
    }
    const idList = (value: unknown, name: string): number[] => {
      if (value === undefined) return [];
      if (!Array.isArray(value) || !value.every(id => Number.isInteger(id))) {
        throw new ValidationError(`items.${name} must be an array of item IDs`);
      }
      return value as number[];
    };
    const wanted = {
      services: idList(body.items?.services, 'services'),
      events: idList(body.items?.events, 'events'),
      advisories: idList(body.items?.advisories, 'advisories'),
    };

    const snapshot = await prisma.publishedSnapshot.findUnique({ where: { version: sourceVersion } });
    if (!snapshot) {
      throw new NotFoundError('Snapshot not found');
    }

    const data = JSON.parse(snapshot.data) as SnapshotData;
    const source = {
      services: sectionItems(data.services),
      events: sectionItems(data.events),
      advisories: sectionItems(data.advisories),
    };
    const restoredItems = { services: [] as number[], events: [] as number[], advisories: [] as number[] };

    await prisma.$transaction(async tx => {
      for (const id of wanted.services) {
        const service = source.services.find(s => s.id === id);
        if (service) {
          await upsertService(tx, service);
          restoredItems.services.push(id);
        }
      }

      for (const id of wanted.events) {
        const event = source.events.find(e => e.id === id);
        if (event) {
          await tx.event.deleteMany({ where: { id } });
          await tx.event.create({
            data: {
              id: event.id,
              title: event.title,
              subtitle: event.subtitle,
              details: JSON.stringify(event.details ?? []),
              imageUrl: event.imageUrl,
              accentColor: event.accentColor,
              sortOrder: event.sortOrder,
              // Keep the original go-live time so a restored event isn't badged NEW again
              firstPublishedAt: event.firstPublishedAt ? new Date(event.firstPublishedAt) : null,
            },
          });
          restoredItems.events.push(id);
        }
      }

      for (const id of wanted.advisories) {
        const advisory = source.advisories.find(a => a.id === id);
        if (advisory) {
          await tx.advisory.deleteMany({ where: { id } });
          await tx.advisory.create({
            data: { id: advisory.id, message: advisory.message, active: advisory.active },
          });
          restoredItems.advisories.push(id);
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
