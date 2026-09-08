# Reliable agent browser actions — implementation handoff

## Outcome and scope

Make a normal Kody request reliably prepare repository content inside the user's visible browser, without manual copying or repeated instructions to continue. The final acceptance journey is a Facebook composer containing the selected Hebrew post and cover image, visibly ready for review. Never click Post or publish during this exercise.

Implementation repository: `aharonyaircohen/kody-chat`. Live acceptance repository: `aharonyaircohen/simulated-reality`. Work on `main`; preserve unrelated changes. This document authorizes no new account scope migration or infrastructure replacement. Confirm existing release authority before publication; prepare and test the concrete candidate first.

Reuse Views, the existing Fly machine/session lifecycle, capability permissions, browser action runner, and file transport. Preserve the header, repository/actor ownership, and iframe fallback. Do not introduce Facebook-specific behavior into shared code, another browser provider, another scheduler, or more specialist-routing prompt patches.

## Evidence and unresolved diagnosis

- Live Kody opened Facebook but did not complete the draft. The visible model reply reported action validation failures; the exact rejected payload and validator boundary still need reproduction. Do not claim MiniMax is the cause based on that reply.
- `browser-work-routing.ts` explicitly removes repository read tools during browser turns. This explains why a task referring to a repository file can lose access to its input.
- `browserCapabilityActionSchema` is a top-level discriminated union with navigate, click, fill, upload, scroll, and wait variants. The local schema includes click; its existence alone does not prove the provider receives or executes it correctly.
- `views-real-browser-live.e2e.spec.ts` intercepts `/api/kody/chat/kody` and supplies action outputs. It proves real browser transport with synthetic agent replies, not real model-to-browser completion. Retain that useful test but label its proof honestly.
- The observed Content Studio folder contains `post.md` and `01-cover.jpg`. Recheck both before acceptance; do not use copied historical text.
- A prior operator pasted the text at the wrong cursor position. Treat resulting wording confusion as an operator error, not a product defect.

## Code ownership map

Paths below are relative to this repository. Inspect current implementations before editing.

| Responsibility | Existing owner |
| --- | --- |
| Capability action schema and grant validation | `packages/kody-chat-dashboard/app/api/kody/chat/tools/capability-tools.ts` |
| Browser tool availability and phases | `packages/kody-chat-dashboard/app/api/kody/chat/kody/browser-work-routing.ts` |
| Model request, tool assembly, continuation | `packages/kody-chat-dashboard/app/api/kody/chat/kody/route.ts` |
| Client action contract | `packages/kody-chat-dashboard/src/dashboard/lib/chat-ui-actions.ts` |
| Execute action and collect page context | `packages/kody-chat-dashboard/src/dashboard/lib/picker/run-preview-action.ts` |
| Views handoff and active runner | `packages/kody-chat-dashboard/src/dashboard/lib/picker/views-owned-preview-action.ts`, `views-preview-action-runner.ts` |
| Mounted browser API | `apps/dashboard/app/api/kody/browser/session/route.ts` |
| Central live test authentication | `apps/dashboard/tests/e2e/live-account-session.ts`, `live-test.ts` |
| Focused regressions | `packages/kody-chat-dashboard/tests/unit/capability-tools.spec.ts`, `browser-work-routing.spec.ts`, `run-preview-action.spec.ts`, `views-preview-action-runner.spec.ts` |
| Browser contract and transport journeys | `apps/dashboard/tests/e2e/views-capability-browser.spec.ts`, `views-real-browser-live.e2e.spec.ts` |

Follow imports from these owners to locate the existing repository read/list tools, provider schema transformation, and Fly implementation. Do not create replacements merely because their paths are not listed here. Read `docs/project-behavior.md`, `docs/testing-policy.md`, and `docs/live-ui-testing.md`; read UI principles if any visible UI behavior changes.

## Phase 1 — reproduce and specify

1. Record candidate version, active repository, actual model/provider, and browser session identity without secrets.
2. Reproduce one navigation and one harmless click through the real model route. Inspect the tool schema actually sent to the provider, sanitized action arguments, validation error path, execution result, and client acknowledgement.
3. Identify whether failure occurs in model argument generation, schema conversion, tool validation, permission enforcement, or browser execution. Add a failing regression at that boundary before fixing it.
4. Separately reproduce missing repository input and premature completion after navigation. Do not assume they share the click bug's cause.

Deliverable: a short evidence record and failing tests. No unrelated model substitution, credential change, or prompt workaround.

## Phase 2 — simple command and strict execution

