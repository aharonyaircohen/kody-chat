# Operation

Status: **Draft**

## Meaning

An Operation is a durable business responsibility. It answers **what area of
work is owned**, not why the company values it or how work is executed.

An Operation is the ownership boundary for Goals and Loops. It may support
multiple Intents and may use shared Workflows, Capabilities, and Agents.

## Owns

- one named responsibility;
- the boundary expressed by `doesNotOwn`;
- the association to the Intents it supports;
- the Goals and Loops that point to it.

It does not own schedules, execution steps, implementation selection, runtime
history, or copies of shared definitions.

## Definition contract

```ts
interface OperationDefinition {
  id: string;
  name: string;
  responsibility: string;
  doesNotOwn: string[];
  intentIds: string[];
}
```

`id` is stable domain identity. `intentIds` are dependencies, not ownership.
Goals and Loops declare ownership with `operationId`; they are not embedded.

## State and history

Operation State contains `definitionId`, Lifecycle, and `updatedAt`. Runs and
Run outputs are History. Progress and health are derived from owned Goals and
Loops and must not become competing authoritative fields on the Operation.

## Invariants

- One Operation has one clear responsibility.
- Operations are flat; an Operation cannot contain another Operation.
- Every Goal and Loop belongs to exactly one Operation.
- `doesNotOwn` clarifies nearby boundaries and must not contradict
  `responsibility`.
- Removing an Operation is blocked while Goals or Loops reference it.
- Intent priority does not change Operation ownership.

## Relationships

| Relationship | Kind | Cardinality |
| --- | --- | --- |
| Operation to Intent | dependency | many to many |
| Goal to Operation | ownership | many to one |
| Loop to Operation | ownership | many to one |
| Operation to Workflow/Capability/Agent | none directly | derived through execution |

## Human and AI authority

AI may propose an Operation or boundary clarification. A human must approve
responsibility changes, ownership moves, retirement, and deletion because they
change the company operating model.

## Example

`web-reliability` owns keeping the public web surface healthy. It does not own
content strategy. Its Goals may repair a release failure; its Loops may
reconcile site health.

## Open decisions

- Required uniqueness rule for names within a tenant.
- Who may activate, pause, retire, restore, or reassign an Operation.
- Whether an Operation must support at least one active Intent.
- How derived health is calculated when Goals and Loops disagree.

