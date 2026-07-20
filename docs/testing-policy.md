# Testing Policy

This is the required verification standard for every code or configuration
change in this repository.

## Rules

1. Define the changed behavior and its risk before editing.
2. Test at the same boundary where the failure can occur:
   - pure logic with unit tests;
   - APIs and persistence with integration tests;
   - user-facing behavior with browser tests.
3. Browser tests must fail on uncaught page errors, console errors, failed
   requests, unexpected navigation, and stuck loading states.
4. Tests must assert user-visible outcomes, not only function calls or DOM
   structure.
5. Every discovered bug becomes a regression test that reproduces the bug.
6. Run verification against the final diff. Any edit after verification
   requires verification again.
7. A change is not verified by unit tests alone when it affects a user-facing
   surface.
8. A mocked browser test proves UI behavior against a contract; it does not
   prove the real feature works.
9. A live UI test must use the real mounted application, real application
   routes, real persistence, and the real external service required by the
   feature. Intercepting the feature's request with `page.route()` disqualifies
   that journey as live proof.
10. Critical user-facing changes require both the mocked browser gate and the
    affected live UI journeys.
11. A skipped live journey is not a pass. If credentials, capacity, or a test
    environment are unavailable, the affected change remains unverified and
    must not be reported as complete.
12. Architecture migrations that can affect multiple features must run the
    full live UI matrix before the migration, after every completed phase, and
    against the final deployed candidate.

See [`live-ui-testing.md`](live-ui-testing.md) for the required distinction
between browser contract tests, live local journeys, and deployed live proof.

## Required local checks

Run the root verification command for every change:

```bash
pnpm verify
```

For dashboard UI or repository-scoped behavior, also run the canonical local
browser gate:

```bash
pnpm --filter kody-dashboard test:e2e:gate
```

Use the canonical dashboard URL shape:
`http://localhost:3333/repo/<owner>/<repo>/...`.

The canonical browser gate is necessary but not sufficient for critical
user-facing work because several specs intentionally mock their APIs.

For critical UI work, also run the affected journeys through the live UI gate:

```bash
pnpm --filter kody-dashboard test:e2e:live:gate
```

This command is a required repository capability. Until it is implemented and
green, critical UI or architecture-migration work cannot be called fully
verified.

Before a production release, run the same live matrix against the deployed
candidate by setting its `BASE_URL`. Destructive journeys must use dedicated
test repositories, tenants, accounts, and cleanup.

## Completion report

Do not report a change as verified until the applicable checks are named and
their results are known:

```text
Typecheck: passed
Lint: passed
Unit/integration tests: passed
Browser journey: passed (when UI changed)
Live UI journey: passed (when critical UI or a real integration changed)
Deployed live UI: passed (before production completion)
Production build: passed
```

If a required check cannot run, report it as unverified and explain why.
