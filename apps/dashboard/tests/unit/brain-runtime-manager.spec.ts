/**
 * @fileoverview Unit coverage for Brain runtime manager transitions.
 * @testFramework vitest
 * @domain brain
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const imageStore = vi.hoisted(() => ({
  readBrainImage: vi.fn(),
}));

const runtimeStore = vi.hoisted(() => ({
  readBrainRuntimeState: vi.fn(),
  writeBrainRuntimeState: vi.fn(async () => undefined),
}));

vi.mock("@kody-ade/brain/store", () => imageStore);
vi.mock("@kody-ade/brain/runtime-store", () => runtimeStore);

describe("Brain runtime manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeStore.readBrainRuntimeState.mockResolvedValue(null);
    imageStore.readBrainImage.mockResolvedValue(null);
  });

  it("completes apply by replacing the running runtime target", async () => {
    runtimeStore.readBrainRuntimeState.mockResolvedValueOnce({
      version: 1,
      desiredImageRef: "ghcr.io/acme/kody-brain-octocat:new",
      operation: {
        id: "op-1",
        type: "apply-image",
        status: "running",
        imageRef: "ghcr.io/acme/kody-brain-octocat:new",
        startedAt: "2026-07-02T09:00:00.000Z",
        updatedAt: "2026-07-02T09:00:00.000Z",
      },
      updatedAt: "2026-07-02T09:00:00.000Z",
    });
    const { completeBrainRuntimeApply } =
      await import("@kody-ade/brain/runtime-manager");

    await completeBrainRuntimeApply("octocat", "token", {
      imageRef: "ghcr.io/acme/kody-brain-octocat:new",
      app: "brain-2",
      machineId: "machine-new",
      orgSlug: "personal",
      appliedAt: "2026-07-02T10:00:00.000Z",
    });

    expect(runtimeStore.writeBrainRuntimeState).toHaveBeenCalledWith(
      "octocat",
      "token",
      expect.objectContaining({
        desiredImageRef: "ghcr.io/acme/kody-brain-octocat:new",
        running: expect.objectContaining({
          imageRef: "ghcr.io/acme/kody-brain-octocat:new",
          app: "brain-2",
          machineId: "machine-new",
        }),
        operation: expect.objectContaining({ status: "completed" }),
      }),
    );
  });

  it("falls back to legacy image running metadata for migration only", async () => {
    imageStore.readBrainImage.mockResolvedValueOnce({
      version: 1,
      imageRef: "ghcr.io/acme/kody-brain-octocat:selected",
      runningImageRef: "ghcr.io/acme/kody-brain-octocat:selected",
      runningAt: "2026-07-02T10:00:00.000Z",
      runningApp: "brain-1",
      runningMachineId: "machine-1",
      createdAt: "2026-07-02T09:00:00.000Z",
      updatedAt: "2026-07-02T10:00:00.000Z",
      images: [],
    });
    const { readBrainRuntimeView } =
      await import("@kody-ade/brain/runtime-manager");

    await expect(
      readBrainRuntimeView("octocat", "token"),
    ).resolves.toMatchObject({
      desiredImageRef: "ghcr.io/acme/kody-brain-octocat:selected",
      runningApp: "brain-1",
      runningMachineId: "machine-1",
      source: "legacy",
    });
  });
});
