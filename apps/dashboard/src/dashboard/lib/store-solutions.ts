import type { Octokit } from "@octokit/rest";
import { z } from "zod";

import {
  buildCompanyStoreHtmlUrl,
  companyStoreAssetPath,
  readCompanyStoreText,
} from "@kody-ade/base/company-store/assets";
import { readStoreLoop } from "@dashboard/lib/store-loops";
import { readCompanyStoreWorkflowDefinitionFile } from "@dashboard/lib/workflow-definition-files";

const SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/;

const entrypointSchema = z.object({
  kind: z.enum(["loop", "workflow"]),
  id: z.string().regex(SLUG),
});

const solutionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(SLUG),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500),
    entrypoints: z.array(entrypointSchema).min(1),
  })
  .strict();

export type StoreSolutionManifest = z.infer<typeof solutionSchema>;
export type StoreSolutionStatus = "available" | "partial" | "installed";
export type StoreSolutionNodeKind =
  "loop" | "workflow" | "agent" | "capability";

export interface StoreSolutionRecord extends StoreSolutionManifest {
  htmlUrl: string;
}

export interface StoreSolutionNode {
  kind: StoreSolutionNodeKind;
  slug: string;
  title: string;
  installed: boolean;
  children: StoreSolutionNode[];
}

export interface StoreSolutionCatalog {
  agents: ReadonlySet<string>;
  capabilities: ReadonlySet<string>;
  workflows: ReadonlyMap<
    string,
    {
      id: string;
      name: string;
      agent: string;
      capabilities: readonly string[];
    }
  >;
  loops: ReadonlyMap<
    string,
    {
      id: string;
      target: { kind: "workflow" | "capability"; id: string };
    }
  >;
}

export interface StoreSolutionCatalogSlugs {
  agents: readonly string[];
  capabilities: readonly string[];
  workflows: readonly string[];
  loops: readonly string[];
}

export interface StoreSolutionInstalledSets {
  agents: ReadonlySet<string>;
  capabilities: ReadonlySet<string>;
  workflows: ReadonlySet<string>;
  loops: ReadonlySet<string>;
}

export interface ResolvedStoreSolution {
  status: StoreSolutionStatus;
  tree: StoreSolutionNode[];
}

export async function readStoreSolution(
  octokit: Octokit,
  slug: string,
): Promise<StoreSolutionRecord | null> {
  if (!SLUG.test(slug)) return null;
  const path = await companyStoreAssetPath(
    octokit,
    "solutions",
    slug,
    "solution.json",
  );
  const raw = await readCompanyStoreText(octokit, path);
  if (!raw) return null;
  try {
    const parsed = solutionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.id !== slug) return null;
    return {
      ...parsed.data,
      htmlUrl: buildCompanyStoreHtmlUrl("solutions", slug),
    };
  } catch {
    return null;
  }
}

export async function listStoreSolutions(
  octokit: Octokit,
  slugs: readonly string[],
): Promise<StoreSolutionRecord[]> {
  const solutions = await Promise.all(
    slugs.map((slug) => readStoreSolution(octokit, slug)),
  );
  const invalidAt = solutions.findIndex((solution) => solution === null);
  if (invalidAt >= 0) {
    throw new Error(`Store Solution "${slugs[invalidAt]}" is invalid.`);
  }
  return solutions
    .filter((solution): solution is StoreSolutionRecord => solution !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function loadStoreSolutionCatalog(
  octokit: Octokit,
  slugs: StoreSolutionCatalogSlugs,
): Promise<StoreSolutionCatalog> {
  const [workflowRecords, loopRecords] = await Promise.all([
    Promise.all(
      slugs.workflows.map((slug) =>
        readCompanyStoreWorkflowDefinitionFile(slug, octokit),
      ),
    ),
    Promise.all(slugs.loops.map((slug) => readStoreLoop(octokit, slug))),
  ]);
  return {
    agents: new Set(slugs.agents),
    capabilities: new Set(slugs.capabilities),
    workflows: new Map(
      workflowRecords
        .filter((record) => record !== null)
        .map((record) => [
          record.id,
          {
            id: record.id,
            name: record.workflow.name || record.id,
            agent: record.workflow.agent,
            capabilities: record.workflow.capabilities,
          },
        ]),
    ),
    loops: new Map(
      loopRecords
        .filter((record) => record !== null)
        .map((record) => [
          record.slug,
          {
            id: record.loop.id,
            target: record.loop.target,
          },
        ]),
    ),
  };
}

export function resolveStoreSolutionTree(
  solution: StoreSolutionManifest,
  catalog: StoreSolutionCatalog,
  active: StoreSolutionInstalledSets,
): ResolvedStoreSolution {
  const installState = new Map<string, boolean>();

  const node = (
    kind: StoreSolutionNodeKind,
    slug: string,
    title: string,
    installed: boolean,
    children: StoreSolutionNode[] = [],
  ): StoreSolutionNode => {
    installState.set(`${kind}:${slug}`, installed);
    return { kind, slug, title, installed, children };
  };

  const resolve = (
    kind: "loop" | "workflow" | "capability",
    slug: string,
    ancestors: ReadonlySet<string>,
  ): StoreSolutionNode => {
    const key = `${kind}:${slug}`;
    if (ancestors.has(key)) {
      throw new Error(
        `Store Solution "${solution.id}" contains a dependency cycle at ${key}.`,
      );
    }
    const nextAncestors = new Set(ancestors).add(key);

    if (kind === "loop") {
      const loop = catalog.loops.get(slug);
      if (!loop) {
        throw new Error(
          `Store Solution "${solution.id}" references missing Loop "${slug}".`,
        );
      }
      return node("loop", slug, titleFromSlug(slug), active.loops.has(slug), [
        resolve(loop.target.kind, loop.target.id, nextAncestors),
      ]);
    }

    if (kind === "workflow") {
      const workflow = catalog.workflows.get(slug);
      if (!workflow) {
        throw new Error(
          `Store Solution "${solution.id}" references missing Workflow "${slug}".`,
        );
      }
      if (!catalog.agents.has(workflow.agent)) {
        throw new Error(
          `Store Workflow "${slug}" references missing Agent "${workflow.agent}".`,
        );
      }
      const children = [
        node(
          "agent",
          workflow.agent,
          titleFromSlug(workflow.agent),
          active.agents.has(workflow.agent),
        ),
        ...workflow.capabilities.map((capability) =>
          resolve("capability", capability, nextAncestors),
        ),
      ];
      return node(
        "workflow",
        slug,
        workflow.name || titleFromSlug(slug),
        active.workflows.has(slug),
        children,
      );
    }

    if (!catalog.capabilities.has(slug)) {
      throw new Error(
        `Store Solution "${solution.id}" references missing Capability "${slug}".`,
      );
    }
    return node(
      "capability",
      slug,
      titleFromSlug(slug),
      active.capabilities.has(slug),
    );
  };

  const tree = solution.entrypoints.map((entrypoint) =>
    resolve(entrypoint.kind, entrypoint.id, new Set()),
  );
  const states = [...installState.values()];
  const status = states.every(Boolean)
    ? "installed"
    : states.some(Boolean)
      ? "partial"
      : "available";
  return { status, tree };
}

function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}
