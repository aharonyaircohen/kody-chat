# Capability and Implementation Migration Plan

## Status

Approved and in progress.

## Acceptance matrix

The migration is complete only when every item below has executable evidence:

- [ ] The shared domain models Capability and Implementation separately.
- [ ] Capability owns canonical input and output schemas.
- [ ] Backend persistence and APIs support Implementation definitions and
      repository execution bindings.
- [ ] Store has separate `capabilities/` and `implementations/` roots with no
      combined authoritative profiles or self-references.
- [ ] Engine resolves explicit override, repository binding, or one compatible
      Implementation and rejects ambiguity or unavailability.
- [ ] Engine compiles both agent and script Implementations and validates
      canonical input and output.
- [ ] Runs pin Capability and Implementation provenance and workflow execution
      creates capability child Runs.
- [ ] Dashboard lists and opens Capabilities and Implementations, and their
      relationship is visible.
- [ ] Knowledge graph connects Capability, Implementation, Run, and output
      provenance.
- [ ] Legacy readers, writers, slug-equality resolution, and silent fallbacks
      are removed after cutover.
- [ ] Focused tests, full repository gates, and the real local browser journey
      pass.
- [ ] Packages are published, deployed runtime is updated, and production E2E
      proof passes.

## Goal

Complete the AI Agency execution model so Kody has a clean, scalable boundary
between:

- the stable action Kody offers (`Capability`);
- the technical way that action runs (`Implementation`);
- the process that combines actions (`Workflow`);
- the identity that applies judgment (`Agent`);
- the execution history and evidence (`Run` and outputs).

This is a full migration across:

- `kody-chat` shared domain, backend, APIs, and Dashboard;
- `kody-store` definitions and runtime assets;
- `kody2` resolution, execution, validation, and provenance;
- consumer repository hydration and live workflows.

## Current problems

The current system has a good Purpose and runtime foundation, but the
Capability/Implementation boundary is incomplete:

1. `CapabilityDefinition` exists, but `ImplementationDefinition` does not.
2. Store capability folders combine:
   - the public action contract;
   - engine runtime configuration;
   - agent configuration;
   - prompts;
   - tools and skills;
   - scripts;
   - output parsing.
3. Store profiles often point `implementations` back to their own capability
   slug.
4. Engine dispatch resolves a combined profile instead of resolving a
   Capability to a compatible Implementation.
5. Runs do not record complete Capability and Implementation provenance.
6. Backend definition storage cannot represent Implementation.
7. Dashboard has no Implementation page and currently tries to render runtime
   details as Capability content.
8. Store capability listing and capability detail resolution use different
   sources, causing Store detail pages to return `not_found`.
9. Documentation conflicts about who owns canonical input and output contracts.

## Target system

```text
Purpose
Intent -> Operation -> Goal / Loop

Orchestration
Goal / Loop -> Workflow -> Capability call

Execution
Capability -> Implementation -> Run

Decision
Agent + Policy + Constraints + Scope

Knowledge
Run -> Facts + Evidence + Artifacts -> Knowledge Graph
```

Implementation is an execution model. It is not a new business-ownership layer
and it does not sit between Intent, Operation, Goal, or Loop.

## Model ownership

### Intent

Owns direction, priorities, policy, and business-level constraints.

Does not own execution, schedules, or runtime configuration.

### Operation

Owns one accountable business or operational area.

Does not own prompts, scripts, tools, or execution details.

### Goal

Owns one finite Objective and a reference to a Workflow or Capability.

Does not own scheduling, implementation selection, or runtime progress inside
its immutable Definition.

### Loop

Owns one continuous Objective, Trigger, target, and reconciliation rules.

Does not own Workflow steps or Implementation details.

### Workflow

Owns ordered Capability calls, dependencies, conditions, retries, and data
mapping between canonical Capability contracts.

Does not own prompts, tools, agents, runtime adapters, or business purpose.

### Capability

Owns one stable executable action contract:

- identity and public action;
- purpose;
- canonical input schema;
- canonical output schema;
- allowed effects and required permissions;
- success and failure semantics;
- compatibility requirements for Implementations.

Capability does not own:

- prompts;
- model selection;
- scripts;
- tools;
- skills;
- MCP servers;
- scheduling;
- Workflow steps;
- runtime state.

Canonical inputs and outputs belong to Capability so multiple Implementations
remain interchangeable.

### Implementation

