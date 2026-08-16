import { describe, expect, it } from "vitest";
import type { ChatModel } from "@kody-ade/base/variables/models";
import {
  KODY_XKIRO_FREE_CHAT_MODEL,
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

  it("defines the xKiro Free configuration", () => {
    expect(KODY_XKIRO_FREE_CHAT_MODEL).toMatchObject({
      id: "xkiro/deepseek/deepseek-v4-flash",
      label: "xKiro Free",
      provider: "xkiro",
      protocol: "openai",
      baseURL: "https://api.xkiro.com/v1",
      modelName: "deepseek/deepseek-v4-flash",
      apiKeySecret: "XKIRO_API_KEY",
    });
  });

  it("composes both built-in models without overwriting configured models", () => {
    const catalog = composeChatModelCatalog(
      [minimaxModel()],
      [KODY_OPENROUTER_FREE_CHAT_MODEL, KODY_XKIRO_FREE_CHAT_MODEL],
    );

    expect(catalog.map((model) => model.id)).toEqual([
      "openrouter/free",
      "xkiro/deepseek/deepseek-v4-flash",
      "minimax/MiniMax-M3",
    ]);
    expect(catalog[0]).toMatchObject({ default: true });
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

  it("preserves the saved position of the built-in model", () => {
    const primary = minimaxModel({ default: true });
    const builtIn = {
      ...KODY_OPENROUTER_FREE_CHAT_MODEL,
      default: false,
    } satisfies ChatModel;

    expect(
      composeChatModelCatalog<ChatModel>(
        [primary, builtIn],
        KODY_OPENROUTER_FREE_CHAT_MODEL,
      ).map((model) => model.id),
    ).toEqual(["minimax/MiniMax-M3", "openrouter/free"]);
  });
});
