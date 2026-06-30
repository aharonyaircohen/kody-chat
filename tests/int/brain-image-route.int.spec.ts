/**
 * @fileoverview Integration coverage for Brain image save route start.
 * @testFramework vitest
 * @domain brain
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startJob: vi.fn(),
  writeSave: vi.fn(),
}));

vi.mock("@dashboard/lib/auth", () => ({
  requireKodyAuth: vi.fn(async () => null),
}));

vi.mock("@dashboard/lib/runners/fly-context", () => ({
  resolveFlyContext: vi.fn(async () => ({
    ok: true,
    context: {
      owner: "A-Guy-educ",
      repo: "A-Guy-Web",
      account: "aguyaharonyair",
      githubToken: "gh-token",
      flyToken: "fly-token",
      flyOrgSlug: "personal",
      flyDefaultRegion: "fra",
      allSecrets: {},
      engineModel: undefined,
    },
  })),
}));

vi.mock("@dashboard/lib/github-client", () => ({
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
}));

vi.mock("@dashboard/lib/brain/service-resolver", () => ({
  resolveBrainService: vi.fn(async () => ({
    app: "brain-1",
    orgSlug: "guy-koren",
    defaultRegion: "fra",
    state: "running",
    url: "https://brain-1.fly.dev",
    machineId: "machine-1",
    stored: null,
  })),
}));

vi.mock("@dashboard/lib/runners/brain-fly", () => ({
  DEFAULT_IMAGE: "ghcr.io/aharonyaircohen/kody-brain:latest",
  waitForBrainHealth: vi.fn(async () => undefined),
}));

vi.mock("@dashboard/lib/terminal/bridge-fly", () => ({
  ensureTerminalBridge: vi.fn(async () => ({
    app: "kody-terminal-guy-koren",
    url: "https://bridge.test",
    machineId: "bridge-1",
    secret: "bridge-secret",
  })),
}));

vi.mock("@dashboard/lib/terminal/bridge-exec-client", () => ({
  startTerminalBridgeLocalExecJob: mocks.startJob,
  getTerminalBridgeExecJob: vi.fn(),
}));

vi.mock("@dashboard/lib/brain/store", () => ({
  readBrainImage: vi.fn(async () => null),
  readBrainImageSave: vi.fn(async () => null),
  writeBrainImage: vi.fn(async () => undefined),
  writeBrainImageSave: mocks.writeSave,
  clearBrainImageSave: vi.fn(async () => undefined),
}));

vi.mock("@dashboard/lib/brain/image-runtime", () => ({
  brainGhcrAuth: vi.fn(() => ({ token: "ghcr-token", user: "aguyaharonyair" })),
}));

import { POST } from "../../app/api/kody/brain/image/route";

function request(): NextRequest {
  return new NextRequest("https://dash.test/api/kody/brain/image", {
    method: "POST",
    body: JSON.stringify({ app: "stale-app", machineId: "stale-machine" }),
  });
}

describe("POST /api/kody/brain/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startJob.mockResolvedValue({
      id: "job-1",
      status: "running",
      startedAt: "2026-06-30T00:00:00.000Z",
      finishedAt: null,
      code: null,
      stdout: "",
      stderr: "",
      error: null,
    });
  });

  it("starts a save job against the resolved Brain org, not stale client input", async () => {
    const res = await POST(request());
    const body = (await res.json()) as { status?: string; jobId?: string };

    expect(res.status).toBe(202);
    expect(body).toMatchObject({ status: "running", jobId: "job-1" });
    const command = mocks.startJob.mock.calls[0]?.[0]?.command as string;
    expect(command).toContain("app='\\''brain-1'\\''");
    expect(command).toContain("machine='\\''machine-1'\\''");
    expect(command).toContain("org='\\''guy-koren'\\''");
    expect(command).toContain('--org "$org"');
    expect(command).not.toContain("stale-app");
    expect(command).not.toContain("stale-machine");
    expect(mocks.writeSave).toHaveBeenCalledWith(
      "aguyaharonyair",
      "gh-token",
      expect.objectContaining({
        status: "running",
        jobId: "job-1",
        app: "brain-1",
        machineId: "machine-1",
        orgSlug: "guy-koren",
      }),
    );
  });
});
