# Agents and Capabilities

Status: **Current Dashboard model**

Agent and Capability are separate:

- Agent is reusable identity and guidance.
- Capability is reusable behavior.
- Workflow selects one Agent and connects Capability steps.
- Loop decides when a Workflow or Capability becomes eligible.

An Agent is stored as `agent.md` in a versioned Convex definition bundle. A
Capability is a simple folder containing `instructions.md`, `skills/`, and
`tools/`.

A Capability does not own Agent selection, cadence, approval, Workflow, model,
or provider. Technical Engine `profile.json` files remain runtime assets and
are not edited as another Agency model.

See [`models/agent.md`](models/agent.md) and
[`models/capability.md`](models/capability.md).
