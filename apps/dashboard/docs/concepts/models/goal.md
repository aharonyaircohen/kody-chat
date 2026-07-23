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
    | { kind: "workflow"; id: string }
    | { kind: "capability"; id: string };
}
```

## State and completion

Goal State contains Lifecycle, normalized `progress` from 0 through 1,
`blockers`, and `updatedAt`. Progress is an operator projection; success still
requires Objective Evidence. A Run may fail while the Goal remains active, or
succeed without completing the Goal if Evidence is insufficient.

## Invariants

- A Goal belongs to exactly one Operation.
- A Goal is finite; recurring responsibility belongs to a Loop.
- The execution reference points to a shared definition, never an embedded
  copy.
- Completion evaluates desired state, Scope, and required Evidence.
- Terminal Runs never rewrite historical Goal definitions.

## Relationships

Operation owns Goal. Goal depends on Objective and one Workflow or Capability.
Runs originate from or target the Goal and pin exact definition revisions.

## Human and AI authority

AI may propose Goals, progress, blockers, and supporting Evidence. Human
approval is required when Policy demands it, when Objective meaning changes,
or when declaring completion has material business consequences.

## Example

“Restore successful production deployment for site X” is finite. Evidence may
require a successful deploy record and a live endpoint check.

## Open decisions

- Exact completion decision authority and reopen rules.
- Whether progress is human-entered, computed, or both with provenance.
- Lifecycle transition actors and deletion retention.
- Behavior when the execution reference revision becomes incompatible.

