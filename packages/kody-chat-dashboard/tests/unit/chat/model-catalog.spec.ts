import { describe, expect, it } from "vitest";
import type { ChatModel } from "@kody-ade/base/variables/models";
import {
  KODY_OPENROUTER_FREE_CHAT_MODEL,
  composeChatModelCatalog,
} from "../../../src/dashboard/lib/chat/model-catalog";

const minimaxModel = (overrides: Partial<ChatModel> = {}): ChatModel => ({
  id: "minimax/MiniMax-M3",
  label: "MiniMax M3",
  provider: "minimax",
  protocol: "openai",
  baseURL: "https://api.minimax.io/v1",
  modelName: "MiniMax-M3",
  apiKeySecret: "MINIMAX_API_KEY",
  enabled: true,
  ...overrides,
});

describe("Kody Chat model catalog", () => {
  it("defines the OpenRouter Free configuration", () => {
    expect(KODY_OPENROUTER_FREE_CHAT_MODEL).toMatchObject({
      id: "openrouter/free",
      label: "OpenRouter Free",
      provider: "openrouter",
      protocol: "openai",
      baseURL: "https://openrouter.ai/api/v1",
      modelName: "openrouter/free",
      apiKeySecret: "OPENROUTER_API_KEY",
    });
  });

  it("uses the embedded model as the default only when no user default exists", () => {
    const withoutUserDefault = composeChatModelCatalog(
      [minimaxModel()],
      KODY_OPENROUTER_FREE_CHAT_MODEL,
    );
    expect(withoutUserDefault[0]).toMatchObject({
      id: "openrouter/free",
      default: true,
    });

    const withUserDefault = composeChatModelCatalog(
      [minimaxModel({ default: true })],
      KODY_OPENROUTER_FREE_CHAT_MODEL,
    );
    expect(
      withUserDefault.find((model) => model.id === "minimax/MiniMax-M3"),
    ).toMatchObject({ default: true });
    expect(
      withUserDefault.find((model) => model.id === "openrouter/free"),
    ).toMatchObject({ default: false });
  });

  it("preserves a user-managed OpenRouter entry with the same id", () => {
    const configured = {
      ...KODY_OPENROUTER_FREE_CHAT_MODEL,
      label: "My OpenRouter Free",
      apiKeySecret: "MY_OPENROUTER_KEY",
      maxSteps: 42,
      default: false,
    } satisfies ChatModel;

    const catalog = composeChatModelCatalog<ChatModel>(
      [configured],
      KODY_OPENROUTER_FREE_CHAT_MODEL,
    );

    expect(catalog).toEqual([configured]);
  });
});
