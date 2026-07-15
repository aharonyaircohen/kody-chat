# @kody-ade/backend

Convex backend for Kody — schema, functions, and DB-agnostic import/export
tooling. Built ahead of migration: nothing in the dashboard points here yet.
GitHub remains the engine's execution surface (repos, PRs, issues); this
package replaces GitHub-as-database for Kody's own state.

## Layout

- `convex/schema.ts` — all tables, partitioned by `repo` ("owner/name"), plus
  `login`/`userKey` for per-user rows. Two global tables (`actionStates`,
  `eventLog`) replace the Kody-Dashboard store repo.
- `convex/*.ts` — functions by domain: `workflows`, `chat`, `company`
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

## Migration day (planned)

1. Freeze writes.
2. `GITHUB_TOKEN=… STATE_REPO=… REPO=… pnpm --filter @kody-ade/backend export:github`
3. `CONVEX_URL=… pnpm --filter @kody-ade/backend import:convex --clear-repo owner/name`
4. Flip the dashboard/runners' storage adapters to the Convex client.

Dry-run steps 2–3 against a test deployment first. The dump doubles as a
portable backup; keep it.
