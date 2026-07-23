# Kody model index

This directory is the required entry point before changing an AI Agency model.

The documents explain both:

- what each model means and should become;
- what the current product actually stores and runs.

Do not implement a model from its name or diagram alone.

## Required reading order

Before changing a model:

1. Read this index.
2. Read the model contract.
3. For implementation work, use its implementation guide Reading map.
4. Read relevant sections of directly related models.
5. Inspect the current sources named by the implementation guide.
6. Resolve or block on relevant Open questions.
7. Follow the implementation guide Agent rules.

Read both complete documents for cross-model architecture, storage migration,
Lifecycle, authority, or responsibility changes.

The high-level
[`company-model.md`](../company-model.md) explains the shared language and
relationships. A detailed model document owns the exact contract for its model.

## Source precedence

Different sources answer different questions. Do not use one source as authority
for a question it does not own.

| Question                                | Authority                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| What does the model mean?               | Reviewed or Canonical model document                                                               |
| What is the approved target contract?   | Canonical model document and accepted Decisions                                                    |
| What does the product currently accept? | Current validators and type contracts                                                              |
| What is currently persisted?            | Current persistence schema plus a checked stored record                                            |
| What happens at runtime?                | Current service, route, job, or Engine path plus a real execution                                  |
| What does the user see?                 | Current mounted Dashboard route plus browser verification                                          |
| Is a migration complete?                | No compatibility reader, writer, fallback, inference, or dual-write remains; required proof passes |

When sources disagree:

1. Do not silently choose one.
2. Record the disagreement in the model's **Gaps**.
3. For an explanation of current behavior, report the verified current behavior.
4. For implementation, follow the approved target only when the migration scope
   and acceptance proof are explicit.
5. If the disagreement changes ownership or public behavior, stop for a domain
   decision.

## Model documents

Create the semantic contract from [`TEMPLATE.md`](TEMPLATE.md) and current
implementation guide from
[`IMPLEMENTATION_TEMPLATE.md`](IMPLEMENTATION_TEMPLATE.md).

## Documentation roadmap

This is the complete documentation scope. Finish the core agency model and its
cross-model rules before expanding derived product surfaces.

### Core models

Every core model requires:

- `<model>.md` for meaning, ownership, contract, invariants, Lifecycle,
  relationships, human/AI authority, examples, and approved decisions.
- `<model>-implementation.md` for current storage, readers, writers, runtime,
  APIs, gaps, migration, Agent rules, verification, and sources.

| Order | Model          | Contract                                 | Implementation                                                 | Status                     |
| ----- | -------------- | ---------------------------------------- | -------------------------------------------------------------- | -------------------------- |
| 1     | Intent         | [`intent.md`](intent.md)                 | [`intent-implementation.md`](intent-implementation.md)         | Draft / Partially verified |
| 2     | Operation      | [`operation.md`](operation.md)           | [`operation-implementation.md`](operation-implementation.md)   | Draft / Partially verified |
| 3     | Goal           | [`goal.md`](goal.md)                     | [`goal-implementation.md`](goal-implementation.md)             | Draft / Partially verified |
| 4     | Loop           | [`loop.md`](loop.md)                     | [`loop-implementation.md`](loop-implementation.md)             | Draft / Partially verified |
| 5     | Workflow       | [`workflow.md`](workflow.md)             | [`workflow-implementation.md`](workflow-implementation.md)     | Draft / Partially verified |
| 6     | Capability     | [`capability.md`](capability.md)         | [`capability-implementation.md`](capability-implementation.md) | Draft / Partially verified |
| 7     | Implementation | [`implementation.md`](implementation.md) | [`implementation-guide.md`](implementation-guide.md)           | Draft / Partially verified |
| 8     | Agent          | [`agent.md`](agent.md)                   | [`agent-implementation.md`](agent-implementation.md)           | Draft / Partially verified |
| 9     | Run            | [`run.md`](run.md)                       | [`run-implementation.md`](run-implementation.md)               | Draft / Partially verified |

### Shared value contracts

Use one semantic Markdown document for each Value unless its runtime behavior
requires a separate implementation guide.

Values must not be promoted to independent entities unless identity, ownership,
and Lifecycle are explicitly approved.

| Order | Contract                                                     | Purpose                                                   | Status                     |
| ----- | ------------------------------------------------------------ | --------------------------------------------------------- | -------------------------- |
| 10    | [Objective](objective.md)                                    | Desired state, required Evidence, and Scope               | Draft                      |
| 11    | [Trigger](trigger.md)                                        | Activation type and configuration                         | Draft                      |
| 12    | [Policy](policy.md)                                          | Reusable governance package                               | Draft                      |
| 13    | [Intent Controls](intent-controls.md)                        | Intent-specific hard limits that only tighten Policy      | Draft; merge rule approved |
| 14    | [Constraint](constraint.md)                                  | Reusable deny or approval rule where still needed         | Draft                      |
| 15    | [Scope](scope.md)                                            | Included and excluded dimensions                          | Draft                      |
| 16    | [Definition Reference and Revision](definition-reference.md) | Domain identity, immutable envelope revision, and pinning | Draft                      |
| 17    | [Fact, Evidence, and Artifact](run-outputs.md)               | Typed Run outputs and provenance                          | Draft                      |

### Cross-model rules

These documents define behavior no single model may own.

