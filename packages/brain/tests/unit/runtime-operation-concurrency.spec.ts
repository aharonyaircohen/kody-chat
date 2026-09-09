import { beforeEach, describe, expect, it } from "vitest";
import {
  beginBrainRuntimeApply,
  completeBrainRuntimeApply,
  finishBrainImageSaveOperation,
} from "../../src/runtime-manager";
import { _resetBrainRuntimeCache } from "../../src/runtime-store";
import { setPersonalBrainServices } from "../../src/personal-services";

describe("runtime operation ownership", () => {
  let value: any = null;
  let conflictNext = false;
  beforeEach(() => {
    value = null;
    conflictNext = false;
    _resetBrainRuntimeCache();
    setPersonalBrainServices({
      resolveUser: async () => ({ id: "a", label: "A" }),
      getCredential: async () => null,
      getCredentials: async () => ({}),
      loadState: async () => value,
      saveState: async (_user, _name, next, expected) => {
        if (conflictNext && expected !== undefined) {
          conflictNext = false;
          throw new Error("conflict");
        }
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
  it("retries completion after a concurrent runtime revision", async () => {
    await beginBrainRuntimeApply("a", "", "ghcr.io/a/brain:one");
    conflictNext = true;
    const completed = await completeBrainRuntimeApply("a", "", {
      operationId: value.operation.id,
      imageRef: "ghcr.io/a/brain:one",
      app: "brain-a",
      machineId: "m1",
      orgSlug: "org",
    });
    expect(completed.operation?.status).toBe("completed");
  });
  it("retries image-save completion after a concurrent runtime revision", async () => {
    const started = await beginBrainRuntimeApply(
      "a",
      "",
      "ghcr.io/a/brain:save",
      "save-image",
    );
    conflictNext = true;

    await finishBrainImageSaveOperation("a", "", started.operation!.id);

    expect(value.operation.status).toBe("completed");
  });
  it("rejects restore while an image save owns the Brain", async () => {
    await beginBrainRuntimeApply("a", "", "ghcr.io/a/brain:save", "save-image");
    await expect(
      beginBrainRuntimeApply("a", "", "ghcr.io/a/brain:restore"),
    ).rejects.toThrow("Another Brain operation");
  });
  it("reclaims an orphaned stale image save before restore", async () => {
    value = {
      version: 1,
      operation: {
        id: "orphaned-save",
        type: "save-image",
        status: "running",
        imageRef: "ghcr.io/a/brain:save",
        startedAt: "2026-09-08T15:00:00.000Z",
        updatedAt: "2026-09-08T15:00:00.000Z",
      },
      updatedAt: "2026-09-08T15:00:00.000Z",
    };
    const started = await beginBrainRuntimeApply(
      "a",
      "",
      "ghcr.io/a/brain:restore",
    );
    expect(started.operation?.type).toBe("apply-image");
    expect(value.operation?.id).not.toBe("orphaned-save");
  });
});
