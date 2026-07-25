# Agent implementation guide

Status: **Partially verified**

## Current sources

| Concern                | Source                                                                           |
| ---------------------- | -------------------------------------------------------------------------------- |
| Contract and validator | `packages/agency-domain/src/index.ts`                                            |
| Agent service/files    | `packages/agency/src/agent-files.ts`                                             |
| Backend projection     | `packages/agency/src/backend/agents-projection.ts`                               |
| Convex API             | `packages/kody-backend/convex/agents.ts`                                         |
| API/UI                 | agent routes, hooks, and components under `packages/agency` and `apps/dashboard` |

Current catalog/projection fields exceed the clean semantic definition.
Classify them as environment binding, UI projection, or migration debt rather
than copying them into the domain model.

Current agent files and projections include persona/instruction/runtime fields.
They must be mapped deliberately; catalog identity, provider identity, and
agency identity are not automatically the same ID.

## Target runtime

Resolve a pinned Agent definition only through an Agent Implementation. Compute
effective authority before execution, bind an eligible runtime backend, and
record Agent identity and implementation in Run provenance.

## Required storage split

| Data                                       | Authority                          |
| ------------------------------------------ | ---------------------------------- |
| Agency identity, role, maximum permissions | Agent Definition                   |
| prompt/persona/instructions                | governed instruction/config record |
| provider/model/tools                       | Implementation environment binding |
| credentials                                | secret store                       |
| memory/session/availability                | runtime stores                     |
| actions and outputs                        | Run History                        |

## Migration

Inventory catalog/file/projection IDs, choose stable Agent identity, backfill
Definitions and bindings, update Implementation references, verify provenance,
then remove fallback identity inference and runtime file State.

## Agent rules

- Do not turn Agent into an LLM model picker.
- Keep provider credentials and mutable availability out of the definition.
- An Agent cannot approve its own authority expansion.
- Do not infer permissions from UI labels, role text, or backend capabilities.
- Preserve tenant and user attribution.
- Never infer authority from available provider tools.
- Keep conversational display identity separate from authenticated actor.

## Verification and migration

Verify catalog reads, edit writes, permission reduction, implementation
resolution, provider binding, unavailable backend, provenance, and the mounted
Dashboard path. Remove file/runtime fallback if Convex owns that State.

## Gaps

Current storage authority, catalog identity mapping, memory/session ownership,
and live execution remain partially verified.

Recommended next change: document and enforce the ID mapping between Agent
Definition, catalog entry, and runtime binding.
