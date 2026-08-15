# Request Blueprints

A Request Blueprint is one reusable definition that gives the user a Guided
Flow and gives Kody matching instructions. It prevents the form and the model
prompt from becoming two separate sources that drift apart.

It defines how to understand a request. It does not become a second workflow
engine, Agency loop, or persistence system.

## User journey

1. The user opens **Request Blueprints** for a repository.
2. The user chooses **Start in Chat** for a Blueprint.
3. The generated Guided Flow asks only the questions and decisions defined by
   that Blueprint.
4. Every answer is saved with the Guided Flow instance, so the user can resume.
5. Kody reads model guidance generated from the same Blueprint.
6. On completion, the Blueprint either finishes as guidance or invokes its
   explicitly configured completion action.
7. When the completion action is `agency-request.submit`, the existing Agency
   Request Manager creates or updates a Todo and takes over assessment,
   approval, execution, monitoring, verification, and reporting.

If Kody can discover a fact safely, it should do so. If a real user decision is
still missing, it should ask a clear question with enough context to answer.

## One definition, two generated views

The Request Blueprint is the source of truth for both paths:

- **User path:** `buildGuidedFlowFromRequestBlueprint` removes only the
  Blueprint-specific `purpose` field and produces the normal Guided Flow
  runtime definition.
- **Kody path:** `buildRequestBlueprintModelGuide` turns the same purpose,
  steps, routes, commands, nested flows, and actions into model guidance.

The generated Guided Flow and model guide must not be edited independently.
Change the Request Blueprint and generate both again.

## Ownership

| Responsibility | Owner |
| --- | --- |
| Purpose, ordered questions, commands, routes, and completion action | Request Blueprint |
| Rendering, navigation, Back, resume, answers, and versioned instances | Guided Flow |
| Repository-specific assessment and missing-information questions | Agency Request Manager and Kody |
| Durable progress state | Todo |
| Automation execution and retries | Existing Workflow and Agency loop |
| Run history and end-to-end evidence | Existing Runs and Reports |
| Repository data | Existing feature owner |

The Request Blueprint never owns automation execution or creates another state
store.

## Definition

A `RequestBlueprintDefinition` is the existing `GuidedFlowDefinition` plus one
required field:

- `purpose`: the shared outcome Kody and the user are trying to achieve.

The full definition may contain:

- `id`: stable lowercase identifier;
- `version`: positive integer;
- `title`: user-visible name;
- `purpose`: shared outcome and scope;
- `steps`: at least one ordered step;
- `controls`: optional controls such as Back;
- `completionRouteId` and parameters: optional page to show after completion;
- `onComplete`: optional handoff to an existing owner.

Every step needs a stable id, title, explanation, and explicit actions. An
action may move to another step, stay on the current step, complete, or cancel.
Step and action ids must be unique, and every target step must exist.

## Step types

Use the smallest existing step type that fits:

- **View:** show an existing renderer such as `approval-card`, `guided-form`,
  `selection-list`, or `multi-select-list`.
- **Command:** run one existing Chat slash command. A command result must be
  completed before the flow may continue; warnings remain on the step for a
  retry.
- **Nested flow:** reuse another versioned Guided Flow for a sub-process.

A step may also point to an existing Dashboard page. The Blueprint identifies
the route; it does not own that page or its data.

## Completion and Agency execution

Completion is explicit. A normal Request Blueprint may simply finish after its
last step.

For a Blueprint that should become managed work, set:

```ts
onComplete: { action: "agency-request.submit" }
```

That handoff sends the collected answers to the existing Agency Request
Manager. The manager creates or updates one Todo, checks whether the request is
clear and executable, prepares a repository-specific plan, asks for approval
when required, dispatches the chosen Workflow, monitors its Run, verifies the
success criteria, and records the final evidence.

The Todo is the durable state of that work. The Agency loop exists only while
the request still needs monitoring; completed work does not keep an active
loop.

## Request Blueprint versus Store Blueprint

These names describe different responsibilities:

- A **Request Blueprint** defines how the user and Kody understand and complete
  a request.
- A **Store Blueprint** is an executable Strategy Blueprint: a reusable recipe
  with a Workflow, required activations, constraints, and verification rules.

Starting a Request Blueprint opens its Guided Flow. Applying a Store Blueprint
creates the Agency request from the saved recipe and starts the existing Agency
execution path. A Request Blueprint can collect the information needed to
create or select a Store Blueprint, but it is not itself the executor.

## Authoring and versions

Built-in Request Blueprints live under
`packages/kody-chat-dashboard/src/dashboard/lib/request-blueprints/` and are
registered with the built-in Guided Flows. Built-ins are read-only.

Repository-created Request Blueprints use the **Request Blueprints** editor and
the existing repository-scoped Guided Flow API. Saving creates version 1;
editing creates the next version. Existing instances remain pinned to the
version they started with.

The editor derives stable step ids, renderer data, and explicit actions from
the draft. The server validates navigation, renderer compatibility, nested-flow
composition, and versioned persistence before saving.

## Minimal example

```ts
const blueprint = {
  id: "prepare-release",
  version: 1,
  title: "Prepare a release",
  purpose: "Collect the release decision and hand it to managed execution.",
  controls: ["back"],
  onComplete: { action: "agency-request.submit" },
  steps: [
    {
      id: "confirm",
      title: "Confirm the release",
      explanation: "Review the target and confirm that Kody may continue.",
      rendererSlug: "approval-card",
      rendererData: {
        title: "Prepare this release?",
        actions: [
          {
            id: "confirm",
            label: "Confirm",
            response: "confirm",
            variant: "primary",
          },
        ],
      },
      actions: [{ id: "confirm", target: { type: "complete" } }],
    },
  ],
};
```

## Verification checklist

Before calling a Request Blueprint complete, verify:

- one definition generates both the Guided Flow and Kody guidance;
- the purpose clearly states the reusable outcome;
- each step asks one coherent question or performs one existing command;
- all actions and nested-flow targets are valid;
- answers persist and resume through the Guided Flow runtime;
- editing creates a new version without breaking active instances;
- command warnings cannot advance as successful results;
- any completion action reaches its existing owner exactly once;
- `agency-request.submit` creates or updates one Todo without duplicating work;
- the Agency path remains active until real end-to-end evidence exists;
- no new executor, loop system, renderer, or storage path was introduced.

See [Creating proper GuidedFlows](guided-flows.md) for detailed interaction and
renderer design rules.
