import { Store, SessionData } from 'express-session';
import prisma from '../db.js';

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export class PrismaSessionStore extends Store {
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    // Don't prevent process exit
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  async get(sid: string, callback: (err?: Error | null, session?: SessionData | null) => void) {
    try {
      const row = await prisma.session.findUnique({ where: { id: sid } });
      if (!row || row.expiresAt < new Date()) {
        return callback(null, null);
      }
      callback(null, JSON.parse(row.data));
    } catch (err) {
      callback(err as Error);
    }
  }

  async set(sid: string, session: SessionData, callback?: (err?: Error | null) => void) {
    try {
      const maxAge = session.cookie?.maxAge ?? 86400000; // 24h default
      const expiresAt = new Date(Date.now() + maxAge);
      const data = JSON.stringify(session);
      await prisma.session.upsert({
        where: { id: sid },
        create: { id: sid, data, expiresAt },
        update: { data, expiresAt },
      });
      callback?.();
    } catch (err) {
      callback?.(err as Error);
    }
  }

  async destroy(sid: string, callback?: (err?: Error | null) => void) {
    try {
      await prisma.session.deleteMany({ where: { id: sid } });
      callback?.();
    } catch (err) {
      callback?.(err as Error);
    }
  }

  async touch(sid: string, session: SessionData, callback?: (err?: Error | null) => void) {
    try {
      const maxAge = session.cookie?.maxAge ?? 86400000;
      const expiresAt = new Date(Date.now() + maxAge);
      await prisma.session.updateMany({
        where: { id: sid },
        data: { expiresAt },
      });
      callback?.();
    } catch (err) {
      callback?.(err as Error);
    }
  }

  private async cleanup() {
    try {
      await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    } catch {
      // Non-critical — log but don't crash
      console.error('[SessionStore] cleanup failed');
    }
  }

  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
