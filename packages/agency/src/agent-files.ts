/**
 * @fileType util
 * @domain kody
 * @pattern agent-files
 * @ai-summary Versioned agent identity definitions backed by the Convex
 *   backend. Definition bundles hold the raw ticked markdown; reads derive
 *   title/body via parseTickedMarkdown. Company-store agents stay on GitHub
 *   (read-only assets) and are merged in for the *Resolved* variants. The
 *   exported API matches the old @kody-ade/agency/agent-files barrel.
 */

import type { Octokit } from "@octokit/rest";
import { getOctokit, getOwner, getRepo } from "@kody-ade/base/github/core";
import {
  definitionVersion,
  type DefinitionBundle,
} from "@kody-ade/backend/definition-bundle";
import {
  buildCompanyStoreBlobUrl,
  companyStoreAssetPath,
  companyStoreUpdatedAt,
  listCompanyStoreMarkdownAssetSlugs,
  mergeAssetsBySlug,
  readCompanyStoreText,
} from "@kody-ade/base/company-store/assets";
import {
  parseTickedMarkdown,
  type TickFile,
  type TickWriteOptions,
} from "@kody-ade/base/ticked/files";
import { joinFrontmatter } from "@kody-ade/base/ticked/frontmatter";
import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";

export type AgentFile = TickFile;
export type AgentWriteOptions = Omit<TickWriteOptions, "octokit">;
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

interface AgentDefinition {
  slug: string;
  bundle: DefinitionBundle;
  source?: "local" | "store";
  updatedAt: string;
}

function tenantId(): string {
  return `${getOwner()}/${getRepo()}`;
}

function agentFileFromDefinition(definition: AgentDefinition): TickFile {
  const raw = definition.bundle.files["agent.md"];
  if (typeof raw !== "string") {
    throw new Error(
      `Agent definition "${definition.slug}" is missing agent.md`,
    );
  }
  const { title, body, frontmatter } = parseTickedMarkdown(
    raw,
    definition.slug,
  );
  return {
    slug: definition.slug,
    title,
    body,
    sha: "",
    updatedAt: definition.updatedAt,
    htmlUrl: "",
    source: definition.source ?? "local",
    readOnly: definition.source === "store",
    ...(frontmatter.capabilities
      ? { capabilities: frontmatter.capabilities }
      : {}),
  };
}

export async function listAgentFiles(): Promise<AgentFile[]> {
  const definitions = (await createBackendClient().query(
    backendApi.definitions.listCurrent,
    {
      tenantId: tenantId(),
      kind: "agent",
    },
  )) as AgentDefinition[];
  return definitions
    .map(agentFileFromDefinition)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function readAgentFile(slug: string): Promise<AgentFile | null> {
  if (!isValidSlug(slug)) return null;
  const definition = (await createBackendClient().query(
    backendApi.definitions.getCurrent,
    {
      tenantId: tenantId(),
      kind: "agent",
      slug,
    },
  )) as AgentDefinition | null;
  return definition ? agentFileFromDefinition(definition) : null;
}

function stripLeadingH1(body: string): string {
  const lines = body.replace(/^\s+/, "").split("\n");
  let i = 0;
  for (;;) {
    while (i < lines.length && lines[i]!.trim() === "") i += 1;
    if (i < lines.length && /^#\s+.+/.test(lines[i]!)) {
      i += 1;
    } else {
      break;
    }
  }
  return lines.slice(i).join("\n");
}

function buildRawMarkdown(opts: AgentWriteOptions): string {
  const trimmedBody = stripLeadingH1(opts.body);
  const titled =
    trimmedBody.length > 0
      ? `# ${opts.title.trim()}\n\n${trimmedBody}${trimmedBody.endsWith("\n") ? "" : "\n"}`
      : `# ${opts.title.trim()}\n`;
  return joinFrontmatter(
    opts.capabilities ? { capabilities: opts.capabilities } : {},
    titled,
  );
}

export async function writeAgentFile(
  opts: AgentWriteOptions,
): Promise<AgentFile> {
  if (!isValidSlug(opts.slug)) {
    throw new Error(`Invalid agent slug "${opts.slug}"`);
  }
  const raw = buildRawMarkdown(opts);
  const bundle: DefinitionBundle = {
    schemaVersion: 1,
    files: { "agent.md": raw },
  };
  const createdAt = new Date().toISOString();
  await createBackendClient().mutation(backendApi.definitions.publish, {
    tenantId: tenantId(),
    kind: "agent",
    slug: opts.slug,
    version: definitionVersion(bundle),
    bundle,
    createdAt,
  });
  return agentFileFromDefinition({
    slug: opts.slug,
    bundle,
    source: "local",
    updatedAt: createdAt,
  });
}

export async function deleteAgentFile(slug: string): Promise<void> {
  if (!isValidSlug(slug)) return;
  await createBackendClient().mutation(backendApi.definitions.retire, {
    tenantId: tenantId(),
    kind: "agent",
    slug,
  });
}

export async function listResolvedAgentFiles(): Promise<AgentFile[]> {
  const octokit = getOctokit();
  const local = await listAgentFiles();
  const store = await listStoreAgentFiles(
    octokit,
    new Set(local.map((agent) => agent.slug)),
  );
  return mergeAssetsBySlug(local, store);
}

export async function readResolvedAgentFile(
  slug: string,
  octokitOverride?: Octokit,
): Promise<AgentFile | null> {
  const local = await readAgentFile(slug);
  if (local) return local;
  const store = await listStoreAgentFiles(
    octokitOverride ?? getOctokit(),
    new Set(),
  );
  return store.find((agent) => agent.slug === slug) ?? null;
}

export async function listStoreAgentFiles(
  octokit: Octokit,
  localSlugs: Set<string> = new Set(),
): Promise<AgentFile[]> {
  const slugs = await listCompanyStoreMarkdownAssetSlugs(
    octokit,
    "agents",
    isValidSlug,
  );
  const agents = await Promise.all(
    slugs
      .filter((slug) => !localSlugs.has(slug))
      .map((slug) => readStoreAgentFile(slug, octokit)),
  );
  return agents.filter((agent): agent is AgentFile => agent !== null);
}

export async function readStoreAgentFile(
  slug: string,
  octokit: Octokit,
): Promise<AgentFile | null> {
  if (!isValidSlug(slug)) return null;
  const path = await companyStoreAssetPath(octokit, "agents", `${slug}.md`);
  const [raw, updatedAt] = await Promise.all([
    readCompanyStoreText(octokit, path),
    companyStoreUpdatedAt(octokit, "agents", slug),
  ]);
  if (raw === null) return null;
  const { title, body } = parseTickedMarkdown(raw, slug);
  return {
    slug,
    title,
    body,
    sha: "",
    updatedAt,
    htmlUrl: buildCompanyStoreBlobUrl(path),
    source: "store",
    readOnly: true,
  };
}
