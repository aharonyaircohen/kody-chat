import type {
  Memory,
  MemoryKind,
  MemoryRevision,
} from "@kody-ade/memory";
import { API_BASE, buildHeaders, handleResponse } from "./client";

export type { Memory, MemoryKind, MemoryRevision };

export interface MemoryDetail {
  readonly memory: Readonly<Memory>;
  readonly revisions: readonly Readonly<MemoryRevision>[];
}

export interface CreateMemoryInput {
  readonly scope: "user" | "repository";
  readonly kind: MemoryKind;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly reason?: string;
  readonly expiresAt?: string;
}

export interface UpdateMemoryInput {
  readonly kind?: MemoryKind;
  readonly title?: string;
  readonly summary?: string;
  readonly body?: string;
  readonly reason?: string;
}

export const memoryApi = {
  async list(): Promise<readonly Readonly<Memory>[]> {
    const response = await fetch(`${API_BASE}/memory`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    return (
      await handleResponse<{ memories: readonly Readonly<Memory>[] }>(response)
    ).memories;
  },

  async get(id: string): Promise<MemoryDetail> {
    const response = await fetch(
      `${API_BASE}/memory/${encodeURIComponent(id)}`,
      { headers: buildHeaders(), cache: "no-store" },
    );
    return await handleResponse<MemoryDetail>(response);
  },

  async create(input: CreateMemoryInput): Promise<Readonly<Memory>> {
    const response = await fetch(`${API_BASE}/memory`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(input),
    });
    return (
      await handleResponse<{ memory: Readonly<Memory> }>(response)
    ).memory;
  },

  async update(
    id: string,
    input: UpdateMemoryInput,
  ): Promise<Readonly<Memory>> {
    const response = await fetch(
      `${API_BASE}/memory/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify(input),
      },
    );
    return (
      await handleResponse<{ memory: Readonly<Memory> }>(response)
    ).memory;
  },

  async remove(id: string): Promise<void> {
    const response = await fetch(
      `${API_BASE}/memory/${encodeURIComponent(id)}`,
      { method: "DELETE", headers: buildHeaders() },
    );
    await handleResponse<{ deleted: true }>(response);
  },
};
