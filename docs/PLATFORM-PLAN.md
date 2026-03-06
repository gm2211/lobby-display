# Platform Resident Portal — Implementation Plan

## Overview

Building a resident portal under `/platform` routes in the existing renzo app. Reference: reverse-engineered third-party platform research artifacts (61 screenshots, 1474-line markdown). This is NOT a pixel-perfect clone — styling aligns with Renzo's own aesthetic.

**Total: 6 epics, 116 tasks, 122 beads tickets.**

---

## Epic Structure & Dependencies

```
[Epic 0] Platform Foundation (P0) — h77--6fl — 22 tasks
   ↓ blocks all other epics
[Epic 1] Core Communication (P1) — h77--3iq — 18 tasks
[Epic 2] Service & Facilities (P2) — h77--nf7 — 16 tasks
[Epic 3] Amenity Booking & Events (P2) — h77--m8q — 25 tasks
   ↓ blocks Epic 4
[Epic 4] Payments & Compliance (P3) — h77--7mg — 15 tasks

[Epic 5] Advanced Features (P4) — h77--vk1 — 20 tasks
   ↑ blocked by Epics 0,1,2,3
```

Epics 1, 2, 3 can run in parallel after Epic 0 completes.
Epic 4 requires Epic 3 (payments reference bookings).
Epic 5 requires all prior epics (global search indexes all entities).

---

## Technical Architecture

