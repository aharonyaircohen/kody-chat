/**
 * @fileType util
 * @domain kody
 * @pattern agent-files
 * @ai-summary Agent identity store backed by the Convex backend
 *   (agents.{list,save,remove}, tenant-scoped by owner/repo). Docs hold the
 *   raw ticked markdown in `body` plus the parsed frontmatter; reads derive
 *   title/body via parseTickedMarkdown. Company-store agents stay on GitHub
 *   (read-only assets) and are merged in for the *Resolved* variants. The
 *   exported API matches the old @kody-ade/agency/agent-files barrel.
 */

import type { Octokit } from "@octokit/rest";
import { getOctokit } from "@kody-ade/base/github/core";
import { getOwner, getRepo } from "./github-client";
import { mergeAssetsBySlug } from "@kody-ade/base/company-store/assets";
import {
  parseTickedMarkdown,
  type TickFile,
  type TickWriteOptions,
} from "@kody-ade/base/ticked/files";
import { joinFrontmatter } from "@kody-ade/base/ticked/frontmatter";
import { listStoreAgentFiles } from "@kody-ade/agency/agent-files";
import {
  backendApi,
  getConvexClient,
  tenantIdFor,
} from "./backend/convex-backend";

export type AgentFile = TickFile;
export { listStoreAgentFiles };

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

interface AgentDoc {
  slug: string;
  body: string;
  updatedAt: string;
}

function tenantId(): string {
  return tenantIdFor(getOwner(), getRepo());
}

function agentFileFromDoc(doc: AgentDoc): TickFile {
  const { title, body, frontmatter } = parseTickedMarkdown(doc.body, doc.slug);
  return {
    slug: doc.slug,
    title,
    body,
    sha: "",
    updatedAt: doc.updatedAt,
    htmlUrl: "",
    source: "local",
    readOnly: false,
    ...(frontmatter.capabilities
      ? { capabilities: frontmatter.capabilities }
      : {}),
  };
}

export async function listAgentFiles(): Promise<AgentFile[]> {
  const docs = (await getConvexClient().query(backendApi.agents.list, {
    tenantId: tenantId(),
  })) as AgentDoc[];
  return docs
    .map(agentFileFromDoc)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function readAgentFile(slug: string): Promise<AgentFile | null> {
  if (!isValidSlug(slug)) return null;
  const docs = (await getConvexClient().query(backendApi.agents.list, {
    tenantId: tenantId(),
  })) as AgentDoc[];
  const doc = docs.find((d) => d.slug === slug);
  return doc ? agentFileFromDoc(doc) : null;
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

function buildRawMarkdown(opts: TickWriteOptions): string {
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
  opts: TickWriteOptions,
): Promise<AgentFile> {
  if (!isValidSlug(opts.slug)) {
    throw new Error(`Invalid agent slug "${opts.slug}"`);
  }
  const raw = buildRawMarkdown(opts);
  const updatedAt = new Date().toISOString();
  await getConvexClient().mutation(backendApi.agents.save, {
    tenantId: tenantId(),
    slug: opts.slug,
    frontmatter: opts.capabilities
      ? { capabilities: opts.capabilities }
      : {},
    body: raw,
    updatedAt,
  });
  return agentFileFromDoc({ slug: opts.slug, body: raw, updatedAt });
}

export async function deleteAgentFile(slug: string): Promise<void> {
  if (!isValidSlug(slug)) return;
  await getConvexClient().mutation(backendApi.agents.remove, {
    tenantId: tenantId(),
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
