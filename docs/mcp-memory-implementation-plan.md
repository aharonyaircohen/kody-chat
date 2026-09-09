# Complete memory lifecycle through Kody MCP

Status: core MCP memory lifecycle implemented locally; UI identity interoperability, receipt-backed idempotency, pagination, and deployment remain follow-up gates.

## Outcome and scope

A coding agent can save, discover, read, correct, retire, inspect history, and delete durable knowledge. A fresh agent can find that knowledge without receiving memory IDs or the previous conversation. Personal knowledge belongs to the authenticated Kody account; repository knowledge belongs to the authorized repository. The existing Memory pages and MCP must read and write the same records.

Keep preferences, facts, decisions, and references in Memory; goals, progress, and handoffs in Todos; code in Git; credentials in Secrets. Do not copy raw conversations or hidden reasoning into memory. Do not add an agent launcher, autonomous capture mechanism, second memory database, or separate MCP memory UI. This work enables agents to manage memory; their configuration still owns when to call it.

## Verified ownership and gaps

Paths below are repository-relative and were inspected during planning.

| Owner                                                                                                         | Existing responsibility                                                    | Required work                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/memory/src/domain.ts`                                                                               | Kinds, scopes, permission checks, content/revision validation              | Lifecycle transitions, revision concurrency contract, expiration semantics                        |
| `packages/memory/src/application.ts`                                                                          | `createMemoryApplication`: remember/get/list/search/correct/history/forget | Expected revision on writes, retirement and bounded retrieval; preserve non-MCP consumers         |
| `packages/kody-backend/src/memory-store.ts`                                                                   | Convex implementation of MemoryStore                                       | Transactional write options and pagination; preserve shared ownership                             |
| `packages/kody-backend/convex/memories.ts` and `memoryValidators.ts`                                          | Persist memories and revisions, scope authorization, indexed search        | Atomic retry protection, lifecycle revisions, expiry filtering, pagination                        |
| `packages/workspace/src/memory/runtime.ts`                                                                    | Compose application, principal, store                                      | Reuse composition; explicitly restrict MCP scopes                                                 |
| `packages/workspace/src/routes/memory-route-shared.ts`, `memory.ts`, `memory-id.ts`                           | Authenticated Memory UI/API callers                                        | Align identity and revision handling with MCP; expose retirement/history through existing feature |
| `packages/kody-chat-dashboard/src/dashboard/lib/mcp/catalog.ts`                                               | Action schemas, permissions, discovery, execution                          | Add memory actions; retain `context.search` compatibility                                         |
| `apps/dashboard/src/dashboard/lib/mcp/action-services.ts`                                                     | Mounted host services                                                      | Compose and call Memory application; no separate direct database CRUD                             |
| `packages/kody-chat-dashboard/src/dashboard/lib/mcp/contracts.ts`, `access-token.ts`; package MCP token route | MCP principal and token issuance                                           | Explicit memory grants and canonical account binding                                              |
| `packages/kody-backend/convex/mcpAccessTokens.ts`, `mcpAuditEvents.ts`                                        | Token persistence and activity                                             | Add account binding/grants without broadening old tokens; metadata-only audit                     |
| `apps/dashboard/src/dashboard/features/memory/components/MemoryFilesPage.tsx`                                 | Personal `/memory` and repository `/repo/:owner/:repo/memory`              | Show the same records, lifecycle/history, correct stale edits                                     |
| `apps/dashboard/app/(chat-rail)/mcp/page.tsx`                                                                 | Mounts `McpConnectionsManager`                                             | Extend existing connection form and grant display                                                 |

Important verified gaps:

- Public MCP currently exposes repository `context.search`, not memory writes or personal-memory access.
- MCP search uses `github:<numeric ID>` as actor identity. The Memory HTTP context prefers the Kody account's `hostUser.id`. Never assume these identifiers address the same personal memory.
- `createMemoryRuntime` normally includes personal scope for user actors. Do not pass those default scopes to an MCP caller without checking grants.
- `correct` reads the latest revision internally. The backend checks that revision atomically, but an agent's stale read is not currently supplied as an explicit precondition.
- Status values include active/superseded/expired, but the application has no explicit retirement operation. A status enum is not a complete lifecycle.
- Search selects active rows but does not compare `expiresAt` to current time. List/history are unpaginated; multi-scope search concatenates results and slices, favoring the first scope.
- Current memory writes do not expose transactional idempotency. Approval-request idempotency is a different operation and must not be reused as if it protected memory writes.

## Public contract decisions

Retain the five facade tools. New catalog actions use `kody_read_tool` or `kody_execute_tool`; do not add a tool per memory operation to the top-level client tool list.

Public scope is `repository` or `personal`. Requests never accept arbitrary user IDs, tenant IDs, authors, timestamps, or revision IDs for new revisions. Resolve these on the server from the verified token. Existing repository tokens remain repository connections; optional personal access binds to the issuing Kody account. Repository-free personal connections are a separate product extension, not needed for coding-agent memory in this release.

| Action           | Input                                                                                      | Output                                                     |
| ---------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `memory.create`  | scope, kind, content, evidence, reason, optional expiresAt                                 | memory and current revision                                |
| `memory.get`     | scope, memoryId                                                                            | memory and current revision, including lifecycle state     |
| `memory.list`    | scope, optional kind/status, cursor, limit                                                 | summaries and opaque nextCursor                            |
| `memory.search`  | scope, query, optional kind, cursor, limit                                                 | matching summaries, source/revision references, nextCursor |
| `memory.revise`  | scope, memoryId, expectedRevisionId, full kind/content/evidence/reason, optional expiresAt | updated memory and revision                                |
| `memory.history` | scope, memoryId, cursor, limit                                                             | ordered revisions and nextCursor                           |
| `memory.retire`  | scope, memoryId, expectedRevisionId, reason, evidence                                      | updated inactive memory and lifecycle revision             |
| `memory.delete`  | scope, memoryId, expectedRevisionId, reason                                                | deleted: true and memoryId                                 |

All mutations additionally require the existing facade `idempotencyKey`. Return generated IDs; callers do not invent them. Explicit scopes make multi-repository/personal mixing visible. Clients may issue separate searches for each granted scope; do not silently concatenate private and repository results.

Proposed limits: title 200 characters, summary 1,000, body 20,000, reason 2,000; 1–20 evidence references; each reference string at most 2,000; query 500; result limit 1–20, default 10. Reuse existing kinds/evidence sources. A source reference records provenance, not proof that the claim is correct. For agent-created notes, use an actual work/document/run reference rather than labeling generated assertions as user input.

List/search return content summaries by default; get returns the full body. History is ascending by stable revision order. Cursors are opaque and bound to scope and filters; reject mismatches. Empty search query is invalid: use list. Normal retrieval excludes superseded, expired, and time-expired entries. Explicit get/history can inspect inactive records and must label them as such. Never return deleted bodies from history or retries.

Retire maps to the existing `superseded` status and preserves history. It means 'no longer current'; it does not imply another memory was created. Corrections keep a stable memory ID and add a revision. Reject revise/retire on inactive records in the initial contract; restoring knowledge requires creating a new active record referencing the retired source. Expiry changes are revisioned; filtering must work immediately without relying on a scheduler.

Structured errors: invalid_input, insufficient_scope, not_found, revision_conflict, idempotency_conflict, invalid_state, rate_limited, service_unavailable. Include currentRevisionId only when the caller may read that memory. Treat foreign IDs as not_found. Avoid raw backend errors and private content in diagnostics.

## Identity and permission design

Add explicit grant strings: `memory:repository:read`, `memory:repository:write`, `memory:repository:delete`, and corresponding `memory:personal:*` grants. Write/delete imply read in the issuance form. Personal access is off by default; deletion is separately selectable and clearly described as deleting revision history too. Require explicit user authorization before an agent performs deletion even when its token technically permits it.

Existing `mcp:read`/`mcp:execute` remain necessary for their facade calls but are insufficient for new memory actions. Old tokens keep existing repository `context.search` behavior and receive no new mutation or personal rights. `context.search` retains its schema and response shape, but delegates to the shared application so expiry behavior is consistent. Add action-specific grant checking to catalog execution, not merely discovery; memoryId-based operations recheck record scope in the store.

Personal grants require an authenticated Kody session at token issuance. Persist the canonical account ID resolved by the host user provider alongside the existing verified GitHub identity. Never accept an account ID from the request body. Sessionless legacy token creation continues for repository-only connections. Revocation/expiry applies to all granted scopes; reauthorization requires replacing the token, not silently upgrading it.

Identity release gate: prove a UI-created personal record is readable through a newly granted token and vice versa. Inspect the host provider/account linkage before writing migration code. If legacy `github:*` personal records exist, inventory counts/ownership without printing content and map only through verified account links. Never merge accounts based on matching email or user-supplied IDs. Unresolved identity mappings block personal rollout; repository behavior may remain backward compatible.

## Atomic writes, history, and retrieval

Extend the existing Memory domain/application/store rather than building CRUD only inside the MCP catalog. Preserve current UI/engine callers with compatible entry points; update the UI correction caller to send its observed revision. At the Convex mutation, compare expectedRevisionId with the stored revision before any mutation. Two concurrent corrections against one revision must yield exactly one success.

Implement a memory-owned mutation receipt in the same Convex transaction as memory/revision writes. Key it by connection identity, resolved memory scope, and idempotencyKey; hash action ID plus normalized validated input. Same key/same payload returns the original outcome, same key/different payload conflicts. Persist resulting IDs/revision metadata, not duplicate content. Store deletion receipts so a lost response can be retried. Once a memory is deleted, previous receipts must not resurrect or reveal it. Document receipt retention and test retries within it; do not claim unlimited deduplication. Proposed initial retention: 30 days, with documented expiry.

Retirement and expiry edits need revision state metadata because the current revision records only content. Add backward-compatible optional lifecycle fields; interpret absent legacy fields according to the historical content revision rather than inventing a retirement event. Deletion removes memory and revisions as today; audit retains only operation/actor/scope/ID/outcome metadata. Never store tokens, full requests, memory bodies, or copies of deleted evidence in audit logs.

Use the existing indexed text search first. Apply bounded cursor pagination without post-filtering a single 20-row page and falsely reporting no results. Rank within the requested scope; keep stale content out. Semantic retrieval is not claimed by this release. If the retrieval evaluation fails realistic paraphrases, report the failure and investigate an extension to the existing retrieval owner; do not automatically introduce a vector database.

## UI and actual caller integration

User goal: choose what an agent may remember and inspect/correct that knowledge later.

Extend `McpConnectionsManager` using the standard-content page pattern (`/secrets`, `PageShell`/`PageHeader`); inspect its current implementation before changes. Add only personal-memory access and memory write/delete choices needed for distinct permission decisions. Show granted scopes on existing connection rows and explain old-token replacement.

Memory retains the Files-style page (`/files` reference, existing `DashboardFilesPage` transport adapter). Add history, retirement, and conflict messages through feature-owned actions/dialogs and transport. Do not edit the shared file manager; if its public contract is insufficient, stop and identify the exact gap for approval. Repository memory must never appear in personal `/memory`, or the reverse. Keep inactive records inspectable through a feature-owned filter rather than disappearing permanently from management.

Critical integration assertions: package catalog -> mounted host action service -> Memory application -> Convex transaction -> existing Memory page. UI correction -> same application/store -> MCP retrieval. Tests that call a formatting/helper function with hand-supplied context do not satisfy these assertions.

## Implementation sequence

1. Inventory current branch/diff, applicable instructions, identity provider/linkage, token manager, backend auth wrappers, and relevant tests. Preserve unrelated changes, especially prior issue #128/Brain work. Record baseline findings.
2. Add failing domain/backend tests for stale revisions, retries, retirement, expiry, pagination, and permission leakage. Extend existing shared owners and validators; add compatibility tests for older records/callers.
3. Implement canonical account token binding and memory grants. Test sessionless issuance, missing personal consent, wrong account, expiry, and revocation before exposing personal actions.
4. Add schemas, catalog execution checks, host services, error mapping, and legacy search adaptation. Update public connection docs and contract fixtures/examples.
5. Connect existing Memory UI callers and connection controls. Add browser coverage for desktop/mobile, grant issuance, stale edits, history, retirement, deletion, and scope separation.
6. Run focused regressions/typecheck/lint and root verification. Run real local journeys, then deploy an isolated candidate containing only reviewed scope and repeat against it. Promote production only under deployment authorization and after required candidate gates pass.
7. Save durable work checkpoints, evidence, final commit/candidate references, and remaining limitations. Revoke disposable connections and delete only clearly tagged test data. Keep the actual implementation work record and sanitized evaluation report.

## Verification specification

Extend existing tests: `packages/memory/tests/domain.spec.ts`, `application.spec.ts`; backend memory integration/store tests; `packages/workspace/tests/unit/memory-routes.spec.ts`; package `tests/int/public-mcp.int.spec.ts`; Dashboard MCP-management and memory browser journeys. New test files should describe uncovered boundaries, not duplicate suites.

Required cases: all actions through the public facade; malformed input; complete evidence/history; UI/MCP interoperability; old tokens/old search; wrong repository/account; personal grant absent; read-only token writes denied; revoked/expired token denied; simultaneous revision conflict; retry after lost response; changed-payload retry rejected; retirement/expiry omitted from search even when inactive matches fill a page; cursor scope tampering; deletion removes history and retry content; no sensitive content in logs.

Real local and deployed-candidate procedure:

1. Use dedicated account/repository and named disposable tokens. Preflight actual sign-in, repository access, and backend identity; an HTTP 200 alone is not proof credentials are present. No mocked account session or intercepted feature request.
2. Agent A creates a preference, decision, fact, and reference using MCP. Inspect those exact IDs through the real Memory UI; edit one in the UI and retrieve its new revision through MCP.
3. Agent B starts with no conversation history, no IDs, no target fact, and only endpoint/access plus a natural task. It discovers/searches memory, uses the right knowledge, and cites the returned revision/source. Providing an exact retrieval command is a transport smoke test, not discovery proof.
4. Agent A corrects a fact. A new Agent C retrieves the correction, not the original. Demonstrate retirement, time expiry, history inspection, and explicitly authorized deletion. Repeat after reconnect/process restart.
5. Test personal access across two authorized repository connections for the same account; deny the same record to another account and to a token without personal grants. Deny cross-repository access independently.
6. Seed a reproducible collection of 200 memories with at least 20 evaluation questions, similar names, conflicting old revisions, inactive records, and irrelevant distractors. Freeze questions/expected results before running. Require every scope/staleness safety case to pass and at least 18/20 relevant active records in the top five for supported text-search queries. Report paraphrase-only misses separately; never describe lexical search as general semantic recall.
7. Record per-question retrieval accuracy, correctness of agent answers, calls, elapsed time, and manual intervention. Compare a matched task with an ordinary written handoff; report observed benefit rather than asserting Kody saved time merely because CRUD worked.

Use `rtk` for shell commands. Inspect current scripts/config before executing. Root gate is `rtk pnpm verify`; canonical browser gate is `rtk pnpm --filter kody-dashboard test:e2e:gate`; live matrix is `rtk pnpm --filter kody-dashboard test:e2e:live:gate`. Inspect live-gate argument parsing before invocation: do not assume `--help` is read-only or that default BASE_URL is local. Start only the needed Dashboard server for UI checks; avoid inadvertently syncing unrelated backend changes with root `pnpm dev`. Backend changes in this implementation need an explicitly verified development/candidate deployment target.

Completion report separates regression tests, typecheck, lint, mocked browser, real local browser, deployed candidate, production build, commit/push, and production deployment. State passed/failed/not run with evidence. An unrelated Activity approval test cannot verify Memory or issue #128. No success claim while personal identity, runtime caller wiring, retrieval evaluation, or required live checks remain unresolved.

## Handoff to the implementing agent

Read this plan and current owners; implement the complete accepted scope in sequence. Revalidate live paths because concurrent work may have changed them. Do not infer personal identity mappings or invent new stores. Preserve user changes. Record actual outcomes and blockers in Kody Todos; do not delete that record as cleanup. Source inspection and helper tests alone are insufficient. Present the final diff and exact local/candidate evidence before any production-release claim.
