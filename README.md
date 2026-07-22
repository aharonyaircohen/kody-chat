# Kody Monorepo

Kody platform monorepo containing the independently installable Kody Chat
library, the private Kody Dashboard chat adapter, feature packages, and host
apps.

## Layout

| Path                           | Package                         | Role                                                                                                                                                                |
| ------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/base`                | `@kody-ade/base`                | Platform layer: GitHub data layer (cache/ETag/rate-limit rules), auth, vault, storage, backend transport, events, infrastructure contracts/registry, UI kit, logger |
| `packages/kody-chat`           | `@kody-ade/kody-chat`           | Public embeddable React chat: generic contracts, frame, transport, host adapters, conversations, attachments, plugins, and styles                                   |
| `packages/kody-chat-dashboard` | `@kody-ade/kody-chat-dashboard` | Private Kody Dashboard integration: product agents, tools, routes, pages, persistence adapters, and Dashboard composition                                           |
| `packages/workspace` | `@kody-ade/workspace` | Content features: commands, context, instructions, brands, memory, todos (stores, chat tools, route handlers)                                                       |
| `packages/fly`       | `@kody-ade/fly`       | Fly.io surface: previews, runners, fly provider plugin, server orchestration, one-shot builder                                                                      |
| `packages/terminal`  | `@kody-ade/terminal`  | Terminal: local PTY sessions, remote bridge protocol/tokens, checkpoints                                                                                            |
| `packages/brain`     | `@kody-ade/brain`     | Brain runtime control plane + proxy (depends on terminal + fly)                                                                                                     |
| `packages/agency`    | `@kody-ade/agency`    | Agency: runs, goals, capabilities, agent file stores, trust ledger                                                                                                  |
| `packages/cms`       | `@kody-ade/cms`       | CMS: adapters, model, schema, MCP surface, routes/tools                                                                                                             |
| `apps/dashboard`     | `kody-dashboard`      | Operations dashboard host app (Next.js) — being shrunk to a shell                                                                                                   |

## Dependency rules (lint-enforced by review; keep the DAG)

```
public kody-chat ← dashboard adapter ← dashboard host
base, workspace, agency, cms, fly, terminal, brain ← dashboard adapter
base ← fly ← terminal ← brain
base ← agency, cms
```

- `packages/base` never imports feature or app code.
- The public `packages/kody-chat` package never imports Dashboard code, Kody
  feature packages, workspace dependencies, routes, secrets, or storage
  implementations.
- Dashboard-only behavior imports the private
  `@kody-ade/kody-chat-dashboard` adapter. The Dashboard and the public package
  share the same `KodyChatFrame`, so extraction cannot silently fork the base
  surface.
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
pnpm dev              # private Dashboard chat integration app (port 3344)
pnpm dev:dashboard    # dashboard app (port 3333)
```

## Documentation

- [UI design principles](docs/ui-design-principles.md) — guidance for keeping
  dashboard pages simple, clear, and easy to verify.

## Migration status

The public package boundary is represented directly by the filesystem:
`packages/kody-chat` is releasable, while product-specific code is isolated in
the private `packages/kody-chat-dashboard` adapter and `apps/dashboard` host.
Release publication and registry installation remain separate steps from this
source extraction.
