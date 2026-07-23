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

