import { API_BASE, buildHeaders, handleResponse } from "./client";

// ============ Memory API ============

export type MemoryType = "user" | "feedback" | "project" | "reference";

export interface MemoryFile {
  /** Filename without `.md` — stable identity. */
  id: string;
  meta: {
    name: string;
    description: string;
    type: MemoryType;
    created: string;
  };
  /** Markdown body after frontmatter. */
  body: string;
  /** Git blob sha. */
  sha: string;
  /** Last commit timestamp affecting this file (ISO8601). */
  updatedAt: string;
  /** Convenience link to the file on github.com. */
  htmlUrl: string;
}

export const memoryApi = {
  list: async (): Promise<MemoryFile[]> => {
    const res = await fetch(`${API_BASE}/memory`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    const data = await handleResponse<{ memories: MemoryFile[] }>(res);
    return data.memories ?? [];
  },

  get: async (id: string): Promise<MemoryFile> => {
    const res = await fetch(`${API_BASE}/memory/${encodeURIComponent(id)}`, {
      headers: buildHeaders(),
    });
    const data = await handleResponse<{ memory: MemoryFile }>(res);
    return data.memory;
  },

  create: async (data: {
    id: string;
    name: string;
    description: string;
    type: MemoryType;
    body: string;
    actorLogin?: string;
  }): Promise<MemoryFile> => {
    const res = await fetch(`${API_BASE}/memory`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(data),
    });
    const payload = await handleResponse<{ memory: MemoryFile }>(res);
    return payload.memory;
  },

  update: async (
    id: string,
    data: {
      name?: string;
      description?: string;
      type?: MemoryType;
      body?: string;
      actorLogin?: string;
    },
  ): Promise<MemoryFile> => {
    const res = await fetch(`${API_BASE}/memory/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: buildHeaders(),
      body: JSON.stringify(data),
    });
    const payload = await handleResponse<{ memory: MemoryFile }>(res);
    return payload.memory;
  },

  remove: async (id: string, actorLogin?: string): Promise<void> => {
    const params = new URLSearchParams();
    if (actorLogin) params.set("actorLogin", actorLogin);
    const suffix = params.toString() ? `?${params}` : "";
    const res = await fetch(
      `${API_BASE}/memory/${encodeURIComponent(id)}${suffix}`,
      {
        method: "DELETE",
        headers: buildHeaders(),
      },
    );
    await handleResponse<{ success: boolean }>(res);
  },
};
