import type { Octokit } from "@octokit/rest";
import { z } from "zod";

import {
  engineModelSpec,
  pickEngineDefaultModel,
  ChatModelsSchema,
  VAR_LLM_MODELS,
  type ChatModel,
} from "./models";
import {
  listVariables,
  readVariables,
  updateVariables,
  type VariablesDocument,
} from "./store";
import { getEngineConfig, writeEngineModel } from "../engine/config";
import { ConfigNameSchema, ConfigValueSchema } from "../config-input";

export { ConfigNameSchema, ConfigValueSchema } from "../config-input";

export const VariableUpsertSchema = z.object({
  name: ConfigNameSchema,
  value: ConfigValueSchema,
});

export const ManagedChatModelsSchema = ChatModelsSchema.superRefine(
  (models, context) => {
    for (const field of ["default", "engineDefault"] as const) {
      if (models.filter((model) => model[field] === true).length > 1) {
        context.addIssue({
          code: "custom",
          message: `Only one model may be marked as the ${field === "default" ? "chat" : "engine"} default.`,
        });
      }
    }
  },
);

export const ModelsWriteSchema = z.object({
  models: ManagedChatModelsSchema,
  actorLogin: z.string().optional(),
});

export const RESERVED_VARIABLE_NAMES = new Set([VAR_LLM_MODELS]);

export const ManagedVariableUpsertSchema = VariableUpsertSchema.refine(
  (input) => !RESERVED_VARIABLE_NAMES.has(input.name),
  { message: `${VAR_LLM_MODELS} is managed through the models API` },
);

export const VariableWriteSchema = ManagedVariableUpsertSchema.and(
  z.object({ actorLogin: z.string().optional() }),
);

export function readManagedChatModels(doc: VariablesDocument): ChatModel[] {
  const raw = doc.variables[VAR_LLM_MODELS]?.value;
  if (!raw) return [];
  try {
    return ManagedChatModelsSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function upsertVariable(input: {
  owner: string;
  repo: string;
  name: string;
  value: string;
  actorLogin?: string | null;
  now?: string;
}) {
  const parsed = VariableUpsertSchema.parse(input);
  if (RESERVED_VARIABLE_NAMES.has(parsed.name)) {
    throw new Error(`"${parsed.name}" is reserved`);
  }
  return updateVariables(input.owner, input.repo, (doc) => ({
    ...doc,
    variables: {
      ...doc.variables,
      [parsed.name]: {
        value: parsed.value,
        updatedAt: input.now ?? new Date().toISOString(),
        ...(input.actorLogin ? { updatedBy: input.actorLogin } : {}),
      },
    },
  }));
}

export async function deleteVariable(input: {
  owner: string;
  repo: string;
  name: string;
}): Promise<{ found: boolean; variables: ReturnType<typeof listVariables> }> {
  const name = ConfigNameSchema.parse(input.name);
  if (RESERVED_VARIABLE_NAMES.has(name)) {
    throw new Error(`"${name}" is reserved`);
  }
  const current = await readVariables(input.owner, input.repo, { force: true });
  if (!current.doc.variables[name]) {
    return { found: false, variables: listVariables(current.doc) };
  }
  const { doc } = await updateVariables(input.owner, input.repo, (latest) => {
    const variables = { ...latest.variables };
    delete variables[name];
    return { ...latest, variables };
  });
  return { found: true, variables: listVariables(doc) };
}

export async function saveManagedChatModels(input: {
  octokit: Octokit;
  owner: string;
  repo: string;
  models: ChatModel[];
  actorLogin?: string | null;
  now?: string;
}): Promise<{ models: ChatModel[]; engineSyncWarning?: string }> {
  const models = ManagedChatModelsSchema.parse(input.models);
  await updateVariables(input.owner, input.repo, (doc) => ({
    ...doc,
    variables: {
      ...doc.variables,
      [VAR_LLM_MODELS]: {
        value: JSON.stringify(models),
        updatedAt: input.now ?? new Date().toISOString(),
        ...(input.actorLogin ? { updatedBy: input.actorLogin } : {}),
      },
    },
  }));

  const engineModel = pickEngineDefaultModel(models);
  if (!engineModel) return { models };
  try {
    const spec = engineModelSpec(engineModel);
    const { config } = await getEngineConfig(
      input.octokit,
      input.owner,
      input.repo,
      { force: true },
    );
    if (config.agent?.model !== spec) {
      await writeEngineModel(input.octokit, input.owner, input.repo, spec);
    }
    return { models };
  } catch (error) {
    return {
      models,
      engineSyncWarning: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function setManagedDefaultModel(input: {
  octokit: Octokit;
  owner: string;
  repo: string;
  id: string;
  scope: "chat" | "engine" | "both";
  actorLogin?: string | null;
}): Promise<{ found: boolean; engineSyncWarning?: string }> {
  const { doc } = await readVariables(input.owner, input.repo, { force: true });
  const models = readManagedChatModels(doc);
  if (!models.some((model) => model.id === input.id)) return { found: false };
  const next = models.map((model) => ({
    ...model,
    ...(input.scope === "chat" || input.scope === "both"
      ? { default: model.id === input.id }
      : {}),
    ...(input.scope === "engine" || input.scope === "both"
      ? { engineDefault: model.id === input.id }
      : {}),
  }));
  const result = await saveManagedChatModels({ ...input, models: next });
  return {
    found: true,
    ...(result.engineSyncWarning
      ? { engineSyncWarning: result.engineSyncWarning }
      : {}),
  };
}

export async function setManagedModelEnabled(input: {
  octokit: Octokit;
  owner: string;
  repo: string;
  id: string;
  enabled: boolean;
  actorLogin?: string | null;
}): Promise<{ found: boolean; engineSyncWarning?: string }> {
  const { doc } = await readVariables(input.owner, input.repo, { force: true });
  const models = readManagedChatModels(doc);
  if (!models.some((model) => model.id === input.id)) return { found: false };
  const result = await saveManagedChatModels({
    ...input,
    models: models.map((model) =>
      model.id === input.id ? { ...model, enabled: input.enabled } : model,
    ),
  });
  return {
    found: true,
    ...(result.engineSyncWarning
      ? { engineSyncWarning: result.engineSyncWarning }
      : {}),
  };
}
