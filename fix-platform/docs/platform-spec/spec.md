# Platform Product Specification (Operational)

**Version:** 2.0  
**Date:** 2026-02-27  
**Status:** Canonical implementation spec for this repository

## 1. Purpose

This document defines the resident platform scope in a delivery-friendly format:

1. clear capability boundaries
2. normalized requirement IDs
3. practical acceptance criteria
4. direct mapping to automated evals

This is intentionally de-identified and avoids third-party product names and external endpoint path details.

## 2. Roles

| Role | Core permissions |
|---|---|
| Resident | Read community content, create resident-owned records (bookings, requests, responses), manage own profile/preferences |
| Staff | Operate building workflows (parcels, visitors, shifts, incidents), update operational records |
| Manager | Full content and operational management, approvals, moderation, compliance actions |
| Admin | User/role administration plus all manager permissions |

## 3. Capability Groups

| Group | Sections | Outcome |
|---|---|---|
| Communication | 4.1, 4.3, 4.4, 4.19 | Residents receive timely information and can engage in discussion |
| Operations | 4.2, 4.5, 4.6, 4.7, 4.8 | Day-to-day building workflows are self-serve and trackable |
| Content & Knowledge | 4.9, 4.11, 4.15 | Policy and knowledge are discoverable and consumable |
| Governance | 4.10, 4.18 | Voting and compliance are auditable |
| Identity & Account | 4.13 | Users manage profile, preferences, and consent |
| Commerce | 4.14, 4.17 | Payment and listing workflows are supported |
| Security Operations | 4.16 | Shift and queue operations run reliably in real time |
| Discovery | 4.12 | Users can search across domains |

## 4. Requirement Model

- ID format: `REQ-<section>-<n>`
- Priority:
  - `P0` critical path
  - `P1` core function
  - `P2` completeness/quality
- Evidence:
  - `Observed`
  - `Partial`
  - `Inferred`

## 5. Feature Sections (4.x)

### 4.1 Dashboard / Home

- `REQ-4.1-1` (P1, Observed): Authenticated users can open the dashboard landing surface.
- `REQ-4.1-2` (P1, Observed): Dashboard shows summary widgets for core domains (announcements, bookings, maintenance, events).
- `REQ-4.1-3` (P2, Observed): Session refresh and consent checks do not block initial render.

### 4.2 Amenity Booking

- `REQ-4.2-1` (P0, Observed): Users can browse available amenities.
- `REQ-4.2-2` (P0, Observed): Users can open amenity detail and see booking inputs/rules.
- `REQ-4.2-3` (P0, Observed): Booking submission validates availability and policy constraints.
- `REQ-4.2-4` (P1, Observed): Calendar/list views show reservation coverage for selected dates.
- `REQ-4.2-5` (P1, Observed): Booking queries support filter and cursor-style pagination.

### 4.3 Events

- `REQ-4.3-1` (P1, Observed): Event feed is retrievable for authenticated users.
- `REQ-4.3-2` (P1, Partial): Event filtering by status/time context is supported.
- `REQ-4.3-3` (P2, Partial): RSVP/attendance state is represented and persistable.

### 4.4 Announcements

- `REQ-4.4-1` (P1, Partial): Announcement records support authoring and publish lifecycle.
- `REQ-4.4-2` (P1, Partial): Audience targeting constraints are representable.
- `REQ-4.4-3` (P2, Partial): Pin/schedule/expire behaviors are modelled and surfaced.

### 4.5 Maintenance / Service Requests

- `REQ-4.5-1` (P1, Partial): Requests can be listed, searched, and reopened from history.
- `REQ-4.5-2` (P1, Partial): Status lifecycle and assignee metadata are persistable.
- `REQ-4.5-3` (P2, Inferred): Attachments and follow state are available to users.

### 4.6 Parcels / Packages

- `REQ-4.6-1` (P1, Inferred): Parcel records include recipient, carrier/tracking, and current status.
- `REQ-4.6-2` (P1, Inferred): Parcel workflow supports log -> notify -> release progression.
- `REQ-4.6-3` (P2, Inferred): Release metadata and resident notifications are retained.

### 4.7 Visitor Management

