# Storage backend: Convex replaces GitHub-as-database

**Decision (Jul 2026):** Kody's own state moves from the GitHub state repo to
Convex. GitHub remains the engine's execution surface — repos, branches, PRs,
issues, CI — but stops being a database.

## Why

- The state repo forced every read/write through the GitHub contents API:
  rate limits, CAS retries, polling for freshness.
- Convex gives real queries, transactions, and live subscriptions (UI updates
  push instantly instead of re-fetching).
- One Convex deployment is multi-tenant: every table is keyed by `tenantId`,
  so all businesses share it. A business no longer needs a state repo — a repo
  is only required where the engine does code work.

## What lives where

| GitHub (engine workspace) | Convex (system of record) |
| --- | --- |
| Repos, branches, code | Workflow definitions and runs |
| PRs and issues the engine works on | Chat sessions, turns, events |
| Commits, reviews, CI runs | Intents, goals, agents, reports |
| | Config docs, macros, view renderers |
| | User state, notification prefs, inbox |
| | Engine action state + event log (global) |

GitHub artifacts are referenced by ID (repo, PR/issue number), not stored in.

## Where the code is

`packages/kody-backend` — schema, functions, four-layer test suite (unit /
integration / smoke / e2e), and migration tooling:

- `scripts/export-github.ts` — dumps the state repo to plain JSON (portable,
  backend-agnostic).
- `scripts/import-convex.ts` — loads a dump into a deployment.

See the package [README](../../../packages/kody-backend/README.md) for setup,
environments, and migration steps.

## Migration status

Convex is live: the dashboard's state layer reads and writes it via
`CONVEX_URL`. The Backend admin page (`/backend`) is the operator surface:

- **Export (backup from database)** — the standing backup tool. Reads every
  registry table from Convex (`importExport.exportTable`) and downloads a
  portable JSON dump. Run it routinely; the dump is the rollback artifact.
- **Export from GitHub (first migration)** — one-time path for a tenant still
  on a GitHub state repo: downloads the state repo as a tarball, maps files
  to backend tables, and produces the same dump format.
- **Import** — loads a dump into Convex (`importExport.importChunk`),
  optionally clearing the tenant first.

First-time tenant migration: Export from GitHub → Import (clear first).
Ongoing operations: Export (database) is the backup; GitHub is only the
engine's execution surface.

Follow-ups: paginate unbounded `.collect()` queries and batch `clearRepo`
for large tenants.

## Engine (kody2) chat transcript reads

The engine's chat runner (kody2 `src/chat/session-store.ts`) now reads the
session transcript from Convex (`chatTurns.list`) and appends its own turns
via `chatSessions.upsert` + `chatTurns.append`, falling back to the legacy
state-repo `sessions/<id>.jsonl` git-pull loop when Convex is not configured.

For the engine to use the Convex path, the repo that runs `kody.yml` needs
two **GitHub Actions secrets** (the workflow forwards all secrets to the
engine via `toJSON(secrets)` / `ALL_SECRETS`, so no `kody.yml` change is
needed):

- `CONVEX_URL` — the Convex deployment URL (same value the dashboard uses;
  see `packages/kody-backend/.env.local`).
- `KODY_SERVICE_KEY` — the service auth secret verified by
  `convex/lib/auth.ts` (same value as the deployment's `KODY_SERVICE_KEY`
  env var).

The tenant scope is derived from `GITHUB_REPOSITORY` (`owner/repo`), which
matches the dashboard's `tenantIdFor(owner, repo)`.

**Dual-write retirement:** the dashboard still writes `sessions/<id>.jsonl`
to the state repo (see `app/api/kody/chat/trigger/route.ts` and
`src/dashboard/lib/interactive-session.ts`) solely because engines without
the two secrets above still git-pull it. Once every engine repo has
`CONVEX_URL` + `KODY_SERVICE_KEY` set, delete the state-repo JSONL writes
and Convex becomes the sole transcript store.

### `KODY_LEGACY_SESSION_WRITE` flag

The legacy state-repo JSONL write is gated by the dashboard env var
`KODY_LEGACY_SESSION_WRITE` (helper:
`src/dashboard/lib/legacy-session-write.ts`):

- **What it gates:** only the GitHub `sessions/<id>.jsonl` dual-write in
  `app/api/kody/chat/trigger/route.ts` and
  `src/dashboard/lib/interactive-session.ts`. The Convex write path is
  unconditional and unaffected.
- **Default:** on — the legacy write happens unless the var is exactly `"0"`.
- **When it's safe to set `"0"`:** once every engine repo runs
  `@kody-ade/kody-engine` >= 0.4.381 with the `CONVEX_URL` +
  `KODY_SERVICE_KEY` Actions secrets set, so no runner git-pulls the JSONL.
  Flipping the var retires the dual-write without a deploy; deleting the
  gated code is the final cleanup step.