Owns one technical method that satisfies one Capability:

- `capabilityRef`;
- execution type;
- compatible Capability contract revision;
- optional `agentRef`;
- health and availability metadata outside the immutable Definition.

Implementation types are a closed discriminated union:

- `agent`;
- `script`;

Do not add `workflow`, `orchestrator`, `container`, or `watch` Implementation
types:

- multi-step composition belongs to Workflow;
- recurring activation belongs to Loop;
- deployment/container details belong to runtime adapters;
- internal technical helpers remain private Implementations or shared engine
  services.

Do not add a `service` type until a real service-backed Capability and its
contract tests exist. The union is intentionally exhaustive and extendable,
not speculative.

The portable Implementation Definition stays deliberately small:

- identity;
- Capability reference and compatible contract revision;
- `agent` or `script` execution type;
- Agent reference when the type is `agent`.

The Implementation package, through an adapter-owned runtime manifest, owns:

- canonical-to-runtime input binding;
- runtime-to-canonical output parsing;
- runtime requirements;
- optional model/runtime settings;
- tools, skills, MCP servers, and scripts;
- adapter timeouts and transport retries;
- runtime credentials and environment requirements.

Workflow owns execution retries. Runtime manifests may retry only lower-level
transport operations inside one execution attempt.

### Agent

Owns identity, role, judgment, permissions, and general behavior.

An Agent does not own a business process, Capability contract, schedule, or
task-specific prompt.

### Prompt

Prompt is not an agency model.

For an agent-based Implementation, the final prompt is assembled for one Run:

```text
Agent identity
+ Capability contract
+ optional Implementation task template
+ canonical Run input
+ effective Policy and Constraints
= temporary Run prompt
```

- Agent owns stable identity instructions.
- Capability owns the task contract.
- Agent-based Implementation may own an optional task-specific prompt template.
- Script Implementations have no prompt.
- The assembled prompt is runtime data and is not a durable Definition.

### Run

Owns one execution attempt and complete provenance:

- origin Goal or Loop;
- requested Workflow or Capability;
- resolved Capability revision;
- resolved Implementation revision;
- parent Run for Workflow steps;
- effective Policy and Constraints;
- canonical input;
- terminal status and usage;
- canonical outputs;
- technical failure details.

Workflow execution creates a parent Run. Each Capability step creates a child
Run with its selected Implementation.

### Outputs and Knowledge

Facts, Evidence, and Artifacts record:

- source Run;
- Capability producer;
- Implementation provenance;
- owning Goal or Loop when applicable;
- contract identity;
- creation time.

The Knowledge Graph derives relationships from these records. It is not a
source of operational truth.

## Clean architecture

```text
Pure domain contracts
    <- application services
        <- ports
            <- persistence, Store, Engine, GitHub, Convex, and UI adapters
```

### Domain rules

- Domain code imports no UI, Engine, database, Convex, GitHub, filesystem, or
  Store modules.
- Domain entities contain no storage paths, schema versions, migration flags,
  transport fields, or provider-specific configuration.
- Definitions are immutable.
- State and availability are separate from Definitions.
- All unions are exhaustive and validated at construction.
- Canonical contracts use typed schemas, not descriptive strings.
- References are explicit and pinned when stored on a Run.
- Invalid relationships fail at the boundary; they are never silently repaired.

### Application rules

Application services own:

- Capability-to-Implementation resolution;
- compatibility checks;
- Workflow execution;
- prompt assembly;
- input and output validation;
- implementation availability;
- policy resolution;
- lifecycle and deletion protection.

Application services depend on ports, never concrete adapters.

### Adapter rules

Adapters own:

- Convex records and indexes;
- Store folder formats;
- Engine execution profiles;
- GitHub and filesystem access;
- Dashboard transport payloads;
- migration envelopes;
- runtime provider configuration.

Store definitions compile into Engine execution profiles. Engine profile fields
must not leak into the pure domain model.

## Target Store layout

```text
agents/
capabilities/
implementations/
workflows/
goals/
loops/
intents/
operations/
policies/
constraints/
```

### Capability folder

```text
capabilities/<capability-id>/
  definition.json
  capability.md
```

- `definition.json` is the canonical machine-readable contract.
- `capability.md` explains purpose, safety, and examples.
- It contains no model, prompt, tool, skill, MCP, or script configuration.

### Implementation folder

