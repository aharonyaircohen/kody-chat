# Intent

Status: Draft  
Last verified: 2026-07-24  
Owners: Human company owner | AI Agency domain  
Implementation: [`intent-implementation.md`](intent-implementation.md)  
Load when: Any task needs Intent meaning, fields, ownership, or relationships

## Meaning

An Intent tells Kody what the company wants, why it matters, and which rules
must shape the response.

It is durable human direction that survives individual tasks, Runs, Agents, and
implementation changes. Without Intent, the agency can optimize only for the
latest request or available automation.

Intent is separate from:

- **Operation**: durable delegated responsibility.
- **Goal**: one finite desired result.
- **Loop**: recurring attention.
- **Policy**: reusable governance.
- **Capability**: one reusable action.

## Owns

- Company direction.
- Optional explanatory context.
- Relative priority among Intents.
- Tradeoff posture.
- Included and excluded scope.
- Principles and priorities.
- Success measures.
- References to reusable Policies.
- Intent-specific Controls that may only tighten reusable Policies.

## Does not own

- Embedded Goal, Loop, Workflow, or Capability portfolios.
- Operation Lifecycle.
- Goal progress or Loop health.
- Workflow steps or routing.
- Capability implementation.
- Agent identity.
- Scheduling position.
- Run status, events, evidence, or artifacts.
- Dashboard fields or storage metadata.

## Boundary test

Data belongs in Intent only when all applicable answers are yes:

1. Does it describe company direction or governance rather than execution?
2. Would it remain meaningful if every Goal, Loop, Workflow, Agent, and
   Capability changed?
3. Should every serving Operation inherit or respect it?
4. Is it authored or approved by the company owner rather than discovered at
   runtime?

It does not belong in Intent when it answers:

- What work is running?
- Which steps execute?
- Which Agent or tool acts?
- What progress or health exists now?
- Which outputs were produced?

Unknown boundaries are model decisions, not implementation assumptions.

## Data kinds

| Part             | Kind              | Mutable?                 | Identity?              | Lifecycle?               |
| ---------------- | ----------------- | ------------------------ | ---------------------- | ------------------------ |
| IntentDefinition | Authored contract | Immutable after creation | `id`                   | Yes                      |
| IntentState      | Runtime State     | Yes                      | References Intent `id` | No independent Lifecycle |
| Intent decision  | RunOutput History | Append-only              | Output record and Run  | No                       |
| Scope            | Embedded Value    | Through new Definition   | No                     | No                       |
| Policy reference | Dependency        | Through new Definition   | Policy owns identity   | Policy-owned             |
| IntentControls   | Embedded Value    | Through new Definition   | No                     | No                       |

A Dashboard projection may combine these for display. It is never another
authority.

## Approved contract

### IntentDefinition

This is the approved semantic contract. The current
`@kody-ade/agency-domain` shape has not yet completed this migration.

| Field         | Type           | Required | Meaning                                              | Validation                                                             | Excludes                     |
| ------------- | -------------- | -------- | ---------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------- |
| `id`          | string         | Yes      | Stable Intent identity                               | `^[a-z][a-z0-9-]{0,127}$`                                              | Revision/storage path        |
| `direction`   | string         | Yes      | Short company direction                              | Non-empty                                                              | Execution plan               |
| `description` | string         | No       | Reason, context, constraints, examples, good outcome | Non-empty when present                                                 | Second Intent or route       |
| `priority`    | number         | Yes      | Relative Intent ordering                             | Positive number                                                        | Runtime queue position       |
| `posture`     | enum           | Yes      | Default tradeoff stance                              | `confidence`, `speed`, `stability-recovery`, `maintenance`, `balanced` | Model/Agent selection        |
| `scope`       | Scope          | Yes      | Included and excluded dimensions                     | Valid dimension ids and values                                         | Dashboard route state        |
| `priorities`  | string[]       | Yes      | Decision principles                                  | Non-empty strings                                                      | Work queue                   |
| `measures`    | string[]       | Yes      | Observable success measures                          | Non-empty strings                                                      | Current metric values        |
| `policyRefs`  | string[]       | Yes      | Reusable Policy package ids                          | Every reference resolves                                               | Copied Policy content        |
| `controls`    | IntentControls | Yes      | Intent-specific hard limits                          | Strict, may only tighten resolved Policies                             | Cadence or reusable guidance |

