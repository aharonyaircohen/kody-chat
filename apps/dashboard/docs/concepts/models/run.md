# Run

Status: **Draft**

## Meaning

A Run is one execution attempt. It is the audit and reproducibility boundary:
what triggered work, what target and definitions were used, which effective
Policy applied, what happened, and what was produced.

## Contract

```ts
interface Run {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  origin: PinnedDefinitionRef;
  target: PinnedDefinitionRef;
  trace: PinnedDefinitionRef[];
  execution?: {
    capability: PinnedDefinitionRef;
    implementation: PinnedDefinitionRef;
  };
  parentRunId?: string;
  effectivePolicy: { hash: string; policy: Policy; constraints: Constraint[] };
  correlationId: string;
  startedAt: string;
  finishedAt?: string;
  usage?: { tokens: number; costUsd: number; durationSeconds: number };
}
```

## State and history

Queued and running Runs are mutable State. Terminal Runs are immutable History.
Events and outputs are append-only records linked by Run ID. Operator labels
such as waiting, blocked, stuck, or recorded may be projections, but must not
silently alter the canonical lifecycle.

## Field meaning

| Field             | Meaning                                         |
| ----------------- | ----------------------------------------------- |
| `id`              | Unique attempt identity                         |
| `status`          | Canonical execution lifecycle                   |
| `origin`          | Pinned model that caused the attempt            |
| `target`          | Pinned work requested                           |
| `trace`           | All pinned definitions used for reproducibility |
| `execution`       | Selected Capability and Implementation          |
| `parentRunId`     | Parent attempt in an execution tree             |
| `effectivePolicy` | Exact governance used at dispatch               |
| `correlationId`   | Business execution lineage                      |
| timestamps/usage  | Attempt timing and consumed resources           |

## Lifecycle

Allowed normal flow is queued → running → succeeded/failed/cancelled. Timeout,
blocked, waiting, approval-needed, stuck, and retrying are reasons, events, or
projections unless explicitly added to the canonical contract. Retry creates a
new Run linked to the prior attempt.

## Events and outputs

Events are append-only and ordered per Run. Outputs are typed Fact, Evidence,
or Artifact records. Logs support debugging but do not replace events. A
correction is a new event/output with supersession provenance, never an edit to
terminal History.

## Failure cases

- Missing pins or effective Policy blocks Run creation.
- Duplicate dispatch resolves through idempotency.
- Lost worker heartbeat leads to explicit timeout/recovery, not silent success.
- Finalization is idempotent and cannot change one terminal result to another.
- Usage and output validation failures remain visible.

## Recommended decisions

- Keep the five canonical statuses.
- Model approval/waiting/stuck as events and operator projections.
- Give each retry a new Run ID with `retryOf` provenance in events/metadata.
- Require monotonic event sequence numbers from Convex.
- Make terminal Run and output retention append-only with governed redaction.

## Invariants

- Every Run pins all reproducibility-relevant definition revisions.
- Terminal Runs have `finishedAt`; active Runs do not.
- Usage belongs only to terminal Runs.
- Effective Policy is resolved before action and stored with a stable hash.
- Child Runs retain `parentRunId` and the same correlation lineage.
- Success means execution success, not automatically Goal completion.
- Events and outputs are never overwritten to rewrite history.

## Human and AI authority

Dispatch and approval follow effective Policy. Humans may cancel or approve
where authorized. Neither humans nor AI may edit terminal evidence; corrections
are new events or Runs.

## Open decisions

- Canonical status model versus operator projections.
- Cancellation, timeout, retry, resume, and compensation semantics.
- Event schema and ordering guarantees.
- Retention/redaction and usage accounting rules.
- Idempotency key and retry lineage contract.
