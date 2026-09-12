# Kody MCP: clean VPS resumption

Date: 2026-09-12
Status: implementation plan; clean VPS acceptance not yet run.

## Outcome

A user installs fresh Codex on a new VPS, connects Kody, provides separately authorized repository access, and continues real unfinished work without re-explaining its decisions or progress. No old Codex directory, session database, chat transcript, or machine image is copied.

This standalone plan supersedes the earlier readiness plan as the execution order for this journey; it does not rewrite that historical plan. Scheduled tasks are a later phase. Saving every reply is explicitly excluded.

Success means portable work continuity, not restoration of a running Codex process or its native conversation history. Code comes from Git or a verified work artifact referenced by Kody; credentials come from the user's authorized secret mechanism. Kody alone is not a backup of the machine.

## Baseline and evidence

- Live during planning: contract `2026-09-08.1`, repository `aharonyaircohen/kody-chat`, repository read/write grants, existing adoption Todo readable, and continuity preference searchable.
- Existing Todo: `kody-mcp-adoption-2026-09`. Reuse it for milestones and proof; do not make one Todo per reply.
- Existing preference: `ebf94202-d1cf-4b30-9575-a93923822c3a`. It says not to save every reply.
- Earlier session evidence includes native Hermes discovery/read and deployed token-management browser success. These are not fresh Codex or clean VPS proof.
- Historical retirement failure, personal identity inconsistency, retry/concurrency risks, and retrieval limits require revalidation. A historical diagnosis is not a confirmed current defect.
- Current local token-management edits and the canonical skill are not assumed committed or remotely retrievable. Inventory and release them before relying on them during bootstrap.

## State ownership

| State | Authoritative owner and transfer rule |
| --- | --- |
| Facts, preferences, decisions | Kody Memory with scope, evidence and current revision |
| Objective, status, blockers, next action | Existing Kody Todo record |
| Handoff, verification, artifact references | Todo checkpoints, evidence and artifact actions |
| Source code, project rules, canonical skills | Git; Kody records reachable revision and paths |
| Uncommitted work | Explicitly preserved WIP commit or supported artifact, with base revision and checksum |
| Dependencies and environment requirements | Versioned project setup instructions; Kody records references and needed credential names |
| Authentication, secrets, permissions | User-approved credential storage and native client enforcement; never Memory or Todo content |
| Active context, compaction, native goals/budgets, queues | Codex; reconstruct useful context from Kody, do not replace native databases |
| Terminals, processes, browser state, worktrees | Recreate on destination; do not claim process/session restoration |
| Scheduling | Deferred; no duplicate scheduler or wakeup integration in this phase |

## Owners and existing implementation surfaces

- MCP contracts and work: `apps/dashboard/src/dashboard/lib/mcp/action-services.ts`, `todo-work.ts`, and the public MCP route family. Extend existing actions before adding any new service.
- Memory correctness: `packages/memory/src/application.ts`, `packages/kody-backend/src/memory-store.ts`, and its existing Convex mutations. Inspect exact mutation ownership before edits.
- Scope and personal identity: token issuance route, existing principal resolution, and Memory API. Do not infer personal identity from a matching repository login.
- Agent recipe: `skills/kody-mcp/SKILL.md` and its references. Keep a single versioned source; client bootstrap only installs/configures it.
- Qualification: existing `apps/dashboard/scripts/verify-public-mcp*.mjs`, related integration tests, and mounted browser journeys.
- Codex bootstrap: supported Codex installation/configuration interfaces, checked against current official documentation during implementation. Do not edit private SQLite state or depend on undocumented restoration hooks.

## 1. Establish the real starting point

Inspect current source, dashboard candidate, backend deployment, token permissions, installed client, and available actions. Reproduce each relevant historical gap with disposable scoped fixtures before deciding to fix it. Record exact source/candidate/backend references and failures in the adoption Todo.

Acceptance: classify each readiness item as working, reproduced failure, or unverified. Existing green behavior is reused. Native memory remains enabled while the Kody path is being qualified.

## 2. Make continuity explicit and use it here

Configure this Codex client through its supported MCP interface with a dedicated attributable connection; the Hermes token used for initial probes is not the intended long-term Codex identity. Install the canonical skill and a small standing instruction. A restart/new session may be required; verify native discovery rather than equating direct HTTP calls with installed-client integration.

At task start: confirm scope, discover current actions, find the relevant Todo and memories, read them, and verify claims against the workspace. At meaningful milestones and before handoff: save changed knowledge, progress, evidence, and next action; read back significant writes. On outage, disclose the unsaved checkpoint instead of claiming persistence. No every-reply capture or new background scheduler.

Portable checkpoint contract, using existing fields first:

- Repository identity and clone URL; task identity, objective, status and scope.
- Reachable code revision, relevant paths, and dirty-work disposition.
- Current decisions and memory references, including revisions where supported.
- Completed work, remaining steps, blockers and one concrete next action.
- Test commands/results with environment and evidence references; separate local and deployed proof.
- Setup/skill version references, required tool versions and credential names only.
- Last verified timestamp, author/connection attribution, schema/version guidance.

