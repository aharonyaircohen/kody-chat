# Goal implementation guide

Status: **Partially verified**

## Target

Store immutable Goal definitions and mutable Goal State separately. Dispatch
the referenced Workflow or Capability and evaluate outputs against Objective
Evidence.

## Current sources

| Concern | Source |
| --- | --- |
| Contract and validation | `packages/agency-domain/src/index.ts` |
| Managed compatibility shape | `packages/agency/src/managed-goals.ts` |
| Definition storage | `packages/kody-backend/convex/definitions.ts` |
| Run storage | `packages/kody-backend/convex/workflowRuns.ts`, `packages/agency/src/backend/agency-runs-store.ts` |
| Dashboard API/UI | agency model and managed-goal routes/hooks under `apps/dashboard` |

`managed-goals.ts` combines fields needed by older product paths. It must not
define the target domain contract by inference.

## Runtime path

A dispatcher resolves Goal revision, owning Operation, contributing Intents,
effective Policy, and the execution reference. It creates a parent Run and
dispatches Workflow or Capability execution. Outputs update projections only
through an explicit Goal evaluation step.

## Migration and agent rules

- Backfill Objective, ownership, execution reference, and separate State.
- Preserve stable Goal identity while revisions change.
- Never mark a Goal complete solely from Run status.
- Never put schedule fields on Goal.
- Remove combined-record inference and dual-write before declaring migration
  complete.

## Verification

Check validator rejection, referential integrity, pinned revisions, real
dispatch, Evidence evaluation, State persistence, browser display, and legacy
reader/writer removal.

## Gaps

The completion evaluator, mounted dispatch route, current stored shape, and
reopen behavior remain unverified.