The current implementation still stores overlapping `deliveryPolicy`, inline
`policy`, and `constraints`. Those are migration inputs, not the approved Intent
contract.

### IntentState

| Field          | Type          | Required | Meaning                 | Validation                                         |
| -------------- | ------------- | -------- | ----------------------- | -------------------------------------------------- |
| `definitionId` | string        | Yes      | Intent identity tracked | Valid id; matches State envelope                   |
| `lifecycle`    | Lifecycle     | Yes      | Current availability    | `draft`, `active`, `paused`, `retired`, `archived` |
| `updatedAt`    | ISO timestamp | Yes      | State transition time   | Parseable timestamp                                |

Lifecycle belongs only in IntentState.

### Decision History

Intent decisions are Run outputs, not Definition or State:

| Field              | Meaning                           |
| ------------------ | --------------------------------- |
| `at`               | Output creation time              |
| `agent`            | Decision-maker or producing Agent |
| `intentId`         | Originating Intent                |
| `action`           | Decision action                   |
| `reason`           | Decision reason                   |
| `before` / `after` | Optional change evidence          |
| `resources`        | Optional affected references      |

### Scope

```ts
{
  include: Record<string, string[]>;
  exclude: Record<string, string[]>;
}
```

Scope is an embedded Value, not a separate entity.

### IntentControls

```ts
{
  authority: {
    allow: string[];
    deny: string[];
  };
  budget: {
    maxRuns: number;
    maxTokens: number;
    maxCostUsd: number;
    maxDurationSeconds: number;
  };
  maxConcurrentRuns: number;
  requiresHumanFor: string[];
  minimumAssurance: "light" | "standard" | "strict";
}
```

Controls are hard local limits. They may tighten resolved Policies but MUST NOT
weaken them.

Cadence is not an Intent field. Recurring review belongs to a Loop Trigger.

The effective resolved Policy is an execution snapshot on Run, not stored in
IntentDefinition.

## Invariants

- `INT-00` — Every IntentDefinition field MUST pass
  `createIntentDefinition`.
- `INT-01` — Intent identity MUST remain `id`. Persistence revision MUST remain
  outside the domain Definition.
- `INT-02` — IntentState `definitionId` MUST match its State envelope.
- `INT-03` — Lifecycle MUST exist only in IntentState.
- `INT-04` — Intent MUST NOT directly own Goals, Loops, Workflows, or
  Capabilities.
- `INT-05` — Operations MUST reference the Intents they serve.
- `INT-06` — Effective Intent Policy MUST resolve before downstream dispatch.
- `INT-07` — Runtime progress and Run History MUST NOT enter IntentDefinition.
- `INT-08` — Portfolio MUST be derived through Operations and MUST NOT be
  written back as Intent ownership.
- `INT-09` — Missing Policy references MUST NOT be silently ignored.
- `INT-10` — Archived Definitions MUST remain available to pinned historical
  Runs.