```text
implementations/<implementation-id>/
  definition.json
  runtime.json                # Engine adapter configuration
  prompt.md                   # agent type only; optional
  scripts/                    # optional
  skills/                     # optional
  tests/                      # implementation contract fixtures
```

- `definition.json` references exactly one Capability.
- `runtime.json` contains provider and Engine adapter configuration and is not
  part of the pure domain Definition.
- Store validation rejects prompts on script Implementations.
- Store validation checks that runtime bindings satisfy the Capability schema.
- No TypeScript lives in Store implementation folders.

### Hydrated consumer layout

Store domain assets are hydrated into an immutable definition cache.
An Engine adapter compiles Implementation definitions into internal execution
profiles under runtime-owned generated storage.

Generated profiles are never committed and are never treated as domain truth.

## Resolution rules

Capability invocation resolves an Implementation in this order:

1. explicit authorized override;
2. repository-scoped execution binding;
3. exactly one compatible available Implementation;
4. otherwise fail with an actionable ambiguity or unavailable error.

There is no hidden model-based selection and no slug-equality fallback in the
final system.

An execution binding is repository-scoped application configuration, not an
agency Definition. Capability never points back to a default Implementation;
this keeps the stable contract independent from its adapters.

Selection checks:

- Capability and Implementation revisions exist;
- Implementation references the Capability;
- canonical contract compatibility passes;
- required permissions are allowed;
- runtime and credentials are available;
- Policy and Constraints permit execution.

The selected and pinned Implementation is recorded before work begins.

## Migration phases

### Phase 0: Baseline and immediate regression protection

1. Freeze new legacy combined-profile features.
2. Inventory every Store capability and classify it as:
   - public Capability plus agent Implementation;
   - public Capability plus script Implementation;
   - unsupported runtime shape requiring an explicit architecture decision;
   - Workflow disguised as a Capability;
   - Loop disguised as a scheduled/watch Capability;
   - internal engine helper.
3. Capture current production definitions, Runs, workflows, graph output, and
   Dashboard journeys.
4. Add a regression test for Store capability detail resolution.
5. Fix Store capability detail reads to use the same resolved source as list.
6. Record baseline performance and output fixtures.

Exit gate:

- complete inventory with no unclassified assets;
- failing Store detail journey reproduced and protected;
- current live matrix recorded.

### Phase 1: Approve contracts and architecture rules

1. Replace conflicting documentation with one ownership table.
2. Define exact Capability input/output schema types using one documented,
   portable JSON Schema subset. Domain code owns the supported contract;
   adapters own validator-library integration.
3. Define `ImplementationDefinition` as a discriminated union.
4. Define bindings, availability, compatibility, and resolution errors.
5. Extend Run and output provenance contracts.
6. Define lifecycle, reference protection, archive, and deletion rules.
7. Add architecture tests for forbidden dependencies and fields.

Exit gate:

- domain contracts reviewed independently;
- every field has one owner;
- every model has one responsibility;
- no Engine or persistence field appears in domain contracts.

### Phase 2: Shared domain and codecs

1. Add Capability contract schemas and Implementation definitions to the shared
   domain.
2. Split domain modules by responsibility instead of growing one large file.
3. Add constructors and exhaustive validators.
4. Add relationship validation:
   - Implementation -> Capability;
   - Workflow step -> Capability;
   - agent Implementation -> Agent;
   - Run -> pinned Capability and Implementation.
5. Add adapter-owned envelopes and codecs.
6. Keep old readers in a named compatibility adapter only.
7. Make all new writes use the new definitions.

Do not dual-write old and new formats.

Exit gate:

- domain unit and property tests pass;
- compatibility fixtures read old records;
- new records contain no legacy fields.

### Phase 3: Backend persistence and application services

1. Add Implementation to immutable definition storage and indexes.
2. Add current-head queries without weakening revision history.
3. Extend Run persistence for parent/child runs and Implementation provenance.
4. Extend output persistence with Capability and Implementation provenance.
5. Build application services for:
   - definition lifecycle;
   - relationship validation;
   - resolution;
   - availability;
   - reference-safe deletion.
6. Keep repository scope derived from verified access.
7. Add pagination and repository-scoped cache keys.

Exit gate:

- API and persistence integration tests pass;
- cross-repository reads and writes are rejected;
- same-slug Capability and Implementation records cannot collide.

### Phase 4: Store schema, compiler, and migration tooling

