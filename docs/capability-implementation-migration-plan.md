# Capability and Implementation Migration Plan

## Status

Approved and in progress.

The previous executor-based direction is rejected. Kody has no Executor agency
model.

## Approved model

### Capability

A Capability defines the stable technical action Kody offers.

It owns:

- identity and purpose;
- canonical input and output contracts;
- allowed effects and permissions;
- success and failure meaning.

It does not own:

- prompts;
- skills;
- tools;
- scripts;
- Agent selection;
- runtime settings;
- schedules;
- Workflow steps;
- runtime state.

### Implementation

An Implementation is one complete technical method for running one Capability.
It is similar to a runnable Kody skill package, but it is not itself a Skill.

Its portable Definition owns:

- identity;
- Capability reference;
- compatible Capability revision;
- execution type: `agent` or `script`;
- Agent reference for agent-based execution.

Its package may own:

- prompt templates;
- local or shared skills;
- tools and MCP servers;
- scripts;
- hooks, commands, and subagents;
- input and output mappings;
- parsing and validation;
- runtime requirements and settings;
- implementation-specific tests.

Different prompts, skills, scripts, mappings, or execution behavior may justify
different Implementations. Sharing the same agent runtime does not make two
Implementations duplicates.

### Skill

A Skill is a reusable instruction or method asset used by an Implementation.
It is not an AI Agency entity.

An Implementation may:

- contain a private Skill;
- depend on a shared Skill;
- combine supporting Skills when they serve one atomic action.

Combining independent actions belongs to a Workflow, not one Implementation.

### Other ownership

- Agent owns identity, judgment, and general behavior.
- Workflow owns ordered Capability calls, conditions, mappings, and retries.
- Loop owns continuous purpose and triggering.
- Run owns one execution attempt and pins the Capability and Implementation.
- Repository execution binding selects an Implementation; it is configuration,
  not an agency model.

## System map

```text
Purpose
Intent -> Operation -> Goal / Loop

Execution
Workflow -> Capability -> Implementation -> Run

Decision
Agent + Policies + Constraints

Knowledge
Facts + Evidence + Artifacts -> Knowledge Graph
```

## Verified current state

The Store currently contains:

- 116 Capabilities;
- 116 same-named Implementations;
- 83 agent Implementations;
- 33 script Implementations;
- 67 prompt files;
- 51 packages with local Skills;
- 13 groups of exactly copied Skill assets;
- no Implementation-local script files;
- one runtime adapter, `kody-engine-profile`.

The one-to-one count is not proof of duplication. Most packages contain a
distinct prompt, Skill set, script flow, mapping, or output behavior.

The main problems are:

1. aliases are stored as Implementations;
2. legacy graph methods remain beside the unified graph method;
3. some multi-action coordination is stored as an Implementation instead of a
   Workflow;
4. test fixtures appear in the production catalog;
5. scheduler and runtime-control services appear as agency Implementations;
6. deterministic script methods are incorrectly typed as agent methods;
7. task-specific scripts live in the Engine or consumer repository instead of
   their Implementation package;
8. shared Skill assets are copied into multiple packages;
9. Dashboard catalog entries mirror Capability names without clearly showing
   the technical method.

## Recommended catalog size

The complete inventory produces 92 Implementations.

This is not a quota. The final number must follow ownership and behavior. Do not
merge distinct methods merely to reduce the count.

The result removes or moves 26 of the original 116 entries and adds two missing
atomic methods required by the new `cleanup` Workflow:

- `cleanup-branches`;
- `clear-empty-goals`.

### Retire aliases

Remove these six copied aliases and migrate references to their real method:

- `ci-health` -> `ci-check`;
- `kody-analyzer` -> `kody-chat`;
- `kody-mem` -> `kody-chat`;
- `kody-operator` -> `kody-chat`;
- `kody-vibe` -> `kody-chat`;
- `memory-compaction` -> `compact-memory`.

### Retire legacy graph methods

Replace these five legacy graph Implementations with the unified
`build-knowledge-graph` method:

