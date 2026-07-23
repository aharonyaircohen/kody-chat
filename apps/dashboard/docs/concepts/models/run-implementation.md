# Run implementation guide

Status: **Partially verified**

## Current sources

| Concern | Source |
| --- | --- |
| Domain Run and output validators | `packages/agency-domain/src/index.ts` |
| Agency Run service/store | `packages/agency/src/agency-runs.ts`, `packages/agency/src/backend/agency-runs-store.ts` |
| Convex workflow Runs | `packages/kody-backend/convex/workflowRuns.ts` |
| Dashboard API/UI | agency-run routes, hooks, and components under `apps/dashboard` |

Current summaries include additional operator states such as waiting, blocked,
stuck, and recorded. They require an explicit projection mapping before the
domain lifecycle can be called settled.

## Target runtime

In one idempotent dispatch boundary: resolve definitions, Policy, Controls,
Scope, approval, capacity, and Implementation; create the Run with pinned
trace; append ordered events; persist typed outputs; finalize terminal status
and usage once.

Convex is the authority for active and historical Run state. GitHub must never
be a Run fallback, bootstrap, or dual-write target.

## Agent rules

- Never create a Run without pinned origin, target, trace, and effective Policy.
- Preserve correlation and parent-child links.
- Never mutate terminal records or overwrite outputs.
- Do not equate Workflow completion with Goal completion.
- Make retries separate attempts with explicit lineage.

## Verification

Exercise idempotent dispatch, approval, capacity, parent/child creation, event
ordering, outputs, cancellation, retry, terminal immutability, restart, and
mounted Dashboard rendering against real Convex data.

## Gaps

Current status mapping, event ordering, output persistence, and one complete
real execution have not been verified end to end.

