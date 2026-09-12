# Kody MCP service readiness plan

Date: 2026-09-09
Status: proposed; implementation and release are not completed.

## Destination

Make Kody a dependable shared service for personal chats and coding agents: connect, discover available operations, retrieve relevant knowledge, update it safely, record work, and resume that work from another client. Qualify the deployed service against measurable criteria before assigning an 8/10 rating.

This is a new service-level plan. It starts from the existing implementation and covers remaining correctness, usability, and evaluation work. The earlier memory implementation plan remains historical context; this document is sufficient to direct the new work.

## What the evidence actually says

The earlier 7/10 rating was an opinion, not a benchmark. Prior production probes discovered memory actions and successfully created, read, revised, searched, inspected history, and deleted a test memory. Retirement returned `internal_error`. A stale backend deployment is only a hypothesis. Recheck all live results against the candidate used for this plan.

Current source inspection found these gaps:

- MCP personal memory uses a GitHub-derived identity, while the signed-in Memory API prefers the Kody account identity. Separate successful CRUD tests do not prove that both interfaces see the same personal records.
- New connections automatically receive personal read rights; execute connections also receive personal and repository deletion rights. The issuance schema has no separate personal consent or deletion choice.
- Retry detection scans active memories and revisions outside the write transaction. It can miss concurrent writes, retired records, and records beyond the list cap. Create hashing excludes evidence; retry markers are not connection-bound. Delete has no persisted retry result.
- Memory listing stops at 100 records without a cursor. Search merges scopes and truncates before removing time-expired records, potentially hiding valid results.
- Local UI tests have passed individually but also failed intermittently. Their cause has not been established; calling this a shared-session race was premature.
- Fresh-agent recall, personal UI/MCP interoperability, and retrieval quality on a substantial collection remain unproved.

## Ownership and limits

Kody owns connection permissions, discoverable contracts, storage, retrieval, write correctness, durable work records, useful errors, and deployment reliability. Agent configuration owns when to consult memory, which facts to save, and when to checkpoint work. Evaluate the service and the agent recipe separately.

Keep facts, preferences, decisions, and references in Memory; goals, checkpoints, and handoffs in Todos; code in Git; credentials in Secrets. Extend existing owners. Do not introduce a second memory database, automatic transcript capture, or an agent launcher.

## Work packages

### 1. Establish the service baseline and fix the failing lifecycle

Record source revision, Dashboard candidate, actual backend target, contract version, granted scopes, and discovered actions. Inspect current deployment scripts before choosing commands. Reproduce retirement with a unique disposable fixture and correlate sanitized server/backend logs. Trace the actual failing boundary before changing code or deploying a backend.

Owners: MCP catalog and host action services, Memory application, Convex memory store and mutations.

Deliverables: reproducible lifecycle test, diagnosed failure with regression coverage, corrected error mapping, and a verified deployment path. Retirement means keeping the record/history while excluding it from normal recall; it does not imply a replacement record exists.

Acceptance: create → read/search → revise → history → retire → explicit historical read → delete succeeds through real MCP. Retired/expired content does not appear in normal recall; stale and invalid-state changes return useful errors. Fixtures and disposable connections are cleaned in `finally`, with cleanup responses checked. Run through the real local app and deployed candidate.

### 2. Unify personal identity and make permissions explicit

Bind optional personal access to the verified Kody account at issuance. Require personal opt-in and a separate deletion choice in the existing Agent connections form. Retain repository-only sessionless issuance and old-token compatibility without silently expanding rights. Inventory legacy identities before proposing migration; map only through verified account links.

Owners: token route/storage/principal, request-user provider, Memory runtime, existing connection and Memory pages.

Acceptance: a signed-in user creates personal memory in the UI, a token reads and revises that exact record, and the UI shows the revision; reverse the direction too. Two authorized repository connections for the same account share personal memory. Another account, another repository, missing grants, expired tokens, and revoked tokens must fail the appropriate access checks. Personal and repository UI views stay separated. Test distinct real accounts, not just mocked principal objects.

### 3. Make retries and competing edits safe

Replace evidence scanning with Memory-owned mutation receipts committed atomically with each write. Bind keys to connection and resolved scope, hash canonical validated action/input including evidence, and retain minimal result metadata for a documented 30-day retry window. Never retain deleted content in receipts. Return a defined original result or a safe deleted-record outcome, not an unrelated later revision.

Require observed revisions for overwrites and deletion; update existing UI callers accordingly. Add backward-compatible lifecycle metadata to history so retirement and expiry edits are distinguishable from content edits. Keep legacy records readable.

