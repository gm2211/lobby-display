/**
 * renzo-ai HTTP server — accepts chat messages and returns AI responses.
 *
 * Runs on port 3001 (configurable via AI_PORT env var).
 * The main Renzo server proxies /api/chat requests here.
 *
 * Supports two modes via `mode` parameter:
 * - "local" (default): keyword-based intent classifier with MCP tool calls
 * - "groq": Groq LLM (Llama 3.1 8B) with MCP tool context injection
 */
import express from 'express';
import { processMessage } from './chat-engine.js';
import { processMessageWithGroq } from './groq-engine.js';
import { log } from './tools/logger.js';

const app = express();
app.use(express.json());

const PORT = Number(process.env.AI_PORT) || 3001;

// Health check
app.get('/health', (_req, res) => {
  const hasGroqKey = !!process.env.GROQ_API_KEY;
  res.json({ status: 'ok', service: 'renzo-ai', groqAvailable: hasGroqKey });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  const { message, mode, history } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const engine = mode === 'groq' ? 'groq' : 'local';
  log(`[server] Chat request (${engine}): "${message.slice(0, 100)}"`);

  try {
    let response: string;

    if (engine === 'groq') {
      response = await processMessageWithGroq(message.trim(), history ?? []);
    } else {
      response = await processMessage(message.trim());
    }

    res.json({
      message: {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    log(`[server] Chat error: ${err instanceof Error ? err.message : err}`);
    res.status(500).json({
      error: 'Failed to process message',
      message: {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      },
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  log(`[server] renzo-ai listening on port ${PORT}`);
});
