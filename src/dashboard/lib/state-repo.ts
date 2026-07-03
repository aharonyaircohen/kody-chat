/**
 * @fileType utility
 * @domain kody
 * @pattern state-repo
 * @ai-summary Resolves and accesses the external Kody runtime-state repo for
 *   the connected consumer repo. Runtime files live under
 *   `<state.path>/<relative-file>` in `state.repo`, not through the consumer repo.
 */

import type { Octokit } from "@octokit/rest";
import {
  createGitHubStorageAdapter,
  type GitHubStorageTarget,
} from "@dashboard/lib/storage";
import { getEngineConfig, type KodyConfig } from "./engine/config";
import { STATE_BRANCH } from "./state-branch";

export interface StateRepoState {
  repo: string;
  path: string;
  branch: string;
}

export interface StateRepoTarget {
  owner: string;
  repo: string;
  basePath: string;
  branch: string;
}

export type StateRepoScope = "repo" | "root";

export interface StateRepoFile {
  path: string;
  content: string;
  sha: string;
  etag?: string;
  htmlUrl?: string;
  size?: number;
}

export interface StateRepoFileMetadata {
  path: string;
  sha: string;
  htmlUrl?: string;
  size?: number;
}

export interface StateRepoEntry {
  name: string;
  path: string;
  type: string;
  size?: number;
  htmlUrl?: string;
}

export interface StateRepoWriteFile {
  path: string;
  content: string;
}

export interface StateRepoWriteBase64File {
  path: string;
  contentBase64: string;
}

type ConfigWithStateAliases = KodyConfig & {
  state?: Partial<StateRepoState>;
  stateRepo?: unknown;
  statePath?: unknown;
  stateBranch?: unknown;
};

export function parseStateRepoSlug(
  slug: string,
  field = "stateRepo",
): { owner: string; repo: string } {
  const value = slug.trim();
  let repoPath = value;
  if (/^https?:\/\//i.test(value)) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(
        `kody.config.json: ${field} must be a GitHub repository URL`,
      );
    }
    if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
      throw new Error(
        `kody.config.json: ${field} must be a https://github.com repository URL`,
      );
    }
    repoPath = parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  }
  const parts = repoPath.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `kody.config.json: ${field} must be a https://github.com/owner/repo URL`,
    );
  }

  for (const part of parts) {
    if (!/^[A-Za-z0-9_.-]+$/.test(part)) {
      throw new Error(
        `kody.config.json: ${field} contains invalid repo part "${part}"`,
      );
    }
  }

  return { owner: parts[0], repo: parts[1] };
}

export function normalizeStatePath(raw: string, field = "statePath"): string {
  const value = raw.trim().replace(/^\/+|\/+$/g, "");
  if (!value) throw new Error(`kody.config.json: ${field} must not be empty`);

  const parts = value.split("/");
  for (const part of parts) {
    if (!part || part === "." || part === "..") {
      throw new Error(
        `kody.config.json: ${field} must be a relative path without "." or ".."`,
      );
    }
    if (!/^[A-Za-z0-9_.-]+$/.test(part)) {
      throw new Error(
        `kody.config.json: ${field} contains invalid path part "${part}"`,
      );
    }
  }

  return parts.join("/");
}

