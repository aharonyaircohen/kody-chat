# Loop implementation guide

Status: **Partially verified**

## Target runtime

The scheduler/event adapter evaluates Trigger eligibility. The dispatcher
atomically applies overlap and missed policies, resolves effective Policy and
pinned target revisions, then creates a Run. A reconciliation service updates
Loop State from terminal outcomes.

## Current sources

| Concern | Source |
| --- | --- |
| Contract, Trigger, State | `packages/agency-domain/src/index.ts` |
| Agency model persistence | `packages/agency/src/backend/agency-model-store.ts` |
| Legacy embedded loops | `packages/agency/src/operations.ts` |
| Runs | `packages/agency/src/agency-runs.ts`, `packages/kody-backend/convex/workflowRuns.ts` |
| Dashboard | agency model routes/hooks under `apps/dashboard` |

## Required boundaries

Trigger adapters detect activation; they do not own Loop definitions. The
dispatcher owns idempotent Run creation. Convex owns mutable eligibility,
lease, failure, and health state. Repository files must never be runtime-state
fallbacks.

## Migration and agent rules

- Separate embedded Loop definitions, State, and historical executions.
- Use stable activation/idempotency keys for a firing.
- Do not implement cadence on Intent or Workflow.
- Do not compute health differently in each UI consumer.
- Remove every legacy runtime reader/writer before completion.

## Verification

Exercise manual, schedule, event/webhook, overlap, missed firing, retry,
timeout, pause, restart, and duplicate delivery paths against real persistence.
Verify the Dashboard from the mounted route.

## Gaps

Scheduler ownership, leases, idempotency key format, and current live paths
remain to be verified.

