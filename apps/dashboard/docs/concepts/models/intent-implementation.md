# Intent implementation guide

Status: Partially verified  
Last verified: 2026-07-24  
Model contract: [`intent.md`](intent.md)  
Load when: Editing, debugging, testing, running, or migrating Intent

## Reading map

| Task                   | Required sections                                      |
| ---------------------- | ------------------------------------------------------ |
| Find current ownership | Authority and storage, Current implementation          |
| Change an Intent path  | Runtime, API and events, Agent rules                   |
| Fix UI projection      | Projection behavior, Current implementation, Gaps      |
| Change Policy handling | Runtime, Gaps, Open questions                          |
| Remove legacy data     | Authority and storage, Gaps, Agent rules, Verification |

Read [`intent.md`](intent.md) first. It owns Intent meaning and the approved
contract. This guide describes current implementation, migration debt, and proof.

## Projection behavior

The Dashboard projects Definition, State, related Operations, and Run outputs
into `CompanyIntentRecord`. This is a display/editing shape, not another Intent
authority.

### Lifecycle mapping

| IntentState | Dashboard status |
| ----------- | ---------------- |
| `draft`     | `active`         |
| `active`    | `active`         |
| `paused`    | `paused`         |
| `retired`   | `archived`       |
| `archived`  | `archived`       |

Mapping `draft` to `active` hides a meaningful lifecycle state.

### Decision history

The main agency-model UI does not use the legacy `intentDecisions` table.
Decisions are projected from:

1. an Agency Run whose `origin` is the Intent;
2. a RunOutput belonging to that Run;
3. `output.contract === "company-intent-decision"` or
   `output.key === "decision"`.

| Projected field    | Source                                    |
| ------------------ | ----------------------------------------- |
| `at`               | RunOutput creation time                   |
| `agent`            | Decision payload Agent or producing Agent |
| `intentId`         | Originating Intent                        |
| `action`           | Decision action or Run target             |
| `reason`           | Decision reason                           |
| `before` / `after` | Optional change evidence                  |
| `resources`        | Optional affected resource references     |

Decision history MUST NOT be copied into IntentDefinition or IntentState.

### Scope mapping

The domain supports arbitrary included and excluded dimensions. The Dashboard
currently edits only:

- `include.repository`
- `include.area`

The current form does not expose exclusions or arbitrary dimensions. A
Definition round-trip can therefore lose data the compatibility form cannot
represent.

### Derived portfolio and controls

`projectCompanyIntents` derives:

- `portfolio` from Operations serving the Intent, their Goal and Loop ownership,
  and referenced Workflows and Capabilities;
- Dashboard status from IntentState;
- `controls` from `deliveryPolicy`, inline `policy`, and `constraints`;
- decisions from Runs and RunOutputs;
- timestamps from Definition and State records.

The projected `CompanyIntentRecord` MUST NOT be persisted as IntentDefinition.

## Enforcement status

| Rule     | Write enforcement                                                 | Runtime enforcement                          | Database                                  | Doctor                              |
| -------- | ----------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------- | ----------------------------------- |
| `INT-00` | `createIntentDefinition`                                          | Model-change route revalidates               | Definition data uses `v.any()`            | Missing                             |
| `INT-01` | Domain Definition contains only `id`; envelope creates `recordId` | Identical envelope revision is reused        | Tenant + record id lookup in mutation     | Missing                             |
| `INT-02` | `createIntentState`                                               | `agencyModel.putState` checks envelope match | Indexed by tenant, kind, definition id    | Missing                             |
| `INT-04` | `IntentDefinition` has no portfolio                               | Projection derives portfolio                 | No foreign-key constraint                 | Missing                             |
| `INT-05` | Operation validator checks ids                                    | Operation readiness checks existence         | No foreign key                            | Partial                             |
| `INT-06` | Definition requires Policy                                        | Intended trigger-dispatch enforcement        | Dispatch may store policy snapshot/hash   | Real-path proof missing             |
| `INT-09` | UI validates Policy ref slug                                      | Manual Run loads matching guidance           | No foreign key                            | Missing; unmatched refs are omitted |
| `INT-10` | Definitions are append-only                                       | Runs may pin Definition refs                 | No deletion route found in inspected path | Missing                             |

“Documented” is not “enforced.”

## Authority and storage