- `analyze-agency-structure`;
- `analyze-ci-health`;
- `analyze-dependencies`;
- `analyze-documentation`;
- `analyze-pull-requests`.

The graph Workflow may still request domain views. Those views are inputs or
steps of the unified graph method, not separate business-purpose
Implementations.

### Move coordination to Workflows

These four packages sequence independent actions and should become Workflows
that call their existing Capabilities:

- `cleanup`;
- `code-health`;
- `docs-health`;
- `quality-watch`.

Their component Implementations remain:

- `architecture-audit`;
- `type-debt`;
- `docs-readme`;
- `docs-code`;
- `security-audit`;
- `coverage-floor`;
- `flaky-test-quarantine`;
- `dependency-bump`;
- `dead-code-sweep`;
- other referenced atomic methods.

### Remove test-only packages from production catalog

Move these four to Engine or Store test fixtures:

- `job-live-verify`;
- `plan-verify`;
- `probe-skill`;
- `task-job-fail-once`.

### Move runtime services out of the agency catalog

These seven items are scheduler, dispatcher, worker, or state-controller
services rather than Capability Implementations:

- `capability-scheduler`;
- `capability-tick`;
- `capability-tick-scripted`;
- `dispatch-due-loops`;
- `goal-manager`;
- `goal-scheduler`;
- `task-jobs`.

They remain application or Engine services where needed. Removing them from the
Store catalog must not remove runtime behavior.

### Keep separate methods separate

Do not merge these merely because they share infrastructure:

- the seven agency model creators;
- plan, research, review, run, fix, fix-ci, reproduce, resolve, and UI review;
- release steps with different safety and state transitions;
- deployment and publication methods with different targets;
- health, audit, QA, and documentation methods with distinct contracts.

The agency model creators may share validation and PR-opening helpers, but each
keeps its own Capability contract and Implementation.

## Type and package corrections

### Correct deterministic types

These retained deterministic methods should be script Implementations, not
agent Implementations:

- `auto-fix-ci`;
- `auto-resolve`;
- `auto-sync`;
- `ci-check`;
- `job-gap-scan`;
- `preview-health`;
- `redispatch`;
- `revert`;
- `task-memory-extractor`.

Each migration must preserve its current inputs, outputs, safety checks, and
side effects.

### Own implementation-specific scripts

Retained script Implementations must package their task-specific code under:

```text
implementations/<id>/scripts/
```

Generic Engine lifecycle helpers may remain in the Engine. Business or
task-specific shell code must not remain hidden in an Engine registry or
consumer sidecar.

### Share reusable Skill assets

Exactly copied Skill assets should have one Store-owned source and be resolved
as declared dependencies.

Initial duplicated groups include:

- architecture audit;
- type debt;
- dead-code sweep;
- dependency bump;
- coverage floor;
- flaky-test quarantine;
- security audit;
- docs code;
- docs README;
- GitHub Actions documentation;
- design-system guidance;
- Next.js guidance;
- React guidance.

This deduplicates assets without merging distinct Implementations.

Implementation-private Skills stay inside their package.

## Target Store shape

```text
agents/
capabilities/
implementations/
shared/
  skills/
workflows/
goals/
loops/
intents/
operations/
policies/
constraints/
```

```text
implementations/<implementation-id>/
  definition.json
  runtime.json
  prompt.md                 # agent only, optional
  skills/                   # private skills, optional
  scripts/                  # task-specific scripts, optional
  agents/                   # optional subagents
  hooks/                    # optional
  tests/                    # contract fixtures
```

`runtime.json` is adapter configuration. It is not part of the pure domain
Definition.

## Clean architecture rules

```text
Pure domain contracts
    <- application services
        <- ports
            <- Store, Engine, Convex, GitHub, filesystem, and UI adapters
```

- Domain entities import no Engine, Store, UI, database, or provider code.
- Domain entities contain no schema version, storage path, migration flag, or
  runtime-provider field.
