# Request Blueprints

A Request Blueprint describes the information Kody needs to understand one
kind of request. From that one semantic definition, Kody generates:

- a Guided Flow for information the user must provide;
- model guidance for facts Kody should discover and decisions it must ask for.

This keeps the user questions and Kody instructions aligned without making the
two runtime models the same thing.

## Boundary

`RequestBlueprintDefinition` and `GuidedFlowDefinition` are separate models.
A Request Blueprint does not contain renderer data, steps, routes, commands, or
another Guided Flow definition. It contains only request meaning:

- stable `id`, `version`, and user-visible `title`;
- `purpose`;
- optional introduction text;
- requirements, including who supplies each value;
- optional Back behavior and completion handoff.

Each requirement declares `source: "kody" | "user"`:

- `kody`: discover the fact from the repository or connected systems;
- `user`: ask only when the value was not already supplied.

## Generated outputs

`buildGuidedFlowFromRequestBlueprint` creates a normal Guided Flow containing
only the missing user questions. The generated flow records its source:

```ts
source: {
  type: "request-blueprint",
  id: "prepare-release",
  version: 2,
}
```

That reference makes the flow read-only and ties it to the exact Blueprint
version. The Guided Flow runtime continues to own rendering, navigation,
answers, resume, and instances.

`buildRequestBlueprintModelGuide` creates model-readable guidance from the same
requirements. It tells Kody which facts to discover, which decisions to ask the
user for, and where to hand the completed request.

Manually authored Guided Flows remain independent. They are not silently
treated as Request Blueprints and do not receive generated model guidance.

## Current user experience

The **Guided Flows** page manages Guided Flows. Users can create and edit
manual flows there. Built-in and Blueprint-generated flows are read-only and
can be started in Chat.

Request Blueprints are background definitions in the first release. A separate
Request Blueprint management page may be added later; it must not replace or
rename the Guided Flows page.

## Ownership

| Responsibility | Owner |
| --- | --- |
| Request purpose and required information | Request Blueprint |
| Generated user questions | Request Blueprint generator |
| Rendering, navigation, answers, and resume | Guided Flow |
| Repository discovery and model instructions | Generated model guide and Kody |
| Managed-work handoff | Agency Request Manager |
| Durable work progress | Todo |
| Execution and retries | Existing Workflow and Agency loop |

The Request Blueprint does not own execution, persistence for work progress, or
a second automation loop.

## Minimal example

```ts
const blueprint: RequestBlueprintDefinition = {
  id: "prepare-release",
  version: 1,
  title: "Prepare a release",
  purpose: "Collect missing release decisions and prepare managed execution.",
  introduction: {
    title: "Prepare the release",
    guidance: "Kody checks the repository before asking for decisions.",
  },
  allowBack: true,
  requirements: [
    {
      id: "target",
      key: "target",
      title: "Which environment should receive the release?",
      guidance: "Choose the intended release environment.",
      source: "user",
      required: true,
    },
    {
      id: "release-command",
      key: "releaseCommand",
      title: "Repository release command",
      guidance: "Inspect repository scripts and deployment configuration.",
      source: "kody",
      required: true,
    },
  ],
  completion: {
    submitLabel: "Submit request",
    handoff: "agency-request.submit",
  },
};
```

## Verification

Before calling a Request Blueprint complete, verify:

- the Blueprint model has no Guided Flow or renderer fields;
- the generated Guided Flow asks only missing user requirements;
- Kody-owned requirements appear in the model guide, not as user questions;
- the generated flow records the exact Blueprint id and version;
- generated flows cannot be edited independently;
- manual Guided Flows remain editable and receive no Blueprint guidance;
- any completion handoff reaches its existing owner exactly once;
- no new executor, loop system, renderer, or work-state store was introduced.

See [Creating proper GuidedFlows](guided-flows.md) for interaction and renderer
design rules.
