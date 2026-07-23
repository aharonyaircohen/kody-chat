# Agent implementation guide

Status: **Partially verified**

## Current sources

| Concern | Source |
| --- | --- |
| Contract and validator | `packages/agency-domain/src/index.ts` |
| Agent service/files | `packages/agency/src/agent-files.ts` |
| Backend projection | `packages/agency/src/backend/agents-projection.ts` |
| Convex API | `packages/kody-backend/convex/agents.ts` |
| API/UI | agent routes, hooks, and components under `packages/agency` and `apps/dashboard` |

Current catalog/projection fields exceed the clean semantic definition.
Classify them as environment binding, UI projection, or migration debt rather
than copying them into the domain model.

## Target runtime

Resolve a pinned Agent definition only through an Agent Implementation. Compute
effective authority before execution, bind an eligible runtime backend, and
record Agent identity and implementation in Run provenance.

## Agent rules

- Do not turn Agent into an LLM model picker.
- Keep provider credentials and mutable availability out of the definition.
- An Agent cannot approve its own authority expansion.
- Do not infer permissions from UI labels, role text, or backend capabilities.
- Preserve tenant and user attribution.

## Verification and migration

Verify catalog reads, edit writes, permission reduction, implementation
resolution, provider binding, unavailable backend, provenance, and the mounted
Dashboard path. Remove file/runtime fallback if Convex owns that State.

## Gaps

Current storage authority, catalog identity mapping, memory/session ownership,
and live execution remain partially verified.

