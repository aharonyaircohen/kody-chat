import { beforeEach, describe, expect, it, vi } from "vitest";

const updateVariablesMock = vi.hoisted(() => vi.fn());
const getEngineConfigMock = vi.hoisted(() => vi.fn());
const writeEngineModelMock = vi.hoisted(() => vi.fn());

vi.mock("../src/variables/store", () => ({
  updateVariables: updateVariablesMock,
}));
vi.mock("../src/engine/config", () => ({
  getEngineConfig: getEngineConfigMock,
  writeEngineModel: writeEngineModelMock,
}));

import {
  saveManagedChatModels,
  upsertVariable,
} from "../src/variables/mutations";

const EMPTY_DOC = { version: 1 as const, variables: {} };

describe("shared variable mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateVariablesMock.mockImplementation(async (_owner, _repo, mutate) => ({
      doc: mutate(EMPTY_DOC),
    }));
    getEngineConfigMock.mockResolvedValue({ config: {}, sha: null });
    writeEngineModelMock.mockResolvedValue({ sha: "commit" });
  });

  it("upserts variables with the verified actor metadata", async () => {
    const result = await upsertVariable({
      owner: "acme",
      repo: "app",
      name: "FEATURE_FLAG",
      value: "on",
      actorLogin: "alice",
      now: "2026-08-05T00:00:00.000Z",
    });

    expect(result.doc.variables.FEATURE_FLAG).toEqual({
      value: "on",
      updatedAt: "2026-08-05T00:00:00.000Z",
      updatedBy: "alice",
    });
  });

  it("saves models and synchronizes the engine default", async () => {
    const models = [
      {
        id: "openrouter/free",
        label: "OpenRouter Free",
        provider: "openrouter" as const,
        protocol: "openai" as const,
        baseURL: "https://openrouter.ai/api/v1",
        modelName: "openrouter/free",
        apiKeySecret: "OPENROUTER_API_KEY",
        enabled: true,
        engineDefault: true,
      },
    ];

    const result = await saveManagedChatModels({
      octokit: {} as never,
      owner: "acme",
      repo: "app",
      models,
      actorLogin: "alice",
      now: "2026-08-05T00:00:00.000Z",
    });

    expect(result.engineSyncWarning).toBeUndefined();
    expect(writeEngineModelMock).toHaveBeenCalledWith(
      expect.anything(),
      "acme",
      "app",
      "openrouter/free",
    );
  });
});
