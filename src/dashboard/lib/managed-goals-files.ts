/**
 * @fileType utility
 * @domain kody
 * @pattern managed-goals-files
 * @ai-summary Read and write managed goal state files on kody-state.
 */

import type { Octokit } from "@octokit/rest";
import { getOctokit, getOwner, getRepo } from "./github-client";
import { STATE_BRANCH } from "./state-branch";
import {
  listCompanyStoreDirectorySafe,
  readCompanyStoreText,
} from "./company-store/assets";
import {
  isManagedGoalState,
  managedGoalPath,
  type ManagedGoalRecord,
  type ManagedGoalState,
} from "./managed-goals";

const GOAL_TEMPLATE_ROOT = ".kody/goals/templates";

interface ContentFile {
  type?: string;
  name?: string;
  path?: string;
  encoding?: string;
  content?: string;
  sha?: string;
}

export async function ensureStateBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<void> {
  try {
    await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${STATE_BRANCH}`,
    });
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err;
    const { data: repoMeta } = await octokit.rest.repos.get({ owner, repo });
    const defaultBranch = repoMeta.default_branch || "main";
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`,
    });
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${STATE_BRANCH}`,
      sha: refData.object.sha,
    });
  }
}

export async function readManagedGoalFile(
  goalId: string,
  octokit: Octokit = getOctokit(),
  owner = getOwner(),
  repo = getRepo(),
): Promise<{ state: ManagedGoalState; sha: string; path: string } | null> {
  const path = managedGoalPath(goalId);
  try {
    const res = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref: STATE_BRANCH,
      headers: { "If-None-Match": "" },
    });
    const data = res.data as ContentFile | ContentFile[];
    if (Array.isArray(data) || data.type !== "file" || !data.content) {
      return null;
    }
    const raw = Buffer.from(
      data.content,
      (data.encoding ?? "base64") as BufferEncoding,
    ).toString("utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isManagedGoalState(parsed)) return null;
    return { state: parsed, sha: data.sha ?? "", path };
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

async function listManagedGoalDirs(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<ContentFile[]> {
  try {
    const res = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: ".kody/goals/instances",
      ref: STATE_BRANCH,
      headers: { "If-None-Match": "" },
    });
    const data = res.data as ContentFile | ContentFile[];
    return Array.isArray(data)
      ? data.filter((item) => item.type === "dir")
      : [];
  } catch (err) {
    if ((err as { status?: number }).status === 404) return [];
    throw err;
  }
}

export async function listManagedGoalFiles(
  octokit: Octokit = getOctokit(),
  owner = getOwner(),
  repo = getRepo(),
): Promise<ManagedGoalRecord[]> {
  const dirs = await listManagedGoalDirs(octokit, owner, repo);
  const goals: ManagedGoalRecord[] = [];

  for (const dir of dirs) {
    if (!dir.name) continue;
    const file = await readManagedGoalFile(dir.name, octokit, owner, repo);
    if (!file) continue;
    goals.push({
      id: dir.name,
      path: file.path,
      state: file.state,
      source: "local",
      recordType: "instance",
    });
  }

  return goals.sort((a, b) => a.id.localeCompare(b.id));
}

export async function listCompanyStoreGoalTemplateFiles(
  octokit: Octokit = getOctokit(),
): Promise<ManagedGoalRecord[]> {
  const dirs = await listCompanyStoreDirectorySafe(octokit, GOAL_TEMPLATE_ROOT);
  const goals: ManagedGoalRecord[] = [];

  for (const dir of dirs) {
    if (dir.type !== "dir" || !dir.name) continue;
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(dir.name)) continue;

    const path = `${GOAL_TEMPLATE_ROOT}/${dir.name}/state.json`;
    const raw = await readCompanyStoreText(octokit, path);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isManagedGoalState(parsed)) continue;
      goals.push({
        id: dir.name,
        path,
        state: parsed,
        source: "store",
        recordType: "template",
      });
    } catch {
      continue;
    }
  }

  return goals.sort((a, b) => a.id.localeCompare(b.id));
}

export async function writeManagedGoalFile({
  octokit,
  owner = getOwner(),
  repo = getRepo(),
  id,
  state,
  sha,
  message,
}: {
  octokit: Octokit;
  owner?: string;
  repo?: string;
  id: string;
  state: ManagedGoalState;
  sha?: string;
  message?: string;
}): Promise<void> {
  await ensureStateBranch(octokit, owner, repo);
  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: managedGoalPath(id),
    message: message ?? `chore(goals): update managed goal ${id}`,
    content: Buffer.from(JSON.stringify(state, null, 2), "utf8").toString(
      "base64",
    ),
    branch: STATE_BRANCH,
    ...(sha ? { sha } : {}),
  });
}
