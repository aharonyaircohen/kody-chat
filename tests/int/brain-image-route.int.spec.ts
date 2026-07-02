/**
 * @fileoverview Integration coverage for Brain image save route start.
 * @testFramework vitest
 * @domain brain
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readImage: vi.fn(),
  readSave: vi.fn(),
  selectImage: vi.fn(),
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
  deleteBrainImage: vi.fn(async () => null),
  readBrainImage: mocks.readImage,
  readBrainImageSave: mocks.readSave,
  selectBrainImage: mocks.selectImage,
  writeBrainImage: vi.fn(async () => undefined),
  writeBrainImageSave: mocks.writeSave,
  clearBrainImageSave: vi.fn(async () => undefined),
}));

vi.mock("@dashboard/lib/brain/image-runtime", () => ({
  brainGhcrAuth: vi.fn(() => ({ token: "ghcr-token", user: "aguyaharonyair" })),
}));

import { GET, PATCH, POST } from "../../app/api/kody/brain/image/route";

function request(
  method: "GET" | "PATCH" | "POST" = "POST",
  url = "https://dash.test/api/kody/brain/image",
  body: unknown = { app: "stale-app", machineId: "stale-machine" },
): NextRequest {
  return new NextRequest(url, {
    method,
    body:
      method === "POST" || method === "PATCH" ? JSON.stringify(body) : undefined,
  });
}

describe("GET /api/kody/brain/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readSave.mockResolvedValue(null);
    mocks.readImage.mockResolvedValue({
      version: 1,
      imageRef:
        "ghcr.io/a-guy-educ/kody-brain-aguyaharonyair:brain-20260702-101010",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-07-02T10:10:10.000Z",
      images: [
        {
          imageRef:
            "ghcr.io/a-guy-educ/kody-brain-aguyaharonyair:brain-20260702-101010",
          createdAt: "2026-06-30T00:00:00.000Z",
          updatedAt: "2026-07-02T10:10:10.000Z",
        },
      ],
    });
  });

  it("includes historical Brain image tags from the GHCR package", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify([
            {
              created_at: "2026-07-02T10:10:10.000Z",
              updated_at: "2026-07-02T10:10:10.000Z",
              metadata: {
                container: {
                  tags: ["brain-20260702-101010", "brain-20260701-090000"],
                },
              },
            },
          ]),
          { status: 200 },
        );
      }),
    );

    const res = await GET(request("GET"));
    const body = (await res.json()) as {
      images?: Array<{ imageRef: string }>;
    };

    expect(res.status).toBe(200);
    expect(body.images?.map((image) => image.imageRef)).toEqual([
      "ghcr.io/a-guy-educ/kody-brain-aguyaharonyair:brain-20260702-101010",
      "ghcr.io/a-guy-educ/kody-brain-aguyaharonyair:brain-20260701-090000",
    ]);
  });
});

describe("PATCH /api/kody/brain/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readImage.mockResolvedValue({
      version: 1,
      imageRef: "ghcr.io/a-guy-educ/kody-brain-aguyaharonyair:old",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-07-02T10:10:10.000Z",
      images: [
        {
          imageRef: "ghcr.io/a-guy-educ/kody-brain-aguyaharonyair:old",
          createdAt: "2026-06-30T00:00:00.000Z",
          updatedAt: "2026-07-02T10:10:10.000Z",
        },
        {
          imageRef: "ghcr.io/a-guy-educ/kody-brain-aguyaharonyair:selected",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    });
    mocks.selectImage.mockResolvedValue({
      version: 1,
      imageRef: "ghcr.io/a-guy-educ/kody-brain-aguyaharonyair:selected",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-07-02T10:10:10.000Z",
      images: [
        {
          imageRef: "ghcr.io/a-guy-educ/kody-brain-aguyaharonyair:selected",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-02T10:10:10.000Z",
        },
      ],
    });
  });

  it("only changes the active image metadata", async () => {
    const res = await PATCH(
      request("PATCH", "https://dash.test/api/kody/brain/image", {
        imageRef: "ghcr.io/a-guy-educ/kody-brain-aguyaharonyair:selected",
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.selectImage).toHaveBeenCalledWith(
      "aguyaharonyair",
      "gh-token",
      "ghcr.io/a-guy-educ/kody-brain-aguyaharonyair:selected",
    );
    expect(mocks.startJob).not.toHaveBeenCalled();
  });
});

describe("POST /api/kody/brain/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readImage.mockResolvedValue(null);
    mocks.readSave.mockResolvedValue(null);
    mocks.selectImage.mockResolvedValue({
      version: 1,
      imageRef: "ghcr.io/a-guy-educ/kody-brain-aguyaharonyair:selected",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
      images: [],
    });
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
