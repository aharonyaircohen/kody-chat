import type { WorkflowDefinition } from "@dashboard/lib/workflow-definitions";

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

/**
 * A one-step workflow has no mapping decision to make: its public input is the
 * capability input. Keep multi-step and already-configured workflows explicit.
 */
export function wireSingleCapabilityInputs(
  workflow: WorkflowDefinition,
  contractJson: string | null,
): WorkflowDefinition {
  const steps = workflow.steps ?? [];
  if (steps.length !== 1 || workflow.inputSchema) return workflow;
  if (steps[0]?.inputs && Object.keys(steps[0].inputs).length > 0)
    return workflow;
  if (!contractJson) return workflow;

  let contract: JsonObject | null = null;
  try {
    contract = objectValue(JSON.parse(contractJson));
  } catch {
    return workflow;
  }
  const input = objectValue(contract?.input);
  const properties = objectValue(input?.properties);
  if (input?.type !== "object" || !properties) return workflow;

  const fields = Object.keys(properties).filter((field) =>
    /^[A-Za-z_][A-Za-z0-9_-]*$/.test(field),
  );
  if (fields.length === 0) return workflow;

  return {
    ...workflow,
    inputSchema: input,
    steps: [
      {
        ...steps[0]!,
        inputs: Object.fromEntries(
          fields.map((field) => [field, { from: `workflow.input.${field}` }]),
        ),
      },
    ],
  };
}
