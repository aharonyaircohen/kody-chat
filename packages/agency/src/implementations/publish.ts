import type { Octokit } from "@octokit/rest";
import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import {
  definitionVersion,
  type DefinitionBundle,
} from "@kody-ade/backend/definition-bundle";
import {
  readStoreImplementationBundle,
  readStoreSharedAssetBundle,
  type StoreImplementationDetail,
} from "./files";

type TechnicalDefinitionKind = "implementation" | "asset";

async function publishBundle(
  tenantId: string,
  kind: TechnicalDefinitionKind,
  slug: string,
  files: Record<string, string>,
): Promise<void> {
  const bundle: DefinitionBundle = { schemaVersion: 1, files };
  await createBackendClient().mutation(backendApi.definitions.publish, {
    tenantId,
    kind,
    slug,
    version: definitionVersion(bundle),
    bundle,
    source: "store",
    createdAt: new Date().toISOString(),
  });
}

function missingStorePackage(kind: string, id: string): Error {
  return Object.assign(
    new Error(`Store ${kind} "${id}" was not found.`),
    { status: 404 },
  );
}

export async function publishStoreImplementationPackage(
  octokit: Octokit,
  tenantId: string,
  implementation: StoreImplementationDetail,
): Promise<void> {
  const files = await readStoreImplementationBundle(
    octokit,
    implementation.id,
  );
  if (!files) {
    throw missingStorePackage("implementation package", implementation.id);
  }
  await publishBundle(
    tenantId,
    "implementation",
    implementation.id,
    files,
  );

  for (const skill of implementation.assets.skills) {
    if (
      implementation.files.some((file) =>
        file.startsWith(`skills/${skill}/`),
      )
    ) {
      continue;
    }
    const assetFiles = await readStoreSharedAssetBundle(
      octokit,
      "skills",
      skill,
    );
    if (!assetFiles) throw missingStorePackage("shared skill", skill);
    await publishBundle(
      tenantId,
      "asset",
      `skill-${skill}`,
      assetFiles,
    );
  }
}
