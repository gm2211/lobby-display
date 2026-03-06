import type { Page, Locator } from '@playwright/test';

/**
 * Page object for the platform shell.
 *
 * Encapsulates selectors and interactions for the PlatformLayout:
 * sidebar navigation, top bar, and main content area.
 */
export class PlatformPage {
  readonly page: Page;

  // Sidebar
  readonly sidebar: Locator;
  readonly sidebarNavItems: Locator;

  // Top bar
  readonly topBar: Locator;

  // Content area
  readonly contentArea: Locator;

  constructor(page: Page) {
    this.page = page;

    // Sidebar — the platform layout renders a nav element with role="navigation"
    // or a data-testid. Fall back to the semantic nav within the platform shell.
    this.sidebar = page.locator('[data-testid="platform-sidebar"], nav[aria-label="Platform navigation"], .platform-sidebar, aside').first();

    // Individual nav items within the sidebar
    this.sidebarNavItems = page.locator(
      '[data-testid="platform-sidebar"] a, nav[aria-label="Platform navigation"] a, .platform-sidebar a, aside a',
    );

    // Top bar — fixed bar at the top of the platform shell
    this.topBar = page.locator(
      '[data-testid="platform-topbar"], header[aria-label="Platform header"], .platform-topbar, .platform-header',
    ).first();

    // Main content area where page content renders
    this.contentArea = page.locator(
      '[data-testid="platform-content"], main[aria-label="Platform content"], .platform-content, main',
    ).first();
  }

  /**
   * Navigate to a named section within the platform.
   *
   * @param section - The nav item label text (e.g. "Announcements", "Maintenance")
   */
  async navigateTo(section: string): Promise<void> {
    const navItem = this.page.locator(
      `[data-testid="platform-sidebar"] a, nav[aria-label="Platform navigation"] a, .platform-sidebar a, aside a`,
      { hasText: section },
    ).first();
    await navItem.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Returns true if the sidebar is visible on the page.
   */
  async isSidebarVisible(): Promise<boolean> {
    // Try all candidate selectors independently so we find at least one match.
    const candidates = [
      '[data-testid="platform-sidebar"]',
      'nav[aria-label="Platform navigation"]',
      '.platform-sidebar',
      'aside',
    ];
    for (const selector of candidates) {
      const el = this.page.locator(selector).first();
      const count = await el.count();
      if (count > 0) {
        const visible = await el.isVisible();
        if (visible) return true;
      }
    }
    return false;
  }

  /**
   * Returns the text content of the currently active nav item.
   * Looks for links with an `aria-current="page"` attribute or an
   * `active` / `is-active` CSS class applied by the router.
   */
  async getActiveNavItem(): Promise<string | null> {
    const active = this.page
      .locator(
        '[data-testid="platform-sidebar"] a[aria-current="page"], ' +
          'nav[aria-label="Platform navigation"] a[aria-current="page"], ' +
          '.platform-sidebar a[aria-current="page"], ' +
          'aside a[aria-current="page"], ' +
          '.platform-sidebar a.active, ' +
          'aside a.active, ' +
          '.platform-nav-item.active, ' +
          '[data-testid="platform-sidebar"] .active',
      )
      .first();

    const count = await active.count();
    if (count === 0) return null;
    return active.textContent();
  }

  /**
   * Returns the text content of the page title in the content area.
   * Looks for the first heading inside the main content area.
   */
  async getPageTitle(): Promise<string | null> {
    const heading = this.contentArea.locator('h1, h2').first();
    const count = await heading.count();
    if (count === 0) return null;
    return heading.textContent();
  }
}