Acceptance: simultaneous duplicate creates yield one record; repeated revise/retire adds one revision; changed payload with the same key conflicts; two edits against one revision have exactly one winner. Lost-response retries work for every write, including delete. Test retired records, more than 100 existing records, evidence-only payload changes, separate connections, and deletion followed by replay. No replay resurrects or reveals deleted content.

### 4. Make recall complete and manageable

Implement bounded scope/filter-bound cursors for list/search/history through the existing Memory application/store. Continue past expired matches instead of treating a filtered page as exhausted. Define cross-scope ordering so one scope cannot suppress the other. Return summaries for discovery and full content through get. Keep existing context search compatible and consistent about expiry.

Use existing Memory feature actions for history, retirement, inactive-record inspection, and stale-edit recovery. Reuse its Files-style layout and transport; do not change the shared file manager without a verified contract gap.

Acceptance: traverse at least 200 stable fixture records without silent loss or duplicates; reject cursor scope/filter tampering. An initial page filled with expired matches cannot hide valid matches. UI edits, retirement, and expiry have consistent results through MCP and legacy context search. Exercise desktop/mobile and real persistence.

### 5. Prove service usability and fresh-agent continuity

Create a repeatable evaluator using the existing MCP verification scripts. Validate schemas/examples, discovery, read-only behavior, errors, reconnect, and supported protocol versions with independent clients. Client names are test samples, never an allowlist. Confirm advertised automation requests produce the expected approval or execution state and durable outcome; discovering an action is not execution proof.

Freeze 200 seeded memories and at least 20 questions before running retrieval tests. Include distractors, similar names, corrected facts, inactive records, and multiple scopes. Require correct active records in the top five for at least 18/20 supported text-search questions; report paraphrase-only performance separately. Do not claim semantic recall from lexical search.

Run ten fresh-agent tasks with endpoint access and ordinary task context, without memory IDs, target facts, or prescribed search commands. Require at least nine correct memory-dependent answers with returned sources and zero stale/foreign-memory use. Prove recovery after reconnect and a new process.

Complete three practical journeys: recall a personal preference, apply a repository decision while coding, and resume a Todo checkpoint/handoff in another client. Compare matched tasks with a written handoff. Record correctness, calls, elapsed time, and user intervention; do not infer benefit merely from successful storage.

Provide a portable agent recipe: search before relying on unstated context; save durable, sourced knowledge; use observed revisions; put progress in Todos; follow user authorization for deletion. Configuration quality is reported separately from service correctness.

### 6. Release with repeatable evidence

Run focused regressions and the existing root `pnpm verify`, canonical browser gate, and affected live journeys. Inspect script target selection before execution. Diagnose intermittent auth failures with traces and repeated sequential/concurrent runs rather than relying on a single rerun. Require five consecutive runs of the affected journeys without retries before calling the flakiness resolved; broader availability remains unmeasured.

Deploy only a reviewed candidate using verified Dashboard/backend targets. Repeat lifecycle, identity, permission, retry, and recovery gates against that exact candidate. Promote only within release authorization and repeat critical checks after promotion. Preserve unrelated worktree changes and keep commits scoped.

Deliver a sanitized evidence report with source/candidate/backend references and separate statuses for regression tests, typecheck/lint, mocked browser, real local browser, deployed candidate, production build, commit/push, and production promotion. A blocked gate stays unverified.

## Scoring and stop conditions

Score each category 0 for missing/failed behavior, 1 for partial evidence, and 2 for its acceptance criteria passing:

| Category | Maximum | Required evidence |
| --- | --- | --- |
| Connection and tool usability | 2 | Independent clients, discovery, contracts, useful errors, reconnect |
| Identity and permissions | 2 | Real UI/MCP personal round trip, consent, isolation and revocation |
| Durable write correctness | 2 | Full lifecycle, concurrency, retries and deletion guarantees |
| Retrieval and continuity | 2 | Fixed retrieval and fresh-agent evaluation thresholds |
| Operational reliability and useful work | 2 | Repeated deployed checks and three completed work journeys |

Award 8/10 only with at least eight earned points, full marks for identity/permissions and write correctness, and no known failing core production action. These are explicit project criteria, not an industry certification. Do not award points merely for adding features or passing mocks.

Stop personal rollout if account linkage cannot be verified. Stop promotion for an unresolved permission leak, lost/duplicate write, deleted-content exposure, or failing lifecycle. If recall misses the threshold, measure the misses and improve the existing retrieval owner before choosing new infrastructure.

## Implementation handoff

Execute packages 1–6 in order, adding regression coverage at each actual failure boundary. Revalidate the baseline first; do not redo existing work just because it appeared in an older plan. Record findings and remaining gates in the existing Kody work system when execution begins. This planning task does not implement or deploy the changes.
