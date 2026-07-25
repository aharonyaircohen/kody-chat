# Trigger

Status: **Draft** · Kind: **Value**

A Trigger describes when a Loop becomes eligible to fire.

```ts
type Trigger =
  | { type: "manual" }
  | { type: "schedule"; every: string; at?: { time: string; timezone: string } }
  | { type: "event"; event: string }
  | { type: "webhook"; event: string }
  | { type: "condition"; expression: string };
```

Trigger belongs to Loop. It does not execute work, own retry policy, grant
authority, or record delivery State. Schedule cadence must not be duplicated on
Intent or Workflow.

Schedule parsing, timezone and DST behavior, event schema, webhook
authentication, condition language, deduplication, and firing idempotency must
be validated by adapters. Mutable leases and delivery cursors belong to
Convex-owned State.

Open decisions: schedule grammar, event registry, condition sandbox, replay
horizon, and exact idempotency key.

Agent rules: Trigger only creates eligibility; it never grants permission or
directly mutates Loop health. Duplicate delivery must use the same activation
key.

Recommended decision: standardize schedule grammar and use one activation key
per `{loop revision, trigger occurrence}`.
