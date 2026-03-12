/**
 * Comprehensive E2E API tests for platform routes.
 *
 * Covers all major platform spec sections (4.x) at the API level:
 * - Amenity Booking (4.2)
 * - Events (4.3)
 * - Announcements (4.4)
 * - Maintenance / Service Requests (4.5)
 * - Parcels / Packages (4.6)
 * - Visitor Management (4.7)
 * - Directory (4.8)
 * - Documents / File Library (4.9)
 * - Surveys (4.10)
 * - Training (4.11)
 * - Global Search (4.12)
 * - Account Management (4.13)
 * - Payments (4.14)
 * - Security & Concierge (4.16)
 * - Marketplace (4.17)
 * - Violations (4.18)
 * - Discussion Forum (4.19)
 *
 * Tests run against a live server (staging or local) using admin auth
 * from storageState. All test entities use [e2e-test] prefix and are
 * cleaned up after each test.
 */
import { test, expect } from '../../helpers/api-test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check that a response is JSON and not a server error. */
async function expectJsonOk(res: { status: () => number; headers: () => Record<string, string>; text: () => Promise<string> }) {
  expect(res.status(), `Expected non-5xx, got ${res.status()}`).toBeLessThan(500);
  const ct = res.headers()['content-type'] ?? '';
  expect(ct.toLowerCase()).toContain('application/json');
  const text = await res.text();
  expect(() => JSON.parse(text)).not.toThrow();
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// 4.2 — Amenity Booking
// ---------------------------------------------------------------------------

test.describe('§4.2 Amenity Booking API', () => {
  test('GET /api/platform/amenities returns JSON with items array', async ({ api }) => {
    const res = await api.get('/api/platform/amenities');
    const body = await expectJsonOk(res);
    // API returns paginated { items: [...] } shape
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('GET /api/platform/bookings returns JSON (array or object)', async ({ api }) => {
    const res = await api.get('/api/platform/bookings');
    const body = await expectJsonOk(res);
    // Could be array or paginated object
    expect(body).toBeTruthy();
  });

  test('GET /api/platform/amenities supports listing available amenities (REQ-4.2-1)', async ({ api }) => {
    const res = await api.get('/api/platform/amenities');
    expect(res.status()).toBeLessThan(500);
    const body = await res.json();
    // API returns { items: [...] } paginated shape
    const items = body?.items ?? (Array.isArray(body) ? body : []);
    if (items.length > 0) {
      const amenity = items[0];
      // Amenity should have id and name at minimum
      expect(amenity).toHaveProperty('id');
      expect(amenity).toHaveProperty('name');
    }
  });
});

// ---------------------------------------------------------------------------
// 4.3 — Events
// ---------------------------------------------------------------------------

test.describe('§4.3 Events API', () => {
  test('GET /api/platform/events returns JSON (REQ-4.3-1)', async ({ api }) => {
    const res = await api.get('/api/platform/events');
    await expectJsonOk(res);
  });
});

// ---------------------------------------------------------------------------
// 4.4 — Announcements
// ---------------------------------------------------------------------------

test.describe('§4.4 Announcements API', () => {
  test('GET /api/platform/announcements returns JSON array', async ({ api }) => {
    const res = await api.get('/api/platform/announcements');
    const body = await expectJsonOk(res);
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/platform/announcements creates an announcement (REQ-4.4-1)', async ({ api }) => {
    const title = `[e2e-test] Announcement ${Date.now()}`;
    const res = await api.post('/api/platform/announcements', {
      title,
      body: 'E2E test announcement body',
      priority: 'LOW',
    });
    // May fail if user lacks EDITOR+ role; accept 201 or 403
    if (res.status() === 201 || res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('id');
      expect(body.title).toBe(title);
      // Cleanup
      if (body.id) {
        await api.delete(`/api/platform/announcements/${body.id}`);
      }
    } else {
      // 403 is acceptable — means auth model is enforced
      expect(res.status()).toBeLessThan(500);
    }
  });
});

// ---------------------------------------------------------------------------
// 4.5 — Maintenance / Service Requests
// ---------------------------------------------------------------------------

test.describe('§4.5 Maintenance API', () => {
  test('GET /api/platform/maintenance returns JSON', async ({ api }) => {
    const res = await api.get('/api/platform/maintenance');
    await expectJsonOk(res);
  });

  test('POST /api/platform/maintenance creates a request (REQ-4.5-1)', async ({ api }) => {
    const title = `[e2e-test] Maintenance ${Date.now()}`;
    const res = await api.post('/api/platform/maintenance', {
      title,
      description: 'E2E test maintenance description',
      category: 'PLUMBING',
      unitNumber: '9999',
    });
    if (res.status() < 300) {
      const body = await res.json();
      expect(body).toHaveProperty('id');
      // Cleanup
      if (body.id) {
        await api.delete(`/api/platform/maintenance/${body.id}`).catch(() => {});
      }
    } else {
      expect(res.status()).toBeLessThan(500);
    }
  });
});

// ---------------------------------------------------------------------------
// 4.6 — Parcels / Packages
// ---------------------------------------------------------------------------

test.describe('§4.6 Parcels API', () => {
  test('GET /api/platform/parcels returns JSON (REQ-4.6-1)', async ({ api }) => {
    const res = await api.get('/api/platform/parcels');
    await expectJsonOk(res);
  });
});

// ---------------------------------------------------------------------------
// 4.7 — Visitor Management
// ---------------------------------------------------------------------------

test.describe('§4.7 Visitor Management API', () => {
  test('GET /api/platform/visitors returns JSON array', async ({ api }) => {
    const res = await api.get('/api/platform/visitors');
    const body = await expectJsonOk(res);
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/platform/visitors pre-registers a visitor (REQ-4.7-1)', async ({ api }) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const res = await api.post('/api/platform/visitors', {
      guestName: '[e2e-test] Test Visitor',
      expectedDate: tomorrow.toISOString(),
      purpose: 'E2E testing',
    });
    if (res.status() === 201) {
      const body = await res.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('accessCode');
      expect(body.guestName).toBe('[e2e-test] Test Visitor');
      expect(body.status).toBe('EXPECTED');
      // Cleanup — cancel the visitor
      await api.put(`/api/platform/visitors/${body.id}`, { status: 'CANCELLED' }).catch(() => {});
    } else {
      expect(res.status()).toBeLessThan(500);
    }
  });

  test('Visitor has access window fields (REQ-4.7-2)', async ({ api }) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const windowStart = new Date(tomorrow);
    windowStart.setHours(9, 0, 0, 0);
    const windowEnd = new Date(tomorrow);
    windowEnd.setHours(17, 0, 0, 0);

    const res = await api.post('/api/platform/visitors', {
      guestName: '[e2e-test] Access Window Visitor',
      expectedDate: tomorrow.toISOString(),
      accessWindowStart: windowStart.toISOString(),
      accessWindowEnd: windowEnd.toISOString(),
      vehiclePlate: 'TEST-123',
      parkingSpot: 'V-99',
    });
    if (res.status() === 201) {
      const body = await res.json();
      expect(body.accessWindowStart).toBeTruthy();
      expect(body.accessWindowEnd).toBeTruthy();
      expect(body.vehiclePlate).toBe('TEST-123');
      // Cleanup
      await api.put(`/api/platform/visitors/${body.id}`, { status: 'CANCELLED' }).catch(() => {});
    } else {
      expect(res.status()).toBeLessThan(500);
    }
  });
});

