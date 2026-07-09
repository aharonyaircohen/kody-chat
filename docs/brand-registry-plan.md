# Brand registry + admin UI — plan

The parallel track from [chat-platform-phase2.md](chat-platform-phase2.md)
(and step 7 of [chat-platform-phase3.md](chat-platform-phase3.md)): brands
stop being hardcoded TS and become operator-editable data feeding the
existing branding plugin and `/client/<slug>` surfaces.

Constraints honored: GitHub is the only datastore (no DB, no Vercel
features); rate-limit rules (cached reads, `invalidate*` after writes);
current UI/UX unchanged — this adds one admin page, touches nothing else.

## Current state

- Brands are a hardcoded map in
  [client-brand.ts](../src/dashboard/lib/client-brand.ts)
  (`kody`, `kody-he`, `acme`; unknown slugs get a title-cased default).
- Consumed by `app/client/[brandSlug]/page.tsx` (server component, already
  async), `ClientChatSurface`, and the branding plugin factory
  (`chat/plugins/branding`), which contributes name/accent/locale/welcome
  to the chat theme.

## Steps (one commit each, `pnpm test:gate` green per commit)

**Step 1 — Storage.** Brand files at `brands/<slug>.json` through the
existing state-repo layer ([state-repo.ts](../src/dashboard/lib/state-repo.ts)),
exactly like slash commands ([commands/files.ts](../src/dashboard/lib/commands/files.ts)).
New `src/dashboard/lib/brands/files.ts`: list/read/write/delete, cached
reads, zod schema (`slug`, `name`, `accent`, `locale?`, `welcomeText?`)
validating at the boundary. Slug normalization reuses
`normalizeClientBrandSlug`.

**Step 2 — API.** `app/api/kody/brands/route.ts` (GET list) and
`app/api/kody/brands/[slug]/route.ts` (GET, PATCH upsert, DELETE) —
mirroring [commands/[slug]/route.ts](../app/api/kody/commands/%5Bslug%5D/route.ts):
`requireKodyAuth`, `getUserOctokit`, `verifyActorLogin` on writes. Response
shapes follow the commands convention (`{ brand }`, `{ brands }`,
`{ error }`). Every write invalidates the brands cache.

**Step 3 — Resolution.** `getClientBrand` grows an async, server-only
sibling `resolveClientBrand(slug)`: repo file → hardcoded map → title-cased
default (existing behavior preserved exactly; the three built-ins become
seeds/fallbacks, so nothing breaks with an empty repo). The `/client`
page and metadata switch to it; `ClientChatSurface` keeps receiving the
resolved brand as props (no client-side fetch).

**Step 4 — Admin UI.** New `brands` page-plugin
(`src/dashboard/lib/chat/plugins/brands/`) + route
`app/(chat-rail)/brands/page.tsx` — same shape as
[commands/page.tsx](<../app/(chat-rail)/commands/page.tsx>): table of
brands, create/edit form (name, accent color picker, locale, welcome
text), delete with confirm, live preview link to `/client/<slug>`. Same
lazy-panel bundle discipline as the other page-plugins.

**Step 5 — Tests + docs.** Unit: files/zod/resolution fallbacks. Int:
API routes (fixture repo). E2E: pinned brands in
`tests/e2e/client-chat-surface.spec.ts` stay green (they ride the
fallback path). Update CLAUDE.md chat section + this doc's status.

## Out of scope

- Surface-scope ticket activation (phase 3 step 6 — separate).
- Per-brand agents/tools grants (branding stays theme-only).
- Multi-repo/org-level brand store (org two-tier config track).
