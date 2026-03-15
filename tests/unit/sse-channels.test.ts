/**
 * SSE Channel Extension Tests
 *
 * Tests for named channel support in the SSE module.
 * Channels allow targeted broadcasts to specific subscribers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// We import the module fresh for each test via dynamic import to avoid
// module-level state contamination between tests.
// Instead, we use a helper to build mock req/res objects.

function mockResponse(): Response {
  const res: Partial<Response> = {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn().mockReturnValue(true),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

function mockRequest(query: Record<string, string> = {}): Request {
  const listeners: Record<string, Array<() => void>> = {};
  const req: Partial<Request> = {
    query,
    on: vi.fn((event: string, handler: () => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
      return req as Request;
    }),
    emit: vi.fn((event: string) => {
      (listeners[event] || []).forEach(fn => fn());
      return true;
    }),
  };
  return req as Request;
}

describe('SSE Channel Extension', () => {
  // Re-import the module for each test group to get a clean state
  // We use vi.resetModules() in beforeEach to reset module singletons
  beforeEach(() => {
    vi.resetModules();
  });

  describe('sseHandler — channel subscription via query param', () => {
    it('registers a client without channel (unfiltered / global subscriber)', async () => {
      const { sseHandler, broadcast } = await import('../../server/sse.js');
      const req = mockRequest();
      const res = mockResponse();

      sseHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.flushHeaders).toHaveBeenCalled();
    });

    it('registers a client with a specific channel via query param', async () => {
      const { sseHandler } = await import('../../server/sse.js');
      const req = mockRequest({ channel: 'dashboard:updates' });
      const res = mockResponse();

      sseHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.flushHeaders).toHaveBeenCalled();
    });
  });

  describe('broadcast() — channel-targeted delivery', () => {
    it('broadcasts to all clients when no channel is specified (backwards compatible)', async () => {
      const { sseHandler, broadcast } = await import('../../server/sse.js');

      const req1 = mockRequest(); // no channel
      const res1 = mockResponse();
      const req2 = mockRequest({ channel: 'dashboard:updates' });
      const res2 = mockResponse();
      const req3 = mockRequest({ channel: 'dashboard:advisories' });
      const res3 = mockResponse();

      sseHandler(req1, res1);
      sseHandler(req2, res2);
      sseHandler(req3, res3);

      // broadcast with no channel — all clients should receive
      broadcast();

      expect(res1.write).toHaveBeenCalledWith('data: refresh\n\n');
      expect(res2.write).toHaveBeenCalledWith('data: refresh\n\n');
      expect(res3.write).toHaveBeenCalledWith('data: refresh\n\n');
    });

    it('broadcasts only to subscribers of the specified channel', async () => {
      const { sseHandler, broadcast } = await import('../../server/sse.js');

      const req1 = mockRequest(); // global subscriber (no channel)
      const res1 = mockResponse();
      const req2 = mockRequest({ channel: 'dashboard:updates' });
      const res2 = mockResponse();
      const req3 = mockRequest({ channel: 'dashboard:advisories' });
      const res3 = mockResponse();

      sseHandler(req1, res1);
      sseHandler(req2, res2);
      sseHandler(req3, res3);

      // broadcast to 'dashboard:updates' channel only
      broadcast('dashboard:updates');

      expect(res2.write).toHaveBeenCalledWith('data: refresh\n\n');
      // global subscriber and maintenance subscriber should NOT receive
      expect(res1.write).not.toHaveBeenCalled();
      expect(res3.write).not.toHaveBeenCalled();
    });

    it('broadcasts only to subscribers of dashboard:advisories channel', async () => {
      const { sseHandler, broadcast } = await import('../../server/sse.js');

      const req1 = mockRequest({ channel: 'dashboard:updates' });
      const res1 = mockResponse();
      const req2 = mockRequest({ channel: 'dashboard:advisories' });
      const res2 = mockResponse();

      sseHandler(req1, res1);
      sseHandler(req2, res2);

      broadcast('dashboard:advisories');

      expect(res2.write).toHaveBeenCalledWith('data: refresh\n\n');
      expect(res1.write).not.toHaveBeenCalled();
    });

    it('does not error when broadcasting to a channel with no subscribers', async () => {
      const { sseHandler, broadcast } = await import('../../server/sse.js');

      const req1 = mockRequest({ channel: 'dashboard:updates' });
      const res1 = mockResponse();
      sseHandler(req1, res1);

      // No subscribers for this channel
      expect(() => broadcast('dashboard:advisories')).not.toThrow();
      expect(res1.write).not.toHaveBeenCalled();
    });

    it('broadcasts nothing when channel is specified but no clients are connected', async () => {
      const { broadcast } = await import('../../server/sse.js');
      // No clients registered
      expect(() => broadcast('dashboard:updates')).not.toThrow();
    });
  });

  describe('cleanup on client disconnect', () => {
    it('removes client from channel subscription on connection close', async () => {
      const { sseHandler, broadcast } = await import('../../server/sse.js');

      const req = mockRequest({ channel: 'dashboard:updates' });
      const res = mockResponse();
      sseHandler(req, res);

      // simulate client disconnect
      (req.emit as ReturnType<typeof vi.fn>)('close');

      // clear the mock call count after disconnect
      vi.mocked(res.write).mockClear();

      broadcast('dashboard:updates');
      expect(res.write).not.toHaveBeenCalled();
    });

    it('removes global (no-channel) client on connection close', async () => {
      const { sseHandler, broadcast } = await import('../../server/sse.js');

      const req = mockRequest();
      const res = mockResponse();
      sseHandler(req, res);

      (req.emit as ReturnType<typeof vi.fn>)('close');
      vi.mocked(res.write).mockClear();

      broadcast();
      expect(res.write).not.toHaveBeenCalled();
    });
  });

  describe('MAX_CLIENTS limit still applies', () => {
    it('returns 503 when too many clients are connected', async () => {
      const { sseHandler } = await import('../../server/sse.js');

      // Connect 100 clients
      for (let i = 0; i < 100; i++) {
        const req = mockRequest();
        const res = mockResponse();
        sseHandler(req, res);
      }

      // 101st client should be rejected
      const req = mockRequest();
      const res = mockResponse();
      sseHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'Too many SSE connections' });
    });
  });

  describe('multiple subscribers on same channel', () => {
    it('delivers to all subscribers of the same channel', async () => {
      const { sseHandler, broadcast } = await import('../../server/sse.js');

      const req1 = mockRequest({ channel: 'dashboard:updates' });
      const res1 = mockResponse();
      const req2 = mockRequest({ channel: 'dashboard:updates' });
      const res2 = mockResponse();
      const req3 = mockRequest({ channel: 'dashboard:updates' });
      const res3 = mockResponse();

      sseHandler(req1, res1);
      sseHandler(req2, res2);
      sseHandler(req3, res3);

      broadcast('dashboard:updates');

      expect(res1.write).toHaveBeenCalledWith('data: refresh\n\n');
      expect(res2.write).toHaveBeenCalledWith('data: refresh\n\n');
      expect(res3.write).toHaveBeenCalledWith('data: refresh\n\n');
    });
  });
});
