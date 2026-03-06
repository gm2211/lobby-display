/**
 * Events API Routes - CRUD operations for dashboard event cards.
 *
 * Uses createCrudRoutes factory with custom transforms for JSON details field.
 * Events are announcement cards shown on the main dashboard.
 *
 * ROUTES:
 * - GET /api/events - List all events (details parsed from JSON)
 * - POST /api/events - Create new event (details stringified)
 * - PUT /api/events/:id - Update event (details stringified if present)
 * - DELETE /api/events/:id - Mark for deletion
 * - POST /api/events/:id/unmark - Undo mark for deletion
 *
 * GOTCHAS / AI AGENT NOTES:
 * - The `details` field is stored as JSON string in the database
 * - API accepts/returns details as an array of strings
 * - transformGet parses JSON, transformCreate/Update stringify it
 *
 * RELATED FILES:
 * - server/utils/createCrudRoutes.ts - Factory that generates these routes
 * - src/types.ts - Event type definition
 */
import { createCrudRoutes } from '../utils/createCrudRoutes.js';
import type { Event } from '@prisma/client';

// Parse JSON details field when reading from DB
const parseEventDetails = (e: Event): Event & { details: string[] } => ({
  ...e,
  details: JSON.parse(e.details) as string[],
});

// Stringify details array when creating
const transformCreate = (data: Record<string, unknown>): Record<string, unknown> => {
  const { details, ...rest } = data;
  return {
    ...rest,
    details: JSON.stringify(details || []),
  };
};

// Stringify details array when updating (only if present)
const transformUpdate = (data: Record<string, unknown>): Record<string, unknown> => {
  const { details, ...rest } = data;
  if (details !== undefined) {
    return { ...rest, details: JSON.stringify(details) };
  }
  return rest;
};

export default createCrudRoutes<Event>({
  model: 'event',
  orderBy: { sortOrder: 'asc' },
  transformCreate,
  transformUpdate,
  transformGet: parseEventDetails,
});
