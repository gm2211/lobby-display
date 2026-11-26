import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import Fastify from 'fastify';
import fastifyExpress from '@fastify/express';

import app from './app.js';
import prisma from './db.js';
import { getCurrentState } from './routes/snapshots.js';
import { getThemeStyleBlock, getDashboardTitle } from './themeCSS.js';
import { asyncHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

/**
 * Put demo content into a brand-new database so the first screen isn't blank.
 *
 * Only runs when the database has never been used: nothing published and every content
 * table empty. Checking services alone is not enough - a building that removes all its
 * services would get the demo services, duplicate demo events and a second config row
 * back on every restart.
 */
async function seedIfEmpty() {
  const [snapshots, services, events, advisories, configs] = await Promise.all([
    prisma.publishedSnapshot.count(),
    prisma.service.count(),
    prisma.event.count(),
    prisma.advisory.count(),
    prisma.buildingConfig.count(),
  ]);
  if (snapshots + services + events + advisories + configs > 0) return;

  await prisma.service.createMany({
    data: [
      { name: 'HVAC System', status: 'Operational', sortOrder: 0 },
      { name: 'Elevator Bank A', status: 'Operational', sortOrder: 1 },
      { name: 'Elevator Bank B', status: 'Maintenance', sortOrder: 2 },
      { name: 'Hot Water', status: 'Operational', sortOrder: 3 },
      { name: 'Cold Water', status: 'Operational', sortOrder: 4 },
      { name: 'Fire Safety System', status: 'Operational', sortOrder: 5 },
      { name: 'Security Cameras', status: 'Operational', sortOrder: 6 },
      { name: 'Intercom System', status: 'Operational', sortOrder: 7 },
      { name: 'Parking Garage', status: 'Outage', sortOrder: 8 },
      { name: 'Gym Access', status: 'Operational', sortOrder: 9 },
    ],
  });

  await prisma.event.createMany({
    data: [
      {
        title: 'New Class! Kundalini Yoga',
        subtitle: 'Join us for transformative yoga sessions',
        details: JSON.stringify(['Every Tuesday & Thursday at 7:00 AM', 'Studio, 10th Floor', 'Free for all residents - No registration required']),
        imageUrl: '/images/yoga.jpg',
        accentColor: '#e91e63',
        sortOrder: 0,
      },
      {
        title: 'Community Bagel Brunch',
        subtitle: 'Connect with your neighbors over coffee and bagels',
        details: JSON.stringify(['Saturday, February 1st at 10:00 AM', 'Studio, 10th Floor', 'Free event - All residents welcome!', 'Resident must be in good standing.']),
        imageUrl: '/images/bagels.jpg',
        accentColor: '#00bcd4',
        sortOrder: 1,
      },
      {
        title: 'Tequila Tasting Night',
        subtitle: 'Discover premium tequilas and enjoy an evening of flavor',
        details: JSON.stringify(['Friday, March 14th at 7:00 PM', 'Studio, 10th Floor', 'Ages 21+ only - RSVP required by March 10th', 'Resident must be in good standing.']),
        imageUrl: '/images/tequila.jpg',
        accentColor: '#ff9800',
        sortOrder: 2,
      },
    ],
  });

  await prisma.advisory.create({
    data: {
      message: 'Water shut-off scheduled for floors 10-15 on Tuesday 10 PM - 4 AM for pipe maintenance. Please store water accordingly.',
      active: true,
    },
  });

  await prisma.buildingConfig.create({
    data: {
      dashboardTitle: 'Building Updates',
    },
  });
}

async function seedSnapshot() {
  const count = await prisma.publishedSnapshot.count();
  if (count > 0) return;

  // Same shape a real publish writes, so a fresh database starts with
  // "no unpublished changes" instead of a draft that differs from version 1.
  const data = await getCurrentState();
  await prisma.publishedSnapshot.create({ data: { version: 1, data: JSON.stringify(data) } });
}

async function cleanupStaleUsers() {
  // After role enum rename (SUPER_ADMIN→ADMIN, ADMIN→EDITOR), old rows may
  // have values the Prisma client can't deserialize. Delete them so the
  // first-time setup flow can run cleanly.
  try {
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM "User" WHERE "role"::text NOT IN ('EDITOR', 'ADMIN')`
    );
    if (deleted > 0) console.log(`[cleanup] Removed ${deleted} user(s) with stale role values`);
  } catch {
    // Table might not exist yet on first deploy — safe to ignore
  }
}

async function start() {
  if (process.env.NODE_ENV === 'production' && (process.env.TEST_USER || process.env.TEST_PASS)) {
    throw new Error('FATAL: TEST_USER and TEST_PASS must not be set in production');
  }

  await cleanupStaleUsers();
  await seedIfEmpty();
  await seedSnapshot();

  // --- Static asset auth gate ---
  // Serve the standalone login page without auth; gate JS bundles behind a session.
  const loginHtmlPath = path.resolve(__dirname, 'login.html');

  // The login page's script is a separate file so the Content-Security-Policy can
  // forbid inline scripts. Public: it contains no data.
  app.get('/login.js', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'login.js'));
  });

  app.get('/login', (req, res) => {
    if (req.session?.user) return res.redirect('/');
    res.sendFile(loginHtmlPath);
  });

  if (isProd) {
    const distPath = path.resolve(__dirname, '../dist');

    // Read index.html once at startup for server-side theme injection
    const rawIndexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');

    // Auth gate: redirect unauthenticated users to standalone login.
    // Must come BEFORE express.static so index.html isn't served without auth.
    app.use((req, res, next) => {
      // Allow: /login, /api/*, /assets/*.css, /assets/*.ttf, static images, favicon
      if (
        req.path === '/login' ||
        req.path === '/login.js' ||
        req.path.startsWith('/api/') ||
        req.path === '/vite.svg' ||
        req.path.startsWith('/images/') ||
        (req.path.startsWith('/assets/') && !req.path.endsWith('.js'))
      ) {
        return next();
      }
      // Everything else (including / and /assets/*.js) requires auth
      if (!req.session?.user) {
        return res.redirect('/login');
      }
      next();
    });

    // Serve static assets but NOT index.html (we inject theme vars into it)
    app.use(express.static(distPath, { index: false }));
    // SPA catch-all with server-side theme injection (auth already checked above)
    app.get('*', asyncHandler(async (_req, res) => {
      const [themeStyle, title] = await Promise.all([
        getThemeStyleBlock(),
        getDashboardTitle(),
      ]);
      const escapedTitle = title
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      let html = rawIndexHtml.replace('</head>', `${themeStyle}\n</head>`);
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapedTitle}</title>`);
      res.type('html').send(html);
    }));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Which X-Forwarded-For entry is the client. `true` (the default) takes the left-most
  // one, which the client can set itself; that is why login also has a per-username
  // limit. Set TRUST_PROXY_HOPS to the number of proxies in front of the app to take
  // the address the nearest trusted proxy saw instead.
  const hops = Number(process.env.TRUST_PROXY_HOPS);
  const trustProxy = isProd ? (Number.isInteger(hops) && hops > 0 ? hops : true) : false;
  const fastify = Fastify({ logger: false, trustProxy });
  await fastify.register(fastifyExpress);
  fastify.use(app);

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Server running at http://localhost:${PORT}`);
}

start().catch(err => {
  console.error('FATAL: Server failed to start:', err);
  process.exit(1);
});
