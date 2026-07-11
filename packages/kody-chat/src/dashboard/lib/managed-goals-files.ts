/**
 * @fileType utility
 * @domain kody
 * @pattern managed-goals-files
 * @ai-summary Read and write managed goal state through JSON todo-list files
 * in the configured Kody state repo.
 */

import type { Octokit } from "@octokit/rest";
import { getOctokit, getOwner, getRepo } from "./github-client";
import {
  deleteStateFile,
  listStateDirectory,
  readStateText,
  writeStateText,
} from "@kody-ade/base/state-repo";
import { createServerTtlCache } from "./server-ttl-cache";
import {
  companyStoreAssetPath,
  getCompanyStoreTarget,
  listCompanyStoreDirectorySafe,
  readCompanyStoreText,
} from "./company-store/assets";
import {
  parseTodoFileContent,
  serializeTodoFileContent,
  type TodoFileContent,
} from "./todos/files";
import {
  isManagedGoalTodo,
  managedGoalStateToTodoContent,
  todoToManagedGoalState,
} from "./managed-goals-todo";
import {
  managedGoalPath,
  mergeManagedGoalStateWithTemplate,
  normalizeManagedGoalState,
  type ManagedGoalRecord,
  type ManagedGoalState,
} from "./managed-goals";

const TODOS_ROOT = "todos";
const MANAGED_GOALS_LIST_TTL_MS = 60_000;
const COMPANY_STORE_GOAL_TEMPLATES_TTL_MS = 60_000;
const MANAGED_GOALS_READ_CONCURRENCY = 8;
const managedGoalFilesCache = createServerTtlCache<ManagedGoalRecord[]>({
  ttlMs: MANAGED_GOALS_LIST_TTL_MS,
});
const companyStoreGoalTemplatesCache = createServerTtlCache<
  ManagedGoalRecord[]
>({
  ttlMs: COMPANY_STORE_GOAL_TEMPLATES_TTL_MS,
});

interface ContentFile {
  type?: string;
  name?: string;
  path?: string;
  encoding?: string;
  content?: string;
  sha?: string;
}

type StoreTemplateSource =
  | ManagedGoalRecord[]
  | (() => Promise<ManagedGoalRecord[]>);

function managedGoalFilesCacheKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

function companyStoreGoalTemplatesCacheKey(): string {
  const store = getCompanyStoreTarget();
  return `${store.owner}/${store.repo}@${store.ref}`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index]!);
      }
    }),
  );
  return results;
}

export async function readManagedGoalFile(
  goalId: string,
  octokit: Octokit = getOctokit(),
  owner = getOwner(),
  repo = getRepo(),
): Promise<{
  state: ManagedGoalState;
  sha?: string;
  path: string;
  source: "todo";
} | null> {
  return readManagedGoalFileWithStoreTemplates(goalId, octokit, owner, repo);
}

async function readManagedGoalFileWithStoreTemplates(
  goalId: string,
  octokit: Octokit,
  owner: string,
  repo: string,
  storeTemplates?: StoreTemplateSource,
): Promise<{
  state: ManagedGoalState;
  sha?: string;
  path: string;
  source: "todo";
} | null> {
  const todoFile = await readManagedGoalTodoFile(goalId, octokit, owner, repo);
  if (!todoFile) return null;
  const todo = parseTodoFileContent(
    todoFile.content,
    goalId,
    new Date().toISOString(),
  );
  if (!isManagedGoalTodo(todo)) return null;
  const rawState = todoToManagedGoalState(goalId, todo);
  const state = rawState
    ? await resolveStoreBackedManagedGoalState(
        rawState,
        octokit,
        storeTemplates,
      )
    : null;
  if (!state) return null;
  return { state, sha: todoFile.sha, path: todoFile.path, source: "todo" };
}

async function resolveStoreBackedManagedGoalState(
  state: ManagedGoalState,
  octokit: Octokit,
  storeTemplates?: StoreTemplateSource,
): Promise<ManagedGoalState> {
  const templateId =
    typeof state.sourceTemplate === "string"
      ? state.sourceTemplate
      : typeof state.templateId === "string"
        ? state.templateId
        : typeof state.template === "string"
          ? state.template
          : "";
  if (!templateId) return state;

  const templates = Array.isArray(storeTemplates)
    ? storeTemplates
    : await (storeTemplates?.() ?? listCompanyStoreGoalTemplateFiles(octokit));
  const template = templates.find((goal) => goal.id === templateId);
  return template
    ? mergeManagedGoalStateWithTemplate(state, template.state)
    : state;
}

async function listManagedTodoFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<ContentFile[]> {
  try {
    const { entries } = await listStateDirectory(
      octokit,
      owner,
      repo,
      TODOS_ROOT,
      {
        headers: { "If-None-Match": "" },
      },
    );
    return entries.filter((item) => item.type === "file");
  } catch (error: unknown) {
    if ((error as { status?: number })?.status === 404) return [];
    throw error;
  }
}

