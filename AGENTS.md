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
- Before any user-facing UI change, read and apply the simplicity rule in
  [`docs/ui-design-principles.md`](docs/ui-design-principles.md) before
  designing or coding.
- Keep the detailed rules in that document rather than duplicating them here.
- Read [`docs/testing-policy.md`](docs/testing-policy.md) for the required
  verification layers and completion standard for every change.

## Non-negotiable verification gates

- Every bug fix or behavior change must add or update an automated regression
  test at the boundary where the bug occurred. Existing tests do not count
  unless they assert the changed behavior.
- Every user-facing change must be tested through the real mounted local app;
  mocked browser tests are not live verification.
- Critical user-facing or persistence changes must also be tested against the
  deployed candidate before they can be reported as complete. A local pass is
  not a deployment pass.
- If a required test or live check cannot run, report the change as
  unverified. Never claim it works based only on source inspection or unit
  tests.
- The final report must list separately: regression test, typecheck/lint,
  mocked browser test, live local test, and deployed live test, including
  explicit `not run` or `failed` status.

## Generic System Architecture

- Reuse or extend the existing system that already owns a responsibility before
  implementing a new component, workflow, tool, API, storage path, or subsystem.
- Create a parallel system only when the existing system cannot satisfy a
  verified requirement, and state that gap explicitly.
- Treat user requests to browse, create, edit, move, upload, or delete files as
  requests for the existing dashboard file manager.
- Read
  [`apps/dashboard/src/dashboard/features/file-manager/README.md`](apps/dashboard/src/dashboard/features/file-manager/README.md)
  before changing the shared file manager.
- The file manager must remain agnostic to every application, package,
  repository, and domain in this monorepo. It may depend only on its public
  configuration, active transport, generic file-format behavior, and shared UI
  infrastructure; feature-specific assumptions belong in caller-owned
  adapters.
- Do not edit the shared file manager, its components, or its file operations
  for feature-specific behavior. Adapt features only through the file
  manager's existing public configuration and transport contracts from
  feature-owned code.
- If the existing file manager contract cannot satisfy a verified requirement,
  stop and obtain explicit user approval before changing the shared file
  manager. Any approved shared change must include regression coverage for the
  existing Files, Docs, and file-workspace pages.

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
