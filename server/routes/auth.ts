import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import crypto from 'crypto';
import { AuthenticationError, AuthorizationError } from '../middleware/auth.js';
import { ensureCsrfToken, rotateCsrfToken } from '../middleware/csrf.js';
import prisma from '../db.js';
import type { Role } from '@prisma/client';
import { passwordVersion } from '../middleware/sessionUser.js';
import { SESSION_AGES, MIN_PASSWORD_LENGTH } from '../constants.js';

const router = Router();

// --- Simple in-memory rate limiter for login ---
// Two independent counters of FAILED logins, each over a 15 minute window:
//   - per client IP   (5)  - stops one machine guessing across accounts
//   - per username    (20) - stops guessing one account from many IPs. This one matters
//     because the IP can be unreliable behind a proxy (X-Forwarded-For is client
//     supplied), so the IP limit alone can be sidestepped.
const MAX_ATTEMPTS_PER_IP = 5;
const MAX_ATTEMPTS_PER_USERNAME = 20;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_TRACKED_KEYS = 10_000;

interface AttemptRecord { count: number; firstAttempt: number }
const attempts = new Map<string, AttemptRecord>();

const ipKey = (req: Request) => `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
const userKey = (username: string) => `user:${username.toLowerCase()}`;

/** Seconds until the key may try again, or 0 if it is not blocked. */
function blockedFor(key: string, max: number): number {
  const record = attempts.get(key);
  if (!record) return 0;
  const age = Date.now() - record.firstAttempt;
  if (age > WINDOW_MS) {
    attempts.delete(key);
    return 0;
  }
  return record.count >= max ? Math.ceil((WINDOW_MS - age) / 1000) : 0;
}

function recordFailedAttempt(key: string) {
  const record = attempts.get(key);
  if (!record || Date.now() - record.firstAttempt > WINDOW_MS) {
    // Keep the map bounded: drop expired entries, then the oldest if still full
    if (attempts.size >= MAX_TRACKED_KEYS) {
      const now = Date.now();
      for (const [k, r] of attempts) {
        if (now - r.firstAttempt > WINDOW_MS) attempts.delete(k);
      }
      if (attempts.size >= MAX_TRACKED_KEYS) {
        attempts.delete(attempts.keys().next().value as string);
      }
    }
    attempts.set(key, { count: 1, firstAttempt: Date.now() });
  } else {
    record.count++;
  }
}

function tooManyAttempts(res: Response, retryAfter: number) {
  res.setHeader('Retry-After', String(retryAfter));
  return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
}

function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  const retryAfter = blockedFor(ipKey(req), MAX_ATTEMPTS_PER_IP);
  if (retryAfter > 0) return tooManyAttempts(res, retryAfter);
  next();
}

/** Test helper: forget recorded failures (all of them, or only the per-IP ones). */
export function resetLoginRateLimit(only?: 'ip') {
  if (!only) return attempts.clear();
  for (const key of attempts.keys()) {
    if (key.startsWith('ip:')) attempts.delete(key);
  }
}
// --- End rate limiter ---

function readCredentials(body: unknown): { username: string; password: string } {
  const { username, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    throw new ValidationError('Username and password are required');
  }
  if (username.length > 100 || password.length > 200) {
    throw new ValidationError('Username or password is too long');
  }
  return { username, password };
}

// Compared against when the username doesn't exist, so a wrong username takes as long
// as a wrong password and response time doesn't reveal which usernames are real.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

async function startSession(req: Request, user: { id: number; username: string; role: Role; passwordHash: string }) {
  // Prevent session fixation: rotate the session ID on successful login.
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.user = { id: user.id, username: user.username, role: user.role };
  req.session.passwordVersion = passwordVersion(user.passwordHash);
  if (user.role === 'VIEWER') {
    // Lobby screens stay signed in (see the keep-alive middleware in app.ts)
    req.session.cookie.maxAge = SESSION_AGES.VIEWER_MS;
    req.session.lastRefreshAt = Date.now();
  }
  rotateCsrfToken(req);
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

router.post('/login', loginRateLimit, asyncHandler(async (req, res) => {
  const { username, password } = readCredentials(req.body);

  const retryAfter = blockedFor(userKey(username), MAX_ATTEMPTS_PER_USERNAME);
  if (retryAfter > 0) {
    tooManyAttempts(res, retryAfter);
    return;
  }

  const user = await prisma.user.findUnique({ where: { username } });
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    recordFailedAttempt(ipKey(req));
    recordFailedAttempt(userKey(username));
    throw new AuthenticationError('Invalid username or password');
  }

  attempts.delete(ipKey(req));
  attempts.delete(userKey(username));

  await startSession(req, user);
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

// When the user table is empty, the first visitor can create the admin account. Set the
// SETUP_TOKEN environment variable to require that value as well, so a database reset
// on a public URL can't be claimed by whoever arrives first.
function setupTokenMatches(given: unknown): boolean {
  const expected = process.env.SETUP_TOKEN;
  if (!expected) return true;
  if (typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

router.get('/setup-required', asyncHandler(async (_req, res) => {
  const count = await prisma.user.count();
  res.json({ required: count === 0, tokenRequired: count === 0 && !!process.env.SETUP_TOKEN });
}));

router.post('/setup', loginRateLimit, asyncHandler(async (req, res) => {
  const count = await prisma.user.count();
  if (count > 0) {
    return res.status(403).json({ error: 'Setup already completed' });
  }

  const { username, password } = readCredentials(req.body);
  if (!setupTokenMatches(req.body?.setupToken)) {
    recordFailedAttempt(ipKey(req));
    throw new AuthorizationError('Setup token is missing or incorrect');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, passwordHash, role: 'ADMIN' },
  });

  // Auto-login after setup
  await startSession(req, user);
  res.json({ id: user.id, username: user.username, role: user.role });
}));

export default router;
