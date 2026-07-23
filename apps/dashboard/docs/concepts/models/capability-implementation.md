# Capability implementation guide

Status: **Partially verified**

## Current sources

| Concern | Source |
| --- | --- |
| Contract and validator | `packages/agency-domain/src/index.ts` |
| Capability files | `packages/agency/src/capabilities/files.ts` |
| Capability state | `packages/kody-backend/convex/capabilityState.ts` |
| API/UI | capability routes, hooks, and components under `packages/agency` and `apps/dashboard` |
| Implementation resolver | `packages/agency/src/implementation-resolution.ts` |

Current documentation and product paths do not consistently separate
Capability from Implementation. Treat any combined shape as migration debt
until its ownership is classified.

## Target runtime

Validate input against the pinned Capability revision, resolve an eligible
Implementation compatible with that revision, check effective permissions and
Policy, execute, validate output, and record Run outputs.

## Agent rules

- Keep provider, Agent, script, secret, endpoint, and deployment data out of
  Capability.
- Do not silently widen schemas or permissions.
- Never select an Implementation without compatibility and Policy checks.
- State and availability projections do not change contract meaning.

## Verification and migration

Inventory combined records; backfill separate definitions; validate schemas,
effects, and permissions; exercise direct and Workflow invocation; prove
resolver behavior and output validation; remove compatibility readers,
writers, and inference.

## Gaps

Current persisted records, schema dialect, availability calculation, and one
real execution remain unverified.

