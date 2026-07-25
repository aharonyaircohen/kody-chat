# Implementation

Status: **Draft**

## Meaning

An Implementation is a concrete executable realization of one Capability
revision range. It answers **how this Capability is performed**, while the
Capability remains the stable public contract.

## Definition contract

```ts
type ImplementationDefinition =
  | {
      id: string;
      capabilityRef: { kind: "capability"; id: string };
      compatibleCapabilityRevision: string;
      type: "agent";
      agentRef: { kind: "agent"; id: string };
    }
  | {
      id: string;
      capabilityRef: { kind: "capability"; id: string };
      compatibleCapabilityRevision: string;
      type: "script";
    };
```

Runtime assets such as code locations, package versions, deployments, secrets,
and environment bindings belong to implementation/runtime adapters, not to the
portable semantic definition unless a dedicated contract approves them.

## Invariants

- An Implementation realizes exactly one Capability contract.
- Compatibility is explicit and checked before dispatch.
- Agent implementations require an Agent reference; script implementations do
  not.
- Selection is based on eligibility, Policy, health, and deterministic rules.
- Runs pin the selected Implementation revision.
- Removing an Implementation is blocked while active configuration requires it;
  History retains its pinned identity.

## Field meaning

| Field                          | Meaning                                        |
| ------------------------------ | ---------------------------------------------- |
| `id`                           | Stable Implementation identity                 |
| `capabilityRef`                | Capability this realizes                       |
| `compatibleCapabilityRevision` | Exact revision or approved compatibility range |
| `type`                         | Execution family: Agent or script              |
| `agentRef`                     | Required acting identity for Agent execution   |

Portable meaning is separate from an environment binding. A binding may name a
package, command, deployment, provider, model, tools, secrets, or endpoint for
one environment. Availability and health are runtime State.

## Selection

Selection first filters by compatibility, Lifecycle, environment, permissions,
Policy, Scope, and health. Ranking only happens after eligibility. Ties,
fallback, and no-match results must be deterministic and explainable.

## Failure cases

- Incompatible Capability revision blocks selection.
- Missing binding, secret, deployment, or Agent blocks that candidate.
- Unhealthy candidates are excluded according to explicit policy.
- Adapter failure is recorded on the Run; hidden fallback is forbidden.
- Output contract failure means execution failed.

## Recommended decisions

- Use explicit compatibility ranges with exact pinning on Run.
- Keep environment bindings as separately governed records.
- Require deterministic selection with a recorded reason.
- Allow fallback only as an explicit ranked selection policy.
- Retain deployment and attestation provenance with the selected revision.

## Human and AI authority

AI may propose or generate an Implementation. Humans approve deployment,
secret/permission changes, production activation, and selection-policy changes
as required by Policy.

## Open decisions

- Compatibility range syntax.
- Portable definition versus environment binding schema.
- Selection ranking, fallback, and health semantics.
- Ownership of build, deployment, rollback, and attestation metadata.
- Lifecycle and health model for bindings.
