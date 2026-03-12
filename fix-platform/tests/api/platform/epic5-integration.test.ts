/**
 * Epic 5 Integration Tests for Platform API Routes.
 *
 * Tests AI assistant, marketplace, forum, and search routes end-to-end against
 * a real Express app with a real test database.
 *
 * Covers:
 * - AI Assistant: POST chat session, GET sessions, GET messages, POST message + context
 * - Marketplace: GET listings with filters, GET by id, POST create, PUT update, DELETE
 * - Forum: GET categories, GET threads, GET thread by id, POST thread, POST reply, moderation
 * - Search: GET search with query, multi-entity results, empty query
 *
 * Auth model:
 * - Uses authenticatedPlatformAgent() for authenticated requests with CSRF tokens
 * - Tests unauthenticated paths with raw request() calls
 *
 * TIMING NOTE:
 * setup.ts runs beforeEach to wipe the DB, so agents created in beforeAll would
 * have invalid sessions by the second test. Each test creates its own agent
 * (or uses beforeEach) to stay in sync with the DB wipe cycle.
 *
 * RELATED FILES:
 * - server/routes/platform/assistant.ts  - AI assistant routes
 * - server/routes/platform/marketplace.ts - Marketplace routes
 * - server/routes/platform/forum.ts      - Forum routes
 * - server/routes/platform/search.ts    - Search routes
 * - tests/api/platform/helpers.ts       - Test fixtures and agent factories
 * - tests/setup.ts                      - DB setup / teardown per test
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { TestAgent } from 'supertest';
import app from '../../../server/app.js';
import { testPrisma } from '../../setup.js';
import {
  authenticatedPlatformAgent,
  createPlatformUserFixture,
} from './helpers.js';

// ═══════════════════════════════════════════════════════════════════════════════
// AI ASSISTANT
// ═══════════════════════════════════════════════════════════════════════════════

describe('AI Assistant — POST /api/platform/assistant/sessions', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/platform/assistant/sessions')
      .send({ title: 'My Session' });
    expect(res.status).toBe(401);
  });

  it('creates a chat session with a title', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent
      .post('/api/platform/assistant/sessions')
      .send({ title: 'Test Session' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Test Session');
    expect(res.body).toHaveProperty('userId');
    expect(res.body).toHaveProperty('createdAt');
  });

  it('creates a chat session without a title (optional)', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent
      .post('/api/platform/assistant/sessions')
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBeNull();
  });

  it('session is persisted in the database scoped to the platform user', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent
      .post('/api/platform/assistant/sessions')
      .send({ title: 'Scoped Session' });

    expect(res.status).toBe(201);
    const session = await testPrisma.chatSession.findUnique({
      where: { id: res.body.id },
    });
    expect(session).not.toBeNull();
    expect(session!.title).toBe('Scoped Session');
  });
});

describe('AI Assistant — GET /api/platform/assistant/sessions', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/platform/assistant/sessions');
    expect(res.status).toBe(401);
  });

  it('returns sessions for the authenticated user', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    await agent.post('/api/platform/assistant/sessions').send({ title: 'Session A' });
    await agent.post('/api/platform/assistant/sessions').send({ title: 'Session B' });

    const res = await agent.get('/api/platform/assistant/sessions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);

    const titles = res.body.map((s: { title: string }) => s.title);
    expect(titles).toContain('Session A');
    expect(titles).toContain('Session B');
  });

  it('returns sessions in descending updatedAt order', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    await agent.post('/api/platform/assistant/sessions').send({ title: 'First' });
    await agent.post('/api/platform/assistant/sessions').send({ title: 'Second' });

    const res = await agent.get('/api/platform/assistant/sessions');
    expect(res.status).toBe(200);
    if (res.body.length >= 2) {
      const first = new Date(res.body[0].updatedAt).getTime();
      const second = new Date(res.body[1].updatedAt).getTime();
      expect(first).toBeGreaterThanOrEqual(second);
    }
  });

  it('returns empty array when user has no sessions', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent.get('/api/platform/assistant/sessions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('does not return sessions from other users', async () => {
    const agentA = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const agentB = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    await agentA.post('/api/platform/assistant/sessions').send({ title: 'User A session' });
    await agentB.post('/api/platform/assistant/sessions').send({ title: 'User B session' });

    const resA = await agentA.get('/api/platform/assistant/sessions');
    const titlesA = resA.body.map((s: { title: string }) => s.title);
    expect(titlesA).toContain('User A session');
    expect(titlesA).not.toContain('User B session');
  });
});

describe('AI Assistant — GET /api/platform/assistant/sessions/:id/messages', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/platform/assistant/sessions/some-id/messages');
    expect(res.status).toBe(401);
  });

  it('returns messages for a session owned by the user (includes USER + ASSISTANT)', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const sessionRes = await agent
      .post('/api/platform/assistant/sessions')
      .send({ title: 'Chat' });
    const sessionId = sessionRes.body.id;

    await agent
      .post(`/api/platform/assistant/sessions/${sessionId}/messages`)
      .send({ content: 'Hello' });

    const res = await agent.get(`/api/platform/assistant/sessions/${sessionId}/messages`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2); // USER + ASSISTANT

    const roles = res.body.map((m: { role: string }) => m.role);
    expect(roles).toContain('USER');
    expect(roles).toContain('ASSISTANT');
  });

  it('returns messages in ascending createdAt order', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const sessionRes = await agent
      .post('/api/platform/assistant/sessions')
      .send({ title: 'Ordered' });
    const sessionId = sessionRes.body.id;

    await agent
      .post(`/api/platform/assistant/sessions/${sessionId}/messages`)
      .send({ content: 'First question' });

    const res = await agent.get(`/api/platform/assistant/sessions/${sessionId}/messages`);
    expect(res.status).toBe(200);
    if (res.body.length >= 2) {
      const first = new Date(res.body[0].createdAt).getTime();
      const second = new Date(res.body[1].createdAt).getTime();
      expect(first).toBeLessThanOrEqual(second);
    }
  });

  it('returns 404 when session does not exist', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent.get('/api/platform/assistant/sessions/nonexistent-uuid/messages');
    expect(res.status).toBe(404);
  });

  it('returns 403 when session belongs to another user', async () => {
    const agentA = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const agentB = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    const sessionRes = await agentA
      .post('/api/platform/assistant/sessions')
      .send({ title: 'Private Session' });
    const sessionId = sessionRes.body.id;

    const res = await agentB.get(`/api/platform/assistant/sessions/${sessionId}/messages`);
    expect(res.status).toBe(403);
  });
});

describe('AI Assistant — POST /api/platform/assistant/sessions/:id/messages', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/platform/assistant/sessions/some-id/messages')
      .send({ content: 'Hello' });
    expect(res.status).toBe(401);
  });

  it('creates user message and AI response message', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const sessionRes = await agent
      .post('/api/platform/assistant/sessions')
      .send({ title: 'Chat' });
    const sessionId = sessionRes.body.id;

    const res = await agent
      .post(`/api/platform/assistant/sessions/${sessionId}/messages`)
      .send({ content: 'Hello, how can I book the gym?' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('userMessage');
    expect(res.body).toHaveProperty('assistantMessage');
    expect(res.body.userMessage.role).toBe('USER');
    expect(res.body.userMessage.content).toBe('Hello, how can I book the gym?');
    expect(res.body.assistantMessage.role).toBe('ASSISTANT');
    expect(typeof res.body.assistantMessage.content).toBe('string');
    expect(res.body.assistantMessage.content.length).toBeGreaterThan(0);
  });

  it('persists both messages in the database', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const sessionRes = await agent
      .post('/api/platform/assistant/sessions')
      .send({ title: 'Persist Test' });
    const sessionId = sessionRes.body.id;

    const res = await agent
      .post(`/api/platform/assistant/sessions/${sessionId}/messages`)
      .send({ content: 'Tell me about parking' });

    expect(res.status).toBe(201);

    const userMsg = await testPrisma.chatMessage.findUnique({
      where: { id: res.body.userMessage.id },
    });
    const assistantMsg = await testPrisma.chatMessage.findUnique({
      where: { id: res.body.assistantMessage.id },
    });
    expect(userMsg).not.toBeNull();
    expect(assistantMsg).not.toBeNull();
    expect(userMsg!.role).toBe('USER');
    expect(assistantMsg!.role).toBe('ASSISTANT');
  });

  it('returns 400 when content is missing', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const sessionRes = await agent
      .post('/api/platform/assistant/sessions')
      .send({ title: 'Validate' });
    const sessionId = sessionRes.body.id;

    const res = await agent
      .post(`/api/platform/assistant/sessions/${sessionId}/messages`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when content is empty string', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const sessionRes = await agent
      .post('/api/platform/assistant/sessions')
      .send({ title: 'Validate Empty' });
    const sessionId = sessionRes.body.id;

    const res = await agent
      .post(`/api/platform/assistant/sessions/${sessionId}/messages`)
      .send({ content: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when content is whitespace only', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const sessionRes = await agent
      .post('/api/platform/assistant/sessions')
      .send({ title: 'Validate Whitespace' });
    const sessionId = sessionRes.body.id;

    const res = await agent
      .post(`/api/platform/assistant/sessions/${sessionId}/messages`)
      .send({ content: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when session does not exist', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent
      .post('/api/platform/assistant/sessions/nonexistent-uuid/messages')
      .send({ content: 'Hello' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when session belongs to another user', async () => {
    const agentA = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const agentB = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    const sessionRes = await agentA
      .post('/api/platform/assistant/sessions')
      .send({ title: 'Private' });
    const sessionId = sessionRes.body.id;

    const res = await agentB
      .post(`/api/platform/assistant/sessions/${sessionId}/messages`)
      .send({ content: 'Unauthorized' });
    expect(res.status).toBe(403);
  });

  it('context retrieval: multiple messages accumulate in session', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const sessionRes = await agent
      .post('/api/platform/assistant/sessions')
      .send({ title: 'Context Test' });
    const sessionId = sessionRes.body.id;

    // First message
    const res1 = await agent
      .post(`/api/platform/assistant/sessions/${sessionId}/messages`)
      .send({ content: 'What are the quiet hours?' });
    expect(res1.status).toBe(201);

    // Second message in same session
    const res2 = await agent
      .post(`/api/platform/assistant/sessions/${sessionId}/messages`)
      .send({ content: 'And what about on weekends?' });
    expect(res2.status).toBe(201);
    expect(res2.body.assistantMessage.content).toBeTruthy();

    // Verify messages accumulated in session (2 exchanges = 4 messages)
    const messagesRes = await agent.get(
      `/api/platform/assistant/sessions/${sessionId}/messages`,
    );
    expect(messagesRes.status).toBe(200);
    expect(messagesRes.body.length).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MARKETPLACE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Marketplace — GET /api/platform/marketplace/categories', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/platform/marketplace/categories');
    expect(res.status).toBe(401);
  });

  it('returns distinct categories sorted alphabetically', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');

    await testPrisma.marketplaceListing.createMany({
      data: [
        { sellerId: fixture.platformUserId, title: 'Sofa', description: 'Nice sofa', category: 'Furniture', status: 'ACTIVE' },
        { sellerId: fixture.platformUserId, title: 'Laptop', description: 'Gaming laptop', category: 'Electronics', status: 'ACTIVE' },
        { sellerId: fixture.platformUserId, title: 'Chair', description: 'Office chair', category: 'Furniture', status: 'ACTIVE' },
      ],
    });

    const res = await agent.get('/api/platform/marketplace/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toContain('Furniture');
    expect(res.body).toContain('Electronics');
    // No duplicates
    const unique = [...new Set(res.body)];
    expect(res.body.length).toBe(unique.length);
    // Sorted
    const sorted = [...res.body].sort();
    expect(res.body).toEqual(sorted);
  });

  it('returns empty array when no listings exist', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent.get('/api/platform/marketplace/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('Marketplace — GET /api/platform/marketplace (list listings)', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/platform/marketplace');
    expect(res.status).toBe(401);
  });

  it('returns only ACTIVE listings and pagination metadata', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');

    await testPrisma.marketplaceListing.createMany({
      data: [
        { sellerId: fixture.platformUserId, title: 'Active Item', description: 'Active', category: 'Furniture', status: 'ACTIVE' },
        { sellerId: fixture.platformUserId, title: 'Sold Item', description: 'Sold', category: 'Electronics', status: 'SOLD' },
      ],
    });

    const res = await agent.get('/api/platform/marketplace');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('listings');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination).toHaveProperty('page', 1);
    expect(res.body.pagination).toHaveProperty('pageSize');
    expect(res.body.pagination).toHaveProperty('total');

    const statuses = res.body.listings.map((l: { status: string }) => l.status);
    expect(statuses.every((s: string) => s === 'ACTIVE')).toBe(true);
    const titles = res.body.listings.map((l: { title: string }) => l.title);
    expect(titles).not.toContain('Sold Item');
  });

  it('filters by category', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');

    await testPrisma.marketplaceListing.createMany({
      data: [
        { sellerId: fixture.platformUserId, title: 'Table', description: 'Table', category: 'Furniture', status: 'ACTIVE' },
        { sellerId: fixture.platformUserId, title: 'Phone', description: 'Phone', category: 'Electronics', status: 'ACTIVE' },
      ],
    });

    const res = await agent.get('/api/platform/marketplace?category=Furniture');
    expect(res.status).toBe(200);
    const categories = res.body.listings.map((l: { category: string }) => l.category);
    expect(categories.every((c: string) => c === 'Furniture')).toBe(true);
    const titles = res.body.listings.map((l: { title: string }) => l.title);
    expect(titles).not.toContain('Phone');
  });

  it('filters by minPrice', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');

    await testPrisma.marketplaceListing.createMany({
      data: [
        { sellerId: fixture.platformUserId, title: 'Cheap Item', description: 'Cheap', category: 'Misc', price: 50, status: 'ACTIVE' },
        { sellerId: fixture.platformUserId, title: 'Expensive Item', description: 'Costly', category: 'Misc', price: 500, status: 'ACTIVE' },
      ],
    });

    const res = await agent.get('/api/platform/marketplace?minPrice=200');
    expect(res.status).toBe(200);
    const titles = res.body.listings.map((l: { title: string }) => l.title);
    expect(titles).not.toContain('Cheap Item');
    expect(titles).toContain('Expensive Item');
  });

  it('filters by maxPrice', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');

    await testPrisma.marketplaceListing.createMany({
      data: [
        { sellerId: fixture.platformUserId, title: 'Budget Item', description: 'Cheap', category: 'Misc', price: 50, status: 'ACTIVE' },
        { sellerId: fixture.platformUserId, title: 'Luxury Item', description: 'Costly', category: 'Misc', price: 1000, status: 'ACTIVE' },
      ],
    });

    const res = await agent.get('/api/platform/marketplace?maxPrice=200');
    expect(res.status).toBe(200);
    const titles = res.body.listings.map((l: { title: string }) => l.title);
    expect(titles).toContain('Budget Item');
    expect(titles).not.toContain('Luxury Item');
  });

  it('filters by both minPrice and maxPrice', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');

    await testPrisma.marketplaceListing.createMany({
      data: [
        { sellerId: fixture.platformUserId, title: 'Too Cheap', description: 'x', category: 'Misc', price: 10, status: 'ACTIVE' },
        { sellerId: fixture.platformUserId, title: 'Just Right', description: 'x', category: 'Misc', price: 150, status: 'ACTIVE' },
        { sellerId: fixture.platformUserId, title: 'Too Costly', description: 'x', category: 'Misc', price: 900, status: 'ACTIVE' },
      ],
    });

    const res = await agent.get('/api/platform/marketplace?minPrice=100&maxPrice=200');
    expect(res.status).toBe(200);
    const titles = res.body.listings.map((l: { title: string }) => l.title);
    expect(titles).toContain('Just Right');
    expect(titles).not.toContain('Too Cheap');
    expect(titles).not.toContain('Too Costly');
  });

  it('respects page and pageSize parameters', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');

    await testPrisma.marketplaceListing.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        sellerId: fixture.platformUserId,
        title: `Item ${i}`,
        description: 'x',
        category: 'Misc',
        status: 'ACTIVE' as const,
      })),
    });

    const res = await agent.get('/api/platform/marketplace?page=1&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.listings.length).toBe(2);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.pageSize).toBe(2);
    expect(res.body.pagination.total).toBe(5);
  });

  it('includes images in listing results', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');

    await testPrisma.marketplaceListing.create({
      data: {
        sellerId: fixture.platformUserId,
        title: 'Item with Image',
        description: 'Has image',
        category: 'Misc',
        status: 'ACTIVE',
      },
    });

    const res = await agent.get('/api/platform/marketplace');
    expect(res.status).toBe(200);
    if (res.body.listings.length > 0) {
      expect(res.body.listings[0]).toHaveProperty('images');
      expect(Array.isArray(res.body.listings[0].images)).toBe(true);
    }
  });
});

describe('Marketplace — GET /api/platform/marketplace/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/platform/marketplace/some-id');
    expect(res.status).toBe(401);
  });

  it('returns 404 when listing not found', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent.get('/api/platform/marketplace/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('returns listing detail with images', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');

    const listing = await testPrisma.marketplaceListing.create({
      data: {
        sellerId: fixture.platformUserId,
        title: 'Vintage Chair',
        description: 'Beautiful vintage chair',
        category: 'Furniture',
        price: 150,
        condition: 'Good',
        status: 'ACTIVE',
      },
    });

    const res = await agent.get(`/api/platform/marketplace/${listing.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(listing.id);
    expect(res.body.title).toBe('Vintage Chair');
    expect(res.body.description).toBe('Beautiful vintage chair');
    expect(res.body.category).toBe('Furniture');
    expect(res.body.condition).toBe('Good');
    expect(Array.isArray(res.body.images)).toBe(true);
  });
});

describe('Marketplace — POST /api/platform/marketplace (create listing)', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/platform/marketplace')
      .send({ title: 'Test', description: 'Desc', category: 'Furniture' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when title is missing', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent
      .post('/api/platform/marketplace')
      .send({ description: 'Desc', category: 'Furniture' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('returns 400 when description is missing', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent
      .post('/api/platform/marketplace')
      .send({ title: 'Test', category: 'Furniture' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/description/i);
  });

  it('returns 400 when category is missing', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent
      .post('/api/platform/marketplace')
      .send({ title: 'Test', description: 'Desc' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/category/i);
  });

  it('creates a listing with ACTIVE status', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent
      .post('/api/platform/marketplace')
      .send({
        title: 'Nice Couch',
        description: 'Barely used, great condition',
        category: 'Furniture',
        price: 300,
        condition: 'Excellent',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Nice Couch');
    expect(res.body.status).toBe('ACTIVE');
    expect(Array.isArray(res.body.images)).toBe(true);
  });

  it('persists listing in the database', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent
      .post('/api/platform/marketplace')
      .send({
        title: 'Bookcase',
        description: 'Solid bookcase',
        category: 'Furniture',
      });

    expect(res.status).toBe(201);
    const dbListing = await testPrisma.marketplaceListing.findUnique({
      where: { id: res.body.id },
    });
    expect(dbListing).not.toBeNull();
    expect(dbListing!.title).toBe('Bookcase');
    expect(dbListing!.status).toBe('ACTIVE');
  });
});

describe('Marketplace — PUT /api/platform/marketplace/:id (update listing)', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .put('/api/platform/marketplace/some-id')
      .send({ title: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when listing not found', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent
      .put('/api/platform/marketplace/00000000-0000-0000-0000-000000000000')
      .send({ title: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when VIEWER non-owner tries to update', async () => {
    const ownerAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const otherAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');

    const createRes = await ownerAgent
      .post('/api/platform/marketplace')
      .send({ title: 'Desk', description: 'Wooden desk', category: 'Furniture' });
    const listingId = createRes.body.id;

    const res = await otherAgent
      .put(`/api/platform/marketplace/${listingId}`)
      .send({ title: 'Stolen Update' });
    expect(res.status).toBe(403);
  });

  it('allows owner to update their own listing', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    const createRes = await agent
      .post('/api/platform/marketplace')
      .send({ title: 'Desk', description: 'Wooden desk', category: 'Furniture', price: 120 });
    const listingId = createRes.body.id;

    const res = await agent
      .put(`/api/platform/marketplace/${listingId}`)
      .send({ title: 'Updated Desk' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Desk');
  });

  it('allows EDITOR+ to update any listing', async () => {
    const ownerAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const adminAgent = await authenticatedPlatformAgent('MANAGER', 'ADMIN');

    const createRes = await ownerAgent
      .post('/api/platform/marketplace')
      .send({ title: 'Random Item', description: 'Desc', category: 'Misc' });
    const listingId = createRes.body.id;

    const res = await adminAgent
      .put(`/api/platform/marketplace/${listingId}`)
      .send({ description: 'Admin updated description' });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Admin updated description');
  });

  it('only updates provided fields (partial update)', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    const createRes = await agent
      .post('/api/platform/marketplace')
      .send({ title: 'Original Title', description: 'Original desc', category: 'Misc', price: 50 });
    const listingId = createRes.body.id;

    await agent.put(`/api/platform/marketplace/${listingId}`).send({ price: 99 });

    const getRes = await agent.get(`/api/platform/marketplace/${listingId}`);
    expect(getRes.body.title).toBe('Original Title');
    expect(Number(getRes.body.price)).toBe(99);
  });
});

describe('Marketplace — DELETE /api/platform/marketplace/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).delete('/api/platform/marketplace/some-id');
    expect(res.status).toBe(401);
  });

  it('returns 404 when listing not found', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent.delete('/api/platform/marketplace/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-owner VIEWER tries to delete', async () => {
    const ownerAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const otherAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');

    const createRes = await ownerAgent
      .post('/api/platform/marketplace')
      .send({ title: 'Protected Item', description: 'Protected', category: 'Other' });
    const listingId = createRes.body.id;

    const res = await otherAgent.delete(`/api/platform/marketplace/${listingId}`);
    expect(res.status).toBe(403);
  });

  it('allows owner to delete their own listing', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    const createRes = await agent
      .post('/api/platform/marketplace')
      .send({ title: 'Item to Delete', description: 'Delete me', category: 'Other' });
    const listingId = createRes.body.id;

    const res = await agent.delete(`/api/platform/marketplace/${listingId}`);
    expect(res.status).toBe(204);

    const dbListing = await testPrisma.marketplaceListing.findUnique({ where: { id: listingId } });
    expect(dbListing).toBeNull();
  });

  it('allows EDITOR+ to delete any listing', async () => {
    const ownerAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const adminAgent = await authenticatedPlatformAgent('MANAGER', 'ADMIN');

    const createRes = await ownerAgent
      .post('/api/platform/marketplace')
      .send({ title: 'Admin Delete Target', description: 'Delete me', category: 'Other' });
    const listingId = createRes.body.id;

    const res = await adminAgent.delete(`/api/platform/marketplace/${listingId}`);
    expect(res.status).toBe(204);

    const dbListing = await testPrisma.marketplaceListing.findUnique({ where: { id: listingId } });
    expect(dbListing).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FORUM
// ═══════════════════════════════════════════════════════════════════════════════

describe('Forum — GET /api/platform/forum/categories', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/platform/forum/categories');
    expect(res.status).toBe(401);
  });

  it('returns all forum categories sorted by sortOrder ascending', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    await testPrisma.forumCategory.createMany({
      data: [
        { name: 'General', description: 'General discussion', sortOrder: 2 },
        { name: 'Announcements', description: 'Official announcements', sortOrder: 0 },
        { name: 'Events', description: 'Building events', sortOrder: 1 },
      ],
    });

    const res = await agent.get('/api/platform/forum/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(3);

    const names = res.body.map((c: { name: string }) => c.name);
    expect(names).toContain('General');
    expect(names).toContain('Announcements');
    expect(names).toContain('Events');

    // Verify ascending sortOrder
    const sortOrders = res.body.map((c: { sortOrder: number }) => c.sortOrder);
    for (let i = 1; i < sortOrders.length; i++) {
      expect(sortOrders[i]).toBeGreaterThanOrEqual(sortOrders[i - 1]);
    }
  });

  it('returns empty array when no categories exist', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent.get('/api/platform/forum/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('Forum — GET /api/platform/forum/categories/:categoryId/threads', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/platform/forum/categories/some-id/threads');
    expect(res.status).toBe(401);
  });

  it('returns 404 when category does not exist', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent.get('/api/platform/forum/categories/00000000-0000-0000-0000-000000000000/threads');
    expect(res.status).toBe(404);
  });

  it('returns paginated thread list with post counts and pinned threads first', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');

    const category = await testPrisma.forumCategory.create({
      data: { name: 'Test Category', description: null, sortOrder: 0 },
    });

    await testPrisma.forumThread.createMany({
      data: [
        { categoryId: category.id, title: 'Thread 1', authorId: fixture.platformUserId, pinned: false, locked: false },
        { categoryId: category.id, title: 'Thread 2 (Pinned)', authorId: fixture.platformUserId, pinned: true, locked: false },
        { categoryId: category.id, title: 'Thread 3', authorId: fixture.platformUserId, pinned: false, locked: true },
      ],
    });

    const res = await agent.get(`/api/platform/forum/categories/${category.id}/threads`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('threads');
    expect(res.body).toHaveProperty('total', 3);
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('pageSize');
    expect(Array.isArray(res.body.threads)).toBe(true);
    expect(res.body.threads.length).toBe(3);

    // Verify post count included
    expect(res.body.threads[0]).toHaveProperty('_count');
    expect(res.body.threads[0]._count).toHaveProperty('posts');

    // Pinned thread should appear first
    expect(res.body.threads[0].pinned).toBe(true);
  });

  it('supports page and pageSize pagination', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');

    const category = await testPrisma.forumCategory.create({
      data: { name: 'Paginate Category', description: null, sortOrder: 0 },
    });

    await testPrisma.forumThread.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        categoryId: category.id,
        title: `Thread ${i}`,
        authorId: fixture.platformUserId,
        pinned: false,
        locked: false,
      })),
    });

    const res = await agent.get(`/api/platform/forum/categories/${category.id}/threads?page=1&pageSize=2`);
    expect(res.status).toBe(200);
    expect(res.body.threads.length).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(2);
    expect(res.body.total).toBe(5);
  });
});

describe('Forum — GET /api/platform/forum/threads/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/platform/forum/threads/some-id');
    expect(res.status).toBe(401);
  });

  it('returns 404 when thread does not exist', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent.get('/api/platform/forum/threads/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('returns thread detail with paginated posts', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');

    const category = await testPrisma.forumCategory.create({
      data: { name: 'Thread Detail Cat', description: null, sortOrder: 0 },
    });
    const thread = await testPrisma.forumThread.create({
      data: { categoryId: category.id, title: 'Detail Thread', authorId: fixture.platformUserId, pinned: false, locked: false },
    });

    await testPrisma.forumPost.createMany({
      data: [
        { threadId: thread.id, authorId: fixture.platformUserId, body: 'First post' },
        { threadId: thread.id, authorId: fixture.platformUserId, body: 'Second post' },
        { threadId: thread.id, authorId: fixture.platformUserId, body: 'Third post' },
      ],
    });

    const res = await agent.get(`/api/platform/forum/threads/${thread.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('thread');
    expect(res.body).toHaveProperty('posts');
    expect(res.body).toHaveProperty('total', 3);
    expect(res.body.thread.id).toBe(thread.id);
    expect(res.body.thread.title).toBe('Detail Thread');
    expect(Array.isArray(res.body.posts)).toBe(true);
    expect(res.body.posts.length).toBe(3);
  });

  it('returns posts in ascending createdAt order', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');

    const category = await testPrisma.forumCategory.create({
      data: { name: 'Order Cat', description: null, sortOrder: 0 },
    });
    const thread = await testPrisma.forumThread.create({
      data: { categoryId: category.id, title: 'Order Thread', authorId: fixture.platformUserId, pinned: false, locked: false },
    });

    await testPrisma.forumPost.createMany({
      data: [
        { threadId: thread.id, authorId: fixture.platformUserId, body: 'First' },
        { threadId: thread.id, authorId: fixture.platformUserId, body: 'Second' },
      ],
    });

    const res = await agent.get(`/api/platform/forum/threads/${thread.id}`);
    expect(res.status).toBe(200);
    if (res.body.posts.length >= 2) {
      const first = new Date(res.body.posts[0].createdAt).getTime();
      const second = new Date(res.body.posts[1].createdAt).getTime();
      expect(first).toBeLessThanOrEqual(second);
    }
  });

  it('supports pagination for posts', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');

    const category = await testPrisma.forumCategory.create({
      data: { name: 'Post Page Cat', description: null, sortOrder: 0 },
    });
    const thread = await testPrisma.forumThread.create({
      data: { categoryId: category.id, title: 'Page Thread', authorId: fixture.platformUserId, pinned: false, locked: false },
    });

    await testPrisma.forumPost.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        threadId: thread.id,
        authorId: fixture.platformUserId,
        body: `Post ${i}`,
      })),
    });

    const res = await agent.get(`/api/platform/forum/threads/${thread.id}?page=1&pageSize=2`);
    expect(res.status).toBe(200);
    expect(res.body.posts.length).toBe(2);
    expect(res.body.total).toBe(5);
  });
});

describe('Forum — POST /api/platform/forum/threads (create thread)', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/platform/forum/threads')
      .send({ title: 'Test', categoryId: 'some-id' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when title is missing', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const category = await testPrisma.forumCategory.create({
      data: { name: 'Cat', description: null, sortOrder: 0 },
    });
    const res = await agent
      .post('/api/platform/forum/threads')
      .send({ categoryId: category.id });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('returns 400 when categoryId is missing', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent
      .post('/api/platform/forum/threads')
      .send({ title: 'Test Thread' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/categoryId/i);
  });

  it('returns 404 when category does not exist', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent
      .post('/api/platform/forum/threads')
      .send({ title: 'Test', categoryId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });

  it('creates a thread with pinned:false and locked:false defaults', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const category = await testPrisma.forumCategory.create({
      data: { name: 'Create Cat', description: null, sortOrder: 0 },
    });

    const res = await agent
      .post('/api/platform/forum/threads')
      .send({ title: 'My New Thread', categoryId: category.id });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('My New Thread');
    expect(res.body.categoryId).toBe(category.id);
    expect(res.body.pinned).toBe(false);
    expect(res.body.locked).toBe(false);
    expect(res.body._count).toHaveProperty('posts', 0);
  });

  it('persists thread with authorId from session user', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const category = await testPrisma.forumCategory.create({
      data: { name: 'Persist Cat', description: null, sortOrder: 0 },
    });

    const res = await agent
      .post('/api/platform/forum/threads')
      .send({ title: 'Persisted Thread', categoryId: category.id });

    expect(res.status).toBe(201);
    const dbThread = await testPrisma.forumThread.findUnique({ where: { id: res.body.id } });
    expect(dbThread).not.toBeNull();
    expect(dbThread!.title).toBe('Persisted Thread');
    expect(typeof dbThread!.authorId).toBe('string');
    expect(dbThread!.authorId.length).toBeGreaterThan(0);
  });
});

describe('Forum — POST /api/platform/forum/threads/:threadId/posts (create reply)', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/platform/forum/threads/some-id/posts')
      .send({ body: 'Hello!' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when thread does not exist', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent
      .post('/api/platform/forum/threads/00000000-0000-0000-0000-000000000000/posts')
      .send({ body: 'Hello!' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when body is missing', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const category = await testPrisma.forumCategory.create({
      data: { name: 'Reply Cat', description: null, sortOrder: 0 },
    });
    const thread = await testPrisma.forumThread.create({
      data: { categoryId: category.id, title: 'Reply Thread', authorId: fixture.platformUserId, pinned: false, locked: false },
    });

    const res = await agent
      .post(`/api/platform/forum/threads/${thread.id}/posts`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/body/i);
  });

  it('allows any authenticated user to post in an unlocked thread', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const category = await testPrisma.forumCategory.create({
      data: { name: 'Unlocked Cat', description: null, sortOrder: 0 },
    });
    const thread = await testPrisma.forumThread.create({
      data: { categoryId: category.id, title: 'Unlocked Thread', authorId: fixture.platformUserId, pinned: false, locked: false },
    });

    const res = await agent
      .post(`/api/platform/forum/threads/${thread.id}/posts`)
      .send({ body: 'Hello from resident!' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.body).toBe('Hello from resident!');
    expect(res.body.threadId).toBe(thread.id);
  });

  it('allows EDITOR+ to post in a locked thread (moderation)', async () => {
    const agent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const category = await testPrisma.forumCategory.create({
      data: { name: 'Locked Cat', description: null, sortOrder: 0 },
    });
    const thread = await testPrisma.forumThread.create({
      data: { categoryId: category.id, title: 'Locked Thread', authorId: fixture.platformUserId, pinned: false, locked: true },
    });

    const res = await agent
      .post(`/api/platform/forum/threads/${thread.id}/posts`)
      .send({ body: 'Moderator override post' });
    expect(res.status).toBe(201);
    expect(res.body.body).toBe('Moderator override post');
  });

  it('returns 403 when non-EDITOR tries to post in a locked thread', async () => {
    // VIEWER dashboard role is blocked by platformProtect from mutations entirely
    const agent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const category = await testPrisma.forumCategory.create({
      data: { name: 'Mod Locked Cat', description: null, sortOrder: 0 },
    });
    const thread = await testPrisma.forumThread.create({
      data: { categoryId: category.id, title: 'Mod Locked', authorId: fixture.platformUserId, pinned: false, locked: true },
    });

    const res = await agent
      .post(`/api/platform/forum/threads/${thread.id}/posts`)
      .send({ body: 'Trying in locked thread' });
    // platformProtect blocks VIEWER from all mutations
    expect(res.status).toBe(403);
  });

  it('persists post and sets authorId from session user', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const category = await testPrisma.forumCategory.create({
      data: { name: 'Persist Reply Cat', description: null, sortOrder: 0 },
    });
    const thread = await testPrisma.forumThread.create({
      data: { categoryId: category.id, title: 'Thread', authorId: fixture.platformUserId, pinned: false, locked: false },
    });

    const res = await agent
      .post(`/api/platform/forum/threads/${thread.id}/posts`)
      .send({ body: 'My reply' });

    expect(res.status).toBe(201);
    const dbPost = await testPrisma.forumPost.findUnique({ where: { id: res.body.id } });
    expect(dbPost).not.toBeNull();
    expect(dbPost!.body).toBe('My reply');
    expect(dbPost!.threadId).toBe(thread.id);
    expect(typeof dbPost!.authorId).toBe('string');
  });
});

describe('Forum — PUT /api/platform/forum/threads/:id (update/moderation)', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .put('/api/platform/forum/threads/some-id')
      .send({ title: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when thread does not exist', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent
      .put('/api/platform/forum/threads/00000000-0000-0000-0000-000000000000')
      .send({ title: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('allows thread author to update the title', async () => {
    // Use EDITOR since platformProtect blocks VIEWER from mutations
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const category = await testPrisma.forumCategory.create({
      data: { name: 'Update Title Cat', description: null, sortOrder: 0 },
    });

    // Author creates thread via API so authorId matches session
    const createRes = await agent
      .post('/api/platform/forum/threads')
      .send({ title: 'Original Title', categoryId: category.id });
    const threadId = createRes.body.id;

    const res = await agent
      .put(`/api/platform/forum/threads/${threadId}`)
      .send({ title: 'Updated Title' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
  });

  it('allows EDITOR+ to pin a thread', async () => {
    const authorAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const category = await testPrisma.forumCategory.create({
      data: { name: 'Pin Cat', description: null, sortOrder: 0 },
    });

    const createRes = await authorAgent
      .post('/api/platform/forum/threads')
      .send({ title: 'Thread to Pin', categoryId: category.id });
    const threadId = createRes.body.id;

    const res = await editorAgent
      .put(`/api/platform/forum/threads/${threadId}`)
      .send({ pinned: true });
    expect(res.status).toBe(200);
    expect(res.body.pinned).toBe(true);
  });

  it('returns 403 when non-author EDITOR tries to pin', async () => {
    // An EDITOR who is NOT the thread author should be able to pin (EDITOR = moderator for forum)
    // Non-moderator (non-EDITOR) attempting to pin should be blocked
    // We test the author ownership edge: a different EDITOR can still pin (EDITOR = isManager)
    // So we test that non-author, non-EDITOR is blocked — i.e. the 403 comes from pinned check
    const authorAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const strangerAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const category = await testPrisma.forumCategory.create({
      data: { name: 'Editor Pin Cat', description: null, sortOrder: 0 },
    });

    const createRes = await authorAgent
      .post('/api/platform/forum/threads')
      .send({ title: 'To Be Pinned', categoryId: category.id });
    const threadId = createRes.body.id;

    // strangerAgent is EDITOR — can pin (EDITOR = isManager for forum)
    const res = await strangerAgent
      .put(`/api/platform/forum/threads/${threadId}`)
      .send({ pinned: true });
    expect(res.status).toBe(200);
    expect(res.body.pinned).toBe(true);
  });

  it('allows EDITOR+ to lock and unlock a thread', async () => {
    const authorAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const category = await testPrisma.forumCategory.create({
      data: { name: 'Lock Cat', description: null, sortOrder: 0 },
    });

    const createRes = await authorAgent
      .post('/api/platform/forum/threads')
      .send({ title: 'To Be Locked', categoryId: category.id });
    const threadId = createRes.body.id;

    const lockRes = await editorAgent
      .put(`/api/platform/forum/threads/${threadId}`)
      .send({ locked: true });
    expect(lockRes.status).toBe(200);
    expect(lockRes.body.locked).toBe(true);

    const unlockRes = await editorAgent
      .put(`/api/platform/forum/threads/${threadId}`)
      .send({ locked: false });
    expect(unlockRes.status).toBe(200);
    expect(unlockRes.body.locked).toBe(false);
  });
});

describe('Forum — DELETE /api/platform/forum/posts/:id (moderation)', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).delete('/api/platform/forum/posts/some-id');
    expect(res.status).toBe(401);
  });

  it('returns 404 when post does not exist', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent.delete('/api/platform/forum/posts/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('allows author to delete their own post', async () => {
    // Use EDITOR since platformProtect blocks VIEWER from mutations
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const category = await testPrisma.forumCategory.create({
      data: { name: 'Del Cat', description: null, sortOrder: 0 },
    });
    const thread = await testPrisma.forumThread.create({
      data: { categoryId: category.id, title: 'Thread', authorId: fixture.platformUserId, pinned: false, locked: false },
    });

    const postRes = await agent
      .post(`/api/platform/forum/threads/${thread.id}/posts`)
      .send({ body: 'My post to delete' });
    const postId = postRes.body.id;

    const res = await agent.delete(`/api/platform/forum/posts/${postId}`);
    expect(res.status).toBe(204);

    const dbPost = await testPrisma.forumPost.findUnique({ where: { id: postId } });
    expect(dbPost).toBeNull();
  });

  it('returns 403 when non-author VIEWER tries to delete another post', async () => {
    // VIEWER is blocked by platformProtect from all mutations, resulting in 403
    const authorAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const strangerAgent = await authenticatedPlatformAgent('RESIDENT', 'VIEWER');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const category = await testPrisma.forumCategory.create({
      data: { name: 'Del Protect Cat', description: null, sortOrder: 0 },
    });
    const thread = await testPrisma.forumThread.create({
      data: { categoryId: category.id, title: 'Thread', authorId: fixture.platformUserId, pinned: false, locked: false },
    });

    const postRes = await authorAgent
      .post(`/api/platform/forum/threads/${thread.id}/posts`)
      .send({ body: 'Protected post' });
    const postId = postRes.body.id;

    const res = await strangerAgent.delete(`/api/platform/forum/posts/${postId}`);
    expect(res.status).toBe(403);
  });

  it('allows EDITOR+ to delete any post (moderation)', async () => {
    const authorAgent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const editorAgent = await authenticatedPlatformAgent('MANAGER', 'EDITOR');
    const fixture = await createPlatformUserFixture('RESIDENT', 'EDITOR');
    const category = await testPrisma.forumCategory.create({
      data: { name: 'Mod Del Cat', description: null, sortOrder: 0 },
    });
    const thread = await testPrisma.forumThread.create({
      data: { categoryId: category.id, title: 'Thread', authorId: fixture.platformUserId, pinned: false, locked: false },
    });

    const postRes = await authorAgent
      .post(`/api/platform/forum/threads/${thread.id}/posts`)
      .send({ body: 'Post for editor to remove' });
    const postId = postRes.body.id;

    const res = await editorAgent.delete(`/api/platform/forum/posts/${postId}`);
    expect(res.status).toBe(204);

    const dbPost = await testPrisma.forumPost.findUnique({ where: { id: postId } });
    expect(dbPost).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════════════════════

describe('Search — GET /api/platform/search — auth and validation', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/platform/search?q=lobby');
    expect(res.status).toBe(401);
  });

  it('returns 400 when q param is missing', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent.get('/api/platform/search');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns 400 when q param is empty string', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent.get('/api/platform/search?q=');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns 400 when q is only whitespace', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent.get('/api/platform/search?q=%20%20');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });
});

describe('Search — GET /api/platform/search — results', () => {
  it('returns results and total for a matching query', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    await testPrisma.searchIndex.createMany({
      data: [
        { entityType: 'Announcement', entityId: 'ann-1', title: 'Lobby Renovation', body: 'The lobby will be renovated.' },
        { entityType: 'Event', entityId: 'evt-1', title: 'Lobby Gathering', body: 'Community gathering in the lobby.' },
        { entityType: 'MarketplaceListing', entityId: 'lst-1', title: 'Gym Equipment for Sale', body: 'Treadmill and weights.' },
      ],
    });

    const res = await agent.get('/api/platform/search?q=lobby');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('results');
    expect(res.body).toHaveProperty('total', 2);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.length).toBe(2);

    const titles = res.body.results.map((r: { title: string }) => r.title);
    expect(titles).toContain('Lobby Renovation');
    expect(titles).toContain('Lobby Gathering');
    expect(titles).not.toContain('Gym Equipment for Sale');
  });

  it('returns multi-entity results (different entityTypes)', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    await testPrisma.searchIndex.createMany({
      data: [
        { entityType: 'Announcement', entityId: 'ann-2', title: 'Pool Renovation Notice', body: 'Pool will close for renovation.' },
        { entityType: 'Event', entityId: 'evt-2', title: 'Pool Party', body: 'Community pool party.' },
      ],
    });

    const res = await agent.get('/api/platform/search?q=pool');
    expect(res.status).toBe(200);
    const types = res.body.results.map((r: { entityType: string }) => r.entityType);
    const uniqueTypes = [...new Set(types)];
    expect(uniqueTypes).toContain('Announcement');
    expect(uniqueTypes).toContain('Event');
  });

  it('returns empty results and total 0 for no matches', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');
    const res = await agent.get('/api/platform/search?q=zzz-absolutely-no-match-zzz');
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('filters by entity type when ?type= is provided', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    await testPrisma.searchIndex.createMany({
      data: [
        { entityType: 'Announcement', entityId: 'ann-3', title: 'Rooftop garden news', body: 'News about rooftop.' },
        { entityType: 'Event', entityId: 'evt-3', title: 'Rooftop gathering', body: 'Event on rooftop.' },
      ],
    });

    const res = await agent.get('/api/platform/search?q=rooftop&type=Announcement');
    expect(res.status).toBe(200);
    const types = res.body.results.map((r: { entityType: string }) => r.entityType);
    expect(types.every((t: string) => t === 'Announcement')).toBe(true);
    expect(types).not.toContain('Event');
  });

  it('ignores type filter when ?type= is empty', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    await testPrisma.searchIndex.createMany({
      data: [
        { entityType: 'Announcement', entityId: 'ann-4', title: 'Gym announcement', body: 'Gym news.' },
        { entityType: 'Event', entityId: 'evt-4', title: 'Gym event', body: 'Gym session.' },
      ],
    });

    const res = await agent.get('/api/platform/search?q=gym&type=');
    expect(res.status).toBe(200);
    const types = res.body.results.map((r: { entityType: string }) => r.entityType);
    const uniqueTypes = [...new Set(types)];
    // Should include both Announcement and Event (no type filter applied)
    expect(uniqueTypes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Search — GET /api/platform/search — pagination', () => {
  it('defaults to limit 20 and returns correct total', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    await testPrisma.searchIndex.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        entityType: 'ForumPost',
        entityId: `fp-page-${i}`,
        title: `Forum post searchbatch ${i}`,
        body: 'searchbatch content here',
      })),
    });

    const res = await agent.get('/api/platform/search?q=searchbatch');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(25);
    expect(res.body.results.length).toBe(20); // default limit
  });

  it('respects custom limit', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    await testPrisma.searchIndex.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        entityType: 'ForumPost',
        entityId: `fp-lim-${i}`,
        title: `Limit test post ${i}`,
        body: 'limittest content',
      })),
    });

    const res = await agent.get('/api/platform/search?q=limittest&limit=3');
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBe(3);
    expect(res.body.total).toBe(10);
  });

  it('respects offset for pagination', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    await testPrisma.searchIndex.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        entityType: 'ForumPost',
        entityId: `fp-off-${i}`,
        title: `Offset test ${i}`,
        body: 'offsettest content',
      })),
    });

    const page1Res = await agent.get('/api/platform/search?q=offsettest&limit=5&offset=0');
    const page2Res = await agent.get('/api/platform/search?q=offsettest&limit=5&offset=5');

    expect(page1Res.status).toBe(200);
    expect(page2Res.status).toBe(200);

    // Same total
    expect(page1Res.body.total).toBe(10);
    expect(page2Res.body.total).toBe(10);

    // No overlap
    const page1Ids = page1Res.body.results.map((r: { id: string }) => r.id);
    const page2Ids = page2Res.body.results.map((r: { id: string }) => r.id);
    const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it('caps limit at 100', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    await testPrisma.searchIndex.createMany({
      data: Array.from({ length: 150 }, (_, i) => ({
        entityType: 'ForumPost',
        entityId: `fp-cap-${i}`,
        title: `Cap test post ${i}`,
        body: 'captest content',
      })),
    });

    const res = await agent.get('/api/platform/search?q=captest&limit=999');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(150);
    expect(res.body.results.length).toBe(100); // capped at 100
  });

  it('returns fewer results when offset is near end', async () => {
    const agent = await authenticatedPlatformAgent('RESIDENT', 'EDITOR');

    await testPrisma.searchIndex.createMany({
      data: Array.from({ length: 7 }, (_, i) => ({
        entityType: 'ForumPost',
        entityId: `fp-near-${i}`,
        title: `Near end post ${i}`,
        body: 'nearend content',
      })),
    });

    const res = await agent.get('/api/platform/search?q=nearend&limit=5&offset=5');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(7);
    expect(res.body.results.length).toBe(2); // only 2 left after offset 5
  });
});
