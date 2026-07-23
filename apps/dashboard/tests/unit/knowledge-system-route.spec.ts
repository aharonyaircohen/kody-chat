import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type AccessResult =
  | {
      auth: { token: string; owner: string; repo: string };
      actorLogin: string;
    }
  | NextResponse;

const auth = vi.hoisted(() => ({
  verifyRepoReadAccess: vi.fn(async (): Promise<AccessResult> => ({
    auth: { token: "ghp_viewer", owner: "acme", repo: "widgets" },
    actorLogin: "viewer",
  })),
  verifyRepoWriteAccess: vi.fn(async (): Promise<AccessResult> => ({
    auth: { token: "ghp_writer", owner: "acme", repo: "widgets" },
    actorLogin: "writer",
  })),
}));

const backend = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("@kody-ade/base/auth", () => auth);
vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => backend,
}));

import { GET, POST, PUT } from "../../app/api/kody/knowledge-system/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/kody/knowledge-system", () => {
  it("reads only the active repository bundle", async () => {
    backend.query.mockResolvedValue({
      tenantId: "acme/widgets",
      graphUrl: "https://convex.test/graph",
      generatedAt: "2026-07-22T10:00:00.000Z",
      nodeCount: 2,
      edgeCount: 1,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/kody/knowledge-system"),
    );

    expect(response.status).toBe(200);
    expect(backend.query).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "acme/widgets",
    });
    await expect(response.json()).resolves.toMatchObject({
      bundle: { tenantId: "acme/widgets", nodeCount: 2 },
    });
  });

  it("creates a scoped upload URL", async () => {
    backend.mutation.mockResolvedValue("https://convex.test/upload");

    const response = await POST(
      new NextRequest("http://localhost/api/kody/knowledge-system", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(backend.mutation).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "acme/widgets",
    });
    await expect(response.json()).resolves.toEqual({
      uploadUrl: "https://convex.test/upload",
    });
  });

  it("validates and publishes a Graphify bundle for the active repository", async () => {
    backend.mutation.mockResolvedValue("bundle-id");

    const response = await PUT(
      new NextRequest("http://localhost/api/kody/knowledge-system", {
        method: "PUT",
        body: JSON.stringify({
          graphStorageId: "kg012345678901234567890123456789",
          reportStorageId: "kg112345678901234567890123456789",
          htmlStorageId: "kg212345678901234567890123456789",
          generatedAt: "2026-07-22T10:00:00.000Z",
          sourceRevision: "abc123",
          nodeCount: 20,
          edgeCount: 30,
          schemaVersion: 1,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(backend.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "acme/widgets",
        graphStorageId: "kg012345678901234567890123456789",
        htmlStorageId: "kg212345678901234567890123456789",
        nodeCount: 20,
      }),
    );
  });

  it("requires verified read and write access", async () => {
    auth.verifyRepoReadAccess.mockResolvedValueOnce(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );
    const unauthorizedRead = await GET(
      new NextRequest("http://localhost/api/kody/knowledge-system"),
    );
    auth.verifyRepoWriteAccess.mockResolvedValueOnce(
      NextResponse.json(
        { error: "write_permission_required" },
        { status: 403 },
      ),
    );
    const unauthorizedWrite = await POST(
      new NextRequest("http://localhost/api/kody/knowledge-system", {
        method: "POST",
      }),
    );

    expect(unauthorizedRead.status).toBe(401);
    expect(unauthorizedWrite.status).toBe(403);
    expect(backend.query).not.toHaveBeenCalled();
    expect(backend.mutation).not.toHaveBeenCalled();
  });

  it("rejects malformed writes", async () => {
    const malformed = await PUT(
      new NextRequest("http://localhost/api/kody/knowledge-system", {
        method: "PUT",
        body: JSON.stringify({ nodeCount: -1 }),
      }),
    );

    expect(malformed.status).toBe(400);
  });
});
