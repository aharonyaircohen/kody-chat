# Legacy Audit — GitHub→Convex Storage Migration Leftovers

Date: 2026-07-16. Audit only — no code changed. Verdicts: **DELETE** (provably unused), **RETIRE-AFTER-X** (used, but obsolete once condition X holds), **KEEP** (legitimately needed).

## Files skipped (uncommitted changes at audit time)

The chat/view-renderer refactor in flight touches these; noted but not audited for deletion:
`apps/dashboard/app/api/kody/chat/kody/{route,system-prompt,view-request}.ts`, `chat/tools/ui-tools.ts`, `src/dashboard/lib/view-renderers/*`, the mirrored `packages/kody-chat` copies of the same, `packages/base/src/kody-system-prompt.ts`, and their specs.

---

## Executive summary

- The suspected "legacy state-repo layer" in `@kody-ade/base` is **mostly still live**: `state-repo.ts`, `storage/github.ts`, `github-contents-write.ts`, `manifest-store.ts`, `kody-state.ts` all have live callers in the deployed dashboard and shared packages (CMS, agency, workspace, brain, terminal). The migration moved *entities* to Convex but many file-backed features (evidence logs, docs, changelog, vault, memory, audit manifests) still read/write the GitHub state repo.
- The real legacy mass is the **`packages/kody-chat` Next app shell**: a 78-route dev-harness fork of the deployed app (49 routes byte-identical, ~3.3k lines) plus a drifted duplicate `src/dashboard/lib` tree — but the package itself is load-bearing (dashboard imports its chat core/platform/plugins, and dashboard package exports point *into* its `app/api/**` for a dozen routes). Deletion must be per-file, not wholesale.
- **All polling fallbacks are gated on Convex being optional.** Every poll path (workflow-run 3s, chat events SSE/poll, entity refetchIntervals) is a fallback for when `NEXT_PUBLIC_CONVEX_URL` is unset. The single retirement condition unlocking ~1.9k lines: make Convex mandatory in all deployments.
- **Gist stores (inbox, channels-seen) are live and unmigrated** — flagged as migration debt, not legacy.

### Size of the cleanup

| Bucket | Approx. lines |
|---|---|
| DELETE now | **~3,370** (49 identical duplicate routes ~3,324 + deprecated chat stub 46) |
| RETIRE-AFTER Convex mandatory | **~1,900** (events stream 600 + events poll 103 + client SSE ~250 + client poll ~90 + reader/store helpers ~109 × 2 trees + workflow 3s poll ~24 + entity refetchIntervals ~70 + state-repo ETag invalidators ~150) |
| RETIRE-AFTER other conditions | **~13,500+** (kody-chat harness routes not identical/not exported ~13k + state-files route 106 + export-github route 158 + BackendManager github branch ~10) |
| Unmigrated (gists — migration debt, keep for now) | ~830 (inbox gist-store 299×2 + channels-seen 156+67) |

The duplicate `packages/kody-chat/src/dashboard/lib` tree totals **62,770 lines**; an unknown but large fraction is dead duplicate (dashboard imports only via the package export map). Quantifying that requires a per-file dependency trace from the export map — recommended follow-up.

---

## Category 1 — GitHub server functions

| File | LOC | Used by | Verdict |
|---|---|---|---|
| `packages/base/src/state-repo.ts` | 518 | Live dashboard routes (chat/trigger, chat/history fallback, state-files, dashboard-config, views, export-github, interactive-session) + workspace/agency/terminal/cms/brain packages | **KEEP** |
| `packages/base/src/state-branch.ts` | 2 | state-repo.ts | **KEEP** |
| `packages/base/src/kody-state.ts` | 201 | tasks routes, derive-column, TaskRunsList, github/issues — issue-comment task state, never migrated | **KEEP** |
| `packages/base/src/github-contents-write.ts` | 239 | repo-files, changelog, docs, engine/install, storage/github — SHA CAS retry for repo writes (not state data) | **KEEP** |
| `packages/base/src/manifest-store.ts` | 303 | push-server, notifications-server, inbox feed-server, agency goals-server, audit-store | **KEEP** |
| `packages/base/src/storage/github.ts` (+types/index) | 481+162 | Backs state-repo.ts and vault bootstrap; ETag/SHA CAS layer | **KEEP** (while state-repo lives) |
| `packages/base/src/storage/mongo.ts`, `cms-transport.ts` | 320+119 | CMS adapters | **KEEP** |
| `packages/base/src/branches/infra/github-branch-repo.ts` | 275 | branches subsystem (branch-service) | **KEEP** |
| `packages/kody-backend/scripts/export-github.ts` (+export-mapping.ts) | 85+11 | `pnpm --filter @kody-ade/backend export:github` only | **RETIRE-AFTER** migration window closes for all tenants |
| `apps/dashboard/.../company/backend/export-github/route.ts` | 158 | BackendManager.tsx "GitHub" export button | **RETIRE-AFTER** migration window closes (remove UI branch with it); sibling `export/route.ts` (Convex backup) is KEEP |
| `apps/dashboard/src/dashboard/lib/inbox/gist-store.ts` | 299 | inbox routes ×5 + chat inbox-tools | **KEEP — UNMIGRATED** (gist, not Convex; migration candidate, has `inbox` Convex table already) |
| `apps/dashboard/src/dashboard/lib/messages/channels-seen-store.ts` (+channels-seen.ts) | 156+67 | messages/read-state route | **KEEP — UNMIGRATED** (gist; `channelsSeen` Convex table exists) |