### Database: Prisma Multi-Schema
- `previewFeatures = ["multiSchema"]`, `schemas = ["public", "platform"]`
- Existing models: `@@schema("public")`
- New platform models: `@@schema("platform")` with UUID PKs
- Cross-schema FK: raw SQL migration (Prisma can't do cross-schema FKs)

### Backend
- Platform router: `server/routes/platform/index.ts` mounted at `/api/platform`
- Auth: `server/middleware/platformAuth.ts` (platformProtect + requirePlatformRole)
- CRUD factory: `server/utils/createPlatformCrudRoutes.ts` (UUID, cursor pagination, role auth)
- Storage: `server/utils/storage.ts` (IStorageProvider: local dev / S3 prod)
- SSE: extend `server/sse.ts` with named channels

### Frontend
- Shell: `src/platform/PlatformLayout.tsx` (sidebar + content area)
- Router: `src/platform/PlatformRouter.tsx`
- Route: `/platform/*` in `src/main.tsx`

### Key Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Calendar | Custom CSS Grid | Lighter than FullCalendar, fits Renzo styling |
| Rich text | Tiptap (headless ProseMirror) | Customizable, headless |
| Real-time | Extend existing SSE with channels | Consistent with server/sse.ts |
| File storage | IStorageProvider (local/S3) | Swap via env var |
| Search | PostgreSQL tsvector/tsquery + GIN | No external deps |
| State mgmt | React Query (TanStack Query) | Already in project |

---

## Epic 0: Platform Foundation (22 tasks)

**Critical path:** thw → 46h → yzk → 30e (schema → models → auth → router)
**Parallel path:** thw → 4j9 (settings/upload models)
**Frontend path:** yzk → 5dw → {9dr, tws, lv9, bt5, jf3}
**Standalone:** 61y (storage), 7hg (SSE), 6kd (seed), 9u0 (scripts), gbz (docs)

| # | ID | Title | Blocked By |
|---|-----|-------|------------|
| 1 | h77--thw | Prisma multi-schema setup | — |
| 2 | h77--46h | PlatformUser model + PlatformRole enum | thw |
| 3 | h77--4j9 | PlatformSetting + Upload models | thw |
| 4 | h77--mtu | Cross-schema FK migration | 46h |
| 5 | h77--yzk | Platform auth middleware | 46h |
| 6 | h77--30e | Platform router skeleton | yzk |
| 7 | h77--j44 | Enhanced CRUD factory | 30e |
| 8 | h77--61y | Storage abstraction (IStorageProvider) | — |
| 9 | h77--5dw | [ui] Frontend platform shell + layout | yzk |
| 10 | h77--9dr | [ui] Platform theme + design tokens | 5dw |
| 11 | h77--tws | [ui] Platform dashboard landing page | 5dw |
| 12 | h77--lv9 | [ui] Account management page | 5dw |
| 13 | h77--9u0 | Reference screenshot setup script | — |
| 14 | h77--6kd | Platform seed data script | — |
| 15 | h77--7hg | SSE channel extension | — |
| 16 | h77--t9y | File upload endpoint | 30e, 61y |
| 17 | h77--pet | Platform navigation data endpoint | 30e |
| 18 | h77--bt5 | [ui] Error boundary + loading states | 5dw |
| 19 | h77--vti | CSRF integration for platform routes | 30e |
| 20 | h77--d8u | Platform API test setup | yzk, 30e |
| 21 | h77--jf3 | E2E test scaffold for platform | 5dw |
| 22 | h77--gbz | Docs update (DEVELOPMENT.md, README, CLAUDE.md) | — |

---

## Epic 1: Core Communication (18 tasks)

### Announcements
| # | ID | Title | Blocked By |
|---|-----|-------|------------|
| 1 | h77--4a6 | Announcement model + migration | — |
| 2 | h77--jnc | AnnouncementRead model + migration | 4a6 |
| 3 | h77--gf0 | Announcement CRUD API routes | 4a6 |
| 4 | h77--4wx | [ui] Announcements list + detail page | gf0 |
| 5 | h77--5xa | [ui] Announcement create/edit form | gf0 |
| 17 | h77--4ha | Announcement push notification (SSE) | gf0 |

### Maintenance Requests
| # | ID | Title | Blocked By |
|---|-----|-------|------------|
| 6 | h77--338 | MaintenanceRequest model + migration | — |
| 7 | h77--d99 | MaintenanceComment + MaintenancePhoto models | 338 |
| 8 | h77--8a9 | Maintenance request CRUD API routes | 338, d99 |
| 9 | h77--819 | [ui] Maintenance request list page | 8a9 |
| 10 | h77--nvk | [ui] Maintenance request detail + comments | 8a9 |
| 11 | h77--juo | [ui] Submit maintenance request form | 8a9 |

### Parcels
| # | ID | Title | Blocked By |
|---|-----|-------|------------|
| 12 | h77--n6m | Parcel model + migration | — |
| 13 | h77--z9l | Parcel CRUD API routes | n6m |
| 14 | h77--o8y | [ui] Parcels list page | z9l |
| 15 | h77--bc6 | [ui] Log parcel form (concierge) | z9l |
| 16 | h77--8gx | [ui] Parcel pickup confirmation | z9l |

### Tests
| 18 | h77--21k | Epic 1 integration tests | gf0, 8a9, z9l |

---

## Epic 2: Service & Facilities (16 tasks)

### Directory
| # | ID | Title | Blocked By |
|---|-----|-------|------------|
| 1 | h77--2p3 | DirectoryEntry model + migration | — |
| 2 | h77--87o | Directory CRUD API routes | 2p3 |
| 3 | h77--34p | [ui] Resident directory page | 87o |

### Documents
| 4 | h77--4dl | Document + DocumentVersion + DocumentCategory models | — |
| 5 | h77--hl0 | Documents CRUD API routes | 4dl |
| 6 | h77--62a | [ui] Documents library page | hl0 |
| 15 | h77--f5a | [ui] Document upload + version management | hl0 |

### Surveys
| 7 | h77--z5m | Survey + SurveyQuestion + SurveyResponse models | — |
| 8 | h77--ckg | Survey CRUD API routes | z5m |
| 9 | h77--ilo | [ui] Survey list + respond page | ckg |
| 10 | h77--5uw | [ui] Survey results dashboard | ckg |
| 14 | h77--7kk | [ui] Survey create/edit form (MANAGER+) | ckg |

### Training
| 11 | h77--p8c | TrainingResource + TrainingCompletion models | — |
| 12 | h77--be3 | Training CRUD API routes | p8c |
| 13 | h77--4v7 | [ui] Training library page | be3 |

### Tests
| 16 | h77--85u | Epic 2 integration tests | 87o, hl0, ckg, be3 |

---

## Epic 3: Amenity Booking & Events (25 tasks)

### Amenities & Bookings
| # | ID | Title | Blocked By |
|---|-----|-------|------------|
| 1 | h77--6iy | Amenity + AmenityRule + AmenityImage models | — |
| 2 | h77--7gn | Booking + BookingPayment models | 6iy |
| 3 | h77--2ei | Amenity CRUD API routes | 6iy |
| 10 | h77--yz0 | Booking rules engine | 6iy |
| 4 | h77--3fp | Booking CRUD API routes | 7gn, yz0 |
| 5 | h77--rpz | [ui] Amenity listing page | 2ei |
| 6 | h77--i42 | [ui] Amenity detail + calendar view | 2ei |
| 7 | h77--7nq | [ui] Booking flow | 3fp |
| 8 | h77--8pf | [ui] My bookings page | 3fp |
| 9 | h77--22w | [ui] Amenity management (MANAGER+) | 2ei |

### Events
| 11 | h77--gsv | Event + EventRSVP models | — |
| 12 | h77--eyj | Event CRUD API routes | gsv |
| 13 | h77--tb1 | [ui] Events calendar + list page | eyj |
| 14 | h77--5jg | [ui] Event detail + RSVP | eyj |
| 15 | h77--52t | [ui] Event create/edit form (MANAGER+) | eyj |

### Visitors
| 16 | h77--st8 | Visitor + VisitorLog models | — |
| 17 | h77--lnr | Visitor CRUD API routes | st8 |
| 18 | h77--nae | [ui] Visitor pre-registration page | lnr |
| 19 | h77--eey | [ui] Visitor check-in (guard desk) | lnr |

### Shared & Advanced
| 20 | h77--09y | Custom calendar component (CSS Grid) | — |
| 21 | h77--ol5 | Booking approval notifications (SSE) | 3fp |
| 22 | h77--9yg | Recurring event expansion service | eyj |
| 23 | h77--8n1 | Waitlist system for bookings | 3fp |
| 24 | h77--ktb | Access code generation + QR | lnr |
| 25 | h77--751 | Epic 3 integration tests | 2ei, 3fp, eyj, lnr |

**Needs further scoping:** Rules engine (h77--yz0), recurring events (h77--9yg), waitlist (h77--8n1)

---

## Epic 4: Payments & Compliance (15 tasks)

### Payments
| # | ID | Title | Blocked By |
|---|-----|-------|------------|
| 1 | h77--dxh | Payment + PaymentItem models | — |
| 2 | h77--3ag | Payment API routes | dxh |
| 3 | h77--kes | [ui] Payment history page | 3ag |
| 4 | h77--893 | [ui] Payment management (MANAGER+) | 3ag |

### Violations
| 5 | h77--55o | Violation + ViolationComment models | — |
| 6 | h77--dex | Violation API routes | 55o |
| 7 | h77--3pf | [ui] Violations list page | dex |
| 8 | h77--xip | [ui] Violation detail + appeal | dex |
| 9 | h77--4ze | [ui] Report violation form (MANAGER+) | dex |

### E-Consent
| 10 | h77--78u | ConsentForm + ConsentSignature models | — |
| 11 | h77--gsu | E-consent API routes | 78u |
| 12 | h77--10k | [ui] E-consent signing page | gsu |
| 13 | h77--dms | [ui] E-consent management (MANAGER+) | gsu |

### Cross-cutting
| 14 | h77--puf | Payment-violation linking | 3ag, dex |
| 15 | h77--z95 | Epic 4 integration tests | 3ag, dex, gsu |

**Needs further scoping:** Stripe integration details (h77--3ag), payment-violation auto-linking (h77--puf)

---

## Epic 5: Advanced Features (20 tasks)

### AI Assistant
| # | ID | Title | Blocked By |
|---|-----|-------|------------|
| 1 | h77--1l0 | ChatSession + ChatMessage models | — |
| 2 | h77--brw | AI assistant API routes | 1l0 |
| 3 | h77--5dh | [ui] AI assistant chat interface | brw |
| 4 | h77--daq | AI context retrieval service | brw |

### Marketplace
| 5 | h77--c5a | MarketplaceListing + ListingImage models | — |
| 6 | h77--ks3 | Marketplace API routes | c5a |
| 7 | h77--eew | [ui] Marketplace browse + search | ks3 |
| 8 | h77--e81 | [ui] Marketplace listing detail + contact | ks3 |
| 9 | h77--yft | [ui] Create/edit marketplace listing | ks3 |

### Discussion Forum
| 10 | h77--81r | ForumCategory + ForumThread + ForumPost models | — |
| 11 | h77--8yi | Forum API routes | 81r |
| 12 | h77--eid | [ui] Forum category + thread list | 8yi |
| 13 | h77--ygv | [ui] Forum thread detail + reply | 8yi |
| 14 | h77--rd6 | [ui] Create forum thread | 8yi |
| 18 | h77--hoo | Forum upvote system | 8yi |

### Global Search
| 15 | h77--amd | SearchIndex model + indexing service | — |
| 16 | h77--0sl | Global search API route | amd |
| 17 | h77--bay | [ui] Global search page + results | 0sl |

### Other
| 19 | h77--7et | Internal messaging system | — |
| 20 | h77--3da | Epic 5 integration tests | brw, ks3, 8yi, 0sl |

**Needs significant scoping:** AI context retrieval strategy (h77--daq — RAG vs keyword vs hybrid), forum moderation rules, internal messaging scope

---

## Items Needing Further Scoping

These tickets are created but intentionally underspecified — they need architectural decisions before implementation:

1. **h77--yz0 — Booking rules engine** (Epic 3): How complex should the rules engine be? Simple if/else vs. declarative rule evaluator. Edge cases around overlapping bookings, timezone handling.

2. **h77--9yg — Recurring event expansion** (Epic 3): iCal RRULE parsing complexity. Need to decide: expand at query time vs. pre-generate occurrences. Exception handling for modified/cancelled individual occurrences.

3. **h77--8n1 — Waitlist system** (Epic 3): Priority rules (FIFO vs. role-based), auto-promotion mechanics, notification timing.

4. **h77--3ag — Payment API routes** (Epic 4): Stripe integration depth — just data model + manual recording? Or Stripe Checkout integration? Webhook handling scope.

5. **h77--puf — Payment-violation linking** (Epic 4): Auto-create payment on fine? Or manual linking? What happens when a fine is appealed — auto-refund?

6. **h77--daq — AI context retrieval** (Epic 5): RAG with vector embeddings vs. simple keyword search vs. structured query. Which LLM provider? Context window management.

7. **h77--7et — Internal messaging** (Epic 5): Scope could range from simple "contact seller" emails to full in-app real-time messaging. Need to decide scope.

8. **h77--5uw — Survey results dashboard** (Epic 2): Chart library selection (lightweight charts vs. full charting library like Recharts).

---

## Implementation Order (Recommended)

### Phase 1: Foundation (Epic 0)
Start 5 agents in parallel on the critical + standalone paths:
1. **Agent 1:** h77--thw → h77--46h → h77--mtu (schema chain)
2. **Agent 2:** h77--4j9 (after thw) → h77--yzk → h77--30e (auth + router chain)
3. **Agent 3:** h77--61y, h77--7hg (standalone: storage + SSE)
4. **Agent 4:** h77--5dw → h77--9dr (after yzk: frontend shell + theme)
5. **Agent 5:** h77--9u0, h77--gbz, h77--6kd (standalone: scripts + docs + seed)

Then remaining Epic 0 tasks as agents free up.

### Phase 2: Core Features (Epics 1, 2, 3 in parallel)
After Epic 0 merges to epic branch, split agents across:
- 2 agents on Epic 1 (announcements, maintenance, parcels)
- 1 agent on Epic 2 (directory, docs, surveys, training)
- 2 agents on Epic 3 (amenities, bookings, events, visitors)

### Phase 3: Compliance (Epic 4)
After Epic 3 merges:
- 2 agents on payments, violations, e-consent

### Phase 4: Advanced (Epic 5)
After Epics 1-3 merge:
- Search indexing first (indexes all entities)
- Then AI, marketplace, forum in parallel

---

## Verification

Per-epic quality gates:
```bash
npx tsc --noEmit
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/renzo" npm run build
npx vitest run
```

UI tasks require visual verification (screenshot via Playwright per CLAUDE.md).
