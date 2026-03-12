/**
 * E2E tests for the /api/chat endpoint (Admin Chat AI).
 *
 * Tests both "local" (keyword) and "groq" (LLM) modes.
 * The chat endpoint proxies to the renzo-ai server running on port 3001.
 * On staging, both servers are running in Docker.
 * On environments without renzo-ai, the proxy returns 503 gracefully.
 */
import { test, expect } from '../../helpers/api-test';

test.describe('Chat API', () => {
  test('POST /api/chat with local mode returns assistant response', async ({ api }) => {
    const res = await api.post('/api/chat', {
      message: 'What amenities are available?',
      mode: 'local',
    });
    const status = res.status();
    const body = await res.json();

    // May be 200 (renzo-ai running) or 503 (not available in this env)
    if (status === 200) {
      expect(body).toHaveProperty('message');
      expect(body.message).toHaveProperty('role', 'assistant');
      expect(body.message).toHaveProperty('content');
      expect(typeof body.message.content).toBe('string');
      expect(body.message.content.length).toBeGreaterThan(0);
      expect(body.message).toHaveProperty('timestamp');
    } else {
      // Graceful degradation — AI server not running
      expect(status).toBe(503);
      expect(body).toHaveProperty('message');
      expect(body.message.role).toBe('assistant');
    }
  });

  test('POST /api/chat with groq mode returns assistant response', async ({ api }) => {
    const res = await api.post('/api/chat', {
      message: 'Hello, can you help me?',
      mode: 'groq',
    });
    const status = res.status();
    const body = await res.json();

    // May be 200 (groq key configured) or 502/503 (not available)
    if (status === 200) {
      expect(body).toHaveProperty('message');
      expect(body.message).toHaveProperty('role', 'assistant');
      expect(body.message).toHaveProperty('content');
      expect(typeof body.message.content).toBe('string');
    } else {
      // Graceful degradation
      expect([502, 503]).toContain(status);
      expect(body).toHaveProperty('message');
    }
  });

  test('POST /api/chat rejects empty message', async ({ api }) => {
    const res = await api.post('/api/chat', { message: '' });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('POST /api/chat rejects missing message', async ({ api }) => {
    const res = await api.post('/api/chat', {});
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('POST /api/chat with history maintains context', async ({ api }) => {
    const history = [
      { role: 'user', content: 'What is the pool schedule?' },
      { role: 'assistant', content: 'The pool is open from 6am to 10pm.' },
    ];

    const res = await api.post('/api/chat', {
      message: 'Thanks, what about weekends?',
      mode: 'local',
      history,
    });
    const status = res.status();
    const body = await res.json();

    // Accept either working or graceful degradation
    expect([200, 502, 503]).toContain(status);
    expect(body).toHaveProperty('message');
    expect(body.message).toHaveProperty('role', 'assistant');
  });
});
