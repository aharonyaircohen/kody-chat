import { API_BASE, buildHeaders, handleResponse } from "./client";

// ============ Docs API ============

export interface DocManifestEntry {
  name: string;
  path: string;
  type: "file" | "folder";
  htmlUrl: string | null;
}

export interface DocsManifestPayload {
  files: DocManifestEntry[];
}

export interface DocFilePayload {
  name: string;
  path: string;
  content: string;
  htmlUrl: string | null;
}

export const docsApi = {
  list: async (): Promise<DocsManifestPayload> => {
    const res = await fetch(`${API_BASE}/docs`, {
      headers: buildHeaders(),
    });
    return handleResponse<DocsManifestPayload>(res);
  },
  get: async (path: string): Promise<DocFilePayload> => {
    const res = await fetch(
      `${API_BASE}/docs?path=${encodeURIComponent(path)}`,
      {
        headers: buildHeaders(),
      },
    );
    return handleResponse<DocFilePayload>(res);
  },
  create: async (input: {
    path: string;
    content: string;
  }): Promise<DocFilePayload> => {
    const res = await fetch(`${API_BASE}/docs`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(input),
    });
    return handleResponse<DocFilePayload>(res);
  },
  update: async (
    path: string,
    input: { content?: string; newPath?: string },
  ): Promise<DocFilePayload> => {
    const res = await fetch(
      `${API_BASE}/docs?path=${encodeURIComponent(path)}`,
      {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify(input),
      },
    );
    return handleResponse<DocFilePayload>(res);
  },
  remove: async (path: string): Promise<void> => {
    const res = await fetch(
      `${API_BASE}/docs?path=${encodeURIComponent(path)}`,
      {
        method: "DELETE",
        headers: buildHeaders(),
      },
    );
    await handleResponse<{ success: boolean; path: string }>(res);
  },
};
