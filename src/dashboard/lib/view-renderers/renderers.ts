/**
 * @fileType util
 * @domain view-renderers
 * @pattern state-repo-config
 * @ai-summary User-managed renderer definitions stored under
 *   `views/renderers/<slug>.json` in the Kody state repo.
 */
import { z } from "zod";
import type { Octokit } from "@octokit/rest";
import {
  RENDER_VIEW_DIRECTIVE,
  type RenderedViewDataValue,
  type RenderedViewDirective,
} from "@dashboard/lib/chat-ui-actions";
import {
  deleteStateFile,
  listStateDirectory,
  readStateText,
  writeStateText,
} from "@dashboard/lib/state-repo";

export const VIEW_RENDERERS_DIR = "views/renderers";
export const DEFAULT_RENDERER_SLUG = "basic-card";

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function isValidViewRendererSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

const RendererBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("title"),
    bind: z.string().trim().min(1).max(80),
  }),
  z.object({
    type: z.literal("text"),
    bind: z.string().trim().min(1).max(80),
  }),
  z.object({
    type: z.literal("markdown"),
    bind: z.string().trim().min(1).max(80),
  }),
  z.object({
    type: z.literal("buttons"),
    bind: z.string().trim().min(1).max(80),
  }),
  z.object({
    type: z.literal("input"),
    bind: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(80).optional(),
  }),
]);

const RendererActionDefaultSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(60),
  response: z.string().trim().min(1).max(500),
  variant: z.enum(["primary", "secondary", "danger"]).optional(),
});

const RendererDefaultValueSchema = z.union([
  z.string().max(2_000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(RendererActionDefaultSchema).max(10),
]);

const ViewRendererDefinitionSchema = z
  .object({
    slug: z.string().regex(SLUG_RE),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(300).optional(),
    purpose: z.string().regex(SLUG_RE).optional(),
    rule: z.string().trim().min(1).max(1_000).optional(),
    defaults: z.record(z.string(), RendererDefaultValueSchema).optional(),
    type: z.literal("layout"),
    blocks: z.array(RendererBlockSchema).min(1).max(20),
  })
  .transform((definition) => ({
    ...definition,
    purpose: definition.purpose ?? definition.slug,
  }));

export type ViewRendererDefinition = z.infer<
  typeof ViewRendererDefinitionSchema
>;

export interface ViewRendererDefinitionFile {
  definition: ViewRendererDefinition;
  source: "repo" | "builtin";
  sha: string;
  htmlUrl: string;
}

export const DEFAULT_VIEW_RENDERER: ViewRendererDefinition = {
  slug: DEFAULT_RENDERER_SLUG,
  name: "Basic card",
  description: "Title, text, and action buttons.",
  purpose: "approval",
  rule:
    "Use this purpose when Kody asks the user to approve, edit, cancel, or continue before taking the next step.",
  defaults: {
    actions: [
      {
        id: "approve",
        label: "Approve",
        response: "approve",
        variant: "primary",
      },
      {
        id: "edit",
        label: "Edit first",
        response: "edit",
        variant: "secondary",
      },
      {
        id: "cancel",
        label: "Cancel",
        response: "cancel",
        variant: "secondary",
      },
    ],
  },
  type: "layout",
  blocks: [
    { type: "title", bind: "title" },
    { type: "text", bind: "body" },
    { type: "buttons", bind: "actions" },
  ],
};

function filePathForSlug(slug: string): string {
  return `${VIEW_RENDERERS_DIR}/${slug}.json`;
}

export function parseViewRendererDefinition(
  raw: string,
): ViewRendererDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid view renderer: expected JSON");
  }
  const result = ViewRendererDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid view renderer: ${result.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }
  return result.data;
}

export function serializeViewRendererDefinition(
  definition: ViewRendererDefinition,
): string {
  const parsed = ViewRendererDefinitionSchema.parse(definition);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function buildRenderedViewDirective({
  id,
  definition,
  data,
}: {
  id: string;
  definition: ViewRendererDefinition;
  data: Record<string, RenderedViewDataValue>;
}): RenderedViewDirective {
  const mergedData = mergeViewRendererDefaults(definition, data);
  return {
    action: RENDER_VIEW_DIRECTIVE,
    view: "renderer",
    id,
    rendererSlug: definition.slug,
    rendererName: definition.name,
    resultTarget: "chat",
    blocks: definition.blocks.map((block) => ({ ...block })),
    data: mergedData,
  };
}

function cloneDefaultValue(value: RenderedViewDataValue): RenderedViewDataValue {
  if (Array.isArray(value)) {
    return value.map((action) => ({ ...action }));
  }
  return value;
}

export function mergeViewRendererDefaults(
  definition: ViewRendererDefinition,
  data: Record<string, RenderedViewDataValue>,
): Record<string, RenderedViewDataValue> {
  const defaults = definition.defaults ?? {};
  const merged = Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [
      key,
      cloneDefaultValue(value as RenderedViewDataValue),
    ]),
  ) as Record<string, RenderedViewDataValue>;
  return { ...merged, ...data };
}

