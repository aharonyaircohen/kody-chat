import { tool } from "ai";
import { z } from "zod";
import type { Octokit } from "@octokit/rest";

import {
  deleteCapabilityFile,
  isValidSlug,
  listLocalCapabilityFiles,
  readCapabilityFile,
  writeCapabilityFolderFiles,
} from "@kody-ade/agency/capabilities";
import { dashboardCapabilityUrl } from "../../../../../src/dashboard/lib/thread-link";

interface Ctx {
  octokit: Octokit;
  owner: string;
  repo: string;
  actorLogin?: string | null;
}

const assetSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

function files(input: {
  instructions: string;
  contract: {
    execution: "agent" | "script";
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  };
  skills: Array<z.infer<typeof assetSchema>>;
  tools: Array<z.infer<typeof assetSchema>>;
}): Record<string, string> {
  return {
    "instructions.md": `${input.instructions.trim()}\n`,
    "contract.json": `${JSON.stringify(input.contract, null, 2)}\n`,
    ...Object.fromEntries(
      input.skills.map((asset) => [`skills/${asset.path}`, asset.content]),
    ),
    ...Object.fromEntries(
      input.tools.map((asset) => [`tools/${asset.path}`, asset.content]),
    ),
  };
}

export function createCapabilityTools(ctx: Ctx) {
  const { octokit, owner, repo } = ctx;
  const repoRef = `${owner}/${repo}`;

  return {
    read_capability_creation_guide: tool({
      description: "Read the Capability folder guide.",
      inputSchema: z.object({}),
      execute: async () => ({
        guide:
          'A Capability is one folder containing instructions.md, contract.json, skills/, and tools/. The contract declares execution as "agent" or "script" plus one JSON input and output. Script execution requires tools/run.sh; instructions explain the work.',
      }),
    }),

    list_capabilities: tool({
      description: `List Capabilities in ${repoRef}.`,
      inputSchema: z.object({}),
      execute: async () => ({ capabilities: await listLocalCapabilityFiles() }),
    }),

    read_capability: tool({
      description: `Read one Capability folder from ${repoRef}.`,
      inputSchema: z.object({ slug: z.string().min(1).max(64) }),
      execute: async ({ slug }) => {
        if (!isValidSlug(slug)) return { error: `invalid slug "${slug}"` };
        const capability = await readCapabilityFile(slug);
        return capability
          ? { capability }
          : { error: `capability "${slug}" not found` };
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
        try {
          const existing = await readCapabilityFile(input.slug);
          await writeCapabilityFolderFiles({
            slug: input.slug,
            files: files(input),
            isUpdate: Boolean(existing),
          });
          return {
            ok: true,
            action: existing ? "updated" : "created",
            slug: input.slug,
            htmlUrl: dashboardCapabilityUrl(input.slug),
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),

    delete_capability: tool({
      description: `Delete one Capability from ${repoRef}.`,
      inputSchema: z.object({ slug: z.string().min(1).max(64) }),
      execute: async ({ slug }) => {
        if (!isValidSlug(slug)) return { error: `invalid slug "${slug}"` };
        if (!(await readCapabilityFile(slug))) {
          return { error: `capability "${slug}" not found` };
        }
        await deleteCapabilityFile(slug);
        return { ok: true, action: "deleted", slug };
      },
    }),

    run_capability: tool({
      description: `Run one Capability now as Kody in ${repoRef}.`,
      inputSchema: z.object({ slug: z.string().min(1).max(64) }),
      execute: async ({ slug }) => {
        if (!isValidSlug(slug)) return { error: `invalid slug "${slug}"` };
        if (!(await readCapabilityFile(slug))) {
          return { error: `capability "${slug}" not found` };
        }
        const repoMeta = await octokit.rest.repos.get({ owner, repo });
        const ref = repoMeta.data.default_branch || "main";
        await octokit.rest.actions.createWorkflowDispatch({
          owner,
          repo,
          workflow_id: "kody.yml",
          ref,
          inputs: { capability: slug },
        });
        return {
          ok: true,
          workflowId: "kody.yml",
          ref,
          action: slug,
          capability: slug,
          agent: "Kody",
        };
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
