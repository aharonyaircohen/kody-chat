import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const githubClient = vi.hoisted(() => ({
  createUserOctokit: vi.fn(() => ({ marker: "octokit" })),
}));

const backgroundToken = vi.hoisted(() => ({
  resolveBackgroundToken: vi.fn(
    async (): Promise<{ token: string; source: "app" } | null> => ({
      token: "ghs_app_token",
      source: "app" as const,
    }),
  ),
}));

const stateRepo = vi.hoisted(() => ({
  resolveStateRepo: vi.fn(async () => ({
    owner: "octo-state",
    repo: "kody-state",
    basePath: "repo",
    branch: "main",
  })),
  stateRepoPath: vi.fn((target: { basePath: string }, path: string) =>
    [target.basePath, path].filter(Boolean).join("/"),
  ),
}));
const backend = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("@dashboard/lib/github-client", () => ({
  createUserOctokit: githubClient.createUserOctokit,
}));

vi.mock("@kody-ade/base/auth/background-token", () => ({
  resolveBackgroundToken: backgroundToken.resolveBackgroundToken,
}));

vi.mock("@kody-ade/base/state-repo", () => ({
  resolveStateRepo: stateRepo.resolveStateRepo,
  stateRepoPath: stateRepo.stateRepoPath,
}));
vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => backend,
}));

import { GET } from "../../app/api/kody/views/[...path]/route";
import { STATE_BRANCH } from "@kody-ade/base/state-branch";
import { mintRepoViewToken } from "@dashboard/lib/view-token";

const ORIGINAL_MASTER_KEY = process.env.KODY_MASTER_KEY;

function mintTicket(viewId = "pdf-f7fef487"): string {
  return mintRepoViewToken({
    owner: "octo",
    repo: "repo",
    viewId,
    githubToken: "ghs_test_token",
    ttlSeconds: 60,
  }).token;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KODY_MASTER_KEY = "test-master-key";
  backend.query.mockResolvedValue(null);
});

afterEach(() => {
  if (ORIGINAL_MASTER_KEY) {
    process.env.KODY_MASTER_KEY = ORIGINAL_MASTER_KEY;
  } else {
    delete process.env.KODY_MASTER_KEY;
  }
  vi.restoreAllMocks();
});

describe("repo-backed view serving", () => {
  it("serves direct PDF URLs inline from Convex", async () => {
    const token = mintTicket();
    const pdf = Buffer.from("%PDF-1.4\nbody");
    backend.query.mockResolvedValue({
      doc: { files: { "-_-.pdf": pdf.toString("base64") } },
    });
    const req = new NextRequest(
      `http://localhost/api/kody/views/_t/${token}/pdf-f7fef487/-_-.pdf`,
    );

    const res = await GET(req, {
      params: Promise.resolve({
        path: ["_t", token, "pdf-f7fef487", "-_-.pdf"],
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'inline; filename="-_-.pdf"',
    );
    expect(Buffer.from(await res.arrayBuffer()).toString("utf8")).toBe(
      pdf.toString("utf8"),
    );
    expect(backend.query).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "octo/repo",
      kind: "views/pdf-f7fef487",
    });
  });

  it("falls back to the viewer token when no background token is available", async () => {
    backgroundToken.resolveBackgroundToken.mockResolvedValueOnce(null);
    const token = mintTicket("view-123");
    backend.query.mockResolvedValue({
      doc: {
        files: {
          "index.html": Buffer.from("<h1>ok</h1>").toString("base64"),
        },
      },
    });
    const req = new NextRequest(
      `http://localhost/api/kody/views/_t/${token}/view-123/index.html`,
    );

    const res = await GET(req, {
      params: Promise.resolve({
        path: ["_t", token, "view-123", "index.html"],
      }),
    });

    expect(res.status).toBe(200);
    expect(backend.query).toHaveBeenCalledOnce();
  });

  it("returns 404 when the state repo view file does not exist", async () => {
    const token = mintTicket("view-123");
    backend.query.mockResolvedValue(null);
    const req = new NextRequest(
      `http://localhost/api/kody/views/_t/${token}/view-123/index.html`,
    );

    const res = await GET(req, {
      params: Promise.resolve({
        path: ["_t", token, "view-123", "index.html"],
      }),
    });

    await expect(res.json()).resolves.toEqual({ error: "view_file_not_found" });
    expect(res.status).toBe(404);
  });
});
