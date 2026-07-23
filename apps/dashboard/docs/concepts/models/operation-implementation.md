# Operation implementation guide

Status: **Partially verified**

## Target

Persist immutable Operation definition revisions separately from mutable
Operation State. Resolve owned Goals and Loops by their `operationId`; never
store authoritative embedded copies.

## Current sources

| Concern | Source |
| --- | --- |
| Domain type and validator | `packages/agency-domain/src/index.ts` |
| Clean model read/write | `packages/agency/src/agency-model-read.ts`, `packages/agency/src/backend/agency-model-store.ts` |
| Dashboard consumption | `apps/dashboard/lib/agency-model`, operation hooks and routes |
| Legacy combined model | `packages/agency/src/operations.ts` |
| Persistence schema | `packages/kody-backend/convex/definitions.ts` |

The domain package currently validates the clean five-field definition and
separate State. Legacy code still represents an Operation with embedded
Goals/Loops and runtime fields. That is compatibility debt.

## Readers, writers, and runtime

Definition routes and the agency model store read/write model records.
Dashboard projections join Operations to Goals and Loops. Runtime dispatch
should start from a Goal or Loop, not execute an Operation directly.

## Required migration

1. Inventory every legacy Operation reader and writer.
2. Backfill independent Operation, Goal, Loop, and State records.
3. Switch projections to relationship joins.
4. reject embedded Goal/Loop writes.
5. Remove legacy files, inference, fallback, and dual-write.

## Agent rules

- Do not add execution fields to Operation.
- Do not infer canonical ownership from an embedded legacy array.
- Do not call migration complete while `operations.ts` remains a reader,
  writer, fallback, or bootstrap source.
- Check deletion references before retirement or archive changes.

## Verification

- Validator accepts only the documented shape.
- Definition revisions and State mutate independently.
- Goal/Loop ownership joins produce the Dashboard view.
- A real create/edit/read path persists in Convex.
- Legacy compatibility inventory reaches zero before completion.

## Gaps

Current paths were statically inspected; stored records, mounted routes, and a
real browser path have not been verified for this guide.

