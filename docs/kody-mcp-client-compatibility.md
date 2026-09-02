# Kody MCP client compatibility

Kody exposes one remote Streamable HTTP MCP endpoint:

```text
https://<your-kody-dashboard>/api/kody/mcp
```

Every client sends its repository-scoped Kody token only in the request header:

```text
Authorization: Bearer ${KODY_MCP_TOKEN}
```

Do not put the token in the URL or commit it in client configuration. Kody
supports Claude Code, Codex, OpenCode, Hermes Agent, and other clients that
implement MCP Streamable HTTP protocol version `2025-11-25`.

## Client setup contract

Configure the client with these values using that client's normal MCP settings:

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

Client-specific configuration syntax can change, but the Kody endpoint and
authentication contract do not. The live compatibility gate initializes Claude
Code and Codex against the deployed server; OpenCode and Hermes use the same
protocol fixture. Hermes is sampled locally while Codex is the complete release
validator.

## Compatibility and migration policy

- The four public facade tool names remain stable.
- Catalog actions are additive within a contract version.
- Breaking schema changes require a new contract version and at least 90 days'
  deprecation notice.
- `mcp.contract.get` reports the active version.
- `mcp.usage.get` reports scoped usage, quota, reliability objective, and the
  migration policy without revealing credentials or private transcripts.
