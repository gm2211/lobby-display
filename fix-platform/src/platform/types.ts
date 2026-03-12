/**
 * Platform portal type definitions.
 *
 * These types mirror the Prisma schema enums and models for the platform portal.
 */

export type ViolationStatus = 'REPORTED' | 'UNDER_REVIEW' | 'CONFIRMED' | 'APPEALED' | 'RESOLVED' | 'DISMISSED';
export type ViolationSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Violation {
  id: number;
  unitNumber: string;
  category: string;
  description: string;
  status: ViolationStatus;
  severity: ViolationSeverity;
  fineAmount: number | null;
  dueDate: string | null;
  issuedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ViolationsListResponse {
  items: Violation[];
  nextCursor?: string;
}

export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface Announcement {
  id: number;
  title: string;
  body: string;
  category: string;
  priority: Priority;
  pinned: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  isRead: boolean;
}

export type MaintenanceStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface MaintenanceRequest {
  id: number;
  title: string;
  description: string;
  category: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  unitNumber: string;
  location?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceListResponse {
  items: MaintenanceRequest[];
  nextCursor?: string;
}

export interface MaintenanceComment {
  id: number;
  requestId: number;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export type ParcelStatus = 'RECEIVED' | 'NOTIFIED' | 'PICKED_UP';

export interface Parcel {
  id: number;
  trackingNumber: string;
  carrier: string;
  status: ParcelStatus;
  recipientName: string;
  unitNumber: string;
  description: string | null;
  receivedAt: string;
  notifiedAt: string | null;
  pickedUpAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParcelsListResponse {
  items: Parcel[];
  nextCursor?: string;
}

export interface PlatformEvent {
  id: string;
  title: string;
  description: string;
  location: string | null;
  startTime: string;
  endTime: string | null;
  isRecurring: boolean;
  recurrenceRule: string | null;
  capacity: number | null;
  imageId: string | null;
  createdBy: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _count: {
    rsvps: number;
  };
}

export interface EventsListResponse {
  items: PlatformEvent[];
  nextCursor?: string;
}

export type PlatformRole = 'RESIDENT' | 'BOARD_MEMBER' | 'MANAGER' | 'SECURITY' | 'CONCIERGE';

export interface DirectoryEntry {
  id: string;
  userId: string;
  displayName: string;
  title: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  visible: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  boardMember: boolean;
  user: {
    id: string;
    role: PlatformRole;
    unitNumber: string | null;
  };
}

export interface DirectoryListResponse {
  items: DirectoryEntry[];
  nextCursor?: string;
}

export type AvailabilityStatus = 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE';

export interface AmenityRule {
  id: number;
  amenityId: number;
  rule: string;
  sortOrder: number;
}

export interface AmenityImage {
  id: number;
  amenityId: number;
  url: string;
  caption: string | null;
  sortOrder: number;
}

export interface Amenity {
  id: number;
  name: string;
  description: string | null;
  category: string;
  location: string | null;
  capacity: number | null;
  pricePerHour: number | null;
  pricePerDay: number | null;
  availabilityStatus: AvailabilityStatus;
  requiresApproval: boolean;
  rules: AmenityRule[];
  images: AmenityImage[];
  createdAt: string;
  updatedAt: string;
}

export interface AmenitiesListResponse {
  items: Amenity[];
  nextCursor?: string;
}

export interface DocumentCategory {
  id: number;
  name: string;
  description: string | null;
}

export interface DocumentVersion {
  id: number;
  documentId: number;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  versionNumber: number;
  uploadedAt: string;
}

export interface Document {
  id: number;
  title: string;
  description: string | null;
  categoryId: number;
  category: DocumentCategory;
  versions: DocumentVersion[];
  uploadedById: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentsListResponse {
  items: Document[];
  nextCursor?: string;
}

// Payment types
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface PaymentItem {
  id: number;
  paymentId: number;
  violationId?: string | null;
  description: string;
  amount: string;
  category: string;
  createdAt?: string;
}

export interface Payment {
  id: number;
  userId: number;
  amount: string;
  currency: string;
  description: string;
  status: PaymentStatus;
  paymentMethod: string | null;
  externalId: string | null;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: PaymentItem[];
  user?: {
    id: number;
    unitNumber: string | null;
    displayName: string | null;
  };
}

export interface PaymentSummary {
  total: number;
  paid: number;
  pending: number;
  failed: number;
  refunded: number;
  count: number;
}

export interface PlatformUserItem {
  id: number;
  unitNumber: string | null;
  displayName: string | null;
}

// --- Training types ---

export type ContentType = 'VIDEO' | 'DOCUMENT' | 'LINK';

export interface TrainingCompletion {
  id: string;
  resourceId: string;
  userId: string;
  completedAt: string;
}

export interface TrainingResource {
  id: string;
  title: string;
  description: string;
  contentType: ContentType;
  contentUrl: string | null;
  uploadId: string | null;
  requiredForRoles: string[];
  dueDate: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { completions: number };
  completions?: TrainingCompletion[];
}

// --- Visitor types ---

export type VisitorStatus = 'EXPECTED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';

export type VisitorAction = 'CHECK_IN' | 'CHECK_OUT';

export interface VisitorLog {
  id: string;
  visitorId: string;
  action: VisitorAction;
  performedBy: string;
  timestamp: string;
  notes: string | null;
}

export interface Visitor {
  id: string;
  hostId: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  purpose: string | null;
  expectedDate: string;
  accessCode: string;
  status: VisitorStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  logs: VisitorLog[];
  host?: {
    id: string;
    displayName: string | null;
    unitNumber: string | null;
  };
}

// --- Survey types ---

export type SurveyStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';
export type QuestionType = 'TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'RATING' | 'YES_NO';

export interface SurveyQuestion {
  id: number;
  surveyId: number;
  text: string;
  questionType: QuestionType;
  options: string[];
  required: boolean;
  sortOrder: number;
}

export interface Survey {
  id: number;
  title: string;
  description: string | null;
  status: SurveyStatus;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
  questions: SurveyQuestion[];
  _count?: { responses: number; questions: number };
  hasResponded?: boolean;
}

// --- Survey results types ---

export interface SurveyQuestionResponse {
  value: string;
}

export interface SurveyResultQuestion {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  responses: SurveyQuestionResponse[];
}

export interface SurveyResultsData {
  survey: Survey;
  totalResponses: number;
  questions: SurveyResultQuestion[];
}

// --- Marketplace types ---

export type ListingCategory = 'FOR_SALE' | 'WANTED' | 'FREE' | 'SERVICES';
export type ContactMethod = 'MESSAGE' | 'EMAIL' | 'PHONE';
export type ListingStatus = 'ACTIVE' | 'SOLD' | 'EXPIRED' | 'REMOVED';

export interface ListingImage {
  id: string;
  listingId: string;
  url: string;
  sortOrder: number;
}

export interface MarketplaceListing {
  id: string;
  sellerId?: string;
  authorId?: string;
  authorName?: string;
  title: string;
  description: string;
  price: number | string | null;
  category: ListingCategory | string;
  condition?: string | null;
  contactMethod?: ContactMethod;
  contactInfo?: string;
  status?: ListingStatus;
  active?: boolean;
  createdAt: string;
  updatedAt: string;
  images?: ListingImage[];
}

export interface MarketplaceListResponse {
  listings: MarketplaceListing[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

// --- Booking types ---

export type BookingStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'WAITLISTED';

export interface BookingAmenity {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  capacity: number | null;
  requiresApproval: boolean;
  pricePerHour: string | null;
  currency: string;
  availableFrom: string;
  availableTo: string;
  daysAvailable: number[];
  minAdvanceHours: number;
  maxAdvanceHours: number;
  maxDurationHours: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Booking {
  id: string;
  amenityId: string;
  amenity: BookingAmenity;
  userId: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  notes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Forum types ---

export interface ForumCategory {
  id: number;
  name: string;
  description: string | null;
  _count?: { threads: number };
}

export interface ForumThread {
  id: number;
  title: string;
  categoryId: number;
  authorId: string;
  authorName: string;
  pinned: boolean;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { replies: number };
  lastReplyAt: string | null;
}

export interface ForumReply {
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ForumThreadWithReplies extends ForumThread {
  body: string;
  category?: ForumCategory;
  replies: ForumReply[];
}

// --- Consent management types ---

export type ConsentFormStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface ConsentFormItem {
  id: string;
  title: string;
  body: string;
  status: ConsentFormStatus;
  requiredRoles: string[];
  createdAt: string;
  updatedAt: string;
  _count?: {
    signatures: number;
  };
  totalRequired?: number;
  completionRate?: number;
}

export interface ConsentSignature {
  id: string;
  consentFormId: string;
  userId: string;
  userName: string;
  signedAt: string;
}

// ---------------------------------------------------------------------------
// Security & Concierge shifts (spec §4.16)
// ---------------------------------------------------------------------------

export type ShiftStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ShiftType = 'SECURITY' | 'CONCIERGE';
export type KeyAction = 'CHECK_OUT' | 'RETURN';

export interface Shift {
  id: string;
  assigneeId: string;
  assignee?: { id: string; unitNumber: string | null; role: string; userId: number };
  shiftType: ShiftType;
  status: ShiftStatus;
  startTime: string;
  endTime: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  keyLogs?: KeyLog[];
}

export interface KeyLog {
  id: string;
  shiftId: string | null;
  keyName: string;
  action: KeyAction;
  performedBy: string;
  performer?: { id: string; unitNumber: string | null; role: string };
  notes: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Forum thread follow (spec §4.19 REQ-4.19-3)
// ---------------------------------------------------------------------------

export interface ThreadFollowState {
  following: boolean;
}

// ---------------------------------------------------------------------------
// Marketplace listing favorite (spec §4.17 REQ-4.17-2)
// ---------------------------------------------------------------------------

export interface FavoritedListing extends MarketplaceListing {
  favoritedAt: string;
}