1. Add `implementations` to Store roots and manifests.
2. Create strict validators for Capability and Implementation definitions.
3. Create a deterministic compiler:
   - Store Implementation -> Engine internal execution profile.
4. Create a one-time migration analyzer that produces:
   - proposed Capability;
   - proposed Implementation;
   - proposed Workflow or Loop corrections;
   - blocking ambiguities;
   - no writes by default.
5. Add an explicit apply mode after review.
6. Preserve prompts, scripts, skills, and behavior byte-for-byte where ownership
   does not change.
7. Add snapshot and round-trip tests for every Store asset.

Exit gate:

- dry-run classifies the full Store;
- compiler output matches current behavior fixtures;
- no asset is silently dropped or guessed.

### Phase 5: Engine resolution and execution

1. Introduce a generic Capability invocation port.
2. Resolve and pin an Implementation before execution.
3. Compile Implementation definitions into internal execution profiles.
4. Keep the generic runner role-agnostic.
5. Validate canonical input before runtime mapping.
6. Validate canonical output after runtime parsing.
7. Split Workflow parent Runs from Capability child Runs.
8. Assemble prompts only for agent Implementations.
9. Keep operator text fenced as untrusted input.
10. Record resolution decisions and provenance.
11. Remove capability-name and business-purpose branches from Engine code.

Exit gate:

- agent, script, and service contract tests pass;
- ambiguous and unavailable resolutions fail clearly;
- no-agent executions never load a prompt;
- full Engine tests and package verification pass.

### Phase 6: Graph-system canary

Migrate the Knowledge System first:

1. Create clean graph Capability contracts.
2. Move Graphify, report generation, and publishing into separate
   Implementations.
3. Keep business composition in the refresh Workflow.
4. Keep activation in the refresh Loop.
5. Run old and proposed compiled behavior against the same frozen input fixture
   for comparison only.
6. Switch the canary consumer to the new path.
7. Verify Runs, outputs, graph relationships, and Dashboard visibility.

This comparison is not permanent runtime dual execution.

Exit gate:

- graph output remains correct;
- each Run shows Capability and Implementation;
- no business purpose is duplicated in Implementation definitions.

### Phase 7: Dashboard and API migration

1. Add repository-scoped Implementation APIs.
2. Add Implementation list and detail pages.
3. Change Capability pages to show only:
   - contract;
   - safety;
   - inputs and outputs;
   - linked Implementations;
   - recent Runs.
4. Implementation pages show:
   - type;
   - Capability link;
   - Agent link when applicable;
   - domain requirements and adapter runtime configuration as separate sections;
   - prompt presence, tools, skills, scripts, and MCP;
   - availability and recent Runs.
5. Workflow pages show Capability steps, not hardwired technical profiles.
6. Run pages show the resolved Implementation and parent/child execution tree.
7. Add clear empty, loading, unavailable, ambiguous, and error states.
8. Keep Store assets read-only and link to their exact source.
9. Remove legacy mixed editors after migration.

Exit gate:

- canonical repository URLs work;
- Store and local detail pages use the same source resolution;
- browser tests assert visible behavior and failed requests;
- no runtime details are shown as Capability ownership.

### Phase 8: Full Store and consumer migration

Migrate in bounded groups:

1. graph and knowledge;
2. deterministic/script capabilities;
3. agent capabilities;
4. delivery and QA;
5. agency management;
6. internal helpers;
7. Workflow and Loop corrections.

For each group:

- run migration dry-run;
- review generated definitions;
- apply;
- compile;
- run Store tests;
- run Engine contract tests;
- hydrate a dedicated test consumer;
- run live workflows;
- compare required outputs;
- commit only after the group passes.

Then migrate consumer repository bindings and remove self-referencing
`implementations` fields.

Exit gate:

- all Store assets use the new structure;
- all active consumers hydrate and resolve successfully;
- no combined profile remains authoritative.

### Phase 9: Remove compatibility

1. Stop reading legacy combined folders.
2. Remove slug-equality resolution.
3. Remove legacy `implementation` and `implementations` Capability fields.
4. Remove legacy editors, routes, codecs, and documentation.
5. Remove compatibility tests after replacement coverage exists.
6. Add repository-wide forbidden-pattern tests.
7. Confirm no runtime fallback, bootstrap, or dual reader remains.

Exit gate:

- search and architecture tests prove zero active legacy paths;
- new Store structure is the only write and read path.

### Phase 10: Release and production proof

Release in dependency order:

