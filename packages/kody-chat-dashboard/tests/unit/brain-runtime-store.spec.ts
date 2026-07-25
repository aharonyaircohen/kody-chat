/**
 * @fileoverview Unit coverage for Brain runtime state boundaries.
 * @testFramework vitest
 * @domain brain
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getOctokit: vi.fn(() => ({ id: "octokit" })),
  getOwner: vi.fn(() => "aharonyaircohen"),
  getRepo: vi.fn(() => "Kody-Dashboard"),
  readBackendDoc: vi.fn(),
  writeBackendDoc: vi.fn(),
}));

vi.mock("@kody-ade/brain/github", () => ({
  getOctokit: state.getOctokit,
  getOwner: state.getOwner,
  getRepo: state.getRepo,
}));

vi.mock("@kody-ade/base/backend/repo-docs", () => ({
  readBackendDoc: state.readBackendDoc,
  writeBackendDoc: state.writeBackendDoc,
}));

describe("Brain runtime store", () => {
  beforeEach(() => {
    vi.resetModules();
    state.getOctokit.mockReturnValue({ id: "octokit" });
    state.getOwner.mockReturnValue("aharonyaircohen");
    state.getRepo.mockReturnValue("Kody-Dashboard");
    state.readBackendDoc.mockReset();
    state.writeBackendDoc.mockReset();
  });

  it("writes runtime state to brain-runtime.json, not the image catalog", async () => {
    state.readBackendDoc.mockResolvedValue(null);
    state.writeBackendDoc.mockResolvedValue({ sha: "new-sha" });
    const { writeBrainRuntimeState } =
      await import("@kody-ade/brain/runtime-store");

    await writeBrainRuntimeState("Alice", "token", {
      version: 1,
      desiredImageRef: "ghcr.io/alice/kody-brain-snapshot:new",
      running: {
        imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
        app: "brain-1",
        machineId: "machine-1",
        orgSlug: "personal",
        appliedAt: "2026-07-02T10:00:00.000Z",
      },
      updatedAt: "2026-07-02T10:00:00.000Z",
    });

    expect(state.writeBackendDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "users/alice/data/brain-runtime.json",
        message: "feat(brain): record brain runtime for Alice",
        scope: "root",
      }),
    );
  });

  it("rejects invalid runtime image refs", async () => {
    const { writeBrainRuntimeState } =
      await import("@kody-ade/brain/runtime-store");

    await expect(
      writeBrainRuntimeState("Alice", "token", {
        version: 1,
        desiredImageRef: "registry.fly.io/brain-1:new",
        updatedAt: "2026-07-02T10:00:00.000Z",
      }),
    ).rejects.toThrow("Invalid Brain runtime state");
    expect(state.writeBackendDoc).not.toHaveBeenCalled();
  });

  it("rejects completed apply state without a recorded running machine", async () => {
    const { writeBrainRuntimeState } =
      await import("@kody-ade/brain/runtime-store");

    await expect(
      writeBrainRuntimeState("Alice", "token", {
        version: 1,
        desiredImageRef: "ghcr.io/alice/kody-brain-snapshot:new",
        operation: {
          id: "op-1",
          type: "apply-image",
          status: "completed",
          imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
          startedAt: "2026-07-02T10:00:00.000Z",
          updatedAt: "2026-07-02T10:01:00.000Z",
        },
        updatedAt: "2026-07-02T10:01:00.000Z",
      }),
    ).rejects.toThrow("Invalid Brain runtime state");
    expect(state.writeBackendDoc).not.toHaveBeenCalled();
  });
});
