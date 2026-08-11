# Agent implementation

Status: **Current Dashboard contract**

## Dashboard

- Page: `/agents`
- Local storage: versioned Convex definition bundle
- Required bundle file: `agent.md`
- Built-in Agents: `packages/agency/src/builtin-agents.ts`
- Store Agents: read-only GitHub assets
- Owner: `packages/agency/src/agent-files.ts`

The reader parses title, body, optional Capability references, and optional
`subagents` references from `agent.md`. The resolved roster merges local,
built-in, and active Store definitions. Local definitions take precedence over
built-ins and Store assets; built-ins take precedence over Store assets with
the same slug.

Built-in Agents are product configuration shipped with Kody. They are not Store
entries. Their definitions, assignments, and scoped Capability tools have one
source of truth in `packages/agency/src/builtin-agents.ts`; documentation must
not copy that inventory.

## Delegation

The active parent Agent supplies its configured `subagents` roster. Routing
chooses only from that roster and uses the current Agent definitions to judge
which specialist owns the request.

The chat route resolves the parent's authorized tools before delegation by
applying its chat Capability and host policies. A self-routed turn keeps that
set unchanged. Specialist ownership never subtracts a tool from the parent;
the same tool may be deliberately available to both.

Each delegated task runs as an isolated child turn with its own session ID. It
does not inherit the parent's message history. It receives a focused task, the
selected Agent definition, its Capability instructions, repository identity
when available, and only the tools granted by those Capabilities.

The child turn returns its available reasoning, evidence, and result to the
parent. The parent owns the final user-facing response and presentation tools.
Kody's built-in specialist Capabilities do not grant final-answer or
view-rendering tools.

There is no separate Agent Implementation binding in the current Dashboard.
Provider/model selection remains a runtime concern.

## Verification

Create or edit a parent and specialist in `/agents`, assign the specialist,
reload, and send both matching and non-matching requests. Verify that matching
work runs in an isolated child session with only its Capability tools, while
the parent handles unmatched work and owns the final response.

Built-in roster and tool-boundary coverage lives in:

- `packages/agency/tests/builtin-agents.spec.ts`
- `packages/agency/tests/builtin-agent-resolution.spec.ts`
- `packages/kody-chat-dashboard/tests/unit/builtin-agent-routing.spec.ts`
- `packages/kody-chat-dashboard/tests/unit/public-agent-delegation.spec.ts`
- `packages/kody-chat-dashboard/tests/unit/public-agent-orchestrator.spec.ts`
