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

## Human and AI authority

AI may propose or generate an Implementation. Humans approve deployment,
secret/permission changes, production activation, and selection-policy changes
as required by Policy.

## Open decisions

- Compatibility range syntax.
- Portable definition versus environment binding schema.
- Selection ranking, fallback, and health semantics.
- Ownership of build, deployment, rollback, and attestation metadata.

