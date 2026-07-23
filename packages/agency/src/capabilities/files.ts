/**
 * @fileType util
 * @domain capabilities
 * @pattern capability-files
 * @ai-summary Read/write capabilities under `capabilities/<slug>/` in the
 *   configured Kody backend. A capability is a folder (profile.json +
 *   capability.md + optional `*.sh` + optional `skills/<name>/SKILL.md`), so
 *   writes commit the whole folder atomically using the Git Data API.
 */

import type { Octokit } from "@octokit/rest";
import { getOctokit, getOwner, getRepo } from "@kody-ade/base/github/core";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import {
  definitionVersion,
  normalizeDefinitionBundle,
  type DefinitionBundle,
} from "@kody-ade/backend/definition-bundle";
import {
  appendContract,
  composeProfile,
  fieldsFromProfile,
  isValidSlug,
  serializeProfile,
  stripContract,
  type CapabilityFields,
  type CapabilityLanding,
  type McpServerSpec,
} from "./profile";
import {
  buildCompanyStoreHtmlUrl,
  companyStoreAssetPath,
  listCompanyStoreAssetSlugs,
  listCompanyStoreDirectorySafe,
  mergeAssetsBySlug,
  readCompanyStoreText,
} from "@kody-ade/base/company-store/assets";

export { isValidSlug } from "./profile";

const CAPABILITY_BODY_FILE = "capability.md";

interface CapabilityStorage {
  bodyFile: typeof CAPABILITY_BODY_FILE;
  storeKind: "capabilities";
}

const CAPABILITY_STORAGE: CapabilityStorage = {
  bodyFile: CAPABILITY_BODY_FILE,
  storeKind: "capabilities",
};

interface CapabilityDefinition {
  slug: string;
  version: string;
  bundle: DefinitionBundle;
  source?: "local" | "store";
  updatedAt: string;
}

function tenantId(): string {
  return `${getOwner()}/${getRepo()}`;
}

export interface CapabilitySkill {
  /** Skill folder name under `skills/`. */
  name: string;
  /** `SKILL.md` contents. */
  body: string;
}

export interface CapabilityShellScript {
  /** `.sh` filename (e.g. `setup.sh`). */
  name: string;
  /** Script contents. */
  content: string;
}

export interface CapabilitySummary {
  slug: string;
  describe: string;
  landing: CapabilityLanding;
  /** Last-commit date; null in the list view to avoid one GitHub call per row. */
  updatedAt: string | null;
  htmlUrl: string;
  /** Agent member this capability runs as (profile.agent), or null. */
  agent: string | null;
  /** Recurrence cadence from profile.every, or null. */
  every?: string | null;
  /** True when profile.workflow declares an ordered capability queue. */
  isWorkflow?: boolean;
  /** Capability slugs in profile.workflow.steps, if this is a workflow. */
  workflowSteps?: string[];
  /** Full graph for Store-backed workflows, including branches and loops. */
  workflowDefinition?: CapabilityWorkflowSummary;
  /** Runtime resolution source. Local repo assets win over store assets. */
  source?: "local" | "store";
  /** Store-linked assets are visible and runnable, but not editable locally. */
  readOnly?: boolean;
  /** Declared boundary from profile.capabilityKind — observe/verify run freely. */
  capabilityKind?: "observe" | "act" | "verify" | null;
}

export interface CapabilityWorkflowSummary {
  startAt?: string;
  steps: Array<{
    id: string;
    capability: string;
    inputs?: Record<string, { from: string }>;
    next?: Array<{
      to: string;
      when?: Record<string, unknown>;
      default?: boolean;
      maxIterations?: number;
    }>;
  }>;
}

export interface CapabilityDetail extends CapabilitySummary {
  /** Canonical public contract. Present for the separated model only. */
  contract?: {
    action: string;
    purpose: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    effects: string[];
    permissions: string[];
    success: string;
    failure: string;
  };
  /** Human-readable Capability documentation; never an execution prompt. */
  documentation?: string;
  implementationResolution?: {
    status: "resolved" | "ambiguous" | "unavailable";
    capabilityRevision: string | null;
    selectedId?: string;
    repositoryBinding?: string;
    candidates: Array<{
      id: string;
      type: "agent" | "script";
      compatibleCapabilityRevision: string;
      agentId?: string;
      runtime: Record<string, unknown> | null;
      promptTemplate: string | null;
    }>;
  };
  /** Engine file is still prompt.md; product concept is "instructions". */
  prompt: string;
  model: string;
  permissionMode: CapabilityFields["permissionMode"];
  tools: string[];
  skills: CapabilitySkill[];
  shellScripts: CapabilityShellScript[];
  /** External MCP tool servers (`claudeCode.mcpServers`). */
  mcpServers: McpServerSpec[];
  /** The raw profile.json text, for the advanced editor. */
  profileJson: string;
}

