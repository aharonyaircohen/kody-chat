import type { ChatModel } from "@kody-ade/base/variables/models";

/**
 * @fileType utility
 * @domain chat
 * @pattern model-catalog
 * @ai-summary Kody product model policy, kept out of the public embeddable
 *   chat package.
 */

export const KODY_OPENROUTER_FREE_CHAT_MODEL = Object.freeze({
  id: "openrouter/free",
  label: "OpenRouter Free",
  provider: "openrouter",
  protocol: "openai",
  baseURL: "https://openrouter.ai/api/v1",
  modelName: "openrouter/free",
  apiKeySecret: "OPENROUTER_API_KEY",
  enabled: true,
  default: true,
  engineDefault: false,
} as const satisfies ChatModel);

export interface CatalogModel {
  id: string;
  enabled?: boolean;
  default?: boolean;
}

export function composeChatModelCatalog<T extends CatalogModel>(
  configuredModels: readonly T[],
  builtInModel: T,
): T[] {
  const configured = [...configuredModels];
  const sameId = configured.find((model) => model.id === builtInModel.id);
  const hasExplicitDefault = configured.some(
    (model) => model.enabled !== false && model.default === true,
  );
  if (sameId) return configured;

  return [
    { ...builtInModel, default: !hasExplicitDefault } as T,
    ...configured,
  ];
}
