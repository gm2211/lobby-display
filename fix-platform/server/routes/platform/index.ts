/**
 * Platform API Router
 *
 * Main router for the resident-facing platform API, mounted at `/api/platform`
 * in server/app.ts behind the `platformProtect` middleware.
 *
 * SUB-ROUTES:
 * - /api/platform/announcements  - Resident announcements (placeholder)
 * - /api/platform/maintenance    - Maintenance requests (placeholder)
 * - /api/platform/amenities      - Building amenities (placeholder)
 * - /api/platform/bookings       - Amenity bookings (placeholder)
 * - /api/platform/parcels        - Parcel/package management (placeholder)
 * - /api/platform/users          - Platform user management (placeholder)
 * - /api/platform/search         - Global search across platform entities
 * - /api/platform/surveys        - Survey CRUD and response handling
 * - /api/platform/consent        - E-consent forms and signatures
 * - /api/platform/documents      - Document management (categories, documents, versions)
 * - /api/platform/marketplace    - Resident marketplace listings
 * - /api/platform/directory      - Building directory entries (list, detail, update)
 * - /api/platform/assistant      - AI chat assistant (sessions and messages)
 * - /api/platform/shifts         - Security/concierge shift scheduling and key management
 *
 * RELATED FILES:
 * - server/app.ts                        - mounts this router
 * - server/middleware/platformAuth.ts    - platformProtect middleware
 * - server/routes/platform/*.ts          - individual sub-routers
 */
import { Router } from 'express';
import announcementsRouter from './announcements.js';
import maintenanceRouter from './maintenance.js';
import amenitiesRouter from './amenities.js';
import bookingsRouter from './bookings.js';
import parcelsRouter from './parcels.js';
import usersRouter from './users.js';
import eventsRouter from './events.js';
import paymentsRouter from './payments.js';
import violationsRouter from './violations.js';
import visitorsRouter from './visitors.js';
import searchRouter from './search.js';
import trainingRouter from './training.js';
import surveysRouter from './surveys.js';
import consentRouter from './consent.js';
import documentsRouter from './documents.js';
import marketplaceRouter from './marketplace.js';
import directoryRouter from './directory.js';
import forumRouter from './forum.js';
import uploadsRouter from './uploads.js';
import navRouter from './nav.js';
import assistantRouter from './assistant.js';
import accountRouter from './account.js';
import shiftsRouter from './shifts.js';

const router = Router();

router.use('/announcements', announcementsRouter);
router.use('/maintenance', maintenanceRouter);
router.use('/amenities', amenitiesRouter);
router.use('/bookings', bookingsRouter);
router.use('/parcels', parcelsRouter);
router.use('/users', usersRouter);
router.use('/events', eventsRouter);
router.use('/payments', paymentsRouter);
router.use('/violations', violationsRouter);
router.use('/visitors', visitorsRouter);
router.use('/search', searchRouter);
router.use('/training', trainingRouter);
router.use('/surveys', surveysRouter);
router.use('/consent', consentRouter);
router.use('/documents', documentsRouter);
router.use('/marketplace', marketplaceRouter);
router.use('/directory', directoryRouter);
router.use('/forum', forumRouter);
router.use('/uploads', uploadsRouter);
router.use('/nav', navRouter);
router.use('/assistant', assistantRouter);
router.use('/shifts', shiftsRouter);
router.use('/', accountRouter);

export default router;