### The `packages/kody-chat` duplicate tree — verdict: partially legacy

Facts established:
- Own Next app (port 3344), **not deployed**: no vercel.json (only `apps/dashboard/vercel.json` exists), no CI deploy, root `dev` script points at it as a local convenience.
- **Load-bearing as a package**: `apps/dashboard` imports ~80 subpaths (`/core/*`, `/platform/*`, `/plugins/*`, `/pages/*`, `/components/*`, `/agents`, `/admin-pages`, and — critically — the chat engine `kody-chat-live-runner.ts` lives here).
- **Its `app/api` is partially load-bearing**: the package export map re-exports ~13 route files from `app/api/**` (client-auth/start, languages, triggers, user-state, system-events, snippets, chat system-prompt, user-state/position chat-tools) that `apps/dashboard` mounts as its own routes.

| Sub-tree | LOC | Verdict |
|---|---|---|
| 49 byte-identical duplicate routes under `packages/kody-chat/app/api` | ~3,324 | **DELETE** (exact copies of deployed `apps/dashboard` routes; none in the export map — verify each against the export list before removing) |
| Remaining harness routes (drifted copies + `system-events/emit-test`) minus the ~13 exported route files | ~13,000 | **RETIRE-AFTER** confirming the package's own dev harness / port-3344 e2e config doesn't need them |
| `packages/kody-chat/src/dashboard/lib/**` duplicates NOT reachable from the export map (gist-store copy, macros-files, reports-files, managed-goals-files, chat-events-reader/store, kody-store, user-state, dashboard-config store, …) | large share of 62,770 | **RETIRE-AFTER** per-file reachability trace from the export map (recommended follow-up task) |
| `src/dashboard/lib/chat/{core,platform,plugins}`, `components/`, `pages/`, `agents.ts`, etc. (export-map reachable) | — | **KEEP** |

---

## Category 2 — Polling logic

Global blocking condition: every fallback below is guarded by `NEXT_PUBLIC_CONVEX_URL` / `CONVEX_LIVE_ENABLED`. **Condition C = "Convex URL mandatory in every deployment."**

