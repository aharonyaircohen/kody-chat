/**
 * @fileType utility
 * @domain kody
 * @pattern memory-files
 * @ai-summary Memory storage in Convex. Each `memory:<id>` repoDoc stores
 *   markdown plus metadata (name, description, type, created). The prompt
 *   index is derived from those documents so the agent can detect duplicate
 *   memories and update existing ones.
 *
 *   Memory types follow the same model as the Claude harness's auto-memory:
 *     - user      facts about the requester's role / preferences
 *     - feedback  guidance on how to approach work in this repo
 *     - project   ongoing initiatives, decisions, deadlines
 *     - reference pointers into external systems (Linear, Slack, Grafana, …)
 */

import type { Octokit } from "@octokit/rest";
import { getOwner, getRepo } from "../github";
import { slugifyTitle } from "@kody-ade/base/slug";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";

export type MemoryType = "user" | "feedback" | "project" | "reference";

export interface MemoryFrontmatter {
  /** Short title for the memory (one line, ~40 chars). */
  name: string;
  /** One-line hook surfaced in INDEX.md. ~150 chars. */
  description: string;
  /** Memory category — see module docstring. */
  type: MemoryType;
  /** ISO 8601 timestamp at which the memory was first written. */
  created: string;
}

export interface MemoryFile {
  /** Filename without `.md` — stable identity. Lowercase letters, digits, dashes, underscores. */
  id: string;
  /** Frontmatter values (validated). */
  meta: MemoryFrontmatter;
  /** Markdown body — everything after the closing `---`. */
  body: string;
  /** Git blob sha. Required for update/delete. Returned by reads only. */
  sha: string;
  /** Last commit timestamp affecting this file (ISO8601). */
  updatedAt: string;
  /** Convenience link to the file on github.com. */
  htmlUrl: string;
}

const MEMORY_DIR = "memory";
const MEMORY_KIND_PREFIX = "memory:";
const MEMORY_TYPES: readonly MemoryType[] = [
  "user",
  "feedback",
  "project",
  "reference",
];

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function isValidMemoryId(id: string): boolean {
  return ID_RE.test(id);
}

/**
 * Slugify a free-text memory name into a valid id. Strips non-alphanum,
 * collapses dashes, lowercases, caps at 64 chars. Caller should still
 * check `isValidMemoryId` (e.g. an empty input returns "").
 */
export function slugifyMemoryName(name: string): string {
  return slugifyTitle(name);
}

function isMemoryType(value: unknown): value is MemoryType {
  return (
    typeof value === "string" &&
    (MEMORY_TYPES as readonly string[]).includes(value)
  );
}

// ---------- List / Read ----------

/**
 * List every memory document in Convex. Returns `[]` for a fresh tenant.
 */
