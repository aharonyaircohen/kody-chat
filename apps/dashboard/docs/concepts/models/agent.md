# Agent

Status: **Current Dashboard contract**

An Agent is a reusable Markdown identity that explains how an AI actor should
work.

## Contract

An Agent has:

- a stable slug;
- a title;
- a Markdown body;
- optional Capability references in frontmatter.

Agent does not own a Workflow, Loop, Todo, or Run. Workflow selects the Agent
that runs its steps.

The simplified `AgentDefinition` in `packages/agency-domain` uses
`id`, `name`, `instructions`, and `permissions`, but the mounted Agents page
uses the Markdown bundle above. Neither `role` nor `constraints` is a current
stored Agent field.

## Invariants

1. Agent is identity and guidance, not execution state.
2. Permissions must be enforced at dispatch/tool boundaries, not trusted only
   because they appear in prose.
3. Store Agents are read-only; local Agents may override by slug.
4. Agent does not create a second Implementation model.
