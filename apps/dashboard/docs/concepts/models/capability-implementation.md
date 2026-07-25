# Capability implementation

Status: **Current Dashboard and generic Engine loader**

## Dashboard

- Page: `/capabilities`
- Local storage: Convex `repoDocs`, `capability:<slug>`
- Store capabilities: read-only GitHub assets
- Owner: `packages/agency/src/capabilities/files.ts`

The file contract permits only `instructions.md`, `skills/**`, and `tools/**`.
The shared File Manager edits the folder through Capability-owned configuration;
the File Manager remains domain-agnostic.

## Engine

`loadSimpleCapability` reads the folder, builds one prompt from instructions,
input, skills, and tool paths, and passes the result to the generic runner.

Engine `profile.json` files select technical provider/model/scripts and runtime
behavior. They are not user-managed Implementation definitions.

## Verification

Create the folder in `/capabilities`, reload it, run it directly with a real
LLM, verify one JSON output, and confirm the Engine used the requested
Capability without capability-specific branching in the generic executor.
