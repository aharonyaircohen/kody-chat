# Agent

Status: **Draft**

## Meaning

An Agent is an AI-agency identity that can perform work under a role,
permissions, constraints, and effective Policy. It is **who acts**, not a model
provider, backend, prompt, or Capability.

## Definition contract

```ts
interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  permissions: string[];
  constraints: Constraint[];
}
```

Model/provider configuration, credentials, runtime availability, memory, and
session state are separate operational concerns.

## Invariants

- Agent identity is stable across runtime backend changes.
- Role describes responsibility, not unrestricted authority.
- Effective permission is the intersection of Agent permissions, Capability
  requirements, Scope, Policy, Intent Controls, and environment authority.
- Constraints can only reduce authority.
- Agent definitions do not own Goals, Workflows, Capabilities, or Runs.
- Every material action is attributable through Run provenance.

## Relationships

Agent Implementations depend on an Agent. Runs may record an Agent as producer
and pin its definition revision. Multiple Implementations may use one Agent;
multiple Agents may implement different realizations of a Capability.

## Human and AI authority

Humans create, approve, activate, restrict, and retire Agents. An Agent may
propose changes to itself but cannot approve an expansion of its own authority.
Human impersonation and unrecorded delegation are forbidden.

## Open decisions

- Agent ownership and tenant visibility.
- Delegation and sub-agent contract.
- Runtime identity versus conversational persona.
- Memory boundaries and retention.
- Required approval for permission changes.