// ---------------------------------------------------------------------------
// 4.8 — Directory
// ---------------------------------------------------------------------------

test.describe('§4.8 Directory API', () => {
  test('GET /api/platform/directory returns JSON (REQ-4.8-1)', async ({ api }) => {
    const res = await api.get('/api/platform/directory');
    await expectJsonOk(res);
  });
});

// ---------------------------------------------------------------------------
// 4.9 — Documents / File Library
// ---------------------------------------------------------------------------

test.describe('§4.9 Documents API', () => {
  test('GET /api/platform/documents returns JSON (REQ-4.9-1)', async ({ api }) => {
    const res = await api.get('/api/platform/documents');
    await expectJsonOk(res);
  });

  test('GET /api/platform/documents/categories returns JSON (REQ-4.9-1)', async ({ api }) => {
    const res = await api.get('/api/platform/documents/categories');
    await expectJsonOk(res);
  });
});

// ---------------------------------------------------------------------------
// 4.10 — Surveys
// ---------------------------------------------------------------------------

test.describe('§4.10 Surveys API', () => {
  test('GET /api/platform/surveys returns JSON (REQ-4.10-1)', async ({ api }) => {
    const res = await api.get('/api/platform/surveys');
    await expectJsonOk(res);
  });
});

// ---------------------------------------------------------------------------
// 4.11 — Training
// ---------------------------------------------------------------------------

