# Capability implementation guide

Status: **Partially verified**

## Current sources

| Concern                 | Source                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Contract and validator  | `packages/agency-domain/src/index.ts`                                                 |
| Capability files        | `packages/agency/src/capabilities/files.ts`                                           |
| Capability state        | `packages/kody-backend/convex/capabilityState.ts`                                     |
| API/UI                  | capability routes, hooks, and components under `packages/agency` and `apps/dashboard` |
| Implementation resolver | `packages/agency/src/implementation-resolution.ts`                                    |

Current documentation and product paths do not consistently separate
Capability from Implementation. Treat any combined shape as migration debt
until its ownership is classified.

Current capability file/catalog records include prompt, model, tools, scripts,
MCP servers, and landing behavior. Those are Implementation or product fields,
not the clean Capability contract.

## Target runtime

Validate input against the pinned Capability revision, resolve an eligible
Implementation compatible with that revision, check effective permissions and
Policy, execute, validate output, and record Run outputs.

## Required storage split

| Data                                     | Authority                          |
| ---------------------------------------- | ---------------------------------- |
| Public action contract                   | Capability Definition              |
| Agent/script/provider/tool configuration | Implementation/environment binding |
| Availability and health                  | runtime State/projection           |
| Calls, outputs, usage                    | Run History                        |

## Migration order

Classify combined fields, create clean Capability revisions, create linked
Implementation definitions/bindings, update Workflow callers, validate
input/output at dispatch, then remove combined readers and implicit defaults.

## Agent rules

- Keep provider, Agent, script, secret, endpoint, and deployment data out of
  Capability.
- Do not silently widen schemas or permissions.
- Never select an Implementation without compatibility and Policy checks.
- State and availability projections do not change contract meaning.
- Never use display text as the action ID.
- Record contract validation failures without leaking sensitive input.

## Verification and migration

Inventory combined records; backfill separate definitions; validate schemas,
effects, and permissions; exercise direct and Workflow invocation; prove
resolver behavior and output validation; remove compatibility readers,
writers, and inference.

## Gaps

Current persisted records, schema dialect, availability calculation, and one
real execution remain unverified.

Recommended next change: separate one real capability end to end and use it as
the migration pattern before bulk conversion.
