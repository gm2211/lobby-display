import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { asyncHandler, ValidationError, NotFoundError, validateId } from '../middleware/errorHandler.js';
import { AuthorizationError } from '../middleware/auth.js';
import prisma from '../db.js';
import { passwordVersion } from '../middleware/sessionUser.js';
import { MIN_PASSWORD_LENGTH } from '../constants.js';

const router = Router();

const SALT_ROUNDS = 10;
const VALID_ROLES = ['VIEWER', 'EDITOR', 'ADMIN'] as const;
const ROLE_LEVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

function validateRole(role: string): void {
  if (!(VALID_ROLES as readonly string[]).includes(role)) {
    throw new ValidationError(`Invalid role: '${role}'. Must be one of: ${VALID_ROLES.join(', ')}`);
  }
}

function canManage(actorRole: string, targetRole: string): boolean {
  return (ROLE_LEVEL[actorRole] ?? 0) >= (ROLE_LEVEL[targetRole] ?? 0);
}

function validateUsername(username: unknown): asserts username is string {
  if (typeof username !== 'string' || !username.trim() || username.length > 100) {
    throw new ValidationError('Username must be 1 to 100 characters');
  }
}

function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > 200) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

/** The app must always keep one ADMIN, or nobody can manage users any more. */
async function assertNotLastAdmin(userId: number): Promise<void> {
  const otherAdmins = await prisma.user.count({ where: { role: 'ADMIN', id: { not: userId } } });
  if (otherAdmins === 0) {
    throw new ValidationError('This is the only admin account. Make another user an admin first.');
  }
}

const omitHash = ({ passwordHash: _, ...user }: Record<string, unknown>) => user;

router.get('/', asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  res.json(users.map(omitHash));
}));

router.post('/', asyncHandler(async (req, res) => {
  const { username, password, role } = req.body ?? {};
  if (!username || !password) throw new ValidationError('Username and password are required');
  validateUsername(username);
  validatePassword(password);

  const targetRole = role || 'EDITOR';
  validateRole(String(targetRole));

  const actorRole = req.session.user!.role;
  if (!canManage(actorRole, targetRole)) {
    throw new AuthorizationError('Cannot create a user with a higher role than your own');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { username, passwordHash, role: targetRole },
  });
  res.status(201).json(omitHash(user));
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = validateId(req.params.id);
  const { username, password, role } = req.body ?? {};
  if (username) validateUsername(username);
  if (password) validatePassword(password);

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('User not found');

  const actorRole = req.session.user!.role;
  if (!canManage(actorRole, existing.role)) {
    throw new AuthorizationError('Cannot edit a user with a higher role than your own');
  }
  if (role) {
    validateRole(String(role));
    if (!canManage(actorRole, role)) {
      throw new AuthorizationError('Cannot assign a role higher than your own');
    }
    if (existing.role === 'ADMIN' && role !== 'ADMIN') {
      await assertNotLastAdmin(id);
    }
  }

  const data: Record<string, unknown> = {};
  if (username) data.username = username;
  if (role) data.role = role;
  if (password) data.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.update({ where: { id }, data });

  // A password change signs that user out everywhere (see middleware/sessionUser.ts).
  // When admins change their own password, keep the session they are using.
  if (password && req.session.user?.id === id) {
    req.session.passwordVersion = passwordVersion(user.passwordHash);
  }
  res.json(omitHash(user));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = validateId(req.params.id);
  if (req.session.user?.id === id) {
    throw new ValidationError('Cannot delete your own account');
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('User not found');

  const actorRole = req.session.user!.role;
  if (!canManage(actorRole, existing.role)) {
    throw new AuthorizationError('Cannot delete a user with a higher role than your own');
  }

  if (existing.role === 'ADMIN') {
    await assertNotLastAdmin(id);
  }

  // Messages reference users without a cascade; remove them so the delete can't fail
  await prisma.$transaction([
    prisma.message.deleteMany({ where: { OR: [{ senderId: id }, { recipientId: id }] } }),
    prisma.user.delete({ where: { id } }),
  ]);
  res.json({ ok: true });
}));

export default router;
