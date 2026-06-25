/**
 * @fileoverview Unit coverage for saved Brain image metadata.
 * @testFramework vitest
 * @domain brain
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getOctokit: vi.fn(() => ({ id: "octokit" })),
  getOwner: vi.fn(() => "aharonyaircohen"),
  getRepo: vi.fn(() => "Kody-Dashboard"),
  readStateText: vi.fn(),
  writeStateText: vi.fn(),
}));

vi.mock("@dashboard/lib/github-client", () => ({
  getOctokit: state.getOctokit,
  getOwner: state.getOwner,
  getRepo: state.getRepo,
}));

vi.mock("@dashboard/lib/state-repo", () => ({
  readStateText: state.readStateText,
  writeStateText: state.writeStateText,
}));

describe("Brain image store", () => {
  beforeEach(() => {
    vi.resetModules();
    state.getOctokit.mockReturnValue({ id: "octokit" });
    state.getOwner.mockReturnValue("aharonyaircohen");
    state.getRepo.mockReturnValue("Kody-Dashboard");
    state.readStateText.mockReset();
    state.writeStateText.mockReset();
  });

  it("reads the per-user Brain image record from kody-state", async () => {
    state.readStateText.mockResolvedValue({
      content: JSON.stringify({
        version: 1,
        imageRef: "ghcr.io/alice/kody-brain-snapshot:20260625",
        createdAt: "2026-06-25T10:00:00.000Z",
        updatedAt: "2026-06-25T10:00:00.000Z",
      }),
      sha: "sha",
      etag: "etag",
    });
    const { readBrainImage } = await import("@dashboard/lib/brain/store");

    await expect(readBrainImage("Alice", "token")).resolves.toMatchObject({
      imageRef: "ghcr.io/alice/kody-brain-snapshot:20260625",
    });
    expect(state.readStateText).toHaveBeenCalledWith(
      { id: "octokit" },
      "aharonyaircohen",
      "Kody-Dashboard",
      "users/alice/data/brain-image.json",
      expect.any(Object),
    );
  });

  it("writes the per-user Brain image record without touching brain.json", async () => {
    state.readStateText.mockResolvedValue(null);
    state.writeStateText.mockResolvedValue({ sha: "new-sha" });
    const { writeBrainImage } = await import("@dashboard/lib/brain/store");

    await writeBrainImage("Alice", "token", {
      version: 1,
      imageRef: "registry.fly.io/kody-brain-alice:20260625",
      createdAt: "2026-06-25T10:00:00.000Z",
      updatedAt: "2026-06-25T10:00:00.000Z",
    });

    expect(state.writeStateText).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "users/alice/data/brain-image.json",
        message: "feat(brain): record brain image for Alice",
      }),
    );
  });

  it("accepts legacy GHCR image refs", async () => {
    const { writeBrainImage } = await import("@dashboard/lib/brain/store");

    state.readStateText.mockResolvedValue(null);
    await expect(
      writeBrainImage("Alice", "token", {
        version: 1,
        imageRef: "ghcr.io/alice/kody-brain-snapshot:20260625",
        createdAt: "2026-06-25T10:00:00.000Z",
        updatedAt: "2026-06-25T10:00:00.000Z",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects non-GHCR image refs", async () => {
    const { writeBrainImage } = await import("@dashboard/lib/brain/store");

    await expect(
      writeBrainImage("Alice", "token", {
        version: 1,
        imageRef: "docker.io/alice/kody-brain-snapshot:latest",
        createdAt: "2026-06-25T10:00:00.000Z",
        updatedAt: "2026-06-25T10:00:00.000Z",
      }),
    ).rejects.toThrow("Invalid Brain image record");
    expect(state.writeStateText).not.toHaveBeenCalled();
  });
});
