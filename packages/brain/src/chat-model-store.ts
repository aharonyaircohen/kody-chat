import "server-only";

import { getOctokit, getOwner, getRepo } from "./github";
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
  _token: string,
): Promise<BrainChatModel[]> {
  const doc = await readBackendDoc(
    getOctokit(),
    getOwner(),
    getRepo(),
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
  _token: string,
  models: BrainChatModel[],
): Promise<BrainChatModel[]> {
  const normalized = normalizeBrainChatModels(
    BrainChatModelsSchema.parse(models),
  );
  const owner = getOwner();
  const repo = getRepo();
  const path = modelsPath(login);
  const current = await readBackendDoc(getOctokit(), owner, repo, path);
  await writeBackendDoc({
    octokit: getOctokit(),
    owner,
    repo,
    path,
    sha: current?.sha,
    content: JSON.stringify(normalized, null, 2),
    message: `feat(brain): update chat models for ${login}`,
  });
  return normalized;
}