Implementation enforcement is tracked in
[`intent-implementation.md`](intent-implementation.md#enforcement-status).

## Lifecycle

| State      | Meaning                                                    |
| ---------- | ---------------------------------------------------------- |
| `draft`    | Direction exists but is not approved for management action |
| `active`   | Operations may serve it and management may review it       |
| `paused`   | Direction remains but starts no new management work        |
| `retired`  | Direction ended but remains historically addressable       |
| `archived` | Hidden from active management and retained for History     |

The transition graph, actor permissions, deletion, and restore policy remain
open model decisions. Current behavior is documented in the
[implementation guide](intent-implementation.md#runtime).

## Relationships

| Model          | Direction            | Cardinality  | Type        | Rule                                               |
| -------------- | -------------------- | ------------ | ----------- | -------------------------------------------------- |
| Policy         | Outgoing             | Zero to many | Dependency  | Reusable Policy package is referenced, not copied  |
| IntentControls | Embedded             | Exactly one  | Owned Value | Hard limits may only tighten resolved Policies     |
| Scope          | Embedded             | Exactly one  | Owned Value | Defines where Intent applies                       |
| Operation      | Incoming             | Many-to-many | Dependency  | Operation stores `intentIds` and serves the Intent |
| Run            | Incoming             | Many         | History     | Management Run originates from Intent              |
| RunOutput      | Incoming through Run | Many         | History     | Decision/evidence/artifact remains with Run        |

Relationship rules:

- Intent does not embed Operation ids.
- One Operation may serve multiple Intents.
- One Intent may influence multiple Operations.
- Policy content is not copied into `policyRefs`.
- Runs should pin Intent revision where reproducibility matters.
- Every Policy reference must resolve before activation and dispatch.
- Effective Policy is resolved from Policy packages, then tightened by Controls.
- An Operation serving several Intents combines Controls field by field:
  - allowed actions use intersection;
  - denied actions use union;
  - numeric budgets and concurrency use the lowest limit;
  - human-required actions use union;
  - minimum assurance uses the strongest requirement.
- Non-combinable Policy conflicts fail closed and escalate.
- Intent priority never overrides a Policy or Control conflict.
- Removing an Intent must block or migrate active Operations.
- Historical references must remain resolvable.
- Intent-to-Operation cycles do not exist because Intent has no reverse
  Operation reference.

## Human and AI authority

Human owner:

- Creates and approves direction.
- Chooses priority, posture, scope, measures, Policies, and hard controls.
- Activates, pauses, retires, archives, or restores Intent.
- Approves expanded authority or reduced safeguards.

AI manager:

- MAY interpret an active Intent.
- MAY propose or reshape serving Operations.
- MAY record decisions, evidence, and recommendations through Runs.
- MUST prefer existing Operations and reusable assets when sufficient.
- MUST NOT broaden scope, weaken Controls, lower assurance, expand budgets,
  or activate responsibility without required authority.
- MUST mark missing information unknown instead of inventing it.

Operator meanings:

- **Active**: management may act under this direction.
- **Paused**: no new Intent-driven management work starts.
- **Archived**: retained for History but absent from active management.
- **Healthy**: not a first-class IntentState field; any health is derived.

## Approved target

- Intent is human direction and governance.
- IntentDefinition is immutable.
- IntentState contains Lifecycle only.
- Intent does not own Goals, Loops, Workflows, or Capabilities.
- Operations reference the Intents they serve.
- Runtime State and History remain outside Definition.
- Reusable Policies are referenced, not copied.
- Intent Controls are hard limits and may only tighten resolved Policies.
- Multi-Intent Controls combine using the most restrictive field result.
- Policy conflicts fail closed; priority never overrides governance.
- Cadence belongs to Loop Trigger, not Intent.
- Management Runs record decisions and evidence.
- Run stores the effective resolved Policy snapshot.

Migration requirements and remaining implementation proposals are tracked in
[`intent-implementation.md`](intent-implementation.md#approved-migration-changes).

## Examples

### Valid

```json
{
  "id": "safe-releases",
  "direction": "Keep production releases safe and predictable",
  "priority": 10,
  "posture": "confidence",
  "scope": {
    "include": { "repository": ["acme/dashboard"] },
    "exclude": {}
  },
  "priorities": ["Prefer evidence over speed"],
  "measures": ["Successful production verification"],
  "policyRefs": ["release-safety"],
  "controls": {
    "authority": { "allow": ["release"], "deny": [] },
    "budget": {
      "maxRuns": 3,
      "maxTokens": 100000,
      "maxCostUsd": 100,
      "maxDurationSeconds": 3600
    },
    "maxConcurrentRuns": 1,
    "requiresHumanFor": ["production-deploy"],
    "minimumAssurance": "strict"
  }
}
```

### Full valid

```json
{
  "id": "healthy-product-delivery",
  "direction": "Deliver useful product improvements without reducing reliability",
  "description": "Balance customer value, maintainability, and verified production behavior.",
  "priority": 20,
  "posture": "balanced",
  "scope": {
    "include": {
      "repository": ["acme/dashboard", "acme/engine"],
      "area": ["product", "delivery"]
    },
    "exclude": {
      "environment": ["customer-production-data"]
    }
  },
  "priorities": [
    "Fix responsibility confusion before adding structure",
    "Verify user-facing changes on the real route"
  ],
  "measures": ["Critical journeys pass", "No unresolved release blocker"],
  "policyRefs": ["engineering-quality", "release-safety"],
  "controls": {
    "authority": {
      "allow": ["plan", "implement", "test", "prepare-release"],
      "deny": ["delete-production-data"]
    },
    "budget": {
      "maxRuns": 20,
      "maxTokens": 1000000,
      "maxCostUsd": 500,
      "maxDurationSeconds": 21600
    },
    "maxConcurrentRuns": 3,
    "requiresHumanFor": ["production-deploy", "schema-migration"],
    "minimumAssurance": "strict"
  }
}
```

### Invalid: responsibility

```json
{
  "id": "safe-releases",
  "goals": ["publish-dashboard"],
  "workflow": ["test", "deploy"]
}
```

Violates `INT-04`: Intent does not own Goals or Workflow steps.

### Invalid: unresolved Policy

```json
{
  "id": "safe-releases",
  "policyRefs": ["policy-that-does-not-exist"]
}
```

Violates `INT-09`. The current parser accepts the string, but activation or
dispatch must reject the missing reference.

### Invalid: Definition mixed with State

```json
{
  "id": "safe-releases",
  "direction": "Keep releases safe",
  "lifecycle": "active"
}
```

Violates `INT-03`: Lifecycle belongs in IntentState.

### Invalid: State mixed with History

```json
{
  "definitionId": "safe-releases",
  "lifecycle": "active",
  "lastDecision": {
    "action": "DISPATCH",
    "reason": "Release is ready"
  }
}
```

Violates `INT-07`: decisions are RunOutput History.

## Decisions

| ID        | Date       | Decision                                                                                                              | Why                                                                    | Evidence                                | Approved by                                        |
| --------- | ---------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------- |
| `INT-D01` | 2026-07-14 | Intent owns direction and non-negotiable governance, not operating structure                                          | Intent was overloaded                                                  | `company-model.md`                      | User discussion                                    |
| `INT-D02` | 2026-07-14 | Humans author Intents; existing Agents manage Operations                                                              | Separates human authority from delegated management                    | `company-model.md`                      | User discussion                                    |
| `INT-D03` | 2026-07-20 | Intents select reusable Policies; Controls are hard limits                                                            | Avoids copied Policy guidance                                          | UI and migration evidence               | Partial implementation; live completion unverified |
| `INT-D04` | 2026-07-23 | Each model separates semantic contract from implementation evidence                                                   | Agents need focused context                                            | Model index/template                    | User                                               |
| `INT-D05` | 2026-07-23 | Model documents remain normal Markdown with compact sections                                                          | Human readability plus agent retrieval                                 | Template                                | User                                               |
| `INT-D06` | 2026-07-24 | Each model uses two main documents: meaning and implementation guide                                                  | Preserve detail without loading it for every task                      | `intent.md`, `intent-implementation.md` | User                                               |
| `INT-D07` | 2026-07-24 | Policies are reusable packages; Intent Controls may only tighten them; cadence belongs to Loop; conflicts fail closed | Keeps governance reusable, deterministic, and separate from scheduling | Intent review discussion                | User                                               |

## Open model decisions

These questions change Intent meaning or authority. Their evidence and options
are maintained in
[`intent-implementation.md`](intent-implementation.md#open-questions):

- `INT-Q03`: whether Draft is visible and editable.
- `INT-Q04`: legal Lifecycle transitions and actors.
- `INT-Q05`: current Definition selection.
- `INT-Q07`: repository-local versus portable Intent.
- `INT-Q08`: deletion and restore.
- `INT-Q10`: first-class Intent health.
- `INT-Q11`: priority direction and equal-priority behavior.

Blocking questions stop dependent implementation.

## Sources

- Canonical agency concepts:
  [`../company-model.md`](../company-model.md)
- Current domain contract:
  `packages/agency-domain/src/index.ts`
- Current implementation evidence:
  [`intent-implementation.md`](intent-implementation.md)
