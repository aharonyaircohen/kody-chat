# Workflow

Status: **Draft**

## Meaning

A Workflow is reusable orchestration: an ordered or dependency-based plan that
composes Capabilities. It describes how work flows, not why it matters, when it
recurs, or which concrete implementation executes each action.

## Definition contract

```ts
interface WorkflowDefinition {
  id: string;
  steps: Array<{
    id: string;
    capabilityRef: { kind: "capability"; id: string };
    dependsOn: string[];
    input?: Record<string, unknown>;
    condition?: string;
    retry?: { maxAttempts: number; backoffSeconds: number };
  }>;
}
```

## Ownership and invariants

- Step IDs are unique within a Workflow.
- Every dependency names an existing step and the graph is acyclic.
- Each step calls one Capability contract, not an Implementation or Agent.
- Inputs satisfy the Capability input contract after bindings resolve.
- Retry is step execution behavior; recurring scheduling belongs to Loop.
- Definitions contain no live approval, Run status, or mutable step output.

Workflows are shared dependencies of Goals and Loops. Workflow executions
produce parent and child Runs with pinned definition revisions.

## Field meaning

| Field           | Meaning                                                 |
| --------------- | ------------------------------------------------------- |
| `id`            | Stable Workflow identity                                |
| `steps[].id`    | Stable step identity within one revision                |
| `capabilityRef` | Public action contract required by the step             |
| `dependsOn`     | Steps that must succeed before eligibility              |
| `input`         | Static input or binding description, not runtime output |
| `condition`     | Eligibility rule evaluated by the runtime               |
| `retry`         | Bounded retry for this step attempt                     |

The graph must be finite, acyclic, and have at least one start step. A Workflow
does not own cadence, business success, approval State, selected
Implementations, current position, or step outputs.

## Runtime meaning

A Workflow Run pins one Workflow revision. Each eligible step creates a child
Run for its Capability. Step success means its Capability contract succeeded;
Workflow success means every required path completed. Goal completion remains a
separate Evidence decision.

Conditions, input bindings, retries, cancellation, and compensation must be
deterministic and recorded. Editing a Workflow never changes an active Run.

## Failure cases

- Missing Capability, dependency, or input contract blocks activation.
- Cycles and unreachable required steps are invalid.
- A failed required step fails or compensates according to explicit policy.
- No compatible Implementation blocks that step; it does not silently skip.
- Duplicate dispatch reuses an idempotency result or creates an explicit retry.

## Recommended decisions

- Keep `dependsOn` as the canonical graph; derive editor arrows from it.
- Keep approval outside the step type as a dispatch gate.
- Use a small, sandboxed expression language for conditions and bindings.
- Make compensation explicit per step before supporting partial rollback.
- Pin the Workflow revision for the complete Run tree.

## Human and AI authority

AI may propose a Workflow and low-risk revisions. A human must approve changes
that alter side effects, authority, approval boundaries, or production
behavior according to Policy.

## Example

`release-web` validates the build, deploys it, verifies the endpoint, then
publishes Evidence. Each step references a Capability; runtime chooses a
compatible Implementation.

## Open decisions

- Canonical graph representation: dependencies versus explicit transitions.
- Data binding and expression language.
- Failure, compensation, and partial-success semantics.
- Whether approval is a step type or always an external dispatch gate.
- Revision compatibility for in-flight Runs.
- Required-step, optional-step, and partial-success rules.
- Workflow input/output contract and binding syntax.
