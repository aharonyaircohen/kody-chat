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

## Field meaning

| Field            | Meaning                                                 | Rules                                                                     |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `id`             | Stable Operation identity                               | Tenant-local, lowercase slug; never reused for a different responsibility |
| `name`           | Short operator-facing label                             | May change without changing identity                                      |
| `responsibility` | The durable outcome area this Operation owns            | Must describe one clear responsibility, not a task list                   |
| `doesNotOwn`     | Nearby responsibilities explicitly outside the boundary | Required when the boundary would otherwise be ambiguous                   |
| `intentIds`      | Intents this Operation supports                         | References only; an Intent does not own the Operation                     |

The Definition deliberately has no `goals`, `loops`, `status`, timestamps,
schedule, progress, health, workflow, capability, implementation, or agent
fields.

## Boundary test

A proposed Operation is valid only when all four answers are clear:

1. What durable responsibility does it own?
2. What nearby responsibility does it explicitly not own?
3. Which Intents explain why it exists?
4. Which Goals or Loops independently point to it?

Do not create a new Operation only to group UI items, run one Workflow, assign
one Agent, represent a department name, or hold a temporary project. Use an
existing Operation, Goal, Loop, Workflow, or Dashboard projection instead.

## State and history

Operation State contains `definitionId`, Lifecycle, and `updatedAt`. Runs and
Run outputs are History. Progress and health are derived from owned Goals and
Loops and must not become competing authoritative fields on the Operation.

```ts
interface OperationState {
  definitionId: string;
  lifecycle: "draft" | "active" | "paused" | "retired" | "archived";
  updatedAt: string;
}
```

The model currently has no approved direct execution command. Starting work
means running one of its Goals or Loops. “Run Operation” in a product surface
must therefore mean a documented service decision, not execution owned by the
Operation model.

## Lifecycle meaning

| State      | Meaning                                                     |
| ---------- | ----------------------------------------------------------- |
| `draft`    | Boundary may be edited; not ready for normal operating use  |
| `active`   | May own active Goals and Loops and participate in planning  |
| `paused`   | Retained but no new work should be started through it       |
| `retired`  | No longer accepts new owned work; history remains           |
| `archived` | Hidden from normal views; retained for references and audit |

Activation should require a valid Intent reference and at least one Goal or
Loop. This is a target rule already reflected by current product validation,
but lifecycle actors and restore rules remain open.

## Invariants

- One Operation has one clear responsibility.
- Operations are flat; an Operation cannot contain another Operation.
- Every Goal and Loop belongs to exactly one Operation.
- `doesNotOwn` clarifies nearby boundaries and must not contradict
  `responsibility`.
- Removing an Operation is blocked while Goals or Loops reference it.
- Intent priority does not change Operation ownership.
- A Goal or Loop cannot be owned by two Operations.
- Ownership is read from the child definition, not from a parent list.
- Archiving an Operation does not archive or delete its owned work.
- Renaming an Operation does not change its `id`.
- A responsibility change that moves the boundary requires checking all owned
  Goals and Loops.

## Relationships

| Relationship                           | Kind          | Cardinality               |
| -------------------------------------- | ------------- | ------------------------- |
| Operation to Intent                    | dependency    | many to many              |
| Goal to Operation                      | ownership     | many to one               |
| Loop to Operation                      | ownership     | many to one               |
| Operation to Workflow/Capability/Agent | none directly | derived through execution |

`intentIds` describes purpose alignment. `Goal.operationId` and
`Loop.operationId` are the only ownership edges. Workflows, Capabilities, and
Agents remain reusable outside the Operation.

## Commands

These are domain actions, even if the current API uses generic create/update
calls:

- propose an Operation;
- revise its name or boundary;
- attach or detach an Intent reference;
- assign or move a Goal or Loop by changing the child;
- activate, pause, retire, restore, or archive;
- request deletion after reference and retention checks.

A multi-record ownership move must update the child definition and any affected
projection atomically. It must not temporarily show two owners or no owner.

## Human and AI authority

AI may propose an Operation or boundary clarification. A human must approve
responsibility changes, ownership moves, retirement, and deletion because they
change the company operating model.

AI may not create overlapping responsibility boundaries to solve a temporary
execution problem. It may not silently move owned work, reactivate a retired
Operation, or delete History.

## Failure cases

- **Missing Intent:** the Operation cannot be activated.
- **No owned work:** it remains Draft and is not operationally useful.
- **Overlapping responsibility:** requires a human boundary decision.
- **Missing child definition:** projection reports an integrity problem; it
  must not invent the child.
- **Duplicate ownership:** reject the change.
- **Retired dependency:** preserve History and require an explicit migration or
  restore decision.
- **Partial ownership move:** roll back the whole change.

## Example

`web-reliability` owns keeping the public web surface healthy. It does not own
content strategy. Its Goals may repair a release failure; its Loops may
reconcile site health.

```json
{
  "id": "web-reliability",
  "name": "Web reliability",
  "responsibility": "Keep public web surfaces available and releasable",
  "doesNotOwn": ["Content strategy", "Campaign planning"],
  "intentIds": ["trusted-customer-experience"]
}
```

`restore-failed-release` and `monitor-public-site` independently carry
`operationId: "web-reliability"`.

## Non-examples

- “Run the release workflow” is a Workflow or Goal.
- “Check the site every 15 minutes” is a Loop.
- “Frontend team” is an Agent/team projection unless a durable responsibility
  is also defined.
- “Q3 redesign” is a Goal or program view, not a durable Operation.

## Open decisions

- Required uniqueness rule for names within a tenant.
- Who may activate, pause, retire, restore, or reassign an Operation.
- How derived health is calculated when Goals and Loops disagree.
- Whether pausing an Operation blocks manual child dispatch.
- Whether an Operation may support a retired Intent while another remains
  active.

## Recommended decisions

- Require at least one active Intent and one owned Goal or Loop for activation.
- Make `id` unique within `{tenant, kind}`; allow duplicate display names only
  when responsibility text clearly differs.
- Require human approval for boundary, ownership, retirement, restore, and
  deletion changes.
- Treat health as a versioned Dashboard projection, not Operation State.
- Block new child dispatch while paused, but do not cancel active Runs.
