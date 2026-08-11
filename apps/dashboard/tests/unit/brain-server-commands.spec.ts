/**
 * @fileoverview Unit coverage for Brain lifecycle command persistence.
 * @testFramework vitest
 * @domain brain
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlyContext } from "@kody-ade/fly/plugin/runners/context";

const store = vi.hoisted(() => ({
  clearBrainApp: vi.fn(async () => undefined),
  readBrainApp: vi.fn(async () => null),
  writeBrainApp: vi.fn(async () => undefined),
}));

const runtimeManager = vi.hoisted(() => ({
  clearBrainRuntimeDeployment: vi.fn(async () => undefined),
}));

const terminalBridge = vi.hoisted(() => ({
  ensureServerProviderTerminalBridge: vi.fn(async () => ({
    app: "kody-terminal",
    url: "https://kody-terminal.fly.dev",
    secret: "bridge-secret",
  })),
}));

const brainFly = vi.hoisted(() => ({
  destroyBrain: vi.fn(async () => undefined),
  isBrainFlyProvisionTransientError: vi.fn(() => false),
  provisionBrain: vi.fn(async () => ({
    app: "kody-brain-octocat",
    url: "https://kody-brain-octocat.fly.dev",
    apiKey: "brain-key",
    machineId: "machine-1",
    region: "fra",
    org: "personal",
  })),
  resumeBrain: vi.fn(async () => undefined),
  suspendBrain: vi.fn(async () => undefined),
  updateBrainSuspension: vi.fn(async () => ({
    app: "kody-brain-octocat",
    machineId: "machine-1",
    suspendOnIdle: true,
  })),
}));

vi.mock("@kody-ade/brain/store", () => store);
vi.mock("@kody-ade/brain/runtime-manager", () => runtimeManager);
vi.mock("@kody-ade/fly/infrastructure/server-terminal", () => terminalBridge);
vi.mock("@kody-ade/fly/plugin/runners/brain", () => ({
  ...brainFly,
  brainAppName: (account: string) => `kody-brain-${account}`,
}));
vi.mock("@kody-ade/brain/service-resolver", () => ({
  resolveBrainService: vi.fn(async () => ({
    app: "kody-brain-octocat",
    orgSlug: "personal",
    defaultRegion: "fra",
    flyToken: "fly-token",
    stored: null,
    state: "running",
    url: "https://kody-brain-octocat.fly.dev",
    machineId: "machine-1",
  })),
}));
vi.mock("@kody-ade/base/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import { manageBrainServer } from "@kody-ade/brain/server-commands";

const context: FlyContext = {
  owner: "acme",
  repo: "widgets",
  account: "octocat",
  engineModel: undefined,
  engineModelConfig: undefined,
  githubToken: "gh-token",
  octokit: {} as FlyContext["octokit"],
  flyToken: "fly-token",
  flyOrgSlug: "personal",
  flyDefaultRegion: "fra",
  providerTokenSource: "repo-vault",
  allSecrets: {},
  perfTier: undefined,
};

describe("manageBrainServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clearBrainApp.mockResolvedValue(undefined);
    store.readBrainApp.mockResolvedValue(null);
    store.writeBrainApp.mockResolvedValue(undefined);
    runtimeManager.clearBrainRuntimeDeployment.mockResolvedValue(undefined);
  });

  it("does not report provision success when the Brain app record cannot be saved", async () => {
    store.writeBrainApp.mockRejectedValueOnce(new Error("backend down"));

    await expect(
      manageBrainServer({ command: "provision", context }),
    ).rejects.toThrow("backend down");

    expect(brainFly.provisionBrain).toHaveBeenCalled();
    expect(store.writeBrainApp).toHaveBeenCalled();
  });

  it("does not report destroy success when the stored Brain record cannot be cleared", async () => {
    store.clearBrainApp.mockRejectedValueOnce(new Error("backend down"));

    await expect(
      manageBrainServer({ command: "destroy", context }),
    ).rejects.toThrow("backend down");

    expect(brainFly.destroyBrain).toHaveBeenCalled();
    expect(runtimeManager.clearBrainRuntimeDeployment).toHaveBeenCalledWith(
      "octocat",
      "gh-token",
    );
    expect(store.clearBrainApp).toHaveBeenCalled();
  });

  it("clears the running runtime after Fly destroys the Brain", async () => {
    await expect(
      manageBrainServer({ command: "destroy", context }),
    ).resolves.toEqual({ ok: true });

    expect(brainFly.destroyBrain).toHaveBeenCalled();
    expect(runtimeManager.clearBrainRuntimeDeployment).toHaveBeenCalledWith(
      "octocat",
      "gh-token",
    );
    expect(store.clearBrainApp).toHaveBeenCalled();
  });

  it("upgrades an existing Brain explicitly before installing its terminal gateway", async () => {
    await expect(
      manageBrainServer({ command: "setup-terminal", context }),
    ).resolves.toMatchObject({
      ok: true,
      app: "kody-brain-octocat",
      machineId: "machine-1",
      bridgeApp: "kody-terminal",
    });

    expect(brainFly.provisionBrain).toHaveBeenCalledWith(
      expect.objectContaining({
        providerToken: "fly-token",
        appNameOverride: "kody-brain-octocat",
        replaceExistingMachine: true,
      }),
    );
    expect(terminalBridge.ensureServerProviderTerminalBridge).toHaveBeenCalledWith({
      token: "fly-token",
      orgSlug: "personal",
      defaultRegion: "fra",
    });
    expect(
      brainFly.provisionBrain.mock.invocationCallOrder[0],
    ).toBeLessThan(
      terminalBridge.ensureServerProviderTerminalBridge.mock.invocationCallOrder[0],
    );
  });

  it("does not couple ordinary Brain provisioning to terminal gateway setup", async () => {
    await manageBrainServer({ command: "provision", context });

    expect(terminalBridge.ensureServerProviderTerminalBridge).not.toHaveBeenCalled();
  });
});