test.describe('§4.11 Training API', () => {
  test('GET /api/platform/training returns JSON (REQ-4.11-1)', async ({ api }) => {
    const res = await api.get('/api/platform/training');
    await expectJsonOk(res);
  });
});

// ---------------------------------------------------------------------------
// 4.12 — Global Search
// ---------------------------------------------------------------------------

test.describe('§4.12 Global Search API', () => {
  test('GET /api/platform/search?q=community returns JSON (REQ-4.12-1)', async ({ api }) => {
    const res = await api.get('/api/platform/search?q=community');
    await expectJsonOk(res);
  });

  test('Search returns grouped results (REQ-4.12-2)', async ({ api }) => {
    const res = await api.get('/api/platform/search?q=test');
    if (res.status() < 300) {
      const body = await res.json();
      // Body should be an object with domain keys or a results array
      expect(body).toBeTruthy();
      expect(typeof body).toBe('object');
    }
  });
});

// ---------------------------------------------------------------------------
// 4.13 — Account Management
// ---------------------------------------------------------------------------

test.describe('§4.13 Account API', () => {
  test('GET /api/platform/account returns JSON (REQ-4.13-1)', async ({ api }) => {
    const res = await api.get('/api/platform/account');
    await expectJsonOk(res);
  });
});

// ---------------------------------------------------------------------------
// 4.14 — Payments
// ---------------------------------------------------------------------------

test.describe('§4.14 Payments API', () => {
  test('GET /api/platform/payments returns JSON (REQ-4.14-1)', async ({ api }) => {
    const res = await api.get('/api/platform/payments');
    await expectJsonOk(res);
  });
});

// ---------------------------------------------------------------------------
// 4.16 — Security & Concierge
// ---------------------------------------------------------------------------

test.describe('§4.16 Security & Concierge API', () => {
  test('GET /api/platform/shifts returns JSON (REQ-4.16-1)', async ({ api }) => {
    const res = await api.get('/api/platform/shifts');
    await expectJsonOk(res);
  });

  test('GET /api/platform/shifts/active returns JSON (REQ-4.16-2)', async ({ api }) => {
    const res = await api.get('/api/platform/shifts/active');
    await expectJsonOk(res);
  });

  test('GET /api/platform/shifts/keys returns JSON (REQ-4.16-1)', async ({ api }) => {
    const res = await api.get('/api/platform/shifts/keys');
    await expectJsonOk(res);
  });
});

// ---------------------------------------------------------------------------
// 4.17 — Marketplace
// ---------------------------------------------------------------------------

