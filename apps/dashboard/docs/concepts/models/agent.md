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

## Field meaning

| Field         | Meaning                                                |
| ------------- | ------------------------------------------------------ |
| `id`          | Stable agency identity                                 |
| `name`        | Human-readable identity                                |
| `role`        | Expected responsibility and perspective                |
| `permissions` | Maximum actions this Agent may request                 |
| `constraints` | Denials or approval requirements that reduce authority |

An Agent is not its prompt, model, provider, tools, session, memory, or
deployment. Those can change while the same agency identity remains.

## Effective authority

Agent permissions are only one input. Effective authority is the intersection
of tenant/environment authority, Policy, Intent Controls, Scope, Capability
requirements, Agent permissions, and Implementation binding. Any deny wins.

## Failure cases

- Missing Agent or inactive binding blocks Agent Implementation execution.
- Permission mismatch denies action before model/provider invocation.
- Provider identity must not replace Agent provenance.
- Delegation without recorded parent/child authority is forbidden.
- An Agent cannot approve its own permission expansion.

## Recommended decisions

- Keep Agent identity tenant-scoped and provider-independent.
- Treat memory and sessions as separate governed runtime data.
- Record delegation as a Run relationship with equal or narrower authority.
- Require human approval for permission expansion and retirement/restore.

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
- Agent Lifecycle and ownership.
