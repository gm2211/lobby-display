import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const CSRF_HEADER = 'x-csrf-token';
const CSRF_TOKEN_BYTES = 32;

function generateToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_BYTES).toString('hex');
}

export function ensureCsrfToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateToken();
  }
  return req.session.csrfToken;
}

export function rotateCsrfToken(req: Request): string {
  const token = generateToken();
  req.session.csrfToken = token;
  return token;
}

export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();
  if (!req.session.user) return next();

  const token = req.get(CSRF_HEADER);
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).json({ error: 'CsrfError', message: 'Invalid CSRF token' });
  }

  return next();
}
