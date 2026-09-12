# Kody MCP client compatibility

Kody works with any client that implements the MCP Streamable HTTP standard.
Client brands are test samples, not a product allowlist.

## Connect

Open the repository-scoped **Agent connections** page:

```text
https://<your-kody-dashboard>/repo/<owner>/<repo>/mcp
```

Create a named connection, choose read-only or change-request access, and copy
the token when it is shown. Kody stores only its hash and cannot show it again.

Configure the client with the values shown on that page:

```json
{
  "name": "kody",
  "transport": "http",
  "url": "https://<your-kody-dashboard>/api/kody/mcp",
  "headers": {
    "Authorization": "Bearer ${KODY_MCP_TOKEN}"
  }
}
```

Keep `KODY_MCP_TOKEN` in the client environment. Never put the token in the URL
or commit it to a repository.

## Standard

The endpoint supports the current stateless MCP protocol `2026-07-28` and the
legacy Streamable HTTP revisions `2025-11-25`, `2025-06-18`, and `2025-03-26`.
Kody validates current-protocol routing metadata and negotiates the exact
supported legacy version requested by older clients.

Compatibility is defined by protocol behavior, not by a list of agent names.
The release gate uses multiple independent clients as representative samples
and also runs protocol-level conformance checks.

## Agent workflow

1. Call `kody_status` to confirm the repository and access scope.
2. Call `kody_search_tools` with words describing the task.
3. Call `kody_get_tool_details` for the selected action's schema, permission,
   side effects, approval policy, and example.
4. Use the returned `callTool`: `kody_read_tool` for reads, or
   `kody_execute_tool` for changes. Pass `{actionId, input}`; include a stable
   `idempotencyKey` for write or approval actions so retries cannot duplicate work.

For durable continuity, use `memory.search` or `memory.list` before relying on
unstated project context. Save only decisions, facts, preferences, or references
that another chat or coding agent will need. Use `memory.revise` with the latest
`expectedRevisionId`, and use `memory.history` when the source or change trail
matters. Retire stale knowledge instead of silently overwriting it.

Search ranks words from action IDs, titles, categories, and summaries. It finds
operations, not the contents of installed resources. Use a discovered list/get
action to inspect actual resources. An empty query lists the catalog; search
responses also provide available categories. `kody_status.grantedScopes`
reports the token's read/execute grants.

The read tool is marked read-only for standard client permission handling and
enforces read permission, no side effects, and no required approval on the
server. New catalog actions inherit this behavior from their existing metadata;
there is no client-name allowlist or second action registry. Token authorization
and audit logging still apply. Client policy remains authoritative.

Read-only tokens can use read actions. Change-request tokens can also update
shared Todo work and create approval requests; they cannot approve their own
requests. The connection form defaults to **This project only**, with memory
deletion disabled. Personal memory and memory deletion require separate choices.

API clients request the same project-only setting with `memoryScope: "repository"`
and disable deletion with `allowMemoryDelete: false`. `memoryScope: "all"`
includes personal memory. For compatibility, omitted fields retain the previous
API behavior (all memory scopes, and deletion for execute tokens). Existing tokens
are unchanged; replace them to reduce grants. These options restrict memory
permissions; `mcp:execute` still permits the existing work and approval-request actions.

## Compatibility and migration policy

The continuity candidate adds atomic memory write receipts and cursor-based
`memory.list`. Deployment status is tracked in `kody-mcp-clean-vps-evidence.md`;
do not assume the stable endpoint already has these changes.

- Retry the same memory write with the same connection, key, and exact payload.
  Receipts are valid for 30 days. A changed payload returns
  `idempotency_conflict`; a stale revision returns `revision_conflict`.
- Deletion scrubs saved memory snapshots from receipts. Retrying a deleted
  create cannot resurrect the memory; an exact deletion retry can succeed.
- Receipt expiry is logical, with lazy cleanup on key reuse. Automatic physical
  retention cleanup is not implemented.
- Writes made before receipts were deployed require reconciliation through
  record reads/history. The new guarantee cannot retroactively cover those
  writes. Rotating a token also starts a separate retry-key namespace.
- Follow `nextCursor` until absent. Cursors are signed and bound to the current
  identity and selected memory scopes. They are not a point-in-time snapshot of
  all concurrent changes.

- Existing public facade tool names remain stable. `kody_read_tool` is additive;
  older clients may still execute reads through `kody_execute_tool`, but that
  mixed-purpose tool conservatively retains its potentially destructive hint.
- Catalog actions are additive within a contract version.
- Breaking schema changes require a new contract version and at least 90 days'
  deprecation notice.
- `mcp.contract.get` reports the active contract version.
- `mcp.usage.get` reports scoped usage, quota, reliability objective, and the
  migration policy without revealing credentials or private transcripts.
