# Implementation implementation guide

Status: **Partially verified**

## Current sources

| Concern                      | Source                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| Semantic union and validator | `packages/agency-domain/src/index.ts`                                                     |
| Resolution                   | `packages/agency/src/implementation-resolution.ts`                                        |
| Files/adapters               | `packages/agency/src/implementations/files.ts`                                            |
| Capability relation          | `docs/capability-implementations.md`                                                      |
| API/UI                       | implementation routes, hooks, and components under `packages/agency` and `apps/dashboard` |

The repository contains both a clean Implementation definition and operational
asset/file shapes. Their boundary is not yet consistently enforced.

Current file/API shapes carry executable assets and configuration beyond the
four-field semantic union. The resolver is therefore operating across
Definition and environment-binding concerns.

## Target runtime

Given a pinned Capability, filter active compatible Implementations by type,
environment, Policy, permissions, and health. Select deterministically, pin the
revision on the Run, then invoke the appropriate adapter. Never fall back to an
incompatible implementation.

## Required storage split

| Data                                             | Authority                 |
| ------------------------------------------------ | ------------------------- |
| Capability link, compatibility, type, Agent link | Implementation Definition |
| package/command/provider/model/tools/endpoint    | environment binding       |
| credentials                                      | secret store              |
| build/deploy/attestation                         | deployment History        |
| availability/health                              | runtime State             |
| selection result                                 | pinned Run trace          |

## Migration

Inventory combined implementation files, assign stable identities, create
portable Definitions and environment bindings, update the resolver, backfill
Run provenance, then remove inferred bindings and default fallback.

## Agent rules

- Do not leak implementation-specific fields into Capability.
- Do not interpret an Agent catalog entry as a model/provider picker.
- Do not read secrets into portable definitions or logs.
- Record why selection succeeded or failed.
- Treat fallback behavior as explicit selection policy, never hidden rescue.
- Never put secret values into definitions, projections, errors, or Runs.
- Fail closed when compatibility cannot be parsed.

## Verification and migration

Verify compatibility parsing, deterministic resolution, no-match and
multi-match behavior, Agent/script dispatch, secret boundaries, pinned Run
trace, rollback, and actual Dashboard/API behavior. Remove combined records and
implicit defaults after backfill.

## Gaps

Environment bindings, deployment metadata, resolver callers, and current live
execution are only partially traced.

Recommended next change: define the environment-binding contract and make the
resolver return an explainable selection result.
