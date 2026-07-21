# Widget platform — design

Status: approved direction, not yet implemented (2026-07-21).

## Why

Kody's rendered views (view-renderer definitions composed of built-in atoms)
are stateless JSON layouts. They cannot express rich in-card interaction:
holding a step open across attempts, revealing content on demand, validating
input locally, or custom visualizations. Tenants need to ship their own
interactive components without any change to kody's code or deployment.

## What a widget is

A **widget** is a tenant-authored, precompiled JS bundle that kody's hosted
app renders inside a **sandboxed frame** within a chat card (or any rendered
view). Kody never compiles or trusts tenant code; it hosts it behind a fixed
message contract.

- One kody host serves all tenants; widgets are **per-tenant data**, stored
  and versioned like view renderers (upload via platform UI — no file editing).
- A rendered-view node type `widget` references a widget slug; the card
  renders the tenant's bundle for that slug in an iframe sandbox.
- Widgets compose with guided flows: a flow step's renderer may embed a
  widget; the widget decides when the step is complete.

## Message contract (host ⇄ widget, postMessage)

Host → widget:
- `init { data, locale, theme, actor }` — the step/view's rendererData.
- `state { saved }` — previously checkpointed widget state, if any.

Widget → host:
- `ready` — bundle loaded; host sends `init`.
- `resize { height }` — card sizing.
- `checkpoint { state }` — host persists to the tenant's user-state
  namespace (existing `userState` API; brand-defined shape, opaque to kody).
- `complete { actionId, result }` — submitted as the step action (guided-flow
  submit or chat response, per the view's `resultTarget`).
- `chat { message, context }` — posts a message into the conversation on the
  user's behalf (e.g. "help me with this question").

The contract is versioned (`contract: 1` in the init payload). Anything not
in the contract is invisible to the widget — sandboxing (iframe +
`sandbox="allow-scripts"`, separate origin) is the security boundary.

## Authoring and delivery

- Source lives in the tenant's own repo; any framework, compiled to a single
  self-contained bundle (no external network access at runtime).
- Upload paths: platform UI (manual), or **kody engine**: the tenant asks in
  chat, the engine writes the widget in the tenant repo and opens a PR; on
  merge, CI builds the bundle and publishes it to the tenant's widget store.
  Bundles are build artifacts — never committed to the repo.
- Storage: per-tenant table (slug, version, bundle ref, updatedAt), same
  registry/governance pattern as `viewRenderers`.

## Non-goals

- No tenant code runs in kody's origin or server. Ever.
- No business-domain concepts in kody (lessons, exercises, etc. remain
  tenant-side vocabulary inside widget data).
- Built-in atoms stay the default for simple views; widgets are for
  interaction JSON can't express.

## Delivery milestones

1. `widget` view node + iframe host + contract v1 (init/ready/resize/
   complete) behind a per-tenant flag.
2. Widget store (table + upload UI) and per-tenant resolution.
3. `checkpoint` + `chat` messages.
4. Engine/CI publish pipeline (PR → merge → bundle published).
