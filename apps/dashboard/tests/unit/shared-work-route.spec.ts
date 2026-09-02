import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { query, requireKodyAuth, getRequestAuth } = vi.hoisted(() => ({
  query: vi.fn(),
  requireKodyAuth: vi.fn(),
  getRequestAuth: vi.fn(),
}));

vi.mock("@kody-ade/base/auth", () => ({ requireKodyAuth, getRequestAuth }));
vi.mock("@dashboard/lib/backend/convex-backend", () => ({
  backendApi: {
    sharedWork: { list: "sharedWork:list", get: "sharedWork:get" },
    mcpApprovalRequests: { listForWork: "mcpApprovalRequests:listForWork" },
  },
  getConvexClient: () => ({ query }),
  tenantIdFor: (owner: string, repo: string) => `${owner}/${repo}`,
}));

import { GET as list } from "../../app/api/kody/shared-work/route";
import { GET as detail } from "../../app/api/kody/shared-work/[recordId]/route";

describe("shared work dashboard routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireKodyAuth.mockResolvedValue(null);
    getRequestAuth.mockReturnValue({ owner: "acme", repo: "widgets" });
  });

  it("lists only the authenticated repository", async () => {
    query.mockResolvedValue([{ recordId: "phase-3" }]);
    const response = await list(
      new NextRequest("https://dash.test/api/kody/shared-work"),
    );
    await expect(response.json()).resolves.toEqual({
      records: [{ recordId: "phase-3" }],
    });
    expect(query).toHaveBeenCalledWith("sharedWork:list", {
      tenantId: "acme/widgets",
      limit: 100,
    });
  });

  it("reads a selected record in the same repository and returns 404 safely", async () => {
    query
      .mockResolvedValueOnce({
        record: { recordId: "phase-3" },
        events: [],
      })
      .mockResolvedValueOnce([{ requestId: "request-1" }]);
    const response = await detail(
      new NextRequest("https://dash.test/api/kody/shared-work/phase-3"),
      { params: Promise.resolve({ recordId: "phase-3" }) },
    );
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith("sharedWork:get", {
      tenantId: "acme/widgets",
      recordId: "phase-3",
    });
    await expect(response.json()).resolves.toMatchObject({
      approvalRequests: [{ requestId: "request-1" }],
    });

    query.mockResolvedValueOnce(null).mockResolvedValueOnce([]);
    const missing = await detail(
      new NextRequest("https://dash.test/api/kody/shared-work/missing"),
      { params: Promise.resolve({ recordId: "missing" }) },
    );
    expect(missing.status).toBe(404);
  });

  it("rejects requests without repository context", async () => {
    getRequestAuth.mockReturnValue(null);
    expect(
      (await list(new NextRequest("https://dash.test/api/kody/shared-work")))
        .status,
    ).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
