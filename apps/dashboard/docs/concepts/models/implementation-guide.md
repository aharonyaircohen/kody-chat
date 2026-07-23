# Implementation implementation guide

Status: **Partially verified**

## Current sources

| Concern | Source |
| --- | --- |
| Semantic union and validator | `packages/agency-domain/src/index.ts` |
| Resolution | `packages/agency/src/implementation-resolution.ts` |
| Files/adapters | `packages/agency/src/implementations/files.ts` |
| Capability relation | `docs/capability-implementations.md` |
| API/UI | implementation routes, hooks, and components under `packages/agency` and `apps/dashboard` |

The repository contains both a clean Implementation definition and operational
asset/file shapes. Their boundary is not yet consistently enforced.

## Target runtime

Given a pinned Capability, filter active compatible Implementations by type,
environment, Policy, permissions, and health. Select deterministically, pin the
revision on the Run, then invoke the appropriate adapter. Never fall back to an
incompatible implementation.

## Agent rules

- Do not leak implementation-specific fields into Capability.
- Do not interpret an Agent catalog entry as a model/provider picker.
- Do not read secrets into portable definitions or logs.
- Record why selection succeeded or failed.
- Treat fallback behavior as explicit selection policy, never hidden rescue.

## Verification and migration

Verify compatibility parsing, deterministic resolution, no-match and
multi-match behavior, Agent/script dispatch, secret boundaries, pinned Run
trace, rollback, and actual Dashboard/API behavior. Remove combined records and
implicit defaults after backfill.

## Gaps

Environment bindings, deployment metadata, resolver callers, and current live
execution are only partially traced.

