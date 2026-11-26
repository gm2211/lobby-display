/**
 * Client-side list of unpublished changes (draft vs. latest published snapshot).
 *
 * Feeds the admin tab badges and the "Not yet on the lobby" panel. The server's
 * `draft-status` only says *which sections* changed; this names the items.
 * It is a best-effort summary: if a section is flagged changed but nothing here
 * matches (e.g. a field we don't compare), the tab still shows a dot.
 */
import type { Service, Event, Advisory, BuildingConfig } from '../types';

export type ChangeSection = 'services' | 'events' | 'advisories' | 'config';
export type ChangeKind = 'added' | 'edited' | 'removing' | 'reordered';

export interface DraftChange {
  key: string;
  section: ChangeSection;
  kind: ChangeKind;
  label: string;
  /** Item id, for item changes (undo needs it) */
  id?: number;
}

interface Published {
  services: Service[];
  events: Event[];
  advisories: Advisory[];
  config: BuildingConfig | null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function diffItems<T extends { id: number; markedForDeletion?: boolean; sortOrder?: number }>(
  section: Exclude<ChangeSection, 'config'>,
  current: T[],
  published: T[],
  fields: (keyof T)[],
  label: (item: T) => string,
): DraftChange[] {
  const out: DraftChange[] = [];
  const byId = new Map(published.map(p => [p.id, p]));
  for (const item of current) {
    const pub = byId.get(item.id);
    const base = { section, id: item.id, label: label(item) || 'Untitled' };
    if (item.markedForDeletion) {
      // Deleting a never-published item is not a change worth listing
      if (pub) out.push({ ...base, key: `${section}-${item.id}`, kind: 'removing' });
    } else if (!pub) {
      out.push({ ...base, key: `${section}-${item.id}`, kind: 'added' });
    } else if (fields.some(f => !same(item[f], pub[f]))) {
      out.push({ ...base, key: `${section}-${item.id}`, kind: 'edited' });
    }
  }
  // Order: compare the sequence of ids both lists share
  if (current.length && published.length && 'sortOrder' in (current[0] as object)) {
    const pubIds = new Set(published.map(p => p.id));
    const curOrder = [...current].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(i => i.id).filter(id => pubIds.has(id));
    const curIds = new Set(curOrder);
    const pubOrder = [...published].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(i => i.id).filter(id => curIds.has(id));
    if (!same(curOrder, pubOrder)) {
      out.push({ key: `${section}-order`, section, kind: 'reordered', label: 'New order' });
    }
  }
  return out;
}

const CONFIG_IGNORED = new Set(['id', 'updatedAt', 'createdAt']);

/** "servicesScrollSpeed" -> "Services scroll speed" */
export function humanizeField(field: string): string {
  const words = field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function computeDraftChanges(
  current: Published,
  published: Published | null,
): DraftChange[] {
  if (!published) return [];
  const changes: DraftChange[] = [
    ...diffItems<Service>('services', current.services, published.services || [], ['name', 'status', 'notes'], s => s.name),
    ...diffItems<Event>('events', current.events, published.events || [], ['title', 'subtitle', 'imageUrl', 'details'], e => e.title),
    ...diffItems<Advisory>('advisories', current.advisories, published.advisories || [], ['message', 'active'], a => a.message),
  ];
  const cfg = (current.config || {}) as unknown as Record<string, unknown>;
  const pubCfg = (published.config || {}) as unknown as Record<string, unknown>;
  if (current.config && published.config) {
    for (const field of Object.keys(cfg)) {
      if (CONFIG_IGNORED.has(field) || !(field in pubCfg)) continue;
      if (String(cfg[field] ?? '') !== String(pubCfg[field] ?? '')) {
        changes.push({ key: `config-${field}`, section: 'config', kind: 'edited', label: humanizeField(field) });
      }
    }
  }
  return changes;
}

export function countBySection(changes: DraftChange[]): Record<ChangeSection, number> {
  const counts: Record<ChangeSection, number> = { services: 0, events: 0, advisories: 0, config: 0 };
  for (const c of changes) counts[c.section]++;
  return counts;
}