export async function listManagedGoalFiles(
  octokit: Octokit = getOctokit(),
  owner = getOwner(),
  repo = getRepo(),
): Promise<ManagedGoalRecord[]> {
  return managedGoalFilesCache.get(
    managedGoalFilesCacheKey(owner, repo),
    async () => {
      const seen = new Set<string>();

      const todoEntries = await listManagedTodoFiles(octokit, owner, repo);
      const entries = todoEntries.filter(
        (entry): entry is ContentFile & { name: string } =>
          typeof entry.name === "string" && entry.name.endsWith(".json"),
      );
      let storeTemplatesPromise: Promise<ManagedGoalRecord[]> | null = null;
      const loadStoreTemplates = () => {
        storeTemplatesPromise ??= listCompanyStoreGoalTemplateFiles(octokit);
        return storeTemplatesPromise;
      };
      const goals = await mapWithConcurrency(
        entries,
        MANAGED_GOALS_READ_CONCURRENCY,
        async (entry): Promise<ManagedGoalRecord | null> => {
          const id = entry.name.slice(0, -5);
          if (seen.has(id)) return null;
          seen.add(id);
          const file = await readManagedGoalFileWithStoreTemplates(
            id,
            octokit,
            owner,
            repo,
            loadStoreTemplates,
          );
          if (!file) return null;
          return {
            id,
            path: file.path,
            state: file.state,
            source: "local",
            recordType: "instance",
          };
        },
      );

      return goals
        .filter((goal): goal is ManagedGoalRecord => Boolean(goal))
        .sort((a, b) => a.id.localeCompare(b.id));
    },
  );
}

export async function listCompanyStoreGoalTemplateFiles(
  octokit: Octokit = getOctokit(),
): Promise<ManagedGoalRecord[]> {
  return companyStoreGoalTemplatesCache.get(
    companyStoreGoalTemplatesCacheKey(),
    () => loadCompanyStoreGoalTemplateFiles(octokit),
  );
}

async function loadCompanyStoreGoalTemplateFiles(
  octokit: Octokit,
): Promise<ManagedGoalRecord[]> {
  const goals: ManagedGoalRecord[] = [];
  const seen = new Set<string>();
  const goalTemplateRoots = Array.from(
    new Set([
      await companyStoreAssetPath(octokit, "goals", "templates"),
      await companyStoreAssetPath(octokit, "goals"),
    ]),
  );

  for (const goalTemplateRoot of goalTemplateRoots) {
    const dirs = await listCompanyStoreDirectorySafe(octokit, goalTemplateRoot);

    for (const dir of dirs) {
      if (dir.type !== "dir" || !dir.name || seen.has(dir.name)) continue;
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(dir.name)) continue;

      const path = `${goalTemplateRoot}/${dir.name}/state.json`;
      const raw = await readCompanyStoreText(octokit, path);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw) as unknown;
        const state = normalizeManagedGoalState(parsed);
        if (!state) continue;
        goals.push({
          id: dir.name,
          path,
          state,
          source: "store",
          recordType: "template",
        });
        seen.add(dir.name);
      } catch {
        continue;
      }
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
  const currentTodo = await readManagedGoalTodoContent(
    id,
    octokit,
    owner,
    repo,
  );
  if (currentTodo && !isManagedGoalTodo(currentTodo)) {
    throw new Error(`Cannot overwrite regular todo list ${id} as managed goal`);
  }
  const existing = await readManagedGoalFile(id, octokit, owner, repo);
  const content = serializeTodoFileContent(
    managedGoalStateToTodoContent(id, state, currentTodo),
  );

  await writeStateText({
    octokit,
    owner,
    repo,
    path: managedGoalPath(id),
    message: message ?? `chore(goals): update managed goal ${id}`,
    content,
    sha:
      existing?.path === managedGoalPath(id)
        ? (sha ?? existing.sha)
        : undefined,
  });
  managedGoalFilesCache.delete(managedGoalFilesCacheKey(owner, repo));
}

async function readManagedGoalTodoFile(
  id: string,
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<{ path: string; content: string; sha?: string } | null> {
  const path = managedGoalPath(id);
  const file = await readStateText(octokit, owner, repo, path, {
    headers: { "If-None-Match": "" },
  }).catch((error: unknown) => {
    if ((error as { status?: number })?.status === 404) return null;
    throw error;
  });
  return file ? { path, content: file.content, sha: file.sha } : null;
}

async function readManagedGoalTodoContent(
  id: string,
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<TodoFileContent | null> {
  const file = await readManagedGoalTodoFile(id, octokit, owner, repo);
  return file
    ? parseTodoFileContent(file.content, id, new Date().toISOString())
    : null;
}

export async function deleteManagedGoalFile({
  octokit,
  owner = getOwner(),
  repo = getRepo(),
  id,
  sha,
  message,
}: {
  octokit: Octokit;
  owner?: string;
  repo?: string;
  id: string;
  sha?: string;
  message?: string;
}): Promise<void> {
  const existing = await readManagedGoalFile(id, octokit, owner, repo);
  if (!existing?.sha) return;
  await deleteStateFile({
    octokit,
    owner,
    repo,
    path: existing.path,
    message: message ?? `chore(goals): delete managed goal ${id}`,
    sha: sha ?? existing.sha,
  });
  managedGoalFilesCache.delete(managedGoalFilesCacheKey(owner, repo));
}
