# Goal

Status: **Draft**

## Meaning

A Goal is a finite desired state owned by one Operation. It is complete when
its required Evidence proves the Objective, not merely when an execution ends.

## Owns

- an Objective;
- one Operation ownership reference;
- one execution dependency, either a Workflow or Capability.

It does not own cadence, reusable execution definitions, implementations,
agents, or Run history.

## Definition contract

```ts
interface GoalDefinition {
  id: string;
  operationId: string;
  objective: Objective;
  executionRef:
    { kind: "workflow"; id: string } | { kind: "capability"; id: string };
}
```

## Field meaning

| Field                        | Meaning                                | Rules                                             |
| ---------------------------- | -------------------------------------- | ------------------------------------------------- |
| `id`                         | Stable Goal identity                   | Tenant-local; never reused for another Objective  |
| `operationId`                | Owning Operation                       | Exactly one valid, non-archived Operation         |
| `objective.desiredState`     | What must become true                  | Observable, finite, and outcome-based             |
| `objective.requiredEvidence` | Proof required for completion          | Names evidence contracts, not work steps          |
| `objective.scope`            | Boundary in which success is evaluated | May narrow effective Scope, never widen authority |
| `executionRef`               | Reusable work used to pursue the Goal  | Exactly one Workflow or Capability reference      |

The Goal Definition has no schedule, Agent, Implementation, current stage,
progress, blockers, facts, Run IDs, or timestamps.

## Goal test

A Goal is valid when:

1. its desired state can become true;
2. completion can be proved;
3. it has a clear end;
4. one Operation owns it;
5. one executable dependency can pursue it.

If the responsibility must continue after success, use a Loop. If it only
describes ordered work, use a Workflow. If it describes one action, use a
Capability.

## State and completion

Goal State contains Lifecycle, normalized `progress` from 0 through 1,
`blockers`, and `updatedAt`. Progress is an operator projection; success still
requires Objective Evidence. A Run may fail while the Goal remains active, or
succeed without completing the Goal if Evidence is insufficient.

```ts
interface GoalState {
  definitionId: string;
  lifecycle: "draft" | "active" | "paused" | "retired" | "archived";
  progress: number;
  blockers: string[];
  updatedAt: string;
}
```

`progress` is a summary from `0` through `1`; it is not proof. `blockers` are
current operational problems, not permanent Constraints. Facts, Evidence,
Artifacts, stages, and execution attempts belong to Run History or projections.

## Completion

Completion is a separate evaluation:

1. collect current Evidence linked to this Goal and pinned Goal revision;
2. verify its source, contract, freshness, and Scope;
3. evaluate every required Evidence item;
4. confirm the desired state is true;
5. record the completion decision and actor;
6. move Lifecycle according to the approved transition.

A successful Run is only an input to this decision. Missing Evidence means the
Goal is not complete. A failed Run does not necessarily mean the Goal is
blocked or impossible.

## Invariants

- A Goal belongs to exactly one Operation.
- A Goal is finite; recurring responsibility belongs to a Loop.
- The execution reference points to a shared definition, never an embedded
  copy.
- Completion evaluates desired state, Scope, and required Evidence.
- Terminal Runs never rewrite historical Goal definitions.
- The owning Operation, Workflow, and Capability references must resolve before
  activation.
- A Goal cannot reference itself.
- Moving a Goal changes `operationId` through one new immutable revision.
- Changing desired state or required Evidence creates a new revision and does
  not rewrite what earlier Runs attempted.
- Archiving hides the Goal but preserves Definition revisions and History.

## Relationships

Operation owns Goal. Goal depends on Objective and one Workflow or Capability.
Runs originate from or target the Goal and pin exact definition revisions.

A Loop may target a Goal to reconcile it repeatedly. That is a dependency, not
ownership: the Goal still belongs to its Operation and remains finite.

## Lifecycle meaning

| State      | Meaning                                                     |
| ---------- | ----------------------------------------------------------- |
| `draft`    | Objective or execution is not ready                         |
| `active`   | Eligible for manual or automated dispatch                   |
| `paused`   | New dispatch is blocked; active Runs are handled separately |
| `retired`  | No new work; retained for History and references            |
| `archived` | Hidden from normal views after retirement                   |

The current product maps older `inactive`, `active`, `paused`, and `done`
labels into this shared Lifecycle. Those labels are projections, not a second
domain lifecycle.

## Commands

- propose or revise a Goal;
- move it to another Operation;
- change its execution dependency;
- activate, pause, retire, restore, or archive;
- dispatch one attempt;
- record a blocker or progress observation;
- evaluate completion or reopen after a documented reason.

## Human and AI authority

AI may propose Goals, progress, blockers, and supporting Evidence. Human
approval is required when Policy demands it, when Objective meaning changes,
or when declaring completion has material business consequences.

AI may not lower the Evidence bar to declare its own work complete. Changing
the Objective after execution requires a new revision and must not make an old
Run appear to have satisfied a different Goal.

## Example

“Restore successful production deployment for site X” is finite. Evidence may
require a successful deploy record and a live endpoint check.

```json
{
  "id": "restore-site-x-release",
  "operationId": "web-reliability",
  "objective": {
    "desiredState": "The approved version of site X is live and healthy",
    "requiredEvidence": ["deployment-succeeded", "live-endpoint-healthy"],
    "scope": {
      "include": { "site": ["site-x"], "environment": ["production"] },
      "exclude": {}
    }
  },
  "executionRef": { "kind": "workflow", "id": "release-web" }
}
```

## Failure cases

- Missing owner or execution dependency blocks activation.
- Invalid or stale Evidence does not complete the Goal.
- Incompatible Capability/Workflow revision blocks dispatch.
- Duplicate dispatch must be handled by idempotency, not hidden duplicate Runs.
- A partial model change must roll back.
- Conflicting ownership edits must fail rather than silently overwrite.

## Open decisions

- Exact completion decision authority and reopen rules.
- Whether progress is human-entered, computed, or both with provenance.
- Lifecycle transition actors and deletion retention.
- Behavior when the execution reference revision becomes incompatible.
- Whether a Goal may be active while its owning Operation is paused.
- Evidence freshness and supersession rules.

## Recommended decisions

- Require one active Operation, one execution reference, and at least one
  Evidence contract for activation.
- Let AI propose completion; require Policy-based or human approval for
  material completion.
- Treat progress as derived unless a manual observation includes actor and
  reason.
- Pause blocks new dispatch but does not cancel active Runs.
- Reopen creates an auditable State transition; it never edits prior Evidence.
