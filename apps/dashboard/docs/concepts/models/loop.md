# Loop

Status: **Draft**

## Meaning

A Loop is a continuous responsibility that repeatedly checks or moves an
Objective toward its desired state. It owns activation and reconciliation, not
the reusable work it invokes.

## Definition contract

```ts
interface LoopDefinition {
  id: string;
  operationId: string;
  objective: Objective;
  trigger: Trigger;
  targetRef:
    | { kind: "goal"; id: string }
    | { kind: "workflow"; id: string }
    | { kind: "capability"; id: string };
  reconciliationPolicy: {
    overlap: "skip" | "queue";
    missed: "skip" | "replay" | "coalesce";
    failure: {
      maxAttempts: number;
      backoffSeconds: number;
      timeoutSeconds: number;
    };
  };
}
```

## State

Loop State contains Lifecycle, derived health, failure count, last-fired time,
next-eligible time, and update time. Each firing creates Run History; State
must not embed full Run records.

## Invariants

- A Loop belongs to exactly one Operation.
- Cadence and event activation live in Trigger, not Intent or Workflow.
- Target definitions are shared dependencies.
- Overlap, missed-trigger, retry, and timeout behavior are explicit.
- Health is derived from documented signals; it is not an arbitrary status.
- Pausing a Loop prevents new firings but does not silently cancel Runs.

## Human and AI authority

AI may propose or operate a Loop within effective Policy. Humans approve
material trigger, target, Scope, or reconciliation changes and any risky
actions required by Policy.

## Example

A release-health Loop fires every 15 minutes, targets a diagnostic Workflow,
skips overlapping executions, coalesces missed ticks, and escalates after
three failed attempts.

## Open decisions

- Health formula and recovery window.
- Event deduplication and webhook authenticity contract.
- Pause/cancel interaction with active Runs.
- Maximum replay horizon and timezone/DST behavior.

