# Kody Monorepo

Kody platform monorepo: the `@kody-ade/kody-chat` product plus its layered
feature packages and host apps. Migrated from the separate Kody-Dashboard
repo (imported here with full history under `apps/dashboard`).

## Layout

| Path                 | Package               | Role                                                                                                                                                                |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/base`      | `@kody-ade/base`      | Platform layer: GitHub data layer (cache/ETag/rate-limit rules), auth, vault, storage, backend transport, events, infrastructure contracts/registry, UI kit, logger |
| `packages/kody-chat` | `@kody-ade/kody-chat` | Chat product: core, platform, plugins, shared pages/components; also a standalone Next.js host app                                                                  |
| `packages/workspace` | `@kody-ade/workspace` | Content features: commands, context, instructions, brands, memory, todos (stores, chat tools, route handlers)                                                       |
| `packages/fly`       | `@kody-ade/fly`       | Fly.io surface: previews, runners, fly provider plugin, server orchestration, one-shot builder                                                                      |
| `packages/terminal`  | `@kody-ade/terminal`  | Terminal: local PTY sessions, remote bridge protocol/tokens, checkpoints                                                                                            |
| `packages/brain`     | `@kody-ade/brain`     | Brain runtime control plane + proxy (depends on terminal + fly)                                                                                                     |
| `packages/agency`    | `@kody-ade/agency`    | Agency: runs, goals, capabilities, agent file stores, trust ledger                                                                                                  |
| `packages/cms`       | `@kody-ade/cms`       | CMS: adapters, model, schema, MCP surface, routes/tools                                                                                                             |
| `apps/dashboard`     | `kody-dashboard`      | Operations dashboard host app (Next.js) — being shrunk to a shell                                                                                                   |

## Dependency rules (lint-enforced by review; keep the DAG)

```
base ← kody-chat ← (hosts)
base ← workspace ← kody-chat
base ← fly ← terminal ← brain
base ← agency, cms
```

- `packages/base` never imports feature or app code.
- Feature packages never import host apps or `@kody-ade/kody-chat`
  (exception: none today — the workspace cycle was broken).
- Host-owned collaborators are injected via startup hooks in each host's
  `instrumentation.ts` (`setEventFlushScheduler`, `setTrackedBranchesReader`,
  `setBrainServiceResolver` + `registerBrainHostHooks`).
- UI panels that need the host `AuthContext`/api client stay host-side —
  one React context instance per host (see step-5 note in
  `apps/dashboard/docs/package-split-plan.md`).

## Commands

```bash
pnpm install
pnpm typecheck        # all packages
pnpm test:unit        # all packages
pnpm dev              # kody-chat app (port 3344)
pnpm dev:dashboard    # dashboard app (port 3333)
```

## Migration status

Steps 1–9 of `apps/dashboard/docs/package-split-plan.md` are complete.
Remaining: shrink `apps/dashboard` further (host components/hooks/api
client), then archive the old Kody-Dashboard repo. Known debt: `next`
peer dependency in base (`auth.ts` uses NextRequest values), env-driven
BRAIN_*/bridge config reads, host-side fork copies of pure host glue
(company, inbox, activity feed).