- `REQ-4.7-1` (P1, Inferred): Visitor records store host and arrival metadata.
- `REQ-4.7-2` (P1, Inferred): Access windows and parking permissions are representable.
- `REQ-4.7-3` (P2, Inferred): Overnight/permit limits are enforceable by policy.

### 4.8 Directory

- `REQ-4.8-1` (P1, Partial): Resident/staff directory discovery is supported.
- `REQ-4.8-2` (P2, Partial): Contact detail retrieval supports common resident workflows.

### 4.9 Documents / File Library

- `REQ-4.9-1` (P1, Partial): Documents can be listed by folder/category.
- `REQ-4.9-2` (P1, Partial): Authorized document preview/download works for permitted users.
- `REQ-4.9-3` (P2, Inferred): Permission-aware folder/file actions are representable.

### 4.10 Surveys

- `REQ-4.10-1` (P1, Partial): Surveys can be listed and opened by eligible users.
- `REQ-4.10-2` (P2, Inferred): Participation and quorum-like progress are trackable.

### 4.11 Training

- `REQ-4.11-1` (P1, Partial): Training module overview is accessible to assigned users.
- `REQ-4.11-2` (P2, Inferred): Progress/completion status is represented.

### 4.12 Global Search

- `REQ-4.12-1` (P1, Observed): Search accepts free-text queries.
- `REQ-4.12-2` (P1, Observed): Search covers multiple domains and returns grouped results.

### 4.13 Account Management

- `REQ-4.13-1` (P1, Observed): Users can open and update account/profile settings.
- `REQ-4.13-2` (P1, Observed): Notification preference and credential-change flows are discoverable.
- `REQ-4.13-3` (P2, Observed): Consent/session checks are callable from account context.

### 4.14 Payments

- `REQ-4.14-1` (P1, Partial): Charge processing flow is available for eligible items.
- `REQ-4.14-2` (P2, Partial): Overdue acknowledgement and retry patterns are supported.

### 4.15 Community AI Assistant

- `REQ-4.15-1` (P1, Inferred): Assistant entrypoint is available in authenticated navigation.
- `REQ-4.15-2` (P1, Inferred): Query/response lifecycle supports threaded interaction.
- `REQ-4.15-3` (P2, Inferred): No-answer/error/disclaimer states are surfaced clearly.

### 4.16 Security & Concierge

- `REQ-4.16-1` (P1, Partial): Shift and key-management workflows are representable.
- `REQ-4.16-2` (P1, Partial): Real-time queue/ops updates are supported.
- `REQ-4.16-3` (P2, Partial): Shift constraints (duration/overlap) are enforced.

### 4.17 Marketplace

- `REQ-4.17-1` (P1, Inferred): Listings include media, description, and pricing attributes.
- `REQ-4.17-2` (P2, Inferred): Follow/interest signals are representable.

### 4.18 Violations

- `REQ-4.18-1` (P1, Inferred): Violation records are unit-scoped and auditable.
- `REQ-4.18-2` (P1, Inferred): Lifecycle supports issuance, escalation, and closure.

### 4.19 Discussion Forum

- `REQ-4.19-1` (P1, Inferred): Topic/thread surfaces support community discussion.
- `REQ-4.19-2` (P1, Inferred): Pinning and threading behavior is supported.
- `REQ-4.19-3` (P2, Inferred): Topic follow state is representable.

## 6. Eval Mapping (Spec -> Automated Checks)

Automated checks are implemented in the platform spec-eval suite and must map to section IDs in test titles.

Covered now:
- 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14, 4.15, 4.16, 4.17, 4.18, 4.19

Not yet covered:
- (all sections now have eval coverage)

Pass/fail scorecards:
- generated by spec-eval scripts
- reported per section plus framework/setup errors

## 7. Spec Maintenance Rules

When this spec changes:

1. Update affected requirement IDs in this file.
2. Update matching eval cases in the spec-eval suite.
3. Re-run spec-eval and review section-level score changes.
4. Do not merge section changes without either:
   - updated eval coverage, or
   - a linked issue documenting deferred coverage.

## 8. De-Identification Constraints

To keep this spec safe to share and maintain:

1. Do not include third-party product names.
2. Do not include exact third-party endpoint paths.
3. Keep requirements expressed as capability contracts and user outcomes.
