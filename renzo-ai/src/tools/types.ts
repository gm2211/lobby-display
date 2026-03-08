// Condo Control MCP Server — types, constants, amenity IDs

// ─── Base URL ───────────────────────────────────────────────────────────────

export const BASE_URL = "https://app.condocontrol.com";
export const WORKSPACE_ID = 14381;

// ─── Amenities ──────────────────────────────────────────────────────────────

export interface AmenityInfo {
  id: number;
  name: string;
  bookingStyleId?: number;
  fee?: string;
}

export const AMENITIES: Record<number, AmenityInfo> = {
  12293: { id: 12293, name: "BBQ Grill (Grill 1)", bookingStyleId: 4, fee: "No Fee" },
  12294: { id: 12294, name: "Cinema Screening Room" },
  12295: { id: 12295, name: "Click Cafe & Private Dining" },
  12273: { id: 12273, name: "Virtual Golf (Front Bay)" },
  12274: { id: 12274, name: "Virtual Golf (Rear Bay)" },
  12299: { id: 12299, name: "Pet Grooming Room" },
  12301: { id: 12301, name: "Move In/Move Out", bookingStyleId: 4, fee: "No Fee" },
  12304: { id: 12304, name: "Spa Massage Room", bookingStyleId: 1 },
  12306: { id: 12306, name: "The Studio on 10" },
  12307: { id: 12307, name: "Yoga Room" },
  16698: { id: 16698, name: "Large Deliveries", bookingStyleId: 4, fee: "No Fee" },
  18114: { id: 18114, name: "Business Center on 10" },
};

// ─── Booking Status Codes ───────────────────────────────────────────────────

export const BOOKING_STATUS = {
  PENDING: 10,
  APPROVED: 11,
  CANCELLED: 13,
  OVERDUE: 41,
  NO_SHOW: 55,
} as const;

export const BOOKING_STATUS_LABELS: Record<number, string> = {
  10: "Pending",
  11: "Approved",
  13: "Cancelled",
  41: "Overdue",
  55: "No Show",
};

// ─── Auth Types ─────────────────────────────────────────────────────────────

export interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
}

export interface SessionCookies {
  CCCookie: string;
  "ASP.NET_SessionId": string;
  cf_clearance: string;
}

export interface CCJwtPayload {
  sub: string;
  UserId: string;
  UserName: string;
  WorkspaceId: string;
  WorkspaceName: string;
  WorkspaceCurrency: string;
  WorkspaceTimeZone: string;
  exp: number;
  iss: string;
}

// ─── Calendar Event (from /amenity/json-source/) ────────────────────────────

export interface CalendarEvent {
  id: number;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string;
  textColor: string;
  isEventOwner: boolean;
  isLinkedBooking: boolean;
  isHoliday: boolean;
}

// ─── Dashboard (from /my/my-home-v2) ────────────────────────────────────────

export interface WeatherBanner {
  banner: string;
  workspaceTitle: string;
  isImperial: boolean;
  weatherDegree: string;
  weatherWind: string;
  workspaceLocation: string;
  weatherSummary: string;
  weatherIcon: string;
}

export interface WidgetItem {
  id: number;
  title: string;
  date: string | null;
  desc: string;
  class: string | null;
  link: string;
  additionalInfo: string;
  image?: {
    fileRecordID: number;
    s3UniqueKey: string;
  };
}

export interface DashboardWidget {
  type: number;
  panelType: number;
  displayName: string | null;
  class: string | null;
  timeRange: string;
  link: string | null;
  itemList: WidgetItem[];
}

export interface DashboardResponse {
  weatherBanner: WeatherBanner;
  panels: unknown[];
  smallWidgets: DashboardWidget[];
  largeWidgets: DashboardWidget[];
}

// ─── Navigation (from /my/navigation) ───────────────────────────────────────

export interface NavMenuItem {
  id?: string;
  label: string;
  icon?: string;
  path: string;
  openInNewWindow: boolean;
  isLive: boolean;
  expandedByDefault: boolean;
  subItems?: NavMenuItem[];
}

export interface NavigationResponse {
  topbar: {
    userInitials: string;
    userActions: { id: string; label: string; icon: string }[];
    helpActions: { id: string; label: string }[];
    searchBar: { placeholder: string };
    communityAssistant: { buttonLabel: string };
  };
  sidebar: {
    selectedWorkspace: { name: string; id?: number };
    menuItems: NavMenuItem[];
    availableWorkspaces: { name: string; id: number }[];
  };
  footer: { buildVersion: string; brand: string };
}

// ─── Amenity Rules (from /amenity/get-amenity-rules/) ───────────────────────

export interface AmenityRulesResponse {
  js: string;
  message: string;
  availableDaysOfWeek: number[] | null;
  unavailableDates: string[];
}

// ─── Unavailable Dates ──────────────────────────────────────────────────────

export interface UnavailableDatesResponse {
  js: string;
  unavailableDates: string[];
}

// ─── Booking Search (from /amenity/search-amenity-booking) ──────────────────

export interface BookingSearchResponse {
  js: string;
  message: string;
  LastLoadedAmenityBookingID: number;
  isFirstPage: boolean;
}

// ─── Events Dashboard (from /event/get-events-dashboard/) ───────────────────

export interface EventsDashboardResponse {
  js: unknown[];
  locale: { code: string };
  strings: { more: string };
}

// ─── Event List (from POST /event/list-event/) ─────────────────────────────

export interface EventListResponse {
  calendarEvents: unknown[];
  eventModel: string;
}

// ─── HTML Partial Response ──────────────────────────────────────────────────

export interface HtmlPartialResponse {
  js: string;
  message: string;
}

// ─── Parsed Amenity Card (from cheerio parsing) ─────────────────────────────

export interface ParsedAmenityCard {
  name: string;
  imageUrl: string | null;
  feeLabel: string | null;
  bookingUrl: string | null;
  amenityId: number | null;
}

// ─── Parsed Booking Card (from cheerio parsing) ─────────────────────────────

export interface ParsedBookingCard {
  bookingId: string | null;
  amenityName: string;
  date: string | null;
  time: string | null;
  status: string | null;
  unit: string | null;
  viewUrl: string | null;
}

// ─── Parsed Time Slot (from amenity rules HTML) ─────────────────────────────

export interface ParsedTimeSlot {
  id: string;
  label: string;
}

// ─── Pricing Info (from update-pricing-structure HTML) ──────────────────────

export interface PricingInfo {
  fee: string | null;
  cancellationPolicy: string | null;
  rules: string[];
}
