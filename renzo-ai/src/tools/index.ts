/**
 * Tool registry — initializes the CC client and exports all tool functions.
 *
 * Each tool function returns a structured result (JSON-serializable object).
 * The client authenticates with condocontrol.com using CC_EMAIL + CC_PASSWORD env vars.
 */
import { CCClient } from './client.js';
import {
  loadCookies,
  validateSession,
  startRefreshLoop,
  handleSessionExpired,
  ensureFresh,
} from './auth.js';
import { log } from './logger.js';
import { AMENITIES } from './types.js';
import type {
  HtmlPartialResponse,
  AmenityRulesResponse,
  UnavailableDatesResponse,
  DashboardResponse,
  NavigationResponse,
  BookingSearchResponse,
  CalendarEvent,
  EventsDashboardResponse,
  EventListResponse,
} from './types.js';
import { parseAmenityList, parseTimeSlots, parseBookingCards, parsePricingInfo, parseBookingFormFields } from './parsers.js';

let client: CCClient | null = null;
let initialized = false;

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Initialize the CC client. Must be called before any tool function.
 * Safe to call multiple times — only initializes once.
 */
export async function initializeClient(): Promise<void> {
  if (initialized) return;

  client = new CCClient();
  client.setSessionExpiredCallback(() => handleSessionExpired(client!));
  client.setPreRequestHook(() => ensureFresh(client!));

  const cookiesLoaded = loadCookies(client);

  if (cookiesLoaded) {
    try {
      await validateSession(client);
    } catch (err) {
      log(`[tools] Session validation failed: ${err instanceof Error ? err.message : err}`);
      log('[tools] Will attempt re-auth on first tool call');
    }
  } else {
    log('[tools] No cookies loaded — will attempt login on first tool call');
    try {
      await handleSessionExpired(client);
    } catch (err) {
      log(`[tools] Initial auth failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  startRefreshLoop(client);
  initialized = true;
  log('[tools] Client initialized');
}

function getClient(): CCClient {
  if (!client) throw new Error('Client not initialized. Call initializeClient() first.');
  return client;
}

// ─── Dashboard Tools ──────────────────────────────────────────────────────────

export async function getDashboard(): Promise<ToolResult> {
  try {
    const c = getClient();
    const data = await c.get<DashboardResponse>('/my/my-home-v2');
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listAnnouncements(): Promise<ToolResult> {
  try {
    const c = getClient();
    const data = await c.get<DashboardResponse>('/my/my-home-v2');
    const announcementWidget = data.largeWidgets?.find(
      (w) => w.displayName?.toLowerCase().includes('announcement')
    );
    const announcements = announcementWidget?.itemList ?? [];
    return { success: true, data: announcements };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Amenity Tools ────────────────────────────────────────────────────────────

export async function listAmenities(): Promise<ToolResult> {
  try {
    const c = getClient();
    const data = await c.get<HtmlPartialResponse>('/amenity/get-amenity-list/');
    const parsed = parseAmenityList(data.message || '');

    const amenities = parsed.length > 0
      ? parsed.map((card) => {
          const known = card.amenityId ? AMENITIES[card.amenityId] : undefined;
          return {
            id: card.amenityId ?? known?.id,
            name: card.name || known?.name,
            fee: card.feeLabel ?? known?.fee ?? 'Unknown',
            imageUrl: card.imageUrl,
          };
        })
      : Object.values(AMENITIES).map((a) => ({
          id: a.id,
          name: a.name,
          fee: a.fee ?? 'Unknown',
          imageUrl: null,
        }));

    return { success: true, data: amenities };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getAmenityAvailability(args: {
  amenityId: number;
  date?: string;
}): Promise<ToolResult> {
  try {
    const c = getClient();
    const amenityId = String(args.amenityId);
    const known = AMENITIES[args.amenityId];
    const bookingStyleId = known?.bookingStyleId ?? 4;
    const date = args.date ?? new Date().toISOString().split('T')[0];

    // Parallel calls for rules, unavailable dates, time slots, and pricing
    const [rulesResult, unavailResult, timeSlotsResult, pricingResult] = await Promise.allSettled([
      c.get<AmenityRulesResponse>('/amenity/get-amenity-rules/', {
        amenityId,
        bookingStyleId: String(bookingStyleId),
        selectedDate: date,
      }),
      c.get<UnavailableDatesResponse>('/amenity/get-unavailable-dates/', {
        amenityId,
      }),
      c.getText('/amenity/get-amenity-rules/', {
        amenityId,
        bookingStyleId: String(bookingStyleId),
        selectedDate: date,
      }).then(parseTimeSlots),
      c.getText('/amenity/update-pricing-structure/', {
        amenityId,
        selectedDate: date,
      }).then(parsePricingInfo),
    ]);

    const result: Record<string, unknown> = {
      amenityId: args.amenityId,
      amenityName: known?.name ?? `Amenity ${args.amenityId}`,
      date,
    };

    if (rulesResult.status === 'fulfilled') {
      result.availableDaysOfWeek = rulesResult.value.availableDaysOfWeek;
    }
    if (unavailResult.status === 'fulfilled') {
      result.unavailableDates = unavailResult.value.unavailableDates;
    }
    if (timeSlotsResult.status === 'fulfilled') {
      result.timeSlots = timeSlotsResult.value;
    }
    if (pricingResult.status === 'fulfilled') {
      result.pricing = pricingResult.value;
    }

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Booking Tools ────────────────────────────────────────────────────────────

export async function listBookings(args?: {
  amenityId?: number;
  statusId?: number;
  searchTerm?: string;
}): Promise<ToolResult> {
  try {
    const c = getClient();
    const body: Record<string, string> = {
      AmenityId: String(args?.amenityId ?? 0),
      BookingStatusId: String(args?.statusId ?? 0),
      SearchTerm: args?.searchTerm ?? '',
      LastLoadedAmenityBookingID: '0',
    };
    const data = await c.post<BookingSearchResponse>('/amenity/search-amenity-booking', body);
    const parsed = parseBookingCards(data.message || '');
    return { success: true, data: parsed };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getBookingCalendar(args: {
  amenityId: number;
  start: string;
  end: string;
}): Promise<ToolResult> {
  try {
    const c = getClient();
    const data = await c.get<CalendarEvent[]>('/amenity/json-source/', {
      amenityId: String(args.amenityId),
      start: args.start,
      end: args.end,
    });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Event Tools ──────────────────────────────────────────────────────────────

export async function getEventsDashboard(): Promise<ToolResult> {
  try {
    const c = getClient();
    const data = await c.get<EventsDashboardResponse>('/event/get-events-dashboard/');
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listEvents(args?: {
  searchTerm?: string;
  upcoming?: boolean;
}): Promise<ToolResult> {
  try {
    const c = getClient();
    const body: Record<string, string> = {
      SearchTerm: args?.searchTerm ?? '',
      IsUpcoming: String(args?.upcoming ?? true),
    };
    const data = await c.post<EventListResponse>('/event/list-event/', body);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Tool Metadata ────────────────────────────────────────────────────────────

export const TOOL_DESCRIPTIONS = {
  getDashboard: 'Get the building dashboard with weather, amenities, announcements, and events',
  listAnnouncements: 'List recent building announcements',
  listAmenities: 'List all bookable amenities with names, IDs, and fees',
  getAmenityAvailability: 'Get availability, time slots, and pricing for a specific amenity on a date',
  listBookings: 'List bookings with optional filters (amenity, status, search term)',
  getBookingCalendar: 'Get booking calendar events for an amenity in a date range',
  getEventsDashboard: 'Get upcoming community events',
  listEvents: 'Search or list community events',
} as const;