export function normalizeStateBranch(
  raw: string | undefined,
  field = "state.branch",
): string {
  const value = raw?.trim() || STATE_BRANCH;
  if (!value) throw new Error(`kody.config.json: ${field} must not be empty`);
  if (
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value.includes("..") ||
    value.includes("@{") ||
    /[\x00-\x20\x7f~^:?*\[]/.test(value)
  ) {
    throw new Error(`kody.config.json: ${field} contains an invalid branch`);
  }
  for (const part of value.split("/")) {
    if (
      !part ||
      part === "." ||
      part === ".." ||
      part.startsWith(".") ||
      part.endsWith(".lock")
    ) {
      throw new Error(`kody.config.json: ${field} contains an invalid branch`);
    }
  }
  return value;
}

export function resolveStateRepoConfig(
  config: KodyConfig,
  owner: string,
  repo: string,
): StateRepoState {
  const cfg = config as ConfigWithStateAliases;
  const nested = cfg.state && typeof cfg.state === "object" ? cfg.state : {};
  const repoRaw =
    typeof cfg.stateRepo === "string" ? cfg.stateRepo : nested.repo;
  const pathRaw =
    typeof cfg.statePath === "string" ? cfg.statePath : nested.path;
  const branchRaw =
    typeof cfg.stateBranch === "string" ? cfg.stateBranch : nested.branch;
  const stateRepo =
    typeof repoRaw === "string" && repoRaw.trim().length > 0
      ? repoRaw.trim()
      : `https://github.com/${owner}/kody-state`;
  parseStateRepoSlug(stateRepo);

  return {
    repo: stateRepo,
    path:
      typeof pathRaw === "string" && pathRaw.trim().length > 0
        ? normalizeStatePath(pathRaw)
        : normalizeStatePath(repo),
    branch:
      typeof branchRaw === "string" && branchRaw.trim().length > 0
        ? normalizeStateBranch(branchRaw)
        : normalizeStateBranch(undefined),
  };
}

export function parseStateRepo(
  config: KodyConfig,
  owner: string,
  repo: string,
): StateRepoTarget {
  const state = resolveStateRepoConfig(config, owner, repo);
  const parsed = parseStateRepoSlug(state.repo);
  return {
    owner: parsed.owner,
    repo: parsed.repo,
    basePath: state.path,
    branch: state.branch,
  };
}

export async function resolveStateRepo(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<StateRepoTarget> {
  const { config } = await getEngineConfig(octokit, owner, repo);
  return parseStateRepo(config, owner, repo);
}

export function stateRepoPath(
  target: StateRepoTarget,
  filePath: string,
): string {
  const relative = normalizeStatePath(filePath, "state file path");
  return [target.basePath, relative].filter(Boolean).join("/");
}

function stateRepoScopedPath(
  target: StateRepoTarget,
  filePath: string,
  scope: StateRepoScope = "repo",
): string {
  if (scope === "root") {
    return normalizeStatePath(filePath, "state file path");
  }
  return stateRepoPath(target, filePath);
}

function stateStorageTarget(target: StateRepoTarget): GitHubStorageTarget {
  return {
    owner: target.owner,
    repo: target.repo,
    ref: target.branch,
  };
}

export async function readStateText(
  octokit: Octokit,
  owner: string,
  repo: string,
  filePath: string,
  options: { headers?: Record<string, string>; scope?: StateRepoScope } = {},
): Promise<StateRepoFile | null> {
  const target = await resolveStateRepo(octokit, owner, repo);
  const path = stateRepoScopedPath(target, filePath, options.scope);
  const file = await createGitHubStorageAdapter(octokit).readText(
    stateStorageTarget(target),
    path,
    { headers: options.headers },
  );
  return file
    ? {
        path: file.path,
        content: file.content,
        sha: file.version,
        etag: file.etag,
        htmlUrl: file.url,
        size: file.size,
      }
    : null;
}

export async function readStateFileMetadata(
  octokit: Octokit,
  owner: string,
  repo: string,
  filePath: string,
): Promise<StateRepoFileMetadata | null> {
  const target = await resolveStateRepo(octokit, owner, repo);
  const path = stateRepoPath(target, filePath);
  const file = await createGitHubStorageAdapter(octokit).readMetadata(
    stateStorageTarget(target),
    path,
  );
  return file
    ? {
        path: file.path,
        sha: file.version,
        htmlUrl: file.url,
        size: file.size,
      }
    : null;
}

export async function listStateDirectory(
  octokit: Octokit,
  owner: string,
  repo: string,
  dirPath: string,
  options: { headers?: Record<string, string> } = {},
): Promise<{ entries: StateRepoEntry[]; etag?: string; targetPath: string }> {
  const target = await resolveStateRepo(octokit, owner, repo);
  const targetPath = stateRepoPath(target, dirPath);
  const result = await createGitHubStorageAdapter(octokit).list(
    stateStorageTarget(target),
    targetPath,
    { headers: options.headers },
  );
  return {
    targetPath,
    etag: result.etag,
    entries: result.entries.map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type,
      size: entry.size,
      htmlUrl: entry.url,
    })),
  };
}

