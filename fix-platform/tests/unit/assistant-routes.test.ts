/**
 * Unit tests for AI Assistant API routes.
 *
 * Uses vi.mock to mock Prisma and LLM provider so no database or AI calls are needed.
 * Tests follow TDD: written first, then routes are implemented.
 *
 * Routes tested:
 *  - POST /sessions             - create chat session for authenticated user
 *  - GET /sessions              - list user's chat sessions
 *  - GET /sessions/:id/messages - get messages for a session
 *  - POST /sessions/:id/messages - send message, get AI response
 *
 * Auth model:
 *  - All routes require authentication (platformUser attached via platformProtectStrict)
 *  - Sessions are scoped to the authenticated user
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock Prisma before importing routes
vi.mock('../../server/db.js', () => ({
  default: {
    platformUser: {
      findUnique: vi.fn(),
    },
    chatSession: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    chatMessage: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock LLM provider
vi.mock('../../server/services/llmProvider.js', () => ({
  getLLMProvider: vi.fn(),
}));

import prisma from '../../server/db.js';
import * as llmProviderModule from '../../server/services/llmProvider.js';
import assistantRouter from '../../server/routes/platform/assistant.js';

// Type helpers for mocked Prisma functions
const mockPrisma = prisma as {
  platformUser: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  chatSession: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  chatMessage: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

const mockGetLLMProvider = llmProviderModule.getLLMProvider as ReturnType<typeof vi.fn>;

/**
 * Build a minimal Express app with a session user.
 * sessionRole is the dashboard role (ADMIN/EDITOR/VIEWER).
 * platformRole is the PlatformUser role (MANAGER/RESIDENT/etc).
 */
function buildApp(
  sessionRole: 'ADMIN' | 'EDITOR' | 'VIEWER' | null = 'ADMIN',
  userId: string = 'user-uuid-1',
  platformRole: 'RESIDENT' | 'BOARD_MEMBER' | 'MANAGER' | 'SECURITY' | 'CONCIERGE' = 'RESIDENT',
  platformUserId: string = 'platform-user-uuid-1'
) {
  const app = express();
  app.use(express.json());

  // Inject mock session
  app.use((req: any, _res, next) => {
    if (sessionRole !== null) {
      req.session = { user: { id: userId, username: 'testuser', role: sessionRole } };
    } else {
      req.session = {};
    }
    next();
  });

  // Configure mock platformUser.findUnique so platformProtectStrict can run
  if (sessionRole !== null) {
    mockPrisma.platformUser.findUnique.mockResolvedValue({
      id: platformUserId,
      userId,
      role: platformRole,
    });
  }

  app.use('/api/platform/assistant', assistantRouter);
  app.use(errorHandler);
  return app;
}

// Sample data fixtures
const sampleSession = {
  id: 'session-uuid-1',
  userId: 'platform-user-uuid-1',
  title: 'Test Session',
  createdAt: new Date('2026-02-01T12:00:00Z'),
  updatedAt: new Date('2026-02-01T12:00:00Z'),
};

const sampleUserMessage = {
  id: 'msg-uuid-1',
  sessionId: 'session-uuid-1',
  role: 'USER',
  content: 'Hello, how can I book a gym?',
  metadata: null,
  createdAt: new Date('2026-02-01T12:01:00Z'),
};

const sampleAssistantMessage = {
  id: 'msg-uuid-2',
  sessionId: 'session-uuid-1',
  role: 'ASSISTANT',
  content: 'You can book the gym through the bookings section.',
  metadata: null,
  createdAt: new Date('2026-02-01T12:01:01Z'),
};

// ─── POST /sessions ───────────────────────────────────────────────────────────

describe('POST /sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a chat session for authenticated user', async () => {
    mockPrisma.chatSession.create.mockResolvedValue(sampleSession);

    const app = buildApp();
    const res = await request(app)
      .post('/api/platform/assistant/sessions')
      .send({ title: 'Test Session' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('session-uuid-1');
    expect(res.body.userId).toBe('platform-user-uuid-1');
    expect(mockPrisma.chatSession.create).toHaveBeenCalledWith({
      data: {
        userId: 'platform-user-uuid-1',
        title: 'Test Session',
      },
    });
  });

  it('creates a session without a title (title is optional)', async () => {
    const sessionNoTitle = { ...sampleSession, title: null };
    mockPrisma.chatSession.create.mockResolvedValue(sessionNoTitle);

    const app = buildApp();
    const res = await request(app)
      .post('/api/platform/assistant/sessions')
      .send({});

    expect(res.status).toBe(201);
    expect(mockPrisma.chatSession.create).toHaveBeenCalledWith({
      data: {
        userId: 'platform-user-uuid-1',
        title: undefined,
      },
    });
  });

  it('returns 401 when not authenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .post('/api/platform/assistant/sessions')
      .send({ title: 'Test Session' });

    expect(res.status).toBe(401);
  });
});

// ─── GET /sessions ────────────────────────────────────────────────────────────

