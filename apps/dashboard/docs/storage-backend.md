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
  backend-agnostic; doubles as backup).
- `scripts/import-convex.ts` — loads a dump into a deployment.

See the package [README](../../../packages/kody-backend/README.md) for setup,
environments, and migration-day steps.

## Migration plan

Built and tested ahead of migration; the dashboard still runs on GitHub state
until we flip. Cutover: freeze writes → export → import → point the
dashboard's state layer at Convex (`CONVEX_URL`) → verify → retire the GitHub
paths. Rollback safety is the JSON dump, not a permanent dual backend.

Post-migration follow-ups: paginate unbounded `.collect()` queries, batch
`clearRepo` for large tenants, and add an admin page for backend status +
export/import so operators never need the CLI.
