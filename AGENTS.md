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
- Read [`docs/ui-design-principles.md`](docs/ui-design-principles.md) before
  creating or redesigning a dashboard page.
- Keep the detailed rules in that document rather than duplicating them here.
- Read [`docs/testing-policy.md`](docs/testing-policy.md) for the required
  verification layers and completion standard for every change.

## Generic System Architecture

- Reuse or extend the existing system that already owns a responsibility before
  implementing a new component, workflow, tool, API, storage path, or subsystem.
- Create a parallel system only when the existing system cannot satisfy a
  verified requirement, and state that gap explicitly.
- Treat user requests to browse, create, edit, move, upload, or delete files as
  requests for the existing dashboard file manager. Extend the shared file
  manager and its file operations instead of creating a separate file tree,
  editor, storage path, or file API.

## UI Implementation

- Every new or redesigned page must start from one of the three approved page
  types in [`docs/ui-design-principles.md`](docs/ui-design-principles.md):
  Agents-style master-detail, Secrets-style standard content, or Files-style
  file workspace.
- Before editing, identify the selected page type, its reference route, the
  shared layout component to reuse, and any intentional differences.
- Do not invent a fourth page structure unless all three approved types have
  been checked and cannot satisfy a verified requirement. State the gap and
  obtain explicit user approval before implementing a bespoke structure.
