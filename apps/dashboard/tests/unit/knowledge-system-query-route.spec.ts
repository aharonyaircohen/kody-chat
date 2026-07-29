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
}));

const backend = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@kody-ade/base/auth", () => auth);
vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => backend,
}));

import { POST } from "../../app/api/kody/knowledge-system/query/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("POST /api/kody/knowledge-system/query", () => {
  it("returns a bounded neighborhood from the active repository graph", async () => {
    backend.query.mockResolvedValue({
      graphUrl: "https://convex.test/entity-graph",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          schemaVersion: 2,
          nodes: [
            {
              id: "business:subscription",
              label: "Subscription",
              type: "business_entity",
              domain: "business",
            },
            {
              id: "data:subscriptions",
              label: "subscriptions",
              type: "collection",
              domain: "data",
            },
          ],
          edges: [
            {
              source: "business:subscription",
              target: "data:subscriptions",
              relation: "stored-in",
            },
          ],
        }),
      ),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/kody/knowledge-system/query", {
        method: "POST",
        body: JSON.stringify({
          entityId: "business:subscription",
          depth: 1,
          limit: 20,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(backend.query).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "acme/widgets",
    });
    await expect(response.json()).resolves.toMatchObject({
      context: {
        subject: {
          id: "business:subscription",
          label: "Subscription",
        },
        relationships: [
          {
            source: "Subscription",
            relation: "stored-in",
            target: "subscriptions",
          },
        ],
      },
      graph: {
        nodes: [
          { id: "business:subscription" },
          { id: "data:subscriptions" },
        ],
        edges: [{ relation: "stored-in" }],
      },
    });
  });

  it("supports domain and text queries", async () => {
    backend.query.mockResolvedValue({
      graphUrl: "https://convex.test/domain-graph",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          nodes: [
            {
              id: "business:subscription",
              label: "Subscription",
              type: "business_entity",
              domain: "business",
            },
            {
              id: "technology:billing",
              label: "Billing service",
              type: "service",
              domain: "technical",
            },
          ],
          edges: [],
        }),
      ),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/kody/knowledge-system/query", {
        method: "POST",
        body: JSON.stringify({ domain: "technology", search: "billing" }),
      }),
    );

    const payload = await response.json();
    expect(payload.graph.nodes).toEqual([
      expect.objectContaining({ id: "technology:billing" }),
    ]);
    expect(payload.context.subject).toMatchObject({
      id: "technology:billing",
      label: "Billing service",
    });
  });

  it("returns relationship context around text matches", async () => {
    backend.query.mockResolvedValue({
      graphUrl: "https://convex.test/relationship-graph",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          nodes: [
            {
              id: "technology:billing",
              label: "Billing service",
              type: "service",
              domain: "technology",
            },
            {
              id: "business:subscriptions",
              label: "Subscriptions",
              type: "business_entity",
              domain: "business",
            },
          ],
          edges: [
            {
              source: "business:subscriptions",
              target: "technology:billing",
              relation: "implemented-by",
            },
          ],
        }),
      ),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/kody/knowledge-system/query", {
        method: "POST",
        body: JSON.stringify({ domain: "technology", search: "billing" }),
      }),
    );
    const payload = await response.json();

    expect(payload.graph.nodes.map((node: { id: string }) => node.id)).toEqual([
      "technology:billing",
      "business:subscriptions",
    ]);
    expect(payload.graph.edges).toEqual([
      expect.objectContaining({ relation: "implemented-by" }),
    ]);
    expect(payload.context.relationships).toEqual([
      expect.objectContaining({
        source: "Subscriptions",
        relation: "implemented-by",
        target: "Billing service",
      }),
    ]);
  });

  it("rejects malformed and unauthorized queries", async () => {
    const malformed = await POST(
      new NextRequest("http://localhost/api/kody/knowledge-system/query", {
        method: "POST",
        body: JSON.stringify({ depth: 99 }),
      }),
    );
    auth.verifyRepoReadAccess.mockResolvedValueOnce(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );
    const unauthorized = await POST(
      new NextRequest("http://localhost/api/kody/knowledge-system/query", {
        method: "POST",
        body: JSON.stringify({ search: "customer" }),
      }),
    );

    expect(malformed.status).toBe(400);
    expect(unauthorized.status).toBe(401);
  });
});
