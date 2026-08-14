# Loop

Status: **Current Dashboard contract; event bindings moved to Triggers**

A Loop says when Kody should repeatedly run one Workflow or Capability.

## Dashboard contract

```ts
interface LoopDefinition {
  id: string;
  trigger:
    | { type: "manual" }
    | {
        type: "schedule";
        every: string;
        at?: { time: string; timezone: string };
      };
  /* event/webhook/condition remain readable for legacy definitions only */
  target: { kind: "workflow" | "capability"; id: string };
  input: Record<string, unknown>;
  enabled: boolean;
}
```

## Responsibility

- Loop owns activation.
- Workflow owns orchestration.
- Capability owns reusable behavior.
- Run owns execution history.
- Loop does not belong to or contain another planning aggregate.

## Current support

| Trigger   | Dashboard accepts | Published Engine executes this simple Loop |
| --------- | ----------------- | ------------------------------------------ |
| Manual    | Yes               | Yes                                        |
| Schedule  | Yes               | Yes                                        |
| Event     | Legacy read only  | No                                         |
| Webhook   | Legacy read only  | No                                         |
| Condition | Legacy read only  | No                                         |

New event-driven behavior belongs to the Trigger model. A matching Trigger
starts its Workflow directly, so an event does not create one Loop per
delivery. Existing Loop files with event, webhook, or condition values are
still parsed and displayed as legacy values while they are migrated.

## Invariants

1. One Loop has one target.
2. A disabled Loop never fires.
3. Each firing needs an idempotency key.
4. Runtime state and Runs never live inside the Loop definition.
5. Saving a trigger is not proof that the Engine supports it.
6. A temporary Agency-request Loop exists only while its Todo remains active.
