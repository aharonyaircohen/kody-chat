import "server-only";

import {
  readBackendDoc,
  writeBackendDoc,
} from "@kody-ade/base/backend/repo-docs";
import {
  BrainChatModelsSchema,
  normalizeBrainChatModels,
  type BrainChatModel,
} from "./chat-models";

function modelsPath(login: string): string {
  return `users/${login.toLowerCase()}/data/brain-chat-models.json`;
}

export async function readBrainChatModels(
  login: string,
  owner: string,
  repo: string,
): Promise<BrainChatModel[]> {
  const doc = await readBackendDoc(
    undefined,
    owner,
    repo,
    modelsPath(login),
  );
  if (!doc) return [];
  try {
    const parsed = BrainChatModelsSchema.safeParse(JSON.parse(doc.content));
    return parsed.success ? normalizeBrainChatModels(parsed.data) : [];
  } catch {
    return [];
  }
}

export async function writeBrainChatModels(
  login: string,
  owner: string,
  repo: string,
  models: BrainChatModel[],
): Promise<BrainChatModel[]> {
  const normalized = normalizeBrainChatModels(
    BrainChatModelsSchema.parse(models),
  );
  const path = modelsPath(login);
  const current = await readBackendDoc(undefined, owner, repo, path);
  await writeBackendDoc({
    owner,
    repo,
    path,
    sha: current?.sha,
    content: JSON.stringify(normalized, null, 2),
    message: `feat(brain): update chat models for ${login}`,
  });
  return normalized;
}