export async function listMemoryFiles(): Promise<MemoryFile[]> {
  const records = (await createBackendClient().query(
    api.repoDocs.listByPrefix,
    {
      tenantId: `${getOwner()}/${getRepo()}`,
      prefix: MEMORY_KIND_PREFIX,
    },
  )) as Array<{
    kind: string;
    doc: { meta: MemoryFrontmatter; body: string };
    updatedAt: string;
  }>;
  return records
    .map((record) => ({
      id: record.kind.slice(MEMORY_KIND_PREFIX.length),
      meta: record.doc.meta,
      body: record.doc.body,
      sha: "",
      updatedAt: record.updatedAt,
      htmlUrl: "",
    }))
    .filter((f) => isValidMemoryId(f.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Read a single memory file by id. Returns `null` if the file does not
 * exist or its frontmatter is malformed.
 */
export async function readMemoryFile(id: string): Promise<MemoryFile | null> {
  if (!isValidMemoryId(id)) return null;
  const record = (await createBackendClient().query(api.repoDocs.get, {
    tenantId: `${getOwner()}/${getRepo()}`,
    kind: `${MEMORY_KIND_PREFIX}${id}`,
  })) as {
    doc: { meta: MemoryFrontmatter; body: string };
    updatedAt: string;
  } | null;
  return record
    ? {
        id,
        meta: record.doc.meta,
        body: record.doc.body,
        sha: "",
        updatedAt: record.updatedAt,
        htmlUrl: "",
      }
    : null;
}

// ---------- Index ----------

/**
 * Build the memory index from the current Convex documents. Returns the raw
 * markdown body, or `null` when no memories exist.
 * The system-prompt builder injects this verbatim under a
 * `## Remembered context` heading.
 */
export async function readMemoryIndex(): Promise<{
  body: string;
  sha: string;
} | null> {
  const files = await listMemoryFiles();
  return files.length ? { body: buildIndexBody(files), sha: "" } : null;
}

function indexHeader(): string {
  return [
    "# Kody memory index",
    "",
    "One line per memory. The chat agent maintains this file — do not edit by hand.",
    "Each entry: `- [Title](id.md) — one-line hook (type: <type>)`.",
    "",
  ].join("\n");
}

function renderIndexLine(file: {
  id: string;
  meta: MemoryFrontmatter;
}): string {
  return `- [${file.meta.name}](${file.id}.md) — ${file.meta.description} (type: ${file.meta.type})`;
}

function buildIndexBody(files: MemoryFile[]): string {
  const sorted = [...files].sort((a, b) => {
    if (a.meta.type !== b.meta.type) {
      return (
        MEMORY_TYPES.indexOf(a.meta.type) - MEMORY_TYPES.indexOf(b.meta.type)
      );
    }
    return a.id.localeCompare(b.id);
  });
  return `${indexHeader()}${sorted.map(renderIndexLine).join("\n")}\n`;
}

// ---------- Write / Delete ----------

interface WriteOptions {
  /** Retained for the shared tool contract; Convex does not use Octokit. */
  octokit: Octokit;
  id: string;
  meta: MemoryFrontmatter;
  body: string;
  /** Legacy revision field retained for API compatibility. */
  sha?: string;
  /** Legacy audit message retained for API compatibility. */
  message?: string;
}

/**
 * Create or update a memory document. The index is derived on read.
 */
export async function writeMemoryFile(opts: WriteOptions): Promise<MemoryFile> {
  if (!isValidMemoryId(opts.id)) {
    throw new Error(
      `Invalid memory id: "${opts.id}". Use lowercase letters, digits, dashes, underscores (max 64 chars).`,
    );
  }
  if (!isMemoryType(opts.meta.type)) {
    throw new Error(
      `Invalid memory type: "${opts.meta.type}". Use one of ${MEMORY_TYPES.join(", ")}.`,
    );
  }
  await createBackendClient().mutation(api.repoDocs.save, {
    tenantId: `${getOwner()}/${getRepo()}`,
    kind: `${MEMORY_KIND_PREFIX}${opts.id}`,
    doc: { meta: opts.meta, body: opts.body },
    updatedAt: new Date().toISOString(),
  });

  const refreshed = await readMemoryFile(opts.id);
  if (!refreshed) {
    throw new Error(
      "writeMemoryFile: file was written but could not be re-read",
    );
  }
  return refreshed;
}
export async function deleteMemoryFile(
  octokit: Octokit,
  id: string,
): Promise<void> {
  void octokit;
  if (!isValidMemoryId(id)) {
    throw new Error(`Invalid memory id: "${id}".`);
  }
  const existing = await readMemoryFile(id);
  if (!existing) return;
  await createBackendClient().mutation(api.repoDocs.remove, {
    tenantId: `${getOwner()}/${getRepo()}`,
    kind: `${MEMORY_KIND_PREFIX}${id}`,
  });
}
// ---------- Cached system-prompt loader ----------

interface CachedIndex {
  body: string;
  expiresAt: number;
}

const indexCache = new Map<string, CachedIndex>();
const INDEX_CACHE_TTL_MS = 60_000;

function indexCacheKey(): string {
  return `${getOwner()}/${getRepo()}`;
}

/**
 * Load the memory index for the current request's repo, with a 60-second
 * in-process cache so chat turns don't pay a Convex query per turn.
 * Returns `null` when the index file is absent (fresh repo / never used).
 */
export async function loadMemoryIndexForPrompt(): Promise<string | null> {
  const key = indexCacheKey();
  const cached = indexCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.body || null;

  const result = await readMemoryIndex();
  const body = result?.body ?? "";
  indexCache.set(key, { body, expiresAt: Date.now() + INDEX_CACHE_TTL_MS });
  return body || null;
}

/**
 * Wipe the in-process index cache for the current repo. The memory tools
 * call this after any write so the next chat turn re-fetches.
 */
export function invalidateMemoryIndexPromptCache(): void {
  indexCache.delete(indexCacheKey());
}

export { MEMORY_DIR, MEMORY_TYPES };
