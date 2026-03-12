import type { ApiClient } from './api-client';

const PREFIX = '[e2e-test]';

interface TrackedEntity {
  type: 'services' | 'events' | 'advisories' | 'users';
  id: number;
}

/**
 * Creates test entities with the [e2e-test] prefix and tracks them
 * so they can be cleaned up via `cleanup()`.
 */
export class TestDataManager {
  private created: TrackedEntity[] = [];

  constructor(private api: ApiClient) {}

  async createService(overrides: Record<string, unknown> = {}) {
    const res = await this.api.post('/api/services', {
      name: `${PREFIX} Service ${Date.now()}`,
      status: 'Operational',
      sortOrder: 9999,
      ...overrides,
    });
    const body = await res.json();
    this.created.push({ type: 'services', id: body.id });
    return body;
  }

  async createEvent(overrides: Record<string, unknown> = {}) {
    const res = await this.api.post('/api/events', {
      title: `${PREFIX} Event ${Date.now()}`,
      subtitle: 'E2E test subtitle',
      details: ['Test detail 1'],
      sortOrder: 9999,
      ...overrides,
    });
    const body = await res.json();
    this.created.push({ type: 'events', id: body.id });
    return body;
  }

  async createAdvisory(overrides: Record<string, unknown> = {}) {
    const res = await this.api.post('/api/advisories', {
      message: `${PREFIX} Advisory ${Date.now()}`,
      active: false,
      ...overrides,
    });
    const body = await res.json();
    this.created.push({ type: 'advisories', id: body.id });
    return body;
  }

  /** Soft-delete all created entities (marks them for deletion). */
  async cleanup() {
    for (const entity of [...this.created].reverse()) {
      try {
        await this.api.delete(`/api/${entity.type}/${entity.id}`);
      } catch {
        // Best-effort cleanup — entity might already be gone
      }
    }
    this.created = [];
  }
}