If an existing action cannot preserve a required field safely, document that exact gap and extend the owning contract compatibly. Missing optional fields in old records must not break reads; missing essentials must produce an incomplete-handoff result, not invented values.

Acceptance: several real milestones from this task persist and can be found without supplying hidden record IDs to the next agent. No approval request or accepted write is labeled completed work without evidence.

## 3. Fix correctness exposed by the journey

Prioritize lifecycle correctness, identity isolation, safe retries and complete retrieval. Use the earlier readiness plan's detailed failure cases as tests, not as proof that every change is still needed.

- Memory: create/read/revise/history/retire; active recall excludes retired/expired records, explicit historical reads remain available. Delete only disposable fixtures with authorized credentials.
- Writes: stale revisions cannot overwrite; simultaneous retries do not duplicate; ambiguous timeouts are reconciled. Persist retry receipts atomically in the existing owner if current implementation cannot satisfy these guarantees.
- Retrieval: follow complete pagination, preserve scope/filter integrity, and test at least 200 records including stale and similar facts. Missing information must be reported as missing.
- Identity: repository-only trial stays isolated. Before claiming personal portability, prove UI-to-MCP and MCP-to-UI updates for the same account plus a second account's denial. Do not grant personal rights merely to make a test pass.
- Failure handling: expired/revoked token, lost response, unavailable Kody and inaccessible artifact produce clear recoverable blockers. Rotation must preserve authorized access to the same records without copying old secrets.

Acceptance: regression tests reproduce each changed boundary, then the real affected local and deployed paths pass. Personal portability remains separately unqualified until its account tests pass.

## 4. Publish a reproducible bootstrap and preserve code

Provide a small documented setup procedure using supported client configuration and the versioned skill. Do not embed credentials. User-supplied inputs are Kody endpoint/access, project selection and independently authorized Git access; model/client authentication is also required. Task selection is allowed; supplying the missing decisions or precise memory IDs is not.

Before handing off dirty work, inspect it and preserve only authorized files. Use an explicitly authorized reachable WIP commit or the existing artifact storage contract. Record base revision and checksum; exclude secrets and dependencies. If no authorized transfer exists, mark resumption blocked. Do not silently push all local files.

Acceptance: a new environment can fetch the exact skill and code, verify artifact integrity, install dependencies from versioned instructions, and validate MCP scope. A local-only commit, path or pending upload cannot satisfy portability.

## 5. Run the clean VPS acceptance test

Provision a disposable VPS only after its host, access and any cost are authorized. A local container can rehearse the procedure but does not count as VPS evidence. Start with no previous Codex data or mounted source-machine home directory.

1. Freeze the source checkpoint and evaluator's expected next action, relevant decisions and code state.
2. Install fresh Codex, authenticate separately, connect Kody and obtain repository access through the documented bootstrap.
3. Give a normal request: continue the selected unfinished project task. Do not paste a handoff, memory IDs or expected answers.
4. Agent discovers the task, fetches relevant context, restores the correct code revision and any preserved changes, and explains its next action with sources.
5. Agent performs the real next coding step, runs the relevant test, and persists result/evidence back to the same Kody work record.
6. Original client reads the new checkpoint. A second fresh process resumes from it rather than the previous process's context.
7. Repeat with interrupted save, stale memory, unavailable Kody, expired access and missing code artifact; require explicit blockers and safe recovery.

Minimum proof: three independent fresh-session journeys covering a repository decision, unfinished work with preserved code changes, and a blocker/handoff. At least one is on the clean VPS and completes a real coding step. Every journey must use the correct scope and state; zero foreign/stale-memory reliance or silently lost code. Save client/skill versions, source/candidate revisions, sanitized prompts/results, evidence and required user interventions.

This qualifies the documented setup and tested scope, not every Codex feature or every operating system. Cross-project/personal claims require their own scoped journeys before expanding the label.

## 6. Release and completion

Follow `docs/testing-policy.md`: root `pnpm verify`, applicable canonical browser and live gates, production build, and deployed candidate journeys. Record regression, typecheck/lint, mocked browser, live local, deployed live, clean VPS, commit/push and promotion separately. An unrelated failing gate remains a failure; record it without silently repairing unrelated work or calling the suite green.

During implementation, verify current script availability and deployment commands before use. Preserve old tokens/clients and existing Memory/Todo records; scope additions must not silently broaden grants. If migration is required, provide a tested compatible rollout and rollback. Do not drop native state or delete old memory as part of adoption.

Completion requires the clean VPS coding journey and cross-client readback, safe failure cases, remotely reachable code/setup artifacts, and all applicable release gates. Until then report the exact achieved layer: direct MCP persistence, native client setup, fresh-process continuity, or clean-VPS resumption.

## First implementation step

Revalidate the baseline, configure native Codex access here, and save a reproducible checkpoint for one real unfinished coding task. Use that first resumption attempt to select repairs. Scheduled tasks remain out of scope.
