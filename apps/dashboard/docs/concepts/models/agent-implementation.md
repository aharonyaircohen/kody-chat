# Agent implementation

Status: **Current Dashboard contract**

## Dashboard

- Page: `/agents`
- Local storage: versioned Convex definition bundle
- Required bundle file: `agent.md`
- Store Agents: read-only GitHub assets
- Owner: `packages/agency/src/agent-files.ts`

The reader parses title, body, and optional Capability frontmatter from
`agent.md`. Local definitions take precedence over Store assets with the same
slug.

There is no separate Agent Implementation binding in the current Dashboard.
Provider/model selection remains a runtime concern.

## Verification

Create and edit an Agent in `/agents`, reload it, select it in a Workflow, run
that Workflow with a real LLM, and verify the effective prompt and permissions
match the selected Agent.
