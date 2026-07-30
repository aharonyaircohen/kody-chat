import { tool } from "ai";
import { z } from "zod";

const workflowIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);

interface RunWorkflowInput {
  workflowId: string;
  input: Record<string, unknown>;
}

interface Ctx {
  owner: string;
  repo: string;
  listWorkflows(): Promise<unknown>;
  readWorkflow(workflowId: string): Promise<unknown>;
  runWorkflow(input: RunWorkflowInput): Promise<unknown>;
}

export function createWorkflowTools(ctx: Ctx) {
  const repoRef = `${ctx.owner}/${ctx.repo}`;

  return {
    list_workflows: tool({
      description: `List the active Workflows available to Kody in ${repoRef}; use this to discover the correct reusable workflow from its definition instead of guessing or hardcoding an ID.`,
      inputSchema: z.object({}),
      execute: async () => ctx.listWorkflows(),
    }),

    read_workflow: tool({
      description: `Read one active Workflow definition in ${repoRef}; use this after list_workflows to verify its purpose, steps, capabilities, and expected input before selecting it.`,
      inputSchema: z.object({
        workflowId: workflowIdSchema,
      }),
      execute: async ({ workflowId }) => ctx.readWorkflow(workflowId),
    }),

    run_workflow: tool({
      description: `Run one selected active Workflow in ${repoRef} through the standard Engine API. If approval is required, this returns a server-bound approval card; after the user clicks Approve, call this again with the exact same workflow ID and input.`,
      inputSchema: z.object({
        workflowId: workflowIdSchema,
        input: z.record(z.string(), z.unknown()).default({}),
      }),
      execute: async (input) => ctx.runWorkflow(input),
    }),
  };
}
