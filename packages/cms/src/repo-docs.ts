import "server-only";

import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";

const KIND = "cms:files";

type CmsFilesDoc = { files: Record<string, string> };
export type StateRepoWriteFile = { path: string; content: string };

function tenantId(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

async function load(owner: string, repo: string): Promise<{ doc: CmsFilesDoc; updatedAt: string } | null> {
  const record = await createBackendClient().query(api.repoDocs.get, { tenantId: tenantId(owner, repo), kind: KIND });
  if (!record || !record.doc || typeof record.doc !== "object") return null;
  const files = (record.doc as { files?: unknown }).files;
  return { doc: { files: files && typeof files === "object" ? files as Record<string, string> : {} }, updatedAt: record.updatedAt };
}

export async function readCmsFile(owner: string, repo: string, path: string): Promise<{ content: string; updatedAt: string; sha: string } | null> {
  const record = await load(owner, repo);
  if (!record) return null;
  const content = record?.doc.files[path];
  return typeof content === "string" ? { content, updatedAt: record.updatedAt, sha: record.updatedAt } : null;
}

export async function writeCmsFiles(owner: string, repo: string, files: Array<{ path: string; content: string }>, expectedUpdatedAt?: string): Promise<string> {
  const current = await load(owner, repo);
  const next = { ...(current?.doc.files ?? {}) };
  for (const file of files) next[file.path] = file.content;
  const updatedAt = new Date().toISOString();
  await createBackendClient().mutation(api.repoDocs.save, { tenantId: tenantId(owner, repo), kind: KIND, doc: { files: next }, updatedAt, ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) });
  return updatedAt;
}

export async function deleteCmsFile(owner: string, repo: string, path: string, expectedUpdatedAt?: string): Promise<string> {
  const current = await load(owner, repo);
  if (!current?.doc.files[path]) return current?.updatedAt ?? new Date().toISOString();
  const next = { ...current.doc.files };
  delete next[path];
  const updatedAt = new Date().toISOString();
  await createBackendClient().mutation(api.repoDocs.save, { tenantId: tenantId(owner, repo), kind: KIND, doc: { files: next }, updatedAt, ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) });
  return updatedAt;
}

// Compatibility-shaped adapters keep route contracts stable while storage is Convex-owned.
export async function readStateText(_octokit: unknown, owner: string, repo: string, path: string) {
  return await readCmsFile(owner, repo, path);
}
export async function writeStateFiles(args: { octokit?: unknown; owner: string; repo: string; files: StateRepoWriteFile[]; message?: string }) {
  return await writeCmsFiles(args.owner, args.repo, args.files);
}
export async function writeStateText(args: { octokit?: unknown; owner: string; repo: string; path: string; content: string; message?: string }) {
  return await writeCmsFiles(args.owner, args.repo, [{ path: args.path, content: args.content }]);
}
export async function deleteStateFile(args: { octokit?: unknown; owner: string; repo: string; path: string; sha?: string; message?: string }) {
  return await deleteCmsFile(args.owner, args.repo, args.path, args.sha);
}
