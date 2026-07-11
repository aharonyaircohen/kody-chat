import { API_BASE, buildHeaders, handleResponse } from "./client";

// ============ Todos API ============
export interface TodoEntry {
  /** Filename without `.json` stable identity. */
  slug: string;
  /** State-repo path, usually `todos/<slug>.json` during migration. */
  path?: string;
  title: string;
  /** Markdown description for the list itself. */
  description: string;
  items: TodoItem[];
  createdAt: string;
  /** Git blob sha. */
  sha: string;
  /** Last commit timestamp affecting file (ISO8601). */
  updatedAt: string;
  /** Convenience link to file on github.com. */
  htmlUrl: string;
  /** List-level metadata from frontmatter. */
  frontmatter?: Record<string, unknown>;
}

export interface TodoItem {
  id: string;
  title: string;
  /** Markdown note body for this list item. */
  body: string;
  /** GitHub login responsible for the item, when assigned. */
  assignee: string | null;
  completed: boolean;
  createdAt: string;
  completedAt: string | null;
  meta?: Record<string, unknown>;
}

export const todosApi = {
  list: async (): Promise<TodoEntry[]> => {
    const res = await fetch(`${API_BASE}/todos`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    const data = await handleResponse<{ todos: TodoEntry[] }>(res);
    return data.todos ?? [];
  },
  get: async (slug: string): Promise<TodoEntry> => {
    const res = await fetch(`${API_BASE}/todos/${encodeURIComponent(slug)}`, {
      headers: buildHeaders(),
    });
    const data = await handleResponse<{ todo: TodoEntry }>(res);
    return data.todo;
  },
  create: async (data: {
    title: string;
    description?: string;
    items?: Array<{
      id?: string;
      title: string;
      body?: string;
      assignee?: string | null;
      completed?: boolean;
      createdAt?: string;
      completedAt?: string | null;
      meta?: Record<string, unknown>;
    }>;
    actorLogin?: string;
  }): Promise<TodoEntry> => {
    const res = await fetch(`${API_BASE}/todos`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(data),
    });
    const payload = await handleResponse<{ todo: TodoEntry }>(res);
    return payload.todo;
  },
  update: async (
    slug: string,
    data: {
      title?: string;
      description?: string;
      items?: TodoItem[];
      actorLogin?: string;
    },
  ): Promise<TodoEntry> => {
    const res = await fetch(`${API_BASE}/todos/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: buildHeaders(),
      body: JSON.stringify(data),
    });
    const payload = await handleResponse<{ todo: TodoEntry }>(res);
    return payload.todo;
  },
  remove: async (slug: string, actorLogin?: string): Promise<void> => {
    const params = new URLSearchParams();
    if (actorLogin) params.set("actorLogin", actorLogin);
    const suffix = params.toString() ? `?${params}` : "";
    const res = await fetch(
      `${API_BASE}/todos/${encodeURIComponent(slug)}${suffix}`,
      {
        method: "DELETE",
        headers: buildHeaders(),
      },
    );
    await handleResponse<{ success: boolean }>(res);
  },
};
