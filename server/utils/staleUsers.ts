/**
 * Startup cleanup for users whose role is no longer a valid `Role` value.
 *
 * History: the role enum was renamed (SUPER_ADMIN→ADMIN, ADMIN→EDITOR), and rows
 * with old values can't be read by the Prisma client. This deletes only those rows.
 *
 * The list of valid roles comes from Prisma's generated `Role` enum, so it can
 * never fall behind the schema again. It used to be a hard-coded
 * ('EDITOR', 'ADMIN') list that left out VIEWER, which deleted every lobby
 * screen account on every server start.
 */
import { Role } from '@prisma/client';
import prisma from '../db.js';

export async function cleanupStaleUsers(): Promise<number> {
  const valid = Object.values(Role);
  try {
    return await prisma.$executeRaw`DELETE FROM "User" WHERE "role"::text <> ALL(${valid}::text[])`;
  } catch {
    // Table might not exist yet on first deploy — safe to ignore
    return 0;
  }
}
