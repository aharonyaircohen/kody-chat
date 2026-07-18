# Brand registry + admin UI — implemented

The parallel track from [chat-platform-phase2.md](chat-platform-phase2.md)
(and step 7 of [chat-platform-phase3.md](chat-platform-phase3.md)): brands
are now operator-editable data feeding the existing branding plugin and
`/client/<slug>` surfaces.

Constraints honored: GitHub is the only datastore (no DB, no Vercel
features); rate-limit rules (cached reads, `invalidate*` after writes);
current UI/UX unchanged — this added one admin page and left the client
surface server-rendered.

## Current state

- Repo brands live at `brands/<slug>.json` in the resolved backend via
  [brands/files.ts](../src/dashboard/lib/brands/files.ts).
- Built-ins remain in [client-brand.ts](../src/dashboard/lib/client-brand.ts)
  (`kody`, `kody-he`, `acme`; unknown slugs get a title-cased default).
- Consumed by `app/client/[brandSlug]/page.tsx` (server component, already
  async), `ClientChatSurface`, and the branding plugin factory
  (`chat/plugins/branding`), which contributes name/accent/locale/welcome
  to the chat theme.

## Shipped shape

**Storage.** Brand files are at `brands/<slug>.json` through the
existing backend layer ([backend.ts](../src/dashboard/lib/backend.ts)),
exactly like slash commands ([commands/files.ts](../src/dashboard/lib/commands/files.ts)).
`src/dashboard/lib/brands/files.ts` owns list/read/write/delete, cached
reads, zod validation (`slug`, `name`, `accent`, `locale?`, `welcomeText?`),
and slug/locale normalization.

**API.** `app/api/kody/brands/route.ts` (GET list, POST create) and
`app/api/kody/brands/[slug]/route.ts` (GET, PATCH upsert, DELETE) —
mirroring [commands/[slug]/route.ts](../app/api/kody/commands/%5Bslug%5D/route.ts):
`requireKodyAuth`, `getUserOctokit`, `verifyActorLogin` on writes. Response
shapes follow the commands convention (`{ brand }`, `{ brands }`,
`{ error }`). Every write invalidates the brands cache.

**Resolution.** `resolveClientBrand(slug)`: repo file → hardcoded map → title-cased
default (existing behavior preserved exactly; the three built-ins become
seeds/fallbacks, so nothing breaks with an empty repo). The `/client`
page and metadata switch to it; `ClientChatSurface` keeps receiving the
resolved brand as props (no client-side fetch).

**Admin UI.** `brands` page-plugin
(`src/dashboard/lib/chat/plugins/brands/`) + route
`app/(chat-rail)/brands/page.tsx` — same shape as
[commands/page.tsx](<../app/(chat-rail)/commands/page.tsx>): table of
brands, create/edit form (name, accent color picker, locale, welcome
text), delete with confirm, live preview link to `/client/<slug>`.

**Tests + docs.** Unit coverage now pins files/zod behavior, API route
behavior, resolver fallbacks, page-plugin registration, and plugin directory
coverage. Pinned E2E client brands continue to ride the fallback path.

## Out of scope

- Surface-scope ticket activation (phase 3 step 6 — separate).
- Per-brand agents/tools grants (branding stays theme-only).
- Multi-repo/org-level brand store (org two-tier config track).
