# Production browser gate isolation

## Change

Local production checks now start their own Next.js production server on
`127.0.0.1:3344` and refuse to reuse an occupied port. Development checks stay
on `3333`. The existing Playwright configuration owns both its base URL and
the `BASE_URL` read directly by journeys. Deployed checks keep their supplied
candidate URL and start no local server when `PW_LOCAL` is not `1`.

No new server manager, test framework, or product behavior was added. The
test-first skill led to three failing configuration regressions before the
fix, followed by coverage of production, development, deployed, and CI modes.

The isolated build exposed an intermittent Views test failure: after saving,
the test hovered over a success notification while trying to click a covered
toolbar control. Sonner pauses notification expiry on hover. The journey now
asserts the save notification, closes it through its existing accessible
button, and then uses the toolbar. No force-click, timeout increase, ignored
error, or product UI change was used.

## Verification

- Regression tests: 6 passed (5 isolation tests plus CI-policy regression).
- Configuration coverage: 100% statements, branches, functions, and lines.
- Root `pnpm verify`: passed, including typecheck, lint, tests, and production
  build. Existing lint and dynamic-file tracing warnings remain.
- Final focused typecheck/lint/formatting: passed.
- Live local isolation: passed. A temporary HTTP server occupied port `3344`;
  Playwright exited with `already used` instead of accepting it. During the
  actual gate, process inspection confirmed `next start --hostname 127.0.0.1
  --port 3344`, while the original development process remained on `3333`.
- Initial production browser gate: 139 passed, 1 failed on the overlapping
  notification. A diagnostic two-repeat run produced one failure and one pass.
- Fixed Views journey: 3 consecutive passes on a newly started production
  server, retaining all preview interaction assertions.
- Final complete browser rerun: 140 passed in 3.5 minutes against the isolated
  production server, including the fixed Views journey.
- Deployed live test: not run. Production has not been verified by this task.

The browser gate includes mocked network boundaries; it is not certification
of every live external integration. The application build was unchanged when
rerunning the browser portion after the test-only notification fix.

## Deployment blocker

The Vercel CLI is authenticated and the saved root/app project mappings agree.
Production environment metadata lists `CONVEX_URL` and `KODY_SERVICE_KEY`,
but a production environment export returned blank values for both. The
temporary export was removed without displaying values.

The local release runner also lacks `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID`, and `KODY_MCP_TEST_CONVEX_URL` in its configured environment.
The project IDs can be recovered from the existing project mapping; CLI login
alone does not satisfy the current runner's required token variable. No local
backend URL or service key was substituted for unverified production values.
This task did not stage or promote a candidate or bypass deployment gates.

## Artifacts

- Initial failure: `apps/dashboard/test-results/` at the time of the initial
  gate (later runs may replace this standard directory).
- Reproduction: `/tmp/kody-isolated-view-recheck-20260905/`.
- Successful three-repeat run: `/tmp/kody-isolated-view-fixed-20260905/`.