| Site | Interval | Convex live equivalent | Verdict |
|---|---|---|---|
| `apps/dashboard/src/dashboard/lib/hooks/useWorkflowDefinitions.ts` `useWorkflowRunState` poll block (~24 lines) | 3s while running | `workflowRuns.list` via `useWorkflowRunStateLive` — already wired | **RETIRE-AFTER C** (lowest-risk first removal) |
| `packages/kody-chat/.../components/kody-chat-live-runner.ts` interactive poll machinery (~90 lines) | 3s → `/api/kody/events/poll` | `chatEvents.since` via `convex-live-transport.ts` — already registered when Convex on | **RETIRE-AFTER C** |
| Same file, `connectSSE` block (~250 lines) → `/api/kody/events/stream` | SSE | Same transport | **RETIRE-AFTER C** + confirm SSE unused in prod |
| `apps/dashboard/app/api/kody/events/poll/route.ts` (103) + `stream/route.ts` (600, itself polls Convex at 15s) + `chat-events-reader.ts`/`chat-events-store.ts` (109) | server side | Clients subscribe to Convex directly | **RETIRE-AFTER C** (keep `/events/ingest` — write path) |
| `useActivity.ts` | 30s | `eventLog.recent`/`workflowRuns` could serve it | **RETIRE-AFTER** snapshot source confirmed Convex-derived |
| `useActivityFeed.ts` | none (manual) | — | **KEEP** (not polling) |
| `useActivityLog.ts`, `useAutonomousActivity.ts` | 30s/60s | None — GitHub audit/PR data | **KEEP** |
| Entity pollers: `KodyDashboard.tsx:349` tasks, `useGoals.ts`/`useManagedGoals.ts` (30–60s), `useInbox.ts` + `useInboxWatcher.tsx` (60s setInterval), `useKodyActionState.ts` (setInterval), `useChannelsUnread.ts` (60s), `useCompanyIntents.ts` (120s) | various | Convex tables exist (`taskState`, `goals`, `inbox`, `actionStates`, `channelsSeen`, `intents`) but **no client live hooks yet** (`useConvexLive.ts` covers only chatEvents + workflowRuns) | **RETIRE-AFTER** per-entity live hook added (trivially possible) |
| `packages/base/src/github/core.ts` ETag invalidators for migrated state categories (agents, prompts/commands, brands, memory, workflow-run/check files) ~150 lines | — | Reads already routed via Convex in `operation-files.ts`, `workflow-run-state-files.ts`, `macros-files.ts` | **RETIRE-AFTER** confirming no caller still does GitHub `getFile` per category |
| ETag core machinery + issue/PR/branch/CI caches (`issues.ts`, `prs.ts`, `branches.ts`, `status.ts`, `discussions.ts`) | ≥15s | None — live GitHub data | **KEEP** |
| `useHealth`, `useRemoteStatus`, `usePRBehind`, `useDefaultBranchCI`, `usePreviewUrl`, `useAgencyRuns`, UI clock/relative-time timers, extension scripts, `action/poll/[runId]` runner control channel | — | external/GitHub/Fly/UI | **KEEP** (`useAgencyRuns`: possible future RETIRE — `agencyRecords` table exists; verify source) |

Recommended retirement order: workflow 3s poll → `/events/poll` + client interval → `/events/stream` + `connectSSE` → ETag state invalidators → per-entity live hooks.

---

## Category 3 — Redundant server routes

| Route | LOC | Callers | Verdict |
|---|---|---|---|
| `apps/dashboard/app/api/kody/chat/route.ts` (deprecated stub, returns deprecation/410 payload) | 46 | none (grep clean) | **DELETE** (also delete its identical copy in packages/kody-chat) |
| `apps/dashboard/app/api/kody/state-files/route.ts` | 106 | `StateFilePage.tsx` ← `AgencyRunsPage` evidence viewer (`.jsonl` run logs still on GitHub) | **RETIRE-AFTER** evidence/log files move to Convex (delete route + StateFilePage + `app/state-files/[...path]/page.tsx` together) |
| `apps/dashboard/.../backend/export-github/route.ts` | 158 | BackendManager "GitHub" export button | **RETIRE-AFTER** migration window closes |
| `apps/dashboard/.../backend/export/route.ts` (Convex backup) | 98 | BackendManager | **KEEP** |
| `apps/dashboard/app/api/kody/events/{poll,stream}` | 703 | see Category 2 | **RETIRE-AFTER C** |
| `apps/dashboard/app/api/kody/events/ingest` | — | chat write path → Convex | **KEEP** |
| `packages/kody-chat/app/api/**` — 49 identical copies | ~3,324 | none (harness not deployed; not in export map — verify) | **DELETE** |
| `packages/kody-chat/app/api/**` — drifted copies + emit-test, minus export-map routes | ~13,000 | dev harness only | **RETIRE-AFTER** harness/e2e need confirmed absent |
| Middleware/rewrites | — | No middleware.ts; next.config rewrites reference no dead routes | clean |

---

## Riskiest item

**The `packages/kody-chat/app/api` tree.** It looks like a dead fork, but the dashboard's package export map mounts ~13 of its route files (`triggers`, `user-state`, `snippets`, `languages`, `system-events`, `client-auth/start`, chat system-prompt and chat-tools) as live production routes. A wholesale delete would break deployed endpoints. Delete only files that are (a) byte-identical to the dashboard copy AND (b) absent from `packages/kody-chat/package.json` exports — and run the dashboard build after (per the verify-host-builds rule).

## Recommended follow-ups

1. Make `NEXT_PUBLIC_CONVEX_URL` mandatory, then execute the RETIRE-AFTER-C bucket (~1.9k lines).
2. Per-file reachability trace of `packages/kody-chat/src/dashboard/lib/**` from the export map to size the duplicate-lib deletion (likely the largest single win inside 62.7k lines).
3. Migrate inbox + channels-seen off gists onto their existing Convex tables, then delete the gist stores (~830 lines).