- Capability and Implementation Definitions are immutable.
- Runtime availability and health are separate state.
- Capability owns canonical contracts.
- Implementation owns canonical-to-runtime and runtime-to-canonical mapping.
- Workflow calls Capabilities, never hardcoded Implementations.
- Implementation resolution is explicit and deterministic.
- Equal Capability and Implementation slugs are never used as a fallback.
- Terminal Runs pin exact Capability and Implementation revisions.
- No business purpose, schedule, or Workflow is hidden inside an
  Implementation.
- No capability-specific branch is added to the generic Engine runner.
- No permanent dual read or dual write remains after migration.
- No domain model name contains a format version.

## Migration phases

### Phase 0: Lock the corrected architecture

1. Replace the drifted documentation with the approved ownership model.
2. Add architecture tests that reject:
   - Executor as an agency entity;
   - prompts, tools, or scripts on Capability;
   - Workflow or schedule fields on Implementation;
   - missing Capability references on Implementation;
   - script Implementations with prompts.
3. Freeze creation of new one-to-one copied Store records.

Exit gate:

- one ownership table is authoritative;
- no active documentation describes Implementation as only a runtime adapter;
- architecture tests fail on the rejected shapes.

### Phase 1: Create the migration inventory

1. Generate a machine-readable inventory for all 116 Implementations.
2. Record:
   - Capability and compatible revision;
   - type and Agent;
   - prompt;
   - private and shared Skills;
   - tools, scripts, hooks, subagents, and MCP servers;
   - input/output mappings;
   - side effects and permissions;
   - catalog visibility;
   - proposed action: keep, retire, workflow, fixture, service, or retype.
3. Require a reason and destination for every removed item.
4. Make the analyzer read-only by default.

Exit gate:

- all 116 entries are classified;
- the 26 proposed removals have verified replacement paths;
- no behavior is removed without a destination.

### Phase 2: Correct shared contracts and persistence

1. Keep Capability and Implementation as separate domain entities.
2. Keep Implementation tied to one Capability and compatible revision.
3. Keep agent and script as the exhaustive implementation types.
4. Keep repository execution binding as application configuration.
5. Store immutable Implementation definitions and current availability
   separately.
6. Extend Run and output provenance where incomplete.
7. Add reference-safe archive and deletion rules.

Exit gate:

- domain tests cover every invariant;
- Capability and Implementation ids cannot collide in persistence;
- terminal Runs pin both revisions;
- no storage or runtime fields leak into domain definitions.

### Phase 3: Rebuild Store packages

1. Retire aliases and redirect all references explicitly.
2. Replace the five legacy graph packages.
3. Convert four composite packages into Workflows.
4. move test-only packages to fixtures.
5. move runtime services out of the agency catalog.
6. Retype deterministic implementations as scripts.
7. Move implementation-specific script code into its package.
8. Extract exact copied Skills into shared Store assets.
9. Keep each retained Implementation independently installable and testable.
10. Update Store manifest and validation.

Exit gate:

- the catalog contains only real technical methods;
- 92 evidence-backed Implementations remain;
- all retained packages pass contract fixtures;
- no task-specific implementation code is missing from its package;
- no copied Skill directories remain.

### Phase 4: Correct Engine resolution and execution

1. Resolve an Implementation by:
   - authorized run override;
   - repository execution binding;
   - the only compatible available Implementation;
   - otherwise fail clearly.
2. Remove slug-equality fallback.
3. Compile the full Implementation package into the runtime profile.
4. Validate canonical input before mapping.
5. Validate canonical output after execution.
6. Assemble prompts only for agent Implementations.
7. Run script Implementations without loading an agent.
8. Keep scheduling, dispatching, and state control in application services.
9. Record the resolved Implementation before execution starts.

Exit gate:

- agent and script contract tests pass;
- ambiguity and missing methods fail clearly;
- services removed from Store still run correctly;
- no capability-specific logic enters the generic runner.

### Phase 5: Migrate Kody Chat storage and APIs

