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
  const [definitionRaw, runtimeRaw, promptRaw, entries] = await Promise.all([
    readCompanyStoreText(octokit, `${root}/definition.json`),
    readCompanyStoreText(octokit, `${root}/runtime.json`),
    readCompanyStoreText(octokit, `${root}/prompt.md`),
    listCompanyStoreDirectorySafe(octokit, root),
  ]);
  const parsed = parseObject(definitionRaw);
  if (!parsed) return null;
  try {
    const definition = createImplementationDefinition(parsed);
    return {
      ...summary(definition),
      definition,
      runtime: parseObject(runtimeRaw),
      promptTemplate: promptRaw?.trim() || null,
      files: entries.map((entry) => entry.name).sort(),
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
