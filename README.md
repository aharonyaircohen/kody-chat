# kody-chat

Multi-tenant, brand-themed client chat product — and the embeddable chat
platform behind the Kody dashboard.

Extracted from [Kody-Dashboard](https://github.com/aguyaharonyair/Kody-Dashboard):
this repo owns the **chat product** (client surfaces, chat backends, the
plugin platform); the dashboard keeps the admin rail and its plugins and
consumes this package.

## What's inside

- **Client brand surfaces** — `/client/<slug>` full-page branded chat.
  One deployment serves every brand; brands resolve by slug (repo
  `brands/<slug>.json` with built-in fallbacks). Unknown slugs 404.
- **Chat backends** — `/api/kody/chat/*` (in-process model, Brain proxy,
  GitHub Actions engine trigger) and `/api/kody/events/*` (ingest + stream).
- **Chat platform** — `src/dashboard/lib/chat/{core,platform,plugins,surface}`.
  Layering (`core ← platform ← plugins/surface`) is lint-enforced as errors.
  The side-panel mechanism lives in the platform layer; panel *content* is
  plugin-supplied, so hosts (or future client features) ship panels as plugins.

## Library exports

Consumers (the dashboard, future hosts) import via package exports:

```ts
import { ... } from "@kody-ade/kody-chat/platform";
import KodyChat from "@kody-ade/kody-chat/components/KodyChat";
import { resolveClientBrand } from "@kody-ade/kody-chat/client-brand";
```

Source-level TS exports — Next.js consumers add
`transpilePackages: ["@kody-ade/kody-chat"]`.

## Development

```bash
pnpm install
pnpm dev        # http://localhost:3344
pnpm build
pnpm typecheck
pnpm lint
```

Port is **3344** (the dashboard owns 3333, so both run side by side).

### Environment

Same contract as the dashboard — one secret, everything else optional:

| Variable                  | Required | Purpose                                              |
| ------------------------- | -------- | ---------------------------------------------------- |
| `KODY_MASTER_KEY`         | Yes      | Vault crypto + chat-ingest HMAC (`pnpm vault:init`)  |
| `GITHUB_TOKEN`            | Yes      | Server-side GitHub reads (brand/credential bootstrap) |
| `KODY_CLIENT_BRAND_REPO`  | No       | `owner/repo` whose brand registry serves public brands |
| `KODY_CHAT_WORKFLOW_REPO` | No       | Engine repo for chat (default: connected repo)       |
| `KODY_CHAT_WORKFLOW_ID`   | No       | Chat workflow file (default `kody.yml`)              |

## Testing — four layers

| Layer | Command          | What it proves                                                        |
| ----- | ---------------- | --------------------------------------------------------------------- |
| Unit  | `pnpm test:unit` | Pure logic: reducers, parsers, stores, token/vault crypto (vitest, node env, no DOM) |
| Int   | `pnpm test:int`  | API route handlers against mocked GitHub (vitest + nock)              |
| Smoke | `pnpm test:smoke`| Server boots; key pages/APIs respond without 500s (plain node, no browser; `BASE_URL=` probes a deployment) |
| E2E   | `pnpm test:e2e:local` | Real browser flows on the client surface (Playwright; starts its own dev server) |

`pnpm test:gate` runs all four in order. Extending a layer = drop a spec in
`tests/{unit,int,e2e}` or add a check to `tests/smoke/run-smoke.mjs`.

E2E specs that exercise authenticated API branches read `E2E_GITHUB_TOKEN`
from `.env` (never committed).
