/**
 * A Capability is one small folder:
 * instructions.md, optional contract.json, skills/, and tools/.
 *
 * Local folders are stored as one Convex document. Store folders are read
 * directly from the configured Company Store.
 */
import type { Octokit } from "@octokit/rest";

import {
  buildCompanyStoreHtmlUrl,
  companyStoreAssetPath,
  listCompanyStoreAssetSlugs,
  listCompanyStoreDirectorySafe,
  mergeAssetsBySlug,
  readCompanyStoreText,
} from "@kody-ade/base/company-store/assets";
import { getOctokit, getOwner, getRepo } from "@kody-ade/base/github/core";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";

const INSTRUCTIONS_FILE = "instructions.md";
const CONTRACT_FILE = "contract.json";
const KIND_PREFIX = "capability:";
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export interface CapabilitySkill {
  name: string;
  body: string;
}

export interface CapabilityTool {
  name: string;
  content: string;
}

export type CapabilityExecution = "agent" | "script";

export interface CapabilitySummary {
  slug: string;
  describe: string;
  updatedAt: string | null;
  htmlUrl: string;
  source: "local" | "store";
  readOnly: boolean;
}

export interface CapabilityDetail extends CapabilitySummary {
  execution: CapabilityExecution;
  instructions: string;
  contract: string | null;
  skills: CapabilitySkill[];
  capabilityTools: CapabilityTool[];
}

export interface WriteCapabilityFolderFilesOptions {
  slug: string;
  files: Record<string, string>;
  isUpdate?: boolean;
}

interface StoredCapability {
  files: Record<string, string>;
}

interface RepoDoc {
  kind: string;
  doc: unknown;
  updatedAt: string;
}

function tenantId(): string {
  return `${getOwner()}/${getRepo()}`;
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseStoredFiles(value: unknown): Record<string, string> | null {
  const doc = asRecord(value);
  const rawFiles = asRecord(doc?.files);
  if (!rawFiles) return null;
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(rawFiles)) {
    if (typeof content !== "string") return null;
    files[path] = content;
  }
  return files;
}

