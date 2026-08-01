# AI Agency simplification

Status: approved for implementation.

## Product model

The Agency has seven user-facing concepts:

1. Overview — one plain-text intent.
2. Todos — finite outcomes with status, evidence, blockers, and related Runs.
3. Agents — reusable identities and their permissions.
4. Capabilities — one executable method per folder.
5. Workflows — visual orchestration, conditions, approval, and one Agent.
6. Loops — a trigger plus one Workflow or Capability target.
7. Runs — immutable execution history, including the Agent used.

The older planning and implementation records are not product models. They have
no page, API, storage collection, or lifecycle.

## Capability folder

Every Capability is exactly:

```text
capabilities/<name>/
├── instructions.md
├── contract.json
├── skills/
└── tools/
```

`contract.json` declares one input and one output. It does not contain an
Agent, model, workflow, schedule, lifecycle, or runtime profile.

`instructions.md` tells the selected Agent how to execute the Capability.
`skills/` contains instruction packages. `tools/` contains executable or tool
configuration assets. Distinct execution methods are distinct Capabilities.

A Capability run directly uses Kody. A Workflow selects one Agent for all its
steps. To run one Capability as another Agent, create a one-step Workflow.

## Workflow

The existing visual editor, conditions, Otherwise branches, bounded loops,
permissions, and approval behavior remain. The only model addition is one
Workflow-level Agent selector. Agent is not selected per step.

## Todo

A Todo owns:

- outcome
- status
- evidence or checklist
- blockers
- related Run ids

A Todo does not own a schedule, route, Workflow steps, Agent selection, or
runtime configuration.

## Loop

A Loop owns only:

- trigger
- target (Workflow or Capability)
- input
- enabled

Health and recent failures are derived from Runs rather than stored as a second
mutable lifecycle.

## Migration rules

- Existing planning records become Todos.
- Existing Intent text becomes the Agency overview intent.
- Existing Operations are removed after their useful labels are copied into
  Todo text where needed.
- Existing Implementations are compiled into Capability folders. True
  duplicates merge; distinct methods become distinct Capabilities.
- Workflow references are rewritten to the resulting Capability ids and gain
  an Agent, defaulting to `kody`.
- Existing Runs keep their history but expose the Agent used instead of an
  Implementation reference.
- Compatibility readers may exist only during the data conversion and must be
  removed before completion.
- No version-named model or version field is introduced by this redesign.
