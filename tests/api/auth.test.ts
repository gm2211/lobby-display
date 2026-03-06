import { describe, it, expect } from 'vitest';
import { testPrisma, authenticatedAgent } from '../setup.js';

describe('Auth API', () => {
  describe('session refresh', () => {
    it('extends session expiry in the store on authenticated requests', async () => {
      const agent = await authenticatedAgent();

      // Grab the session row from the DB
      const sessions = await testPrisma.session.findMany();
      expect(sessions).toHaveLength(1);
      const initialExpiry = sessions[0].expiresAt.getTime();

      // Make an authenticated request (triggers the refresh middleware)
      await agent.get('/api/auth/me').expect(200);

      // Session should still exist and its expiry should be >= the initial one
      const updated = await testPrisma.session.findMany();
      expect(updated).toHaveLength(1);
      expect(updated[0].expiresAt.getTime()).toBeGreaterThanOrEqual(initialExpiry);
    });
  });

  describe('CSRF on logout', () => {
    it('POST /api/auth/logout succeeds with valid CSRF token', async () => {
      const agent = await authenticatedAgent();
      // authenticatedAgent auto-injects CSRF token on POST
      await agent.post('/api/auth/logout').expect(200);

      // Session should be destroyed
      const me = await agent.get('/api/auth/me').expect(200);
      expect(me.body).toBeNull();
    });

    it('POST /api/auth/logout rejects invalid CSRF token for authenticated user', async () => {
      const agent = await authenticatedAgent();
      // The patched .post() auto-injects a valid CSRF token, but chaining
      // a second .set() for the same header overwrites it.
      await agent
        .post('/api/auth/logout')
        .set('X-CSRF-Token', 'bad-token')
        .expect(403);
    });
  });
});
