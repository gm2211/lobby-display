/**
 * Groq LLM Engine — uses Groq's OpenAI-compatible API for chat with MCP tool results.
 *
 * Flow:
 * 1. User sends message
 * 2. We call relevant tools based on keywords (same as chat-engine.ts)
 * 3. We send the user message + tool results as context to Groq LLM
 * 4. Groq generates a natural language response
 *
 * Requires GROQ_API_KEY env var.
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

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

let clientReady = false;

async function ensureClient(): Promise<void> {
  if (clientReady) return;
  await initializeClient();
  clientReady = true;
}

/** Match an amenity name from the user query — same logic as chat-engine. */
function findAmenityId(query: string): number | null {
  const lower = query.toLowerCase();
  const aliases: Record<string, number> = {
    'grill': 12293, 'bbq': 12293, 'barbecue': 12293,
    'cinema': 12294, 'screening': 12294, 'movie': 12294,
    'cafe': 12295, 'dining': 12295,
    'golf front': 12273, 'front bay': 12273,
    'golf rear': 12274, 'rear bay': 12274, 'golf': 12273,
    'pet': 12299, 'grooming': 12299,
    'move': 12301, 'moving': 12301,
    'spa': 12304, 'massage': 12304,
    'studio': 12306,
    'yoga': 12307,
    'delivery': 16698, 'deliveries': 16698,
    'business': 18114,
  };
  for (const [keyword, id] of Object.entries(aliases)) {
    if (lower.includes(keyword)) return id;
  }
  return null;
}

/** Gather relevant context by calling MCP tools based on the query. */
async function gatherContext(query: string): Promise<string> {
  const lower = query.toLowerCase();
  const contextParts: string[] = [];

  try {
    await ensureClient();
  } catch (err) {
    return 'Building management system is currently unavailable.';
  }

  const amenityId = findAmenityId(lower);

  // Fetch relevant data in parallel based on query content
  const promises: Promise<void>[] = [];

  if (amenityId || /\b(amenity|amenities|book|reserve|available|schedule|grill|pool|gym|cinema|spa|yoga|golf|studio)\b/.test(lower)) {
    if (amenityId) {
      promises.push(
        getAmenityAvailability({ amenityId }).then(r => {
          if (r.success) contextParts.push(`Amenity availability:\n${JSON.stringify(r.data, null, 2)}`);
        })
      );
    }
    promises.push(
      listAmenities().then(r => {
        if (r.success) contextParts.push(`Available amenities:\n${JSON.stringify(r.data, null, 2)}`);
      })
    );
  }

  if (/\b(announce|news|update|notice|bulletin)\b/.test(lower)) {
    promises.push(
      listAnnouncements().then(r => {
        if (r.success) contextParts.push(`Recent announcements:\n${JSON.stringify(r.data, null, 2)}`);
      })
    );
  }

  if (/\b(event|happening|upcoming|party|gathering)\b/.test(lower)) {
    promises.push(
      listEvents().then(r => {
        if (r.success) contextParts.push(`Events:\n${JSON.stringify(r.data, null, 2)}`);
      })
    );
  }

  if (/\b(booking|reservation|my booking)\b/.test(lower)) {
    promises.push(
      listBookings(amenityId ? { amenityId } : undefined).then(r => {
        if (r.success) contextParts.push(`Bookings:\n${JSON.stringify(r.data, null, 2)}`);
      })
    );
  }

  // If no specific intent matched, get dashboard overview
  if (promises.length === 0) {
    promises.push(
      listAmenities().then(r => {
        if (r.success) contextParts.push(`Available amenities:\n${JSON.stringify(r.data, null, 2)}`);
      }),
      listAnnouncements().then(r => {
        if (r.success) contextParts.push(`Recent announcements:\n${JSON.stringify(r.data, null, 2)}`);
      })
    );
  }

  await Promise.allSettled(promises);
  return contextParts.join('\n\n') || 'No additional context available.';
}

const SYSTEM_PROMPT = `You are a helpful building assistant for 77 Hudson Condominium. You help residents with:
- Amenity availability and booking information (BBQ Grill, Cinema, Golf, Spa, Yoga, Studio, etc.)
- Building announcements and news
- Community events
- General building questions

You have access to real-time building data provided as context. Use this data to give accurate, specific answers.
Be concise, friendly, and helpful. Format responses clearly with bullet points or sections when appropriate.
If the context doesn't contain relevant information, say so honestly and suggest what the resident can do.

Available amenities at 77 Hudson:
${Object.values(AMENITIES).map(a => `- ${a.name} (ID: ${a.id}${a.fee ? `, ${a.fee}` : ''})`).join('\n')}`;

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function processMessageWithGroq(
  message: string,
  history: GroqMessage[] = []
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return 'Groq API key not configured. Set GROQ_API_KEY environment variable.';
  }

  // Gather context from MCP tools
  log(`[groq] Gathering context for: "${message.slice(0, 100)}"`);
  const context = await gatherContext(message);

  // Build messages array
  const messages: GroqMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-10), // Keep last 10 messages for context
    {
      role: 'user',
      content: `Building data context:\n${context}\n\nResident question: ${message}`,
    },
  ];

  try {
    log(`[groq] Calling ${GROQ_MODEL} with ${messages.length} messages`);
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      log(`[groq] API error: ${response.status} ${errorText.slice(0, 200)}`);
      return `AI service error (${response.status}). Please try again.`;
    }

    const data = await response.json() as {
      choices: { message: { content: string } }[];
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return 'I received an empty response. Please try again.';
    }

    log(`[groq] Response: ${content.slice(0, 100)}...`);
    return content;
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return 'The AI service took too long to respond. Please try again.';
    }
    log(`[groq] Error: ${err instanceof Error ? err.message : err}`);
    return 'Sorry, I encountered an error. Please try again.';
  }
}
