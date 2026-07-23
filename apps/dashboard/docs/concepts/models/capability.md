# Capability

Status: **Draft**

## Meaning

A Capability is a stable public action contract: what can be done, with which
inputs, outputs, effects, permissions, success condition, and failure
condition. It is the seam between orchestration and interchangeable execution.

## Definition contract

```ts
interface CapabilityDefinition {
  id: string;
  action: string;
  purpose: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  effects: string[];
  permissions: string[];
  success: string;
  failure: string;
}
```

## Invariants

- One Capability describes one coherent action.
- Input and output schemas are machine-validatable.
- Effects and required permissions are explicit.
- Success and failure are observable.
- A Capability does not contain a schedule, Workflow, Agent, provider, script,
  deployment, or mutable runtime State.
- Breaking contract changes require a new revision and compatibility decision.

Workflows depend on Capabilities. Implementations implement them. Runs pin both
the Capability and selected Implementation revisions.

## Field meaning

| Field          | Meaning                                          |
| -------------- | ------------------------------------------------ |
| `id`           | Stable public action identity                    |
| `action`       | Machine-oriented verb or action name             |
| `purpose`      | Why callers use the action                       |
| `inputSchema`  | Accepted request contract                        |
| `outputSchema` | Produced result contract                         |
| `effects`      | External or durable changes the action can cause |
| `permissions`  | Authority required before execution              |
| `success`      | Observable success rule                          |
| `failure`      | Observable failure rule                          |

## Compatibility

Adding optional input/output fields may be compatible. Removing fields,
changing meaning/types, widening effects, or requiring new permissions is
breaking unless a reviewed compatibility rule says otherwise. A breaking
revision requires caller and Implementation migration.

## Failure cases

- Invalid input is rejected before Implementation selection.
- Missing permission or Policy authority is denied before execution.
- No compatible Implementation is an explicit dispatch failure.
- Invalid output fails the Run even if the adapter returned successfully.
- Undeclared effects are a contract violation and security incident.

## Recommended decisions

- Use JSON Schema 2020-12 with a project-owned validation wrapper.
- Maintain controlled effect and permission registries.
- Keep Evidence requirements on Objective/output contracts, not Capability
  identity.
- Require review for any effect, permission, or breaking schema change.

## Human and AI authority

AI may propose contracts and implementations. Humans approve permission,
effect, schema, or assurance changes that expand authority or break callers.

## Example

`deploy-site` accepts a site/version input and returns a deployment identifier
and URL. Its effects say that production state changes; its permissions name
the deployment authority; its success condition requires terminal deployment.

## Open decisions

- JSON Schema dialect and compatibility rules.
- Effect and permission vocabulary ownership.
- Deprecation window and caller migration policy.
- Whether output contracts include Evidence requirements or only data shape.
- Compatibility checker behavior and deprecation period.