describe('GET /sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists sessions for the authenticated user', async () => {
    mockPrisma.chatSession.findMany.mockResolvedValue([sampleSession]);

    const app = buildApp();
    const res = await request(app).get('/api/platform/assistant/sessions');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('session-uuid-1');
    expect(mockPrisma.chatSession.findMany).toHaveBeenCalledWith({
      where: { userId: 'platform-user-uuid-1' },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('returns empty array when user has no sessions', async () => {
    mockPrisma.chatSession.findMany.mockResolvedValue([]);

    const app = buildApp();
    const res = await request(app).get('/api/platform/assistant/sessions');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 401 when not authenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/assistant/sessions');

    expect(res.status).toBe(401);
  });
});

// ─── GET /sessions/:id/messages ───────────────────────────────────────────────

describe('GET /sessions/:id/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns messages for a session owned by the user', async () => {
    mockPrisma.chatSession.findUnique.mockResolvedValue(sampleSession);
    mockPrisma.chatMessage.findMany.mockResolvedValue([sampleUserMessage, sampleAssistantMessage]);

    const app = buildApp();
    const res = await request(app).get('/api/platform/assistant/sessions/session-uuid-1/messages');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].role).toBe('USER');
    expect(res.body[1].role).toBe('ASSISTANT');
    expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-uuid-1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('returns 404 when session does not exist', async () => {
    mockPrisma.chatSession.findUnique.mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app).get('/api/platform/assistant/sessions/nonexistent/messages');

    expect(res.status).toBe(404);
  });

  it('returns 403 when session belongs to another user', async () => {
    const otherUserSession = { ...sampleSession, userId: 'other-user-uuid' };
    mockPrisma.chatSession.findUnique.mockResolvedValue(otherUserSession);

    const app = buildApp();
    const res = await request(app).get('/api/platform/assistant/sessions/session-uuid-1/messages');

    expect(res.status).toBe(403);
  });

  it('returns 401 when not authenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/assistant/sessions/session-uuid-1/messages');

    expect(res.status).toBe(401);
  });
});

// ─── POST /sessions/:id/messages ──────────────────────────────────────────────

describe('POST /sessions/:id/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock LLM provider
    const mockProvider = {
      generateResponse: vi.fn().mockResolvedValue('You can book the gym through the bookings section.'),
    };
    mockGetLLMProvider.mockReturnValue(mockProvider);
  });

  it('creates user message and AI response message', async () => {
    mockPrisma.chatSession.findUnique.mockResolvedValue(sampleSession);
    mockPrisma.chatMessage.findMany.mockResolvedValue([]);
    mockPrisma.chatMessage.create
      .mockResolvedValueOnce(sampleUserMessage)
      .mockResolvedValueOnce(sampleAssistantMessage);

    const app = buildApp();
    const res = await request(app)
      .post('/api/platform/assistant/sessions/session-uuid-1/messages')
      .send({ content: 'Hello, how can I book a gym?' });

    expect(res.status).toBe(201);
    expect(res.body.userMessage.role).toBe('USER');
    expect(res.body.userMessage.content).toBe('Hello, how can I book a gym?');
    expect(res.body.assistantMessage.role).toBe('ASSISTANT');
    expect(res.body.assistantMessage.content).toBe('You can book the gym through the bookings section.');
  });

  it('calls LLM provider with conversation history', async () => {
    const mockProvider = {
      generateResponse: vi.fn().mockResolvedValue('AI response'),
    };
    mockGetLLMProvider.mockReturnValue(mockProvider);

    mockPrisma.chatSession.findUnique.mockResolvedValue(sampleSession);
    mockPrisma.chatMessage.findMany.mockResolvedValue([sampleUserMessage]);
    mockPrisma.chatMessage.create
      .mockResolvedValueOnce({ ...sampleUserMessage, content: 'New question' })
      .mockResolvedValueOnce({ ...sampleAssistantMessage, content: 'AI response' });

    const app = buildApp();
    await request(app)
      .post('/api/platform/assistant/sessions/session-uuid-1/messages')
      .send({ content: 'New question' });

    // LLM should receive conversation history including the new message
    expect(mockProvider.generateResponse).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'USER' }),
      ])
    );
  });

  it('returns 400 when content is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/platform/assistant/sessions/session-uuid-1/messages')
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 400 when content is empty string', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/platform/assistant/sessions/session-uuid-1/messages')
      .send({ content: '' });

    expect(res.status).toBe(400);
  });

  it('returns 404 when session does not exist', async () => {
    mockPrisma.chatSession.findUnique.mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app)
      .post('/api/platform/assistant/sessions/nonexistent/messages')
      .send({ content: 'Hello' });

    expect(res.status).toBe(404);
  });

  it('returns 403 when session belongs to another user', async () => {
    const otherUserSession = { ...sampleSession, userId: 'other-user-uuid' };
    mockPrisma.chatSession.findUnique.mockResolvedValue(otherUserSession);

    const app = buildApp();
    const res = await request(app)
      .post('/api/platform/assistant/sessions/session-uuid-1/messages')
      .send({ content: 'Hello' });

    expect(res.status).toBe(403);
  });

  it('returns 401 when not authenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .post('/api/platform/assistant/sessions/session-uuid-1/messages')
      .send({ content: 'Hello' });

    expect(res.status).toBe(401);
  });
});