| Data                   | Canonical authority              | Current storage                                                                | Scope                        | Readers                                 | Writers                     |
| ---------------------- | -------------------------------- | ------------------------------------------------------------------------------ | ---------------------------- | --------------------------------------- | --------------------------- |
| Definition             | Agency domain `IntentDefinition` | Convex `agencyDefinitions`; immutable envelope with content-derived `recordId` | Tenant = repository          | Definitions API, projections, Run route | Model-change API, migration |
| Lifecycle              | `IntentState`                    | Convex `agencyStates`                                                          | Tenant = repository          | States API, projections, Run route      | Model-change API            |
| Run decisions          | Run and RunOutput                | Convex Agency Runs and `agencyOutputs`                                         | Tenant = repository          | Observations API, projection            | Engine/runtime              |
| Policy content         | Guidance Policy files            | Workspace/Store guidance via `listGuidanceFiles("policy")`                     | Configured company/workspace | Intent UI, manual Run route             | Guidance APIs/tools         |
| Legacy combined Intent | Compatibility only               | Convex `intents`                                                               | Tenant = repository          | Legacy Intent API, migration input      | Legacy POST/PATCH           |
| Legacy decisions       | Compatibility only               | Convex `intentDecisions`                                                       | Tenant = repository          | Legacy Intent store                     | Legacy append function      |

The main `useCompanyIntents` path reads `agencyDefinitions`, `agencyStates`, and
Agency observations. It does not read the legacy `intents` table.

Legacy `/api/kody/company/intents` GET/POST/PATCH routes still read and write
compatibility tables. They remain a second authority until removed or proven to
be migration-only.

## Runtime

### Create or edit

```text
human edits Company Intent form
-> UI converts form to IntentDefinition
-> UI converts status to IntentState
-> POST /api/kody/agency-model-changes
-> route validates through agency-domain
-> route creates content-derived immutable Definition record
-> Convex applies Definition and State change
-> UI reloads Definitions, States, and observations
-> projection renders CompanyIntentRecord
```

Current behavior:

- The API verifies authenticated repository write access.
- Definition and State are submitted as one model change.
- Editing creates a new content-addressed Definition for the same Intent id.
- Identical Definitions reuse the same record id.
- Current Definition selection uses newest `createdAt`, then `recordId`.
- The write does not compare-and-swap against the Definition previously read.
- The UI request exposes no idempotency key.
- Archived UI status is written as `retired` followed by `archived`.
- The generic State validator accepts any Lifecycle replacement.
- No Intent deletion path was found in the inspected agency-model UI flow.
- Historical Definitions remain stored.

### Manual review

```text
human clicks Run now
-> POST /api/kody/company/intents/<id>/run
-> route verifies actor and repository context
-> route loads current Agency Definitions and States
-> route requires active IntentState
-> route loads referenced Policy guidance
-> route dispatches kody.yml with action agency-portfolio-management
-> Engine/runtime records Runs and outputs
-> UI projects matching outputs as Intent decisions
```

Intent is not executable. The route dispatches a management review.

Current reliability facts:

- GitHub workflow dispatch is the external execution boundary.
- The manual route has no explicit idempotency key.
- The route silently omits unresolved `policyRefs`.
- Later dispatch-policy enforcement still requires real-path proof.
- The UI toast says “CTO review started”; CTO is a responsibility label, not an
  additional model.

### Operator surface

- Canonical route: `/repo/<owner>/<repo>/company-intents`
- Repository-scoped list and selected detail.
- Create, edit, lifecycle change, and manual review actions.
- Related Goals, Loops, and Capabilities are projected through Operations.
- Decision history is projected from Run outputs.
- “Healthy” is not an IntentState field. Any health display must define a
  derived rule.

## API and events

| Boundary                                  | Method/event      | Purpose                                    | Reads                                    | Writes                              | Authorization                    |
| ----------------------------------------- | ----------------- | ------------------------------------------ | ---------------------------------------- | ----------------------------------- | -------------------------------- |
| `/api/kody/agency-definitions`            | GET               | List immutable Definitions                 | `agencyDefinitions`                      | None                                | Kody auth + repository context   |
| `/api/kody/agency-states`                 | GET               | List aggregate States                      | `agencyStates`                           | None                                | Kody auth + repository context   |
| `/api/kody/agency-observations`           | GET               | List Runs and outputs                      | Agency Runs, outputs                     | None                                | Kody auth + repository context   |
| `/api/kody/agency-model-changes`          | POST              | Validate and apply Definition/State change | Existing Definitions                     | `agencyDefinitions`, `agencyStates` | Verified repository write access |
| `/api/kody/company/intents/<id>/run`      | POST              | Dispatch management review                 | Intent Definition/State, Policy guidance | GitHub dispatch; later Run/history  | Kody auth, actor, GitHub token   |
| `/api/kody/agency-migration`              | GET/POST          | Preview/apply legacy migration             | Legacy models                            | Agency Definitions/States           | Verified repository write access |
| `/api/kody/company/intents`               | GET/POST          | Legacy list/create                         | Legacy `intents`                         | Legacy `intents`                    | Kody auth; actor for writes      |
| `/api/kody/company/intents/<id>`          | PATCH             | Legacy update                              | Legacy `intents`                         | Legacy `intents`                    | Kody auth + actor                |
| `kody.yml`: `agency-portfolio-management` | Workflow dispatch | Execute review                             | Dispatch inputs, guidance                | Runs and outputs                    | GitHub + Engine policy           |

