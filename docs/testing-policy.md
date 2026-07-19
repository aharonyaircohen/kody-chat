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

## Completion report

Do not report a change as verified until the applicable checks are named and
their results are known:

```text
Typecheck: passed
Lint: passed
Unit/integration tests: passed
Browser journey: passed (when UI changed)
Production build: passed
```

If a required check cannot run, report it as unverified and explain why.
