# @kody-ade/backend

Convex backend for Kody — schema, functions, and DB-agnostic import/export
tooling. Built ahead of migration: nothing in the dashboard points here yet.
GitHub remains the engine's execution surface (repos, PRs, issues); this
package replaces GitHub-as-database for Kody's own state.

## Layout

- `convex/schema.ts` — all tables, partitioned by `tenantId` (currently the "owner/name" of the business repo), plus
  `login`/`userKey` for per-user rows. Two global tables (`actionStates`,
  `eventLog`) replace the Kody-Dashboard store repo.
  (intents/goals/agents), `repoStore` (config docs/reports/macros/renderers),
  `users` (user-state/prefs/inbox), `engine` (action state/event log),
  `importExport` (migration surface).
- `convex/_generated/` — placeholder stubs typed from the schema; `npx convex
  dev` overwrites them with real codegen.
- `scripts/export-github.ts` — dumps the GitHub state repo to plain JSON
  (`dump/<table>.json`), backend-agnostic.
- `scripts/import-convex.ts` — loads a dump into a Convex deployment.
- `src/client.ts` — server-side `ConvexHttpClient` factory (`CONVEX_URL`).

## First-time setup

```bash
pnpm --filter @kody-ade/backend dev   # logs in, creates the Convex project, live-syncs
```

Production deploys: `pnpm --filter @kody-ade/backend deploy` with
`CONVEX_DEPLOY_KEY` set (CI).

## Environments

Each Convex project has two deployments; apps pick one via `CONVEX_URL`:

- **dev** — your personal deployment. `pnpm dev` live-syncs functions to it
  and writes its URL to `.env.local` (gitignored). All local work and tests
  target this.
- **prod** — created on first `pnpm deploy`. CLI commands target it with
  `--prod`. CI deploys need a deploy key (`CONVEX_DEPLOY_KEY`), generated in
  the Convex dashboard — we don't have one yet.

Auth: `npx convex dev` login stores a personal access token in
`~/.convex/config.json`; no other credentials are needed locally.

Tests: smoke and e2e layers auto-skip unless `CONVEX_URL` is set — run
`export $(grep CONVEX_URL .env.local) && pnpm test` to exercise the live dev
deployment.

## Migration day (planned)

1. Freeze writes.
2. `GITHUB_TOKEN=… STATE_REPO=… REPO=… pnpm --filter @kody-ade/backend export:github`
3. `CONVEX_URL=… pnpm --filter @kody-ade/backend import:convex --clear-tenantId owner/name`
4. Flip the dashboard/runners' storage adapters to the Convex client.

Dry-run steps 2–3 against a test deployment first. The dump doubles as a
portable backup; keep it.
