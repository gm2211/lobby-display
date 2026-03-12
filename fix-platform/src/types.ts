/**
 * Type definitions for Renzo Dashboard entities.
 *
 * AI AGENT NOTES:
 * - All entities have `markedForDeletion` for the draft/publish workflow
 * - Items with markedForDeletion=true are shown with strikethrough in admin
 * - Actual deletion happens only on publish
 * - The `deletedAt` field in the database schema is vestigial (not used)
 */

/**
 * Building service status (e.g., elevators, HVAC, internet).
 *
 * DISPLAY: Shown in ServiceTable on the dashboard with status color.
 * ADMIN: Editable via ServicesSection with status dropdown.
 */
export interface Service {
  /** Database primary key */
  id: number;
  /** Display name (e.g., "Elevators", "Mail Room") */
  name: string;
  /** Current operational status - determines color indicator */
  status: 'Operational' | 'Maintenance' | 'Outage';
  /** Optional notes visible only in admin interface */
  notes: string;
  /** ISO timestamp of last status check (auto-updated on status change) */
  lastChecked: string;
  /** Display order in the table (lower = first) */
  sortOrder: number;
  /**
   * Draft deletion flag - item will be hard-deleted on publish.
   * While true, shows strikethrough in admin with undo option.
   * Always returned by the API.
   */
  markedForDeletion: boolean;
}

/**
 * Event card displayed on the dashboard (announcements, updates).
 *
 * DISPLAY: Auto-scrolling cards in the events section.
 * ADMIN: Editable via EventsSection with markdown editor.
 */
export interface Event {
  /** Database primary key */
  id: number;
  /** Main heading (required) */
  title: string;
  /** Italic subheading below title (optional) */
  subtitle: string;
  /**
   * Body content as array of lines (supports markdown-like formatting).
   * Stored as JSON string in database, parsed to array in API.
   */
  details: string[];
  /** Background image URL (optional - uses gradient if empty) */
  imageUrl: string;
  /** Accent color for bottom border (currently unused, reserved) */
  accentColor: string;
  /** Display order (lower = first in scroll) */
  sortOrder: number;
  /** Draft deletion flag. Always returned by the API. */
  markedForDeletion: boolean;
}

/**
 * Advisory ticker message (weather alerts, announcements).
 *
 * DISPLAY: Scrolling ticker at bottom of dashboard.
 * ADMIN: Editable via AdvisoriesSection.
 */
export interface Advisory {
  /** Database primary key */
  id: number;
  /** The advisory message text */
  message: string;
  /** Whether this advisory appears in the ticker (can disable without deleting) */
  active: boolean;
  /** Draft deletion flag. Always returned by the API. */
  markedForDeletion: boolean;
}

/**
 * Building-level configuration (identity and display settings).
 *
 * NOTE: There is only ever ONE config record in the database.
 * The ID is always 1.
 */
export interface BuildingConfig {
  /** Always 1 (singleton record) */
  id: number;
  /** Dashboard title displayed in header */
  dashboardTitle: string;

  /**
   * Events scroll speed in seconds (time to complete one full scroll).
   * Higher = slower. 0 = stopped.
   */
  scrollSpeed: number;
  /**
   * Advisory ticker speed in seconds.
   * Higher = slower. 0 = stopped.
   */
  tickerSpeed: number;
  /**
   * Services table page transition speed in seconds.
   * Higher = slower. 0 = stopped (no auto-pagination).
   */
  servicesScrollSpeed: number;
  /** Font size in px for service name values in the table */
  servicesFontSize: number;
  /** Font size in px for notes values in the table */
  notesFontSize: number;
  /** Font weight for notes values (e.g. 400=normal, 700=bold) */
  notesFontWeight: number;
}

/**
 * Published snapshot metadata (version history entry).
 *
 * Used in the History view to list all published versions.
 */
export interface Snapshot {
  /** Database primary key */
  id: number;
  /** Sequential version number (1, 2, 3, ...) */
  version: number;
  /** ISO timestamp when this version was published */
  publishedAt: string;
  /** Username of the user who published this version */
  publishedBy: string;
}

/**
 * Full snapshot data including all entities.
 *
 * Used when restoring a specific version or viewing diff.
 */
export interface SnapshotData {
  /** Version number of this snapshot */
  version: number;
  /** When this snapshot was published */
  publishedAt: string;
  /** All services at time of snapshot */
  services: Service[];
  /** All events at time of snapshot */
  events: Event[];
  /** All advisories at time of snapshot */
  advisories: Advisory[];
  /** Config at time of snapshot */
  config: BuildingConfig | null;
}

/**
 * Diff between two snapshots for version comparison.
 *
 * Used in the History view to show what changed between versions.
 * "from" is the earlier version, "to" is the later version.
 */
export interface SnapshotDiff {
  services: {
    added: Service[];
    removed: Service[];
    changed: { from: Service; to: Service }[];
  };
  events: {
    added: Event[];
    removed: Event[];
    changed: { from: Event; to: Event }[];
  };
  advisories: {
    added: Advisory[];
    removed: Advisory[];
    changed: { from: Advisory; to: Advisory }[];
  };
  config: {
    /** Individual field changes in config */
    changed: { field: string; from: unknown; to: unknown }[];
  };
}

export interface AuthUser {
  id: number;
  username: string;
  role: 'VIEWER' | 'EDITOR' | 'ADMIN';
}
