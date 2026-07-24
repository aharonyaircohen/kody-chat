/**
 * @fileType util
 * @domain todos
 * @pattern chat-tools
 * @ai-summary Chat tools for finite Todo documents.
 */
import { tool } from "ai";
import { z } from "zod";
import type { Octokit } from "@octokit/rest";
import {
  createTodoSlug,
  deleteTodoFile,
  isValidTodoSlug,
  listTodoFiles,
  readTodoFile,
  writeTodoFile,
} from "../todos/files";
import { dashboardTodoUrl } from "@kody-ade/base/thread-link";

interface Ctx {
  octokit: Octokit;
  owner: string;
  repo: string;
  actorLogin?: string | null;
}

const checklistItemSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  text: z.string().trim().min(1).max(20_000),
  done: z.boolean().default(false),
});

function normalizeChecklist(items: z.infer<typeof checklistItemSchema>[]) {
  return items.map((item) => ({
    id: item.id ?? crypto.randomUUID(),
    text: item.text,
    done: item.done,
  }));
}

export function createTodoTools(ctx: Ctx) {
  const { octokit, owner, repo, actorLogin } = ctx;
  const repoRef = `${owner}/${repo}`;
  const by = actorLogin ? ` (via chat by @${actorLogin})` : "";

  return {
    list_todo_lists: tool({
      description: `List finite Todos in ${repoRef}.`,
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const lists = await listTodoFiles();
          return {
            lists: lists.map((list) => {
              const total = list.checklist.length;
              const done = list.checklist.filter((item) => item.done).length;
              return {
                slug: list.slug,
                title: list.title,
                outcome: list.outcome,
                status: list.status,
                checklist: { total, done },
                blockers: list.blockers,
                runIds: list.runIds,
                updatedAt: list.updatedAt,
              };
            }),
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),

    read_todo_list: tool({
      description: `Read one finite Todo from ${repoRef}.`,
      inputSchema: z.object({
        slug: z.string().min(1).max(64),
      }),
      execute: async ({ slug }) => {
        if (!isValidTodoSlug(slug)) return { error: `invalid slug "${slug}"` };
        try {
          const list = await readTodoFile(slug, octokit);
          if (!list) return { found: false, slug };
          return { found: true, list };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),

    create_or_update_todo_list: tool({
      description: `Create or replace a finite Todo in ${repoRef}.`,
      inputSchema: z.object({
        slug: z
          .string()
          .min(1)
          .max(64)
          .optional()
          .describe(
            "Filename slug. Omit for a new list and it will be generated from title.",
          ),
        title: z.string().trim().min(1).max(160),
        outcome: z.string().max(20_000),
        status: z.enum(["todo", "in-progress", "blocked", "done"]),
        evidence: z.array(z.string().min(1).max(20_000)).max(200).default([]),
        checklist: z.array(checklistItemSchema).max(200).default([]),
        blockers: z.array(z.string().min(1).max(20_000)).max(200).default([]),
        runIds: z.array(z.string().min(1).max(160)).max(200).default([]),
      }),
      execute: async (input) => {
        const slug = input.slug ?? (await createTodoSlug(input.title));
        if (!isValidTodoSlug(slug)) return { error: `invalid slug "${slug}"` };

        try {
          const now = new Date().toISOString();
          const existing = await readTodoFile(slug, octokit);
          const list = await writeTodoFile({
            octokit,
            slug,
            todo: {
              title: input.title,
              outcome: input.outcome,
              status: input.status,
              evidence: input.evidence,
              checklist: normalizeChecklist(input.checklist),
              blockers: input.blockers,
              runIds: input.runIds,
              createdAt: existing?.createdAt ?? now,
              updatedAt: now,
            },
            sha: existing?.sha,
            message: `${existing ? "chore" : "feat"}(todos): ${
              existing ? "update" : "add"
            } ${slug}${by}`,
          });
          return {
            ok: true,
            action: existing ? "updated" : "created",
            slug: list.slug,
            title: list.title,
            outcome: list.outcome,
            checklistCount: list.checklist.length,
            htmlUrl: dashboardTodoUrl(list.slug),
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),

    delete_todo_list: tool({
      description: `Delete one todo list from ${repoRef} (removes todos/<slug>.json from the Convex).`,
      inputSchema: z.object({
        slug: z.string().min(1).max(64),
      }),
      execute: async ({ slug }) => {
        if (!isValidTodoSlug(slug)) return { error: `invalid slug "${slug}"` };
        try {
          const existing = await readTodoFile(slug, octokit);
          if (!existing) return { error: `todo list "${slug}" not found` };
          await deleteTodoFile(octokit, slug);
          return { ok: true, action: "deleted", slug };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),
  };
}
