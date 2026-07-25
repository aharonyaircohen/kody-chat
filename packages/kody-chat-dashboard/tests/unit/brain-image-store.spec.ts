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
  readBackendDoc: vi.fn(),
  writeBackendDoc: vi.fn(),
  deleteBackendDoc: vi.fn(),
}));

vi.mock("@kody-ade/brain/github", () => ({
  getOctokit: state.getOctokit,
  getOwner: state.getOwner,
  getRepo: state.getRepo,
}));

vi.mock("@kody-ade/base/backend/repo-docs", () => ({
  deleteBackendDoc: state.deleteBackendDoc,
  readBackendDoc: state.readBackendDoc,
  writeBackendDoc: state.writeBackendDoc,
}));

describe("Brain image store", () => {
  beforeEach(() => {
    vi.resetModules();
    state.getOctokit.mockReturnValue({ id: "octokit" });
    state.getOwner.mockReturnValue("aharonyaircohen");
    state.getRepo.mockReturnValue("Kody-Dashboard");
    state.readBackendDoc.mockReset();
    state.writeBackendDoc.mockReset();
    state.deleteBackendDoc.mockReset();
  });

  it("reads the per-user Brain image record from Convex", async () => {
    state.readBackendDoc.mockResolvedValue({
      content: JSON.stringify({
        version: 1,
        imageRef: "ghcr.io/alice/kody-brain-snapshot:20260625",
        createdAt: "2026-06-25T10:00:00.000Z",
        updatedAt: "2026-06-25T10:00:00.000Z",
        images: [
          {
            imageRef: "ghcr.io/alice/kody-brain-snapshot:20260625",
            createdAt: "2026-06-25T10:00:00.000Z",
            updatedAt: "2026-06-25T10:00:00.000Z",
          },
        ],
      }),
      sha: "sha",
      etag: "etag",
    });
    const { readBrainImage } = await import("@kody-ade/brain/store");

    await expect(readBrainImage("Alice", "token")).resolves.toMatchObject({
      imageRef: "ghcr.io/alice/kody-brain-snapshot:20260625",
      images: [
        expect.objectContaining({
          imageRef: "ghcr.io/alice/kody-brain-snapshot:20260625",
        }),
      ],
    });
    expect(state.readBackendDoc).toHaveBeenCalledWith(
      { id: "octokit" },
      "aharonyaircohen",
      "Kody-Dashboard",
      "users/alice/data/brain-image.json",
      expect.objectContaining({ scope: "root" }),
    );
  });

  it("does not retry a missing Convex document through another adapter", async () => {
    state.readBackendDoc.mockResolvedValueOnce(null);
    const { readBrainImage } = await import("@kody-ade/brain/store");

    await expect(readBrainImage("Alice", "token")).resolves.toBeNull();
    expect(state.readBackendDoc).toHaveBeenNthCalledWith(
      1,
      { id: "octokit" },
      "aharonyaircohen",
      "Kody-Dashboard",
      "users/alice/data/brain-image.json",
      expect.objectContaining({ scope: "root" }),
    );
    expect(state.readBackendDoc).toHaveBeenCalledTimes(1);
  });

  it("reads the stored Brain app from user-level state", async () => {
    state.readBackendDoc.mockResolvedValue({
      content: JSON.stringify({
        version: 1,
        appName: "kody-brain-alice",
        orgSlug: "personal",
        createdAt: "2026-06-25T10:00:00.000Z",
      }),
      sha: "sha",
      etag: "etag",
    });
    const { readBrainApp } = await import("@kody-ade/brain/store");

    await expect(readBrainApp("Alice", "token")).resolves.toMatchObject({
      appName: "kody-brain-alice",
    });
    expect(state.readBackendDoc).toHaveBeenCalledWith(
      { id: "octokit" },
      "aharonyaircohen",
      "Kody-Dashboard",
      "users/alice/data/brain.json",
      expect.objectContaining({ scope: "root" }),
    );
  });

  it("writes the stored Brain app to user-level state", async () => {
    state.readBackendDoc.mockResolvedValue(null);
    state.writeBackendDoc.mockResolvedValue({ sha: "new-sha" });
    const { writeBrainApp } = await import("@kody-ade/brain/store");

    await writeBrainApp("Alice", "token", {
      version: 1,
      appName: "kody-brain-alice",
      orgSlug: "personal",
      createdAt: "2026-06-25T10:00:00.000Z",
    });

    expect(state.writeBackendDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "users/alice/data/brain.json",
        message: "feat(brain): record brain app for Alice",
        scope: "root",
      }),
    );
  });

  it("clears the user-level Brain app document once", async () => {
    state.readBackendDoc.mockResolvedValueOnce({
      sha: "root-sha",
      content: "{}",
    });
    state.deleteBackendDoc.mockResolvedValue(undefined);
    const { clearBrainApp } = await import("@kody-ade/brain/store");

    await clearBrainApp("Alice", "token");

    expect(state.deleteBackendDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "users/alice/data/brain.json",
        message: "feat(brain): clear brain app for Alice",
        sha: "root-sha",
        scope: "root",
      }),
    );
    expect(state.deleteBackendDoc).toHaveBeenCalledTimes(1);
  });

  it("writes the per-user Brain image record without touching brain.json", async () => {
    state.readBackendDoc.mockResolvedValue(null);
    state.writeBackendDoc.mockResolvedValue({ sha: "new-sha" });
    const { writeBrainImage } = await import("@kody-ade/brain/store");

    await writeBrainImage("Alice", "token", {
      version: 1,
      imageRef: "ghcr.io/alice/kody-brain-snapshot:20260625",
      createdAt: "2026-06-25T10:00:00.000Z",
      updatedAt: "2026-06-25T10:00:00.000Z",
      images: [
        {
          imageRef: "ghcr.io/alice/kody-brain-snapshot:20260625",
          createdAt: "2026-06-25T10:00:00.000Z",
          updatedAt: "2026-06-25T10:00:00.000Z",
        },
      ],
    });

    expect(state.writeBackendDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "users/alice/data/brain-image.json",
        message: "feat(brain): record brain image for Alice",
        scope: "root",
      }),
    );
  });

  it("writes catalog-only Brain images without inventing selected or running state", async () => {
    state.readBackendDoc.mockResolvedValue(null);
    state.writeBackendDoc.mockResolvedValue({ sha: "new-sha" });
    const { writeBrainImage } = await import("@kody-ade/brain/store");

    await writeBrainImage("Alice", "token", {
      version: 1,
      createdAt: "2026-06-25T10:00:00.000Z",
      updatedAt: "2026-06-25T10:00:00.000Z",
      images: [
        {
          imageRef: "ghcr.io/alice/kody-brain-snapshot:20260625",
          createdAt: "2026-06-25T10:00:00.000Z",
          updatedAt: "2026-06-25T10:00:00.000Z",
        },
      ],
    });

    const content = JSON.parse(
      (state.writeBackendDoc.mock.calls[0]?.[0] as { content: string }).content,
    ) as {
      imageRef?: string;
      runningImageRef?: string;
      runningApp?: string;
      runningMachineId?: string;
    };
    expect(content.imageRef).toBeUndefined();
    expect(content.runningImageRef).toBeUndefined();
    expect(content.runningApp).toBeUndefined();
    expect(content.runningMachineId).toBeUndefined();
  });

  it("selects a saved Brain image without deleting the image list", async () => {
    state.readBackendDoc
      .mockResolvedValueOnce({
        content: JSON.stringify({
          version: 1,
          imageRef: "ghcr.io/alice/kody-brain-snapshot:old",
          createdAt: "2026-06-25T10:00:00.000Z",
          updatedAt: "2026-06-25T10:00:00.000Z",
          images: [
            {
              imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
              createdAt: "2026-06-26T10:00:00.000Z",
              updatedAt: "2026-06-26T10:00:00.000Z",
            },
            {
              imageRef: "ghcr.io/alice/kody-brain-snapshot:old",
              createdAt: "2026-06-25T10:00:00.000Z",
              updatedAt: "2026-06-25T10:00:00.000Z",
            },
          ],
        }),
        sha: "sha",
      })
      .mockResolvedValueOnce({ sha: "sha", content: "{}" });
    state.writeBackendDoc.mockResolvedValue({ sha: "new-sha" });
    const { selectBrainImage } = await import("@kody-ade/brain/store");

    await expect(
      selectBrainImage(
        "Alice",
        "token",
        "ghcr.io/alice/kody-brain-snapshot:new",
      ),
    ).resolves.toMatchObject({
      imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
      images: expect.arrayContaining([
        expect.objectContaining({
          imageRef: "ghcr.io/alice/kody-brain-snapshot:old",
        }),
      ]),
    });
  });

  it("refreshes stale image cache before rejecting a selected image", async () => {
    state.readBackendDoc
      .mockResolvedValueOnce({
        content: JSON.stringify({
          version: 1,
          imageRef: "ghcr.io/alice/kody-brain-snapshot:old",
          createdAt: "2026-06-25T10:00:00.000Z",
          updatedAt: "2026-06-25T10:00:00.000Z",
          images: [
            {
              imageRef: "ghcr.io/alice/kody-brain-snapshot:old",
              createdAt: "2026-06-25T10:00:00.000Z",
              updatedAt: "2026-06-25T10:00:00.000Z",
            },
          ],
        }),
        sha: "old-sha",
        etag: "old-etag",
      })
      .mockRejectedValueOnce({ status: 304 })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          version: 1,
          imageRef: "ghcr.io/alice/kody-brain-snapshot:old",
          createdAt: "2026-06-25T10:00:00.000Z",
          updatedAt: "2026-06-26T10:00:00.000Z",
          images: [
            {
              imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
              createdAt: "2026-06-26T10:00:00.000Z",
              updatedAt: "2026-06-26T10:00:00.000Z",
            },
            {
              imageRef: "ghcr.io/alice/kody-brain-snapshot:old",
              createdAt: "2026-06-25T10:00:00.000Z",
              updatedAt: "2026-06-25T10:00:00.000Z",
            },
          ],
        }),
        sha: "new-sha",
        etag: "new-etag",
      })
      .mockResolvedValueOnce({ sha: "new-sha", content: "{}" });
    state.writeBackendDoc.mockResolvedValue({ sha: "written-sha" });
    const { readBrainImage, selectBrainImage } =
      await import("@kody-ade/brain/store");

    await readBrainImage("Alice", "token");
    await expect(
      selectBrainImage(
        "Alice",
        "token",
        "ghcr.io/alice/kody-brain-snapshot:new",
      ),
    ).resolves.toMatchObject({
      imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
    });

    expect(state.readBackendDoc).toHaveBeenNthCalledWith(
      3,
      { id: "octokit" },
      "aharonyaircohen",
      "Kody-Dashboard",
      "users/alice/data/brain-image.json",
      { scope: "root", headers: undefined },
    );
  });

  it("removes a deleted Brain image from dashboard metadata", async () => {
    state.readBackendDoc
      .mockResolvedValueOnce({
        content: JSON.stringify({
          version: 1,
          imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
          createdAt: "2026-06-25T10:00:00.000Z",
          updatedAt: "2026-06-26T10:00:00.000Z",
          images: [
            {
              imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
              createdAt: "2026-06-26T10:00:00.000Z",
              updatedAt: "2026-06-26T10:00:00.000Z",
            },
            {
              imageRef: "ghcr.io/alice/kody-brain-snapshot:old",
              createdAt: "2026-06-25T10:00:00.000Z",
              updatedAt: "2026-06-25T10:00:00.000Z",
            },
          ],
        }),
        sha: "sha",
      })
      .mockResolvedValueOnce({ sha: "sha", content: "{}" });
    state.writeBackendDoc.mockResolvedValue({ sha: "new-sha" });
    const { deleteBrainImage } = await import("@kody-ade/brain/store");

    await expect(
      deleteBrainImage(
        "Alice",
        "token",
        "ghcr.io/alice/kody-brain-snapshot:old",
      ),
    ).resolves.toMatchObject({
      imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
      images: [
        expect.objectContaining({
          imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
        }),
      ],
    });
    const content = JSON.parse(
      (state.writeBackendDoc.mock.calls[0]?.[0] as { content: string }).content,
    ) as { forgottenImageRefs?: string[] };
    expect(content.forgottenImageRefs).toBeUndefined();
  });

  it("does not create metadata when a deleted image was only discovered remotely", async () => {
    state.readBackendDoc
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    state.writeBackendDoc.mockResolvedValue({ sha: "new-sha" });
    const { deleteBrainImage } = await import("@kody-ade/brain/store");

    await expect(
      deleteBrainImage(
        "Alice",
        "token",
        "ghcr.io/alice/kody-brain-snapshot:discovered",
      ),
    ).resolves.toBeNull();
    expect(state.writeBackendDoc).not.toHaveBeenCalled();
  });

  it("marks a selected Brain image as running after apply succeeds", async () => {
    state.readBackendDoc
      .mockResolvedValueOnce({
        content: JSON.stringify({
          version: 1,
          imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
          createdAt: "2026-06-25T10:00:00.000Z",
          updatedAt: "2026-06-26T10:00:00.000Z",
          images: [
            {
              imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
              createdAt: "2026-06-26T10:00:00.000Z",
              updatedAt: "2026-06-26T10:00:00.000Z",
            },
          ],
        }),
        sha: "sha",
      })
      .mockResolvedValueOnce({ sha: "sha", content: "{}" });
    state.writeBackendDoc.mockResolvedValue({ sha: "new-sha" });
    const { markBrainImageRunning } = await import("@kody-ade/brain/store");

    await expect(
      markBrainImageRunning("Alice", "token", {
        imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
        app: "kody-brain-alice",
        machineId: "machine-new",
        runningAt: "2026-07-02T10:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
      runningImageRef: "ghcr.io/alice/kody-brain-snapshot:new",
      runningApp: "kody-brain-alice",
      runningMachineId: "machine-new",
    });

    const content = JSON.parse(
      (state.writeBackendDoc.mock.calls[0]?.[0] as { content: string }).content,
    ) as { runningImageRef?: string; runningMachineId?: string };
    expect(content.runningImageRef).toBe(
      "ghcr.io/alice/kody-brain-snapshot:new",
    );
    expect(content.runningMachineId).toBe("machine-new");
  });

  it("marks an applied saved Brain image as selected and running", async () => {
    state.readBackendDoc
      .mockResolvedValueOnce({
        content: JSON.stringify({
          version: 1,
          imageRef: "ghcr.io/alice/kody-brain-snapshot:old",
          createdAt: "2026-06-25T10:00:00.000Z",
          updatedAt: "2026-06-26T10:00:00.000Z",
          forgottenImageRefs: ["ghcr.io/alice/kody-brain-snapshot:new"],
          images: [
            {
              imageRef: "ghcr.io/alice/kody-brain-snapshot:old",
              createdAt: "2026-06-25T10:00:00.000Z",
              updatedAt: "2026-06-25T10:00:00.000Z",
            },
            {
              imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
              createdAt: "2026-06-26T10:00:00.000Z",
              updatedAt: "2026-06-26T10:00:00.000Z",
            },
          ],
        }),
        sha: "sha",
      })
      .mockResolvedValueOnce({ sha: "sha", content: "{}" });
    state.writeBackendDoc.mockResolvedValue({ sha: "new-sha" });
    const { markBrainImageRunning } = await import("@kody-ade/brain/store");

    await expect(
      markBrainImageRunning("Alice", "token", {
        imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
        app: "kody-brain-alice",
        machineId: "machine-new",
        runningAt: "2026-07-02T10:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      imageRef: "ghcr.io/alice/kody-brain-snapshot:new",
      runningImageRef: "ghcr.io/alice/kody-brain-snapshot:new",
    });

    const content = JSON.parse(
      (state.writeBackendDoc.mock.calls[0]?.[0] as { content: string }).content,
    ) as {
      imageRef?: string;
      runningImageRef?: string;
      forgottenImageRefs?: string[];
    };
    expect(content.imageRef).toBe("ghcr.io/alice/kody-brain-snapshot:new");
    expect(content.runningImageRef).toBe(
      "ghcr.io/alice/kody-brain-snapshot:new",
    );
    expect(content.forgottenImageRefs).toBeUndefined();
  });

  it("accepts GHCR image refs", async () => {
    const { writeBrainImage } = await import("@kody-ade/brain/store");

    state.readBackendDoc.mockResolvedValue(null);
    await expect(
      writeBrainImage("Alice", "token", {
        version: 1,
        imageRef: "ghcr.io/alice/kody-brain-snapshot:20260625",
        createdAt: "2026-06-25T10:00:00.000Z",
        updatedAt: "2026-06-25T10:00:00.000Z",
        images: [
          {
            imageRef: "ghcr.io/alice/kody-brain-snapshot:20260625",
            createdAt: "2026-06-25T10:00:00.000Z",
            updatedAt: "2026-06-25T10:00:00.000Z",
          },
        ],
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects non-GHCR image refs", async () => {
    const { writeBrainImage } = await import("@kody-ade/brain/store");

    await expect(
      writeBrainImage("Alice", "token", {
        version: 1,
        imageRef: "docker.io/alice/kody-brain-snapshot:latest",
        createdAt: "2026-06-25T10:00:00.000Z",
        updatedAt: "2026-06-25T10:00:00.000Z",
        images: [],
      }),
    ).rejects.toThrow("Invalid Brain image record");
    await expect(
      writeBrainImage("Alice", "token", {
        version: 1,
        imageRef: "registry.fly.io/kody-brain-alice:20260625",
        createdAt: "2026-06-25T10:00:00.000Z",
        updatedAt: "2026-06-25T10:00:00.000Z",
        images: [],
      }),
    ).rejects.toThrow("Invalid Brain image record");
    expect(state.writeBackendDoc).not.toHaveBeenCalled();
  });

  it("writes and clears an in-progress Brain image save job", async () => {
    state.readBackendDoc.mockResolvedValueOnce(null);
    state.writeBackendDoc.mockResolvedValue({ sha: "job-sha" });
    const { writeBrainImageSave, clearBrainImageSave } =
      await import("@kody-ade/brain/store");

    await writeBrainImageSave("Alice", "token", {
      version: 1,
      status: "running",
      phase: "pushing-image",
      message: "Pushing the Brain image to GHCR",
      lastOutput: "layer upload",
      jobId: "0123456789abcdef0123456789abcdef",
      app: "brain-1",
      machineId: "m123",
      bridgeApp: "kody-terminal-personal-abc123",
      orgSlug: "personal",
      defaultRegion: "fra",
      expectedImageRef: "ghcr.io/alice/kody-brain-snapshot:20260625",
      startedAt: "2026-06-25T10:00:00.000Z",
      updatedAt: "2026-06-25T10:00:00.000Z",
    });

    expect(state.writeBackendDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "users/alice/data/brain-image-save.json",
        message: "feat(brain): record brain image save job for Alice",
        scope: "root",
      }),
    );

    state.readBackendDoc.mockResolvedValueOnce({
      sha: "job-sha",
      content: "{}",
    });
    state.deleteBackendDoc.mockResolvedValueOnce(undefined);
    await clearBrainImageSave("Alice", "token");
    expect(state.deleteBackendDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "users/alice/data/brain-image-save.json",
        message: "feat(brain): clear brain image save job for Alice",
        scope: "root",
      }),
    );
  });
});
