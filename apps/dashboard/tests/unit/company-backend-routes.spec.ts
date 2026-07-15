import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireKodyAuth: vi.fn(async () => null),
  getRequestAuth: vi.fn(() => ({
    token: "ghp_test",
    owner: "acme",
    repo: "widgets",
  })),
  getUserOctokit: vi.fn(),
  verifyActorLogin: vi.fn(async () => ({
    identity: { login: "alice", avatar_url: "u", githubId: 1 },
  })),
}));

const githubClient = vi.hoisted(() => ({
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
}));

const stateRepo = vi.hoisted(() => ({
  listStateDirectory: vi.fn(),
  readStateText: vi.fn(),
}));

const convex = vi.hoisted(() => {
  const mutation = vi.fn(
    async (_ref: unknown, _args: Record<string, unknown>) => null,
  );
  return {
    mutation,
    ConvexHttpClient: vi.fn(function ConvexHttpClient() {
      return { mutation };
    }),
  };
});

vi.mock("@kody-ade/base/auth", () => ({
  requireKodyAuth: auth.requireKodyAuth,
  getRequestAuth: auth.getRequestAuth,
  getUserOctokit: auth.getUserOctokit,
  verifyActorLogin: auth.verifyActorLogin,
}));

vi.mock("@dashboard/lib/github-client", () => ({
  setGitHubContext: githubClient.setGitHubContext,
  clearGitHubContext: githubClient.clearGitHubContext,
}));

vi.mock("@kody-ade/base/state-repo", () => ({
  listStateDirectory: stateRepo.listStateDirectory,
  readStateText: stateRepo.readStateText,
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: convex.ConvexHttpClient,
}));

import { GET as EXPORT } from "../../app/api/kody/company/backend/export/route";
import { POST as IMPORT } from "../../app/api/kody/company/backend/import/route";

function req(path: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(`https://dash.test${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      "x-kody-token": "ghp_test",
      "x-kody-owner": "acme",
      "x-kody-repo": "widgets",
    },
  });
}

const notFound = () => Object.assign(new Error("Not Found"), { status: 404 });

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireKodyAuth.mockResolvedValue(null);
  auth.getRequestAuth.mockReturnValue({
    token: "ghp_test",
    owner: "acme",
    repo: "widgets",
  });
  auth.getUserOctokit.mockResolvedValue({} as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/kody/company/backend/export", () => {
  it("exports mapped state files keyed by table and counts skipped ones", async () => {
    stateRepo.listStateDirectory.mockImplementation(
      async (_o: unknown, _ow: string, _r: string, dir: string) => {
        if (dir === "workflows") {
          return {
            targetPath: dir,
            entries: [{ name: "bug", path: "workflows/bug", type: "dir" }],
          };
        }
        if (dir === "workflows/bug") {
          return {
            targetPath: dir,
            entries: [
              {
                name: "workflow.json",
                path: "workflows/bug/workflow.json",
                type: "file",
              },
              {
                name: "notes.txt",
                path: "workflows/bug/notes.txt",
                type: "file",
              },
            ],
          };
        }
        if (dir === "todos") {
          return {
            targetPath: dir,
            entries: [
              { name: "goal-1.json", path: "todos/goal-1.json", type: "file" },
            ],
          };
        }
        throw notFound();
      },
    );
    stateRepo.readStateText.mockImplementation(
      async (_o: unknown, _ow: string, _r: string, path: string) => {
        if (path === "workflows/bug/workflow.json") {
          return {
            path,
            content: JSON.stringify({
              name: "bug",
              updatedAt: "2026-01-01T00:00:00.000Z",
            }),
          };
        }
        if (path === "workflows/bug/notes.txt") {
          return { path, content: "unmapped" };
        }
        if (path === "todos/goal-1.json") {
          return { path, content: JSON.stringify({ title: "Ship it" }) };
        }
        return null;
      },
    );

    const res = await EXPORT(req("/api/kody/company/backend/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");

    const body = await res.json();
    expect(body.version).toBe(1);
    expect(body.tenantId).toBe("acme/widgets");
    expect(body.skipped).toBe(1);
    expect(body.failures).toEqual([]);
    expect(body.tables.workflows).toEqual([
      expect.objectContaining({
        tenantId: "acme/widgets",
        workflowId: "bug",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);
    expect(body.tables.goals).toEqual([
      expect.objectContaining({ tenantId: "acme/widgets", goalId: "goal-1" }),
    ]);
    expect(githubClient.clearGitHubContext).toHaveBeenCalled();
  });

  it("returns the auth failure response when auth is rejected", async () => {
    const denied = NextResponse.json({ error: "unauthorized" }, { status: 401 });
    auth.requireKodyAuth.mockResolvedValue(denied as never);

    const res = await EXPORT(req("/api/kody/company/backend/export"));
    expect(res.status).toBe(401);
    expect(stateRepo.listStateDirectory).not.toHaveBeenCalled();
  });

  it("returns 400 without repo context headers", async () => {
    auth.getRequestAuth.mockReturnValue(null as never);
    const res = await EXPORT(req("/api/kody/company/backend/export"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("no_repo_context");
  });
});

describe("POST /api/kody/company/backend/import", () => {
  const dump = {
    version: 1,
    tenantId: "acme/widgets",
    tables: {
      workflows: [{ tenantId: "acme/widgets", workflowId: "bug" }],
      goals: Array.from({ length: 250 }, (_, i) => ({
        tenantId: "acme/widgets",
        goalId: `goal-${i}`,
      })),
    },
  };

  it("imports each table in chunks and reports counts", async () => {
    vi.stubEnv("CONVEX_URL", "https://demo.convex.cloud");

    const res = await IMPORT(
      req("/api/kody/company/backend/import", "POST", {
        ...dump,
        clearFirst: true,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      cleared: true,
      imported: { workflows: 1, goals: 250 },
    });

    // clearRepo + 1 workflows chunk + 2 goals chunks (250 docs, size 200)
    expect(convex.mutation).toHaveBeenCalledTimes(4);
    expect(convex.mutation.mock.calls[0][1]).toEqual({
      tenantId: "acme/widgets",
    });
    const goalChunks = convex.mutation.mock.calls
      .slice(1)
      .filter((call) => (call[1] as { table: string }).table === "goals")
      .map((call) => (call[1] as { docs: unknown[] }).docs.length);
    expect(goalChunks).toEqual([200, 50]);
  });

  it("skips clearRepo when clearFirst is not set", async () => {
    vi.stubEnv("CONVEX_URL", "https://demo.convex.cloud");

    const res = await IMPORT(
      req("/api/kody/company/backend/import", "POST", {
        ...dump,
        tables: { workflows: dump.tables.workflows },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).cleared).toBe(false);
    expect(convex.mutation).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when CONVEX_URL is not configured", async () => {
    vi.stubEnv("CONVEX_URL", "");

    const res = await IMPORT(
      req("/api/kody/company/backend/import", "POST", dump),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("convex_url_not_configured");
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body", async () => {
    vi.stubEnv("CONVEX_URL", "https://demo.convex.cloud");

    const res = await IMPORT(
      req("/api/kody/company/backend/import", "POST", {
        version: 2,
        tables: "nope",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_body");
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  it("returns the auth failure response when auth is rejected", async () => {
    const denied = NextResponse.json({ error: "unauthorized" }, { status: 401 });
    auth.requireKodyAuth.mockResolvedValue(denied as never);

    const res = await IMPORT(
      req("/api/kody/company/backend/import", "POST", dump),
    );
    expect(res.status).toBe(401);
    expect(convex.mutation).not.toHaveBeenCalled();
  });
});
