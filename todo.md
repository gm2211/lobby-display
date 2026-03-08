# Current Work — Chat AI + Platform Spec

## Phase 1: Chat AI (staging only)
- [x] Create renzo-ai server with condo-control MCP tools
- [x] Create chat engine (keyword-based intent → tool calls → formatted response)
- [x] Create HTTP server for renzo-ai (port 3001)
- [x] Create Dockerfile.staging (runs both servers)
- [x] Create scripts/start-staging.sh
- [x] Update render.yaml (staging: runtime docker)
- [x] Create server/routes/chat.ts (admin-only proxy)
- [x] Mount chat route in server/app.ts
- [x] Create src/pages/ChatPage.tsx
- [x] Add /chat route to src/main.tsx
- [x] Convert renzo-ai from submodule to regular directory
- [x] Add Groq LLM support as alternative backend
- [x] Add toggle in chat UI (keyword engine vs Groq)
- [x] Commit and push to main
- [ ] Wait for auto-deploy to staging (Render Docker build may need manual runtime config)
- [ ] Test staging (curl / headless browser)
- [ ] Fix and redeploy until working
- [ ] Write E2E tests for chat interactions

## Phase 2: Platform Product Spec Compliance
- [x] Review /data/docs/cc-product-spec.md vs current /platform implementation
- [x] Gap analysis: which REQ-* items are missing or incomplete
- [x] Fix/implement P1 platform features:
  - [x] Visitor (4.7): accessWindowStart/End, vehiclePlate, parkingSpot fields
  - [x] Surveys (4.10): time window filtering, respond validation
  - [x] Training (4.11): requiredForRoles filtering
  - [x] Documents (4.9): GET /:id/download endpoint
  - [x] Announcements (4.4): fix UUID IDs, filter expired/deleted, auth guards
- [x] Fix tests for updated routes (visitor, survey, training, announcements, CSRF)
- [ ] Remaining P1 gaps:
  - [ ] Security/Concierge (4.16): Shift model + queue endpoints
  - [ ] Payments (4.14): Real payment processor integration (deferred)
- [ ] Remaining P2 gaps (lower priority):
  - [ ] Forum thread follows (4.19)
  - [ ] Marketplace favorites (4.17)
  - [ ] AI context injection (4.15)
  - [ ] Survey quorum metrics (4.10)
  - [ ] Visitor overnight/permit limits (4.7)
  - [ ] Document permissions (4.9)

## Phase 1 Key files:
- renzo-ai/src/server.ts — HTTP server on port 3001
- renzo-ai/src/chat-engine.ts — keyword-based intent router
- renzo-ai/src/groq-engine.ts — Groq LLM engine
- renzo-ai/src/tools/index.ts — tool registry (from condo-control MCP)
- Dockerfile.staging — Docker image for staging
- scripts/start-staging.sh — starts both servers
- server/routes/chat.ts — admin-only chat proxy
- src/pages/ChatPage.tsx — chat UI with mode toggle

## Phase 2 Key files modified:
- prisma/schema.prisma — Visitor model: added access window + parking fields
- server/routes/platform/visitors.ts — accept new fields in POST/PUT
- server/routes/platform/surveys.ts — platformProtectStrict, time window filtering
- server/routes/platform/training.ts — platformProtectStrict, requiredForRoles filtering
- server/routes/platform/documents.ts — GET /:id/download endpoint
- server/routes/platform/announcements.ts — UUID IDs, auth guards, expiry filtering

## Env vars needed on staging:
- CC_EMAIL — Condo Control login email
- CC_PASSWORD — Condo Control login password
- GROQ_API_KEY — Groq API key (optional, for LLM mode)

## CRITICAL: DO NOT TOUCH PROD
- No changes to deploy/prod branch
- No connections to prod database
- render.yaml prod section unchanged

## Staging Deployment Note
Render staging was previously runtime: node. Changed to runtime: docker in render.yaml.
This may require manual reconfiguration on the Render dashboard since changing runtime
type for an existing service might not be picked up from render.yaml automatically.
The deploy/staging branch has been advanced by GitHub Actions.
