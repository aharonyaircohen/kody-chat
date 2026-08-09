# Agent

Status: **Current Dashboard contract**

An Agent is a reusable Markdown identity that explains how an AI actor should
work.

## Contract

An Agent has:

- a stable slug;
- a title;
- a Markdown body;
- optional Capability references in frontmatter;
- optional Agent references in `subagents`.

`subagents` is an assignment, not a separate Agent type. An Agent is the
parent for that relationship when other Agents are assigned to it; each
assigned Agent is its subagent. The same Agent can be used independently or be
assigned to another parent.

An Agent's title and body describe its specialty. There is no separate domain,
specialty, main-agent, or subagent field.

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
3. A parent may delegate only to Agents explicitly assigned in `subagents`.
4. An assigned subagent receives tools through its Capabilities; assignment
   alone does not grant tools.
5. Store and built-in Agents are read-only; a local Agent may override either
   by slug.
6. Agent does not create a second Implementation model.
