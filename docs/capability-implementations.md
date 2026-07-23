# Capability and Implementation

A Capability defines **what Kody can do**. An Implementation defines **how
that Capability runs**.

## Capability

Capability is a stable public action contract. It owns identity, purpose,
canonical input and output schemas, allowed effects, required permissions, and
success or failure meaning.

It does not own an Agent, prompt, model, tools, skills, MCP servers, scripts,
schedule, workflow, or runtime state.

## Implementation

Implementation is one technical execution model for one Capability. Its small
portable Definition owns:

- identity;
- Capability reference and compatible contract revision;
- type: `agent` or `script`;
- Agent reference when the type is `agent`.

Adapter-owned `runtime.json` owns bindings, parsing, requirements, tools,
skills, scripts, model settings, and transport settings. Agent
Implementations may include `prompt.md`. Script Implementations must not.

## Resolution

The Engine selects an Implementation in this order:

1. an explicit, authorized run override;
2. the repository execution binding;
3. the only compatible available Implementation.

No match and multiple matches are errors. Equal Capability and Implementation
ids are never assumed.

## Whole model

```text
Purpose
Intent -> Operation -> Goal / Loop

Execution
Workflow -> Capability -> Implementation -> Run

Decision
Agent + Policies + Constraints

Knowledge
Facts + Evidence + Artifacts -> Knowledge Graph
```

Workflow owns ordering, mapping, conditions, and execution retries. Agent owns
identity and general judgment. Run pins the exact Capability and
Implementation used.

## Store layout

```text
capabilities/<id>/
  definition.json
  capability.md

implementations/<id>/
  definition.json
  runtime.json
  prompt.md        # agent type only, optional
  scripts/         # optional
  skills/          # optional
  agents/          # optional runtime assets
```

Business models do not contain storage schema versions. Technical adapters and
packages may version their own formats.
