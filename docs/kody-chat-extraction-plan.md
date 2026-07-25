# Kody Chat Extraction Plan

## Outcome

`@kody-ade/kody-chat` becomes an independently installable chat package.
Dashboard consumes it through explicit host interfaces. The package never
imports Dashboard implementation code.

This is a boundary cleanup, not a product redesign. Existing user behavior,
API payloads, stream events, persistence, authentication, and routes must
remain stable while ownership moves.

## Follow-Up

After the package passes the independence criteria in this plan, continue with
the [Kody Chat Package Release Plan](kody-chat-package-release-plan.md).

The external-consumer fixture starts during extraction because it proves the
boundary is real. Public API stabilization, documentation, npm release, and
adoption by a real external project remain follow-up release work.

## Current Boundary

The intended dependency direction is:

```text
Dashboard -> Kody Chat -> generic dependencies
```

The current package still imports `@dashboard/*` and several Kody-owned
workspace packages. Dashboard compensates for this by resolving package
imports back into `apps/dashboard/src/dashboard`.

The package also contains Dashboard-specific pages, Next.js route handlers,
Kody agents, product tools, repository behavior, storage integrations, and
navigation behavior.

The `src/dashboard` directory name is confusing, but renaming it is not the
first task. The real task is removing reverse dependencies.

## Ownership Target

### Kody Chat owns

- Conversation and message contracts
- Turn preparation and chat lifecycle state
- Transport interfaces and generic transport coordination
- Stream event parsing
- Reusable React chat surfaces
- Plugin contracts, registry, slots, and capability grants
- Generic rendering contracts
- Generic host, storage, authentication-header, and navigation interfaces
- Package-level tests and an external-consumer example

### Dashboard owns

- Next.js application composition and routes
- User and repository authentication
- Convex runtime-state configuration
- Repository selection and navigation
- Secrets and variables
- Dashboard pages and administration surfaces
- Product-specific persistence implementations
- Kody-specific tool execution
- Kody agents, goals, workflows, Vibe, Brain, and terminal integration
- Host implementations passed into Kody Chat

Kody-specific integrations may become a separate package later only if a
second real host needs them. This extraction must not create that package
speculatively.

## Non-Negotiable Safety Rules

1. Establish a green baseline before moving files.
2. Change one ownership boundary at a time.
3. Introduce interfaces around the current implementation before relocating
   implementation code.
4. Do not combine extraction with feature redesign.
5. Preserve request bodies, response bodies, headers, stream events, storage
   keys, and visible behavior unless a separately approved change requires it.
6. Runtime state remains Convex-owned. Do not add GitHub fallback, bootstrap,
   dual-read, or dual-write behavior.
7. Every discovered regression becomes a test before it is fixed.
8. Run verification against the final diff for each phase.
9. Stop a phase when its focused or full verification fails. Do not continue
   extracting on top of an unexplained failure.
10. Mocked browser tests do not qualify as live feature proof.
11. Follow the [Live UI Testing Standard](live-ui-testing.md).
12. Run the full no-skip live UI matrix before extraction, after every phase,
    and against the final deployed candidate.
13. If a required live journey cannot run, the phase remains open. Do not
    report the phase as verified or complete.

## Protected Feature Matrix

