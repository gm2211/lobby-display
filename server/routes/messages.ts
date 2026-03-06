/**
 * Messages API Routes — resident-to-resident internal messaging.
 *
 * ROUTES:
 *   GET  /inbox          — list received messages for current user (unread first)
 *   GET  /sent           — list sent messages for current user
 *   GET  /unread-count   — count of unread messages for badge display
 *   GET  /:id            — get single message (must be sender or recipient)
 *   POST /               — send a message (body: { recipientId, subject?, body })
 *   PUT  /:id/read       — mark message as read (recipient only)
 *
 * AUTHORIZATION:
 *   All routes require authentication (any role).
 *   Users can only view their own messages (sent or received).
 *   Only the recipient can mark a message as read.
 */
import { Router } from 'express';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { AuthorizationError } from '../middleware/auth.js';
import prisma from '../db.js';

const router = Router();

// GET /inbox — list received messages for current user, unread first
router.get('/inbox', asyncHandler(async (req, res) => {
  const userId = req.session.user!.id;

  const messages = await prisma.message.findMany({
    where: { recipientId: userId },
    orderBy: [
      // Unread first: nulls (unread) come before non-null (read) values
      { readAt: { sort: 'asc', nulls: 'first' } },
      { createdAt: 'desc' },
    ],
    include: {
      sender: { select: { id: true, username: true } },
    },
  });

  res.json(messages);
}));

// GET /sent — list sent messages for current user
router.get('/sent', asyncHandler(async (req, res) => {
  const userId = req.session.user!.id;

  const messages = await prisma.message.findMany({
    where: { senderId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      recipient: { select: { id: true, username: true } },
    },
  });

  res.json(messages);
}));

// GET /unread-count — count of unread messages for badge
router.get('/unread-count', asyncHandler(async (req, res) => {
  const userId = req.session.user!.id;

  const count = await prisma.message.count({
    where: {
      recipientId: userId,
      readAt: null,
    },
  });

  res.json({ count });
}));

// GET /:id — get single message (must be sender or recipient)
router.get('/:id', asyncHandler(async (req, res) => {
  const userId = req.session.user!.id;
  const { id } = req.params;

  const message = await prisma.message.findUnique({
    where: { id },
    include: {
      sender: { select: { id: true, username: true } },
      recipient: { select: { id: true, username: true } },
    },
  });

  if (!message) throw new NotFoundError('Message not found');

  if (message.senderId !== userId && message.recipientId !== userId) {
    throw new AuthorizationError('You do not have access to this message');
  }

  res.json(message);
}));

// POST / — send a message
router.post('/', asyncHandler(async (req, res) => {
  const senderId = req.session.user!.id;
  const { recipientId, subject, body } = req.body;

  if (!recipientId) throw new ValidationError('recipientId is required');
  if (!body) throw new ValidationError('body is required');

  // Verify recipient exists
  const recipient = await prisma.user.findUnique({ where: { id: Number(recipientId) } });
  if (!recipient) throw new NotFoundError('Recipient not found');

  const message = await prisma.message.create({
    data: {
      senderId,
      recipientId: Number(recipientId),
      subject: subject ?? null,
      body,
    },
    include: {
      sender: { select: { id: true, username: true } },
      recipient: { select: { id: true, username: true } },
    },
  });

  res.status(201).json(message);
}));

// PUT /:id/read — mark message as read (recipient only)
router.put('/:id/read', asyncHandler(async (req, res) => {
  const userId = req.session.user!.id;
  const { id } = req.params;

  const message = await prisma.message.findUnique({ where: { id } });

  if (!message) throw new NotFoundError('Message not found');

  if (message.recipientId !== userId) {
    throw new AuthorizationError('Only the recipient can mark a message as read');
  }

  const updated = await prisma.message.update({
    where: { id },
    data: { readAt: new Date() },
  });

  res.json(updated);
}));

export default router;
