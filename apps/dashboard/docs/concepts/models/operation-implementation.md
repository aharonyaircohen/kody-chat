# Operation implementation guide

Status: **Partially verified**

## Target

Persist immutable Operation definition revisions separately from mutable
Operation State. Resolve owned Goals and Loops by their `operationId`; never
store authoritative embedded copies.

## Current sources

| Concern                   | Source                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| Domain type and validator | `packages/agency-domain/src/index.ts`                                                                     |
| Clean model API client    | `apps/dashboard/src/dashboard/lib/api/agency-model.ts`                                                    |
| Current Operations hook   | `apps/dashboard/src/dashboard/lib/hooks/useOperations.ts`                                                 |
| Product projection        | `apps/dashboard/src/dashboard/lib/agency-product-projections.ts`                                          |
| Atomic change route       | `packages/agency/src/routes/agency-model-changes.ts`                                                      |
| Clean model store         | `packages/agency/src/backend/agency-model-store.ts`                                                       |
| Legacy combined contract  | `packages/agency/src/operations.ts`                                                                       |
| Legacy routes             | `apps/dashboard/app/api/kody/operations/route.ts`, `apps/dashboard/app/api/kody/operations/[id]/route.ts` |
| Legacy Convex adapter     | `apps/dashboard/src/dashboard/lib/operation-files.ts`                                                     |
| Persistence               | Convex agency definition/state tables; legacy `repoDocs` records                                          |

The domain package validates the clean five-field Definition and separate
State. The mounted Operations hook reads `agency-definitions` and
`agency-states`, projects child ownership from `Goal.operationId` and
`Loop.operationId`, and writes related changes through
`agency-model-changes`.

The older `/api/kody/operations` routes still validate a combined record with
embedded Goal/Loop IDs, lifecycle-like status, timestamps, and `version: 1`.
Those routes now store that record in Convex `repoDocs`; despite file-shaped
names and unused Octokit parameters, they do not currently write GitHub.

The two shapes are not equivalent authorities. The clean agency model is the
current Dashboard path; the combined `repoDocs` path is compatibility debt.

## Current clean write path

1. `useCreateOperation` or `useUpdateOperation` builds the clean Definition.
2. `ownedWorkRevisions` changes selected Goal/Loop `operationId` values.
3. The hook creates a separate Operation State.
4. `agencyModelApi.applyChange` posts all related definitions and State.
5. `agency-model-changes` validates every item with domain validators.
6. `applyStoredAgencyModelChange` sends one Convex mutation.
7. Reads project the combined UI record from current Definitions and State.

This is the correct ownership direction. The UI still presents `goals` and
`loops`, but they are derived arrays.

## Current read projection

`projectOperations`:

- hides archived Operations;
- maps State Lifecycle to the older UI status vocabulary;
- finds owned Goals and Loops through child `operationId`;
- reports missing Intents;
- reports an activation issue when no Goal or Loop is owned;
- derives timestamps from the definition envelope or State.

These fields are product projections. Agents must not write the projected
record back as a semantic Definition.

## Current legacy path

The legacy contract uses:

```ts
interface Operation {
  version: 1;
  id: string;
  name: string;
  responsibility: string;
  doesNotOwn: string[];
  intentIds: string[];
  goals: string[];
  loops: string[];
  status: "proposed" | "provisioning" | "active" | "paused" | "retired";
  createdAt: string;
  updatedAt: string;
}
```

Its list/detail routes require repository authentication and a user GitHub
token even though persistence is Convex. It performs ownership checks by
scanning embedded arrays. Deletion blocks only active Operations and then
removes the combined record; it does not enforce the clean model's incoming
child references.

Do not extend this route or record unless the change is specifically required
to remove it.

## Readers, writers, and runtime

Operation itself has no runtime executor in the clean contract. Dashboard
routes named `/operations/[id]/run` must be treated as product/service
orchestration and reviewed against Goal/Loop dispatch rules; they are not proof
that Operation owns execution.

