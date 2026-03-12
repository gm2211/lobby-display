import { Request, Response, NextFunction } from 'express';
import type { PlatformUser, PlatformRole } from '@prisma/client';
import type { Role } from '@prisma/client';
import prisma from '../db.js';
import { AuthenticationError, AuthorizationError, ROLE_LEVEL } from './auth.js';

// Augment express Request to include platformUser
declare module 'express' {
  interface Request {
    platformUser?: PlatformUser;
  }
}

export class PlatformAuthenticationError extends Error {
  status = 401;
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'PlatformAuthenticationError';
  }
}

export class PlatformAuthorizationError extends Error {
  status = 403;
  constructor(message = 'Insufficient platform permissions') {
    super(message);
    this.name = 'PlatformAuthorizationError';
  }
}

/** Dashboard roles eligible for automatic PlatformUser provisioning. */
const AUTO_PROVISION_ROLES: Role[] = ['ADMIN', 'EDITOR'];

/**
 * Map from dashboard Role to the PlatformRole assigned on auto-provision.
 * ADMIN and EDITOR both receive MANAGER so they get full platform access
 * (including managerItems in the nav sidebar).
 */
const ROLE_TO_PLATFORM_ROLE: Partial<Record<Role, PlatformRole>> = {
  ADMIN: 'MANAGER',
  EDITOR: 'MANAGER',
};

/**
 * Look up the PlatformUser for a given dashboard user ID.
 *
 * If no PlatformUser exists and the dashboard role is ADMIN or EDITOR,
 * one is auto-provisioned with the MANAGER platform role so that admins
 * can access the platform without manual registration.
 *
 * Returns the PlatformUser record, or null if the user is not eligible
 * for auto-provisioning and has no existing record.
 */
export async function getOrCreatePlatformUser(
  userId: number,
  dashboardRole: Role,
): Promise<PlatformUser | null> {
  const existing = await prisma.platformUser.findUnique({
    where: { userId },
  });

  if (existing) return existing;

  // Only auto-provision for ADMIN / EDITOR dashboard roles
  if (!AUTO_PROVISION_ROLES.includes(dashboardRole)) return null;

  const platformRole = ROLE_TO_PLATFORM_ROLE[dashboardRole] ?? 'MANAGER';

  return prisma.platformUser.create({
    data: {
      userId,
      role: platformRole,
    },
  });
}

/**
 * Middleware that guards the platform API.
 *
 * - Unauthenticated requests → 401
 * - Non-GET/HEAD requests from VIEWER → 403
 * - EDITOR and ADMIN can perform any operation
 */
export function platformProtect(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session.user) {
    return next(new AuthenticationError());
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if ((ROLE_LEVEL[req.session.user.role] ?? 0) < (ROLE_LEVEL['EDITOR'] ?? 0)) {
      return next(new AuthorizationError());
    }
  }

  next();
}

/**
 * Middleware that verifies the session, loads the PlatformUser record for the
 * logged-in user via userId join, and attaches it to req.platformUser.
 *
 * For ADMIN and EDITOR dashboard users, a PlatformUser record is automatically
 * provisioned (with MANAGER platform role) if one does not already exist.
 *
 * Returns 401 if no session user is present.
 * Returns 403 if the session user has no associated PlatformUser record
 *   and is not eligible for auto-provisioning.
 */
export async function platformProtectStrict(req: Request, _res: Response, next: NextFunction) {
  if (!req.session.user) {
    return next(new PlatformAuthenticationError());
  }

  const platformUser = await getOrCreatePlatformUser(
    req.session.user.id,
    req.session.user.role,
  );

  if (!platformUser) {
    return next(new PlatformAuthorizationError('No platform user record found for this user'));
  }

  req.platformUser = platformUser;
  next();
}

/**
 * Middleware factory that checks if req.platformUser has one of the allowed roles.
 *
 * Must be used after platformProtectStrict (which attaches req.platformUser).
 * Returns 401 if platformUser is not attached.
 * Returns 403 if the platformUser's role is not in the allowed list.
 */
export function requirePlatformRole(...roles: PlatformRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.platformUser) {
      return next(new PlatformAuthenticationError());
    }
    if (!roles.includes(req.platformUser.role)) {
      return next(new PlatformAuthorizationError());
    }
    next();
  };
}