export interface WriteCapabilityFolderFilesOptions {
  slug: string;
  files: Record<string, string>;
  isUpdate?: boolean;
}

function parseProfileJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function summaryFromContract(
  slug: string,
  contract: Record<string, unknown>,
  htmlUrl = "",
  extra: Partial<CapabilitySummary> = {},
): CapabilitySummary {
  return {
    slug,
    describe: typeof contract.purpose === "string" ? contract.purpose : slug,
    landing: "comment",
    updatedAt: null,
    htmlUrl,
    agent: null,
    every: null,
    isWorkflow: false,
    workflowSteps: [],
    capabilityKind: null,
    ...extra,
  };
}

function detailContract(
  contract: Record<string, unknown>,
): CapabilityDetail["contract"] | undefined {
  if (
    typeof contract.action !== "string" ||
    typeof contract.purpose !== "string" ||
    !contract.inputSchema ||
    typeof contract.inputSchema !== "object" ||
    Array.isArray(contract.inputSchema) ||
    !contract.outputSchema ||
    typeof contract.outputSchema !== "object" ||
    Array.isArray(contract.outputSchema)
  ) {
    return undefined;
  }
  return {
    action: contract.action,
    purpose: contract.purpose,
    inputSchema: contract.inputSchema as Record<string, unknown>,
    outputSchema: contract.outputSchema as Record<string, unknown>,
    effects: Array.isArray(contract.effects)
      ? contract.effects.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    permissions: Array.isArray(contract.permissions)
      ? contract.permissions.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    success: typeof contract.success === "string" ? contract.success : "",
    failure: typeof contract.failure === "string" ? contract.failure : "",
  };
}

function workflowStepsFromProfile(profile: Record<string, unknown>): string[] {
  const workflow = profile.workflow;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    return [];
  }
  const steps = (workflow as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return [];

  const out: string[] = [];
  for (const step of steps) {
    if (typeof step === "string" && step.trim()) {
      out.push(step.trim());
      continue;
    }
    if (!step || typeof step !== "object" || Array.isArray(step)) continue;
    const record = step as Record<string, unknown>;
    const slug =
      typeof record.capability === "string"
        ? record.capability.trim()
        : typeof record.implementation === "string"
          ? record.implementation.trim()
          : "";
    if (slug) out.push(slug);
  }
  return out;
}

function workflowDefinitionFromProfile(
  profile: Record<string, unknown>,
): CapabilityWorkflowSummary | undefined {
  const rawWorkflow = profile.workflow;
  if (
    !rawWorkflow ||
    typeof rawWorkflow !== "object" ||
    Array.isArray(rawWorkflow)
  )
    return undefined;
  const rawSteps = (rawWorkflow as { steps?: unknown }).steps;
  if (!Array.isArray(rawSteps)) return undefined;
  const seen = new Map<string, number>();
  const steps: CapabilityWorkflowSummary["steps"] = [];
  for (const raw of rawSteps) {
    const record =
      typeof raw === "object" && raw !== null && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;
    const capability =
      typeof raw === "string"
        ? raw.trim()
        : typeof record?.capability === "string"
          ? record.capability.trim()
          : "";
    if (!capability) continue;
    const base =
      typeof record?.id === "string" && record.id.trim()
        ? record.id.trim()
        : capability;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const id = count === 1 ? base : `${base}-${count}`;
    const inputs =
      record?.inputs &&
      typeof record.inputs === "object" &&
      !Array.isArray(record.inputs)
        ? Object.fromEntries(
            Object.entries(record.inputs).flatMap(([name, value]) => {
              if (
                !value ||
                typeof value !== "object" ||
                Array.isArray(value) ||
                typeof (value as { from?: unknown }).from !== "string"
              )
                return [];
              return [[name, { from: (value as { from: string }).from }]];
            }),
          )
        : undefined;
    const rawNext = Array.isArray(record?.next)
      ? record.next
      : record?.next === undefined
        ? []
        : [record.next];
    const next = rawNext.flatMap((value) => {
      const transition =
        typeof value === "string"
          ? { to: value.trim() }
          : value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : null;
      if (
        !transition ||
        typeof transition.to !== "string" ||
        !transition.to.trim()
      )
        return [];
      return [
        {
          to: transition.to.trim(),
          ...(transition.when &&
          typeof transition.when === "object" &&
          !Array.isArray(transition.when)
            ? { when: transition.when as Record<string, unknown> }
            : {}),
          ...(transition.default === true ? { default: true } : {}),
          ...(typeof transition.maxIterations === "number"
            ? { maxIterations: transition.maxIterations }
            : {}),
        },
      ];
    });
    steps.push({
      id,
      capability,
      ...(inputs && Object.keys(inputs).length > 0 ? { inputs } : {}),
      ...(next.length > 0 ? { next } : {}),
    });
  }
  if (steps.length === 0) return undefined;
  const rawStartAt = (rawWorkflow as { startAt?: unknown }).startAt;
  const startAt =
    typeof rawStartAt === "string" &&
    steps.some((step) => step.id === rawStartAt)
      ? rawStartAt
      : steps[0]!.id;
  return { startAt, steps };
}

