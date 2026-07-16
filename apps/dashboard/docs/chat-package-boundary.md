# Chat Package Boundary Inventory

Date: 2026-07-16. Phase 2 of the legacy consolidation (see `docs/legacy-audit.md`).

Enumerates every module `apps/dashboard` imports from `@kody-ade/kody-chat`, across all
three alias forms, and classifies each: **CORE** (stays in the package — chat
core/platform/plugins/product surface) vs **DASHBOARD-OWNED** (moves back into
`apps/dashboard/src/dashboard/lib`).

## Alias forms in play

| Form | Definition | Example |
|---|---|---|
| Export map | `node_modules/@kody-ade/kody-chat/package.json` `exports` | `@kody-ade/kody-chat/platform` |
| Deep alias | `tsconfig.json` `@kody-chat/* → node_modules/@kody-ade/kody-chat/src/dashboard/lib/*` (mirrored in `next.config.mjs` turbopack/webpack + `vitest.config.ts`) | `@kody-chat/user-state` |
| Raw src path | literal `node_modules/@kody-ade/kody-chat/src/...` strings | source-text assertions in `tests/unit/*surfaces*.spec.ts` |

## Finding

**Every imported module is CORE.** Each deep-alias target is also consumed by the
package's own exported routes/pages (verified by grep inside `packages/kody-chat`):

- `user-state/*` — used by the package's exported `routes/kody/user-state*`, `system-events`, chat route
- `snippets/*` — used by exported `routes/kody/snippets*` and `pages/client-brand`
- `auth/unified-actor` — used by exported `system-events` + `user-state` routes
- `client-auth/*`, `client-brand` — used by exported `routes/client-auth-start` + client pages, and already have export-map subpaths
- `chat/plugins/{terminal,vibe}/*`, `chat/surface/MessageList`, `components/kody-chat-*` — chat platform internals

Nothing the dashboard imports is dashboard-domain code stranded in the package, so
**Phase 3 is a repoint, not a move**: give the handful of deep-alias targets proper
export-map subpaths, rewrite `@kody-chat/*` imports to `@kody-ade/kody-chat/*`, and
delete the deep alias from tsconfig/next.config/vitest. The dashboard-domain
*duplicates* inside `packages/kody-chat/src/dashboard/lib` (gist-store, macros-files,
kody-store, …) are imported by **nobody** in the dashboard — they are Phase 5
deletion candidates, not moves.

## Export-map imports (all CORE, already proper subpaths)

Counts are import-site occurrences across `app/`, `src/`, `tests/`.

| Specifier | Sites |
|---|---|
| `@kody-ade/kody-chat/platform` | 55 |
| `@kody-ade/kody-chat/platform/server-tools` | 7 |
| `@kody-ade/kody-chat/platform/plugin-tools-config` | 6 |
| `@kody-ade/kody-chat/core/reasoning` | 6 |
| `@kody-ade/kody-chat/plugins/commands` | 5 |
| `@kody-ade/kody-chat/platform/surface-scope` | 5 |
| `@kody-ade/kody-chat/core/page-context` | 5 |
| `@kody-ade/kody-chat/platform/registry` | 4 |
| `@kody-ade/kody-chat/platform/agent-entries` | 4 |
| `@kody-ade/kody-chat/core/kody-chat-live-session` | 4 |
| `@kody-ade/kody-chat/plugins/goals` | 3 |
| `@kody-ade/kody-chat/platform/capabilities` | 3 |
| `@kody-ade/kody-chat/core/vision-support` | 3 |
| `@kody-ade/kody-chat/core/preview-context` | 3 |
| `@kody-ade/kody-chat/components/MobileMenu` | 3 |
| `@kody-ade/kody-chat/plugins/{vibe,settings,secrets,models,memory,instructions,context,commands-page,brands,branding}` | 2 or 1 each |
| `@kody-ade/kody-chat/platform/{tools,default-entry,types,trace,i18n}` | 2 or 1 each |
| `@kody-ade/kody-chat/core/transports/{kody-direct,brain,kody-live,envelope,transport-types}` | 1–2 each |
| `@kody-ade/kody-chat/core/{tool-call-strip,reasoning-adapter,openai-compatible-request,kody-chat-reducer,attachment-text,user-message-format,use-chat-sessions,rehydration,conversation-compaction}` | 1–2 each |
| `@kody-ade/kody-chat/components/{LanguagesManager,KodyChat,SecretsManager,ModelsManager,InstructionsManager,CommandsManager,ChatShell}` | 1–2 each |
| `@kody-ade/kody-chat/pages/{view-renderers,view-renderer-detail,triggers,snippets,settings,secrets,models,memory,memory-detail,instructions,context,context-detail,commands,client-brand,brands,brand-detail}` | 1 each |
| `@kody-ade/kody-chat/routes/kody/{user-state,user-state-detail,triggers,triggers-detail,system-events,snippets,snippets-detail,languages,languages-detail}` + `routes/client-auth-start` | 1 each |
| `@kody-ade/kody-chat/chat-tools/{user-state,position}` | 1 each |
| `@kody-ade/kody-chat/{agents,admin-pages}` | 1 each |

