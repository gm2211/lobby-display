/**
 * Keeps a logged-in session in step with the User table.
 *
 * The session stores a copy of { id, username, role } taken at login. Without this
 * check that copy is trusted until the cookie expires (7 days, or a year for lobby
 * screens), so deleting a user, demoting them or changing their password would not
 * actually cut off access.
 *
 * On every request that carries a logged-in session:
 * - user no longer exists           → session is cleared (request continues logged out)
 * - password changed since login    → session is cleared
 * - username or role changed        → session copy is updated (takes effect at once)
 *
 * RELATED FILES:
 * - server/routes/auth.ts  - stamps `passwordVersion` at login/setup
 * - server/routes/users.ts - re-stamps the acting admin's own session when they
 *   change their own password, so they stay logged in
 */
import crypto from 'crypto';
import type { Request } from 'express';
import prisma from '../db.js';
import { asyncHandler } from './errorHandler.js';

/** Short fingerprint of a password hash. Changes whenever the password changes. */
export function passwordVersion(passwordHash: string): string {
  return crypto.createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

function resetSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    // regenerate() (not destroy()) so req.session still exists for later middleware
    req.session.regenerate(err => (err ? reject(err) : resolve()));
  });
}

export const syncSessionUser = asyncHandler(async (req, _res, next) => {
  const sessionUser = req.session?.user;
  if (!sessionUser) return next();

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, username: true, role: true, passwordHash: true },
  });

  if (!user) {
    await resetSession(req);
    return next();
  }

  const currentVersion = passwordVersion(user.passwordHash);
  if (req.session.passwordVersion && req.session.passwordVersion !== currentVersion) {
    await resetSession(req);
    return next();
  }
  // Sessions created before this check existed have no stamp yet: adopt the current one.
  if (!req.session.passwordVersion) {
    req.session.passwordVersion = currentVersion;
  }

  if (sessionUser.username !== user.username || sessionUser.role !== user.role) {
    req.session.user = { id: user.id, username: user.username, role: user.role };
  }
  next();
});
