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

## Field meaning

| Field                          | Meaning                                | Rules                                          |
| ------------------------------ | -------------------------------------- | ---------------------------------------------- |
| `id`                           | Stable Loop identity                   | Tenant-local; never reused                     |
| `operationId`                  | Owning Operation                       | Exactly one valid Operation                    |
| `objective`                    | Ongoing condition the Loop protects    | Desired state, Evidence, and Scope             |
| `trigger`                      | When the Loop becomes eligible         | Manual, schedule, event, webhook, or condition |
| `targetRef`                    | Work performed on a firing             | One Goal, Workflow, or Capability              |
| `reconciliationPolicy.overlap` | Behavior when a prior firing is active | Skip or queue                                  |
| `reconciliationPolicy.missed`  | Behavior for missed activations        | Skip, replay, or coalesce                      |
| `reconciliationPolicy.failure` | Retry, backoff, and timeout limits     | Explicit bounded values                        |

The Definition has no next-run time, last-run time, failure counter, lease,
cursor, health, active Run, outputs, Agent, or Implementation.

## Loop test

Use a Loop only when:

1. the responsibility continues indefinitely;
2. a Trigger can say when to check;
3. an Objective can say what healthy means;
4. a target can perform one reconciliation attempt;
5. overlap, missed, and failure behavior are explicit.

A finite desired state is a Goal. Ordered reusable work is a Workflow. A
platform scheduler or worker is an adapter/service, not a Loop model.

## State

Loop State contains Lifecycle, derived health, failure count, last-fired time,
next-eligible time, and update time. Each firing creates Run History; State
must not embed full Run records.

```ts
interface LoopState {
  definitionId: string;
  lifecycle: "draft" | "active" | "paused" | "retired" | "archived";
  health: "unknown" | "healthy" | "degraded" | "failing";
  failures: number;
  lastFiredAt?: string;
  nextEligibleAt?: string;
  updatedAt: string;
}
```

Leases, deduplication keys, event cursors, and queued activation records may be
required runtime State, but they are not yet in the approved contract. They
must be tenant-scoped and Convex-owned if added.

## Invariants

- A Loop belongs to exactly one Operation.
- Cadence and event activation live in Trigger, not Intent or Workflow.
- Target definitions are shared dependencies.
- Overlap, missed-trigger, retry, and timeout behavior are explicit.
- Health is derived from documented signals; it is not an arbitrary status.
- Pausing a Loop prevents new firings but does not silently cancel Runs.
- A firing creates a distinct Run attempt with pinned revisions.
- Duplicate trigger delivery cannot create duplicate attempts for the same
  activation key.
- Failure retry is bounded; it cannot become an endless hidden Loop.
- Trigger detection does not grant execution authority.
- Changing Trigger or target creates a new Definition revision.
- Archiving preserves prior firings and outputs.

## Lifecycle meaning

| State      | Meaning                                                     |
| ---------- | ----------------------------------------------------------- |
| `draft`    | Trigger, Objective, target, or reconciliation is incomplete |
| `active`   | New eligible firings may be dispatched                      |
| `paused`   | Trigger observations may continue, but new Runs are blocked |
| `retired`  | No new activation; retained for History                     |
| `archived` | Hidden from normal views after retirement                   |

## Reconciliation sequence

1. Observe a Trigger occurrence.
2. Produce a stable activation key.
3. Check Lifecycle and owning Operation.
4. Apply missed and overlap rules atomically.
5. Resolve Policy, Scope, target, and pinned revisions.
6. Create the Run and reserve capacity.
7. Invoke the execution adapter.
8. Record outputs and terminal result.
9. Update failure, eligibility, and health State.

Trigger observation and dispatch are separate. A schedule tick may be recorded
without starting a Run when paused, denied, duplicated, or overlapping.

## Relationships

Operation owns Loop. Loop owns its Objective and Trigger values. It depends on
one Goal, Workflow, or Capability. Runs represent firings and pin the actual
execution path. A target Goal remains finite and owned by its own Operation.

## Commands

- propose or revise a Loop;
- change its Trigger, target, or reconciliation limits;
- activate, pause, retire, restore, or archive;
- request a manual firing;
- record a Trigger occurrence;
- dispatch, skip, queue, coalesce, replay, retry, or escalate an activation.

## Human and AI authority

AI may propose or operate a Loop within effective Policy. Humans approve
material trigger, target, Scope, or reconciliation changes and any risky
actions required by Policy.

AI cannot widen its own schedule, replay old events beyond approved limits,
raise retry/budget limits, or mark health healthy without the defined Evidence.

## Example

A release-health Loop fires every 15 minutes, targets a diagnostic Workflow,
skips overlapping executions, coalesces missed ticks, and escalates after
three failed attempts.

```json
{
  "id": "monitor-public-site",
  "operationId": "web-reliability",
  "objective": {
    "desiredState": "The production site is reachable and serving the approved version",
    "requiredEvidence": ["live-endpoint-healthy", "version-matches"],
    "scope": {
      "include": { "site": ["site-x"], "environment": ["production"] },
      "exclude": {}
    }
  },
  "trigger": { "type": "schedule", "every": "15m" },
  "targetRef": { "kind": "workflow", "id": "verify-and-repair-site" },
  "reconciliationPolicy": {
    "overlap": "skip",
    "missed": "coalesce",
    "failure": {
      "maxAttempts": 3,
      "backoffSeconds": 30,
      "timeoutSeconds": 900
    }
  }
}
```

## Failure cases

- Invalid Trigger or missing target blocks activation.
- Duplicate delivery returns the existing activation result.
- Overlap follows policy; it never silently starts another Run.
- Missed occurrences follow policy and bounded replay.
- Exhausted retries move health toward failing and escalate.
- Adapter failure is recorded on the Run and reconciled into Loop State.
- Partial State/Run creation rolls back or is recovered idempotently.

## Open decisions

- Health formula and recovery window.
- Event deduplication and webhook authenticity contract.
- Pause/cancel interaction with active Runs.
- Maximum replay horizon and timezone/DST behavior.
- Activation key format and retention.
- Scheduler/worker ownership and capacity leases.
- Whether health uses consecutive failures, time windows, Evidence, or all
  three.

## Recommended decisions

- Keep schedule only in Trigger.
- Use one activation key per `{loop revision, trigger occurrence}`.
- Create the Run before invoking any external adapter.
- Pause blocks new Runs but does not cancel active Runs.
- Default to `skip` overlap and `coalesce` missed ticks.
- Base health on recent Evidence and outcomes with a documented time window.
