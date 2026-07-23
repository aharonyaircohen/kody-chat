# Goal implementation guide

Status: **Partially verified**

## Target

Store immutable Goal definitions and mutable Goal State separately. Dispatch
the referenced Workflow or Capability and evaluate outputs against Objective
Evidence.

## Current sources

| Concern                 | Source                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Contract and validation | `packages/agency-domain/src/index.ts`                                                                       |
| Current Goal/Loop hook  | `apps/dashboard/src/dashboard/lib/hooks/useManagedGoals.ts`                                                 |
| Product projection      | `apps/dashboard/src/dashboard/lib/agency-product-projections.ts`                                            |
| Legacy product shape    | `packages/agency/src/managed-goals.ts`                                                                      |
| Clean model API/store   | `apps/dashboard/src/dashboard/lib/api/agency-model.ts`, `packages/agency/src/backend/agency-model-store.ts` |
| Manual Goal dispatch    | `apps/dashboard/app/api/kody/goals/managed/[id]/run/route.ts`                                               |
| Run storage             | `packages/kody-backend/convex/workflowRuns.ts`, `packages/agency/src/backend/agency-runs-store.ts`          |

The current Goal and Loop pages read clean agency Definitions, State, and
observations, then project them into the older `ManagedGoalRecord` shape.
Create/update writes clean Goal, optional Workflow, and State records together
through `agency-model-changes`.

`managed-goals.ts` still defines the large compatibility/product shape with
destination, route, capabilities, schedule, stage, facts, blockers, templates,
instances, reports, and approval flags. Those fields span Definition, State,
History, Workflow, Loop, and UI projection. They must not define Goal by
inference.

## Current clean write path

1. `saveNewManagedGoal` requires `operationId`.
2. It creates a Workflow when multiple route steps are supplied.
3. It creates one Goal Definition and active Goal State.
4. `agencyModelApi.applyChange` sends related records in one change.
5. Domain validators reject unknown fields and invalid references shapes.
6. Reads rebuild the managed Goal view from definitions, State, and outputs.

Updates preserve current progress/blockers, create a new Definition record, and
update State. Delete currently means two State transitions—retired then
archived—not physical deletion.

## Current projection

`projectManagedGoals` maps:

- Objective to `destination`;
- Workflow steps to legacy `route`;
- Capability dependencies to `capabilities`;
- Run Facts/Evidence to `facts`;
- Lifecycle to `inactive`, `active`, `paused`, or `done`;
- `operationId`, progress, and blockers into the UI shape.

These fields are a read model. Agents must not write the projected record as an
authoritative Goal.

## Runtime path

A dispatcher resolves Goal revision, owning Operation, contributing Intents,
effective Policy, and the execution reference. It creates a parent Run and
dispatches Workflow or Capability execution. Outputs update projections only
through an explicit Goal evaluation step.

The current manual route does not yet follow this complete target. It verifies
the clean Goal and active State, then dispatches GitHub Actions `kody.yml` with
`action: "goal-manager"`. It does not create the documented pinned Run and
effective Policy snapshot in the same boundary before dispatch.

## Storage ownership

| Data                                     | Authority                                          |
| ---------------------------------------- | -------------------------------------------------- |
| Goal Definition revisions                | Convex agency definitions                          |
| Goal Lifecycle/progress/blockers         | Convex agency State                                |
| Workflow definition                      | shared agency Definition                           |
| Runs, events, Facts, Evidence, Artifacts | Convex History stores                              |
| Managed Goal fields                      | derived Dashboard projection                       |
| GitHub Action                            | execution adapter only; never Goal State authority |

## Migration

1. Inventory remaining managed-goal readers/writers outside the clean hook.
2. Classify every compatibility field by owning model/family.
3. Reconcile stored managed records with clean Definitions and State.
4. Move manual dispatch behind the Run dispatcher.
5. Create the pinned Run before invoking GitHub Actions.
6. Move completion to an explicit Evidence evaluator.
7. Remove compatibility persistence, inference, fallback, and dual-write.

## Agent rules

- Backfill Objective, ownership, execution reference, and separate State.
- Preserve stable Goal identity while revisions change.
- Never mark a Goal complete solely from Run status.
- Never put schedule fields on Goal.
- Treat `ManagedGoalRecord` as a product projection.
- Do not create a private Workflow definition when an existing shared Workflow
  was selected.
- Do not overwrite concurrent Definition changes; require an expected revision.
- Do not dispatch directly to GitHub without first creating the authoritative
  Run and pinned trace.
- Do not treat optimistic UI deletion as proof that persisted archive succeeded.
- Remove combined-record inference and dual-write before declaring migration
  complete.

## Verification

Check:

- validator rejection and relationship integrity;
- atomic Goal/Workflow/State creation;
- ownership move and concurrent edit conflict;
- active/paused/retired/archive behavior;
- pinned Run creation before adapter dispatch;
- effective Policy and approval;
- Evidence evaluation and reopen;
- real Convex persistence and mounted browser display;
- compatibility reader/writer removal.

Current unit/domain tests cover mapping and validation. Browser tests with
mocked APIs do not prove the real Convex and GitHub dispatch path.

## Gaps

The current hook and manual route were statically inspected. Stored records,
real browser persistence, Run-first dispatch, completion evaluation, concurrent
editing, and reopen behavior remain unverified.

## Recommended next change

Keep the clean Goal contract. First change manual execution to create a pinned
Run before calling the GitHub adapter; then add one explicit completion
evaluator. Do not expand the compatibility shape.
