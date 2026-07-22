# AI Agency Model V2 Plan

## Implementation status

The approved graph-system pilot is complete in production. The shared domain
contracts, persistence adapters, dispatcher, runtime safeguards, Store-owned
graph workflow, Dashboard views, consumer migration, and golden end-to-end
journey are implemented and verified.

Event, webhook, and condition Triggers remain later rollout phases as stated in
Phase 4. They are not compatibility gaps in the schedule/manual pilot.

## Purpose

Fix the AI Agency model boundaries without replacing the working execution
engine.

## System map

```text
Purpose and ownership
Intent -> Operation -> Goal / Loop

Execution
Goal -> Workflow -> Capability
Loop -> Goal | Workflow | Capability
Any execution -> Run

Decision and control
Agent + Policy + Constraints + Scope

Knowledge
Run -> Facts + Evidence + Artifacts
Those outputs -> Knowledge Graph
```

The arrows show responsibility and data flow, not storage ownership. A Loop
wakes its target; it is not an execution step. A Run may record a Workflow or
Capability execution. Policy is inherited from Intent, and the Knowledge Graph
is always a derived view rather than a source of truth.

## Target model

| Part                 | Kind             | Owns                                                                          | Does not own                            |
| -------------------- | ---------------- | ----------------------------------------------------------------------------- | --------------------------------------- |
| Intent               | Definition       | Direction, policy, priorities                                                 | Goals, loops, execution                 |
| Operation            | Definition       | Responsibility and accountability                                             | Execution details                       |
| Objective            | Value object     | Desired state, evidence, scope                                                | Identity, storage, execution            |
| Trigger              | Value object     | Activation type and configuration                                             | Business purpose or target              |
| GoalDefinition       | Definition       | A finite Objective, execution reference, `operationId`                        | Progress, schedule, capability routes   |
| GoalState            | Runtime state    | Progress, blockers, lifecycle status                                          | Desired state or execution design       |
| LoopDefinition       | Definition       | A continuous Objective, Trigger, target, reconciliation policy, `operationId` | Runtime health or target implementation |
| LoopState            | Runtime state    | Health, firing position, failures                                             | Desired state or execution design       |
| WorkflowDefinition   | Definition       | Steps, conditions, retries, data flow                                         | Business ownership or schedule          |
| CapabilityDefinition | Definition       | One reusable executable action                                                | Workflows, goals, schedules             |
| AgentDefinition      | Definition       | Identity, judgment, permissions                                               | Business process or schedule            |
| Run                  | Execution record | One execution attempt and its outputs                                         | Durable business definitions            |

`Objective` and `Trigger` are typed value objects, not stored agency entities or
Dashboard pages. Goal and Loop remain separate public and persisted models.
The Trigger dispatcher and Loop controller are application services, not AI
Agency entities.

## Architecture rules

```text
Pure domain model
    <- application services
        <- persistence codecs and adapters
            <- Engine, Dashboard, Store, Convex, GitHub, and migration tools
```

- Domain contracts contain no UI, Engine, database, GitHub, Convex, or Store
  dependencies.
- Domain entities contain no schema version, storage path, content hash,
  migration flag, or transport metadata.
- Persistence envelopes own schema versions and immutable record references.
- Persistence codecs translate envelopes to and from the domain model.
- Migration helpers depend on codecs and adapters; the domain package never
  depends on migration code.
- Definitions are immutable and portable. Runtime State is mutable and
  repository-scoped. Storage format versions live only in adapter envelopes.
- Goal and Loop each form one aggregate boundary. Their Definition and State
  may be stored separately but are updated through one application service.
- Objective and Trigger have no independent identity or lifecycle.
- A Loop controller reads LoopDefinition, updates LoopState, and creates Runs.
- A Capability never owns scheduling or multi-step orchestration.
- Facts, Evidence, and Artifacts are typed outputs with source Run, producer,
  contract identity, and creation time.
- Lifecycle and reference rules are part of the domain contract, not a later
  cleanup.

## Phase 1: Lock the contracts

