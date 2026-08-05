import { tool } from "ai";
import { z } from "zod";
import { workflowStepDefinitionSchema } from "../../../../../src/dashboard/lib/workflow-definitions";

const workflowIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);

interface RunWorkflowInput {
  workflowId: string;
  input: Record<string, unknown>;
}

const workflowWriteSchema = z.object({
  id: workflowIdSchema.optional(),
  name: z.string().trim().min(1).max(160),
  agent: z.string().trim().min(1).max(80).default("kody"),
  capabilities: z.array(z.string().trim().min(1).max(80)).min(1),
  inputSchema: z.record(z.string(), z.unknown()).default({}),
  startAt: z.string().trim().min(1).max(80).optional(),
  steps: z.array(workflowStepDefinitionSchema).min(1).optional(),
  runWithoutApproval: z.boolean().default(false),
});

type WorkflowWriteInput = z.infer<typeof workflowWriteSchema>;

interface Ctx {
  owner: string;
  repo: string;
  listWorkflows(): Promise<unknown>;
  readWorkflow(workflowId: string): Promise<unknown>;
  saveWorkflow(input: WorkflowWriteInput): Promise<unknown>;
  removeWorkflow(workflowId: string): Promise<unknown>;
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

    create_or_update_workflow: tool({
      description: `Create or update one Workflow in ${repoRef} through the same validated Dashboard API used by the visual editor. Store workflows remain protected from editing in this repo.`,
      inputSchema: workflowWriteSchema,
      execute: async (input) => ctx.saveWorkflow(input),
    }),

    remove_workflow: tool({
      description: `Remove one Workflow from ${repoRef} through the Dashboard API. A local workflow is deleted; a Store workflow is only detached from this repo.`,
      inputSchema: z.object({ workflowId: workflowIdSchema }),
      execute: async ({ workflowId }) => ctx.removeWorkflow(workflowId),
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
