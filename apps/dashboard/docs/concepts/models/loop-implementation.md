# Loop implementation guide

Status: **Partially verified**

## Target runtime

The scheduler/event adapter evaluates Trigger eligibility. The dispatcher
atomically applies overlap and missed policies, resolves effective Policy and
pinned target revisions, then creates a Run. A reconciliation service updates
Loop State from terminal outcomes.

## Current sources

| Concern                  | Source                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Contract, Trigger, State | `packages/agency-domain/src/index.ts`                                                |
| Current Goal/Loop hook   | `apps/dashboard/src/dashboard/lib/hooks/useManagedGoals.ts`                          |
| Product projection       | `apps/dashboard/src/dashboard/lib/agency-product-projections.ts`                     |
| Compatibility model      | `packages/agency/src/managed-goals.ts`                                               |
| Clean model store        | `packages/agency/src/backend/agency-model-store.ts`                                  |
| Manual Loop dispatch     | `apps/dashboard/app/api/kody/agency-loops/[id]/run/route.ts`                         |
| Runs                     | `packages/agency/src/agency-runs.ts`, `packages/kody-backend/convex/workflowRuns.ts` |

The current Loop page uses clean Loop Definitions and State, projected into a
managed-goal compatibility view. Create/update writes an optional Workflow,
Loop Definition, and Loop State together.

New Loops currently default to `overlap: skip`, `missed: coalesce`, three
attempts, 30-second backoff, and 900-second timeout. Those defaults are product
choices, not yet approved universal domain defaults.

## Current projection

The UI projection maps:

- Objective to `destination`;
- Trigger schedule to `schedule` and `preferredRunTime`;
- target to `loopTarget` and optional `workflowRef`;
- State to health, failures, last-fired, next-eligible, and old lifecycle
  labels;
- Workflow steps to route/capability lists.

The large managed-goal `scheduleState`, stage, facts, instances, and decisions
are compatibility/projection fields. They are not the Loop Definition.

## Required boundaries

Trigger adapters detect activation; they do not own Loop definitions. The
dispatcher owns idempotent Run creation. Convex owns mutable eligibility,
lease, failure, and health state. Repository files must never be runtime-state
fallbacks.

The current manual Loop route verifies the clean Definition and active State,
then dispatches GitHub Actions `kody.yml` with `action:
"dispatch-due-loops"`. It returns `202`, but it does not create the documented
Run, activation key, effective Policy snapshot, or capacity reservation first.
The route therefore starts a broad due-loop dispatcher rather than directly
executing the pinned target itself.

## Storage ownership

| Data                                     | Authority                                   |
| ---------------------------------------- | ------------------------------------------- |
| Loop Definition                          | Convex agency definitions                   |
| Lifecycle, health, failures, eligibility | Convex agency State                         |
| Activation/idempotency/lease             | Convex runtime State; target schema missing |
| Runs, events, outputs                    | Convex History                              |
| Managed Loop view                        | derived Dashboard projection                |
| GitHub Actions                           | execution adapter only                      |

## Migration

1. Inventory old managed-goal scheduling readers and writers.
2. Separate Definition, runtime State, History, and projection fields.
3. Add an authoritative activation record or idempotency boundary.
4. Resolve/pin Policy and definitions and create Run before adapter dispatch.
5. Reconcile terminal Runs into one shared health calculation.
6. Switch schedule workers and manual run to the same dispatcher.
7. Remove legacy schedule State, fallback, and inference.

## Agent rules

- Separate embedded Loop definitions, State, and historical executions.
- Use stable activation/idempotency keys for a firing.
- Do not implement cadence on Intent or Workflow.
- Do not compute health differently in each UI consumer.
- Treat managed-goal scheduling fields as compatibility projections.
- Do not dispatch all due Loops when the user requested one Loop unless the
  service contract explicitly filters and proves it.
- Create the Run and reserve capacity before external execution.
- Keep Trigger observation separate from authorization and dispatch.
- Preserve active Runs when pausing unless cancellation is separately approved.
- Reject concurrent Definition edits rather than overwrite them.
- Remove every legacy runtime reader/writer before completion.

## Verification

Exercise:

- manual, schedule, event, webhook, and condition triggers;
- duplicate delivery and activation idempotency;
- skip/queue overlap and skip/replay/coalesce missed behavior;
- retry, backoff, timeout, restart, and exhausted failure;
- pause with an active Run;
- Policy, approval, Scope, capacity, and pinned definitions;
- State reconciliation and shared health formula;
- real Convex persistence and mounted Dashboard behavior.

Mocked browser tests are useful UI evidence but do not prove scheduler,
idempotency, GitHub dispatch, or persisted State.

## Gaps

Static inspection confirms the clean page/store and the GitHub manual dispatch.
Scheduler ownership, activation records, leases, idempotency, Policy
resolution, health reconciliation, and current live execution remain
unverified.

## Recommended next change

Keep the clean Loop contract. Build one Run-first dispatcher used by manual and
scheduled activation. Do not add more scheduling behavior to the compatibility
managed-goal record.
