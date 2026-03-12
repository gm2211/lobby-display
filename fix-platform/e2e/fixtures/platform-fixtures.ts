import type { ApiClient } from '../helpers/api-client';

const PREFIX = '[e2e-test]';

/**
 * Tracks platform entities created during a test so they can be
 * cleaned up via `cleanup()` at the end of a test or suite.
 *
 * Convention: all created entities use the `[e2e-test]` prefix and
 * `sortOrder: 9999` / `active: false` to minimise dashboard impact.
 */
export class PlatformFixtures {
  private created: Array<{ path: string; id: number }> = [];

  constructor(private api: ApiClient) {}

  // ---------------------------------------------------------------------------
  // Platform announcements
  // ---------------------------------------------------------------------------

  /**
   * Create a test platform announcement via the API.
   * Announcements live at /api/platform/announcements (future route).
   */
  async createAnnouncement(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const res = await this.api.post('/api/platform/announcements', {
      title: `${PREFIX} Announcement ${Date.now()}`,
      body: 'E2E test announcement body',
      active: false,
      sortOrder: 9999,
      ...overrides,
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body.id === 'number') {
      this.created.push({ path: '/api/platform/announcements', id: body.id });
    }
    return body;
  }

  // ---------------------------------------------------------------------------
  // Platform maintenance requests
  // ---------------------------------------------------------------------------

  /**
   * Create a test maintenance request via the API.
   * Maintenance requests live at /api/platform/maintenance (future route).
   */
  async createMaintenanceRequest(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const res = await this.api.post('/api/platform/maintenance', {
      title: `${PREFIX} Maintenance Request ${Date.now()}`,
      description: 'E2E test maintenance description',
      status: 'open',
      unitNumber: '9999',
      ...overrides,
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body.id === 'number') {
      this.created.push({ path: '/api/platform/maintenance', id: body.id });
    }
    return body;
  }

  // ---------------------------------------------------------------------------
  // Platform users (resident accounts)
  // ---------------------------------------------------------------------------

  /**
   * Create a test platform resident user via the API.
   * Platform users live at /api/users (existing route) with role VIEWER.
   */
  async createPlatformUser(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const suffix = Date.now();
    const res = await this.api.post('/api/users', {
      username: `${PREFIX.replace(/[\[\]]/g, '').trim()}-user-${suffix}`,
      password: 'TestPassword123!',
      role: 'VIEWER',
      ...overrides,
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body.id === 'number') {
      this.created.push({ path: '/api/users', id: body.id });
    }
    return body;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /**
   * Delete all entities created during the test (best-effort; ignores errors).
   */
  async cleanup(): Promise<void> {
    for (const entity of [...this.created].reverse()) {
      try {
        await this.api.delete(`${entity.path}/${entity.id}`);
      } catch {
        // Best-effort cleanup — entity might already be gone or route not yet implemented
      }
    }
    this.created = [];
  }
}
