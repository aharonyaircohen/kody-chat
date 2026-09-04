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
4. Call `kody_execute_tool`. Include a stable `idempotencyKey` for write or
   approval actions so retries cannot duplicate work.

Read-only tokens can use read actions. Change-request tokens can also update
shared Todo work and create approval requests; they cannot approve their own
requests.

## Compatibility and migration policy

- The four public facade tool names remain stable.
- Catalog actions are additive within a contract version.
- Breaking schema changes require a new contract version and at least 90 days'
  deprecation notice.
- `mcp.contract.get` reports the active contract version.
- `mcp.usage.get` reports scoped usage, quota, reliability objective, and the
  migration policy without revealing credentials or private transcripts.
