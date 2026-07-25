# Loop

Status: **Implemented definition; execution pending**

## Meaning

A Loop says when to start one existing Workflow or Capability.

It is a small trigger definition, not a planning hierarchy, workflow engine,
runtime state machine, or health model.

## Contract

```ts
interface Loop {
  id: string;
  trigger:
    | { type: "manual" }
    | {
        type: "schedule";
        every: string;
        at?: { time: string; timezone: string };
      }
    | { type: "event" | "webhook"; event: string }
    | { type: "condition"; expression: string };
  target: {
    kind: "workflow" | "capability";
    id: string;
  };
  input: Record<string, unknown>;
  enabled: boolean;
}
```

## Field meaning

| Field     | Meaning                                  |
| --------- | ---------------------------------------- |
| `id`      | Stable repository-local identity         |
| `trigger` | When the Loop is eligible                |
| `target`  | One existing Workflow or Capability      |
| `input`   | Saved input passed to the target         |
| `enabled` | Whether execution may consider this Loop |

## Boundaries

- Workflow owns steps, conditions, internal looping, and approval behavior.
- Capability owns reusable instructions, one input, one output, skills, and
  tools.
- Loop owns only recurring activation of one target.
- Convex owns the repository-scoped saved definition.
- Any future execution records belong to the existing run system.

A Loop does not belong to an Operation, contain a Goal or Objective, duplicate
Workflow steps, or own a separate State and History hierarchy.

## Triggers

- `manual`: eligible only through an explicit future run action.
- `schedule`: eligible at a saved cadence and optional local time.
- `event`: eligible when a named internal event occurs.
- `webhook`: eligible when a named external event is accepted.
- `condition`: eligible when an explicit expression is true.

Saving a trigger does not itself provide a scheduler, listener, evaluator, or
dispatcher.

## Lifecycle

The current lifecycle is intentionally one boolean:

- enabled: the Loop may be considered for execution;
- disabled: the Loop must not start new work.

There are no draft, paused, retired, archived, health, retry, lease, or cursor
states in the current contract.

## Relationships

```text
Trigger -> Loop -> Workflow or Capability
```

The target remains independently reusable. Deleting or changing a Loop does
not change the target definition.

## Example

```json
{
  "id": "check-release",
  "trigger": {
    "type": "schedule",
    "every": "1h"
  },
  "target": {
    "kind": "workflow",
    "id": "verify-release"
  },
  "input": {
    "environment": "production"
  },
  "enabled": true
}
```

## Execution rule

Execution is not implemented by the definition APIs. If added, every trigger
type should use one small dispatcher that:

1. loads the enabled Loop for the active repository;
2. invokes the saved Workflow or Capability with the saved input;
3. records the result through the existing run system.

Do not add another Loop model or restore Goal, Operation, policy, projection,
or scheduler fields to the definition.
