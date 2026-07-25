# Workflow implementation guide

Status: **Partially verified**

## Current sources

| Concern                 | Source                                                                          |
| ----------------------- | ------------------------------------------------------------------------------- |
| Clean contract          | `packages/agency-domain/src/index.ts`                                           |
| Workflow files/services | `packages/agency/src/workflows.ts` and workflow modules                         |
| API                     | workflow routes under `packages/agency/src/routes` and `apps/dashboard/app/api` |
| Runtime records         | `packages/kody-backend/convex/workflowRuns.ts`                                  |
| Dashboard editor        | workflow components and hooks under `apps/dashboard`                            |

The clean domain shape uses `steps`, `dependsOn`, and Capability references.
Current product shapes also use capability arrays, `startAt`, explicit next
transitions, and approval flags. This mismatch is unresolved.

The current managed Goal/Loop hook can generate a linear Workflow from a legacy
route. The Dashboard editor also exposes a richer graph shape. These
conversions must be treated as adapters until one canonical representation is
approved.

## Target runtime

Validate and pin the Workflow revision, topologically select eligible steps,
resolve a compatible Implementation for each Capability, apply approval and
Policy gates, and create linked child Runs. Persist events and outputs outside
the definition.

## Required storage split

| Data                                  | Authority                          |
| ------------------------------------- | ---------------------------------- |
| Workflow and step graph               | immutable agency Definition        |
| Active cursor/eligible steps          | Run State                          |
| Step attempts and outputs             | child Runs and append-only History |
| Editor positions and collapsed groups | UI projection                      |
| Schedule                              | Loop Trigger                       |

## Migration

Inventory every workflow shape, choose the canonical dependency graph, define
lossless adapters, backfill revisions, move runtime State out of definitions,
switch editors and dispatchers, then remove conversion fallbacks and dual-write.

## Agent rules

- Do not bind steps directly to Agent or script definitions.
- Do not add cadence to Workflow.
- Do not treat editor projection fields as canonical without a decision.
- Do not mutate an in-flight Workflow revision.
- Preserve correlation, parent Run, and pinned revision links.
- Never infer execution order from array position when dependencies exist.
- Validate bindings before external work.
- Keep editor-only layout outside the semantic Definition.

## Verification and migration

Choose one canonical graph contract; migrate readers/writers; reject cycles,
missing dependencies, bad bindings, and incompatible Capability revisions;
exercise branching, retries, approval, cancellation, resume, and real
Dashboard editing. Remove fallback and inferred conversion paths.

## Gaps

The current runtime graph evaluator and mounted editor-to-execution path have
not been fully traced.

Recommended next change: lock one graph contract and add round-trip tests before
adding more editor or runtime features.
