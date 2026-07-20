import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  resolveUnifiedActor: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("@dashboard/lib/auth/unified-actor", () => ({
  resolveUnifiedActor: mocks.resolveUnifiedActor,
}));
vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => ({
    query: mocks.query,
    mutation: mocks.mutation,
  }),
}));

beforeEach(() => {
  vi.resetModules();
  mocks.resolveUnifiedActor.mockReset();
  mocks.query.mockReset();
  mocks.mutation.mockReset();
});

describe("navigation favorites API", () => {
  it("rejects unauthenticated reads and writes", async () => {
    mocks.resolveUnifiedActor.mockResolvedValue(null);
    const { GET, PUT } = await import(
      "../../app/api/kody/navigation-favorites/route"
    );

    const getResponse = await GET(
      new NextRequest("https://dash.test/api/kody/navigation-favorites"),
    );
    const putResponse = await PUT(
      new NextRequest("https://dash.test/api/kody/navigation-favorites", {
        method: "PUT",
        body: JSON.stringify({ favoriteHrefs: ["/tasks"] }),
      }),
    );

    expect(getResponse.status).toBe(401);
    expect(putResponse.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("reads preferences using only the authenticated actor identity", async () => {
    mocks.resolveUnifiedActor.mockResolvedValue({
      userId: "operator:alice",
    });
    mocks.query.mockResolvedValue({
      data: { favoriteHrefs: ["/tasks", "/reports"] },
    });
    const { GET } = await import(
      "../../app/api/kody/navigation-favorites/route"
    );

    const response = await GET(
      new NextRequest("https://dash.test/api/kody/navigation-favorites"),
    );

    await expect(response.json()).resolves.toEqual({
      favoriteHrefs: ["/tasks", "/reports"],
    });
    expect(mocks.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        namespace: "navigation",
        userKey: expect.stringMatching(/^operator-alice-[a-f0-9]{8}$/),
      }),
    );
    expect(mocks.query.mock.calls[0]?.[1]).not.toHaveProperty("tenantId");
  });

  it("rejects malformed and oversized writes", async () => {
    mocks.resolveUnifiedActor.mockResolvedValue({
      userId: "operator:alice",
    });
    const { PUT } = await import(
      "../../app/api/kody/navigation-favorites/route"
    );
    const favoriteHrefs = Array.from({ length: 9 }, (_, index) => `/p-${index}`);

    const response = await PUT(
      new NextRequest("https://dash.test/api/kody/navigation-favorites", {
        method: "PUT",
        body: JSON.stringify({ favoriteHrefs }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();

    const unknownResponse = await PUT(
      new NextRequest("https://dash.test/api/kody/navigation-favorites", {
        method: "PUT",
        body: JSON.stringify({ favoriteHrefs: ["/not-a-page"] }),
      }),
    );
    expect(unknownResponse.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("writes validated preferences under the authenticated actor", async () => {
    mocks.resolveUnifiedActor.mockResolvedValue({
      userId: "operator:alice",
    });
    const { PUT } = await import(
      "../../app/api/kody/navigation-favorites/route"
    );

    const response = await PUT(
      new NextRequest("https://dash.test/api/kody/navigation-favorites", {
        method: "PUT",
        body: JSON.stringify({ favoriteHrefs: ["/tasks", "/preview"] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        namespace: "navigation",
        userKey: expect.stringMatching(/^operator-alice-[a-f0-9]{8}$/),
        data: { favoriteHrefs: ["/tasks", "/preview"] },
      }),
    );
    expect(mocks.mutation.mock.calls[0]?.[1]).not.toHaveProperty("tenantId");
  });
});