| Area | Behavior that must remain stable | Existing primary proof |
| --- | --- | --- |
| Admin chat | Models, reasoning, sessions, streaming, stop, commands, context injection, single mount | `admin-chat-regression.spec.ts` |
| Direct Kody | Model selection and streamed assistant response | `chat-kody-direct.spec.ts` |
| Brain | Backend selection, agent handoff, validation, reconnect behavior | `chat-brain-mocked.spec.ts`, `chat-brain-reconnect.spec.ts` |
| Renderers | Approval, selection, multi-selection, failure fallback, hidden provider markup, reasoning display | `chat-renderer-output.spec.ts` |
| Attachments | Upload, multimodal payload, reload persistence | `chat-kody-attachments.spec.ts` |
| Layout and plugins | Chat-only mode, rail mode, panels, back navigation, one chat mount | `chat-first-layout.spec.ts` |
| Vibe | Transfer, handoff, scope, feedback, watchdog, live flow | `vibe-*.spec.ts` |
| Terminal | Embedded terminal mount and live interaction | `chat-terminal-smoke.spec.ts`, `chat-terminal-live-ui.spec.ts` |
| Client chat | Client surface, authentication, brand behavior | package client E2E and `client-signin-wizard.spec.ts` |
| Repository host | Login, repository switching, soft navigation, route scope | `login.spec.ts`, `repo-switcher.spec.ts`, `repo-home-soft-navigation.spec.ts` |
| API and persistence | Chat route contracts, transport envelopes, session and attachment persistence | package and Dashboard integration tests |

The canonical Dashboard browser gate does not include every Vibe, terminal,
Brain-live, and client test. Each phase must add the targeted journeys for the
area it touches.

## Phase 0: Establish the Baseline

No extraction starts in this phase.

1. Settle or isolate the current dirty worktree.
2. Correct the Kody Chat package manifest so test commands are declared under
   `scripts`, not `exports`.
3. Run the current focused package tests and Dashboard tests without changing
   ownership.
4. Run the root verification gate.
5. Run the canonical Dashboard browser gate.
6. Record any environment-gated live tests that could not run.
7. Implement a mandatory `test:e2e:live:gate` that preflights credentials and
   fails when required journeys skip.
8. Fill the live UI matrix gaps for every protected feature affected by the
   extraction.
9. Run and record the complete live UI baseline against the real application,
   APIs, persistence, and external services.
10. Create a small external-consumer fixture that installs the output of
   `pnpm pack`, renders chat, and completes a mocked chat turn.
11. Add real live external-consumer journeys as its supported capabilities are
    introduced.

Exit criteria:

- The baseline failures, if any, are understood and recorded.
- Required local gates are green.
- The complete required live UI matrix executed with zero skips.
- Live artifacts and target commit/version are recorded.
- The packed-package fixture builds without monorepo path aliases.

## Phase 1: Freeze Public Contracts

1. Define the minimal public message, conversation, attachment, rendered-view,
   plugin, and transport contracts.
2. Add contract tests for current request payloads and stream event sequences.
3. Add package export tests that import only documented public paths.
4. Stop exporting implementation internals needed only by Dashboard.

No runtime behavior or file ownership moves in this phase.

Exit criteria:

- Dashboard uses documented contracts.
- Contract tests pin the current wire behavior.
- Existing browser journeys remain green.

## Phase 2: Introduce the Host Boundary

Define only interfaces required by current consumers:

- Authentication headers and identity
- Conversation and attachment storage
- Active repository and page context
- Navigation and host effects
- Agent and model catalog access
- Tool and rendered-view contributions
- Optional telemetry

Dashboard supplies adapters that wrap its current implementations. The first
adapter version must delegate to the same code used before the interface was
introduced.

Exit criteria:

- No persistence backend changed.
- No API endpoint changed.
- The host interface has a real Dashboard implementation and a test
  implementation.

## Phase 3: Clean the Chat Core

Remove Dashboard dependencies from:

- `chat/core`
- Conversation state
- Transport coordination
- Stream parsing
- Rehydration and session logic

Replace Dashboard types and helpers with package contracts or host inputs.

Exit criteria:

- Chat core has zero `@dashboard/*` imports.
- Core unit and transport integration tests pass.
- Direct Kody, Brain, attachments, sessions, and renderer browser journeys
  pass.

## Phase 4: Clean the Reusable Surface

Remove Dashboard dependencies from:

- Composer
- Message list
- Header controls
- Sessions panel
- Rendered-view surface
- Shared chat shell primitives

Dashboard-specific controls become slots, contributions, or host callbacks.
Generic visual primitives may stay in the package; product navigation and
administration UI stay in Dashboard.

