/**
 * @fileType adapter
 * @domain chat
 * @pattern provider-adapter-registry
 * @ai-summary Creates AI SDK language models from saved adapter metadata.
 * Model names are opaque configuration data; only the adapter selects code.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  PROVIDER_PRESETS,
  type ChatAdapter,
  type ChatModel,
} from "@kody-ade/base/variables/models";
import type { LanguageModel } from "ai";

import { normalizeOpenAICompatibleRequestBody } from "@kody-ade/kody-chat-dashboard/core/openai-compatible-request";

export interface ChatModelAdapter {
  requiresBaseURL: boolean;
  create(model: ChatModel, apiKey: string): LanguageModel;
}

function adapterBaseURL(model: ChatModel): string {
  return (
    model.adapterBaseURL?.trim() ||
    PROVIDER_PRESETS[model.provider].adapterBaseURL ||
    model.baseURL.trim()
  );
}

export const CHAT_MODEL_ADAPTERS: Record<ChatAdapter, ChatModelAdapter> = {
  anthropic: {
    requiresBaseURL: false,
    create(model, apiKey) {
      const baseURL = adapterBaseURL(model);
      const provider = createAnthropic({
        apiKey,
        ...(baseURL ? { baseURL } : {}),
      });
      return provider(model.modelName);
    },
  },
  google: {
    requiresBaseURL: false,
    create(model, apiKey) {
      const baseURL = adapterBaseURL(model);
      const provider = createGoogleGenerativeAI({
        apiKey,
        ...(baseURL ? { baseURL } : {}),
      });
      return provider(model.modelName);
    },
  },
  "openai-compatible": {
    requiresBaseURL: true,
    create(model, apiKey) {
      const baseURL = adapterBaseURL(model);
      const provider = createOpenAICompatible({
        name: model.provider,
        apiKey,
        baseURL,
        transformRequestBody: normalizeOpenAICompatibleRequestBody,
      });
      return provider(model.modelName);
    },
  },
};

export function chatAdapterId(model: ChatModel): ChatAdapter {
  return model.adapter ?? PROVIDER_PRESETS[model.provider].adapter;
}

export function chatModelAdapter(model: ChatModel): ChatModelAdapter {
  return CHAT_MODEL_ADAPTERS[chatAdapterId(model)];
}

export function chatModelAdapterBaseURL(model: ChatModel): string {
  return adapterBaseURL(model);
}
