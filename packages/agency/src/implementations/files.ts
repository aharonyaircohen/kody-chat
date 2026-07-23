import type { Octokit } from "@octokit/rest";
import {
  createImplementationDefinition,
  type ImplementationDefinition,
} from "@kody-ade/agency-domain";
import {
  buildCompanyStoreHtmlUrl,
  companyStoreAssetPath,
  listCompanyStoreAssetSlugs,
  listCompanyStoreDirectorySafe,
  readCompanyStoreText,
} from "@kody-ade/base/company-store/assets";

const IMPLEMENTATION_ID = /^[a-z][a-z0-9-]{0,127}$/;

export type StoreImplementationSummary = {
  id: string;
  capabilityId: string;
  compatibleCapabilityRevision: string;
  type: ImplementationDefinition["type"];
  agentId?: string;
  htmlUrl: string;
};

export type StoreImplementationDetail = StoreImplementationSummary & {
  definition: ImplementationDefinition;
  runtime: Record<string, unknown> | null;
  promptTemplate: string | null;
  files: string[];
  assets: {
    skills: string[];
    tools: string[];
    scripts: string[];
    hooks: string[];
    commands: string[];
    subagents: string[];
    plugins: string[];
    mcpServers: string[];
    cliTools: string[];
    inputMappings: string[];
    outputMappings: string[];
    requirements: string[];
  };
};

function parseObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function summary(
  definition: ImplementationDefinition,
): StoreImplementationSummary {
  return {
    id: definition.id,
    capabilityId: definition.capabilityRef.id,
    compatibleCapabilityRevision: definition.compatibleCapabilityRevision,
    type: definition.type,
    ...(definition.type === "agent"
      ? { agentId: definition.agentRef.id }
      : {}),
    htmlUrl: buildCompanyStoreHtmlUrl("implementations", definition.id),
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0,
          ),
        ),
      ].sort()
    : [];
}

function namedList(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .map((item) => object(item).name)
            .filter(
              (name): name is string =>
                typeof name === "string" && name.trim().length > 0,
            ),
        ),
      ].sort()
    : [];
}

function runtimeAssets(
  runtime: Record<string, unknown> | null,
  files: string[],
): StoreImplementationDetail["assets"] {
  const document = runtime ?? {};
  const config = Object.keys(object(document.config)).length
    ? object(document.config)
    : document;
  const claudeCode = object(config.claudeCode);
  const scripts = object(config.scripts);
  const scriptNames = ["preflight", "postflight"].flatMap((phase) =>
    Array.isArray(scripts[phase])
      ? (scripts[phase] as unknown[]).flatMap((entry) => {
          const step = object(entry);
          return [step.script, step.shell].filter(
            (value): value is string => typeof value === "string" && !!value,
          );
        })
      : [],
  );
  const mcpServers = Array.isArray(claudeCode.mcpServers)
    ? namedList(claudeCode.mcpServers)
    : Object.keys(object(claudeCode.mcpServers)).sort();

  return {
    skills: stringList(claudeCode.skills),
    tools: [
      ...new Set([
        ...stringList(claudeCode.tools),
        ...stringList(config.capabilityTools),
        ...stringList(config.tools),
      ]),
    ].sort(),
    scripts: [
      ...new Set([
        ...scriptNames,
        ...files.filter((file) => file.startsWith("scripts/")),
      ]),
    ].sort(),
    hooks: stringList(claudeCode.hooks),
    commands: stringList(claudeCode.commands),
    subagents: stringList(claudeCode.subagents),
    plugins: stringList(claudeCode.plugins),
    mcpServers,
    cliTools: namedList(config.cliTools),
    inputMappings: Object.keys(object(document.inputBindings)).sort(),
    outputMappings: Object.keys(object(document.outputBindings)).sort(),
    requirements: Object.keys(object(document.requirements)).sort(),
  };
}

