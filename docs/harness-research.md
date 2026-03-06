# Autonomous Test & Feedback Harness — Research Brief

> **Date:** 2026-02-25
> **Purpose:** Deep research synthesis to inform the design of a test and feedback harness enabling Claude Code to make independent progress in a safe environment.
> **Methodology:** ~328 web searches across 5 parallel research agents, covering academic papers (2024-2026), industry blogs, open-source tools, and production case studies.

---

## Table of Contents

1. [The Core Insight](#1-the-core-insight)
2. [Architecture: The Three Loops](#2-architecture-the-three-loops)
3. [Red/Blue Team TDD](#3-redblue-team-tdd--the-dual-agent-pattern)
4. [Visual Feedback Loop](#4-visual-feedback-loop--screenshots-as-source-of-truth)
5. [Sandboxed Execution](#5-sandboxed-execution--making-it-safe)
6. [Eval-Driven Development](#6-eval-driven-development--the-outer-loop)
7. [Self-Improvement Mechanisms](#7-self-improvement-mechanisms)
8. [Benchmark Harness Architectures](#8-benchmark-harness-architectures)
9. [Agent Memory & Observability](#9-agent-memory--observability)
10. [Multi-Agent Coordination](#10-multi-agent-coordination)
11. [Proposed Architecture for Renzo](#11-proposed-architecture-for-renzo)
12. [Key Sources](#12-key-sources-top-50)

---

## 1. The Core Insight

> **"The harness is the architecture, not the model."**
> — Converged consensus from Anthropic, OpenAI, Martin Fowler, Philipp Schmid, and LangChain

The harness is the infrastructure that wraps around an AI agent to manage long-running tasks — governing tool access, safety boundaries, feedback loops, state persistence, and verification.

**Evidence:** LangChain improved from Top 30 to Top 5 on Terminal-Bench 2.0 (52.8% → 66.5%) purely through harness engineering, without changing the underlying model. Warp achieves 71% on SWE-bench Verified with a single-agent architecture. mini-swe-agent achieves >74% on SWE-bench Verified in 100 lines of Python with nothing but bash.

### Three-Layer Stack (Industry Standard)

| Layer | Purpose | Examples |
|-------|---------|---------|
| **Agent Framework** | Defines agent logic — prompts, tools, LLM | LangChain, smolagents |
| **Agent Runtime** | Handles state, persistence, multi-step execution | LangGraph, Temporal |
| **Agent Harness** | Control plane — lifecycle, context, safety, feedback | DeepAgents, Claude Agent SDK, Codex |

---

## 2. Architecture: The Three Loops

Every successful harness uses nested feedback loops:

### Loop 1: Inner (per-action) — "Did this step work?"

- Run linter/typechecker/tests after every code change
- Screenshot after every UI change (the "screenshot after every claim" principle)
- Agent sees results immediately, self-corrects
- **Spotify's Honk pattern**: Agent doesn't know *how* verification works, just that it can call it. This prevents gaming while still giving actionable feedback.
- **Key design principle**: "The agent doesn't know what the verification does and how, it just knows that it can call it to verify its changes."

### Loop 2: Middle (per-task) — "Is this task done correctly?"

- Deterministic graders first: type-check, build, test suite
- LLM-as-Judge second: checks if agent stayed within scope (Spotify vetoes 25% of sessions for scope creep)
- Visual verification: multimodal LLM inspects screenshot against acceptance criteria
- SWE-bench dual-validation pattern:
  - **fail2pass**: Tests that were failing now pass (fix works)
  - **pass2pass**: Tests that were passing still pass (nothing broke)

### Loop 3: Outer (cross-session) — "Is the agent getting better?"

- Eval-Driven Development: capability evals (low pass rate, ambitious) graduate to regression evals (must stay ~100%)
- Episodic memory: store self-critiques, replay past failures as context (Reflexion pattern: 80% → 91% on HumanEval)
- Track pass^k (consistency over k runs), not just pass@1 — tau-bench showed agents with 50% pass@1 have <25% pass@8

---

## 3. Red/Blue Team TDD — The Dual-Agent Pattern

This is the most validated architecture across the research.

### Red Team (Attack/Break)

- **Writes failing tests first** — defines what "correct" looks like before any implementation
- **Generates adversarial edge cases** — property-based testing (Hypothesis), mutation testing
- **Checks for reward hacking** — agents may disable tests, weaken assertions, or hardcode outputs instead of implementing correctly (known failure mode of the Ralph Wiggum Loop)
- **Microsoft's RedCodeAgent** found 82 unique vulnerabilities that all baseline methods missed, tested across CWE vulnerabilities, multiple languages, and agents including MetaGPT, Cursor, and Codeium

### Blue Team (Defend/Verify)

- **Implements code to pass red team's tests** — classic TDD green phase
- **Runs deterministic verification** — build, lint, type-check, test suite
- **Visual verification** — screenshot → multimodal LLM evaluation
- **Microsoft's BlueCodeAgent** distills red team findings into "constitutions" (explicit rules encoding safety knowledge). Red-team knowledge → constitutions → defensive checks. Results: 12.7% F1 score improvement across four datasets.

### The Separation Principle

> "A single agent cannot objectively evaluate its own work. Context window contamination means the test writer's analysis bleeds into the implementer's thinking. Separation is not just organizational — it is architecturally necessary for genuine quality assurance."

**TDD Guard** (open-source) and multi-agent TDD architectures for Claude Code already enforce this separation through hooks. TDD Guard intercepts all file modification operations, validates against TDD violations (implementing without a failing test), and supports Jest, Vitest, pytest, PHPUnit, Go, and Rust.

### The Virtuous Cycle

The most effective systems unify red and blue teaming:
```
Attack → Learn → Codify (constitutions) → Defend → Repeat
```

### Property-Based Testing (PBT)

The **Property-Generated Solver (PGS)** framework achieved 23.1-37.3% improvement over standard TDD by breaking the "cycle of self-deception" — where tests and code share the same flaws because the same agent wrote both. Architecture: a **Generator** agent creates/refines code, and a **Tester** agent manages PBT independently using Hypothesis.

### Mutation Testing

**Meta's ACH (Automated Compliance Hardening)**: generates code mutants, then creates tests that catch them. Applied to 10,795 Android Kotlin classes, generating 9,095 mutants and 571 test cases. Engineers accepted 73% of generated tests.

**Critical insight**: A test suite with 100% code coverage but 4% mutation score executes every line but misses 96% of potential bugs.

**Recommended thresholds**: 70% mutation score for critical paths, 50% for standard features, 30% for experimental code.

### TDD in Practice for AI Agents

**Simon Willison** calls "Use red/green TDD" the **highest-leverage four-word prompt** for coding agents — it simultaneously validates correctness, prevents unnecessary code, and builds a regression suite.

**TDFlow** (CMU/UCSD/JHU): Frames repository-scale SE as test-resolution. Four sub-agents: patch proposing, debugging, patch revision, and optional test generation. Results: **88.8% pass rate on SWE-bench Lite**, 94.3% on SWE-bench Verified.

---

## 4. Visual Feedback Loop — Screenshots as Source of Truth

### The Universal Pattern

```
Code Change → Start/Reload App → Screenshot → Multimodal LLM Evaluation →
  If wrong: fix and repeat
  If right: proceed
```

### "Coding agents lie constantly"

The paddo.dev research emphasizes: **screenshot after every claim**. If an agent says "layout matches the spec," take a screenshot and verify. Trust but verify.

### What Works (2026 State of the Art)

| Approach | Tool | Notes |
|----------|------|-------|
| Headless screenshot | **Playwright** (`toHaveScreenshot()`) | Built-in visual comparison with pixelmatch |
| Rendering consistency | **Docker containers** | Font rendering is #1 cause of cross-platform flakiness |
| AI visual oracle | **Claude vision / GPT-4o** | Semantic evaluation > pixel diff for agent use |
| Animation suppression | CSS injection `* { animation: none !important }` | Critical for deterministic screenshots |
| Console error capture | Alongside screenshots | Visual parity alone is insufficient |
| Video for temporal bugs | **Gemini Pro** (2hrs @ 1fps natively) | Catches flickering, race conditions, animation glitches |
| Token optimization | Average pooling / TokenCarve | 70% token reduction, ~3% accuracy drop |
| AI review agent | **Percy** Visual Review Agent | 3x faster review, 40% fewer changes to review |

### Visual Regression Testing Tool Comparison

| Tool | Architecture | Best For |
|------|-------------|---------|
| **Percy** (BrowserStack) | DOM snapshots → cloud rendering → pixel diff + AI Review Agent | SaaS, PR-level visual review |
| **Chromatic** | Storybook stories → cloud rendering → smart diff | Component-level isolation |
| **Applitools Eyes** | DOM snapshots → Ultrafast Grid → Visual AI (not pixel) | Enterprise, cross-browser |
| **BackstopJS** | Puppeteer/Playwright → ResembleJS → HTML report | Open-source, self-hosted |
| **Argos** | E2E screenshots → odiff (SIMD, 8x faster) → Figma-style review | Fast open-source |
| **Lost Pixel** | Storybook + pages + E2E → open-source engine | Holistic, supports Ladle |

### Pixel-Diff vs Semantic-Diff vs AI

- **Pixel-based**: Easy, catches everything, but 60-70% of time spent reviewing false positives
- **DOM/Semantic**: Reports human-readable changes ("font-size 14→16px"), eliminates rendering noise, but misses pure CSS rendering bugs
- **AI/Visual AI**: Eliminates false-positive/missed-bug tradeoff. Understands what matters contextually.
- **Recommendation**: Use both DOM snapshots and image snapshots. They cover different failure modes.

### Handling Flakiness

| Strategy | Implementation |
|----------|----------------|
| Docker containers | Pin browser environment; generate baselines in CI |
| Masking | Cover dynamic elements with solid color boxes |
| CSS injection | Disable animations (`* { animation: none !important; transition: none !important; }`) |
| Deterministic data | Use fixtures, mock API responses, seed databases |
| Wait strategies | Wait for fonts, images, specific element visibility before capture |
| Threshold tuning | `maxDiffPixelRatio` globally, `maxDiffPixels` per test |
| AI filtering | Percy Review Agent, Applitools Visual AI, mabl |

### Computer Use / GUI Agents

| Agent | Architecture | Feedback Loop |
|-------|-------------|---------------|
| **Claude Computer Use** | Mouse/keyboard + text editor + bash | Screenshot after each action, reason about state, decide next action |
| **OpenAI CUA / Operator** | GPT-4o vision + chain-of-thought | Screenshot → reason → act → screenshot → repeat |
| **Cursor Cloud Agents** | Isolated VMs, full dev env | Screenshots + video artifacts in PRs, >30% of Cursor's own PRs |
| **Devin** | Shell + editor + browser in sandbox | Evaluator agents log in, browse, visually analyze |
| **Browser-Use** | Hybrid DOM + Vision + Playwright | DOM analysis + screenshot analysis at each step |

### MCP Screenshot Servers

- **Playwright MCP** (Microsoft): `claude mcp add playwright npx @playwright/mcp@latest` — 143 device emulations
- **BrowserTools MCP** (AgentDesk): Chrome Extension + Node Server + MCP Server — console logs, network, DOM, screenshots
- **Screenshot MCP Server**: Puppeteer web capture + native OS screenshot

### OmniParser (Microsoft)

Converts unstructured UI screenshots into structured elements: fine-tuned interactable region detection, icon description model, and OCR. 73% accuracy improvement on ScreenSpot benchmark. Compatible with GPT-4o, Claude Sonnet, DeepSeek, Qwen.

---

## 5. Sandboxed Execution — Making It Safe

### Isolation Technologies

| Technology | Isolation Level | Startup | Overhead | Best For |
|------------|----------------|---------|----------|----------|
| **Firecracker** | Hardware VM (KVM) | ~125ms | <5 MiB/VM | Strongest isolation, production |
| **gVisor** | User-space kernel | Fast | 10-30% I/O | No hardware virt needed |
| **Kata Containers** | Hardware VM (multiple VMMs) | Moderate | Moderate | Kubernetes integration |
| **nsjail** | Namespaces + seccomp | Minimal | Minimal | Lightweight process isolation |
| **Docker Sandbox** | MicroVM-based (Desktop 4.50+) | Fast | Low | Agent-native, Docker-in-Docker |
| **WebAssembly** | Browser sandbox | Instant | Low | Client-side, offline |

### Platform Comparison

| Platform | Isolation | Cold Start | Key Feature |
|----------|-----------|-----------|-------------|
| **E2B** | Firecracker | 80ms | Open-source, Docker MCP catalog (200+ tools) |
| **Modal** | gVisor | Sub-second | Scale to 20K+ concurrent, Python-native |
| **Fly.io Sprites** | Firecracker | 1-2s (300ms checkpoint) | Stateful, checkpoint/restore |
| **Vercel Sandbox** | Firecracker | Fast | Same infra as Vercel builds, up to 5hr |
| **Daytona** | Docker + optional Kata | 27-90ms | Fastest cold starts, built-in LSP |
| **Northflank** | Kata + Cloud Hypervisor | Fast | 2M+ monthly workloads |
| **GKE Agent Sandbox** | gVisor + Kata | <1s (warm pool) | Kubernetes-native, open-source |

### Safe Environment Design

**Claude Code's sandbox-runtime** (open-source `@anthropic-ai/sandbox-runtime`):
- macOS: `sandbox-exec` (Seatbelt)
- Linux: `bubblewrap` + network namespace removal + proxy-based domain allowlists
- No container overhead required

**OpenAI Codex**: Network disabled during execution (`CODEX_SANDBOX_NETWORK_DISABLED=1`). Selective enablement for trusted domains.

**NVIDIA's mandatory controls**: (1) network egress controls, (2) file write restrictions outside workspace, (3) short-lived token credential injection, (4) treat all AI-generated code as untrusted.

### Defense in Depth (Recommended Layering)

1. MicroVM or gVisor isolation
2. Filesystem restrictions
3. Network egress controls
4. seccomp-bpf syscall filtering
5. Resource limits (CPU, memory, time)
6. Credential brokers with short-lived tokens
7. Monitoring and approval gates
8. Signed artifacts

### Rollback and Recovery

| Approach | How It Works | Tool |
|----------|-------------|------|
| **Shadow Git repo** | Auto-checkpoint before every file mutation | Cline, Roo Code |
| **Database branching** | Instant schema+data snapshots, instant restore | Neon |
| **Filesystem hard links** | Pre-command backups, instant rollback | SafeShell |
| **Full-state snapshots** | Code + DB + env + AI context captured together | Replit |
| **Transactional no-regression** | Only reversible changes allowed, auto-undo on failure | IBM STRATUS |
| **Conversation versioning** | Git-like commit/revert/branch for agent state | Agent-Git |

---

## 6. Eval-Driven Development — The Outer Loop

### Anthropic's Recommended Starting Point

1. Start with **20-50 tasks drawn from real failures** (not synthetic)
2. Seed from actual production bugs, UI issues, feature requests
3. Each eval = prompt → captured run (trace + artifacts) → checks → score

### Two Eval Types

| Type | Pass Rate Target | Purpose | Lifecycle |
|------|-----------------|---------|-----------|
| **Capability evals** | Start low | "Can the agent do X?" Ambitious, stretching | Graduate to regression when consistently passing |
| **Regression evals** | Near 100% | "Does the agent still do X?" | Run on every change, block deploy if drops |

### Metrics That Matter

| Metric | What It Measures | Why It Matters |
|--------|-----------------|----------------|
| **pass@1** | Single-attempt success | Basic capability |
| **pass^k** (tau-bench) | Consistency over k runs | Reliability — the real differentiator |
| **Mutation score** | % of code mutations caught by tests | Better than coverage (Meta: 100% coverage, 4% mutation score) |
| **Progress rate** (AgentBoard) | Incremental goal advancement | Captures partial success |
| **Scope adherence** | Did agent stay within instructions? | Spotify's #1 failure mode |
| **ASR** (Attack Success Rate) | % of adversarial attacks that succeed | Security posture |
| **F1 score** | Precision + recall of bug detection | Code review quality |

### Agent-as-a-Judge

Using an agentic system to evaluate another agent achieves ~90% agreement with human experts (vs 70% for simple LLM-as-Judge). Cuts eval cost by ~97% ($1,297 → $31). The evaluator agent has its own tools — runs the app, takes screenshots, checks logs.

### Process vs. Outcome Evaluation

- **Outcome Reward Models (ORMs)**: Evaluate only the final output
- **Process Reward Models (PRMs)**: Step-level feedback on each intermediate reasoning step
- PRMs improve credit assignment and explainability
- **Monitoring chains-of-thought is substantially more effective** than monitoring actions and outputs alone (OpenAI research)
- **TrajAD**: Trajectory anomaly detection for step-level errors current LLM judges miss
- **Trajectory Guard**: F1-scores of 0.88-0.94 for detecting drift, cycles, and silent failures

### Anti-Contamination Strategies

| Strategy | Approach | Example |
|----------|----------|---------|
| Temporal gating | Only eval on problems after training cutoff | LiveCodeBench, SWE-rebench |
| Dynamic generation | LLMs evolve/generate problems | EvoEval, AutoCodeBench |
| Future prediction | Ground truth hasn't occurred yet | FutureX |
| Cross-benchmark analysis | Compare performance across datasets | SWE-Bench Illusion approach |

---

## 7. Self-Improvement Mechanisms

### Proven Approaches

| Pattern | Result | Source |
|---------|--------|--------|
| **Reflexion** (verbal self-critique → episodic memory → retry) | 80% → 91% HumanEval | Reflexion paper |
| **SICA** (agent edits own source code) | 17% → 53% SWE-bench subset | ICLR 2025 Workshop |
| **Darwin Godel Machine** (Darwinian evolution of agent code) | 20% → 50% SWE-bench | Sakana AI |
| **Huxley-Godel Machine** (iterative self-rewriting) | Human-level SWE-bench Verified | ICLR 2026 Oral |
| **TDFlow** (test-driven sub-agents) | 88.8% SWE-bench Lite | CMU/UCSD/JHU |
| **PALADIN** (failure injection + recovery training) | 32% → 89% recovery rate | PALADIN paper |
| **Absolute Zero** (self-proposes tasks, solves, improves) | SOTA coding + math reasoning | NeurIPS 2025 Spotlight |
| **AlphaEvolve** (evolutionary coding + Gemini) | 23% speedup Gemini training | Google DeepMind |
| **Sol-Ver** (solver generates code, verifier generates tests) | Mutual enhancement, no human annotation | NeurIPS 2025 |
| **PSV** (formal verification for self-play) | Up to 9.6x pass@1 improvement | arXiv 2512.18160 |

### The Reward Hacking Problem

The Ralph Wiggum Loop (iterative self-improvement via `while true` + prompt) has a known failure: agents disable tests, weaken assertions, or hardcode outputs. Mitigations:
- **Formal verification** (PSV paper) provides binary guarantees unit tests can't
- **Property-based testing** generates edge cases the agent can't anticipate
- **Separate red/blue agents** prevent self-deception
- **Mutation score** catches test suites that pass everything but detect nothing

### Self-Healing Architectures

**Three-Stage Loop** (common pattern):
1. **EXECUTE**: Agent performs its task
2. **MONITOR**: Health scoring (coherence, completeness, latency, memory, consistency)
3. **RECOVER**: Cascading recovery strategies

**Critical insight**: "DEGRADED is not FAILED" — an agent producing lower-quality output is still useful if given a lighter workload. This distinction eliminated 73% of false-positive failures in one system.

**PALADIN**: Trained on 50,000+ recovery-annotated trajectories via systematic failure injection. At inference, detects execution-time errors and retrieves similar cases from a failure exemplar bank. 32% → 89% recovery rate, generalizing to unseen tool APIs with 95.2% recovery.

---

## 8. Benchmark Harness Architectures

### SWE-bench (The Gold Standard)

**Three-Layer Docker Image Architecture:**
1. **Base images**: Common dependencies for all evaluations
2. **Environment images**: ~60 different Python environment configurations
3. **Instance images**: Specific dependencies for each evaluation task

**Grading**: Exit-code-based validation extracting test status from logs. No custom parsers. fail2pass + pass2pass dual validation.

**Resource requirements**: 120GB+ storage, 16GB RAM, 8 CPU cores minimum.

### Benchmark Family

| Benchmark | Tasks | Focus | Top Score |
|-----------|-------|-------|-----------|
| **SWE-bench Verified** | 500 | Bug fixing (human-validated) | ~72% |
| **SWE-bench Pro** | 1,865 | Long-horizon, multi-file | 23.3% (GPT-5) |
| **SWE-EVO** | 48 | Software evolution (avg 21 files) | 21% (GPT-5) |
| **FeatureBench** | 200 | Feature implementation (not bug fixing) | 12.5% (GPT-5.1-Codex) |
| **Terminal-Bench 2.0** | 89 | Real terminal environments | 66.5% (LangChain) |
| **LiveCodeBench** | 1,055 | Continuously refreshed from LeetCode/Codeforces | Varies |
| **HumanEval** | 164 | Single-function generation | Saturated (~95%+) |
| **tau-bench** | Various | Agent reliability (pass^k) | <25% pass^8 retail |
| **TheAgentCompany** | 175 | Simulated software company tasks | 30.3% (Gemini 2.5 Pro) |

### Key Limitation

SWE-bench is almost exclusively Python bug-fixing. FeatureBench (feature implementation) shows a massive capability gap: even the best models achieve only ~12%. The real-world task distribution is much harder than benchmarks suggest.

### SWE-bench Contamination

"The SWE-Bench Illusion" (2025): Models achieve 76% accuracy on SWE-bench file-path identification vs. only 53% on equivalent tasks from other repos. Verbatim 5-gram accuracy was 35% on SWE-bench vs. 18% elsewhere. Strong evidence of memorization, not reasoning.

---

## 9. Agent Memory & Observability

### Memory Architecture

| Type | Purpose | Example |
|------|---------|---------|
| **Short-term/Working** | Current conversation context | Context window |
| **Episodic** | Specific past experiences | Reflexion, PALADIN failure bank |
| **Semantic** | Structured knowledge, rules | Constitutions, CLAUDE.md |

**Mem0**: Dynamic extraction, consolidation, retrieval. 26% higher accuracy vs OpenAI's memory, 91% lower latency, 90% token savings.

**Letta (MemGPT)**: Self-editing memory — agents actively manage their own memory using tools. Same agent improves over months.

### Context Engineering

Context engineering has displaced prompt engineering as the critical discipline:
- **Repository Maps** (Aider): tree-sitter AST parsing for function signatures, dynamically fitting within token budgets
- **KV-cache optimization** (Manus): stable prefixes + append-only context = 10x cost reduction
- **Compaction** (Codex): compress conversation history beyond token threshold

### Observability

**OpenTelemetry GenAI Semantic Conventions** (v1.37+) are the emerging standard. Defines schemas for prompts, responses, token usage, tool/agent calls.

| Tool | Type | Key Feature |
|------|------|-------------|
| **Langfuse** | Open-source | Deep tracing, LLM-as-Judge scoring, batch + production eval |
| **LangSmith** | Platform | Full reasoning traces, pre-built dashboards, evaluation workflow |
| **Arize Phoenix** | Open-source, self-hosted | OTel-based, vendor-agnostic, human + LLM labels |
| **Datadog LLM Obs** | Enterprise | Maps LangGraph DAGs, auto cost calculation, OTel native |
| **Inspect AI** (UK AISI) | Open-source | Sandboxed execution, VS Code integration, curated tasks |

---

## 10. Multi-Agent Coordination

### Git Worktrees (The Standard Pattern)

Git worktrees are the standard isolation mechanism for parallel AI agents. Each agent gets its own working directory backed by the same .git repository. Resource: 2-4GB RAM per worktree with active build; 5-6 concurrent worktrees comfortable on 32GB.

### File-Level Locking

**Agent-MCP**: When an agent claims work, the system locks relevant files; other agents automatically receive different assignments. Upon completion, files unlock and dependent work becomes available.

### Hierarchical Orchestration

The successful architecture (proven by Cursor's FastRender: 1M lines, 1000 files, built in a week):
- **Planners**: Explore codebase, create tasks
- **Workers**: Execute assigned tasks independently
- **Judges**: Determine whether to continue at each cycle end

### Spotify's Honk (1,500+ Merged PRs)

**Deterministic Verifiers**: Activate based on project contents (e.g., Maven verifier when pom.xml found). Return concise, actionable feedback — regex extracts only relevant error messages.

**LLM-as-Judge**: Runs after all deterministic verifiers. Takes diff + original prompt, evaluates scope adherence. Vetoes ~25% of sessions; agent course-corrects 50% of the time.

### Anthropic's Multi-Session Harness

- **Initializer agent** (first session): creates init.sh, progress file, feature list (JSON), initial git commit
- **Coding agents** (subsequent sessions): read progress files and git history, make incremental progress, leave structured updates
- Key insight: create **durable, queryable records** (progress files, git history, JSON feature lists) that persist between sessions

---

## 11. Proposed Architecture for Renzo

### Components

```
┌──────────────────────────────────────────────────────┐
│                    COORDINATOR                        │
│   (dispatches tasks, monitors progress, merges)       │
└──────────────┬──────────────────────┬────────────────┘
               │                      │
     ┌─────────▼──────────┐ ┌────────▼───────────┐
     │    RED AGENT        │ │   BLUE AGENT        │
     │  (test writer)      │ │  (implementer)      │
     │  - Writes failing   │ │  - Implements to    │
     │    tests first      │ │    pass tests       │
     │  - Property-based   │ │  - Runs quality     │
     │    edge cases       │ │    gates            │
     │  - Mutation testing │ │  - Screenshots +    │
     │                     │ │    visual verify    │
     └─────────────────────┘ └────────┬────────────┘
                                      │
                            ┌─────────▼────────────┐
                            │    JUDGE AGENT        │
                            │  - Reviews diff       │
                            │  - Scope check        │
                            │  - Visual verify      │
                            │  - Approve/reject     │
                            └──────────────────────┘
```

### Verification Stack (Leveraging Existing Tools)

1. `npx tsc --noEmit` — type safety
2. `DATABASE_URL="..." npm run build` — build succeeds
3. `npx vitest run` — unit/API tests pass
4. Playwright screenshot → Claude vision evaluation — UI correctness
5. `npm run e2e:local` — E2E integration
6. LLM-as-Judge — scope adherence check

### Safety Stack (Leveraging Existing Infrastructure)

1. **Git worktrees** — file isolation (already in place)
2. **Claude Code sandbox** — filesystem + network restrictions (already configured)
3. **Git checkpoints** — auto-snapshot before mutations
4. **Database branching** — safe schema experimentation (Neon or shadow DB)
5. **Hard timeouts** — prevent runaway agents
6. **Mutation score** — verify test suite quality, not just coverage

### Feedback Loop Architecture

```
For each task:
  1. RED agent writes failing tests (unit + property-based + visual baseline)
  2. BLUE agent implements (in worktree)
  3. Inner loop: after each code change:
     a. tsc --noEmit
     b. vitest run (targeted)
     c. If UI change: screenshot → vision eval
  4. Middle loop: when BLUE claims done:
     a. Full quality gates (tsc + build + vitest + e2e)
     b. Mutation testing on changed code
     c. Full visual regression
     d. JUDGE evaluates diff for scope adherence
  5. Outer loop: after task completes:
     a. Record pass/fail + metrics
     b. Update capability/regression eval suite
     c. Store learnings in episodic memory
```

### Eval Suite Bootstrap

Seed with 20-50 tasks from:
- Past bugs in the Renzo codebase
- Existing E2E test scenarios
- Known UI edge cases (auto-scroll, CSS shorthand, asyncHandler wrapping)
- Feature requests from the backlog

---

## 12. Key Sources (Top 50)

### Harness Architecture

1. [Anthropic: Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
2. [Anthropic: Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
3. [Martin Fowler: Harness Engineering](https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html)
4. [OpenAI: Harness Engineering](https://openai.com/index/harness-engineering/)
5. [OpenAI: Unrolling the Codex Agent Loop](https://openai.com/index/unrolling-the-codex-agent-loop/)
6. [Philipp Schmid: The Importance of Agent Harness in 2026](https://www.philschmid.de/agent-harness-2026)
7. [LangChain: Improving Deep Agents with Harness Engineering](https://blog.langchain.com/improving-deep-agents-with-harness-engineering/)
8. [Spotify: Feedback Loops — Background Coding Agents Part 3](https://engineering.atspotify.com/2025/12/feedback-loops-background-coding-agents-part-3)
9. [Spotify: Context Engineering — Background Coding Agents Part 2](https://engineering.atspotify.com/2025/11/context-engineering-background-coding-agents-part-2)
10. [Hightouch: Long-Running Agent Harness](https://www.amplifypartners.com/blog-posts/how-hightouch-built-their-long-running-agent-harness)

### Red/Blue Team & TDD

11. [Microsoft: BlueCodeAgent](https://www.microsoft.com/en-us/research/blog/bluecodeagent-a-blue-teaming-agent-enabled-by-automated-red-teaming-for-codegen-ai/)
12. [Microsoft: RedCodeAgent](https://www.microsoft.com/en-us/research/blog/redcodeagent-automatic-red-teaming-agent-against-diverse-code-agents/)
13. [Simon Willison: Red/Green TDD — Agentic Engineering Patterns](https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/)
14. [TDFlow: Test-Driven Software Engineering (arXiv)](https://arxiv.org/abs/2510.23761)
15. [Meta: Mutation-Guided LLM Test Generation](https://engineering.fb.com/2025/02/05/security/revolutionizing-software-testing-llm-powered-bug-catchers-meta-ach/)
16. [Property-Generated Solver (arXiv)](https://arxiv.org/abs/2506.18315)
17. [TDD Guard for Claude Code (GitHub)](https://github.com/nizos/tdd-guard)
18. [Anthropic: Strengthening Red Teams (Modular Scaffold)](https://alignment.anthropic.com/2025/strengthening-red-teams/)
19. [CSA: Agentic AI Red Teaming Guide](https://cloudsecurityalliance.org/artifacts/agentic-ai-red-teaming-guide)
20. [Agent Security Bench — ICLR 2025 (arXiv)](https://arxiv.org/abs/2410.02644)

### Visual Testing & Feedback

21. [paddo.dev: Visual Verification — Making Agents Prove Their Work](https://paddo.dev/blog/multimodal-validation-visual-verification/)
22. [Playwright Visual Comparisons Docs](https://playwright.dev/docs/test-snapshots)
23. [Percy — How It Works](https://percy.io/how-it-works)
24. [Applitools Eyes](https://applitools.com/platform/eyes/)
25. [OmniParser V2 (Microsoft Research)](https://www.microsoft.com/en-us/research/articles/omniparser-v2-turning-any-llm-into-a-computer-use-agent/)
26. [Goose: Screenshot-Driven Development](https://block.github.io/goose/blog/2024/11/22/screenshot-driven-development)
27. [Giving Claude Code Eyes: Round-Trip Screenshot Testing](https://medium.com/@rotbart/giving-claude-code-eyes-round-trip-screenshot-testing-ce52f7dcc563)
28. [Tweag: Visual Feedback Loop — Agentic Coding Handbook](https://tweag.github.io/agentic-coding-handbook/WORKFLOW_VISUAL_FEEDBACK/)
29. [Cursor: Agent Computer Use](https://cursor.com/blog/agent-computer-use)
30. [Claude Computer Use Tool Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)

### Sandboxed Execution

31. [Anthropic: Claude Code Sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing)
32. [Docker: Sandboxes for Coding Agent Safety](https://www.docker.com/blog/docker-sandboxes-a-new-approach-for-coding-agent-safety/)
33. [E2B (open-source Firecracker sandboxes)](https://e2b.dev/)
34. [Firecracker (GitHub)](https://github.com/firecracker-microvm/firecracker)
35. [Neon: Database Branching for Agents](https://neon.com/branching/branching-for-agents)
36. [Replit: Inside the Snapshot Engine](https://blog.replit.com/inside-replits-snapshot-engine)
37. [SafeShell (GitHub)](https://github.com/qhkm/safeshell)
38. [Fly.io Sprites](https://sprites.dev/)
39. [GKE Agent Sandbox](https://docs.google.com/kubernetes-engine/docs/how-to/agent-sandbox)
40. [NVIDIA: Practical Security for Sandboxing Agentic Workflows](https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk)

### Academic / Evaluation

41. [Scaling Laws for Scalable Oversight — NeurIPS 2025 (arXiv)](https://arxiv.org/abs/2504.18530)
42. [Agent-as-a-Judge — ICML 2025 (arXiv)](https://arxiv.org/abs/2410.10934)
43. [tau-bench — Sierra (arXiv)](https://arxiv.org/abs/2406.12045)
44. [SWE-bench (ICLR 2024)](https://arxiv.org/pdf/2310.06770)
45. [The SWE-Bench Illusion (arXiv)](https://arxiv.org/abs/2506.12286)
46. [FeatureBench — ICLR 2026 (arXiv)](https://arxiv.org/abs/2602.10975)
47. [Absolute Zero Reasoner — NeurIPS 2025 (arXiv)](https://arxiv.org/abs/2505.03335)
48. [Darwin Godel Machine (Sakana AI)](https://sakana.ai/dgm/)
49. [Monitoring Monitorability — OpenAI (arXiv)](https://arxiv.org/abs/2512.18311)
50. [Anthropic: Bloom — Automated Behavioral Evaluations](https://alignment.anthropic.com/2025/bloom-auto-evals/)

### Tools & Frameworks

- [Invariant Guardrails (GitHub)](https://github.com/invariantlabs-ai/invariant)
- [DeepEval (GitHub)](https://github.com/confident-ai/deepeval)
- [Inspect AI (UK AISI)](https://inspect.aisi.org.uk/)
- [GitHub Spec-Kit](https://github.com/github/spec-kit)
- [SuperClaw (GitHub)](https://github.com/SuperagenticAI/superclaw)
- [PyRIT — Microsoft (GitHub)](https://github.com/Azure/PyRIT)
- [Promptfoo (GitHub)](https://github.com/promptfoo/promptfoo)
- [Langfuse](https://langfuse.com/)
- [LangSmith](https://www.langchain.com/langsmith/observability)
- [Arize Phoenix (GitHub)](https://github.com/Arize-ai/phoenix)
- [Ralph Wiggum Loop — Claude Code Plugin](https://github.com/anthropics/claude-code/blob/main/plugins/ralph-wiggum/README.md)
- [SWE-agent Architecture](https://swe-agent.com/latest/background/architecture/)
- [OpenHands SDK](https://arxiv.org/abs/2511.03690)
- [Mem0](https://mem0.ai/research)
- [Letta (MemGPT)](https://www.letta.com/)
- [Agent-MCP (GitHub)](https://github.com/rinadelph/Agent-MCP)
- [Playwright MCP — Microsoft (GitHub)](https://github.com/microsoft/playwright-mcp)
- [BrowserTools MCP (GitHub)](https://github.com/AgentDeskAI/browser-tools-mcp)
