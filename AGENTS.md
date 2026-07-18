# Kody Monorepo Rules

## Dashboard Runtime State

- Dashboard runtime state is Convex-owned and must never read from or write to
  GitHub.
- GitHub is allowed only for repository content, engine definitions, Actions,
  Store assets, webhooks, identity, and the explicitly selected GitHub CMS
  adapter.
- Do not call a Convex migration complete while any runtime-state GitHub
  fallback, bootstrap, dual-write, or reader remains.
