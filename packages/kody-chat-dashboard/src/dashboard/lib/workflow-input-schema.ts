import { z } from "zod";

export type WorkflowInputSchema = Record<string, unknown>;

export interface WorkflowInputIssue {
  code: string;
  path: string;
  message: string;
}

function issuePath(path: PropertyKey[]): string {
  if (path.length === 0) return "input";
  return `input.${path.map(String).join(".")}`;
}

function compileWorkflowInputSchema(schema: WorkflowInputSchema) {
  return z.fromJSONSchema(schema as never);
}

export function validateWorkflowInputSchema(
  schema: WorkflowInputSchema | undefined,
): WorkflowInputIssue[] {
  if (!schema) return [];
  try {
    compileWorkflowInputSchema(schema);
    return [];
  } catch (error) {
    return [
      {
        code: "invalid_workflow_input_schema",
        path: "inputSchema",
        message:
          error instanceof Error
            ? error.message
            : "Workflow input schema is invalid.",
      },
    ];
  }
}

export function validateWorkflowInput(
  input: Record<string, unknown>,
  schema: WorkflowInputSchema | undefined,
): WorkflowInputIssue[] {
  if (!schema) return [];
  let validator: ReturnType<typeof compileWorkflowInputSchema>;
  try {
    validator = compileWorkflowInputSchema(schema);
  } catch {
    return validateWorkflowInputSchema(schema);
  }
  const result = validator.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    code: "invalid_workflow_input",
    path: issuePath(issue.path),
    message: issue.message,
  }));
}
