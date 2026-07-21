import type { Octokit } from "@octokit/rest";
import {
  getHttpStatus,
  listDir,
  readFile,
  repoPathExists,
  type FileContent,
} from "./repo-files";
import {
  commitFileChanges,
  type RepositoryFileChange,
  type RepositoryMutationResult,
} from "./repo-file-mutations";
import { replacePathPrefix, type RepoPathType } from "./file-paths";

export interface RepositoryPathMutationResult extends RepositoryMutationResult {
  files: FileContent[];
}

export function buildMoveChanges(
  files: FileContent[],
  source: string,
  pathType: RepoPathType,
  target: string,
): RepositoryFileChange[] {
  return [
    ...files.map<RepositoryFileChange>((file) => ({
      type: "write",
      path:
        pathType === "dir"
          ? replacePathPrefix(file.path, source, target)
          : target,
      base64Content: file.base64Content,
    })),
    ...files.map<RepositoryFileChange>((file) => ({
      type: "delete",
      path: file.path,
    })),
  ];
}

export function buildDuplicateChanges(
  files: FileContent[],
  source: string,
  pathType: RepoPathType,
  target: string,
): RepositoryFileChange[] {
  return files.map((file) => ({
    type: "write",
    path:
      pathType === "dir"
        ? replacePathPrefix(file.path, source, target)
        : target,
    base64Content: file.base64Content,
  }));
}

export async function collectRepositoryFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  pathType: RepoPathType,
): Promise<FileContent[]> {
  if (pathType !== "dir") {
    const file = await readFile(octokit, owner, repo, path);
    return file ? [file] : [];
  }

  const entries = await listDir(octokit, owner, repo, path);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      if (entry.type === "dir") {
        return collectRepositoryFiles(octokit, owner, repo, entry.path, "dir");
      }
      if (entry.type === "file") {
        const file = await readFile(octokit, owner, repo, entry.path);
        return file ? [file] : [];
      }
      return [];
    }),
  );
  return nested.flat();
}

export async function deleteRepositoryPath(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  pathType: RepoPathType,
): Promise<FileContent[]> {
  if (pathType === "file") {
    await commitFileChanges(octokit, owner, repo, `chore: delete ${path}`, [
      { type: "delete", path },
    ]);
    return [];
  }

  let files: FileContent[];
  try {
    files = await collectRepositoryFiles(octokit, owner, repo, path, pathType);
  } catch (error) {
    if (getHttpStatus(error) === 404) return [];
    throw error;
  }
  if (files.length === 0) return files;

  await commitFileChanges(
    octokit,
    owner,
    repo,
    `chore: delete ${path}`,
    files.map((file) => ({ type: "delete", path: file.path })),
  );
  return files;
}

export async function moveRepositoryPath(
  octokit: Octokit,
  owner: string,
  repo: string,
  source: string,
  pathType: RepoPathType,
  target: string,
): Promise<RepositoryPathMutationResult> {
  const files = await collectRepositoryFiles(
    octokit,
    owner,
    repo,
    source,
    pathType,
  );
  if (files.length === 0) throw new Error(`Nothing to move at ${source}`);
  if (await repoPathExists(octokit, owner, repo, target)) {
    throw new Error(`A file or folder already exists at ${target}`);
  }

  const mutation = await commitFileChanges(
    octokit,
    owner,
    repo,
    `chore: move ${source} to ${target}`,
    buildMoveChanges(files, source, pathType, target),
  );

  return { ...mutation, files };
}

export async function duplicateRepositoryPath(
  octokit: Octokit,
  owner: string,
  repo: string,
  source: string,
  pathType: RepoPathType,
  target: string,
): Promise<RepositoryPathMutationResult> {
  const files = await collectRepositoryFiles(
    octokit,
    owner,
    repo,
    source,
    pathType,
  );
  if (files.length === 0) throw new Error(`Nothing to duplicate at ${source}`);
  if (await repoPathExists(octokit, owner, repo, target)) {
    throw new Error(`A file or folder already exists at ${target}`);
  }

  const mutation = await commitFileChanges(
    octokit,
    owner,
    repo,
    `chore: duplicate ${source}`,
    buildDuplicateChanges(files, source, pathType, target),
  );

  return { ...mutation, files };
}
