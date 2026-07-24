import { API_BASE, buildHeaders, handleResponse } from "./client";

export type TodoStatus = "todo" | "in-progress" | "blocked" | "done";

export interface TodoChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TodoEntry {
  slug: string;
  path: string;
  title: string;
  outcome: string;
  status: TodoStatus;
  evidence: string[];
  checklist: TodoChecklistItem[];
  blockers: string[];
  runIds: string[];
  createdAt: string;
  updatedAt: string;
  sha: string;
  htmlUrl: string;
}

export type TodoWrite = Pick<
  TodoEntry,
  | "title"
  | "outcome"
  | "status"
  | "evidence"
  | "checklist"
  | "blockers"
  | "runIds"
>;

export const todosApi = {
  async list(): Promise<TodoEntry[]> {
    const response = await fetch(`${API_BASE}/todos`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    return (await handleResponse<{ todos: TodoEntry[] }>(response)).todos ?? [];
  },
  async get(slug: string): Promise<TodoEntry> {
    const response = await fetch(
      `${API_BASE}/todos/${encodeURIComponent(slug)}`,
      { headers: buildHeaders(), cache: "no-store" },
    );
    return (await handleResponse<{ todo: TodoEntry }>(response)).todo;
  },
  async create(data: TodoWrite & { actorLogin?: string }): Promise<TodoEntry> {
    const response = await fetch(`${API_BASE}/todos`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(data),
    });
    return (await handleResponse<{ todo: TodoEntry }>(response)).todo;
  },
  async update(
    slug: string,
    data: Partial<TodoWrite> & { actorLogin?: string },
  ): Promise<TodoEntry> {
    const response = await fetch(
      `${API_BASE}/todos/${encodeURIComponent(slug)}`,
      {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify(data),
      },
    );
    return (await handleResponse<{ todo: TodoEntry }>(response)).todo;
  },
  async remove(slug: string, actorLogin?: string): Promise<void> {
    const query = actorLogin
      ? `?actorLogin=${encodeURIComponent(actorLogin)}`
      : "";
    const response = await fetch(
      `${API_BASE}/todos/${encodeURIComponent(slug)}${query}`,
      { method: "DELETE", headers: buildHeaders() },
    );
    await handleResponse<{ success: boolean }>(response);
  },
};
