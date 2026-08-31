import { tool } from "ai";
import { z } from "zod";
import type { Octokit } from "@octokit/rest";
import { readableResourceResult } from "./readable-resource-result";

interface Ctx {
  octokit: Octokit;
  owner: string;
  repo: string;
  actorLogin?: string | null;
  listCapabilities(): Promise<unknown>;
  readCapability(slug: string): Promise<unknown>;
  saveCapability(input: {
    slug: string;
    instructions: string;
    contract: string;
    skills: Array<z.infer<typeof assetSchema>>;
    tools: Array<z.infer<typeof assetSchema>>;
  }): Promise<unknown>;
  removeCapability(slug: string): Promise<unknown>;
  runCapability(slug: string): Promise<unknown>;
}

const assetSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug);
}

const connectionIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);

export function createCapabilityTools(ctx: Ctx) {
  const { octokit, owner, repo } = ctx;
  const repoRef = `${owner}/${repo}`;

  return {
    read_capability_creation_guide: tool({
      description: "Read the Capability folder guide.",
      inputSchema: z.object({}),
      execute: async () => ({
        guide:
          'A Capability is one folder containing instructions.md, contract.json, skills/, and tools/. The contract declares execution as "agent" or "script" plus one JSON input and output. Script execution requires tools/run.sh and may declare exact Connection ids and secret names granted to that trusted process.',
      }),
    }),

    list_capabilities: tool({
      description: `List local and active Store Capabilities in ${repoRef} through the Dashboard API.`,
      inputSchema: z.object({}),
      execute: async () => ctx.listCapabilities(),
    }),

    read_capability: tool({
      description: `Read one Capability folder from ${repoRef}.`,
      inputSchema: z.object({ slug: z.string().min(1).max(64) }),
      execute: async ({ slug }) => {
        if (!isValidSlug(slug)) return { error: `invalid slug "${slug}"` };
        return readableResourceResult(await ctx.readCapability(slug));
      },
    }),

    create_or_update_capability: tool({
      description: `Create or replace one simple Capability folder in ${repoRef}.`,
      inputSchema: z.object({
        slug: z.string().min(1).max(64),
        instructions: z.string().min(1),
        contract: z
          .object({
            execution: z.enum(["agent", "script"]).default("agent"),
            connections: z.array(connectionIdSchema).optional(),
            secrets: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).optional(),
            timeoutMs: z.number().int().min(1_000).max(21_600_000).optional(),
            input: z.record(z.string(), z.unknown()),
            output: z.record(z.string(), z.unknown()),
          })
          .default({ execution: "agent", input: {}, output: {} }),
        skills: z.array(assetSchema).default([]),
        tools: z.array(assetSchema).default([]),
      }),
      execute: async (input) => {
        if (!isValidSlug(input.slug)) {
          return { error: `invalid slug "${input.slug}"` };
        }
        return ctx.saveCapability({
          slug: input.slug,
          instructions: input.instructions,
          contract: `${JSON.stringify(input.contract, null, 2)}\n`,
          skills: input.skills,
          tools: input.tools,
        });
      },
    }),

    delete_capability: tool({
      description: `Remove one Capability from ${repoRef} through the Dashboard API. A local capability is deleted; a Store capability is only detached from this repo.`,
      inputSchema: z.object({ slug: z.string().min(1).max(64) }),
      execute: async ({ slug }) => {
        if (!isValidSlug(slug)) return { error: `invalid slug "${slug}"` };
        return ctx.removeCapability(slug);
      },
    }),

    run_capability: tool({
      description: `Run one local or active Store Capability now as Kody in ${repoRef} through the Dashboard API.`,
      inputSchema: z.object({ slug: z.string().min(1).max(64) }),
      execute: async ({ slug }) => {
        if (!isValidSlug(slug)) return { error: `invalid slug "${slug}"` };
        return ctx.runCapability(slug);
      },
    }),

    run_workflow_creator: tool({
      description: `Ask Kody to design a Workflow from an approved GitHub issue in ${repoRef}.`,
      inputSchema: z.object({ issue: z.number().int().positive() }),
      execute: async ({ issue }) => {
        const repoMeta = await octokit.rest.repos.get({ owner, repo });
        const ref = repoMeta.data.default_branch || "main";
        await octokit.rest.actions.createWorkflowDispatch({
          owner,
          repo,
          workflow_id: "kody.yml",
          ref,
          inputs: {
            capability: "workflow-creator",
            issue_number: String(issue),
          },
        });
        return {
          ok: true,
          workflowId: "kody.yml",
          capability: "workflow-creator",
          issue,
          ref,
        };
      },
    }),
  };
}
