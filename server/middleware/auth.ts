import { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';

// Augment express-session to include our user data
declare module 'express-session' {
  interface SessionData {
    user?: { id: number; username: string; role: Role };
    csrfToken?: string;
    lastRefreshAt?: number;
  }
}

export const ROLE_LEVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

export class AuthenticationError extends Error {
  status = 401;
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  status = 403;
  constructor(message = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.session.user) {
    return next(new AuthenticationError());
  }
  next();
}

export function requireMinRole(minRole: Role) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.session.user) {
      return next(new AuthenticationError());
    }
    if ((ROLE_LEVEL[req.session.user.role] ?? 0) < (ROLE_LEVEL[minRole] ?? 0)) {
      return next(new AuthorizationError());
    }
    next();
  };
}

export function requireRole(role: Role) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.session.user) {
      return next(new AuthenticationError());
    }
    if (req.session.user.role !== role) {
      return next(new AuthorizationError());
    }
    next();
  };
}
