/**
 * @fileType util
 * @domain capabilities
 * @pattern chat-tools
 * @ai-summary In-process chat tools that let Kody build and manage custom
 *   capabilities (`capabilities/<slug>/` in the state repo) by conversation.
 */
import { readFile } from "fs/promises";
import path from "path";
import { tool } from "ai";
import { z } from "zod";
import type { Octokit } from "@octokit/rest";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import {
  isValidSlug,
  PERMISSION_MODES,
} from "@dashboard/lib/capabilities";
import { dashboardCapabilityUrl } from "@dashboard/lib/thread-link";

interface Ctx {
  octokit: Octokit;
  owner: string;
  repo: string;
  actorLogin?: string | null;
}

const skillSchema = z.object({
  name: z.string().min(1).max(64),
  body: z.string(),
});

const shellSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9._-]+\.sh$/, "must be a *.sh filename"),
  content: z.string(),
});

async function readCapabilityGuide(): Promise<string> {
  try {
    return await readFile(
      path.join(process.cwd(), "docs/capabilities.md"),
      "utf8",
    );
  } catch {
    return [
      "# How to create a proper capability",
      "",
      "- Kody can create or update capabilities with `create_or_update_capability`.",
      "- Capabilities live at state repo `capabilities/<slug>/profile.json` plus `capability.md`.",
      "- Keep `capability.md` as small operator-owned instructions.",
      "- Put reusable method/rules in `skills/<name>/SKILL.md`.",
      "- Put deterministic setup work in capability-owned `*.sh` scripts.",
      "- Use MCP tools only for external callable tool servers.",
      "- Use `skipAgent` when a script owns the full implementation.",
    ].join("\n");
  }
}

function actionFromCapability(slug: string, profileJson: string): string {
  try {
    const profile = JSON.parse(profileJson) as {
      action?: unknown;
      name?: unknown;
    };
    const action = typeof profile.action === "string" ? profile.action : null;
    const name = typeof profile.name === "string" ? profile.name : null;
    return action || name || slug;
  } catch {
    return slug;
  }
}

