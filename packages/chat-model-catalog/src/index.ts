/**
 * @fileType utility
 * @domain chat
 * @pattern model-catalog
 * @ai-summary Shared built-in model catalog contract used by Kody hosts.
 */

export interface ChatModelCatalogEntry {
  id: string;
  label: string;
  provider: string;
  protocol: "anthropic" | "openai";
  baseURL: string;
  modelName: string;
  apiKeySecret: string;
  enabled?: boolean;
  default?: boolean;
  engineDefault?: boolean;
}

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
} as const satisfies ChatModelCatalogEntry);

export interface CatalogModel {
  id: string;
  enabled?: boolean;
  default?: boolean;
}

/**
 * Add the built-in model while preserving explicit user configuration.
 * An enabled persisted default always beats the embedded fallback.
 */
export function composeChatModelCatalog<T extends CatalogModel>(
  configuredModels: readonly T[],
  builtInModel: T,
): T[] {
  const configured = [...configuredModels];
  const sameId = configured.find((model) => model.id === builtInModel.id);
  const hasExplicitDefault = configured.some(
    (model) => model.enabled !== false && model.default === true,
  );
  const embedded = sameId ?? {
    ...builtInModel,
    default: !hasExplicitDefault,
  };

  return [
    embedded as T,
    ...configured.filter((model) => model.id !== builtInModel.id),
  ];
}
