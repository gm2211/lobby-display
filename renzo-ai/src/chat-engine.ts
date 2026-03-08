/**
 * Chat engine — keyword-based intent classifier + tool routing + response formatting.
 *
 * Without a real LLM, this engine:
 * 1. Parses the user query for keywords/intent
 * 2. Calls appropriate condo-control tools
 * 3. Formats tool results into natural language
 *
 * The architecture is pluggable — replace this with an LLM-based engine later.
 */
import {
  initializeClient,
  getDashboard,
  listAnnouncements,
  listAmenities,
  getAmenityAvailability,
  listBookings,
  getBookingCalendar,
  getEventsDashboard,
  listEvents,
  type ToolResult,
} from './tools/index.js';
import { AMENITIES } from './tools/types.js';
import { log } from './tools/logger.js';

let clientReady = false;

async function ensureClient(): Promise<void> {
  if (clientReady) return;
  await initializeClient();
  clientReady = true;
}

/** Match an amenity name from the user query. */
function findAmenityId(query: string): number | null {
  const lower = query.toLowerCase();
  const aliases: Record<string, number> = {
    'grill': 12293, 'bbq': 12293, 'barbecue': 12293,
    'cinema': 12294, 'screening': 12294, 'movie': 12294, 'theater': 12294,
    'cafe': 12295, 'dining': 12295, 'click cafe': 12295, 'private dining': 12295,
    'golf front': 12273, 'front bay': 12273,
    'golf rear': 12274, 'rear bay': 12274, 'golf': 12273,
    'pet': 12299, 'grooming': 12299, 'dog': 12299,
    'move': 12301, 'move in': 12301, 'move out': 12301, 'moving': 12301,
    'spa': 12304, 'massage': 12304,
    'studio': 12306, 'studio on 10': 12306,
    'yoga': 12307,
    'delivery': 16698, 'deliveries': 16698, 'large delivery': 16698,
    'business': 18114, 'business center': 18114,
  };

  for (const [keyword, id] of Object.entries(aliases)) {
    if (lower.includes(keyword)) return id;
  }
  return null;
}

type Intent =
  | { type: 'amenity_availability'; amenityId: number; date?: string }
  | { type: 'list_amenities' }
  | { type: 'list_bookings'; amenityId?: number }
  | { type: 'booking_calendar'; amenityId: number }
  | { type: 'announcements' }
  | { type: 'events' }
  | { type: 'dashboard' }
  | { type: 'greeting' }
  | { type: 'unknown' };

function classifyIntent(query: string): Intent {
  const lower = query.toLowerCase().trim();

  // Greeting
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(lower)) {
    return { type: 'greeting' };
  }

  const amenityId = findAmenityId(lower);

  // Availability/schedule questions
  if (/\b(available|availability|open|schedule|when can|when is|time slot|book|reserve)\b/.test(lower)) {
    if (amenityId) {
      // Try to extract a date
      const dateMatch = lower.match(/(\d{4}-\d{2}-\d{2})/);
      return { type: 'amenity_availability', amenityId, date: dateMatch?.[1] };
    }
    // Generic "what can I book"
    return { type: 'list_amenities' };
  }

  // Specific amenity mentioned without availability question
  if (amenityId && /\b(about|info|details|how|what|tell me)\b/.test(lower)) {
    return { type: 'amenity_availability', amenityId };
  }

  // Booking queries
  if (/\b(my booking|my reservation|booking status|reservation status)\b/.test(lower)) {
    return { type: 'list_bookings', amenityId: amenityId ?? undefined };
  }

  // Amenity listing
  if (/\b(amenity|amenities|facilities|what can i|what's available)\b/.test(lower)) {
    return { type: 'list_amenities' };
  }

  // Announcements
  if (/\b(announce|announcement|news|update|notice|bulletin)\b/.test(lower)) {
    return { type: 'announcements' };
  }

  // Events
  if (/\b(event|happening|upcoming|party|gathering|community event)\b/.test(lower)) {
    return { type: 'events' };
  }

  // Dashboard / general
  if (/\b(dashboard|overview|summary|what's going on|status)\b/.test(lower)) {
    return { type: 'dashboard' };
  }

  // If an amenity was mentioned at all, show its availability
  if (amenityId) {
    return { type: 'amenity_availability', amenityId };
  }

  return { type: 'unknown' };
}

function formatAmenityAvailability(data: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`**${data.amenityName}** — availability for ${data.date}:`);

  if (data.timeSlots && Array.isArray(data.timeSlots) && data.timeSlots.length > 0) {
    lines.push('\nAvailable time slots:');
    for (const slot of data.timeSlots as { label: string }[]) {
      lines.push(`  - ${slot.label}`);
    }
  } else {
    lines.push('\nNo specific time slots returned for this date.');
  }

  if (data.pricing) {
    const pricing = data.pricing as { fee?: string; cancellationPolicy?: string; rules?: string[] };
    if (pricing.fee) lines.push(`\nFee: ${pricing.fee}`);
    if (pricing.cancellationPolicy) lines.push(`Cancellation: ${pricing.cancellationPolicy}`);
    if (pricing.rules && pricing.rules.length > 0) {
      lines.push('\nRules:');
      for (const rule of pricing.rules.slice(0, 5)) {
        lines.push(`  - ${rule}`);
      }
    }
  }

  if (data.unavailableDates && Array.isArray(data.unavailableDates) && data.unavailableDates.length > 0) {
    const dates = data.unavailableDates as string[];
    lines.push(`\nUnavailable dates: ${dates.slice(0, 10).join(', ')}${dates.length > 10 ? '...' : ''}`);
  }

  return lines.join('\n');
}

