# Relationship and ownership map

Status: **Draft**

Ownership means the child cannot change owner without a domain operation.
Dependency means a shared definition is referenced, not copied.

| From                 | To                       | Relationship      | Cardinality  | Declared by           |
| -------------------- | ------------------------ | ----------------- | ------------ | --------------------- |
| Operation            | Intent                   | dependency        | many to many | `Operation.intentIds` |
| Goal                 | Operation                | ownership         | many to one  | `Goal.operationId`    |
| Loop                 | Operation                | ownership         | many to one  | `Loop.operationId`    |
| Goal                 | Workflow/Capability      | dependency        | one          | `executionRef`        |
| Loop                 | Goal/Workflow/Capability | dependency        | one          | `targetRef`           |
| Workflow step        | Capability               | dependency        | one          | `capabilityRef`       |
| Implementation       | Capability               | implementation    | many to one  | `capabilityRef`       |
| Agent Implementation | Agent                    | dependency        | many to one  | `agentRef`            |
| Run                  | origin/target/trace      | historical pin    | many         | pinned refs           |
| Run output           | Run                      | history ownership | many to one  | `runId`               |

Purpose flows Intent → Operation → Goal/Loop. Execution flows Goal/Loop →
Workflow → Capability → Implementation, with Agent used by an Agent
Implementation. Run records the actual path.

Deletion must query incoming dependencies. UI nesting is a projection and does
not establish ownership. Open decisions: Intent-to-Operation cardinality,
shared/global definition portability, and allowed ownership moves.

Enforcement: validators check reference shape; a relationship service must
check existence, tenant Scope, cycles, and incoming references. Ownership moves
require one atomic model change and optimistic concurrency.

Reviewed rule: child definitions declare Goal/Loop ownership; parent lists are
always derived.
