# Loop

Status: **Current Dashboard contract; Engine integration incomplete**

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
      }
    | { type: "event"; event: string }
    | { type: "webhook"; event: string }
    | { type: "condition"; expression: string };
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
- Loop does not belong to an Operation and does not contain a Goal.

## Current support

| Trigger   | Dashboard accepts | Published Engine executes this simple Loop |
| --------- | ----------------- | ------------------------------------------ |
| Manual    | Yes               | No                                         |
| Schedule  | Yes               | No                                         |
| Event     | Yes               | No                                         |
| Webhook   | Yes               | No                                         |
| Condition | Yes               | No                                         |

The published Engine has a separate older Loop contract. Its manual and
scheduled triggers execute; event, webhook, and condition triggers are skipped.
That does not prove Dashboard-created simple Loops execute.

## Invariants

1. One Loop has one target.
2. A disabled Loop never fires.
3. Each firing needs an idempotency key.
4. Runtime state and Runs never live inside the Loop definition.
5. Saving a trigger is not proof that the Engine supports it.
