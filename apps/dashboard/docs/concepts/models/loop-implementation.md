# Loop implementation guide

Status: **Definition management implemented; execution not implemented**

## Current model

A Loop is a small repository-scoped definition:

```ts
{
  id: string;
  trigger:
    | { type: "manual" }
    | { type: "schedule"; every: string; at?: { time: string; timezone: string } }
    | { type: "event" | "webhook"; event: string }
    | { type: "condition"; expression: string };
  target: { kind: "workflow" | "capability"; id: string };
  input: Record<string, unknown>;
  enabled: boolean;
}
```

The Loop does not own Workflow steps, Capability behavior, Goal state, policy,
run history, health, retry, concurrency, or scheduling state.

## Current ownership

| Concern               | Owner                                                                   |
| --------------------- | ----------------------------------------------------------------------- |
| Validation            | `createLoopDefinition()` in `@kody-ade/agency-domain`                   |
| UI                    | `apps/dashboard/src/dashboard/features/agency/components/LoopsPage.tsx` |
| List and create API   | `apps/dashboard/app/api/kody/loops/route.ts`                            |
| Update and delete API | `apps/dashboard/app/api/kody/loops/[id]/route.ts`                       |
| Storage               | Convex `repoDocs`, scoped by `<owner>/<repo>`                           |
| Storage key           | `loop:<id>`                                                             |
| Target catalogs       | Existing Workflow and Capability APIs                                   |

GitHub is not a Loop runtime-state store.

## Current behavior

- `GET /api/kody/loops` lists valid `loop:` documents for the active
  repository.
- `POST /api/kody/loops` validates and creates one Loop. Duplicate IDs return
  `409`.
- `PATCH /api/kody/loops/:id` validates and replaces the saved definition
  while preserving the route ID.
- `DELETE /api/kody/loops/:id` removes the saved definition.
- The UI can create, search, inspect, edit, enable, disable, and delete Loops.
- A target is one existing Workflow or Capability.

`enabled` currently records operator intent only. This code does not prove that
any scheduler, event listener, condition evaluator, or manual dispatcher runs
the target.

## Explicitly absent

The current implementation has no:

- managed-goal compatibility projection;
- separate Loop State or History model;
- manual run endpoint;
- scheduler or event adapter;
- activation, lease, idempotency, retry, timeout, or overlap policy;
- health reconciliation;
- GitHub Actions dispatch.

Do not document any of these as current behavior until the owning runtime
exists and is verified.

## Execution boundary

If Loop execution is added, keep it behind one explicit dispatcher:

1. Receive an eligible trigger.
2. Load the enabled Loop for the active repository.
3. Invoke its saved Workflow or Capability with the saved input.
4. Record execution through the existing run system.

Do not add Goal, Operation, Policy, or another Loop model to achieve this.
Workflow remains responsible for steps, conditions, and internal looping.

## Verification

Current browser coverage proves the Loop management UI against mocked API
contracts, including target selection and editing. Typecheck and route
inspection prove the current code shape.

The following remain unverified because their runtime does not exist here:

- scheduled execution;
- event, webhook, and condition activation;
- manual execution;
- retries, concurrency, idempotency, and persisted run outcomes.

## Recommended next change

Keep Loop definition management as-is. Add execution only when there is a
verified trigger requirement, and use one small dispatcher shared by every
trigger type.