function description(instructions: string, slug: string): string {
  const line = instructions
    .split(/\r?\n/)
    .map((value) => value.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  return line ?? `Run ${slug.replaceAll("-", " ")}`;
}

function detailFromFiles(
  slug: string,
  files: Record<string, string>,
  options: {
    updatedAt: string | null;
    htmlUrl: string;
    source: "local" | "store";
    readOnly: boolean;
  },
): CapabilityDetail {
  assertSimpleCapabilityFolder(files);
  const instructions = files[INSTRUCTIONS_FILE]!;
  const contract = files[CONTRACT_FILE]
    ? parseCapabilityContract(files[CONTRACT_FILE])
    : null;
  return {
    slug,
    describe: description(instructions, slug),
    ...options,
    execution: contract?.execution ?? "agent",
    instructions,
    contract: files[CONTRACT_FILE] ?? null,
    skills: Object.entries(files)
      .flatMap(([path, body]) =>
        path.startsWith("skills/") && path !== "skills/.gitkeep"
          ? [{ name: path.slice("skills/".length), body }]
          : [],
      )
      .sort((left, right) => left.name.localeCompare(right.name)),
    capabilityTools: Object.entries(files)
      .flatMap(([path, content]) =>
        path.startsWith("tools/") && path !== "tools/.gitkeep"
          ? [{ name: path.slice("tools/".length), content }]
          : [],
      )
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function summary(detail: CapabilityDetail): CapabilitySummary {
  const { slug, describe, updatedAt, htmlUrl, source, readOnly } = detail;
  return { slug, describe, updatedAt, htmlUrl, source, readOnly };
}

export async function listLocalCapabilityFiles(): Promise<CapabilitySummary[]> {
  const rows = (await createBackendClient().query(api.repoDocs.listByPrefix, {
    tenantId: tenantId(),
    prefix: KIND_PREFIX,
  })) as RepoDoc[];
  return rows
    .flatMap((row) => {
      const slug = row.kind.slice(KIND_PREFIX.length);
      const files = parseStoredFiles(row.doc);
      if (!isValidSlug(slug) || !files) return [];
      try {
        return [
          summary(
            detailFromFiles(slug, files, {
              updatedAt: row.updatedAt,
              htmlUrl: "",
              source: "local",
              readOnly: false,
            }),
          ),
        ];
      } catch {
        return [];
      }
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

export async function listCapabilityFiles(
  options: { activeStoreSlugs?: Set<string> } = {},
): Promise<CapabilitySummary[]> {
  const octokit = getOctokit();
  const local = await listLocalCapabilityFiles();
  const store = await listStoreCapabilityFiles(
    octokit,
    new Set(local.map((item) => item.slug)),
    options.activeStoreSlugs,
  );
  return mergeAssetsBySlug(local, store);
}

export async function listStoreCapabilityFiles(
  octokit: Octokit,
  localSlugs: Set<string> = new Set(),
  activeStoreSlugs?: Set<string>,
): Promise<CapabilitySummary[]> {
  const slugs = await listCompanyStoreAssetSlugs(
    octokit,
    "capabilities",
    isValidSlug,
  );
  return slugs
    .filter((slug) => !localSlugs.has(slug))
    .filter((slug) => !activeStoreSlugs || activeStoreSlugs.has(slug))
    .map((slug) => ({
      slug,
      describe: `Run ${slug.replaceAll("-", " ")}`,
      updatedAt: null,
      htmlUrl: buildCompanyStoreHtmlUrl("capabilities", slug),
      source: "store" as const,
      readOnly: true,
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

export async function readCapabilityFile(
  slug: string,
  _octokit?: Octokit,
): Promise<CapabilityDetail | null> {
  if (!isValidSlug(slug)) return null;
  const row = (await createBackendClient().query(api.repoDocs.get, {
    tenantId: tenantId(),
    kind: `${KIND_PREFIX}${slug}`,
  })) as RepoDoc | null;
  const files = row ? parseStoredFiles(row.doc) : null;
  return files
    ? detailFromFiles(slug, files, {
        updatedAt: row!.updatedAt,
        htmlUrl: "",
        source: "local",
        readOnly: false,
      })
    : null;
}

export async function readResolvedCapabilityFile(
  slug: string,
  octokit?: Octokit,
): Promise<CapabilityDetail | null> {
  return (
    (await readCapabilityFile(slug)) ??
    readStoreCapabilityFile(slug, octokit ?? getOctokit())
  );
}

export async function readCapabilityFolderFiles(
  slug: string,
  _octokit?: Octokit,
): Promise<Record<string, string> | null> {
  if (!isValidSlug(slug)) return null;
  const row = (await createBackendClient().query(api.repoDocs.get, {
    tenantId: tenantId(),
    kind: `${KIND_PREFIX}${slug}`,
  })) as RepoDoc | null;
  return row ? parseStoredFiles(row.doc) : null;
}

async function readStoreFolder(
  octokit: Octokit,
  absolutePath: string,
  relativePath: string,
  files: Record<string, string>,
): Promise<void> {
  const entries = await listCompanyStoreDirectorySafe(octokit, absolutePath);
  for (const entry of entries) {
    const absolute = `${absolutePath}/${entry.name}`;
    const relative = relativePath
      ? `${relativePath}/${entry.name}`
      : entry.name;
    if (entry.type === "dir") {
      await readStoreFolder(octokit, absolute, relative, files);
    } else if (entry.type === "file") {
      const content = await readCompanyStoreText(octokit, absolute);
      if (content !== null) files[relative] = content;
    }
  }
}

export async function readCompanyStoreCapabilityFolderFiles(
  slug: string,
  octokit: Octokit,
): Promise<Record<string, string> | null> {
  if (!isValidSlug(slug)) return null;
  const root = await companyStoreAssetPath(octokit, "capabilities", slug);
  const files: Record<string, string> = {};
  await readStoreFolder(octokit, root, "", files);
  try {
    assertSimpleCapabilityFolder(files);
    return files;
  } catch {
    return null;
  }
}

async function readStoreCapabilityFile(
  slug: string,
  octokit: Octokit,
): Promise<CapabilityDetail | null> {
  const files = await readCompanyStoreCapabilityFolderFiles(slug, octokit);
  if (!files) return null;
  return detailFromFiles(slug, files, {
    updatedAt: null,
    htmlUrl: buildCompanyStoreHtmlUrl("capabilities", slug),
    source: "store",
    readOnly: true,
  });
}

function assertSafePath(path: string): void {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Invalid capability file path: "${path}"`);
  }
}

export function assertSimpleCapabilityFolder(
  files: Readonly<Record<string, string>>,
): void {
  for (const path of Object.keys(files)) {
    assertSafePath(path);
    if (
      path !== INSTRUCTIONS_FILE &&
      path !== CONTRACT_FILE &&
      !path.startsWith("skills/") &&
      !path.startsWith("tools/")
    ) {
      throw new Error(
        `Capability folder only allows instructions.md, contract.json, skills/, and tools/; found ${path}`,
      );
    }
  }
  if (typeof files[INSTRUCTIONS_FILE] !== "string") {
    throw new Error("Capability folder requires instructions.md");
  }
  const contract = files[CONTRACT_FILE];
  if (contract !== undefined) {
    const parsed = parseCapabilityContract(contract);
    if (
      parsed.execution === "script" &&
      (typeof files["tools/run.sh"] !== "string" ||
        !files["tools/run.sh"].trim())
    ) {
      throw new Error(
        'Script-backed Capability requires a non-empty "tools/run.sh" file',
      );
    }
  }
}

function parseCapabilityContract(raw: string): {
  execution?: CapabilityExecution;
  secrets?: string[];
  timeoutMs?: number;
  requiredSubagents?: string[];
  input: Record<string, unknown>;
  output: Record<string, unknown>;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("contract.json must be valid JSON");
  }
  const value = asRecord(parsed);
  if (!value || !asRecord(value.input) || !asRecord(value.output)) {
    throw new Error("contract.json must contain input and output JSON schemas");
  }
  if (
    value.execution !== undefined &&
    value.execution !== "agent" &&
    value.execution !== "script"
  ) {
    throw new Error('contract.json execution must be "agent" or "script"');
  }
  const secrets =
    value.secrets === undefined
      ? undefined
      : Array.isArray(value.secrets) &&
          value.secrets.every(
            (name) =>
              typeof name === "string" && /^[A-Z][A-Z0-9_]*$/.test(name),
          )
        ? [...new Set(value.secrets as string[])]
        : null;
  if (secrets === null) {
    throw new Error(
      "contract.json secrets must contain valid environment variable names",
    );
  }
  if (secrets && value.execution !== "script") {
    throw new Error(
      'contract.json secrets are supported only when execution is "script"',
    );
  }
  const timeoutMs =
    value.timeoutMs === undefined
      ? undefined
      : typeof value.timeoutMs === "number" &&
          Number.isInteger(value.timeoutMs) &&
          value.timeoutMs >= 1_000 &&
          value.timeoutMs <= 6 * 60 * 60 * 1_000
        ? value.timeoutMs
        : null;
  if (timeoutMs === null) {
    throw new Error(
      "contract.json timeoutMs must be an integer from 1000 to 21600000",
    );
  }
  if (timeoutMs !== undefined && value.execution !== "script") {
    throw new Error(
      'contract.json timeoutMs is supported only when execution is "script"',
    );
  }
  const requiredSubagents =
    value.requiredSubagents === undefined
      ? undefined
      : Array.isArray(value.requiredSubagents) &&
          value.requiredSubagents.length > 0 &&
          value.requiredSubagents.every(
            (name) =>
              typeof name === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(name),
          )
        ? [...new Set(value.requiredSubagents as string[])]
        : null;
  if (requiredSubagents === null) {
    throw new Error(
      "contract.json requiredSubagents must contain valid specialist names",
    );
  }
  if (requiredSubagents && value.execution !== "agent") {
    throw new Error(
      'contract.json requiredSubagents are supported only when execution is "agent"',
    );
  }
  const unsupported = Object.keys(value).filter(
    (key) =>
      key !== "execution" &&
      key !== "secrets" &&
      key !== "timeoutMs" &&
      key !== "requiredSubagents" &&
      key !== "input" &&
      key !== "output",
  );
  if (unsupported.length > 0) {
    throw new Error(
      `contract.json contains unsupported fields: ${unsupported.join(", ")}`,
    );
  }
  return {
    ...(value.execution ? { execution: value.execution } : {}),
    ...(secrets ? { secrets } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(requiredSubagents ? { requiredSubagents } : {}),
    input: value.input as Record<string, unknown>,
    output: value.output as Record<string, unknown>,
  };
}

export async function writeCapabilityFolderFiles(
  options: WriteCapabilityFolderFilesOptions,
): Promise<void> {
  if (!isValidSlug(options.slug)) {
    throw new Error(`Invalid capability slug: "${options.slug}".`);
  }
  assertSimpleCapabilityFolder(options.files);
  const now = new Date().toISOString();
  const doc: StoredCapability = { files: { ...options.files } };
  await createBackendClient().mutation(api.repoDocs.save, {
    tenantId: tenantId(),
    kind: `${KIND_PREFIX}${options.slug}`,
    doc,
    updatedAt: now,
  });
}

export async function deleteCapabilityFile(slug: string): Promise<void> {
  if (!isValidSlug(slug)) {
    throw new Error(`Invalid capability slug: "${slug}".`);
  }
  await createBackendClient().mutation(api.repoDocs.remove, {
    tenantId: tenantId(),
    kind: `${KIND_PREFIX}${slug}`,
  });
}
