# Run implementation guide

Status: **Partially verified**

## Current sources

| Concern                          | Source                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| Domain Run and output validators | `packages/agency-domain/src/index.ts`                                                    |
| Agency Run service/store         | `packages/agency/src/agency-runs.ts`, `packages/agency/src/backend/agency-runs-store.ts` |
| Convex workflow Runs             | `packages/kody-backend/convex/workflowRuns.ts`                                           |
| Dashboard API/UI                 | agency-run routes, hooks, and components under `apps/dashboard`                          |

Current summaries include additional operator states such as waiting, blocked,
stuck, and recorded. They require an explicit projection mapping before the
domain lifecycle can be called settled.

Goal and Loop manual routes currently dispatch GitHub Actions before the
documented Run-first boundary is proven. This is the largest current gap:
external work can begin without the complete pinned trace and effective Policy
snapshot being created atomically.

## Target runtime

In one idempotent dispatch boundary: resolve definitions, Policy, Controls,
Scope, approval, capacity, and Implementation; create the Run with pinned
trace; append ordered events; persist typed outputs; finalize terminal status
and usage once.

Convex is the authority for active and historical Run state. GitHub must never
be a Run fallback, bootstrap, or dual-write target.

## Required storage split

| Data                          | Authority                                      |
| ----------------------------- | ---------------------------------------------- |
| Active Run and terminal Run   | Convex                                         |
| ordered events and approvals  | Convex append-only records                     |
| Facts, Evidence, Artifacts    | Convex metadata plus governed artifact storage |
| logs                          | diagnostic store, linked but non-authoritative |
| GitHub/Fly/provider execution | adapter, never Run authority                   |
| Dashboard statuses            | derived projection                             |

## Migration

Route every dispatch through one idempotent Run creator, pin definitions and
Policy, reserve capacity, invoke adapters, ingest events/outputs, reconcile
terminal State, then remove direct adapter dispatch and status inference.

## Agent rules

- Never create a Run without pinned origin, target, trace, and effective Policy.
- Preserve correlation and parent-child links.
- Never mutate terminal records or overwrite outputs.
- Do not equate Workflow completion with Goal completion.
- Make retries separate attempts with explicit lineage.
- Never use external workflow status as the only Run record.
- Redact secrets before event/output persistence.

## Verification

Exercise idempotent dispatch, approval, capacity, parent/child creation, event
ordering, outputs, cancellation, retry, terminal immutability, restart, and
mounted Dashboard rendering against real Convex data.

## Gaps

Current status mapping, event ordering, output persistence, and one complete
real execution have not been verified end to end.

Recommended next change: put Goal, Loop, Workflow, and Capability dispatch
behind one Run-first service before expanding status or UI features.
