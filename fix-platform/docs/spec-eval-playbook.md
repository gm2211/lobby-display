# Spec-to-Eval Playbook (Agents)

This doc captures a practical way to convert a product spec into executable evals for coding agents.

## Why this structure

- Specs are usually prose-heavy and ambiguous.
- Agent evals work best when each check is deterministic and tied to observable evidence.
- Route/API checks plus runtime error checks give faster signal than visual-only checks.

## Research-backed principles

1. Start from clear tasks and observable outcomes, not vague quality labels.
   - OpenAI recommends evals that reflect real tasks and explicit pass/fail criteria.
   - Source: https://platform.openai.com/docs/guides/evals
2. Evaluate the full agent workflow, not just final text output.
   - OpenAI Agents docs emphasize trace-level and trajectory evaluation for agent behavior.
   - Source: https://openai.github.io/openai-agents-python/evals/
3. Prefer executable, end-to-end benchmarks where possible.
   - SWE-bench shows realistic software tasks are best evaluated by running tests against produced changes.
   - Source: https://arxiv.org/abs/2310.06770
4. Add long-horizon evals for reliability over multi-step tasks.
   - RE-Bench highlights that short tasks can overestimate real-world autonomous performance.
   - Source: https://arxiv.org/abs/2411.15114
5. Use side-by-side review for rubric drift and evaluator calibration.
   - Anthropic's evaluation tool design notes comparative grading for quality signal.
   - Source: https://docs.anthropic.com/en/docs/evals/eval-tool

## Spec -> Eval pipeline

1. Extract requirement atoms from spec sections:
   - actor
   - action
   - observable outcome
2. Map each atom to a user journey:
   - route/page
   - backing API contract
   - critical UI evidence
3. Encode each journey as a deterministic test case:
   - route reachable when authenticated
   - expected heading/landmark present
   - API responds with JSON and non-5xx
   - no pageerror/critical console error
4. Keep evals separate from general smoke tests:
   - run by tag (`@spec-eval`)
   - explicit command for local/staging runs
5. Track coverage by spec section:
   - test title includes section id (for example `[4.9] Documents / File Library`)

## Repo implementation

- Canonical spec: `docs/platform-spec/spec.md`
- Test suite: `e2e/tests/platform/spec-eval.spec.ts`
- Run locally:
  - `npm run e2e:spec-eval:local`
- Run on staging:
  - `npm run e2e:spec-eval:staging`
- Outputs:
  - `e2e/spec-eval-results.json` (raw Playwright JSON report)
  - `e2e/spec-eval-scorecard.json` (per-spec-section scorecard + framework errors)

## Keeping E2Es in sync with spec

Use this workflow whenever `cc-product-spec.zip` or `docs/platform-spec/spec.md` changes.

1. Refresh local spec artifacts:
   - `./scripts/extract-spec.sh`
2. Compare feature headings with eval coverage:
   - In spec: `### 4.x ...` feature sections
   - In eval: `SPEC_EVAL_CASES` entries in `e2e/tests/platform/spec-eval.spec.ts`
3. Update eval mappings:
   - Add a new `SpecEvalCase` for each new feature section that is in scope.
   - Update route, heading matcher, and backing API endpoints if contracts changed.
4. Run evals and generate scorecard:
   - `npm run e2e:spec-eval:local` (or staging)
5. Check drift explicitly in PR:
   - Include the changed sections and matching eval updates in PR notes.
   - Include scorecard summary (`passed/total` and section-level changes).

### PR checklist

- Spec changed? If yes, update `SPEC_EVAL_CASES`.
- New route/feature added? Add or update at least one spec-eval case.
- Attach latest `e2e/spec-eval-scorecard.json` summary in PR description.
- Do not merge if a newly-added section has zero eval coverage.

## Recommended next upgrades

1. Add per-case scoring JSON (pass/fail + error type) for trend tracking.
2. Add role-matrix evals (VIEWER vs EDITOR vs ADMIN) for permission-sensitive flows.
3. Add golden-path mutation checks (intentional breakpoints to prove eval sensitivity).
