/**
 * @fileType util
 * @domain todos
 * @pattern chat-tools
 * @ai-summary Chat tools to manage repo-scoped todo lists stored as
 * `todos/<slug>.json` in Convex. A todo document is one list; each list owns note-like
 * items with independent completed state.
 */
import { tool } from "ai";
import { z } from "zod";

interface Ctx {
  owner: string;
  repo: string;
  listTodos(): Promise<unknown>;
  readTodo(slug: string): Promise<unknown>;
  saveTodo(input: z.infer<typeof todoWriteSchema>): Promise<unknown>;
  removeTodo(slug: string): Promise<unknown>;
}

const todoItemSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(160),
  body: z.string().max(20_000).default(""),
  assignee: z.string().trim().max(120).nullable().optional(),
  completed: z.boolean().default(false),
  createdAt: z.string().optional(),
  completedAt: z.string().nullable().optional(),
});

const todoWriteSchema = z.object({
  slug: z.string().min(1).max(64).optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(20_000).optional(),
  items: z.array(todoItemSchema).max(200).default([]),
});

function isValidTodoSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug);
}

export function createTodoTools(ctx: Ctx) {
  const repoRef = `${ctx.owner}/${ctx.repo}`;

  return {
    list_todo_lists: tool({
      description: `List todo lists in ${repoRef} through the same Dashboard API used by the Todos page.`,
      inputSchema: z.object({}),
      execute: async () => {
        return ctx.listTodos();
      },
    }),

    read_todo_list: tool({
      description: `Read one todo list from ${repoRef} in full, including note-like items and each item's completed state.`,
      inputSchema: z.object({
        slug: z.string().min(1).max(64),
      }),
      execute: async ({ slug }) => {
        if (!isValidTodoSlug(slug)) return { error: `invalid slug "${slug}"` };
        return ctx.readTodo(slug);
      },
    }),

    create_or_update_todo_list: tool({
      description:
        `Create or replace a todo list in ${repoRef}. Use this to add/edit/delete/reorder items, ` +
        "or mark individual items complete/reopened. Pass the full desired items array.",
      inputSchema: todoWriteSchema,
      execute: async (input) => {
        if (input.slug && !isValidTodoSlug(input.slug)) {
          return { error: `invalid slug "${input.slug}"` };
        }
        return ctx.saveTodo(input);
      },
    }),

    delete_todo_list: tool({
      description: `Delete one todo list from ${repoRef} through the Dashboard API.`,
      inputSchema: z.object({
        slug: z.string().min(1).max(64),
      }),
      execute: async ({ slug }) => {
        if (!isValidTodoSlug(slug)) return { error: `invalid slug "${slug}"` };
        return ctx.removeTodo(slug);
      },
    }),
  };
}
