import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { AuthenticationError } from '../middleware/auth.js';
import { ensureCsrfToken, rotateCsrfToken } from '../middleware/csrf.js';
import prisma from '../db.js';

const router = Router();

// --- Simple in-memory rate limiter for login ---
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptRecord { count: number; firstAttempt: number }
const attempts = new Map<string, AttemptRecord>();

function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const record = attempts.get(ip);

  if (record) {
    // Expired window — reset
    if (Date.now() - record.firstAttempt > WINDOW_MS) {
      attempts.delete(ip);
    } else if (record.count >= MAX_ATTEMPTS) {
      const retryAfter = Math.ceil((WINDOW_MS - (Date.now() - record.firstAttempt)) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    }
  }
  next();
}

function recordFailedAttempt(ip: string) {
  const record = attempts.get(ip);
  if (!record || Date.now() - record.firstAttempt > WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAttempt: Date.now() });
  } else {
    record.count++;
  }
}

function clearAttempts(ip: string) {
  attempts.delete(ip);
}
// --- End rate limiter ---

router.post('/login', loginRateLimit, asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) throw new ValidationError('Username and password are required');

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    recordFailedAttempt(ip);
    throw new AuthenticationError('Invalid username or password');
  }

  clearAttempts(ip);

  // Prevent session fixation: rotate the session ID on successful login.
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.user = { id: user.id, username: user.username, role: user.role };
  rotateCsrfToken(req);
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
  res.json({ id: user.id, username: user.username, role: user.role });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
  res.clearCookie('connect.sid');
  res.json({ ok: true });
}));

router.get('/me', asyncHandler(async (req, res) => {
  if (!req.session.user) {
    return res.json(null);
  }
  res.json(req.session.user);
}));

router.get('/csrf', asyncHandler(async (req, res) => {
  const token = ensureCsrfToken(req);
  res.json({ token });
}));

// --- First-time setup ---

router.get('/setup-required', asyncHandler(async (_req, res) => {
  const count = await prisma.user.count();
  res.json({ required: count === 0 });
}));

router.post('/setup', asyncHandler(async (req, res) => {
  const count = await prisma.user.count();
  if (count > 0) {
    return res.status(403).json({ error: 'Setup already completed' });
  }

  const { username, password } = req.body;
  if (!username || !password) throw new ValidationError('Username and password are required');
  if (password.length < 8) throw new ValidationError('Password must be at least 8 characters');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, passwordHash, role: 'ADMIN' },
  });

  // Auto-login after setup
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.user = { id: user.id, username: user.username, role: user.role };
  rotateCsrfToken(req);
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
  res.json({ id: user.id, username: user.username, role: user.role });
}));

export default router;