## Current implementation

### Types and validators

- `packages/agency-domain/src/index.ts`
  - `IntentDefinition`
  - `IntentState`
  - `createIntentDefinition`
  - `createIntentState`
- `apps/dashboard/src/dashboard/lib/company-intents.ts`
  - `CompanyIntent`
  - `CompanyIntentInput`
  - `CompanyIntentRecord`
- `apps/dashboard/src/dashboard/lib/agency-product-projections.ts`
  - `intentDefinitionFromInput`
  - `intentLifecycle`
  - `projectCompanyIntents`
- `packages/kody-backend/convex/validators.ts`
  - legacy `companyIntentValidator`

### Persistence

- Clean Definitions: Convex `agencyDefinitions`.
- Clean Lifecycle: Convex `agencyStates`.
- Clean outputs: Convex `agencyOutputs`.
- Runs: Convex Agency Run storage.
- Legacy combined records: Convex `intents`.
- Legacy ordered decisions: Convex `intentDecisions`.

### Readers

- `useCompanyIntents`: clean Definitions, States, observations.
- `CompanyIntentsView`: projected record.
- Manual Run route: clean Definition and State.
- Operation projection/readiness: Intent Definitions.
- Agency migration: legacy Intent migration input.
- Legacy API GET: legacy Intent records.

### Writers

- `useCreateCompanyIntent` and `useUpdateCompanyIntent`: model-change API.
- Agency migration: clean Definitions and States.
- Legacy Intent POST/PATCH: legacy `intents`.
- Runtime: Runs and outputs used for decision history.

### Mounted path

```text
/repo/<owner>/<repo>/company-intents
-> CompanyIntentsView
-> useCompanyIntents
-> agencyModelApi
-> agency model API routes
-> Convex agencyDefinitions / agencyStates / agencyOutputs
```

The existing mocked browser test
`apps/dashboard/tests/e2e/company-intent-policies.spec.ts` intercepts the legacy
`/api/kody/company/intents` endpoint. It does not prove the mounted
UI-to-agency-model contract.

## Approved migration changes

The semantic contract now requires:

- Replace inline `policy`, `deliveryPolicy`, and `constraints` with
  `policyRefs` plus hard `controls`.
- Move cadence to Loop Trigger.
- Resolve every Policy reference before activation and dispatch.
- Apply Intent Controls only as restrictions on resolved Policies.
- Combine multi-Intent Controls using intersection/union/minimum/strongest rules.
- Fail closed on non-combinable Policy conflicts.
- Store the effective resolved Policy snapshot on Run.

Still proposed:

- Enforce a strict Lifecycle transition graph.
- Add optimistic concurrency for competing Intent edits.

## Gaps

