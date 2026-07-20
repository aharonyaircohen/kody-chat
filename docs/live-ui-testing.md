# Live UI Testing Standard

## Outcome

Kody is not considered working until a user can complete the real journey
through the visible application and the resulting backend state is proven.

Smoke tests, unit tests, API tests, and mocked Playwright tests remain useful,
but none of them can replace live UI proof.

## Three Different Proof Levels

### 1. Browser contract tests

These open the real UI but may intercept APIs or inject transport events.
They are fast and deterministic. They prove rendering, interaction, and client
contracts.

They do not prove:

- The real route is mounted
- Authentication reaches the real backend
- The model, runner, or external service works
- Persistence survives through the real storage layer
- The deployed system has the required configuration

### 2. Live local UI journeys

These drive the real local application in Playwright or the in-app browser and
use:

- The real route mounted by the local app
- Real authentication for a dedicated test account or repository
- Real API handlers
- Real Convex persistence
- The real model, runner, Brain, terminal, or other required service
- Visible-state assertions in the browser
- Direct persisted-state assertions after the visible action

Mocking unrelated third-party noise is allowed. Intercepting the feature under
test is not.

### 3. Deployed live UI journeys

These repeat the critical live journeys against the exact deployed candidate.
They prove deployment configuration, packaging, environment variables,
networking, and service connectivity.

A local live pass does not prove a deployment. A deployed page-load smoke does
not prove the feature.

## Required Journey Matrix

The matrix is intentionally based on user outcomes rather than source files.
Each row needs a real live Playwright journey or an explicitly recorded gap.

| Journey | Visible proof | Real-state proof |
| --- | --- | --- |
| Authentication and repository selection | User lands in the selected repository without redirect or error | Real identity and repository scope reach the backend |
| Direct Kody chat | User sends a turn, sees streaming/reasoning behavior, and receives the final answer | Real chat route, configured model, and conversation state succeed |
| Kody Live / engine chat | Runner becomes ready, accepts a turn, and renders the reply | Real dispatch, runner, event transport, and persisted events succeed |
| Brain chat | User selects Brain, sends a turn, and receives a reply | Real Brain service and session lifecycle succeed |
| Conversation persistence | A created conversation and messages survive reload and a new browser context where supported | Real Convex conversation records contain the expected state |
| Attachments | User uploads, previews, sends, reloads, and reopens an attachment | Real attachment storage and retrieval succeed |
| Rendered views and approvals | User sees the intended renderer, acts once, and sees the locked result | Real tool output and action persistence succeed |
| Commands and context | User selects a real command/context source and the sent turn reflects it | Real command/context source is read with the correct scope |
| Agent and model selection | User changes the selection and completes a turn with it | Backend receives and honors the selected identity/model |
| Vibe | User requests work, approves it, starts execution, and sees progress/outcome | Real issue, runner, branch/PR, and resulting diff are proven |
| Terminal | Terminal remains visible, accepts typed input, and shows real output | Real Brain/Fly terminal session remains healthy |
| Client-branded chat | External/client user signs in and completes a branded chat turn | Real client auth, brand resolution, model, and conversation state succeed |
| Guided flows | User creates, runs, completes, reloads, and sees the completed flow | Real Convex flow definition and instance state succeed |
| Navigation and plugin panels | User opens, changes route, returns, and keeps the correct chat/session state | Host navigation/context callbacks preserve scope |
| Mobile | User completes supported chat, navigation, attachment, and approval journeys on mobile | Requests and persistence match desktop behavior |

## Test Design Rules

Every live journey must:

1. Start from the user-visible route.
2. Use role, label, or test-id selectors rather than implementation classes
   when possible.
3. Assert the visible outcome, not only an HTTP status.
4. Assert the expected real request occurred.
5. Assert resulting persisted or external state when the feature writes state.
6. Fail on uncaught page errors, unexpected console errors, failed requests,
   unexpected 5xx responses, unexpected navigation, and stuck loading states.
7. Capture a trace, screenshot, video, browser console, failed requests, and
   relevant response bodies on failure.
8. Use unique run identifiers so stale state cannot create a false pass.
9. Clean up created repositories, branches, issues, sessions, and tenant state
   when safe.
10. Avoid arbitrary sleeps; wait for visible outcomes, responses, events, or
    persisted state.

## No-Skip Gate

The live gate must preflight every required credential and service before
Playwright starts.

Missing prerequisites must fail the gate with a clear list. Individual live
specs may keep defensive `test.skip` guards, but the required gate must never
return success because every live test skipped.

The gate report must include:

```text
Required live journeys:
Executed:
Passed:
Failed:
Skipped:
Not implemented:
Artifacts:
Target URL:
Target commit/version:
External test repository/tenant:
```

For a required release gate:

- `Skipped` must be zero.
- `Not implemented` must be zero for every affected or critical journey.
- The target commit/version must match the candidate being released.

## Extraction-Specific Rule

Kody Chat extraction can silently break many unrelated journeys because it
changes shared ownership. Therefore:

1. Run and record the full live matrix before Phase 1.
2. Run affected live journeys after every small change.
3. Run the full live matrix after every extraction phase.
4. Run the full live matrix against the packed external-consumer fixture where
   the journey is supported.
5. Run the critical deployed matrix against the final Dashboard and external
   consumer candidates.

A phase with an unavailable or failing live journey stays open. Mocked tests
cannot waive this requirement.

## Current Known Gaps

The repository already contains genuinely live tests for parts of the engine
chat, Vibe, terminal, Guided Flows, and real renderer data. However:

- The canonical `test:e2e:gate` includes many intercepted API paths.
- Live tests are mostly optional and can skip successfully without credentials.
- There is no mandatory `test:e2e:live:gate` command.
- Direct Kody, real conversation/attachment persistence, full client chat,
  and supported mobile journeys do not yet have complete mandatory live proof.
- Failure monitoring is not consistently installed across all Playwright
  journeys.

Phase 0 of the extraction must close these gaps before architecture work begins.