function summaryFromProfile(
  slug: string,
  profile: Record<string, unknown>,
  htmlUrl: string,
  extra: Partial<Pick<CapabilitySummary, "source" | "readOnly">> = {},
): CapabilitySummary {
  const describe = typeof profile.describe === "string" ? profile.describe : "";
  const landing: CapabilityLanding =
    profile.lifecycle === "pr-branch" ? "pr" : "comment";
  const agent =
    typeof profile.agent === "string" && profile.agent.trim()
      ? profile.agent.trim()
      : null;
  const every =
    typeof profile.every === "string" && profile.every.trim()
      ? profile.every.trim()
      : null;
  const workflowSteps = workflowStepsFromProfile(profile);
  const workflowDefinition = workflowDefinitionFromProfile(profile);
  const capabilityKind =
    profile.capabilityKind === "observe" ||
    profile.capabilityKind === "act" ||
    profile.capabilityKind === "verify"
      ? profile.capabilityKind
      : null;
  return {
    slug,
    describe,
    landing,
    updatedAt: null,
    htmlUrl,
    agent,
    every,
    isWorkflow: workflowSteps.length > 0,
    workflowSteps,
    capabilityKind,
    ...(workflowDefinition ? { workflowDefinition } : {}),
    ...extra,
  };
}

function definitionSummary(
  definition: CapabilityDefinition,
): CapabilitySummary | null {
  const contractRaw = definition.bundle.files["definition.json"];
  if (typeof contractRaw === "string") {
    const contract = parseProfileJson(contractRaw);
    return contract
      ? {
          ...summaryFromContract(definition.slug, contract, "", {
            source: definition.source ?? "local",
            readOnly: definition.source === "store",
          }),
          updatedAt: definition.updatedAt,
        }
      : null;
  }
  const profileRaw = definition.bundle.files["profile.json"];
  if (typeof profileRaw !== "string") return null;
  const profile = parseProfileJson(profileRaw);
  if (!profile) return null;
  return {
    ...summaryFromProfile(definition.slug, profile, "", {
      source: definition.source ?? "local",
      readOnly: definition.source === "store",
    }),
    updatedAt: definition.updatedAt,
  };
}