1. Store real Implementation definitions, not Capability copies.
2. Keep Convex as the owner of Dashboard runtime state.
3. Update import, Store catalog, detail, migration, and resolution APIs.
4. Remove legacy readers, writers, bootstraps, and fallback records.
5. Protect repository scope and immutable revisions.
6. Add pagination and repository-scoped cache keys.

Exit gate:

- API integration tests pass;
- Store list and detail use the same source;
- no Implementation content returns `not_found`;
- no runtime state reads from or writes to GitHub.

### Phase 6: Restore and correct Dashboard surfaces

1. Preserve the established Intent, Operation, Goal, Loop, Workflow, Capability,
   and Run page design and behavior.
2. Keep a visible technical Implementations page.
3. Show for each Implementation:
   - Capability contract;
   - type and Agent;
   - prompt presence;
   - Skills, tools, scripts, hooks, and MCP servers;
   - mappings and requirements;
   - availability and recent Runs;
   - Store source.
4. Capability detail shows its compatible Implementations.
5. Run detail shows the exact resolved Implementation.
6. Workflows show Capability steps, not hardcoded implementation details.
7. Internal services and test fixtures never appear as catalog
   Implementations.

Exit gate:

- established pages retain their visible behavior;
- Implementations page shows real technical methods;
- Capability and Implementation content loads;
- browser tests cover loading, errors, empty states, and navigation.

### Phase 7: Migrate consumers

For each connected consumer repository:

1. back up current definitions and bindings;
2. hydrate corrected Store packages;
3. migrate explicit execution bindings;
4. move consumer-side implementation scripts into Store packages where
   portable;
5. preserve repository-specific configuration as inputs or binding config;
6. verify active Goals, Loops, Workflows, and Runs;
7. remove old hydrated copies and fallbacks after proof.

Exit gate:

- every active Capability resolves;
- active Loops keep their cadence;
- workflows produce the same required outputs;
- no consumer depends on a retired alias or hidden sidecar implementation.

### Phase 8: Full verification

Required proof:

- domain and architecture tests;
- Store validation for every package;
- compiler and resolution tests;
- backend and API integration tests;
- Engine typecheck and full tests;
- Kody Chat typecheck and full tests;
- real local Dashboard browser journey;
- one real agent Implementation run;
- one real script Implementation run;
- Knowledge System graph refresh;
- persisted Run and output provenance;
- consumer repository isolation;
- production Dashboard journey.

A skipped browser, consumer, or production journey is not a pass.

### Phase 9: Publish and clean up

1. Commit each repository from the exact tested source.
2. Publish shared packages in dependency order.
3. Update consumers to the published versions.
4. Deploy the Dashboard.
5. Verify deployed package and application revisions.
6. Run production proof.
7. Remove temporary compatibility only after production passes.

Completion requires separate confirmation of:

- implemented;
- tested;
- committed;
- pushed;
- published;
- deployed;
- production verified.

## Main risks

| Risk | Protection |
| --- | --- |
| Distinct methods are merged because they share a runner | Compare prompts, assets, mappings, effects, and contracts |
| Runtime behavior disappears when services leave Store | Move services first and run parity tests |
| Script behavior remains hidden in consumer repositories | Package task-specific scripts before cutover |
| Shared Skill extraction changes content | Content hashes and byte-for-byte fixtures |
| Active bindings point to retired aliases | Reference inventory and explicit redirects |
| UI redesign hides migration regressions | Preserve existing components and browser journeys |
| Partial multi-repository release breaks resolution | Ordered publishing, compatibility window, and live canary |

## Completion rules

The migration is complete only when:

- every Capability and Implementation has one responsibility;
- 92 evidence-backed Implementations remain;
- each retained Implementation is a complete technical method;
- prompts, Skills, tools, scripts, mappings, and runtime settings have one
  clear owner;
- shared assets are reused without merging distinct methods;
- Workflows own composition;
- Loops own triggers;
- Engine services are not agency catalog items;
- test fixtures are not production catalog items;
- all active consumers resolve and run;
- local and production E2E proof passes;
- all temporary compatibility paths are removed.

## Approval

Approved by the user. Implementation and verification are in progress.
