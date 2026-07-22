import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireKodyAuth: vi.fn(async () => null),
  getRequestAuth: vi.fn(() => ({
    token: "ghp_viewer",
    owner: "acme",
    repo: "widgets",
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
  auth.getRequestAuth.mockReturnValue({
    token: "ghp_viewer",
    owner: "acme",
    repo: "widgets",
  });
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
        nodeCount: 20,
      }),
    );
  });

  it("rejects unauthenticated, unscoped, and malformed writes", async () => {
    auth.requireKodyAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );
    const unauthorized = await POST(
      new NextRequest("http://localhost/api/kody/knowledge-system", {
        method: "POST",
      }),
    );

    auth.getRequestAuth.mockReturnValueOnce(null as never);
    const unscoped = await GET(
      new NextRequest("http://localhost/api/kody/knowledge-system"),
    );

    const malformed = await PUT(
      new NextRequest("http://localhost/api/kody/knowledge-system", {
        method: "PUT",
        body: JSON.stringify({ nodeCount: -1 }),
      }),
    );

    expect(unauthorized.status).toBe(401);
    expect(unscoped.status).toBe(400);
    expect(malformed.status).toBe(400);
  });
});
