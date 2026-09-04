import { beforeEach, describe, expect, it, vi } from "vitest";

const access = {
  auth: { owner: "test-owner", repo: "test-repo" },
};
vi.mock("@kody-ade/base/auth", () => ({
  verifyRepoReadAccess: vi.fn(async () => access),
}));
vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => ({
    query: vi.fn(async () => ({
      appId: "app-1",
      exposure: "private",
      provider: { publicUrl: "https://open-notebook.fly.dev" },
    })),
  }),
}));
vi.mock("@kody-ade/backend/api", () => ({
  api: { apps: { get: "apps:get" } },
}));

describe("Apps open route", () => {
  beforeEach(() => {
    process.env.KODY_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("returns a short-lived authenticated launch URL for the Dashboard UI", async () => {
    const { POST } = await import("../../app/api/kody/apps/[slug]/open/route");
    const response = await POST(new Request("http://local/open") as never, {
      params: Promise.resolve({ slug: "open-notebook" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/open-notebook\.fly\.dev\/?\?ka=/);
    expect(body.url).not.toContain("kody-app-");
  });
});
