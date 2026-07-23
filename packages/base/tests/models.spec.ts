import { describe, expect, it } from "vitest";

import {
  ChatModelSchema,
  PROVIDER_PRESETS,
} from "../src/variables/models";

const baseModel = {
  id: "google/gemini-next",
  label: "Gemini Next",
  provider: "google" as const,
  baseURL: "https://generativelanguage.googleapis.com/v1beta",
  modelName: "gemini-next",
  apiKeySecret: "GEMINI_API_KEY",
};

describe("chat model adapters", () => {
  it("uses the native Google adapter for new Google models", () => {
    expect(PROVIDER_PRESETS.google.adapter).toBe("google");
    expect(
      ChatModelSchema.parse({
        ...baseModel,
        protocol: "openai",
      }),
    ).toMatchObject({
      provider: "google",
      adapter: "google",
      adapterBaseURL: "https://generativelanguage.googleapis.com/v1beta",
      protocol: "openai",
      modelName: "gemini-next",
    });
  });

  it("adds the native adapter to existing Google model records", () => {
    expect(
      ChatModelSchema.parse({
        ...baseModel,
        protocol: "openai",
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      }),
    ).toMatchObject({
      provider: "google",
      adapter: "google",
      adapterBaseURL: "https://generativelanguage.googleapis.com/v1beta",
      protocol: "openai",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    });
  });

  it("keeps non-Google compatible providers on the generic adapter", () => {
    expect(
      ChatModelSchema.parse({
        ...baseModel,
        id: "custom/example",
        provider: "custom",
        protocol: "openai",
        baseURL: "https://models.example.test/v1",
      }),
    ).toMatchObject({
      provider: "custom",
      adapter: "openai-compatible",
      protocol: "openai",
      baseURL: "https://models.example.test/v1",
    });
  });
});
