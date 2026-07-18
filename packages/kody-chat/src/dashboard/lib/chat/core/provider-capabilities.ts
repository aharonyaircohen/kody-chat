export interface ChatProviderModel {
  provider: string;
  modelName: string;
}

export interface ChatProviderCapabilities {
  supportsRequiredToolChoice: boolean;
  supportsNamedToolChoice: boolean;
}

/**
 * Return only wire-level behavior that the chat turn needs to know.
 * Provider quirks stay here instead of leaking into the route or UI.
 */
export function getChatProviderCapabilities(
  model: ChatProviderModel,
): ChatProviderCapabilities {
  const provider = model.provider.trim().toLowerCase();
  const modelName = model.modelName.trim().toLowerCase();

  if (
    provider === "minimax" ||
    modelName.startsWith("minimax-") ||
    provider === "openrouter" ||
    provider === "google" ||
    provider === "gemini" ||
    modelName.startsWith("gemini-")
  ) {
    return {
      supportsRequiredToolChoice: false,
      supportsNamedToolChoice: false,
    };
  }

  return {
    supportsRequiredToolChoice: true,
    supportsNamedToolChoice: true,
  };
}