| ID        | Area                 | Current                                                        | Target                                              | Risk                                        | Migration                                     | Completion proof                                 |
| --------- | -------------------- | -------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| `INT-G01` | Storage authority    | Clean agency tables and legacy `intents` both have live routes | One clean authority                                 | Readers can see different data              | Remove legacy readers/writers                 | Search and route tests prove no legacy CRUD      |
| `INT-G02` | Definition selection | Newest `createdAt`, then record id                             | Explicit immutable head/revision                    | Concurrent writes choose implicitly         | Canonical head or compare-and-swap            | Concurrency integration test                     |
| `INT-G03` | Lifecycle            | Any Lifecycle replacement; Draft projects Active               | Enforced graph and visible Draft                    | Invalid transitions, hidden readiness       | Transition service + UI                       | Transition tests + browser proof                 |
| `INT-G04` | Policy boundary      | Refs, inline Policy, delivery Policy, Constraints overlap      | `policyRefs` + tightening Controls; cadence in Loop | Current shape contradicts approved contract | Migrate domain, projections, UI, and dispatch | Domain tests + multi-Intent merge + Run snapshot |
| `INT-G05` | Missing Policy refs  | Manual Run omits unmatched refs                                | Resolve before activation/dispatch; fail closed     | Expected governance is absent               | Add reference validation                      | Missing-ref activation and API rejection         |
| `INT-G06` | Scope                | Domain supports include/exclude; UI supports two includes      | Approved scope semantics                            | UI edit can lose exclusions                 | Preserve/expose or restrict                   | Round-trip tests                                 |
| `INT-G07` | Projection loss      | Compatibility shape cannot represent all fields                | Lossless editing                                    | Hidden values replaced by defaults          | Model-aware edit contract                     | Round-trip fixture                               |
| `INT-G08` | Decisions            | Run outputs and legacy table coexist                           | One history authority                               | Histories disagree                          | Remove legacy decision path                   | No legacy read/write + UI proof                  |
| `INT-G09` | Browser proof        | Spec mocks legacy API                                          | Current agency API contract                         | Test passes while real path breaks          | Rewrite mock + live journey                   | Canonical route + Convex evidence                |
| `INT-G10` | Runtime proof        | Route traced; full policy application unproven                 | Policy-checked traceable Run                        | Docs overclaim enforcement                  | Real review + inspect evidence                | Workflow, Run, output, policy                    |

## Open questions

| ID        | Question                                         | Impact                                            | Options                                              | Owner              | Blocks?                           |
| --------- | ------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------- | ------------------ | --------------------------------- |
| `INT-Q03` | Is Draft visible/editable?                       | Current projection says Active                    | Expose; remove; infer readiness                      | Product + domain   | Lifecycle UI                      |
| `INT-Q04` | Legal transitions and actors?                    | Generic writes allow all                          | Fixed role-based state machine                       | Product + security | Yes                               |
| `INT-Q05` | How is current Definition selected?              | Timestamps race                                   | Head + compare-and-swap; explicit revision           | Runtime            | Concurrent editing                |
| `INT-Q07` | Repository-local or portable Intent?             | Tenant is one repo; scope may name many           | Repository; portable company; central                | Product + domain   | Multi-repo                        |
| `INT-Q08` | Deletion and restore policy?                     | Runs need reproducibility                         | No hard delete; archive; protected delete            | Domain + runtime   | Yes                               |
| `INT-Q09` | When remove legacy stores?                       | Second authority remains                          | After migration audit + real proof                   | Runtime            | Migration completion              |
| `INT-Q10` | First-class Intent health?                       | Intent owns direction, not progress               | Derived; none; management assessment                 | Product + domain   | Before health UI                  |
| `INT-Q11` | How does priority order Intents and handle ties? | Managers and UI need deterministic focus ordering | Lower number wins; higher number wins; explicit rank | Product + domain   | Before priority-driven management |

## Agent rules

### Required context

Before implementation:

- Read [`README.md`](README.md) and [`intent.md`](intent.md).
- Read task-relevant sections of this guide.
- Read relevant Operation and Policy model sections.
- Inspect exact sources below.
- For Dashboard work, read root `docs/project-behavior.md` and
  `docs/testing-policy.md`.

Read this complete guide for Policy composition, Lifecycle, storage authority,
or migration changes.

### Allowed

- Add enforcement for a documented invariant.
- Correct a projection to preserve the clean contract.
- Add missing current-path tests.
- Remove a proven-unused compatibility path in an explicit migration phase.
- Improve errors without changing authority or Lifecycle.
- Update verified current evidence.

### Requires a model decision

- Intent responsibility.
- Policy composition.
- Scope ownership or portability.
- Lifecycle states or transitions.
- Direct Goal, Loop, Workflow, Capability, or Operation lists.
- First-class health or progress.
- Definition selection/revision semantics.
- Authority, tenant scope, deletion, or restoration.
- AI authority to change human governance.

### Forbidden

- Persist projected `CompanyIntent` as IntentDefinition.
- Reintroduce `portfolio` into IntentDefinition.
- Store Lifecycle, progress, decisions, or evidence in IntentDefinition.
- Treat delivery cadence as a scheduler.
- Ignore missing Policy references.
- Write runtime State to GitHub.
- Add another Intent store or fallback.
- Claim migration complete while legacy paths remain.
- Treat mocked legacy-API coverage as current-path proof.

### Implementation order

