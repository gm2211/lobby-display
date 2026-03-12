# VIEWER Role + Dashboard Auth

**Date:** 2026-02-20
**Issue:** 77-7mp
**Status:** Approved

## Problem

The dashboard is publicly accessible. Only screens within the building should display information. We need authentication on the dashboard without creating a separate auth flow.

## Approach

Piggyback on the existing user/role system. Add a `VIEWER` role, protect dashboard endpoints, and add role-based redirects on login.

## Schema Changes

- Add `VIEWER` to Prisma `Role` enum (lowest level)
- Update `ROLE_LEVEL`: `{ VIEWER: 0, EDITOR: 1, ADMIN: 2 }`
- Update `AuthUser.role` type to include `'VIEWER'`
- Prisma migration for new enum value

## Backend

- New `requireViewer` middleware: any authenticated user passes (VIEWER, EDITOR, ADMIN)
- Protect dashboard GET endpoints: `/api/services`, `/api/events`, `/api/advisories`, `/api/config`, `/api/snapshots/latest`, `/api/events-stream`
- Existing `writeProtect` middleware unchanged (POST/PUT/DELETE still require EDITOR+)
- VIEWER users blocked from admin-only endpoints (user management, snapshots list)

### Viewer session keep-alive
- VIEWER sessions get indefinite expiry (no `maxAge`, session-only cookie persists via rolling refresh)
- On each request from a VIEWER, reset `maxAge` to a long duration (e.g. 1 year) so the session effectively never expires
- Admin can force-rotate by changing the viewer password (invalidating the session on next heartbeat 401)
- EDITOR/ADMIN sessions keep the existing 7-day expiry

## Frontend

### Dashboard auth gate
- Dashboard route wrapped with auth check (redirect to `/login` if unauthenticated)
- `AuthProvider` wraps dashboard route (currently only wraps `/admin`)

### Login redirects
- VIEWER -> `/` (dashboard)
- EDITOR/ADMIN -> `/admin`

### Admin indicator on dashboard
- When logged in as ADMIN: orange border around viewport + "LOGGED IN AS ADMIN" badge
- Prevents accidentally leaving screens logged in as admin

### Viewer at /admin
- VIEWER attempting `/admin` is redirected to `/`
- Option to logout and re-login as admin

### ProtectedRoute
- Parameterize with `minRole` prop (default: `EDITOR` for backward compat)
- Dashboard uses `minRole="VIEWER"`, admin uses `minRole="EDITOR"`

## Non-goals

- Separate viewer login page
- Shared PIN/password (use normal user accounts)
- IP allowlisting