- Write exact domain contracts for the models, without persistence fields.
- Define Objective as the common contract implemented by Goal and Loop.
- Define Trigger as a typed part of Loop.
- Define GoalDefinition, GoalState, LoopDefinition, and LoopState separately.
- Define allowed relationships.
- Define what each model must never contain.
- Define pause, retire, archive, restore, deletion, and reference-protection
  rules.
- Define typed Policy, Scope, Facts, Evidence, and Artifact value contracts.
- Choose the home of the shared domain package and adapter codecs.
- Add architecture tests for these boundaries.

Deliverable: approved schemas and relationship rules.

## Phase 2: Shared domain package and adapter codecs

- Create one pure domain package used by Engine, Dashboard, Store validation,
  and backend application services.
- Put entities, value objects, invariants, and relationship validation there.
- Put persistence envelopes, serialization codecs, and migration helpers in
  adapter-owned modules outside the domain package.
- Keep legacy envelope readers temporarily in persistence adapters.
- Make new writes use the new envelope format.
- Remove duplicate Dashboard and Engine type definitions.

Do not introduce permanent dual-writing.

## Phase 3: Capability and Workflow boundary

- Prevent capabilities from embedding workflows or schedules.
- Remove capability roles that represent orchestration.
- Make workflows the only owner of steps, conditions, retries, and loops.
- Validate typed capability inputs and outputs.
- Migrate the graph system first:
  - reusable extraction capabilities;
  - one composition workflow;
  - one Knowledge System refresh loop.

Deliverable: the graph system proves that the new boundary works.

## Phase 4: Objective, Goal, Loop, and Trigger

Create two shared value contracts and two distinct aggregate models:

```text
Objective
- desired state
- required evidence
- scope
```

```text
Trigger
- manual | schedule | event | webhook | condition
- type-specific configuration
```

```text
GoalDefinition
- objective
- executionRef
- operationId

GoalState
- lifecycle
- progress
- blockers
```

```text
LoopDefinition
- objective
- trigger
- targetRef
- reconciliationPolicy
- operationId

LoopState
- lifecycle
- health
- lastFiredAt
- nextEligibleAt
- failures
```

Trigger supports these types in phases:

1. Schedule and manual.
2. Event and webhook.
3. Condition, after its safety and polling rules are defined.

All Trigger types use one dispatcher. Trigger remains a value inside
LoopDefinition. The dispatcher and Loop controller are runtime services, not
stored agency entities.

Then:

- Move route steps from Goal into Workflow.
- Move schedules into `Loop.trigger` and loop targets into Loop.
- Stop inferring whether a record is a Goal or Loop.
- Add explicit APIs and storage for each model.
- Replace schedule-specific dispatch paths with the shared Trigger dispatcher.
- Keep Definition writes separate from State transitions.
- Keep Goal and Loop as the public Dashboard concepts; do not add Objective or
  Trigger pages.

## Phase 5: Fix Intent and Operation ownership

- Remove Goal, Loop, and Capability portfolios from Intent.
- Keep Intent focused on direction and policy.
- Store `intentIds` on Operation.
- Store one `operationId` on each Goal and Loop.
- Derive an Operation's contents through queries.
- Reject missing or duplicate ownership.
- Derive Operation health from its Goals and Loops.

## Phase 6: Runtime integrity

### Separate Definition, State, and Run

- Store portable authoring contracts as immutable Definitions.
- Store current progress, health, and scheduler position as mutable State.
- Allow a Run to transition while active, freeze it when terminal, and keep Run
  events and outputs append-only.
- Prevent templates, current state, and run history from sharing one record.

### Trigger reliability

- Give every Trigger firing a stable idempotency key.
- Prevent overlapping execution with leases or locks.
- Define retry, backoff, timeout, and dead-letter behavior.
- Define how missed schedules are skipped, replayed, or coalesced.
- Record the Trigger decision even when no Run starts.

### Policy enforcement

- Resolve inherited Intent policy before dispatch.
- Enforce approvals, authority, budgets, concurrency, and risky-action limits at
  one dispatch boundary.
- Record an immutable snapshot or hash of the effective policy on every Run.
- Reject execution when policy or ownership cannot be resolved.

