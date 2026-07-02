/**
 * @fileoverview Unit coverage for explicit Brain image apply.
 * @testFramework vitest
 * @domain brain
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  markBrainImageRunning: vi.fn(),
  readBrainApp: vi.fn(),
  readBrainImage: vi.fn(),
  selectBrainImage: vi.fn(),
  writeBrainApp: vi.fn(),
}));

const runtimeManager = vi.hoisted(() => ({
  beginBrainRuntimeApply: vi.fn(async () => undefined),
  completeBrainRuntimeApply: vi.fn(async () => ({
    version: 1,
    desiredImageRef: "ghcr.io/acme/kody-brain-octocat:selected",
    running: {
      imageRef: "ghcr.io/acme/kody-brain-octocat:selected",
      app: "kody-brain-octocat",
      machineId: "machine-new",
      orgSlug: "personal",
      url: "https://kody-brain-octocat.fly.dev",
      appliedAt: "2026-07-02T00:00:00.000Z",
    },
    updatedAt: "2026-07-02T00:00:00.000Z",
  })),
  failBrainRuntimeApply: vi.fn(async () => undefined),
}));

const runtime = vi.hoisted(() => ({
  brainFlyRuntimeImageRef: vi.fn(
    ({ app, imageRef }: { app: string; imageRef: string }) =>
      `registry.fly.io/${app}:${imageRef.split(":").at(-1)}`,
  ),
  brainGhcrAuth: vi.fn(() => ({ token: "ghcr-token", user: "octocat" })),
  prepareBrainRuntimeImage: vi.fn(async () => undefined),
}));

const brainFly = vi.hoisted(() => ({
  provisionBrain: vi.fn(),
}));

vi.mock("@dashboard/lib/brain/store", () => store);
vi.mock("@dashboard/lib/brain/runtime-manager", () => runtimeManager);
vi.mock("@dashboard/lib/brain/image-runtime", () => runtime);
vi.mock("@dashboard/lib/runners/brain-fly", () => ({
  brainAppName: (account: string) => `kody-brain-${account}`,
  provisionBrain: brainFly.provisionBrain,
}));
vi.mock("@dashboard/lib/logger", () => ({
  logger: { warn: vi.fn() },
}));

import { applySelectedBrainImage } from "../../src/dashboard/lib/brain/image-apply";

describe("applySelectedBrainImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.readBrainApp.mockResolvedValue(null);
    store.readBrainImage.mockResolvedValue({
      version: 1,
      imageRef: "ghcr.io/acme/kody-brain-octocat:selected",
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
      images: [
        {
          imageRef: "ghcr.io/acme/kody-brain-octocat:selected",
          createdAt: "2026-07-02T00:00:00.000Z",
          updatedAt: "2026-07-02T00:00:00.000Z",
        },
      ],
    });
    brainFly.provisionBrain.mockResolvedValue({
      app: "kody-brain-octocat",
      url: "https://kody-brain-octocat.fly.dev",
      apiKey: "brain-key",
      machineId: "machine-new",
      region: "fra",
      org: "personal",
    });
    store.markBrainImageRunning.mockResolvedValue({
      version: 1,
      imageRef: "ghcr.io/acme/kody-brain-octocat:selected",
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
      images: [],
    });
    store.selectBrainImage.mockResolvedValue({
      version: 1,
      imageRef: "ghcr.io/acme/kody-brain-octocat:selected",
      runningImageRef: "ghcr.io/acme/kody-brain-octocat:selected",
      runningApp: "kody-brain-octocat",
      runningMachineId: "machine-new",
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
      images: [],
    });
    store.writeBrainApp.mockResolvedValue(undefined);
  });

  it("applies the selected image and records it as running", async () => {
    const result = await applySelectedBrainImage({
      owner: "acme",
      repo: "widgets",
      account: "octocat",
      githubToken: "gh-token",
      allSecrets: {},
      flyToken: "fly-token",
      flyOrgSlug: "personal",
      flyDefaultRegion: "fra",
      dashboardUrl: "https://dash.test",
    });

    expect(brainFly.provisionBrain).toHaveBeenCalledWith(
      expect.objectContaining({
        flyToken: "fly-token",
        account: "octocat",
        appNameOverride: "kody-brain-octocat",
        imageRef: "ghcr.io/acme/kody-brain-octocat:selected",
      }),
    );
    const provisionInput = brainFly.provisionBrain.mock.calls[0]?.[0] as {
      prepareRuntimeImage: (input: {
        app: string;
        sourceImageRef: string;
        runtimeImageRef: string;
      }) => Promise<void>;
    };
    await provisionInput.prepareRuntimeImage({
      app: "kody-brain-octocat",
      sourceImageRef: "ghcr.io/acme/kody-brain-octocat:selected",
      runtimeImageRef: "registry.fly.io/kody-brain-octocat:selected",
    });
    expect(runtime.prepareBrainRuntimeImage).toHaveBeenCalledWith(
      expect.objectContaining({
        imageRef: "ghcr.io/acme/kody-brain-octocat:selected",
        runtimeImageRef: "registry.fly.io/kody-brain-octocat:selected",
        flyToken: "fly-token",
        ghcrToken: "ghcr-token",
      }),
    );
    expect(runtimeManager.beginBrainRuntimeApply).toHaveBeenCalledWith(
      "octocat",
      "gh-token",
      "ghcr.io/acme/kody-brain-octocat:selected",
    );
    expect(store.selectBrainImage).toHaveBeenCalledWith(
      "octocat",
      "gh-token",
      "ghcr.io/acme/kody-brain-octocat:selected",
    );
    expect(runtimeManager.completeBrainRuntimeApply).toHaveBeenCalledWith(
      "octocat",
      "gh-token",
      expect.objectContaining({
        imageRef: "ghcr.io/acme/kody-brain-octocat:selected",
        app: "kody-brain-octocat",
        machineId: "machine-new",
        orgSlug: "personal",
      }),
    );
    expect(result.runtime.running?.imageRef).toBe(
      "ghcr.io/acme/kody-brain-octocat:selected",
    );
  });

  it("applies an explicitly requested saved image without requiring it to be selected first", async () => {
    store.readBrainImage.mockResolvedValueOnce({
      version: 1,
      imageRef: "ghcr.io/acme/kody-brain-octocat:old",
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
      images: [
        {
          imageRef: "ghcr.io/acme/kody-brain-octocat:old",
          createdAt: "2026-07-02T00:00:00.000Z",
          updatedAt: "2026-07-02T00:00:00.000Z",
        },
        {
          imageRef: "ghcr.io/acme/kody-brain-octocat:new",
          createdAt: "2026-07-02T01:00:00.000Z",
          updatedAt: "2026-07-02T01:00:00.000Z",
        },
      ],
    });
    store.selectBrainImage.mockResolvedValueOnce({
      version: 1,
      imageRef: "ghcr.io/acme/kody-brain-octocat:new",
      runningImageRef: "ghcr.io/acme/kody-brain-octocat:new",
      runningApp: "kody-brain-octocat",
      runningMachineId: "machine-new",
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T01:00:00.000Z",
      images: [],
    });

    const result = await applySelectedBrainImage({
      owner: "acme",
      repo: "widgets",
      account: "octocat",
      githubToken: "gh-token",
      allSecrets: {},
      flyToken: "fly-token",
      flyOrgSlug: "personal",
      flyDefaultRegion: "fra",
      dashboardUrl: "https://dash.test",
      imageRef: "ghcr.io/acme/kody-brain-octocat:new",
    });

    expect(brainFly.provisionBrain).toHaveBeenCalledWith(
      expect.objectContaining({
        imageRef: "ghcr.io/acme/kody-brain-octocat:new",
      }),
    );
    expect(store.selectBrainImage).toHaveBeenCalledWith(
      "octocat",
      "gh-token",
      "ghcr.io/acme/kody-brain-octocat:new",
    );
    expect(result.image.imageRef).toBe("ghcr.io/acme/kody-brain-octocat:new");
  });
});