function definitionDetail(
  definition: CapabilityDefinition,
): CapabilityDetail | null {
  const contractRaw = definition.bundle.files["definition.json"];
  if (typeof contractRaw === "string") {
    const contract = parseProfileJson(contractRaw);
    const summary = definitionSummary(definition);
    if (!summary || !contract) return null;
    const documentation = definition.bundle.files[CAPABILITY_BODY_FILE] ?? "";
    return {
      ...summary,
      contract: detailContract(contract),
      documentation,
      prompt: "",
      model: "inherit",
      permissionMode: "default",
      tools: [],
      skills: [],
      shellScripts: [],
      mcpServers: [],
      profileJson: contractRaw,
    };
  }
  const profileRaw = definition.bundle.files["profile.json"];
  if (typeof profileRaw !== "string") return null;
  const profile = parseProfileJson(profileRaw);
  if (!profile) return null;
  const fields = fieldsFromProfile(definition.slug, profile);
  const skills = Object.entries(definition.bundle.files)
    .flatMap(([path, body]) => {
      const match = /^skills\/([^/]+)\/SKILL\.md$/.exec(path);
      return match ? [{ name: match[1]!, body }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const shellScripts = Object.entries(definition.bundle.files)
    .filter(([path]) => !path.includes("/") && path.endsWith(".sh"))
    .map(([name, content]) => ({ name, content }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const summary = definitionSummary(definition);
  if (!summary) return null;
  return {
    ...summary,
    prompt: stripContract(definition.bundle.files[CAPABILITY_BODY_FILE] ?? ""),
    model: fields.model,
    permissionMode: fields.permissionMode,
    tools: fields.tools,
    skills,
    shellScripts,
    mcpServers: fields.mcpServers,
    profileJson: profileRaw,
  };
}

async function publishDefinition(
  slug: string,
  bundleInput: DefinitionBundle,
): Promise<CapabilityDefinition> {
  const bundle = normalizeDefinitionBundle(bundleInput);
  const version = definitionVersion(bundle);
  const updatedAt = new Date().toISOString();
  await createBackendClient().mutation(api.definitions.publish, {
    tenantId: tenantId(),
    kind: "capability",
    slug,
    version,
    bundle,
    source: "local",
    createdAt: updatedAt,
  });
  return { slug, version, bundle, source: "local", updatedAt };
}

export async function listLocalCapabilityFiles(): Promise<CapabilitySummary[]> {
  const definitions = (await createBackendClient().query(
    api.definitions.listCurrent,
    {
      tenantId: tenantId(),
      kind: "capability",
    },
  )) as CapabilityDefinition[];
  return definitions
    .map(definitionSummary)
    .filter((summary): summary is CapabilitySummary => summary !== null)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function listCapabilityFiles(
  options: {
    activeStoreSlugs?: Set<string>;
  } = {},
): Promise<CapabilitySummary[]> {
  const octokit = getOctokit();
  const local = await listLocalCapabilityFiles();
  const store = await listStoreCapabilityFiles(
    octokit,
    new Set(local.map((e) => e.slug)),
    CAPABILITY_STORAGE,
    options.activeStoreSlugs,
  );
  return mergeAssetsBySlug(local, store);
}

export async function listStoreCapabilityFiles(
  octokit: Octokit,
  localSlugs: Set<string> = new Set(),
  storage: CapabilityStorage = CAPABILITY_STORAGE,
  activeStoreSlugs?: Set<string>,
): Promise<CapabilitySummary[]> {
  const slugs = await listCompanyStoreAssetSlugs(
    octokit,
    storage.storeKind,
    isValidSlug,
  );
  const summaries = await Promise.all(
    slugs
      .filter((slug) => !localSlugs.has(slug))
      .filter((slug) => !activeStoreSlugs || activeStoreSlugs.has(slug))
      .map((slug) => readStoreCapabilitySummary(slug, octokit, storage)),
  );
  return summaries.filter((s): s is CapabilitySummary => s !== null);
}

async function readStoreCapabilitySummary(
  slug: string,
  octokit: Octokit,
  storage: CapabilityStorage = CAPABILITY_STORAGE,
): Promise<CapabilitySummary | null> {
  const base = await companyStoreAssetPath(octokit, storage.storeKind, slug);
  const contractRaw = await readCompanyStoreText(
    octokit,
    `${base}/definition.json`,
  );
  if (contractRaw) {
    const contract = parseProfileJson(contractRaw);
    return contract
      ? summaryFromContract(
          slug,
          contract,
          buildCompanyStoreHtmlUrl(storage.storeKind, slug),
          { source: "store", readOnly: true },
        )
      : null;
  }
  const profileRaw = await readCompanyStoreText(
    octokit,
    `${base}/profile.json`,
  );
  if (!profileRaw) return null;
  const profile = parseProfileJson(profileRaw);
  if (!profile) return null;
  return summaryFromProfile(
    slug,
    profile,
    buildCompanyStoreHtmlUrl(storage.storeKind, slug),
    {
      source: "store",
      readOnly: true,
    },
  );
}

export async function readResolvedCapabilityFile(
  slug: string,
  octokitOverride?: Octokit,
): Promise<CapabilityDetail | null> {
  const local = await readCapabilityFile(slug, octokitOverride);
  if (local) return local;
  return readStoreCapabilityFile(slug, octokitOverride ?? getOctokit());
}

export async function readCapabilityFile(
  slug: string,
  _octokitOverride?: Octokit,
): Promise<CapabilityDetail | null> {
  if (!isValidSlug(slug)) return null;
  const definition = (await createBackendClient().query(
    api.definitions.getCurrent,
    {
      tenantId: tenantId(),
      kind: "capability",
      slug,
    },
  )) as CapabilityDefinition | null;
  return definition ? definitionDetail(definition) : null;
}

async function readStoreCapabilityFile(
  slug: string,
  octokit: Octokit,
  storage: CapabilityStorage = CAPABILITY_STORAGE,
): Promise<CapabilityDetail | null> {
  if (!isValidSlug(slug)) return null;
  const base = await companyStoreAssetPath(octokit, storage.storeKind, slug);
  const contractRaw = await readCompanyStoreText(
    octokit,
    `${base}/definition.json`,
  );
  if (contractRaw) {
    const contract = parseProfileJson(contractRaw);
    if (!contract) return null;
    const documentation =
      (await readCompanyStoreText(octokit, `${base}/${storage.bodyFile}`)) ??
      "";
    return {
      ...summaryFromContract(
        slug,
        contract,
        buildCompanyStoreHtmlUrl(storage.storeKind, slug),
        { source: "store", readOnly: true },
      ),
      contract: detailContract(contract),
      documentation,
      prompt: "",
      model: "inherit",
      permissionMode: "default",
      tools: [],
      skills: [],
      shellScripts: [],
      mcpServers: [],
      profileJson: contractRaw,
    };
  }
  const profileRaw = await readCompanyStoreText(
    octokit,
    `${base}/profile.json`,
  );
  if (profileRaw === null) return null;
  const profile = parseProfileJson(profileRaw);
  if (!profile) return null;
  const prompt = stripContract(
    (await readCompanyStoreText(octokit, `${base}/${storage.bodyFile}`)) ?? "",
  );
  const entries = await listCompanyStoreDirectorySafe(octokit, base);
  const shellScripts = await Promise.all(
    entries
      .filter((entry) => entry.type === "file" && entry.name.endsWith(".sh"))
      .map(async (entry): Promise<CapabilityShellScript> => ({
        name: entry.name,
        content:
          (await readCompanyStoreText(octokit, `${base}/${entry.name}`)) ?? "",
      })),
  );
  const skills = entries.some(
    (entry) => entry.type === "dir" && entry.name === "skills",
  )
    ? await readStoreSkills(octokit, `${base}/skills`)
    : [];
  const fields = fieldsFromProfile(slug, profile);
  const summary = summaryFromProfile(
    slug,
    profile,
    buildCompanyStoreHtmlUrl(storage.storeKind, slug),
    {
      source: "store",
      readOnly: true,
    },
  );
  return {
    ...summary,
    prompt,
    model: fields.model,
    permissionMode: fields.permissionMode,
    tools: fields.tools,
    skills,
    shellScripts,
    mcpServers: fields.mcpServers,
    profileJson: profileRaw,
  };
}

async function readStoreSkills(
  octokit: Octokit,
  skillsPath: string,
): Promise<CapabilitySkill[]> {
  const entries = await listCompanyStoreDirectorySafe(octokit, skillsPath);
  const skills = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.type === "dir" ||
          (entry.type === "file" && entry.name.endsWith(".md")),
      )
      .map(async (entry): Promise<CapabilitySkill> => {
        if (entry.type === "file") {
          return {
            name: entry.name.replace(/\.md$/, ""),
            body:
              (await readCompanyStoreText(
                octokit,
                `${skillsPath}/${entry.name}`,
              )) ?? "",
          };
        }

        return {
          name: entry.name,
          body:
            (await readCompanyStoreText(
              octokit,
              `${skillsPath}/${entry.name}/SKILL.md`,
            )) ?? "",
        };
      }),
  );
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function assertSafeCapabilityPath(path: string): void {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0")
  ) {
    throw new Error(`Invalid capability file path: "${path}"`);
  }
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid capability file path: "${path}"`);
  }
}

export async function readCapabilityFolderFiles(
  slug: string,
  _octokitOverride?: Octokit,
): Promise<Record<string, string> | null> {
  if (!isValidSlug(slug)) return null;
  const definition = (await createBackendClient().query(
    api.definitions.getCurrent,
    {
      tenantId: tenantId(),
      kind: "capability",
      slug,
    },
  )) as CapabilityDefinition | null;
  return definition ? { ...definition.bundle.files } : null;
}

async function readCompanyStoreFolderRecursive(
  octokit: Octokit,
  absolutePath: string,
  relativePath: string,
  files: Record<string, string>,
): Promise<void> {
  const entries = await listCompanyStoreDirectorySafe(octokit, absolutePath);
  for (const entry of entries) {
    const childAbsolute = `${absolutePath}/${entry.name}`;
    const childRelative = relativePath
      ? `${relativePath}/${entry.name}`
      : entry.name;
    if (entry.type === "dir") {
      await readCompanyStoreFolderRecursive(
        octokit,
        childAbsolute,
        childRelative,
        files,
      );
    } else if (entry.type === "file") {
      const content = await readCompanyStoreText(octokit, childAbsolute);
      if (content !== null) files[childRelative] = content;
    }
  }
}

/** Load an immutable Store capability bundle for activation into the backend. */
export async function readCompanyStoreCapabilityFolderFiles(
  slug: string,
  octokit: Octokit,
): Promise<Record<string, string> | null> {
  if (!isValidSlug(slug)) return null;
  const root = await companyStoreAssetPath(
    octokit,
    CAPABILITY_STORAGE.storeKind,
    slug,
  );
  const files: Record<string, string> = {};
  await readCompanyStoreFolderRecursive(octokit, root, "", files);
  return typeof files["definition.json"] === "string" ||
    typeof files["profile.json"] === "string"
    ? files
    : null;
}

export interface WriteCapabilityOptions {
  fields: CapabilityFields;
  skills: CapabilitySkill[];
  shellScripts: CapabilityShellScript[];
  /** Optional raw profile.json override; when set, wins over `fields`. */
  profileJsonOverride?: string;
  /** Existing slugs of skills/sh removed in the editor, to delete their files. */
  removedSkills?: string[];
  removedShellScripts?: string[];
  isUpdate?: boolean;
}

export async function writeCapabilityFile(
  opts: WriteCapabilityOptions,
): Promise<CapabilityDetail> {
  const { fields } = opts;
  if (!isValidSlug(fields.slug)) {
    throw new Error(
      `Invalid capability slug: "${fields.slug}". Use lowercase letters, digits, dashes, underscores.`,
    );
  }
  const syncedFields: CapabilityFields = {
    ...fields,
    skills: opts.skills.map((skill) => skill.name),
    shellScripts: opts.shellScripts.map((script) => script.name),
  };
  const files: Record<string, string> = {
    "profile.json":
      opts.profileJsonOverride ??
      serializeProfile(composeProfile(syncedFields)),
    [CAPABILITY_BODY_FILE]: ensureTrailingNewline(
      appendContract(fields.prompt, fields.landing),
    ),
  };
  for (const script of opts.shellScripts) {
    assertSafeCapabilityPath(script.name);
    files[script.name] = ensureTrailingNewline(script.content);
  }
  for (const skill of opts.skills) {
    const path = `skills/${skill.name}/SKILL.md`;
    assertSafeCapabilityPath(path);
    files[path] = ensureTrailingNewline(skill.body);
  }
  const definition = await publishDefinition(fields.slug, {
    schemaVersion: 1,
    files,
  });
  const detail = definitionDetail(definition);
  if (!detail) throw new Error("published capability definition is invalid");
  return detail;
}

/** Write a capability folder exactly from a path-to-content map. */
export async function writeCapabilityFolderFiles(
  opts: WriteCapabilityFolderFilesOptions,
): Promise<void> {
  if (!isValidSlug(opts.slug)) {
    throw new Error(`Invalid capability slug: "${opts.slug}".`);
  }
  for (const path of Object.keys(opts.files)) assertSafeCapabilityPath(path);
  await publishDefinition(opts.slug, {
    schemaVersion: 1,
    files: opts.files,
  });
}

export async function deleteCapabilityFile(slug: string): Promise<void> {
  if (!isValidSlug(slug))
    throw new Error(`Invalid capability slug: "${slug}".`);
  await createBackendClient().mutation(api.definitions.retire, {
    tenantId: tenantId(),
    kind: "capability",
    slug,
  });
}

function ensureTrailingNewline(text: string): string {
  const trimmed = text.replace(/\s+$/, "");
  return trimmed.length === 0 ? "" : `${trimmed}\n`;
}