function formatAmenityList(data: unknown): string {
  if (!Array.isArray(data)) return 'No amenities found.';

  const lines: string[] = ['Here are the available amenities at 77 Hudson:\n'];
  for (const amenity of data) {
    const a = amenity as { name?: string; fee?: string; id?: number };
    lines.push(`  - **${a.name ?? 'Unknown'}** ${a.fee ? `(${a.fee})` : ''}`);
  }
  lines.push('\nAsk me about any of these for availability and booking details!');
  return lines.join('\n');
}

function formatAnnouncements(data: unknown): string {
  if (!Array.isArray(data) || data.length === 0) return 'No recent announcements.';

  const lines: string[] = ['Recent building announcements:\n'];
  for (const item of data.slice(0, 5)) {
    const a = item as { title?: string; desc?: string; date?: string };
    lines.push(`  - **${a.title ?? 'Untitled'}**${a.date ? ` (${a.date})` : ''}`);
    if (a.desc) lines.push(`    ${a.desc.slice(0, 200)}`);
  }
  return lines.join('\n');
}

function formatBookings(data: unknown): string {
  if (!Array.isArray(data) || data.length === 0) return 'No bookings found.';

  const lines: string[] = ['Your bookings:\n'];
  for (const booking of data.slice(0, 10)) {
    const b = booking as { amenityName?: string; date?: string; time?: string; status?: string };
    lines.push(`  - **${b.amenityName ?? 'Unknown'}** — ${b.date ?? '?'} ${b.time ?? ''} [${b.status ?? '?'}]`);
  }
  return lines.join('\n');
}

function formatEvents(data: unknown): string {
  if (!data || typeof data !== 'object') return 'No event information available.';
  // Events endpoint returns calendarEvents or eventModel HTML
  const d = data as { calendarEvents?: unknown[]; eventModel?: string };
  if (d.calendarEvents && Array.isArray(d.calendarEvents) && d.calendarEvents.length > 0) {
    const lines: string[] = ['Upcoming events:\n'];
    for (const ev of d.calendarEvents.slice(0, 10)) {
      const e = ev as { title?: string; start?: string };
      lines.push(`  - **${e.title ?? 'Untitled'}** — ${e.start ?? ''}`);
    }
    return lines.join('\n');
  }
  return 'Check the Events section in your resident portal for upcoming community events.';
}

export async function processMessage(message: string): Promise<string> {
  try {
    await ensureClient();
  } catch (err) {
    log(`[chat] Client init failed: ${err instanceof Error ? err.message : err}`);
    return 'I\'m having trouble connecting to the building management system. Please try again in a moment.';
  }

  const intent = classifyIntent(message);
  log(`[chat] Query: "${message.slice(0, 100)}" → intent: ${intent.type}`);

  let result: ToolResult;

  switch (intent.type) {
    case 'greeting':
      return 'Hello! I\'m your building assistant for 77 Hudson. I can help with amenity availability, bookings, announcements, events, and more. What would you like to know?';

    case 'amenity_availability':
      result = await getAmenityAvailability({
        amenityId: intent.amenityId,
        date: intent.date,
      });
      if (!result.success) return `Sorry, I couldn't check availability: ${result.error}`;
      return formatAmenityAvailability(result.data as Record<string, unknown>);

    case 'list_amenities':
      result = await listAmenities();
      if (!result.success) return `Sorry, I couldn't fetch amenities: ${result.error}`;
      return formatAmenityList(result.data);

    case 'list_bookings':
      result = await listBookings(intent.amenityId ? { amenityId: intent.amenityId } : undefined);
      if (!result.success) return `Sorry, I couldn't fetch bookings: ${result.error}`;
      return formatBookings(result.data);

    case 'booking_calendar':
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      result = await getBookingCalendar({ amenityId: intent.amenityId, start: today, end: nextWeek });
      if (!result.success) return `Sorry, I couldn't fetch the calendar: ${result.error}`;
      return `Booking calendar for the next week:\n${JSON.stringify(result.data, null, 2)}`;

    case 'announcements':
      result = await listAnnouncements();
      if (!result.success) return `Sorry, I couldn't fetch announcements: ${result.error}`;
      return formatAnnouncements(result.data);

    case 'events':
      result = await listEvents();
      if (!result.success) return `Sorry, I couldn't fetch events: ${result.error}`;
      return formatEvents(result.data);

    case 'dashboard':
      result = await getDashboard();
      if (!result.success) return `Sorry, I couldn't fetch the dashboard: ${result.error}`;
      return 'Here\'s a summary of what\'s happening at 77 Hudson. Ask me about specific amenities, events, or announcements for more details!';

    case 'unknown':
    default:
      return 'I can help with:\n  - **Amenity availability** — "When is the grill available?"\n  - **Bookings** — "Show my bookings"\n  - **Announcements** — "Any announcements?"\n  - **Events** — "What events are coming up?"\n\nTry asking one of these!';
  }
}
