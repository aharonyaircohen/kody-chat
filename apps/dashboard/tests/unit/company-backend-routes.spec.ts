import { gzipSync } from "node:zlib";

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
  resolveStateRepo: vi.fn(),
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
  resolveStateRepo: stateRepo.resolveStateRepo,
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

/** Build one 512-byte ustar header + padded content for a regular file. */
function tarFile(name: string, content: string): Buffer {
  const body = Buffer.from(content, "utf8");
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "utf8"); // mode
  header.write("0000000\0", 108, 8, "utf8"); // uid
  header.write("0000000\0", 116, 8, "utf8"); // gid
  header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12);
  header.write("00000000000\0", 136, 12, "utf8"); // mtime
  header.write("        ", 148, 8, "utf8"); // checksum placeholder
  header.write("0", 156, 1, "utf8"); // typeflag: regular file
  header.write("ustar\0", 257, 6, "utf8");
  header.write("00", 263, 2, "utf8");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding]);
}

/** Build a gzipped tarball like GitHub's downloadTarballArchive returns. */
function tarball(files: Record<string, string>): ArrayBuffer {
  const blocks = Object.entries(files).map(([name, content]) =>
    tarFile(name, content),
  );
  const gz = gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
  return gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength);
}

function octokitWithTarball(data: ArrayBuffer) {
  return {
    rest: {
      repos: {
        downloadTarballArchive: vi.fn(async () => ({ data })),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  convex.mutation.mockImplementation(async () => null);
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
  it("exports mapped state files from one tarball download and counts skipped ones", async () => {
    stateRepo.resolveStateRepo.mockResolvedValue({
      owner: "acme",
      repo: "kody-state",
      basePath: "widgets",
      branch: "main",
    });
    const octokit = octokitWithTarball(
      tarball({
        // Files for this tenant live under `<basePath>/…`.
        "acme-kody-state-abc123/widgets/workflows/bug/workflow.json":
          JSON.stringify({
            name: "bug",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
        "acme-kody-state-abc123/widgets/workflows/bug/notes.txt": "unmapped",
        "acme-kody-state-abc123/widgets/todos/goal-1.json": JSON.stringify({
          title: "Ship it",
        }),
        // Outside the tenant prefix — must be ignored entirely.
        "acme-kody-state-abc123/other-tenant/todos/goal-9.json":
          JSON.stringify({ title: "Not ours" }),
        "acme-kody-state-abc123/README.md": "state repo readme",
      }),
    );
    auth.getUserOctokit.mockResolvedValue(octokit as never);

    const res = await EXPORT(req("/api/kody/company/backend/export"));
    expect(octokit.rest.repos.downloadTarballArchive).toHaveBeenCalledTimes(1);
    expect(octokit.rest.repos.downloadTarballArchive).toHaveBeenCalledWith({
      owner: "acme",
      repo: "kody-state",
      ref: "main",
    });
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
    expect(stateRepo.resolveStateRepo).not.toHaveBeenCalled();
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

    // clearRepo + 1 workflows chunk + 5 goals chunks (250 docs, size 50)
    expect(convex.mutation).toHaveBeenCalledTimes(7);
    expect(convex.mutation.mock.calls[0][1]).toEqual({
      tenantId: "acme/widgets",
    });
    const goalChunks = convex.mutation.mock.calls
      .slice(1)
      .filter((call) => (call[1] as { table: string }).table === "goals")
      .map((call) => (call[1] as { docs: unknown[] }).docs.length);
    expect(goalChunks).toEqual([50, 50, 50, 50, 50]);
  });

  it("retries a chunk when Convex throttles writes, then succeeds", async () => {
    vi.stubEnv("CONVEX_URL", "https://demo.convex.cloud");
    convex.mutation
      .mockRejectedValueOnce(new Error('{"code":"TooManyWrites","message":"Too many writes per second."}'))
      .mockRejectedValueOnce(new Error('{"code":"TooManyWrites","message":"Too many writes per second."}'));

    const res = await IMPORT(
      req("/api/kody/company/backend/import", "POST", {
        ...dump,
        tables: { workflows: dump.tables.workflows },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).imported).toEqual({ workflows: 1 });
    // 2 throttled attempts + 1 success for the single chunk
    expect(convex.mutation).toHaveBeenCalledTimes(3);
  });

  it("gives up after exhausting retries on persistent throttling", async () => {
    vi.stubEnv("CONVEX_URL", "https://demo.convex.cloud");
    convex.mutation.mockRejectedValue(
      new Error('{"code":"TooManyWrites","message":"Too many writes per second."}'),
    );

    const res = await IMPORT(
      req("/api/kody/company/backend/import", "POST", {
        ...dump,
        tables: { workflows: dump.tables.workflows },
      }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toContain("TooManyWrites");
    // initial attempt + MAX_RETRIES (5)
    expect(convex.mutation).toHaveBeenCalledTimes(6);
  });

  it("does not retry non-throttle errors", async () => {
    vi.stubEnv("CONVEX_URL", "https://demo.convex.cloud");
    convex.mutation.mockRejectedValue(new Error("schema validation failed"));

    const res = await IMPORT(
      req("/api/kody/company/backend/import", "POST", {
        ...dump,
        tables: { workflows: dump.tables.workflows },
      }),
    );
    expect(res.status).toBe(500);
    expect(convex.mutation).toHaveBeenCalledTimes(1);
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
