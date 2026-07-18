import { describe, expect, it } from "vitest";
import {
  getChatProviderCapabilities,
  type ChatProviderModel,
} from "../../../src/dashboard/lib/chat/core/provider-capabilities";

function model(overrides: Partial<ChatProviderModel> = {}): ChatProviderModel {
  return {
    provider: "openai",
    modelName: "gpt-4o",
    ...overrides,
  };
}

describe("chat provider capabilities", () => {
  it("uses automatic tool selection for MiniMax", () => {
    expect(
      getChatProviderCapabilities(
        model({ provider: "minimax", modelName: "MiniMax-M3" }),
      ),
    ).toEqual({ supportsRequiredToolChoice: false, supportsNamedToolChoice: false });
  });

  it("uses automatic tool selection for routed OpenRouter models", () => {
    expect(
      getChatProviderCapabilities(
        model({ provider: "openrouter", modelName: "openai/gpt-4o" }),
      ),
    ).toEqual({ supportsRequiredToolChoice: false, supportsNamedToolChoice: false });
  });

  it("uses automatic tool selection for Gemini's OpenAI-compatible endpoint", () => {
    expect(
      getChatProviderCapabilities(
        model({ provider: "google", modelName: "gemini-2.5-pro" }),
      ),
    ).toEqual({
      supportsRequiredToolChoice: false,
      supportsNamedToolChoice: false,
    });
  });

  it("keeps strict tool selection for native OpenAI-compatible models", () => {
    expect(getChatProviderCapabilities(model())).toEqual({
      supportsRequiredToolChoice: true,
      supportsNamedToolChoice: true,
    });
  });
});
