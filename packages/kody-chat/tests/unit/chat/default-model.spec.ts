import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ChatModelSchema,
  OPENROUTER_FREE_CHAT_MODEL,
  withBuiltInChatModels,
} from "@kody-ade/base/variables/models";

describe("Kody default chat model", () => {
  it("uses the OpenRouter free router configuration", () => {
    expect(ChatModelSchema.parse(OPENROUTER_FREE_CHAT_MODEL)).toEqual({
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
    });
  });

  it("keeps the built-in model available beside configured models", () => {
    expect(
      withBuiltInChatModels([
        {
          id: "minimax/MiniMax-M3",
          label: "MiniMax M3",
          provider: "minimax",
          protocol: "openai",
          baseURL: "https://api.minimax.io/v1",
          modelName: "MiniMax-M3",
          apiKeySecret: "MINIMAX_API_KEY",
        },
      ]),
    ).toHaveLength(2);
  });

  it("is offered as the empty-state activation path", () => {
    const source = readFileSync(
      "src/dashboard/lib/components/ModelsManager.tsx",
      "utf8",
    );

    expect(source).toContain("OpenRouter Free is built in.");
  });
});