export async function writeStateText({
  octokit,
  owner,
  repo,
  path,
  content,
  message,
  sha,
  maxAttempts,
  scope,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  sha?: string;
  maxAttempts?: number;
  scope?: StateRepoScope;
}): Promise<{ sha: string | null; path: string; htmlUrl: string | null }> {
  const target = await resolveStateRepo(octokit, owner, repo);
  const targetPath = stateRepoScopedPath(target, path, scope);
  const res = await createGitHubStorageAdapter(octokit).writeText({
    target: stateStorageTarget(target),
    path: targetPath,
    message,
    content,
    ...(sha ? { version: sha } : {}),
    ...(maxAttempts ? { maxAttempts } : {}),
  });
  return { sha: res.version, path: targetPath, htmlUrl: res.url };
}

export async function writeStateBase64({
  octokit,
  owner,
  repo,
  path,
  contentBase64,
  message,
  sha,
  maxAttempts,
  scope,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  path: string;
  contentBase64: string;
  message: string;
  sha?: string;
  maxAttempts?: number;
  scope?: StateRepoScope;
}): Promise<{ sha: string | null; path: string; htmlUrl: string | null }> {
  const target = await resolveStateRepo(octokit, owner, repo);
  const targetPath = stateRepoScopedPath(target, path, scope);
  const res = await createGitHubStorageAdapter(octokit).writeBase64({
    target: stateStorageTarget(target),
    path: targetPath,
    message,
    contentBase64,
    ...(sha ? { version: sha } : {}),
    ...(maxAttempts ? { maxAttempts } : {}),
  });
  return { sha: res.version, path: targetPath, htmlUrl: res.url };
}

export async function writeStateFiles({
  octokit,
  owner,
  repo,
  files,
  message,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  files: StateRepoWriteFile[];
  message: string;
}): Promise<{ sha: string }> {
  if (files.length === 0) {
    throw new Error("No state files to write");
  }

  const target = await resolveStateRepo(octokit, owner, repo);
  const res = await createGitHubStorageAdapter(octokit).writeTextFiles({
    target: stateStorageTarget(target),
    message,
    files: files.map((file) => ({
      path: stateRepoPath(target, file.path),
      content: file.content,
    })),
  });
  return { sha: res.version };
}

export async function writeStateBase64Files({
  octokit,
  owner,
  repo,
  files,
  message,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  files: StateRepoWriteBase64File[];
  message: string;
}): Promise<{ sha: string; branch: string; target: StateRepoTarget }> {
  if (files.length === 0) {
    throw new Error("No state files to write");
  }

  const target = await resolveStateRepo(octokit, owner, repo);
  const res = await createGitHubStorageAdapter(octokit).writeBase64Files({
    target: stateStorageTarget(target),
    message,
    files: files.map((file) => ({
      path: stateRepoPath(target, file.path),
      contentBase64: file.contentBase64,
    })),
  });
  return { sha: res.version, branch: target.branch, target };
}

export async function deleteStateFile({
  octokit,
  owner,
  repo,
  path,
  sha,
  message,
  scope,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  path: string;
  sha: string;
  message: string;
  scope?: StateRepoScope;
}): Promise<void> {
  const target = await resolveStateRepo(octokit, owner, repo);
  await createGitHubStorageAdapter(octokit).deleteFile({
    target: stateStorageTarget(target),
    path: stateRepoScopedPath(target, path, scope),
    message,
    version: sha,
  });
}

export async function deleteStateDirectory({
  octokit,
  owner,
  repo,
  path,
  message,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  path: string;
  message: string;
}): Promise<{ deleted: number }> {
  const target = await resolveStateRepo(octokit, owner, repo);
  return createGitHubStorageAdapter(octokit).deleteDirectory({
    target: stateStorageTarget(target),
    path: stateRepoPath(target, path),
    message,
  });
}