async function listImplementationFiles(
  octokit: Octokit,
  root: string,
  relative = "",
  depth = 0,
): Promise<string[]> {
  if (depth > 5) return [];
  const entries = await listCompanyStoreDirectorySafe(
    octokit,
    relative ? `${root}/${relative}` : root,
  );
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      return entry.type === "dir"
        ? listImplementationFiles(octokit, root, path, depth + 1)
        : [path];
    }),
  );
  return files.flat().sort();
}

async function readStoreTreeFiles(
  octokit: Octokit,
  root: string,
  outputPrefix = "",
): Promise<Record<string, string>> {
  const paths = await listImplementationFiles(octokit, root);
  const entries = await Promise.all(
    paths.map(async (relativePath) => {
      const content = await readCompanyStoreText(
        octokit,
        `${root}/${relativePath}`,
      );
      return content === null
        ? null
        : ([`${outputPrefix}${relativePath}`, content] as const);
    }),
  );
  return Object.fromEntries(
    entries.filter(
      (entry): entry is readonly [string, string] => entry !== null,
    ),
  );
}

export async function readStoreImplementationBundle(
  octokit: Octokit,
  id: string,
): Promise<Record<string, string> | null> {
  if (!(await readStoreImplementationSummary(octokit, id))) return null;
  const root = await companyStoreAssetPath(octokit, "implementations", id);
  return readStoreTreeFiles(octokit, root);
}

export async function readStoreSharedAssetBundle(
  octokit: Octokit,
  bucket: string,
  id: string,
): Promise<Record<string, string> | null> {
  if (!IMPLEMENTATION_ID.test(bucket) || !IMPLEMENTATION_ID.test(id))
    return null;
  const root = await companyStoreAssetPath(
    octokit,
    "shared",
    bucket,
    id,
  );
  const files = await readStoreTreeFiles(
    octokit,
    root,
    `${bucket}/${id}/`,
  );
  return Object.keys(files).length > 0 ? files : null;
}

export async function readStoreImplementationSummary(
  octokit: Octokit,
  id: string,
): Promise<StoreImplementationSummary | null> {
  if (!IMPLEMENTATION_ID.test(id)) return null;
  const root = await companyStoreAssetPath(octokit, "implementations", id);
  const definitionRaw = await readCompanyStoreText(
    octokit,
    `${root}/definition.json`,
  );
  const parsed = parseObject(definitionRaw);
  if (!parsed) return null;
  try {
    return summary(createImplementationDefinition(parsed));
  } catch {
    return null;
  }
}

export async function readStoreImplementation(
  octokit: Octokit,
  id: string,
): Promise<StoreImplementationDetail | null> {
  const base = await readStoreImplementationSummary(octokit, id);
  if (!base) return null;
  const root = await companyStoreAssetPath(octokit, "implementations", id);
  const [definitionRaw, runtimeRaw, promptRaw, files] = await Promise.all([
    readCompanyStoreText(octokit, `${root}/definition.json`),
    readCompanyStoreText(octokit, `${root}/runtime.json`),
    readCompanyStoreText(octokit, `${root}/prompt.md`),
    listImplementationFiles(octokit, root),
  ]);
  const parsed = parseObject(definitionRaw);
  if (!parsed) return null;
  try {
    const definition = createImplementationDefinition(parsed);
    const runtime = parseObject(runtimeRaw);
    return {
      ...summary(definition),
      definition,
      runtime,
      promptTemplate: promptRaw?.trim() || null,
      files,
      assets: runtimeAssets(runtime, files),
    };
  } catch {
    return null;
  }
}

export async function listStoreImplementations(
  octokit: Octokit,
): Promise<StoreImplementationSummary[]> {
  const ids = await listCompanyStoreAssetSlugs(
    octokit,
    "implementations",
    (id) => IMPLEMENTATION_ID.test(id),
  );
  const records = await Promise.all(
    ids.map((id) => readStoreImplementationSummary(octokit, id)),
  );
  return records
    .filter(
      (record): record is StoreImplementationSummary => record !== null,
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}
