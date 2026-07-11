import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireKodyAuth: vi.fn(async () => null),
  getRequestAuth: vi.fn(() => ({
    token: "ghp_viewer",
    owner: "acme",
    repo: "widgets",
  })),
  getUserOctokit: vi.fn(async () => ({ marker: "viewer-octokit" })),
}));

const stateRepo = vi.hoisted(() => ({
  deleteStateDirectory: vi.fn(async () => ({ deleted: 2 })),
  resolveStateRepo: vi.fn(),
  stateRepoPath: vi.fn(),
  writeStateBase64Files: vi.fn(async () => ({
    sha: "commit-sha",
    branch: "main",
    target: { owner: "octo-state", repo: "kody-state", basePath: "widgets" },
  })),
}));

vi.mock("@kody-ade/base/auth", () => ({
  requireKodyAuth: auth.requireKodyAuth,
  getRequestAuth: auth.getRequestAuth,
  getUserOctokit: auth.getUserOctokit,
}));

vi.mock("@kody-ade/base/state-repo", () => ({
  deleteStateDirectory: stateRepo.deleteStateDirectory,
  resolveStateRepo: stateRepo.resolveStateRepo,
  stateRepoPath: stateRepo.stateRepoPath,
  writeStateBase64Files: stateRepo.writeStateBase64Files,
}));

vi.mock("@dashboard/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { DELETE, POST } from "../../app/api/kody/views/route";

beforeEach(() => {
  vi.clearAllMocks();
  stateRepo.stateRepoPath.mockImplementation(
    (target: { basePath: string }, path: string) =>
      [target.basePath, path].filter(Boolean).join("/"),
  );
});

describe("POST /api/kody/views", () => {
  it("writes uploaded view files to the state branch", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File(["<h1>Hello</h1>"], "hello.html", { type: "text/html" }),
    );

    const res = await POST(
      new NextRequest("http://localhost/api/kody/views", {
        method: "POST",
        body: form,
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      url: string;
      repoPath: string;
      entryPath: string;
      htmlUrl: string;
      sourceHtmlUrl: string;
    };
    expect(body.url).toMatch(
      /^\/api\/kody\/views\/hello-html-[a-f0-9]{8}\/index\.html$/,
    );
    expect(body.repoPath).toMatch(/^views\/hello-html-[a-f0-9]{8}$/);
    expect(body.entryPath).toBe("index.html");
    expect(body.htmlUrl).toMatch(
      /^https:\/\/github\.com\/octo-state\/kody-state\/tree\/main\/widgets\/views\/hello-html-[a-f0-9]{8}$/,
    );
    expect(body.sourceHtmlUrl).toMatch(
      /^https:\/\/github\.com\/octo-state\/kody-state\/blob\/main\/widgets\/views\/hello-html-[a-f0-9]{8}\/index\.html$/,
    );
    expect(stateRepo.writeStateBase64Files).toHaveBeenCalledWith({
      octokit: { marker: "viewer-octokit" },
      owner: "acme",
      repo: "widgets",
      message: expect.stringMatching(
        /^chore\(dashboard\): add static view hello-html-[a-f0-9]{8}$/,
      ),
      files: [
        {
          path: expect.stringMatching(
            /^views\/hello-html-[a-f0-9]{8}\/index\.html$/,
          ),
          contentBase64: Buffer.from("<h1>Hello</h1>").toString("base64"),
        },
      ],
    });
  });
});

describe("DELETE /api/kody/views", () => {
  it("deletes the repo-backed view folder from the configured state repo", async () => {
    const res = await DELETE(
      new NextRequest("http://localhost/api/kody/views?view=mobile-html-1234", {
        method: "DELETE",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, deleted: 2 });
    expect(stateRepo.deleteStateDirectory).toHaveBeenCalledWith({
      octokit: { marker: "viewer-octokit" },
      owner: "acme",
      repo: "widgets",
      path: "views/mobile-html-1234",
      message: "chore(dashboard): remove static view mobile-html-1234",
    });
  });

  it("rejects unsafe view ids", async () => {
    const res = await DELETE(
      new NextRequest("http://localhost/api/kody/views?view=../bad", {
        method: "DELETE",
      }),
    );

    expect(res.status).toBe(400);
    expect(stateRepo.deleteStateDirectory).not.toHaveBeenCalled();
  });
});
