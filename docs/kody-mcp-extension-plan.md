# Kody MCP Extension Plan

## Destination

Kody becomes the shared online control and knowledge layer used by local coding
agents such as Claude Code, Codex, and OpenCode. Each agent connects directly to
one authenticated Kody Streamable HTTP MCP endpoint. Kody does not launch or
control the local agent and does not require a local connector.

```text
Claude Code / Codex / OpenCode
              |
              | MCP over HTTPS
              v
        Kody public MCP API
              |
      shared Kody services
              |
   Dashboard, automation, evidence,
   policies, workflows, and history
```

The first release exposes a deliberately small public facade. Later releases
grow the catalog behind that facade without forcing every client to load every
Kody tool into its context.

## Product boundary

Kody owns:

- authenticated user, organization, and repository scope;
- reusable policies, instructions, workflows, context, and memory;
- shared work records, progress, evidence, approvals, and handoffs;
- online automation and Dashboard visibility;
- tool discovery, authorization, execution, auditing, and stable contracts.

The local coding agent owns:

- its local filesystem and shell;
- its own model context window and native conversation history;
- local edits and commands it chooses to perform.

Kody shares durable, structured work context. It does not claim to merge raw
private transcripts or hidden model context across vendors. Secret values are
never returned through discovery, history, or evidence tools.

## Public MCP contract

The canonical transport is Streamable HTTP over HTTPS. The initial server
exposes only four stable facade tools:

1. `kody_status` — server version, authenticated scope, capabilities, and
   service health safe for the caller to see.
2. `kody_search_tools` — paginated discovery of Kody actions available to the
   caller, filtered by text and category.
3. `kody_get_tool_details` — the complete schema, permission class, side effects,
   approval behavior, and examples for one action.
4. `kody_execute_tool` — validated execution of an allowed action using a stable
   action identifier, optional idempotency key, and structured result.

All responses use versioned schemas and structured errors. Tool definitions
declare one of four permission classes: `read`, `write`, `approval`, or `admin`.
Every request is restricted to its authenticated repository scope. Writes are
audited; destructive or externally visible actions require the approval policy
declared by the underlying Kody service.

## Shared work record

Agents exchange durable work through one Kody-owned record rather than copying
their entire chats. The record can contain:

- objective and repository scope;
- status and current owner/agent identity;
- decisions and constraints;
- checkpoints and handoff summaries;
- artifacts and evidence references;
- validation results and remaining blockers;
- timestamps and an append-only audit trail.

Raw conversations, credentials, hidden reasoning, and unfiltered terminal logs
are outside this record.

## Inspectable agent activity

Kody does not retain agent activity that the user cannot inspect. **Activity**
is the complete operational history, while **Shared Work** is the focused view
of meaningful progress, evidence, decisions, artifacts, and handoffs.

In **Activity → Agents**, an agent run is the main object and its MCP calls are
nested beneath it. A run contains the agent, repository, linked Shared Work,
start and end time, status, summary, result, evidence, and handoff. Each nested
call contains only the tool/action, outcome, and time; Kody does not store the
private raw transcript, prompt, hidden reasoning, arguments, or tool output.
Workflow runs and approvals should link into this same Activity timeline rather
than becoming separate hidden histories.

## Delivery phases

### Phase 1 — Contract and safety foundation

- Publish the MCP namespaces, schemas, versioning, pagination, idempotency, and
  structured error contract.
- Define tool metadata and the read/write/approval/admin permission model.
- Define authenticated user, organization, and repository scope.
- Define the shared work, progress, evidence, and handoff record.
- Define redaction, retention, audit, and secret-handling rules.
- Add contract tests before implementation.

Exit condition: the public contract and security boundary are executable and
covered by automated tests, even if the catalog contains only the initial safe
actions.

### Phase 2 — Secure remote MCP core

- Mount one canonical Streamable HTTP MCP endpoint in the Dashboard service.
- Add Kody access-token creation, expiry, revocation, repository scope, and
  hashed-at-rest validation. Credentials are accepted only in the
  `Authorization: Bearer` header, never in URLs.
- Implement the four facade tools from shared services, not UI components.
- Enforce permissions, input validation, request limits, rate limits,
  idempotency, redaction, audit events, and safe error responses.
- Verify MCP initialization, discovery, detail lookup, execution, rejection of
  invalid scope, and revoked/expired credentials.

Exit condition: at least two independent MCP clients can authenticate to the
same deployed endpoint and receive the same scoped catalog and durable results.

### Phase 3 — Shared work and context

- Expose goals, tasks, checkpoints, evidence, decisions, and handoffs.
- Add repository-scoped context and memory retrieval with provenance.
- Add agent attribution and conflict-safe updates.
- Show formal agent runs, nested MCP calls, and linked artifacts in
  **Activity → Agents** while keeping **Shared Work** focused on the work itself.

Exit condition: one agent can create or update work and a different agent can
continue it from Kody without receiving the first agent's raw transcript.

### Phase 4 — Policies, workflows, and approvals

- Expose reusable Kody policies, instructions, capabilities, workflows, and
  quality gates.
- Add approval requests and resumable execution.
- Apply the same authorization and audit rules to interactive and automated
  runs.

Exit condition: different coding agents execute the same Kody workflow with the
same policy and approval behavior.

### Phase 5 — Online automation and ecosystem hardening

- Add schedules, webhooks, event triggers, notifications, and remote monitoring.
- Publish compatibility fixtures and client setup guides for Claude Code,
  Codex, OpenCode, and other conforming MCP clients.
- Add usage analytics, quotas, reliability objectives, migration policy, and
  deprecation windows.

Exit condition: Kody can run and supervise online work while local coding agents
join, inspect, contribute, and hand off through the same durable system.

## Implementation ROI

| Capability | User value | Cost | Risk | Delivery priority |
| --- | --- | --- | --- | --- |
| Four-tool discovery facade | High: every agent gets Kody without context overload | Low | Low | First |
| Scoped access tokens | Critical: safe remote access | Medium | Medium | First |
| Shared work/evidence records | Very high: real cross-agent continuity and visibility | Medium | Medium | Next |
| Context and memory retrieval | High: reuse accumulated knowledge | Medium | Medium | Next |
| Policies and workflows | High: consistent behavior across agents | Medium | Medium | After shared work |
| Approvals and resumable runs | High for governed writes | Medium-high | Medium | After workflows |
| Online triggers and schedules | High for automation | Medium | Medium-high | Later |
| Local connector or agent launcher | Low for this architecture | High | High | Excluded |

## Non-goals for Phases 1–2

- launching, supervising, or updating local coding-agent processes;
- reading arbitrary local files through Kody;
- synchronizing raw vendor conversations or hidden model context;
- exposing every internal Kody function as a separate MCP tool;
- bypassing existing Kody service authorization or approval boundaries.