Keep `browser_capability_act` and its existing downstream directive. Use a single flat object exposed to the model, with `slug`, `op`, and `reason`, plus operation fields. Avoid a top-level union in the provider-facing schema. Preserve the stricter operation-specific validator on the server.

| op | Required operation fields | Optional fields |
| --- | --- | --- |
| navigate | url | — |
| click | selector | — |
| fill | selector, value | — |
| upload | selector, paths | — |
| scroll | — | selector, dy |
| wait | — | ms |

Provider adapters may need absent optional fields encoded as null; normalize these once at the existing boundary, then validate. Preserve current length, timing, path, origin, and capability limits. Never weaken validation to make the test pass. Return compact actionable errors identifying the missing/invalid field; malformed requests must not reach the browser.

Do not claim action/origin allowlists alone prevent publishing: a permitted click may submit a form. Inspect and preserve the existing approval enforcement separately. This acceptance task explicitly forbids publication.

## Phase 3 — usable inputs and reliable continuation

### Inputs

Restore only the existing read/list operations required to resolve the selected capability's declared file roots. Enforce repository identity, normalized paths, and roots server-side on every read. A prompt restriction alone is insufficient. Reuse existing readers; extend their authorization boundary if needed rather than creating a parallel content store.

The agent must discover sibling media, read the selected post, and pass validated repository paths to the existing upload flow. Do not add unrestricted shell, arbitrary URL reads, repository writes, secrets, or background dispatch to browser mode. Missing files and denied paths must produce clear errors.

### Action result

At the existing acknowledgement boundary, provide the agent with a consistent result: action identity, success/failure, actual URL, fresh page observation, and a concrete error if present. Reuse existing IDs and snapshot structures wherever possible. Distinguish an accepted directive from an executed browser action.

### Continuation

Continue only after the matching action result arrives. Retain the selected capability and original task across route changes. Reject late results from an old session/view generation. On uncertain execution after disconnect, observe the page before repeating a potentially mutating action. Use existing execution bounds; repeated identical failures without new evidence must end with an actionable blocker, never an endless retry loop.

Completion requires observed task success. Login, CAPTCHA, denied permission, or unavailable page are blockers and must be reported honestly. Do not silently bypass them or claim a draft exists after navigation alone.

## Phase 4 — acceptance and release

Use the shared QA account loader and one-time credentials source. Keep credential source independent of the target repository. Dashboard login does not imply Facebook login: verify the correct user browser session separately. Never print tokens/passwords or include them in traces.

Required regression coverage:

- All six valid commands survive the actual schema conversion and validation path; invalid/missing fields fail without execution.
- Reads and uploads inside granted roots succeed; traversal, wrong repository, and ungranted roots/origins fail.
- Fresh action results reach the model, normal follow-ups retain context, repeated errors stop, and stale/replayed results do not duplicate actions.
- Header URL/history/bookmark switching remain synchronized; resize, reconnect, and iframe fallback retain existing behavior and accurately report unavailable capabilities.

Required end-to-end proof:

1. A controlled browser fixture exercises click, Hebrew fill, upload preview, scroll, navigation/history, and delayed results through the real selected model and real browser service. Assert visible outcomes and absence of unintended submissions. Do not intercept chat or browser requests.
2. Repeat affected journeys through the mounted local Dashboard, then the exact deployed candidate. Register the real-agent journey with the existing live gate so missing credentials/skipped tests cannot count as a pass.
3. In simulated-reality, start a fresh Kody conversation and ask naturally to prepare the selected Content Studio post in Facebook, with its image, stopping before Post. No manual content pasting, direct operator completion, or per-action coaching is allowed for a passing result.
4. Independently inspect the actual Facebook composer: readable Hebrew matches the source, the cover image is attached and finished loading, and nothing was published. Leave it open for the user. Stop for user login/CAPTCHA if required; report incomplete until resumed and verified.

Run repository-required verification and browser gates from the documented configuration. Preserve failure artifacts with secrets redacted. Report unrelated existing gate failures separately; never reinterpret a failed gate as a pass. If shared architecture changes expand the impact, follow the full live matrix requirement in the testing policy.

## Definition of done and handoff report

Report separately: diagnosis, code changes, regression tests, typecheck/lint/build, mocked browser proof, real local model journey, deployed candidate journey, and Facebook external result. Include exact version/commit, environment, model, target repository, and artifact locations. Mark failed, blocked, skipped, and not-run checks explicitly.

Commit/push, deployment, and external outcome are separate facts. A successful transport test or agent completion message cannot replace the visible Facebook draft. If the real journey fails, preserve evidence and fix the evidenced owner within scope; do not switch models or hand-finish the draft to manufacture a pass.