function rendererBindSet(definition: ViewRendererDefinition): Set<string> {
  return new Set(definition.blocks.map((block) => block.bind));
}

export function buildViewRendererRulesPrompt(
  definitions: ViewRendererDefinition[],
): string | null {
  const lines = definitions
    .filter((definition) => definition.rule?.trim())
    .map((definition) => {
      const binds = [...rendererBindSet(definition)].join(", ");
      return `- Purpose \`${definition.purpose}\`: ${definition.rule?.trim()}\n  Data keys: ${binds}`;
    });
  return lines.length > 0 ? lines.join("\n") : null;
}

export function matchViewRendererDefinition(
  definitions: ViewRendererDefinition[],
  purpose: string,
  data: Record<string, RenderedViewDataValue>,
): ViewRendererDefinition | null {
  const dataKeys = Object.keys(data).filter((key) => data[key] !== undefined);
  if (dataKeys.length === 0) return null;
  const purposeMatches = definitions.filter(
    (definition) => definition.purpose === purpose,
  );
  if (purposeMatches.length === 0) return null;
  const matches = purposeMatches
    .map((definition, index) => {
      const binds = rendererBindSet(definition);
      const matched = dataKeys.filter((key) => binds.has(key)).length;
      const missing = [...binds].filter((bind) => !dataKeys.includes(bind)).length;
      return { definition, index, matched, missing, bindCount: binds.size };
    })
    .filter((candidate) => candidate.matched > 0)
    .sort((a, b) => {
      if (a.missing !== b.missing) return a.missing - b.missing;
      if (a.matched !== b.matched) return b.matched - a.matched;
      if (a.bindCount !== b.bindCount) return b.bindCount - a.bindCount;
      return a.index - b.index;
    });
  return matches[0]?.definition ?? null;
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
  if (!file) return null;
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
  slug = DEFAULT_RENDERER_SLUG,
}: {
  octokit?: Octokit;
  owner?: string;
  repo?: string;
  slug?: string;
}): Promise<ViewRendererDefinitionFile> {
  if (octokit && owner && repo) {
    const file = await readViewRendererDefinitionFile({
      octokit,
      owner,
      repo,
      slug,
    });
    if (file) return file;
  }
  if (slug !== DEFAULT_RENDERER_SLUG) {
    throw new Error(`View renderer "${slug}" not found`);
  }
  return {
    definition: DEFAULT_VIEW_RENDERER,
    source: "builtin",
    sha: "",
    htmlUrl: "",
  };
}

export async function resolveBestViewRendererDefinition({
  octokit,
  owner,
  repo,
  purpose,
  data,
}: {
  octokit?: Octokit;
  owner?: string;
  repo?: string;
  purpose: string;
  data: Record<string, RenderedViewDataValue>;
}): Promise<ViewRendererDefinitionFile> {
  const files =
    octokit && owner && repo
      ? await listViewRendererDefinitionFiles({ octokit, owner, repo })
      : [];
  const candidates = files.map((file) => file.definition);
  const matched = matchViewRendererDefinition(
    candidates.length > 0 ? candidates : [DEFAULT_VIEW_RENDERER],
    purpose,
    data,
  );
  if (!matched) {
    throw new Error(`No view renderer matches purpose "${purpose}"`);
  }
  const repoFile = files.find((file) => file.definition.slug === matched.slug);
  if (repoFile) return repoFile;
  return {
    definition: matched,
    source: "builtin",
    sha: "",
    htmlUrl: "",
  };
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
  const files = await listViewRendererDefinitionFiles({ octokit, owner, repo });
  const definitions = files.map((file) => file.definition);
  if (!definitions.some((definition) => definition.slug === DEFAULT_RENDERER_SLUG)) {
    definitions.unshift(DEFAULT_VIEW_RENDERER);
  }
  definitions.sort((a, b) => {
    if (a.slug === DEFAULT_RENDERER_SLUG) return -1;
    if (b.slug === DEFAULT_RENDERER_SLUG) return 1;
    return a.slug.localeCompare(b.slug);
  });
  return buildViewRendererRulesPrompt(definitions);
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
  return files.filter((file): file is ViewRendererDefinitionFile =>
    Boolean(file),
  );
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
