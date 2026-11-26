import { describe, it, expect } from 'vitest';
import { testPrisma } from '../setup.js';
import { cleanupStaleUsers } from '../../server/utils/staleUsers.js';

describe('cleanupStaleUsers (runs on every server start)', () => {
  it('keeps VIEWER, EDITOR and ADMIN users', async () => {
    for (const role of ['VIEWER', 'EDITOR', 'ADMIN'] as const) {
      await testPrisma.user.create({ data: { username: `u-${role}`, passwordHash: 'x', role } });
    }
    const removed = await cleanupStaleUsers();
    expect(removed).toBe(0);
    const roles = (await testPrisma.user.findMany()).map(u => u.role).sort();
    expect(roles).toEqual(['ADMIN', 'EDITOR', 'VIEWER']);
  });
});
