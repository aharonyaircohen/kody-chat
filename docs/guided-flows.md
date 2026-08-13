# Creating proper GuidedFlows

A GuidedFlow should make a multi-step user decision simple, resumable, and
predictable. It guides the user; it does not become a second workflow engine or
feature-specific storage system.

## When to use one

Use a GuidedFlow when the user must complete several dependent steps, needs to
understand progress, or may leave and resume later.

Do not use one for a single question, automatic work, background execution, or
to duplicate an editor, renderer, or storage path already owned elsewhere.

## Start with an introduction

Every non-trivial GuidedFlow should begin with a short introduction step. It
must explain, in user terms:

1. what the flow will achieve;
2. what Kody will do automatically;
3. what the user must provide or decide;
4. how many steps or questions follow;
5. when consequential work will begin;
6. what output or change the flow will create;
7. what it will not change.

Give the introduction one clear action such as `Begin`, `Continue`, or
`Review setup`. Use an existing renderer such as `approval-card`; do not create
an introduction-specific renderer.

## Design one user decision per step

Each step should represent one understandable question, decision, or action.

- Give the step a clear title and explanation.
- Keep the input next to the text that explains it.
- Ask only for information the system cannot determine reliably itself.
- Use Back when changing an earlier answer is safe.
- Show progress when the flow contains several similar steps.
- Put optional context at the end and label it optional.
- Start external or consequential work only after the final confirmation or
  answer.

If one card contains many unrelated fields, split it into steps. If the steps
do not depend on each other and need neither progress nor resume, a GuidedFlow
may be unnecessary.

## Reuse the existing step types

Choose the smallest existing contract that represents the decision:

- `approval-card` for an introduction, confirmation, or small decision;
- `guided-form` for user-entered values;
- `selection-list` for one choice;
- `multi-select-list` for several choices;
- `command` for an existing Chat command owned elsewhere;
- nested `flow` for a reusable GuidedFlow that already owns a sub-process.

Use a widget only when normal renderer primitives cannot express the
interaction. A widget must not own flow navigation or persistence.

## Keep ownership clean

GuidedFlow owns:

- ordered steps and transitions;
- current progress, Back, cancel, and resume;
- collected step results;
- conversation binding and durable submission history.

The feature still owns its real work and data. The flow passes its completed
result to that existing owner. Do not add feature-specific storage, execution,
or business rules to the generic GuidedFlow renderer or controller.

For example, a project-assessment flow owns its introduction and questions,
but the assessment Agent owns analysis and the report path owns the output.

## Define actions and transitions explicitly

Every step requires at least one action. Renderer action ids and flow action
ids must match. An action targets another step, the same step (`stay`), flow
completion, or flow cancellation.

Use stable lowercase ids. Every transition must reference an existing step.
Avoid model decisions for deterministic navigation.

## Persistence and versions

The runtime saves submitted results after every step and merges them into the
flow's collected data. Use this persistence for resume and later reads; do not
mirror answers into conversation text or another store.

Published definitions are versioned contracts. When changing step ids,
transitions, or saved-data shape:

1. publish a new version;
2. register it as current;
3. keep older versions available while active instances may reference them.

Do not silently mutate a definition used by saved instances.

## Where definitions live

Built-in definitions live under
`packages/kody-chat-dashboard/src/dashboard/lib/guided-flows/builtins/` and are
registered in `builtins/index.ts`.

Repository-created definitions use the existing GuidedFlow editor and storage
path. Both use the same definition, validation, renderer, persistence, and
runtime contracts.

## Minimal example

```ts
const FLOW = {
  id: "example-setup",
  version: 1,
  title: "Example setup",
  controls: ["back"],
  steps: [
    {
      id: "introduction",
      title: "Before setup",
      explanation:
        "Explain the outcome, automatic work, user decisions, and final effect.",
      rendererSlug: "approval-card",
      rendererData: {
        title: "Set up this feature",
        actions: [
          {
            id: "continue",
            label: "Begin",
            response: "continue",
            variant: "primary",
          },
        ],
      },
      actions: [
        {
          id: "continue",
          target: { type: "step", stepId: "name" },
        },
      ],
    },
    {
      id: "name",
      title: "Choose a name",
      explanation: "Explain what the name identifies and where it appears.",
      rendererSlug: "guided-form",
      rendererData: {
        title: "Name",
        fields: [{ name: "name", label: "Name", value: "" }],
        submitLabel: "Finish",
      },
      actions: [{ id: "submit", target: { type: "complete" } }],
    },
  ],
};
```

## Verification checklist

Before calling a GuidedFlow complete, verify:

- the introduction clearly sets expectations;
- each card contains one coherent user decision;
- each visible action moves to the intended step;
- answers persist and remain available after resume;
- Back restores a usable earlier step;
- completion happens only after the final decision;
- the completed result reaches the existing feature owner exactly once;
- old active versions still resume after a definition update;
- the canonical repository-scoped browser route works;
- no new renderer, storage path, or executor was added without a demonstrated
  need.