## Deep-alias (`@kody-chat/*`) imports — all CORE, to be repointed in Phase 3

Non-test importers:

| Specifier | Importing file | Phase 3 action |
|---|---|---|
| `@kody-chat/user-state` | `app/api/kody/chat/kody/route.ts`, `app/api/kody/chat/trigger/route.ts`, `src/dashboard/lib/user-state/index.ts` | add `./user-state/*` export subpath, repoint |
| `@kody-chat/snippets/{store,types,BrandSnippets}` | `src/dashboard/lib/snippets/*` (re-export shims) | add `./snippets/*` export subpath, repoint |
| `@kody-chat/auth/unified-actor` | `src/dashboard/lib/auth/unified-actor.ts` (re-export shim) | add `./auth/*` export subpath, repoint |
| `@kody-chat/client-auth/credentials`, `@kody-chat/client-brand` | `app/api/debug-client-auth/route.ts` | repoint to existing `./client-auth/*`, `./client-brand` exports |
| `@kody-chat/chat/plugins/terminal/plugin` | `ChatRailShell.tsx`, `GoalControl.tsx` | add `./plugins/terminal/*` deep export, repoint |

Test-only importers (repointed the same way): `chat/plugins/terminal/*` (types,
registry-state, fly-connection, checkpoints, terminal-text, xterm-setup,
useChatTerminalRegistry, index), `chat/plugins/vibe/{turn-context,recent-issue}`,
`chat/surface/MessageList`, `components/kody-chat-{types,helpers,selection,send,
transport-events}`, `user-state/{types,user-key,adapters/state-repo}`.

## Raw `node_modules/@kody-ade/kody-chat/src/...` path references (tests)

Source-text characterization specs that read files (not imports):
`settings-no-external-brain-ui`, `context-control-dialog`,
`repo-scoped-panel-route-surfaces`, `repo-scoped-navigation-surfaces`,
`repo-removal-surfaces`, `repo-switcher-org-groups`. These read CORE component
sources and stay as-is (they pin package UI invariants from the host).

## DASHBOARD-OWNED

None found. The drifted dashboard-domain duplicates inside
`packages/kody-chat/src/dashboard/lib/**` (inbox gist-store, macros-files,
reports-files, managed-goals-files, kody-store, dashboard-config store, events
reader/store, …) have zero dashboard importers — they exist only to feed the
package's port-3344 dev harness and are handled by Phases 4–5 (slim harness,
reachability-trace deletion), not by a move.

## Phase 5 reachability trace result (2026-07-16)

Strict trace from the export map + remaining harness `app/**` + `tests/**` +
`scripts/**` + the dashboard's raw `node_modules/@kody-ade/kody-chat/src/...`
references, with a string-mention safety pass for dynamic imports:
**350 lib files, 0 deletable.** The only two files outside the import graph
(`chat/plugins/plugin-dirs.mjs`, `empty-module.js`) are consumed by the
package's `eslint.config.mjs` / `next.config.mjs`. The tens-of-thousands-line
twin deletion already happened in commit `1dc82da4` ("cleanup phase 2 —
unreachable kody-chat lib tree"); everything left is live product code.
