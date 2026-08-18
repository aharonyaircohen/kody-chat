import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetPersonalBrainServicesForTests,
  setPersonalBrainServices,
} from "../../src/personal-services";
import { resolvePersonalBrainContext } from "../../src/personal-context";

describe("personal Brain context", () => {
  beforeEach(() => resetPersonalBrainServicesForTests());

  it("builds runtime ownership without repository identity", async () => {
    setPersonalBrainServices({
      resolveUser: vi.fn().mockResolvedValue({ id: "user-1", label: "User" }),
      getCredential: vi.fn().mockResolvedValue(null),
      getCredentials: vi.fn().mockResolvedValue({
        FLY_API_TOKEN: "fly-token",
        OPENROUTER_API_KEY: "model-token",
      }),
      loadState: vi.fn().mockResolvedValue(null),
      saveState: vi.fn().mockResolvedValue(undefined),
    });

    const result = await resolvePersonalBrainContext();
    expect(result).toMatchObject({
      ok: true,
      context: {
        flyToken: "fly-token",
        allSecrets: {
          OPENROUTER_API_KEY: "model-token",
        },
      },
    });
    if (result.ok) {
      expect(result.context).not.toHaveProperty("owner");
      expect(result.context).not.toHaveProperty("repo");
      expect(result.context.account).toMatch(/^user-[a-f0-9]{16}$/);
    }
  });

  it("rejects unauthenticated requests", async () => {
    setPersonalBrainServices({
      resolveUser: vi.fn().mockResolvedValue(null),
      getCredential: vi.fn(),
      getCredentials: vi.fn(),
      loadState: vi.fn(),
      saveState: vi.fn(),
    });

    expect(await resolvePersonalBrainContext()).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });
});
