import { test, expect } from '@playwright/test';

type SpecEvalCase = {
  specSection: string;
  feature: string;
  route: string;
  heading: RegExp;
  apiEndpoints: string[];
  settleMs?: number;
};

const RUN_SPEC_EVAL = process.env.RUN_SPEC_EVAL === '1';

const SPEC_EVAL_CASES: SpecEvalCase[] = [
  {
    specSection: '4.1',
    feature: 'Dashboard / Home',
    route: '/platform',
    heading: /good (morning|afternoon|evening)/i,
    apiEndpoints: [
      '/api/platform/announcements',
      '/api/platform/bookings',
      '/api/platform/maintenance',
    ],
    settleMs: 1800,
  },
  {
    specSection: '4.2',
    feature: 'Amenity Booking',
    route: '/platform/amenities',
    heading: /amenities/i,
    apiEndpoints: ['/api/platform/amenities'],
  },
  {
    specSection: '4.2',
    feature: 'All Bookings',
    route: '/platform/bookings',
    heading: /my bookings/i,
    apiEndpoints: ['/api/platform/bookings'],
  },
  {
    specSection: '4.3',
    feature: 'Events',
    route: '/platform/events',
    heading: /events/i,
    apiEndpoints: ['/api/platform/events'],
  },
  {
    specSection: '4.4',
    feature: 'Announcements',
    route: '/platform/announcements',
    heading: /announcements/i,
    apiEndpoints: ['/api/platform/announcements'],
  },
  {
    specSection: '4.5',
    feature: 'Maintenance / Service Requests',
    route: '/platform/maintenance',
    heading: /maintenance/i,
    apiEndpoints: ['/api/platform/maintenance'],
  },
  {
    specSection: '4.6',
    feature: 'Parcels / Packages',
    route: '/platform/parcels',
    heading: /parcels/i,
    apiEndpoints: ['/api/platform/parcels'],
  },
  {
    specSection: '4.8',
    feature: 'Directory',
    route: '/platform/directory',
    heading: /directory/i,
    apiEndpoints: ['/api/platform/directory'],
  },
  {
    specSection: '4.9',
    feature: 'Documents / File Library',
    route: '/platform/documents',
    heading: /documents/i,
    apiEndpoints: ['/api/platform/documents', '/api/platform/documents/categories'],
  },
  {
    specSection: '4.12',
    feature: 'Global Search',
    route: '/platform/search',
    heading: /search/i,
    apiEndpoints: ['/api/platform/search?q=community'],
  },
  {
    specSection: '4.15',
    feature: 'Community AI Assistant',
    route: '/platform/assistant',
    heading: /ai assistant/i,
    apiEndpoints: ['/api/platform/assistant/sessions'],
  },
  {
    specSection: '4.18',
    feature: 'Violations',
    route: '/platform/violations',
    heading: /violations/i,
    apiEndpoints: ['/api/platform/violations'],
  },
  {
    specSection: '4.19',
    feature: 'Discussion Forum',
    route: '/platform/forum',
    heading: /forum/i,
    apiEndpoints: ['/api/platform/forum/categories', '/api/platform/forum/threads'],
  },
  {
    specSection: '4.7',
    feature: 'Visitor Management',
    route: '/platform/visitors',
    heading: /visitor/i,
    apiEndpoints: ['/api/platform/visitors'],
  },
  {
    specSection: '4.10',
    feature: 'Surveys',
    route: '/platform/surveys',
    heading: /surveys/i,
    apiEndpoints: ['/api/platform/surveys'],
  },
  {
    specSection: '4.11',
    feature: 'Training',
    route: '/platform/training',
    heading: /training/i,
    apiEndpoints: ['/api/platform/training'],
  },
  {
    specSection: '4.13',
    feature: 'Account Management',
    route: '/platform/account',
    heading: /account/i,
    apiEndpoints: ['/api/platform/account'],
  },
  {
    specSection: '4.14',
    feature: 'Payments',
    route: '/platform/payments',
    heading: /payment/i,
    apiEndpoints: ['/api/platform/payments'],
  },
  {
    specSection: '4.16',
    feature: 'Security & Concierge',
    route: '/platform/shifts',
    heading: /shift/i,
    apiEndpoints: ['/api/platform/shifts'],
  },
  {
    specSection: '4.17',
    feature: 'Marketplace',
    route: '/platform/marketplace',
    heading: /marketplace/i,
    apiEndpoints: ['/api/platform/marketplace'],
  },
];

const BENIGN_CONSOLE_ERRORS = [/favicon/i, /EventSource/i];

test.describe('Platform spec-derived functional evals @spec-eval', () => {
  test.skip(!RUN_SPEC_EVAL, 'Set RUN_SPEC_EVAL=1 to run spec-derived eval tests.');

  test('Sidebar includes core product-spec areas @spec-eval', async ({ page }) => {
    await page.goto('/platform', { waitUntil: 'domcontentloaded' });
    await expect(page).not.toHaveURL(/\/login/);

    const expectedNavItems = [
      'Dashboard',
      'Announcements',
      'Maintenance',
      'Amenities',
      'Events',
      'Bookings',
      'Parcels',
      'Directory',
      'Documents',
      'Forum',
      'Violations',
      'Search',
    ];

    for (const navLabel of expectedNavItems) {
      await expect(page.getByRole('link', { name: new RegExp(navLabel, 'i') }).first()).toBeVisible();
    }
  });

  for (const evalCase of SPEC_EVAL_CASES) {
    test(
      `[${evalCase.specSection}] ${evalCase.feature} is functionally reachable @spec-eval`,
      async ({ page, request }) => {
        const consoleErrors: string[] = [];
        const pageErrors: string[] = [];

        page.on('console', (msg) => {
          if (msg.type() !== 'error') return;
          const text = msg.text();
          if (BENIGN_CONSOLE_ERRORS.some((pattern) => pattern.test(text))) return;
          consoleErrors.push(text);
        });

        page.on('pageerror', (error) => {
          pageErrors.push(error.message);
        });

        await page.goto(evalCase.route, { waitUntil: 'domcontentloaded' });
        await expect(page).not.toHaveURL(/\/login/);

        const heading = page.getByRole('heading', { name: evalCase.heading }).first();
        await expect(heading).toBeVisible({ timeout: 10_000 });

        await page.waitForTimeout(evalCase.settleMs ?? 1200);

        for (const endpoint of evalCase.apiEndpoints) {
          const response = await request.get(endpoint);
          expect(
            response.status(),
            `[${evalCase.specSection}] ${evalCase.feature}: ${endpoint} returned 5xx`,
          ).toBeLessThan(500);

          const contentType = response.headers()['content-type'] ?? '';
          expect(
            contentType.toLowerCase(),
            `[${evalCase.specSection}] ${evalCase.feature}: ${endpoint} was not JSON`,
          ).toContain('application/json');

          const bodyText = await response.text();
          expect(
            () => JSON.parse(bodyText),
            `[${evalCase.specSection}] ${evalCase.feature}: ${endpoint} returned invalid JSON`,
          ).not.toThrow();
        }

        expect(
          pageErrors,
          `[${evalCase.specSection}] ${evalCase.feature}: uncaught page errors detected`,
        ).toEqual([]);
        expect(
          consoleErrors,
          `[${evalCase.specSection}] ${evalCase.feature}: console errors detected`,
        ).toEqual([]);
      },
    );
  }
});
