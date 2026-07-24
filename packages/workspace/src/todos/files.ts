/**
 * @fileType util
 * @domain todos
 * @pattern todo-files
 * @ai-summary Finite Todo documents stored in Convex.
 */
import type { Octokit } from "@octokit/rest";

import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { slugifyTitle } from "@kody-ade/base/slug";
import { getOwner, getRepo } from "../github";

const TODO_KIND_PREFIX = "todo:";
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const TEXT_LIMIT = 20_000;

export type TodoStatus = "todo" | "in-progress" | "blocked" | "done";

export interface TodoChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TodoFileContent {
  title: string;
  outcome: string;
  status: TodoStatus;
  evidence: string[];
  checklist: TodoChecklistItem[];
  blockers: string[];
  runIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TodoFile extends TodoFileContent {
  slug: string;
  path: string;
  sha: string;
  htmlUrl: string;
}

export function isValidTodoSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

function todoPath(slug: string) {
  return `todos/${slug}.json`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string"
    ? value.trim().slice(0, TEXT_LIMIT)
    : fallback;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => text(entry))
    .filter(Boolean)
    .slice(0, 200);
}

function checklist(value: unknown): TodoChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): TodoChecklistItem | null => {
      const item = record(entry);
      if (!item) return null;
      const itemText = text(item.text);
      if (!itemText) return null;
      return {
        id: text(item.id) || `item-${crypto.randomUUID()}`,
        text: itemText,
        done: item.done === true,
      };
    })
    .filter((entry): entry is TodoChecklistItem => entry !== null)
    .slice(0, 200);
}

function status(value: unknown, items: TodoChecklistItem[]): TodoStatus {
  if (
    value === "todo" ||
    value === "in-progress" ||
    value === "blocked" ||
    value === "done"
  ) {
    return value;
  }
  return items.length > 0 && items.every((item) => item.done) ? "done" : "todo";
}

export function parseTodoFileContent(
  raw: string,
  slug: string,
  storedUpdatedAt: string,
): TodoFileContent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const value = record(parsed) ?? {};
  const createdAt = text(value.createdAt, storedUpdatedAt);
  const updatedAt = text(value.updatedAt, storedUpdatedAt);
  const items = checklist(value.checklist);
  return {
    title: text(value.title, slug),
    outcome: text(value.outcome),
    status: status(value.status, items),
    evidence: strings(value.evidence),
    checklist: items,
    blockers: strings(value.blockers),
    runIds: strings(value.runIds),
    createdAt,
    updatedAt,
  };
}

export function serializeTodoFileContent(content: TodoFileContent): string {
  return `${JSON.stringify(
    {
      title: text(content.title),
      outcome: text(content.outcome),
      status: status(content.status, content.checklist),
      evidence: strings(content.evidence),
      checklist: checklist(content.checklist),
      blockers: strings(content.blockers),
      runIds: strings(content.runIds),
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
    },
    null,
    2,
  )}\n`;
}

function tenantId() {
  return `${getOwner()}/${getRepo()}`;
}

function file(slug: string, content: TodoFileContent): TodoFile {
  return {
    ...content,
    slug,
    path: todoPath(slug),
    sha: "",
    htmlUrl: "",
  };
}

export async function listTodoFiles(): Promise<TodoFile[]> {
  const rows = (await createBackendClient().query(api.repoDocs.listByPrefix, {
    tenantId: tenantId(),
    prefix: TODO_KIND_PREFIX,
  })) as Array<{ kind: string; doc: unknown; updatedAt: string }>;
  return rows
    .map((row) => {
      const slug = row.kind.slice(TODO_KIND_PREFIX.length);
      return file(
        slug,
        parseTodoFileContent(JSON.stringify(row.doc), slug, row.updatedAt),
      );
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function readTodoFile(
  slug: string,
  _octokit?: Octokit,
  _branch?: string | null,
): Promise<TodoFile | null> {
  if (!isValidTodoSlug(slug)) return null;
  const row = (await createBackendClient().query(api.repoDocs.get, {
    tenantId: tenantId(),
    kind: `${TODO_KIND_PREFIX}${slug}`,
  })) as { doc: unknown; updatedAt: string } | null;
  return row
    ? file(
        slug,
        parseTodoFileContent(JSON.stringify(row.doc), slug, row.updatedAt),
      )
    : null;
}

export async function createTodoSlug(title: string): Promise<string> {
  const base = slugifyTitle(title, {
    maxLength: 48,
    fallback: "todo",
    stripDiacritics: true,
  });
  for (let index = 0; index < 20; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index}`;
    if (!(await readTodoFile(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 64);
}

export async function writeTodoFile(opts: {
  octokit: Octokit;
  slug: string;
  todo: TodoFileContent;
  sha?: string;
  message?: string;
}): Promise<TodoFile> {
  if (!isValidTodoSlug(opts.slug)) {
    throw new Error(`Invalid Todo slug: "${opts.slug}".`);
  }
  const now = new Date().toISOString();
  const todo = { ...opts.todo, updatedAt: now };
  await createBackendClient().mutation(api.repoDocs.save, {
    tenantId: tenantId(),
    kind: `${TODO_KIND_PREFIX}${opts.slug}`,
    doc: JSON.parse(serializeTodoFileContent(todo)),
    updatedAt: now,
  });
  return file(opts.slug, todo);
}

export async function deleteTodoFile(
  _octokit: Octokit,
  slug: string,
): Promise<void> {
  if (!isValidTodoSlug(slug)) {
    throw new Error(`Invalid Todo slug: "${slug}".`);
  }
  await createBackendClient().mutation(api.repoDocs.remove, {
    tenantId: tenantId(),
    kind: `${TODO_KIND_PREFIX}${slug}`,
  });
}
