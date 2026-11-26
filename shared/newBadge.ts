/**
 * NEW badge logic for event cards — shared by the dashboard and the server.
 *
 * MODES (BuildingConfig.newBadgeMode):
 * - "days"            Badge shows for `newBadgeDays` days after the event first went live.
 * - "untilNextUpdate" Badge shows until the events list is next published with a change.
 * - "off"             Never show the badge.
 *
 * EVENT FIELDS:
 * - firstPublishedAt  Set on publish. `null` = still a draft (shown as new in preview).
 *                     `undefined` = legacy snapshot from before this feature (never new).
 * - newInLastUpdate   Baked into each published snapshot: true if the event first went
 *                     live in the most recent publish that changed the events list.
 */
export type NewBadgeMode = 'days' | 'untilNextUpdate' | 'off';

export const NEW_BADGE_DEFAULTS = { mode: 'days' as NewBadgeMode, days: 7, color: '#ffc72c' };

export const NEW_BADGE_MODES: { value: NewBadgeMode; label: string }[] = [
  { value: 'days', label: 'For a number of days' },
  { value: 'untilNextUpdate', label: 'Until the events list is next published' },
  { value: 'off', label: 'Off' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface NewBadgeEvent {
  firstPublishedAt?: string | Date | null;
  newInLastUpdate?: boolean;
}

export interface NewBadgeConfig {
  newBadgeMode?: string | null;
  newBadgeDays?: number | null;
}

export function isEventNew(
  event: NewBadgeEvent,
  config: NewBadgeConfig | null | undefined,
  now: number = Date.now(),
): boolean {
  const mode = (config?.newBadgeMode || NEW_BADGE_DEFAULTS.mode) as NewBadgeMode;
  if (mode === 'off') return false;
  if (event.firstPublishedAt === undefined) return false; // legacy snapshot
  if (event.firstPublishedAt === null) return true; // draft: will be new once published

  if (mode === 'untilNextUpdate') return event.newInLastUpdate === true;

  const days = config?.newBadgeDays ?? NEW_BADGE_DEFAULTS.days;
  const publishedAt = new Date(event.firstPublishedAt).getTime();
  if (Number.isNaN(publishedAt)) return false;
  return now - publishedAt < days * DAY_MS;
}
