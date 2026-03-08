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
- [ ] Add Groq LLM support as alternative backend
- [ ] Add toggle in chat UI (keyword engine vs Groq)
- [ ] Run and fix tests
- [ ] Commit and push to main
- [ ] Wait for auto-deploy to staging
- [ ] Test staging (curl / headless browser)
- [ ] Fix and redeploy until working
- [ ] Write E2E tests for chat interactions

## Phase 2: Platform Product Spec Compliance
- [ ] Review open beads (bd list)
- [ ] Review /data/docs/cc-product-spec.md vs current /platform implementation
- [ ] Gap analysis: which REQ-* items are missing or incomplete
- [ ] Fix/implement missing platform features
- [ ] Ensure all 4.x sections are covered

## Key files created/modified:
- renzo-ai/src/server.ts — HTTP server on port 3001
- renzo-ai/src/chat-engine.ts — keyword-based intent router
- renzo-ai/src/tools/index.ts — tool registry (from condo-control MCP)
- renzo-ai/src/tools/{client,auth,parsers,types,logger}.ts — CC API wrappers
- Dockerfile.staging — Docker image for staging
- scripts/start-staging.sh — starts both servers
- render.yaml — staging changed to runtime: docker
- server/routes/chat.ts — admin-only chat proxy
- src/pages/ChatPage.tsx — chat UI
- src/main.tsx — added /chat route

## Env vars needed on staging:
- CC_EMAIL — Condo Control login email
- CC_PASSWORD — Condo Control login password
- GROQ_API_KEY — Groq API key (optional, for LLM mode)

## CRITICAL: DO NOT TOUCH PROD
- No changes to deploy/prod branch
- No connections to prod database
- render.yaml prod section unchanged
