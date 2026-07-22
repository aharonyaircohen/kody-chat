# AI Agency Model V2 Plan

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
Pure domain contracts
    <- application services
        <- Engine, Dashboard, Store, Convex, GitHub, and migration adapters
```

- Domain contracts contain no UI, Engine, database, GitHub, Convex, or Store
  dependencies.
- Definitions are versioned and portable. Runtime State is mutable and
  repository-scoped.
- Goal and Loop each form one aggregate boundary. Their Definition and State
  may be stored separately but are updated through one application service.
- Objective and Trigger have no independent identity or lifecycle.
- A Loop controller reads LoopDefinition, updates LoopState, and creates Runs.
- A Capability never owns scheduling or multi-step orchestration.
- Facts, Evidence, and Artifacts are typed outputs with source Run, producer,
  schema version, and creation time.
- Lifecycle and reference rules are part of the first schema version, not a
  later cleanup.

## Phase 1: Lock the contracts

- Write exact version-2 schemas for the models.
- Define Objective as the common contract implemented by Goal and Loop.
- Define Trigger as a typed part of Loop.
- Define GoalDefinition, GoalState, LoopDefinition, and LoopState separately.
- Define allowed relationships.
- Define what each model must never contain.
- Define pause, retire, archive, restore, deletion, and reference-protection
  rules.
- Define typed Policy, Scope, Facts, Evidence, and Artifact value contracts.
- Choose the home of the shared schema package.
- Add architecture tests for these boundaries.

Deliverable: approved schemas and relationship rules.

## Phase 2: Shared schema package

- Create one pure versioned package used by Engine, Dashboard, Store validation,
  backend persistence, and migration tools.
- Add parsing, validation, and migration helpers.
- Keep version-1 readers temporarily.
- Make new writes use version 2.
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

- Store portable authoring contracts as versioned Definitions.
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
- Record the effective policy and policy version on every Run.
- Reject execution when policy or ownership cannot be resolved.

### Versioned references

- Give Agent, Capability, Workflow, Goal, Loop, and policy Definitions explicit
  versions.
- Let active work pin exact versions where reproducibility matters.
- Require an explicit upgrade path instead of silently changing active work
  when a Definition changes.
- Validate version compatibility before dispatch.

### Relationship validation

- Build one validator used by APIs, migration tools, and AI Agency Doctor.
- Detect missing references, duplicate ownership, invalid target kinds,
  incompatible versions, unreachable Workflow steps, and unsafe cycles.
- Block invalid writes instead of only reporting them later.

### Run tracing

- Give each dispatch a correlation id.
- Preserve the chain from Trigger to Loop, Goal, Workflow, Capability, Agent,
  Run, facts, evidence, and artifacts.
- Expose the chain to the Dashboard and Knowledge Graph without making the
  graph the source of truth.

Deliverable: every execution is reproducible, policy-checked, idempotent,
traceable, and linked to valid versioned Definitions.

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
9. Switch reads to version 2.
10. Retain rollback data until production proof passes.

## Phase 9: Verification and cleanup

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
- Every Run records its effective policy, Definition versions, and full trace.
- Invalid or incompatible relationships are rejected before dispatch.
- Operation ownership has no gaps or duplicates.
- Graph refresh works end to end.
- Dashboard browser journeys pass.
- One real consumer repository completes several scheduled runs.
- The full live UI matrix passes before and after every architecture phase, as
  required by `docs/testing-policy.md`.
- Version-1 writers and compatibility fields are removed only after this proof.

## Main risks

| Risk                               | Protection                                           |
| ---------------------------------- | ---------------------------------------------------- |
| Breaking active loops              | Compatibility reader and staged consumer migration   |
| Losing runtime state               | Backups and separate state conversion                |
| Workflow behavior changes          | Old-versus-new execution comparison                  |
| Ownership cannot be inferred       | Migration report requiring manual resolution         |
| Shared package blocks releases     | Versioned package and compatibility range            |
| Dashboard hides broken references  | Strict API validation and Doctor checks              |
| Scope becomes uncontrolled         | Graph system as the first limited pilot              |
| Duplicate or overlapping runs      | Idempotency keys, leases, and one Trigger dispatcher |
| Active work changes unexpectedly   | Version-pinned Definitions and explicit upgrades     |
| Policy differs between entry paths | One policy-enforcing dispatch boundary               |

## Delivery rule

Overall complexity is high. Ship each phase independently, test it at its real
boundary, and keep it reversible until live proof passes. No implementation
starts until this plan is explicitly approved.