export function createCapabilityTools(ctx: Ctx) {
  const { octokit, owner, repo } = ctx;
  const repoRef = `${owner}/${repo}`;

  return {
    read_capability_creation_guide: tool({
      description:
        "Read the required guide for creating or editing capabilities. Call this before designing or using create_or_update_capability.",
      inputSchema: z.object({}),
      execute: async () => ({
        canCreateCapability: true,
        creationTool: "create_or_update_capability",
        guide: await readCapabilityGuide(),
      }),
    }),

    list_capabilities: tool({
      description: `List custom capabilities in ${repoRef} stored at state repo capabilities/<slug>/. Returns slug, description, tools, and landing.`,
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const rows = (await createBackendClient().query(api.catalog.list, { tenantId: repoRef, category: "capability" })) as Array<{ doc: unknown }>;
          const capabilities = rows.map((row) => row.doc);
          return { capabilities };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),

    read_capability: tool({
      description: `Read one custom capability from ${repoRef} in full: instructions, model, tools, skills, shell scripts, and raw profile.json.`,
      inputSchema: z.object({
        slug: z.string().min(1).max(64),
      }),
      execute: async ({ slug }) => {
        if (!isValidSlug(slug)) return { error: `invalid slug "${slug}"` };
        try {
          const row = await createBackendClient().query(api.catalog.get, { tenantId: repoRef, category: "capability", slug });
          const capability = (row as { doc?: unknown } | null)?.doc;
          if (!capability) return { error: `capability "${slug}" not found` };
          return { capability };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),

    create_or_update_capability: tool({
      description:
        `Create or update a custom capability in ${repoRef}. Before calling it, call read_capability_creation_guide and follow that guide. ` +
        "Commits state repo capabilities/<slug>/ (profile.json + capability.md + any skills/scripts) as one commit.",
      inputSchema: z.object({
        slug: z.string().min(1).max(64),
        describe: z.string().default(""),
        instructions: z.string().min(1),
        landing: z.enum(["pr", "comment"]).default("pr"),
        model: z.string().default("inherit"),
        permissionMode: z.enum(PERMISSION_MODES).default("acceptEdits"),
        tools: z
          .array(z.string())
          .default(["Read", "Write", "Edit", "Bash", "Grep", "Glob"]),
        skills: z.array(skillSchema).default([]),
        shellScripts: z.array(shellSchema).default([]),
      }),
      execute: async (input) => {
        if (!isValidSlug(input.slug)) {
          return { error: `invalid slug "${input.slug}"` };
        }

        try {
          const existingRow = await createBackendClient().query(api.catalog.get, { tenantId: repoRef, category: "capability", slug: input.slug });
          const existing = (existingRow as { doc?: Record<string, unknown> } | null)?.doc;
          await createBackendClient().mutation(api.catalog.save, {
            tenantId: repoRef,
            category: "capability",
            slug: input.slug,
            doc: {
              ...(existing ?? {}), slug: input.slug, describe: input.describe,
              prompt: input.instructions, model: input.model,
              permissionMode: input.permissionMode, tools: input.tools,
              skills: input.skills, shellScripts: input.shellScripts,
              mcpServers: [], landing: input.landing, source: "local", readOnly: false,
              updatedAt: new Date().toISOString(),
            },
            source: "local",
            updatedAt: new Date().toISOString(),
          });
          return {
            ok: true,
            action: existing ? "updated" : "created",
            slug: input.slug,
            htmlUrl: dashboardCapabilityUrl(input.slug),
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),

    delete_capability: tool({
      description: `Delete a custom capability from ${repoRef}; removes the whole state repo capabilities/<slug>/ folder in one commit.`,
      inputSchema: z.object({
        slug: z.string().min(1).max(64),
      }),
      execute: async ({ slug }) => {
        if (!isValidSlug(slug)) return { error: `invalid slug "${slug}"` };
        try {
          const existing = await createBackendClient().query(api.catalog.get, { tenantId: repoRef, category: "capability", slug });
          if (!existing) return { error: `capability "${slug}" not found` };
          await createBackendClient().mutation(api.catalog.remove, { tenantId: repoRef, category: "capability", slug });
          return { ok: true, action: "deleted", slug };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),

    run_capability: tool({
      description: `Run a capability NOW in ${repoRef}. Dispatches kody.yml with the capability action.`,
      inputSchema: z.object({
        slug: z.string().min(1).max(64),
      }),
      execute: async ({ slug }) => {
        if (!isValidSlug(slug)) return { error: `invalid slug "${slug}"` };
        try {
          const row = await createBackendClient().query(api.catalog.get, { tenantId: repoRef, category: "capability", slug });
          const existing = (row as { doc?: { profileJson?: string; prompt?: string } } | null)?.doc;
          if (!existing) return { error: `capability "${slug}" not found` };
          const repoMeta = await octokit.rest.repos.get({ owner, repo });
          const ref = repoMeta.data.default_branch || "main";
          const action = actionFromCapability(slug, existing.profileJson ?? JSON.stringify({ name: existing.prompt ?? slug }));
          await octokit.rest.actions.createWorkflowDispatch({
            owner,
            repo,
            workflow_id: "kody.yml",
            ref,
            inputs: { capability: action },
          });
          return {
            ok: true,
            workflowId: "kody.yml",
            ref,
            action,
            capability: slug,
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),

    run_workflow_creator: tool({
      description:
        `Ask Kody's validated workflow creator to design one workflow from an approved GitHub issue in ${repoRef}. ` +
        "It researches existing capabilities, validates the graph, and opens a review PR; it never writes an unreviewed workflow.",
      inputSchema: z.object({
        issue: z.number().int().positive().describe("Approved GitHub issue containing the workflow request."),
      }),
      execute: async ({ issue }) => {
        try {
          const repoMeta = await octokit.rest.repos.get({ owner, repo });
          const ref = repoMeta.data.default_branch || "main";
          await octokit.rest.actions.createWorkflowDispatch({
            owner,
            repo,
            workflow_id: "kody.yml",
            ref,
            inputs: { capability: "workflow-creator", issue_number: String(issue) },
          });
          return {
            ok: true,
            workflowId: "kody.yml",
            capability: "workflow-creator",
            issue,
            ref,
            note: "Workflow creator started; it will open a validated review PR when complete.",
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),
  };
}