Exit criteria:

- Reusable surfaces have zero `@dashboard/*` imports.
- Admin chat, client chat, mobile layout, accessibility, and single-mount
  browser assertions pass.

## Phase 5: Relocate Product Integrations

Move one integration at a time:

1. Agents and model selection
2. Commands and context
3. Goals and workflows
4. Vibe
5. Brain
6. Terminal
7. Repository and GitHub tools
8. Secrets, variables, and administration panels

Each integration registers through the public plugin or host contract. Do not
move the next integration until the current one passes its focused tests and
the full local gates.

Exit criteria:

- Product integrations are owned and composed by Dashboard.
- Kody Chat contains no product-specific storage or navigation implementation.
- Targeted journeys for every moved integration pass.

## Phase 6: Relocate Server Routes

Move Kody-specific Next.js route handlers and server tools into Dashboard.
Keep only framework-neutral server contracts in the package. If a reusable
Next.js adapter is justified by the external example, expose small route
handler factories rather than shipping a second application tree.

Exit criteria:

- Dashboard owns `/api/kody/*`.
- Kody Chat does not depend on Dashboard route aliases.
- API integration tests verify unchanged status codes, headers, payloads, and
  stream events.

## Phase 7: Prove Independence

1. Remove Dashboard aliases used to compile Kody Chat.
2. Remove every `@dashboard/*` import from the package.
3. Build and pack Kody Chat.
4. Install the tarball into the external-consumer fixture.
5. Render chat and complete a real mocked transport turn.
6. Run the full Kody Dashboard verification suite.
7. Run a deployed smoke check before declaring the release complete.
8. Rename `src/dashboard` only after all earlier criteria pass.

Exit criteria:

- `rg '@dashboard/' packages/kody-chat` returns no production imports.
- The package builds outside the monorepo.
- The external fixture does not require Kody workspace packages unless they
  are explicit public peer or runtime dependencies.
- Dashboard behavior remains unchanged.

## Verification Required for Every Phase

Focused tests must run first, followed by:

```bash
pnpm verify
pnpm --filter kody-dashboard test:e2e:gate
```

Also run the affected targeted browser journeys. Examples:

```bash
pnpm --filter kody-dashboard exec playwright test \
  tests/e2e/vibe-chat-transfer.spec.ts \
  tests/e2e/vibe-handoff-kickoff.spec.ts \
  --project=chromium

pnpm --filter kody-dashboard exec playwright test \
  tests/e2e/chat-terminal-smoke.spec.ts \
  --project=chromium
```

Live Brain, terminal, engine, or deployed checks remain separate facts. If
credentials or external capacity prevent a required journey from running, the
phase remains open and unverified.

For every extraction phase, also run:

```bash
pnpm --filter kody-dashboard test:e2e:live:gate
```

The live gate must use the real mounted UI, real application APIs, real
persistence, and the real external services needed by the affected journeys.
It must not pass through skipped tests.

## Phase Completion Report

Every phase reports:

```text
Changed boundary:
Behavior intentionally changed: none
Typecheck:
Lint:
Unit tests:
Integration tests:
Browser gate:
Targeted journeys:
Live local UI matrix:
Live UI skipped:
Live UI artifacts:
Production build:
Packed external fixture:
Deployed live UI matrix:
Remaining @dashboard imports:
Known unverified areas:
```

## Definition of Done

The extraction is complete only when:

- Dashboard depends on Kody Chat and Kody Chat does not depend on Dashboard.
- Kody Chat has a small, documented public API.
- All host behavior enters through explicit interfaces.
- Runtime state remains Convex-owned.
- Dashboard owns Kody-specific routes, tools, agents, and integrations.
- No compatibility aliases or reverse imports remain.
- The package installs and runs in a clean external project.
- Root verification, browser verification, targeted journeys, production
  build, and deployed smoke checks are reported separately and pass where
  applicable.
