import type { Request, Response } from 'express';

const MAX_CLIENTS = 100;
const KEEPALIVE_INTERVAL_MS = 30_000;

// Global clients: no channel filter — receive all broadcasts
const globalClients = new Set<Response>();

// Channel-specific clients: keyed by channel name
const channelClients = new Map<string, Set<Response>>();

function totalClients(): number {
  let count = globalClients.size;
  for (const set of channelClients.values()) {
    count += set.size;
  }
  return count;
}

export function sseHandler(req: Request, res: Response) {
  if (totalClients() >= MAX_CLIENTS) {
    res.status(503).json({ error: 'Too many SSE connections' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Determine if the client is subscribing to a named channel
  const channel = typeof req.query.channel === 'string' ? req.query.channel : undefined;

  if (channel) {
    if (!channelClients.has(channel)) {
      channelClients.set(channel, new Set());
    }
    channelClients.get(channel)!.add(res);
  } else {
    globalClients.add(res);
  }

  // Send keepalive comments to prevent proxy timeouts
  const keepalive = setInterval(() => {
    try {
      res.write(':\n\n');
    } catch {
      cleanup();
    }
  }, KEEPALIVE_INTERVAL_MS);

  function cleanup() {
    clearInterval(keepalive);
    if (channel) {
      const set = channelClients.get(channel);
      if (set) {
        set.delete(res);
        if (set.size === 0) {
          channelClients.delete(channel);
        }
      }
    } else {
      globalClients.delete(res);
    }
  }

  req.on('close', cleanup);
}

/**
 * Broadcast a typed event with a JSON payload to a specific channel.
 *
 * @param channel - Channel name. Only clients subscribed to this channel receive the event.
 * @param eventType - SSE event type (e.g. 'announcement:new').
 * @param payload - JSON-serializable payload to send as the event data.
 */
export function broadcastEvent(channel: string, eventType: string, payload: unknown) {
  const targets = channelClients.get(channel);
  if (!targets) return;
  const message = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of targets) {
    try {
      client.write(message);
    } catch {
      targets.delete(client);
    }
  }
}

/**
 * Broadcast a refresh event.
 *
 * @param channel - Optional channel name. When provided, only clients
 *   subscribed to that channel receive the event. When omitted, ALL
 *   clients receive the event (backwards compatible).
 */
export function broadcast(channel?: string) {
  if (channel !== undefined) {
    // Targeted broadcast — only channel subscribers
    const targets = channelClients.get(channel);
    if (!targets) return;
    for (const client of targets) {
      try {
        client.write('data: refresh\n\n');
      } catch {
        targets.delete(client);
      }
    }
  } else {
    // Global broadcast — all clients (global + all channel subscribers)
    for (const client of globalClients) {
      try {
        client.write('data: refresh\n\n');
      } catch {
        globalClients.delete(client);
      }
    }
    for (const targets of channelClients.values()) {
      for (const client of targets) {
        try {
          client.write('data: refresh\n\n');
        } catch {
          targets.delete(client);
        }
      }
    }
  }
}

