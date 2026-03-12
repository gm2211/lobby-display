/**
 * Parcel CRUD API Routes - Platform parcel management.
 *
 * ROUTES:
 * - GET /api/platform/parcels              - List parcels (residents see own, EDITOR+ sees all)
 * - GET /api/platform/parcels/:id          - Parcel detail (auth required)
 * - POST /api/platform/parcels             - Log incoming parcel (EDITOR+ required)
 * - PUT /api/platform/parcels/:id          - Update parcel (EDITOR+ required)
 * - POST /api/platform/parcels/:id/pickup  - Confirm pickup, sets status=PICKED_UP (EDITOR+ required)
 * - DELETE /api/platform/parcels/:id       - Soft delete via markedForDeletion (EDITOR+ required)
 *
 * AUTH MODEL:
 * - GETs require authentication (any role).
 * - VIEWER role: GET / returns only their own parcels (filtered by recipientId = session user id).
 * - EDITOR/ADMIN role: GET / returns all parcels.
 * - Mutations (POST/PUT/DELETE) require EDITOR+.
 *
 * GOTCHAS:
 * - Soft delete uses markedForDeletion, NOT deletedAt (deletedAt is vestigial).
 * - Every async handler wrapped in asyncHandler().
 * - pickup endpoint sets status=PICKED_UP and pickedUpAt=now().
 *
 * RELATED FILES:
 * - server/middleware/auth.ts        - requireAuth, requireMinRole
 * - server/middleware/errorHandler.ts - asyncHandler, validateId, NotFoundError, ValidationError
 * - prisma/schema.prisma             - Parcel model, ParcelStatus enum
 */
import { Router } from 'express';
import prisma from '../../db.js';
import {
  asyncHandler,
  validateId,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { requireAuth, requireMinRole, ROLE_LEVEL } from '../../middleware/auth.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET / - List parcels
// VIEWER: sees only their own parcels (recipientId = session user id)
// EDITOR+: sees all parcels
// ---------------------------------------------------------------------------
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.session.user!;
    const isEditorOrAbove = (ROLE_LEVEL[user.role] ?? 0) >= (ROLE_LEVEL['EDITOR'] ?? 0);

    const where = isEditorOrAbove
      ? { markedForDeletion: false }
      : { markedForDeletion: false, recipientId: user.id };

    const parcels = await prisma.parcel.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
    });

    res.json({ items: parcels });
  })
);

// ---------------------------------------------------------------------------
// GET /:id - Parcel detail
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);

    const parcel = await prisma.parcel.findUnique({
      where: { id },
    });

    if (!parcel) {
      throw new NotFoundError(`Parcel ${id} not found`);
    }

    res.json(parcel);
  })
);

// ---------------------------------------------------------------------------
// POST / - Log incoming parcel (EDITOR+ required)
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { description, recipientId, unitNumber, receivedBy, trackingNumber, carrier, notes, photoId } =
      req.body;

    // Validate required fields
    if (!description) throw new ValidationError('description is required');
    if (recipientId === undefined || recipientId === null)
      throw new ValidationError('recipientId is required');
    if (!unitNumber) throw new ValidationError('unitNumber is required');
    if (!receivedBy) throw new ValidationError('receivedBy is required');

    const parcel = await prisma.parcel.create({
      data: {
        description,
        recipientId: Number(recipientId),
        unitNumber,
        receivedBy,
        ...(trackingNumber !== undefined && { trackingNumber }),
        ...(carrier !== undefined && { carrier }),
        ...(notes !== undefined && { notes }),
        ...(photoId !== undefined && { photoId: Number(photoId) }),
      },
    });

    res.status(201).json(parcel);
  })
);

// ---------------------------------------------------------------------------
// POST /:id/pickup - Confirm pickup (EDITOR+ required)
// Sets status=PICKED_UP and pickedUpAt=now()
// Must appear before /:id PUT to avoid route shadowing (different method, fine)
// ---------------------------------------------------------------------------
router.post(
  '/:id/pickup',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);

    const parcel = await prisma.parcel.update({
      where: { id },
      data: {
        status: 'PICKED_UP',
        pickedUpAt: new Date(),
      },
    });

    res.json(parcel);
  })
);

// ---------------------------------------------------------------------------
// PUT /:id - Update parcel (EDITOR+ required)
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);

    const { status, trackingNumber, carrier, description, unitNumber, notes, photoId } = req.body;
    const data: Record<string, unknown> = {};

    if (status !== undefined) data.status = status;
    if (trackingNumber !== undefined) data.trackingNumber = trackingNumber;
    if (carrier !== undefined) data.carrier = carrier;
    if (description !== undefined) data.description = description;
    if (unitNumber !== undefined) data.unitNumber = unitNumber;
    if (notes !== undefined) data.notes = notes;
    if (photoId !== undefined) data.photoId = Number(photoId);

    const parcel = await prisma.parcel.update({
      where: { id },
      data,
    });

    res.json(parcel);
  })
);

// ---------------------------------------------------------------------------
// DELETE /:id - Soft delete via markedForDeletion (EDITOR+ required)
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);

    await prisma.parcel.update({
      where: { id },
      data: { markedForDeletion: true },
    });

    res.json({ ok: true });
  })
);

export default router;
