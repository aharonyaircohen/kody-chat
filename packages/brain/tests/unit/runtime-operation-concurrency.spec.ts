import { beforeEach, describe, expect, it } from "vitest";
import {
  beginBrainRuntimeApply,
  completeBrainRuntimeApply,
} from "../../src/runtime-manager";
import { _resetBrainRuntimeCache } from "../../src/runtime-store";
import { setPersonalBrainServices } from "../../src/personal-services";

describe("runtime operation ownership", () => {
  let value: any = null;
  beforeEach(() => {
    value = null;
    _resetBrainRuntimeCache();
    setPersonalBrainServices({
      resolveUser: async () => ({ id: "a", label: "A" }),
      getCredential: async () => null,
      getCredentials: async () => ({}),
      loadState: async () => value,
      saveState: async (_user, _name, next, expected) => {
        if (expected !== undefined && (value?.updatedAt ?? null) !== expected)
          throw new Error("conflict");
        value = next;
      },
    });
  });
  it("allows only one overlapping apply", async () => {
    const results = await Promise.allSettled([
      beginBrainRuntimeApply("a", "", "ghcr.io/a/brain:one"),
      beginBrainRuntimeApply("a", "", "ghcr.io/a/brain:two"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
  });
  it("rejects completion from a different operation", async () => {
    await beginBrainRuntimeApply("a", "", "ghcr.io/a/brain:one");
    await expect(
      completeBrainRuntimeApply("a", "", {
        operationId: "stale",
        imageRef: "ghcr.io/a/brain:one",
        app: "brain-a",
        machineId: "m1",
        orgSlug: "org",
      }),
    ).rejects.toThrow();
    expect(value.operation.status).toBe("running");
  });
  it("rejects restore while an image save owns the Brain", async () => {
    await beginBrainRuntimeApply("a", "", "ghcr.io/a/brain:save", "save-image");
    await expect(
      beginBrainRuntimeApply("a", "", "ghcr.io/a/brain:restore"),
    ).rejects.toThrow("Another Brain operation");
  });
});
