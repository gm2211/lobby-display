/**
 * Platform API routes — resident-facing account management endpoints.
 *
 * All routes require authentication (any role).
 * Users can only access their own profile data.
 *
 * Routes:
 *   GET  /api/platform/profile           — Get own profile
 *   PUT  /api/platform/profile           — Update own profile (displayName, phone, emergencyContact)
 *   POST /api/platform/change-password   — Change own password
 *   GET  /api/platform/notifications     — Get notification preferences
 *   PUT  /api/platform/notifications     — Update notification preferences
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';
import { AuthenticationError } from '../../middleware/auth.js';
import prisma from '../../db.js';

const router = Router();

const SALT_ROUNDS = 10;

/**
 * GET /api/platform/account
 * Returns a summary of the current user's account, combining profile and notification prefs.
 * Convenience endpoint used by the AccountPage and spec-eval tests.
 */
router.get(
  '/account',
  asyncHandler(async (req, res) => {
    if (!req.session.user) throw new AuthenticationError();
    const { id } = req.session.user;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        role: true,
        displayName: true,
        phone: true,
        emergencyContact: true,
        unitNumber: true,
        unitFloor: true,
        notificationPrefs: true,
      },
    });

    if (!user) throw new AuthenticationError();

    const defaultPrefs = {
      emailEvents: true,
      emailAdvisories: true,
      emailMaintenance: true,
      pushEvents: false,
      pushAdvisories: false,
      pushMaintenance: false,
    };

    let notificationPrefs = defaultPrefs;
    if (user.notificationPrefs) {
      try {
        notificationPrefs = { ...defaultPrefs, ...JSON.parse(user.notificationPrefs as string) };
      } catch {
        // keep defaults
      }
    }

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName ?? '',
      phone: user.phone ?? '',
      emergencyContact: user.emergencyContact ?? '',
      unitNumber: user.unitNumber ?? '',
      unitFloor: user.unitFloor ?? '',
      notificationPrefs,
    });
  })
);

/**
 * GET /api/platform/profile
 * Returns the current user's profile data.
 */
router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    if (!req.session.user) throw new AuthenticationError();
    const { id } = req.session.user;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        role: true,
        displayName: true,
        phone: true,
        emergencyContact: true,
        unitNumber: true,
        unitFloor: true,
      },
    });

    if (!user) throw new AuthenticationError();

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName ?? '',
      phone: user.phone ?? '',
      emergencyContact: user.emergencyContact ?? '',
      unitNumber: user.unitNumber ?? '',
      unitFloor: user.unitFloor ?? '',
    });
  })
);

/**
 * PUT /api/platform/profile
 * Updates the current user's editable profile fields.
 */
router.put(
  '/profile',
  asyncHandler(async (req, res) => {
    if (!req.session.user) throw new AuthenticationError();
    const { id } = req.session.user;

    const { displayName, phone, emergencyContact } = req.body;

    // Basic length validation
    if (displayName !== undefined && typeof displayName !== 'string') {
      throw new ValidationError('displayName must be a string');
    }
    if (phone !== undefined && typeof phone !== 'string') {
      throw new ValidationError('phone must be a string');
    }
    if (emergencyContact !== undefined && typeof emergencyContact !== 'string') {
      throw new ValidationError('emergencyContact must be a string');
    }
    if (displayName && displayName.length > 100) {
      throw new ValidationError('displayName must be 100 characters or fewer');
    }
    if (phone && phone.length > 30) {
      throw new ValidationError('phone must be 30 characters or fewer');
    }
    if (emergencyContact && emergencyContact.length > 200) {
      throw new ValidationError('emergencyContact must be 200 characters or fewer');
    }

    const data: Record<string, unknown> = {};
    if (displayName !== undefined) data.displayName = displayName;
    if (phone !== undefined) data.phone = phone;
    if (emergencyContact !== undefined) data.emergencyContact = emergencyContact;

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        role: true,
        displayName: true,
        phone: true,
        emergencyContact: true,
        unitNumber: true,
        unitFloor: true,
      },
    });

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName ?? '',
      phone: user.phone ?? '',
      emergencyContact: user.emergencyContact ?? '',
      unitNumber: user.unitNumber ?? '',
      unitFloor: user.unitFloor ?? '',
    });
  })
);

/**
 * POST /api/platform/change-password
 * Changes the current user's password after verifying the current one.
 */
router.post(
  '/change-password',
  asyncHandler(async (req, res) => {
    if (!req.session.user) throw new AuthenticationError();
    const { id } = req.session.user;

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      throw new ValidationError('currentPassword and newPassword are required');
    }
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      throw new ValidationError('Passwords must be strings');
    }
    if (newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters');
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new AuthenticationError();

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new ValidationError('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({ where: { id }, data: { passwordHash } });

    res.json({ ok: true });
  })
);

/**
 * GET /api/platform/notifications
 * Returns the current user's notification preferences.
 * (Stored as JSON in the User.notificationPrefs column.)
 */
router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    if (!req.session.user) throw new AuthenticationError();
    const { id } = req.session.user;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { notificationPrefs: true },
    });
    if (!user) throw new AuthenticationError();

    const defaults = {
      emailEvents: true,
      emailAdvisories: true,
      emailMaintenance: true,
      pushEvents: false,
      pushAdvisories: false,
      pushMaintenance: false,
    };

    if (!user.notificationPrefs) {
      return res.json(defaults);
    }

    try {
      const prefs = JSON.parse(user.notificationPrefs as string);
      res.json({ ...defaults, ...prefs });
    } catch {
      res.json(defaults);
    }
  })
);

/**
 * PUT /api/platform/notifications
 * Updates the current user's notification preferences.
 */
router.put(
  '/notifications',
  asyncHandler(async (req, res) => {
    if (!req.session.user) throw new AuthenticationError();
    const { id } = req.session.user;

    const allowed = [
      'emailEvents',
      'emailAdvisories',
      'emailMaintenance',
      'pushEvents',
      'pushAdvisories',
      'pushMaintenance',
    ];

    const prefs: Record<string, boolean> = {};
    for (const key of allowed) {
      if (key in req.body) {
        if (typeof req.body[key] !== 'boolean') {
          throw new ValidationError(`${key} must be a boolean`);
        }
        prefs[key] = req.body[key];
      }
    }

    await prisma.user.update({
      where: { id },
      data: { notificationPrefs: JSON.stringify(prefs) },
    });

    res.json({ ok: true });
  })
);

export default router;
