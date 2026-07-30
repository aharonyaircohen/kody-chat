import "server-only";

import type { CmsStorageTransport } from "@kody-ade/base/storage";

export type CmsFilesDoc = { files: Record<string, string> };
export type CmsWriteFile = { path: string; content: string };

export interface CmsRepoDocsRecord {
  doc: CmsFilesDoc;
  updatedAt: string;
}

export interface CmsRepoDocsStore {
  load(owner: string, repo: string): Promise<CmsRepoDocsRecord | null>;
  save(
    owner: string,
    repo: string,
    doc: CmsFilesDoc,
    expectedUpdatedAt?: string,
  ): Promise<string>;
}

const STORE_KEY = Symbol.for("kody.cms.repoDocsStore");
type StoreGlobal = { [STORE_KEY]?: CmsRepoDocsStore };

export function setCmsRepoDocsStore(store: CmsRepoDocsStore): void {
  (globalThis as StoreGlobal)[STORE_KEY] = store;
}

function cmsRepoDocsStore(): CmsRepoDocsStore {
  const store = (globalThis as StoreGlobal)[STORE_KEY];
  if (!store) {
    throw new Error(
      "CMS repository storage is not registered by the application host.",
    );
  }
  return store;
}

async function load(
  owner: string,
  repo: string,
): Promise<CmsRepoDocsRecord | null> {
  return await cmsRepoDocsStore().load(owner, repo);
}

export async function readCmsFile(
  owner: string,
  repo: string,
  path: string,
): Promise<{ content: string; updatedAt: string; sha: string } | null> {
  const record = await load(owner, repo);
  if (!record) return null;
  const content = record?.doc.files[path];
  return typeof content === "string"
    ? { content, updatedAt: record.updatedAt, sha: record.updatedAt }
    : null;
}

export async function writeCmsFiles(
  owner: string,
  repo: string,
  files: Array<{ path: string; content: string }>,
  expectedUpdatedAt?: string,
): Promise<string> {
  const current = await load(owner, repo);
  const next = { ...(current?.doc.files ?? {}) };
  for (const file of files) next[file.path] = file.content;
  return await cmsRepoDocsStore().save(
    owner,
    repo,
    { files: next },
    expectedUpdatedAt,
  );
}

export async function deleteCmsFile(
  owner: string,
  repo: string,
  path: string,
  expectedUpdatedAt?: string,
): Promise<string> {
  const current = await load(owner, repo);
  if (!current?.doc.files[path])
    return current?.updatedAt ?? new Date().toISOString();
  const next = { ...current.doc.files };
  delete next[path];
  return await cmsRepoDocsStore().save(
    owner,
    repo,
    { files: next },
    expectedUpdatedAt,
  );
}

export function createCmsRepoDocsTransport(
  owner: string,
  repo: string,
): CmsStorageTransport {
  return {
    async listFiles(dirPath) {
      const record = await load(owner, repo);
      const prefix = dirPath ? `${dirPath.replace(/\/+$/, "")}/` : "";
      return Object.keys(record?.doc.files ?? {}).filter((path) =>
        path.startsWith(prefix),
      );
    },
    async readFile(path) {
      const file = await readCmsFile(owner, repo, path);
      if (!file) {
        throw Object.assign(new Error("not a file"), { status: 404 });
      }
      return file.content;
    },
    async writeFile(path, content) {
      const current = await load(owner, repo);
      await writeCmsFiles(owner, repo, [{ path, content }], current?.updatedAt);
    },
    async deleteFile(path) {
      const current = await load(owner, repo);
      if (!current?.doc.files[path]) {
        throw Object.assign(new Error("not a file"), { status: 404 });
      }
      await deleteCmsFile(owner, repo, path, current.updatedAt);
    },
  };
}

export async function readRepoDocFile(
  _octokit: unknown,
  owner: string,
  repo: string,
  path: string,
) {
  return await readCmsFile(owner, repo, path);
}
export async function writeRepoDocFiles(args: {
  octokit?: unknown;
  owner: string;
  repo: string;
  files: CmsWriteFile[];
  message?: string;
}) {
  return await writeCmsFiles(args.owner, args.repo, args.files);
}
export async function writeRepoDocFile(args: {
  octokit?: unknown;
  owner: string;
  repo: string;
  path: string;
  content: string;
  message?: string;
}) {
  return await writeCmsFiles(args.owner, args.repo, [
    { path: args.path, content: args.content },
  ]);
}
export async function deleteRepoDocFile(args: {
  octokit?: unknown;
  owner: string;
  repo: string;
  path: string;
  sha?: string;
  message?: string;
}) {
  return await deleteCmsFile(args.owner, args.repo, args.path, args.sha);
}
