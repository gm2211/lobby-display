/**
 * Admin Chat Route — proxies chat messages to the renzo-ai server.
 *
 * POST /api/chat  — Send a message, receive AI response.
 *                   Proxies to renzo-ai server at AI_SERVER_URL (default: http://localhost:3001).
 *
 * AUTH: Requires ADMIN role (admin-only page).
 *
 * GOTCHAS:
 * - In production (non-staging), renzo-ai is not running — returns a graceful error.
 * - asyncHandler wraps all async routes per project convention.
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:3001';

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { message, mode, history } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    try {
      const response = await fetch(`${AI_SERVER_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim(), mode, history }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        res.status(502).json({
          error: 'AI server error',
          message: {
            role: 'assistant',
            content: 'The AI assistant is currently unavailable. Please try again later.',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const data = await response.json();
      res.json(data);
    } catch (err) {
      // renzo-ai server not running (expected in prod, unexpected in staging)
      res.status(503).json({
        error: 'AI server unavailable',
        message: {
          role: 'assistant',
          content: 'The AI assistant is not available in this environment.',
          timestamp: new Date().toISOString(),
        },
      });
    }
  })
);

export default router;
