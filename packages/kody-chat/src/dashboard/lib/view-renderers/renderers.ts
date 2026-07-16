/**
 * @fileType util
 * @domain view-renderers
 * @pattern state-repo-config
 * @ai-summary User-managed renderer definitions stored under
 *   `views/renderers/<slug>.json` in the Kody state repo. Template
 *   resolution lives in template.ts; the model-facing spec contract in
 *   spec/. This file owns storage CRUD and prompt-context loading.
 */
import type { Octokit } from "@octokit/rest";
import {
  deleteStateFile,
  listStateDirectory,
  readStateText,
  writeStateText,
} from "@kody-ade/base/state-repo";
import {
  BUILTIN_VIEW_RENDERER_DEFINITIONS,
  getBuiltinViewRendererDefinition,
} from "./builtin";
import {
  VIEW_RENDERER_SLUG_RE,
  parseViewRendererDefinition,
  serializeViewRendererDefinition,
  type ViewRendererDefinition,
} from "./definition";
import { buildChatViewCatalog } from "./spec/catalog";
import { buildViewComponentRules } from "./spec/prompt";

export const VIEW_RENDERERS_DIR = "views/renderers";

export function isValidViewRendererSlug(slug: string): boolean {
  return VIEW_RENDERER_SLUG_RE.test(slug);
}
export {
  parseViewRendererDefinition,
  serializeViewRendererDefinition,
  type ViewRendererDefinition,
};
export {
  buildRenderedViewDirective,
  mergeViewRendererDefaults,
  normalizeViewRendererData,
  resolveViewRendererUi,
} from "./template";

export interface ViewRendererDefinitionFile {
  definition: ViewRendererDefinition;
  source: "repo" | "builtin";
  sha: string;
  htmlUrl: string;
}

function builtinDefinitionFile(
  definition: ViewRendererDefinition,
): ViewRendererDefinitionFile {
  return { definition, source: "builtin", sha: "", htmlUrl: "" };
}

export interface ViewRendererPromptContext {
  rules: string | null;
  definitions: ViewRendererDefinition[];
}

function filePathForSlug(slug: string): string {
  return `${VIEW_RENDERERS_DIR}/${slug}.json`;
}

export async function readViewRendererDefinitionFile({
  octokit,
  owner,
  repo,
  slug,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  slug: string;
}): Promise<ViewRendererDefinitionFile | null> {
  if (!isValidViewRendererSlug(slug)) return null;
  const file = await readStateText(octokit, owner, repo, filePathForSlug(slug));
  if (!file) {
    // No repo override — fall back to the packaged built-in, if any.
    const builtin = getBuiltinViewRendererDefinition(slug);
    return builtin ? builtinDefinitionFile(builtin) : null;
  }
  return {
    definition: parseViewRendererDefinition(file.content),
    source: "repo",
    sha: file.sha,
    htmlUrl: file.htmlUrl ?? "",
  };
}

export async function resolveViewRendererDefinition({
  octokit,
  owner,
  repo,
  slug,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  slug: string;
}): Promise<ViewRendererDefinitionFile> {
  const file = await readViewRendererDefinitionFile({
    octokit,
    owner,
    repo,
    slug,
  });
  if (file) return file;
  throw new Error(`View renderer "${slug}" not found`);
}

export async function loadViewRendererRulesForPrompt({
  octokit,
  owner,
  repo,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
}): Promise<string | null> {
  return (await loadViewRendererContextForPrompt({ octokit, owner, repo }))
    .rules;
}

export async function loadViewRendererContextForPrompt({
  octokit,
  owner,
  repo,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
}): Promise<ViewRendererPromptContext> {
  const files = await listViewRendererDefinitionFiles({ octokit, owner, repo });
  const definitions = files
    .map((file) => file.definition)
    .sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    rules: buildViewComponentRules(buildChatViewCatalog(definitions)),
    definitions,
  };
}

export async function listViewRendererDefinitionFiles({
  octokit,
  owner,
  repo,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
}): Promise<ViewRendererDefinitionFile[]> {
  const { entries } = await listStateDirectory(
    octokit,
    owner,
    repo,
    VIEW_RENDERERS_DIR,
  );
  const files = await Promise.all(
    entries
      .filter((entry) => entry.type === "file" && entry.name.endsWith(".json"))
      .map((entry) =>
        readViewRendererDefinitionFile({
          octokit,
          owner,
          repo,
          slug: entry.name.slice(0, -".json".length),
        }).catch(() => null),
      ),
  );
  const repoFiles = files.filter(
    (file): file is ViewRendererDefinitionFile =>
      Boolean(file) && file?.source === "repo",
  );
  // Built-ins fill the gaps; a repo file with the same slug overrides its
  // built-in.
  const repoSlugs = new Set(repoFiles.map((file) => file.definition.slug));
  const builtins = BUILTIN_VIEW_RENDERER_DEFINITIONS.filter(
    (definition) => !repoSlugs.has(definition.slug),
  ).map(builtinDefinitionFile);
  return [...repoFiles, ...builtins];
}

export async function writeViewRendererDefinitionFile({
  octokit,
  owner,
  repo,
  definition,
  sha,
  message,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  definition: ViewRendererDefinition;
  sha?: string;
  message: string;
}): Promise<ViewRendererDefinitionFile> {
  const content = serializeViewRendererDefinition(definition);
  const written = await writeStateText({
    octokit,
    owner,
    repo,
    path: filePathForSlug(definition.slug),
    content,
    message,
    ...(sha ? { sha } : {}),
  });
  return {
    definition,
    source: "repo",
    sha: written.sha ?? "",
    htmlUrl: written.htmlUrl ?? "",
  };
}

export async function deleteViewRendererDefinitionFile({
  octokit,
  owner,
  repo,
  slug,
  sha,
  message,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  slug: string;
  sha: string;
  message: string;
}): Promise<void> {
  await deleteStateFile({
    octokit,
    owner,
    repo,
    path: filePathForSlug(slug),
    sha,
    message,
  });
}