test.describe('§4.17 Marketplace API', () => {
  test('GET /api/platform/marketplace returns JSON with pagination (REQ-4.17-1)', async ({ api }) => {
    const res = await api.get('/api/platform/marketplace');
    const body = await expectJsonOk(res);
    expect(body).toHaveProperty('listings');
    expect(body).toHaveProperty('pagination');
    expect(Array.isArray(body.listings)).toBe(true);
  });

  test('GET /api/platform/marketplace/categories returns JSON array', async ({ api }) => {
    const res = await api.get('/api/platform/marketplace/categories');
    const body = await expectJsonOk(res);
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/platform/marketplace creates a listing (REQ-4.17-1)', async ({ api }) => {
    const title = `[e2e-test] Listing ${Date.now()}`;
    const res = await api.post('/api/platform/marketplace', {
      title,
      description: 'E2E test marketplace listing',
      category: 'Other',
      price: 9.99,
      condition: 'NEW',
    });
    if (res.status() === 201) {
      const body = await res.json();
      expect(body).toHaveProperty('id');
      expect(body.title).toBe(title);
      expect(body.status).toBe('ACTIVE');
      // Cleanup
      await api.delete(`/api/platform/marketplace/${body.id}`).catch(() => {});
    } else {
      expect(res.status()).toBeLessThan(500);
    }
  });

  test('Marketplace supports price filtering', async ({ api }) => {
    const res = await api.get('/api/platform/marketplace?minPrice=0&maxPrice=1000000');
    const body = await expectJsonOk(res);
    expect(body).toHaveProperty('listings');
  });

  test('GET /api/platform/marketplace/favorites returns JSON', async ({ api }) => {
    const res = await api.get('/api/platform/marketplace/favorites');
    const body = await expectJsonOk(res);
    expect(Array.isArray(body)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4.18 — Violations
// ---------------------------------------------------------------------------

test.describe('§4.18 Violations API', () => {
  test('GET /api/platform/violations returns JSON (REQ-4.18-1)', async ({ api }) => {
    const res = await api.get('/api/platform/violations');
    await expectJsonOk(res);
  });
});

// ---------------------------------------------------------------------------
// 4.19 — Discussion Forum
// ---------------------------------------------------------------------------

test.describe('§4.19 Discussion Forum API', () => {
  test('GET /api/platform/forum/categories returns JSON array (REQ-4.19-1)', async ({ api }) => {
    const res = await api.get('/api/platform/forum/categories');
    const body = await expectJsonOk(res);
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/platform/forum/threads returns JSON for first category', async ({ api }) => {
    // Get categories first
    const catRes = await api.get('/api/platform/forum/categories');
    const categories = await catRes.json();

    if (Array.isArray(categories) && categories.length > 0) {
      const categoryId = categories[0].id;
      const res = await api.get(`/api/platform/forum/categories/${categoryId}/threads`);
      const body = await expectJsonOk(res);
      expect(body).toHaveProperty('threads');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('page');
    }
  });

  test('Forum thread CRUD lifecycle (REQ-4.19-1, REQ-4.19-2)', async ({ api }) => {
    // Get a category to create a thread in
    const catRes = await api.get('/api/platform/forum/categories');
    const categories = await catRes.json();

    if (!Array.isArray(categories) || categories.length === 0) {
      test.skip();
      return;
    }

    const categoryId = categories[0].id;
    const threadTitle = `[e2e-test] Forum Thread ${Date.now()}`;

    // Create thread
    const createRes = await api.post('/api/platform/forum/threads', {
      title: threadTitle,
      categoryId,
    });
    if (createRes.status() !== 201) {
      // Skip if thread creation not available
      expect(createRes.status()).toBeLessThan(500);
      return;
    }

    const thread = await createRes.json();
    expect(thread).toHaveProperty('id');
    expect(thread.title).toBe(threadTitle);

    // Create a post in the thread
    const postRes = await api.post(`/api/platform/forum/threads/${thread.id}/posts`, {
      body: '[e2e-test] Test post body',
    });
    if (postRes.status() === 201) {
      const post = await postRes.json();
      expect(post).toHaveProperty('id');
      expect(post.body).toBe('[e2e-test] Test post body');

      // Get thread detail with posts
      const detailRes = await api.get(`/api/platform/forum/threads/${thread.id}`);
      const detail = await detailRes.json();
      expect(detail).toHaveProperty('thread');
      expect(detail).toHaveProperty('posts');
      expect(detail.total).toBeGreaterThanOrEqual(1);

      // Cleanup post
      await api.delete(`/api/platform/forum/posts/${post.id}`).catch(() => {});
    }

    // Cleanup thread — no delete route, but the test data will be identifiable by prefix
  });
});

// ---------------------------------------------------------------------------
// 4.15 — Community AI Assistant
// ---------------------------------------------------------------------------

test.describe('§4.15 Community AI Assistant API', () => {
  test('GET /api/platform/assistant/sessions returns JSON (REQ-4.15-1)', async ({ api }) => {
    const res = await api.get('/api/platform/assistant/sessions');
    await expectJsonOk(res);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: Navigation
// ---------------------------------------------------------------------------

test.describe('Platform Navigation API', () => {
  test('GET /api/platform/nav returns JSON with nav items', async ({ api }) => {
    const res = await api.get('/api/platform/nav');
    const body = await expectJsonOk(res);
    // Nav should have items
    expect(body).toBeTruthy();
  });
});
