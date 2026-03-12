/**
 * Platform AI Assistant API Routes - Chat session and message management.
 *
 * ROUTES:
 * - POST /api/platform/assistant/sessions             - Create a new chat session.
 *                                                       userId set from authenticated platformUser.
 * - GET  /api/platform/assistant/sessions             - List sessions for the current user.
 * - GET  /api/platform/assistant/sessions/:id/messages - Get messages for a session (owner only).
 * - POST /api/platform/assistant/sessions/:id/messages - Send a message, get AI response.
 *                                                        Creates user message + assistant message.
 *
 * AUTH MODEL:
 * - All routes require authentication (req.platformUser attached by platformProtectStrict)
 * - Sessions are scoped to the authenticated platformUser (userId enforcement)
 *
 * AI INTEGRATION:
 * - Uses pluggable LLMProvider interface (see server/services/llmProvider.ts)
 * - MockLLMProvider used by default (real provider integration deferred to a future ticket)
 * - Context injection from building rules/amenity info/FAQs deferred to a future ticket
 *
 * GOTCHAS:
 * - req.platformUser is attached by platformProtectStrict in platform/index.ts
 * - ChatSession.userId references PlatformUser.id (UUID), NOT User.id (integer)
 * - Message sub-routes (/:id/messages) must be mounted carefully to avoid shadowing
 *
 * RELATED FILES:
 * - server/services/llmProvider.ts              - LLMProvider interface and MockLLMProvider
 * - server/middleware/platformAuth.ts           - platformProtectStrict middleware
 * - server/middleware/errorHandler.ts           - asyncHandler, NotFoundError, ValidationError
 * - prisma/schema.prisma                        - ChatSession, ChatMessage, ChatRole models
 * - tests/unit/assistant-routes.test.ts         - unit tests
 */
import { Router } from 'express';
import prisma from '../../db.js';
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { requireAuth, AuthorizationError } from '../../middleware/auth.js';
import { platformProtectStrict } from '../../middleware/platformAuth.js';
import { getLLMProvider } from '../../services/llmProvider.js';
import type { ChatMessage } from '../../services/llmProvider.js';

const router = Router();

// ─── POST /sessions ───────────────────────────────────────────────────────────
// Create a new chat session. userId is always taken from the authenticated user.

router.post(
  '/sessions',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const platformUser = req.platformUser!;
    const { title } = req.body;

    const session = await prisma.chatSession.create({
      data: {
        userId: platformUser.id,
        title: title as string | undefined,
      },
    });

    res.status(201).json(session);
  })
);

// ─── GET /sessions ────────────────────────────────────────────────────────────
// List chat sessions for the authenticated user (scoped by userId).

router.get(
  '/sessions',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const platformUser = req.platformUser!;

    const sessions = await prisma.chatSession.findMany({
      where: { userId: platformUser.id },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(sessions);
  })
);

// ─── GET /sessions/:id/messages ───────────────────────────────────────────────
// Get messages for a session. Owner only.

router.get(
  '/sessions/:id/messages',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const platformUser = req.platformUser!;

    const session = await prisma.chatSession.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundError(`Chat session ${id} not found`);
    }

    if (session.userId !== platformUser.id) {
      throw new AuthorizationError('You do not have permission to view this session');
    }

    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' },
    });

    res.json(messages);
  })
);

// ─── POST /sessions/:id/messages ──────────────────────────────────────────────
// Send a message and receive an AI response.
// Creates two records: the user's message and the assistant's response.

router.post(
  '/sessions/:id/messages',
  requireAuth,
  platformProtectStrict,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    const platformUser = req.platformUser!;

    // Validate content
    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new ValidationError('content is required');
    }

    // Verify session exists and belongs to the user
    const session = await prisma.chatSession.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundError(`Chat session ${id} not found`);
    }

    if (session.userId !== platformUser.id) {
      throw new AuthorizationError('You do not have permission to post to this session');
    }

    // Load conversation history for context
    const history = await prisma.chatMessage.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' },
    });

    // Persist the user's message
    const userMessage = await prisma.chatMessage.create({
      data: {
        sessionId: id,
        role: 'USER',
        content: content.trim(),
      },
    });

    // Build the full message list for the LLM (history + new user message)
    const llmMessages: ChatMessage[] = [
      ...history.map(m => ({ role: m.role as 'USER' | 'ASSISTANT' | 'SYSTEM', content: m.content })),
      { role: 'USER', content: content.trim() },
    ];

    // Generate AI response
    const provider = getLLMProvider();
    const aiResponseText = await provider.generateResponse(llmMessages);

    // Persist the assistant's response
    const assistantMessage = await prisma.chatMessage.create({
      data: {
        sessionId: id,
        role: 'ASSISTANT',
        content: aiResponseText,
      },
    });

    res.status(201).json({
      userMessage,
      assistantMessage,
    });
  })
);

export default router;