1. Trace the exact current UI/runtime path.
2. Add domain and projection regression tests.
3. Change `@kody-ade/agency-domain` only after model approval.
4. Change the owning application service or route.
5. Update persistence adapters and migration.
6. Update all readers and writers.
7. Remove obsolete compatibility paths.
8. Run focused tests, root verification, current mocked browser gate, and a live
   repository-scoped Intent journey.
9. Inspect persisted Definition, State, Run, and outputs.
10. Update this guide from final evidence.

### Required proof

| Boundary    | Proof                                | Pass condition                        |
| ----------- | ------------------------------------ | ------------------------------------- |
| Contract    | Agency domain unit/boundary tests    | Fields and exclusions enforced        |
| Projection  | Dashboard unit tests                 | Full supported round-trip             |
| Persistence | Backend integration tests            | Immutable Definition + separate State |
| API         | Agency-model and Run route tests     | Auth, refs, Lifecycle gates           |
| Dashboard   | Current-API mocked canonical route   | UI matches request/projection         |
| Live path   | Real Dashboard + Convex + repository | UI and persisted records agree        |
| Runtime     | Real manual review                   | Dispatch, Run, output, decision agree |
| Migration   | Compatibility search + tests         | Old paths and stale mocks absent      |

Generic “tests pass” is insufficient.

### Stop when

- A blocking Open question applies.
- Work moves execution structure into Intent.
- Policy or Lifecycle authority is unclear.
- Code contradicts an approved canonical rule.
- A second authority is created or preserved without an explicit phase.
- A required Policy cannot resolve.
- Migration cannot remove its compatibility path.
- Persisted-state or current-route proof cannot run.

## Verification

- [x] Current types and validators inspected.
- [x] Main readers and writers identified.
- [x] Storage checked in schema and adapters.
- [x] One runtime path traced in code.
- [x] Definition, State, and History separated.
- [x] Current and target behavior separated.
- [x] Gaps have completion proof.
- [ ] Mounted browser contract exercised without legacy mocks.
- [ ] Real Convex record inspected.
- [ ] Real Intent review Run/output inspected.
- [ ] Product, domain, runtime, and security owners reviewed.

This guide remains Partially verified while required proof is unchecked.

## Sources

- Domain: `packages/agency-domain/src/index.ts`
- Domain tests: `packages/agency-domain/tests/domain.spec.ts`
- Compatibility types:
  `apps/dashboard/src/dashboard/lib/company-intents.ts`
- Projection:
  `apps/dashboard/src/dashboard/lib/agency-product-projections.ts`
- UI query/writer:
  `apps/dashboard/src/dashboard/lib/hooks/useCompanyIntents.ts`
- API client: `apps/dashboard/src/dashboard/lib/api/agency-model.ts`
- Model-change route: `packages/agency/src/routes/agency-model-changes.ts`
- Storage adapter: `packages/agency/src/backend/agency-model-store.ts`
- Definition/State selection: `packages/agency/src/agency-model-read.ts`
- Manual review:
  `apps/dashboard/app/api/kody/company/intents/[id]/run/route.ts`
- Dashboard:
  `apps/dashboard/src/dashboard/features/admin/components/CompanyIntentsView.tsx`
- Mounted pages:
  `apps/dashboard/app/(chat-rail)/company-intents/page.tsx` and
  `apps/dashboard/app/(chat-rail)/company-intents/[id]/page.tsx`
- Backend schema: `packages/kody-backend/convex/schema.ts`
- Backend agency model: `packages/kody-backend/convex/agencyModel.ts`
- Legacy validator/store:
  `packages/kody-backend/convex/validators.ts`,
  `packages/kody-backend/convex/intents.ts`,
  `apps/dashboard/src/dashboard/lib/company-intents-store.ts`
- Legacy routes:
  `apps/dashboard/app/api/kody/company/intents/route.ts`,
  `apps/dashboard/app/api/kody/company/intents/[id]/route.ts`
- Migration: `apps/dashboard/app/api/kody/agency-migration/route.ts`
- Projection tests:
  `apps/dashboard/tests/unit/agency-product-projections.spec.ts`
- Backend tests:
  `packages/kody-backend/tests/integration/agency-model.spec.ts`
- Existing stale browser contract:
  `apps/dashboard/tests/e2e/company-intent-policies.spec.ts`
- Canonical concepts: `apps/dashboard/docs/concepts/company-model.md`
- Repository rules: `docs/project-behavior.md`, `docs/testing-policy.md`