### Immutable references

- Give every stored Definition an immutable reference or content hash outside
  the domain object.
- Let active work pin that exact reference where reproducibility matters.
- Create a new immutable Definition when authored content changes; never mutate
  the Definition used by active work.
- Resolve every pinned reference before dispatch.

### Relationship validation

- Build one validator used by APIs, migration tools, and AI Agency Doctor.
- Detect missing references, duplicate ownership, invalid target kinds,
  unresolved immutable references, unreachable Workflow steps, and unsafe cycles.
- Block invalid writes instead of only reporting them later.

### Run tracing

- Give each dispatch a correlation id.
- Preserve the chain from Trigger to Loop, Goal, Workflow, Capability, Agent,
  Run, facts, evidence, and artifacts.
- Expose the chain to the Dashboard and Knowledge Graph without making the
  graph the source of truth.

Deliverable: every execution is reproducible, policy-checked, idempotent,
traceable, and linked to valid immutable Definitions.

## Phase 7: Dashboard migration

- Separate Goals and Loops in forms and APIs.
- Make Workflow the visible place for execution design.
- Make Operation the visible ownership view.
- Show inherited Intent policy without copying it.
- Update the Knowledge System graph for the new relationships.
- Clearly label legacy records during migration.

## Phase 8: Data migration

For each consumer repository:

1. Back up current records.
2. Classify every managed record as Goal or Loop.
3. Convert routes into Workflows.
4. Convert schedules into typed Triggers owned by Loops.
5. Assign every Goal and Loop to an Operation.
6. Remove direct Intent portfolio ownership.
7. Validate all references.
8. Compare old and new runtime behavior.
9. Switch reads to the new persistence envelope.
10. Retain rollback data until production proof passes.

## Phase 9: Verification and cleanup

### Golden end-to-end journey

Use one journey as the final proof for the whole model:

```text
Loop triggers
-> Workflow runs
-> Capability produces evidence
-> Goal and Loop state update
-> Knowledge Graph refreshes
-> Dashboard shows the connected result
```

The journey passes only when every step completes once, the Run trace connects
the full chain, and the Dashboard shows the same final state stored by the
backend.

Required proof:

- Shared contract tests pass in all repositories.
- Existing Goals still reach the same evidence.
- Existing Loops run at the same cadence.
- Manual and scheduled Triggers use the same dispatcher.
- Event and webhook Trigger adapters pass contract and authorization tests when
  their rollout phase begins.
- Workflow conditions and retries work.
- Duplicate Trigger deliveries do not create duplicate Runs.
- Missed schedules follow the declared replay policy.
- Every Run records its effective policy snapshot, immutable Definition
  references, and full trace.
- Invalid or incompatible relationships are rejected before dispatch.
- Operation ownership has no gaps or duplicates.
- Graph refresh works end to end.
- Dashboard browser journeys pass.
- One real consumer repository completes several scheduled runs.
- The full live UI matrix passes before and after every architecture phase, as
  required by `docs/testing-policy.md`.
- Legacy writers and compatibility fields are removed only after this proof.

## Main risks

| Risk                               | Protection                                           |
| ---------------------------------- | ---------------------------------------------------- |
| Breaking active loops              | Compatibility reader and staged consumer migration   |
| Losing runtime state               | Backups and separate state conversion                |
| Workflow behavior changes          | Old-versus-new execution comparison                  |
| Ownership cannot be inferred       | Migration report requiring manual resolution         |
| Shared package blocks releases     | Package release compatibility range                  |
| Dashboard hides broken references  | Strict API validation and Doctor checks              |
| Scope becomes uncontrolled         | Graph system as the first limited pilot              |
| Duplicate or overlapping runs      | Idempotency keys, leases, and one Trigger dispatcher |
| Active work changes unexpectedly   | Immutable Definition references and explicit changes |
| Policy differs between entry paths | One policy-enforcing dispatch boundary               |

## Delivery rule

Overall complexity is high. Ship each phase independently, test it at its real
boundary, and keep it reversible until live proof passes. No implementation
starts until this plan is explicitly approved.
