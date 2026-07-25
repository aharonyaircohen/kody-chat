# Project Behavior

This document records behavior that applies across the project. It is the
source of truth for route ownership and user-facing verification rules.

## Repository context

- Dashboard features that belong to a repository must be repository-scoped.
- The user-facing URL must preserve the active repository context using the
  `/repo/:owner/:repo/...` route shape.
- A rewritten internal route such as `/...` is an implementation detail. It
  must never be documented, linked, or tested as the user-facing URL.
- Repository-scoped data and API requests must use the active `<owner>/<repo>`
  context. Do not silently replace it with global user state.

## Verification

- A feature is not verified by unit tests alone when it has a user-facing UI.
- Test the canonical browser URL on the dashboard at
  `http://localhost:3333/repo/<owner>/<repo>/...`.
- Verify the visible user action, the request sent by that action, and the
  resulting persisted state or page state.
- Testing an internal route or a package-development server does not prove the
  dashboard user experience. If either is used for focused testing, also run
  the canonical dashboard check.

## Change checklist

Before changing a repository-scoped dashboard feature:

1. Find the canonical `/repo/:owner/:repo/...` browser route.
2. Find the rewrite or route adapter that serves it.
3. Confirm the active repository reaches the page, API, and storage layer.
4. Add or update a browser journey that exercises the visible behavior.
5. Test the exact canonical URL before calling the change complete.
