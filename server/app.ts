import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import multer, { MulterError } from 'multer';
import morgan from 'morgan';
import session from 'express-session';
import fs from 'fs';

import servicesRouter from './routes/services.js';
import eventsRouter from './routes/events.js';
import advisoriesRouter from './routes/advisories.js';
import configRouter from './routes/config.js';
import snapshotsRouter from './routes/snapshots.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import platformRouter from './routes/platform/index.js';
import metricsRouter from './routes/metrics.js';
import { platformProtect } from './middleware/platformAuth.js';
import forumUpvotesRouter from './routes/forumUpvotes.js';
import messagesRouter from './routes/messages.js';
import { sseHandler } from './sse.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireAuth, requireMinRole, ROLE_LEVEL, AuthenticationError, AuthorizationError } from './middleware/auth.js';
import { PrismaSessionStore } from './utils/sessionStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const uploadDir = path.resolve(__dirname, '../public/images/uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    }
  },
});

const app = express();

app.use(express.json());

const isProd = process.env.NODE_ENV === 'production';
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_MS = 7 * DAY_MS;
const SESSION_REFRESH_THRESHOLD_MS = 4 * DAY_MS;

const rawSecrets = process.env.COOKIE_SECRETS;
const fallbackSecret = process.env.COOKIE_SECRET;
const baseSecrets = rawSecrets ? rawSecrets.split(',') : (fallbackSecret ? [fallbackSecret] : []);
const sessionSecrets = baseSecrets.map(secret => secret.trim()).filter(Boolean);

if (isProd && sessionSecrets.length === 0) {
  throw new Error('COOKIE_SECRETS (or COOKIE_SECRET) must be set in production');
}

// Session middleware
app.use(session({
  store: new PrismaSessionStore(),
  secret: sessionSecrets.length > 0 ? sessionSecrets : 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  rolling: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    maxAge: SESSION_MAX_AGE_MS,
    sameSite: 'lax',
  },
}));

const VIEWER_MAX_AGE_MS = 365 * DAY_MS; // 1 year for lobby screens

app.use((req, _res, next) => {
  if (!req.session?.user) return next();
  // VIEWER sessions get indefinite keep-alive (1 year, refreshed on every request)
  if (req.session.user.role === 'VIEWER') {
    req.session.cookie.maxAge = VIEWER_MAX_AGE_MS;
    return next();
  }
  const expires = req.session.cookie?.expires;
  const maxAge = req.session.cookie?.maxAge ?? SESSION_MAX_AGE_MS;
  const expiresAt = expires ? new Date(expires).getTime() : Date.now() + maxAge;
  const remaining = expiresAt - Date.now();
  if (remaining <= SESSION_REFRESH_THRESHOLD_MS) {
    req.session.cookie.maxAge = SESSION_MAX_AGE_MS;
    req.session.lastRefreshAt = Date.now();
  }
  next();
});

// CSRF protection for state-changing API routes
app.use('/api', csrfMiddleware);

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Trust proxy in production (Render terminates TLS)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Build version for auto-reload detection (public, no auth)
const buildVersion = (() => {
  try {
    const versionPath = path.resolve(__dirname, '../build-version.json');
    const data = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
    return data.hash || 'dev';
  } catch {
    return 'dev';
  }
})();
app.get('/api/version', (_req, res) => {
  res.json({ hash: buildVersion });
});

// Prevent browser caching of API responses
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.get('/api/events-stream', requireAuth, sseHandler);

// Auth routes (public)
app.use('/api/auth', authRouter);

// User management routes (ADMIN only)
app.use('/api/users', requireMinRole('ADMIN' as const), usersRouter);

// Metrics routes (ADMIN only)
app.use('/api/metrics', requireMinRole('ADMIN' as const), metricsRouter);

// Dashboard data: all requests require auth, writes require EDITOR+
function dashboardProtect(req: Request, _res: Response, next: NextFunction) {
  if (!req.session.user) return next(new AuthenticationError());
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if ((ROLE_LEVEL[req.session.user.role] ?? 0) < (ROLE_LEVEL['EDITOR'] ?? 0)) {
      return next(new AuthorizationError());
    }
  }
  next();
}

// Snapshots: all reads require auth, writes require EDITOR+
function snapshotsProtect(req: Request, _res: Response, next: NextFunction) {
  if (!req.session.user) return next(new AuthenticationError());
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if ((ROLE_LEVEL[req.session.user.role] ?? 0) < (ROLE_LEVEL['EDITOR'] ?? 0)) {
      return next(new AuthorizationError());
    }
  }
  next();
}

// Platform API routes (auth-protected, writes require EDITOR+)
app.use('/api/platform', platformProtect, platformRouter);

// API routes (auth-protected, writes require EDITOR+)
app.use('/api/services', dashboardProtect, servicesRouter);
app.use('/api/events', dashboardProtect, eventsRouter);
app.use('/api/advisories', dashboardProtect, advisoriesRouter);
app.use('/api/config', dashboardProtect, configRouter);
app.use('/api/snapshots', snapshotsProtect, snapshotsRouter);

// Forum routes (auth-protected, any authenticated user can upvote)
app.use('/api/forum', requireAuth, forumUpvotesRouter);

// Messages: all routes require authentication (any role)
app.use('/api/messages', requireAuth, messagesRouter);

// Magic bytes for allowed image types
const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  'image/gif': [
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // GIF89a
  ],
  'image/webp': [{ offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }], // "WEBP" at offset 8
};

function validateMagicBytes(filePath: string, mimetype: string): boolean {
  const signatures = MAGIC_BYTES[mimetype];
  if (!signatures) return false;
  const buf = Buffer.alloc(16);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  return signatures.some(sig =>
    sig.bytes.every((b, i) => buf[sig.offset + i] === b)
  );
}

app.post('/api/upload', requireMinRole('EDITOR' as const), (req: Request, res: Response) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Only image files are allowed (JPEG, PNG, GIF, WebP)' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(500).json({ error: 'Upload failed' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Validate file content matches claimed MIME type
    if (!validateMagicBytes(req.file.path, req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'File content does not match its type' });
    }

    res.json({ url: `/images/uploads/${req.file.filename}` });
  });
});

// Global error handler - MUST be after all routes
app.use(errorHandler);

export default app;
