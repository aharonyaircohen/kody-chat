# Kody Monorepo Rules

## Dashboard Runtime State

- Dashboard runtime state is Convex-owned and must never read from or write to
  GitHub.
- GitHub is allowed only for repository content, engine definitions, Actions,
  Store assets, webhooks, identity, and the explicitly selected GitHub CMS
  adapter.
- Do not call a Convex migration complete while any runtime-state GitHub
  fallback, bootstrap, dual-write, or reader remains.

## Project Behavior

- Read [`docs/project-behavior.md`](docs/project-behavior.md) when changing
  routes, repository-scoped features, or user-facing dashboard behavior.
- Keep the detailed rules in that document rather than duplicating them here.
- Read [`docs/testing-policy.md`](docs/testing-policy.md) for the required
  verification layers and completion standard for every change.