## Storage ownership

| Data                        | Current authority                   | Target                           |
| --------------------------- | ----------------------------------- | -------------------------------- |
| Clean Definition revisions  | Convex agency definitions           | keep; consolidate head selection |
| Operation State             | Convex agency states                | keep                             |
| Owned Goal/Loop lists       | derived from child definitions      | keep derived                     |
| Legacy combined record      | Convex `repoDocs`, `operation:<id>` | remove                           |
| UI status/timestamps/issues | projection                          | keep derived                     |
| Runs and outputs            | Convex Run/History stores           | never embed                      |

No Operation runtime State should read from or fall back to GitHub.

## Required migration

1. Prove all mounted Operation UI paths use the clean hook/API.
2. Inventory callers of `/api/kody/operations`, `operation-files.ts`, and the
   combined `Operation` type.
3. Reconcile every `repoDocs operation:*` record with clean Definitions and
   State.
4. Backfill missing child `operationId` references with conflict reporting.
5. Switch remaining readers and writers to agency definitions/states.
6. Reject embedded Goal/Loop ownership writes.
7. Remove the old routes, adapter, contract, tests, inference, and dead auth
   requirements.
8. Verify no `operation:*` records are still read or written.

## Agent rules

- Do not add execution fields to Operation.
- Do not infer canonical ownership from an embedded legacy array.
- Treat `OperationRecord.operation.goals`, `.loops`, `.status`, and timestamps
  as UI projection fields.
- Change ownership through Goal/Loop revisions, not Operation Definition.
- Use one atomic model change for Operation and child ownership updates.
- Reject an ownership move when a selected child is already changed by a newer
  revision; do not silently overwrite it.
- Do not call migration complete while `operations.ts` remains a reader,
  writer, fallback, or bootstrap source.
- Check deletion references before retirement or archive changes.
- Do not add more behavior to the legacy API merely because its route exists.

## API expectations

Target commands should return clear `400` validation, `401` authentication,
`403` authorization, `404` missing model, and `409` conflict responses.
Create/update must verify tenant Scope and write access server-side. Client
tenant or actor fields are not sufficient authority.

Definition edits should carry an expected current revision to prevent lost
updates. The current clean change payload does not expose that concurrency
token, so concurrent editing remains a gap.

## Verification

- Validator accepts only the documented shape.
- Definition revisions and State mutate independently.
- Goal/Loop ownership joins produce the Dashboard view.
- Create, edit, lifecycle change, and ownership move persist in Convex through
  the mounted Operations page.
- Concurrent ownership edits fail safely.
- Paused/retired/archive behavior matches the approved lifecycle.
- Deletion refuses incoming Goal/Loop references and preserves History.
- The Operation run surface dispatches only documented child work.
- Legacy compatibility inventory reaches zero before completion.

### Existing automated evidence

- `packages/agency/tests/operations.spec.ts` covers the combined legacy
  contract.
- `apps/dashboard/tests/unit/operations-api.spec.ts` covers legacy routes.
- `apps/dashboard/tests/e2e/operations-model.spec.ts` covers the Operations
  model surface with mocked APIs.
- Agency domain tests cover the clean validators.

These tests do not by themselves prove the mounted page against real Convex
records.

## Gaps

Static inspection confirms the current hook uses the clean agency model and the
legacy routes use `repoDocs`. The following remain unverified:

- actual stored records and reconciliation counts;
- the real mounted browser path against real Convex;
- concurrent Definition edits;
- `/operations/[id]/run` semantics;
- reference-safe deletion;
- complete legacy caller inventory;
- definition head-selection behavior.

## Recommended next change

Do not redesign Operation again. First run the real Operations browser path and
inventory old-route callers. If nothing mounted depends on the legacy path,
remove it through a measured migration rather than maintaining two contracts.