| Order | Document                                                   | Required decision                                                          | Status                        |
| ----- | ---------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| 18    | Model index and reading rules                              | Source precedence and loading behavior                                     | This document                 |
| 19    | [Relationship and ownership map](relationships.md)         | Every ownership/dependency edge and cardinality                            | Draft                         |
| 20    | [Definition, State, and History](data-families.md)         | Data-family boundaries and allowed references                              | Draft                         |
| 21    | [Policy and Controls resolution](policy-resolution.md)     | Policy composition, tightening, multi-Intent merge, conflict handling      | Draft; merge rule approved    |
| 22    | [Lifecycle and deletion](lifecycle-deletion.md)            | Shared statuses, model-specific transitions, restore, reference protection | Draft                         |
| 23    | [Definition versioning](definition-versioning.md)          | Immutable revisions, current-head selection, concurrency                   | Draft                         |
| 24    | [Dispatch and approval](dispatch-approval.md)              | Policy resolution, approvals, idempotency, capacity, execution boundary    | Draft                         |
| 25    | [Run tracing and provenance](run-tracing.md)               | Correlation, pinned Definitions, events, outputs                           | Draft                         |
| 26    | [Storage authority and tenant Scope](storage-authority.md) | Convex, repository, Store, portability, projections                        | Draft; runtime rule canonical |
| 27    | [Migration and compatibility removal](migration.md)        | Legacy inventory, phases, removal proof                                    | Draft                         |
| 28    | [Human and AI authority](human-ai-authority.md)            | Proposal, approval, mutation, escalation, forbidden autonomy               | Draft                         |

### Derived and product surfaces

Document these after the core model and required cross-model rules are stable.
They are projections, reasoning inputs, or operator surfaces, not automatic new
agency entities.

| Order | Surface                                                      | Required boundary                               | Status                            |
| ----- | ------------------------------------------------------------ | ----------------------------------------------- | --------------------------------- |
| 29    | [Knowledge Graph](knowledge-graph.md)                        | Derived projection; never source of truth       | Draft; implementation in progress |
| 30    | [Context](context.md)                                        | Background Facts used for reasoning             | Draft                             |
| 31    | [Instructions](instructions.md)                              | Chat and response behavior                      | Draft                             |
| 32    | [Reports](reports.md)                                        | Produced summaries and retained outputs         | Draft                             |
| 33    | [Dashboard projections and health](dashboard-projections.md) | Derived display/edit shapes and health formulas | Draft                             |

### Recommended sequence

1. Finish Intent's remaining model decisions.
2. Document Operation because it establishes the ownership boundary for Goal
   and Loop.
3. Document Policy, Intent Controls, Scope, and relationship resolution needed
   by Intent and Operation.
4. Document Goal and Loop together with Objective and Trigger.
5. Document Workflow, Capability, Implementation, and Agent.
6. Document Run, outputs, dispatch, tracing, and approval.
7. Lock storage authority, versioning, Lifecycle, migration, and human/AI
   authority.
8. Document derived product surfaces.

## Cross-model rules

These rules apply to every model:

1. Definition, Runtime state, and History are different data families.
2. Every mutable field has exactly one runtime authority.
3. Every relationship states whether it is ownership or dependency.
4. Shared definitions are referenced, not copied into owners.
5. A Run records the exact definitions used when reproducibility matters.
6. Derived graphs, caches, manifests, and UI projections are never source of
   truth.
7. Runtime state is Convex-owned and must not fall back to GitHub.
8. A compatibility path is migration debt, not a second valid model.
9. A new model requires a responsibility that no existing model can own.
10. Unknown model decisions remain visible and block dependent implementation.

## Documentation status

Model contract:

- **Draft**: meaning or decisions remain open.
- **Reviewed**: owners reviewed the proposed meaning and boundaries.
- **Canonical**: responsibility, contract, invariants, Lifecycle, relationships,
  and authority are approved.

Implementation guide:

- **Unverified**: current behavior is not sufficiently checked.
- **Partially verified**: named paths are checked; required proof remains.
- **Verified current**: current readers, writers, storage, runtime, and relevant
  user path are checked.

An agent may investigate Draft or unverified documents. It must not treat a
Draft target as authorization to migrate product behavior.

## Completion standard

A model contract is ready to guide implementation when:

- its document has no unresolved blocking questions;
- Definition, State, History, and value contracts are separated;
- every field and relationship has an owner;
- the required owners mark the document Canonical.

An implementation guide is Verified current only when:

- current readers, writers, storage, and one real runtime path are verified;
- current behavior and target behavior are clearly distinguished;
- migration steps name compatibility removal;
- validators and architecture tests enforce important implemented boundaries;
- user-facing behavior has browser proof when applicable.

Documentation guides implementation. Schemas, validators, architecture tests,
and real-path verification enforce it.

## Full review result

All documents in this roadmap have now received a consistency review. The
contracts remain **Draft** where business decisions are still open, and the
implementation guides remain **Partially verified** where static source
inspection has not been followed by real persistence/runtime/browser proof.

The highest-priority system gaps found across the set are:

1. Goal and Loop manual execution can dispatch GitHub Actions before the
   documented Run-first boundary is proven.
2. Definition revisions currently have competing head-selection approaches.
3. Legacy combined product shapes remain beside clean agency Definitions and
   State.
4. Policy, approval, Scope, capacity, and idempotency are not yet proven through
   one shared dispatch service.
5. Dashboard health and extra status labels need centralized formulas and
   mappings.

Do not add more model types to solve these gaps. Fix the shared execution,
versioning, and migration boundaries first.