1. shared domain package;
2. additive backend schema and functions;
3. Engine package that reads legacy assets and compiles new assets;
4. Dashboard that can read both shapes but writes only the new shape;
5. Store definitions and compiler inputs;
6. consumer bindings;
7. compatibility removal in later Engine and Dashboard releases.

For every release:

- build from the exact committed source;
- publish or deploy once;
- verify the deployed version;
- preserve the previous immutable revision for rollback.

Final production proof:

- Capability detail loads;
- linked Implementations appear;
- one agent Implementation runs;
- one script Implementation runs;
- Workflow parent and child Runs appear;
- canonical inputs and outputs validate;
- Knowledge Graph contains Capability -> Implementation -> Run relationships;
- repository isolation and authorization pass.

## Testing strategy

### Domain

- constructor and invariant tests;
- exhaustive-union tests;
- property tests for schema compatibility;
- relationship and deletion protection tests;
- serialization round trips.

### Store

- schema tests for every asset;
- full inventory migration tests;
- compiler snapshots;
- prompt prohibition for non-agent Implementations;
- no TypeScript in implementation folders;
- no Workflow or Loop fields in Capability or Implementation.

### Engine

- resolver precedence and ambiguity tests;
- availability and permission tests;
- input binding and output parsing tests;
- prompt assembly and untrusted-input tests;
- parent/child Run provenance;
- no capability-specific branching;
- full typecheck, unit, integration, package, and E2E suites.

### Backend and APIs

- immutable revision tests;
- repository scope and authorization tests;
- concurrency and idempotency tests;
- pagination and index tests;
- migration fixture compatibility;
- reference-safe archive and delete tests.

### Dashboard

- component and hook tests;
- repository-scoped query keys;
- API contract tests;
- browser tests for Capability, Implementation, Workflow, and Run journeys;
- visible error and empty-state tests;
- accessibility and responsive layout checks.

### Live proof

At baseline, after every phase, and for the final deployed candidate:

- `pnpm verify`;
- Dashboard browser gate;
- live local UI matrix;
- deployed live UI matrix;
- Store full tests;
- Engine typecheck, full tests, package verification, and live tester;
- production canary workflow with persisted Run and output evidence.

A skipped live journey is not a pass.

## Quality gates

The migration is not complete unless all of these are true:

- one authoritative definition for every model;
- one owner for every field;
- no duplicated domain types;
- no `any` at new domain or API boundaries;
- no silent fallback or guessed migration;
- no permanent dual reads or writes;
- no provider, Store, filesystem, or UI dependency in domain code;
- no business-specific logic in the generic Engine runner;
- no prompts for non-agent Implementations;
- no Workflow or schedule hidden inside Capability or Implementation;
- no unscoped backend or frontend caches;
- no unpinned Capability or Implementation on terminal Runs;
- no active legacy identifiers after compatibility removal;
- all changed user journeys pass against the real mounted app and persistence.

## Main drawbacks

These are drawbacks of the proposed migration:

1. More concepts are visible to developers and advanced operators.
2. Authoring one action requires a Capability and at least one Implementation.
3. Resolution and version pinning add runtime checks.
4. Existing Runs and Store assets need careful compatibility readers.
5. Dashboard and migration tooling become larger before legacy removal makes
   the system smaller.
6. Multi-repository release ordering is operationally expensive.

These costs are justified only if Kody needs multiple execution methods,
portable Capability contracts, reliable provenance, and long-term extension by
new runtimes. Kody does need those properties; continuing with combined folders
would preserve ambiguity and make future runtimes harder to add safely.

## Explicit non-goals

- Do not redesign Intent, Operation, Goal, or Loop again.
- Do not turn Implementation into business ownership.
- Do not make Prompt a persisted agency model.
- Do not add automatic AI-based Implementation selection.
- Do not add new runtime providers during the migration.
- Do not keep legacy and new models permanently.
- Do not put format version numbers into domain entity names or business logic.

## Approval decision

Approve only if these core rules are accepted:

1. Capability owns the canonical action and input/output contract.
2. Implementation owns one technical method and runtime bindings.
3. Agent identity is separate; prompts are optional runtime templates only for
   agent Implementations.
4. Workflow calls Capabilities, not Implementations.
5. Resolution is explicit, deterministic, validated, and recorded.
6. Store definitions compile into Engine profiles; Engine profiles are not
   domain truth.
7. Compatibility is temporary and is removed before completion.
